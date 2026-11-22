/*
 * background.js — the "brain".
 *
 * When the popup asks, it goes through every tab in the window, injects the
 * extractor into each one, collects the job records, and downloads them as
 * one file: Downloads/job-saver/jobs-YYYY-MM-DD_HHMMSS.json
 *
 * It never opens, reloads or navigates tabs. Tabs Chrome has put to sleep are
 * skipped (waking them would send a new request to the site).
 */

const OUTPUT_FOLDER = "job-saver"; // subfolder inside your Downloads folder
const PER_TAB_TIMEOUT_MS = 8000; // how long to wait for a description to render
const CONCURRENCY = 4; // tabs processed at the same time

let running = false;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "save-all") return;
  if (running) {
    sendResponse({ ok: false, error: "A save is already running." });
    return;
  }
  running = true;
  saveAll(msg)
    .then((r) => sendResponse({ ok: true, ...r }))
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }))
    .finally(() => (running = false));
  return true; // keep the message channel open for the async reply
});

async function saveAll({ windowId, jobsOnly = true }) {
  const tabs = await chrome.tabs.query({ windowId });
  const results = new Array(tabs.length);
  let done = 0;

  // simple worker pool, results kept in tab order
  let next = 0;
  const worker = async () => {
    while (next < tabs.length) {
      const i = next++;
      results[i] = await processTab(tabs[i]);
      done++;
      notify({ type: "progress", done, total: tabs.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tabs.length) }, worker));

  const jobs = [];
  const skipped = [];
  const seen = new Set();
  for (const r of results) {
    if (r.error) {
      skipped.push({ title: r.title, url: r.url, reason: r.error });
    } else if (jobsOnly && !r.isJob) {
      skipped.push({ title: r.title, url: r.url, reason: "Doesn't look like a job page" });
    } else if (seen.has(r.record.url)) {
      skipped.push({ title: r.title, url: r.url, reason: "Duplicate of another tab" });
    } else {
      seen.add(r.record.url);
      jobs.push(r.record);
    }
  }

  let filename = null;
  if (jobs.length) {
    const savedAt = new Date();
    const payload = { saved_at: savedAt.toISOString(), count: jobs.length, jobs, skipped };
    filename = `${OUTPUT_FOLDER}/jobs-${stamp(savedAt)}.json`;
    await chrome.downloads.download({
      url: "data:application/json;base64," + toBase64(JSON.stringify(payload, null, 2)),
      filename,
      conflictAction: "uniquify",
      saveAs: false,
    });
  }

  const summary = {
    finished_at: new Date().toISOString(),
    saved: jobs.length,
    filename,
    skipped,
    methods: countBy(jobs, (j) => j.method),
  };
  await chrome.storage.local.set({ lastRun: summary });
  return summary;
}

async function processTab(tab) {
  const url = tab.url || tab.pendingUrl || "";
  const base = { title: tab.title || url, url };
  if (!/^https?:\/\//i.test(url)) return { ...base, error: "Not a web page" };
  if (tab.discarded || tab.status === "unloaded") {
    return { ...base, error: "Tab is asleep — click on it once, then save again" };
  }
  try {
    await waitForTabComplete(tab.id, 15000);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/readability.js", "extractors.js", "content.js"],
    });
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (opts) => globalThis.__jobSaverRun(opts),
      args: [{ timeoutMs: PER_TAB_TIMEOUT_MS }],
    });
    const res = injection && injection.result;
    if (!res || !res.record) return { ...base, error: "The page returned nothing" };
    return { ...base, ...res };
  } catch (e) {
    return { ...base, error: friendlyError(e) };
  }
}

function waitForTabComplete(tabId, limitMs) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (t) => {
      if (chrome.runtime.lastError || !t || t.status === "complete") return resolve();
      const timer = setTimeout(finish, limitMs);
      function listener(id, info) {
        if (id === tabId && info.status === "complete") finish();
      }
      function finish() {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

function friendlyError(e) {
  const m = String((e && e.message) || e);
  if (/cannot be scripted|cannot access|chrome-extension|webstore/i.test(m)) return "Chrome doesn't allow reading this page";
  if (/No tab with id|tab was closed/i.test(m)) return "Tab was closed";
  if (/Frame with ID 0 was removed|error page/i.test(m)) return "Page didn't load";
  return m;
}

function notify(msg) {
  // the popup may be closed; that's fine
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function countBy(arr, fn) {
  return arr.reduce((acc, x) => ((acc[fn(x)] = (acc[fn(x)] || 0) + 1), acc), {});
}
