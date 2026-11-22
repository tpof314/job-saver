/*
 * extractors.js — turns a job page into a clean record.
 *
 * Order of attempts for the description:
 *   1. Site rule (LinkedIn, Workday)      — most precise
 *   2. JSON-LD "JobPosting" data          — many career sites embed this
 *   3. Readability (lib/readability.js)   — generic "reader view" cleanup
 *   4. Whole page text                    — last resort
 *
 * To support a new site, add an entry to SITES below.
 * Site selectors break when sites change their layout; each field takes a
 * list of selectors and the first one with text wins, so add new ones at the top.
 */
(() => {
  if (globalThis.JobSaverExtractors) return; // already injected into this tab

  const MAX_DESCRIPTION_CHARS = 50000;

  // ---------------------------------------------------------------- site rules
  const SITES = [
    {
      id: "linkedin",
      match: (u) => /(^|\.)linkedin\.com$/i.test(u.hostname) && u.pathname.includes("/jobs"),
      // /jobs/view/123, /jobs/view/some-title-123, or a search page with ?currentJobId=123
      canonicalUrl: (u) => {
        const m = u.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/);
        const id = m ? m[1] : u.searchParams.get("currentJobId");
        return id ? `https://www.linkedin.com/jobs/view/${id}/` : null;
      },
      jobId: (u) => {
        const m = u.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/);
        return m ? m[1] : u.searchParams.get("currentJobId");
      },
      isJobPage: (u, site) => !!site.canonicalUrl(u),
      title: [
        ".job-details-jobs-unified-top-card__job-title h1",
        ".job-details-jobs-unified-top-card__job-title",
        ".jobs-unified-top-card__job-title",
        "h1.top-card-layout__title",
        ".jobs-details h1",
      ],
      company: [
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name",
        "a.topcard__org-name-link",
        ".topcard__flavor a",
      ],
      location: [
        ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
        ".job-details-jobs-unified-top-card__bullet",
        ".jobs-unified-top-card__bullet",
        ".topcard__flavor--bullet",
      ],
      description: [
        "#job-details",
        ".jobs-description__content .jobs-box__html-content",
        ".jobs-description-content__text",
        ".jobs-description__content",
        ".show-more-less-html__markup",
        ".description__text",
      ],
      // LinkedIn sometimes ships obfuscated class names; fall back to the heading.
      descriptionHeading: /^about the job$/i,
      // "(3) Senior Engineer | Acme | LinkedIn"
      parseDocTitle: (t) => {
        const parts = t.replace(/^\(\d+\)\s*/, "").split(" | ").map((s) => s.trim());
        if (parts.length >= 3 && /linkedin/i.test(parts[parts.length - 1])) {
          return { title: parts[0], company: parts[1] };
        }
        return {};
      },
    },
    {
      id: "workday",
      match: (u) => /(myworkdayjobs|myworkdaysite|myworkday)\.com$/i.test(u.hostname),
      canonicalUrl: (u) => `${u.origin}${u.pathname}`,
      jobId: () => null, // read from the page instead (requisitionId)
      isJobPage: (u) => /\/job\//i.test(u.pathname),
      title: ['[data-automation-id="jobPostingHeader"]'],
      company: [],
      location: ['[data-automation-id="locations"] dd', '[data-automation-id="locations"]'],
      description: ['[data-automation-id="jobPostingDescription"]'],
      extra: {
        job_id: ['[data-automation-id="requisitionId"] dd', '[data-automation-id="requisitionId"]'],
        posted: ['[data-automation-id="postedOn"] dd', '[data-automation-id="postedOn"]'],
        employment_type: ['[data-automation-id="time"] dd', '[data-automation-id="time"]'],
      },
      // acme.wd5.myworkdayjobs.com -> "acme"
      companyFromHost: (u) => {
        const first = u.hostname.split(".")[0];
        return /^wd\d+$/i.test(first) ? null : first;
      },
      parseDocTitle: () => ({}),
    },
  ];

  const JOB_URL_HINT = /(job|career|position|vacanc|opening|requisition|posting|recruit|hiring)/i;

  // ---------------------------------------------------------------- html -> text
  const BLOCK = new Set([
    "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DD", "DIV", "DL", "DT", "FIELDSET",
    "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6",
    "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE",
    "TR", "UL",
  ]);
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "BUTTON", "TEMPLATE", "IFRAME", "INPUT", "SELECT", "TEXTAREA"]);
  const SKIP_CLASS = /(^|\s)(visually-hidden|sr-only|screen-reader-text|a11y-text)(\s|$)/;

  /** Readable plain text with paragraphs, line breaks and "- " bullets kept. */
  function htmlToText(root) {
    if (!root) return "";
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 3) {
        out.push(n.nodeValue.replace(/\s+/g, " "));
        return;
      }
      if (n.nodeType !== 1 && n.nodeType !== 9 && n.nodeType !== 11) return;
      const tag = n.tagName ? n.tagName.toUpperCase() : "";
      if (SKIP.has(tag)) return;
      if (n.nodeType === 1) {
        if (n.hidden) return;
        const cls = typeof n.className === "string" ? n.className : "";
        if (cls && SKIP_CLASS.test(cls)) return;
      }
      if (tag === "BR") {
        out.push("\n");
        return;
      }
      const block = BLOCK.has(tag);
      if (block) out.push("\n");
      if (tag === "LI") out.push("- ");
      if (tag === "TD" || tag === "TH") out.push(" ");
      for (const c of n.childNodes) walk(c);
      if (block) out.push("\n");
    };
    walk(root);
    return out
      .join("")
      .replace(/[ \t ]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^- *\n/gm, "") // empty bullets
      .replace(/(^- [^\n]*)\n\n(?=- )/gm, "$1\n") // keep list items together
      .trim()
      .slice(0, MAX_DESCRIPTION_CHARS);
  }

  function parseHtml(html) {
    let s = String(html || "");
    // Some sites double-escape the HTML inside JSON-LD (&lt;p&gt;...)
    if (!/<[a-z]/i.test(s) && /&lt;[a-z]/i.test(s)) {
      s = new DOMParser().parseFromString(s, "text/html").documentElement.textContent;
    }
    return new DOMParser().parseFromString(s, "text/html").body;
  }

  // ---------------------------------------------------------------- helpers
  const oneLine = (s) => (s || "").replace(/\s+/g, " ").trim();

  function firstEl(doc, selectors, minLen = 1) {
    for (const sel of selectors || []) {
      let els;
      try {
        els = doc.querySelectorAll(sel);
      } catch {
        continue; // invalid selector, ignore
      }
      for (const el of els) {
        if (oneLine(el.textContent).length >= minLen) return el;
      }
    }
    return null;
  }

  const firstText = (doc, selectors) => oneLine(htmlToText(firstEl(doc, selectors)));

  function meta(doc, key) {
    const el = doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
    return oneLine(el && el.getAttribute("content"));
  }

  /** Finds a heading such as "About the job" and returns the block that holds it. */
  function byHeading(doc, regex) {
    for (const h of doc.querySelectorAll("h1, h2, h3, h4, strong, span")) {
      if (!regex.test(oneLine(h.textContent))) continue;
      let box = h.parentElement;
      // climb until the container holds a real amount of text
      for (let i = 0; box && i < 4; i++, box = box.parentElement) {
        if (oneLine(box.textContent).length > 200) return box;
      }
    }
    return null;
  }

  /** Returns the first schema.org JobPosting found in JSON-LD, or null. */
  function findJsonLdJob(doc) {
    const isJob = (o) => {
      const t = o && o["@type"];
      return t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"));
    };
    const search = (o, depth = 0) => {
      if (!o || typeof o !== "object" || depth > 5) return null;
      if (isJob(o)) return o;
      const kids = Array.isArray(o) ? o : [o["@graph"], o.mainEntity, o.itemListElement].filter(Boolean);
      for (const k of kids.flat()) {
        const r = search(k, depth + 1);
        if (r) return r;
      }
      return null;
    };
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const r = search(JSON.parse(s.textContent));
        if (r) return r;
      } catch {
        /* malformed JSON-LD, skip */
      }
    }
    return null;
  }

  function ldLocation(ld) {
    if (!ld) return "";
    const locs = [].concat(ld.jobLocation || []);
    const parts = locs
      .map((l) => {
        const a = (l && l.address) || {};
        if (typeof a === "string") return a;
        return [a.addressLocality, a.addressRegion, a.addressCountry && (a.addressCountry.name || a.addressCountry)]
          .filter(Boolean)
          .join(", ");
      })
      .filter(Boolean);
    let s = parts.join(" | ");
    if (/TELECOMMUTE/i.test(ld.jobLocationType || "")) s = s ? `${s} (Remote)` : "Remote";
    return oneLine(s);
  }

  function ldCompany(ld) {
    const org = ld && ld.hiringOrganization;
    return oneLine(typeof org === "string" ? org : org && org.name);
  }

  function readabilityText(doc) {
    if (typeof Readability !== "function") return "";
    try {
      const article = new Readability(doc.cloneNode(true), { charThreshold: 200 }).parse();
      return article && article.content ? htmlToText(parseHtml(article.content)) : "";
    } catch {
      return "";
    }
  }

  // ---------------------------------------------------------------- main
  /**
   * extract(document, url) -> {
   *   isJob:     does this look like a job page?
   *   siteReady: for LinkedIn/Workday, has the description appeared yet?
   *   site:      "linkedin" | "workday" | null
   *   record:    the job record that goes into jobs.json
   * }
   */
  function extract(doc, href) {
    const u = new URL(href);
    const site = SITES.find((s) => s.match(u)) || null;
    const ld = findJsonLdJob(doc);
    const docTitle = oneLine(doc.title);
    const fromTitle = site ? site.parseDocTitle(docTitle) : {};

    // description
    let description = "";
    let method = null;
    let descEl = site ? firstEl(doc, site.description, 80) : null;
    if (!descEl && site && site.descriptionHeading) descEl = byHeading(doc, site.descriptionHeading);
    if (descEl) {
      description = htmlToText(descEl).replace(/^about the job\s*\n/i, "");
      method = site.id;
    }
    const siteReady = !!descEl;

    if (!description && ld && ld.description) {
      description = htmlToText(parseHtml(ld.description));
      method = "json-ld";
    }
    if (!description) {
      description = readabilityText(doc);
      if (description) method = "readability";
    }
    if (!description) {
      description = htmlToText(doc.body);
      method = "full-page";
    }

    // other fields: site rule -> JSON-LD -> page metadata
    const title =
      (site && firstText(doc, site.title)) ||
      oneLine(ld && ld.title) ||
      fromTitle.title ||
      meta(doc, "og:title") ||
      oneLine(doc.querySelector("h1") && doc.querySelector("h1").textContent) ||
      docTitle;

    const company =
      (site && firstText(doc, site.company)) ||
      ldCompany(ld) ||
      fromTitle.company ||
      (site && site.companyFromHost && site.companyFromHost(u)) ||
      meta(doc, "og:site_name") ||
      "";

    const location = (site && firstText(doc, site.location)) || ldLocation(ld) || "";

    const extra = {};
    if (site && site.extra) {
      for (const [k, sels] of Object.entries(site.extra)) {
        extra[k] = firstText(doc, sels).replace(/^(job requisition id|posted on|time type)\s*/i, "") || null;
      }
    }

    const isJob = site ? site.isJobPage(u, site) : !!ld || JOB_URL_HINT.test(u.pathname + u.hostname);

    const record = {
      title,
      company,
      location,
      url: (site && site.canonicalUrl(u)) || href,
      source: site ? site.id : ld ? "json-ld" : "generic",
      method,
      job_id: extra.job_id || (site && site.jobId(u)) || oneLine(ld && ld.identifier && (ld.identifier.value || ld.identifier)) || null,
      posted: extra.posted || oneLine(ld && ld.datePosted) || null,
      employment_type: extra.employment_type || oneLine([].concat((ld && ld.employmentType) || []).join(", ")) || null,
      captured_at: new Date().toISOString(),
      description,
    };

    return { isJob, siteReady, site: site ? site.id : null, record };
  }

  globalThis.JobSaverExtractors = { extract, htmlToText, findJsonLdJob, SITES };
})();
