/*
 * content.js — runs inside each tab (injected by background.js after
 * lib/readability.js and extractors.js).
 *
 * It only reads the page that is already loaded; it never clicks, scrolls
 * or sends requests. LinkedIn and Workday fill in the description a moment
 * after the page appears, so it waits a few seconds for that before falling
 * back to the generic extractors.
 */
(() => {
  if (globalThis.__jobSaverRun) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitForLoad(limitMs) {
    if (document.readyState === "complete") return;
    await Promise.race([
      new Promise((r) => window.addEventListener("load", r, { once: true })),
      sleep(limitMs),
    ]);
  }

  globalThis.__jobSaverRun = async function ({ timeoutMs = 8000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    await waitForLoad(timeoutMs);

    let result = globalThis.JobSaverExtractors.extract(document, location.href);
    // Known site whose description hasn't rendered yet: poll until it does.
    while (result.site && result.isJob && !result.siteReady && Date.now() < deadline) {
      await sleep(400);
      result = globalThis.JobSaverExtractors.extract(document, location.href);
    }
    return result;
  };
})();
