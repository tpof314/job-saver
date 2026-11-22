# Job Saver

A Chrome extension that saves the job descriptions from your open tabs into one JSON file, with a single click.

It only reads pages you have already opened yourself. It doesn't open, reload, click on or navigate any page, so it sends no extra traffic to LinkedIn, Workday or any other site.

## Requirements

- Google Chrome 110 or newer (Microsoft Edge also works)
- Optional, for the `make` commands: `make`, `python3`, `zip`, and `node` for syntax checks

## Install

Chrome can't install an extension from the command line, so this is a one-time manual step:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (switch in the top-right corner).
3. Click **Load unpacked** and choose this `job-saver-extension` folder.
4. Click the puzzle-piece icon in the toolbar and pin **Job Saver**.

`make install` prints these steps with the exact folder path.

When you change a file, click the reload arrow on the Job Saver card in `chrome://extensions`.

## Use

1. Open the job pages you want, one tab each, at a normal pace.
2. Click on any tab Chrome has put to sleep, so it is loaded (see "Skipped tabs" below).
3. Click the **Job Saver** button (or press `Alt+Shift+J`) and then **Save all tabs in this window**.
4. The file appears in your Downloads folder:

```
Downloads/job-saver/jobs-2026-11-22_091530.json
```

Each save creates a new dated file, so nothing is overwritten. Point your ranker at `Downloads/job-saver/`.

**Only save pages that look like jobs** (on by default) skips tabs such as your inbox or search results. Turn it off to save every tab.

You can close the popup while it works; the result shows the next time you open it.

## Output format

```json
{
  "saved_at": "2026-11-21T22:15:30.000Z",
  "count": 2,
  "jobs": [
    {
      "title": "Senior Software Engineer",
      "company": "Acme",
      "location": "Sydney, New South Wales, Australia",
      "url": "https://www.linkedin.com/jobs/view/4012345678/",
      "source": "linkedin",
      "method": "linkedin",
      "job_id": "4012345678",
      "posted": null,
      "employment_type": null,
      "captured_at": "2026-11-21T22:15:29.412Z",
      "description": "About us\nWe build...\n\nRequirements\n- 5+ years of Python\n- ..."
    }
  ],
  "skipped": [
    { "title": "Inbox", "url": "https://mail.google.com/...", "reason": "Doesn't look like a job page" }
  ]
}
```

- `description` is plain text with paragraphs and `- ` bullets kept.
- `url` is cleaned up where possible. A LinkedIn search page with a job selected becomes that job's `/jobs/view/<id>/` link, so the same job opened twice is only saved once.
- `method` says how the description was found, from most to least precise:

| method        | meaning                                                       |
|---------------|---------------------------------------------------------------|
| `linkedin`    | LinkedIn site rule                                            |
| `workday`     | Workday site rule                                             |
| `json-ld`     | Structured job data embedded in the page (many career sites)  |
| `readability` | Generic "reader view" cleanup                                 |
| `full-page`   | Last resort: all the text on the page                         |

If you see `readability` or `full-page` on a LinkedIn or Workday job, the site's layout has probably changed; see "Fixing a site rule".

## Skipped tabs

The popup lists every tab it skipped and why. The common reasons are:

- **Tab is asleep.** Chrome unloads tabs you haven't looked at for a while. Waking one would request the page again, so the extension leaves that to you: click the tab once, then save again.
- **Doesn't look like a job page.** Turn off the checkbox if you want it anyway.
- **Chrome doesn't allow reading this page.** `chrome://` pages, the Chrome Web Store and PDFs can't be read by extensions.
- **Duplicate of another tab.** The same job was open twice.

## Supported sites

- **LinkedIn:** job pages (`/jobs/view/...`) and the right-hand panel on job search pages.
- **Workday:** any `*.myworkdayjobs.com` or `*.myworkdaysite.com` job page, including job ID, posted date and time type.
- **Everything else:** structured job data where the page has it (Greenhouse, Lever, SmartRecruiters and many company sites do), otherwise the reader-view fallback.

## Fixing a site rule

Site rules are in `extractors.js`, in the `SITES` list. Each field (`title`, `company`, `location`, `description`) is a list of CSS selectors; the first one that finds text wins.

When a site changes its layout:

1. Open a job page, right-click the description, and choose **Inspect**.
2. Find a stable attribute or class on the element that wraps the whole description.
3. Add that selector at the top of the `description` list.
4. Reload the extension in `chrome://extensions` and save again.

To add a new site, copy the Workday entry and change `id`, `match` and the selectors.

## Settings

At the top of `background.js`:

| setting              | default     | what it does                                           |
|----------------------|-------------|--------------------------------------------------------|
| `OUTPUT_FOLDER`      | `job-saver` | Subfolder inside Downloads                             |
| `PER_TAB_TIMEOUT_MS` | `8000`      | How long to wait for a description to appear on a tab  |
| `CONCURRENCY`        | `4`         | How many tabs are read at the same time                |

Chrome only lets extensions save inside your Downloads folder, so to save somewhere else, change Chrome's download location or have your ranker read from there.

## Make commands

```
make help      Show the list of commands
make check     Check manifest.json and the JavaScript for syntax errors
make package   Build dist/job-saver-extension-<version>.zip
make install   Print the steps to load the extension into Chrome
make clean     Remove the dist folder
```

The zip is for sharing or keeping a copy. For your own use, "Load unpacked" on the folder is all you need.

## Files

```
job-saver-extension/
├── README.md         this guide
├── Makefile          check, package, install steps, clean
├── manifest.json     extension name, permissions and toolbar button
├── background.js     goes through the tabs and saves the file
├── content.js        runs inside each tab and waits for the description
├── extractors.js     LinkedIn / Workday rules and the fallbacks
├── lib/
│   ├── readability.js            Mozilla Readability 0.6.0 (generic fallback)
│   └── READABILITY-LICENSE.md    its Apache 2.0 licence
├── popup.html        the popup window
└── popup.js          the popup's button and status
```

## Permissions

- **tabs:** read the titles and addresses of your open tabs
- **scripting** and **all sites:** run the extractor inside a tab, only when you click Save
- **downloads:** save the JSON file
- **storage:** remember the checkbox and the last result

Nothing is sent anywhere. The only output is the file in your Downloads folder.

## A note on LinkedIn

LinkedIn's terms prohibit scraping and automated tools. This extension reads only pages you opened by hand and sends no requests of its own, which keeps it close to normal browsing, but use it at a human pace and at your own discretion.
