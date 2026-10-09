# SCS ASM 2026 — Interactive Scientific Programme

An accessible, responsive scientific programme for the **37th Singapore Cardiac Society Annual Scientific Meeting**, **17–19 April 2026**, Grand Copthorne Waterfront Hotel, Singapore. All schedule times are **Singapore Standard Time (Asia/Singapore, UTC+8)**.

The application is HTML5, CSS3 and vanilla JavaScript. It requires **no framework, package manager, API token, proxy, backend or compilation**. It can be hosted under any GitHub Pages repository subdirectory. The interface references but does not reproduce the branding, logos, copyrighted materials or code of the [official conference site](https://scsasm.org/) and the [ICSES programme](https://program.icses2026.org/).

## File structure

```
scientific-programme/
├── index.html       Page structure, semantic navigation and accessible dialog
├── styles.css       Responsive styling and print rules
├── app.js           Search, navigation, timetable, fetch and browser history
├── data.js          CSV configuration, parsing, normalization and integrity checks
└── README.md        Configuration, deployment, validation and troubleshooting
```

`index.html` references only relative `./styles.css`, `./data.js` and `./app.js`, so it is independent of the repository's root path.

## Features

- Search sessions, codes, presentation titles, speakers (first/last/full names), organizations and session descriptions; case-/accent-insensitive partial matching with match highlighting where practical.
- Click a matching speaker or a speaker in the session detail to see **all their contributions** and open the related sessions.
- Browse Friday 17, Saturday 18 and Sunday 19 April; choose **All days**. A search with no specifically selected day covers all days, while the first day is the initial agenda view.
- Combine room, track, day and presentation-type filters. Blank tracks appear explicitly as **Not assigned**. Clear individual filters or use **Clear all filters**.
- Chronological agenda and same-time, room-based timetable. Genuine durations determine block height; same-room overlapping sessions are displayed side by side, with the conflict preserved and a warning.
- Mobile timetable displays one selectable room at a time, without page-level horizontal scrolling. Desktop room columns may be horizontally scrolled inside the timetable only.
- Session dialogs show dates, times, room, track, source description, all presentations, roles, organization and speaker associations. Untimed contributions remain visible.
- Browser history and refresh-safe URLs support `day`, `q`, `track`, `room`, `type`, `view`, `session` and `speaker` query parameters. Session identities are calculated from name, date, start/end and room, not row number.
- Native `<dialog>` provides focus trapping and Escape/backdrop semantics, with focus restored on close where possible. Visible keyboard focus states, semantic controls, skip link, high contrast, reduced-motion support and print styles are included.
- **Refresh programme** fetches the published CSV again; abort/sequence protection prevents older responses from overriding newer fetches. Last successful data stays visible if a subsequent refresh fails.
- Optional **Copy session link** and **Print details** buttons require no storage or account access. No attendee data is collected or stored.

## Published Google Sheets — primary runtime data

Set `CONFIG.csvUrl` in `data.js` (already configured) to the public **Publish to web → CSV** link:

```
https://docs.google.com/spreadsheets/d/e/2PACX-1vTtagaxqoB1rIc80p0q2Rp2BEregrRweuKCwYtPcouBE1FvPPvPyj0QoR-64yMAGuNn_392IreZnzbQ/pub?gid=0&single=true&output=csv
```

The browser fetches it **on each page load** and when the user clicks **Refresh programme**. Responses are fetched with `cache: 'no-store'`, plus a query-string cache buster. Google Sheets publishing itself may have a delay before changes propagate; this website cannot bypass Google's publication/caching schedule. **No redeployment is required** for changes that reach the public CSV.

To publish a different Google Sheet: open the Sheet → **File → Share → Publish to web**, select the specific tab and **Comma-separated values (.csv)**, and copy the resulting published CSV URL into `CONFIG.csvUrl`. Keep the column header names listed below. The Sheet must be public as a published CSV; sharing an ordinary private editor/viewer URL is not the same as publishing.

### Required source headers (14)

`First Name`, `Last Name`, `Organization`, `Session - Name`, `Session - Details`, `Session - Date`, `Session - Start Time`, `Session - End Time`, `Session - Location`, `Session - Track`, `Paper Title`, `Presentation Type`, `Presentation Start Time`, `Presentation End Time`.

The parser maps columns **by header text**, not order. Only `Session - Name` and `Session - Date` are strictly necessary to retain a session; other missing headers generate diagnostics in the developer console. Quoted commas, escaped quotes, multiline cells, Unicode and `<br>` within cells are supported. All imported values are HTML-escaped; the description renderer only interprets line-break tags. Unexpected source HTML is rendered as escaped text, not executed.

Each row is preserved as an individual contribution, even for judges, moderators, chairs, panelists, untimed speakers, or rows without a paper title. Speaker association deliberately uses a normalized **name plus affiliation** to avoid merging different individuals who share a name. Consequently, inconsistent affiliations of the same person can create separate speaker profiles; administrators should standardize source names and affiliations. Session identities are based on normalized name, date, interval and location, so data corrections to those fields change the shared URL identity.

### Fallback / CORS troubleshooting

This project intentionally does **not** ship an embedded or secretly substituted copy of the spreadsheet. If the live CSV cannot be loaded, the website displays a clear error and offers a retry.

1. Open browser Developer Tools → **Network** and inspect the request to `docs.google.com/spreadsheets/.../pub?...output=csv` (and redirects to `googleusercontent.com`).
2. Confirm the sheet is published to the web as CSV and the URL opens in a private browser window without login.
3. Check for **CORS** console errors: for browser-to-Google cross-origin `fetch`, Google and any redirect destination must return compatible `Access-Control-Allow-Origin` response headers. GitHub Pages cannot override Google's response headers; adding frontend headers or setting `mode:'no-cors'` does **not** fix this (the latter produces an unreadable response).
4. Confirm that publication is not blocked by an organization policy, that ad blockers do not block the endpoint, and that HTTPS is used.
5. Select **Refresh programme** when the issue has been addressed.

**GitHub-compatible snapshot alternative:** Generate a CSV snapshot from the same published CSV using a scheduled GitHub Actions workflow and commit it as `programme-snapshot.csv` to the same directory. For instance, a scheduled GitHub Actions job may use `curl --fail --location --retry 3` to download the CSV, verify the 14 headers with a CSV-aware validator, and commit the changed file. Set `CONFIG.snapshotUrl = './programme-snapshot.csv'` in `data.js`. The application **always attempts the live URL first**. If it fails, the explicitly configured snapshot is used and a visible banner states that a static snapshot is being shown. A GitHub Pages site itself cannot run a background fetch job: GitHub Actions or a scheduled administrator export is required. If periodic snapshot generation is desired, separately add `.github/workflows/refresh-csv.yml` and the generated snapshot to the repository; they are not part of the five-file core application.

For organizations that prohibit client-side third-party fetch, use a scheduled snapshot as the primary site-local `CONFIG.csvUrl` instead, and clearly tell attendees that updates follow the workflow schedule rather than happening live. This alternative changes refresh semantics and must be disclosed.

Do **not** open `index.html` directly using `file://` for a production test: origin/CORS behavior varies. Use a local HTTP server (e.g. `python -m http.server 8000` in the `scientific-programme` folder) and open `http://localhost:8000/`.

## Deploy to GitHub Pages

1. Create a GitHub repository (e.g. `scsasm-scientific-programme`). Add the entire `scientific-programme` folder with the five files.
2. Recommended: move the **contents** of `scientific-programme` to the repository's root if you want a shorter URL. Otherwise leave the files within `scientific-programme/`.
3. In the repository, go to **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/(root)`, and save. Wait for GitHub's Pages deployment to complete.
4. If files are at repo root, the URL is `https://YOUR-ACCOUNT.github.io/REPOSITORY/`. If left within the folder, use `https://YOUR-ACCOUNT.github.io/REPOSITORY/scientific-programme/`.
5. Open the published URL on desktop and phone. Verify the network response from Google Sheets, check the source counts in the developer console, search for a known speaker, and open/share a session URL.
6. GitHub Pages is HTTPS and serves the application as static files. No GitHub Actions are necessary for the live CSV option. The publishing URL is unrelated to the Sheet's edit/share link.

### Link or embed from scsasm.org

Preferred integration: add a **Scientific Programme** link to the site's programme navigation pointing to the deployed GitHub Pages URL. This preserves the accessible full-page experience and makes deep links shareable.

If the main website supports a safe iframe, use a responsive iframe container, e.g.:

```html
<iframe src="https://YOUR-ACCOUNT.github.io/REPOSITORY/scientific-programme/"
  title="SCS ASM 2026 interactive scientific programme"
  loading="lazy" style="width:100%;min-height:900px;border:0"></iframe>
```

The parent website must permit the iframe, and the iframe will have its own scroll area. A standalone link usually provides the better mobile experience. You can also map a custom subdomain with GitHub Pages and DNS if needed; test redirects and security policies.

## Data validation against uploaded development workbook

Source: `SCSASM 2026 - WEB PAGE TEST  Slightly modified(1).xlsx`, one worksheet, 14 headers, checked against a workbook-derived CSV using the exact runtime parser/normalizer.

| Validation item | Workbook-derived result |
|---|---:|
| Source contribution/assignment records | 198 |
| Accepted contribution records | 198 |
| Rejected rows | 0 |
| Unique sessions | 29 |
| Conference days | 3 |
| Distinct conservative speaker profiles | 145 |
| Records missing a presentation start or end | 18 |
| Records with blank track | 30 |
| Same-room interval collisions | 1 |

Confirmed collision in the source: **18 April 2026, Grand Ballroom, 10:30–12:00, S02 and S05**. Both remain shown. A same-room overlap may reflect a source error; organizers should confirm its correct location. The 18 untimed rows remain associated with their sessions and visible. Session roles include `Panelist`, `Judge`, `Moderator` and `Session Chair`.

**Critical limitation:** The live published Google CSV could not be independently fetched in the development environment (the web fetch followed a redirected Google-hosted CSV response it could not retrieve; the container had no DNS resolution for `docs.google.com`). Therefore, *live production reachability/CORS and exact equality of the currently published CSV to this workbook are unverified*. UI and parser checks use workbook-derived CSV served through a controlled test response; do not describe those checks as a successful live fetch. Confirm in a real browser on the final Pages domain before production release.

## Quality assurance checklist

- Parse and normalization: workbook-based 198 records → 29 sessions; no loss or duplication; one overlap warning.
- Test day, track, room, presentation-type and combined filters; empty track selection; Clear all; search case, partial, accent and full name; speaker profile to session; session details.
- Test agenda / timetable, same-room overlap display and precise duration; mobile one-room view; missing times; no page-level horizontal overflow at 320, 375 and 768 CSS pixels.
- Test URL refresh for `?day=2026-04-18`, `?view=timetable`, and `?session=...`; browser Back / Forward and modal Escape.
- Test keyboard navigation, focus trapping/restoration, screen-reader announcements and high-contrast/zoom; run an independent WCAG 2.2 AA audit on the production hosting origin.
- Validate public CSV availability and browser CORS in the production domain (**not independently verified here**).

## Known limitations

- No automatic correction of erroneous room/track/name assignments. Same-room collisions are preserved and flagged; administrators should resolve source errors.
- Presentation start/end times are never inferred from row order; missing times show as not specified.
- Speaker identity has no permanent unique ID in the spreadsheet. Same name plus affiliation is a conservative heuristic and may split one person's profile if the affiliation varies.
- The source has no separate structured chair/panelist association identifier. Each row is displayed as a contribution, with the raw presentation type and title kept intact.
- Google publication may lag edits, and cross-origin access is controlled by Google. No undocumented cache, unannounced fallback or deployment-time embedding is included.
- Some browser-native dialog and print behavior can vary slightly across older browsers. Target evergreen Chromium, Safari and Firefox; perform a final browser/device audit before launch.
- Static-only architecture does not provide user accounts, cross-device bookmarks, notifications or analytics. Those are intentionally omitted in favor of fast, reliable discovery.
