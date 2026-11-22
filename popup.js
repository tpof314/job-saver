/*
 * popup.js — the small window behind the toolbar button.
 * It only asks background.js to do the work, so closing the popup
 * mid-save is fine; the result shows next time you open it.
 */
const $ = (id) => document.getElementById(id);

init();

async function init() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  $("tabcount").textContent = `${tabs.length} tab${tabs.length === 1 ? "" : "s"} open in this window.`;

  const { jobsOnly = true, lastRun } = await chrome.storage.local.get(["jobsOnly", "lastRun"]);
  $("jobsOnly").checked = jobsOnly;
  if (lastRun) showResult(lastRun, true);

  $("jobsOnly").addEventListener("change", (e) => chrome.storage.local.set({ jobsOnly: e.target.checked }));
  $("save").addEventListener("click", save);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "progress") setStatus(`Reading tabs… ${msg.done} of ${msg.total}`);
});

async function save() {
  $("save").disabled = true;
  $("file").textContent = "";
  $("skippedBox").hidden = true;
  setStatus("Starting…");
  try {
    const win = await chrome.windows.getCurrent();
    const res = await chrome.runtime.sendMessage({
      type: "save-all",
      windowId: win.id,
      jobsOnly: $("jobsOnly").checked,
    });
    if (!res || !res.ok) setStatus((res && res.error) || "Something went wrong.", "warn");
    else showResult(res, false);
  } catch (e) {
    setStatus(String(e.message || e), "warn");
  } finally {
    $("save").disabled = false;
  }
}

function showResult(r, isPrevious) {
  const when = isPrevious ? ` (last run, ${new Date(r.finished_at).toLocaleString()})` : "";
  if (r.saved) {
    setStatus(`Saved ${r.saved} job${r.saved === 1 ? "" : "s"}${when}.`, "ok");
    $("file").textContent = `Downloads/${r.filename}`;
  } else {
    setStatus(`No job pages found${when}.`, "warn");
  }

  const list = $("skippedList");
  list.replaceChildren();
  for (const s of r.skipped || []) {
    const li = document.createElement("li");
    li.textContent = (s.title || s.url || "(untitled)").slice(0, 70);
    const why = document.createElement("span");
    why.textContent = ` — ${s.reason}`;
    li.append(why);
    list.append(li);
  }
  $("skippedTitle").textContent = `Skipped ${r.skipped ? r.skipped.length : 0} tab(s)`;
  $("skippedBox").hidden = !(r.skipped && r.skipped.length);
}

function setStatus(text, cls = "") {
  $("status").textContent = text;
  $("status").className = cls;
}
