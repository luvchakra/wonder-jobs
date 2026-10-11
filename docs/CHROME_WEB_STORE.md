# Chrome Web Store — the browser helper

The helper is packed for the store with `node scripts/pack-extension.mjs --store` (the same files as the
direct download, minus the localhost entries). `.github/workflows/extension-publish.yml` packs it and, once
the secrets below exist, uploads and publishes it.

## One-time setup (owner)

1. **Developer account** — register at https://chrome.google.com/webstore/devconsole (one-time US$5 fee), as the
   publisher name WonderJobs should show.
2. **First upload** — in the developer console choose *New item* and upload the package: run the workflow
   with *publish* off and download the `wonderjobs-helper` artifact, or run `node scripts/pack-extension.mjs --store`
   locally (`dist/wonderjobs-helper-<version>.zip`). Fill in the listing below and submit for review.
3. **Automatic updates** — in Google Cloud, enable the *Chrome Web Store API*, create an OAuth client
   (Desktop app), and get a refresh token for the publishing account
   (https://developer.chrome.com/docs/webstore/using-api). Add four repository secrets:
   `CWS_EXTENSION_ID` (from the item's URL), `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.
4. **Point the site at it** — once the listing is live, set `NEXT_PUBLIC_EXTENSION_STORE_URL` in Vercel to the
   listing URL. /extension then shows *Add to Chrome* instead of the direct download.

## Each release

Bump `extension/manifest.json` and `apps/web/src/content/extensionRelease.ts` (a test holds them together),
repack the direct download (`node scripts/pack-extension.mjs`), merge, then run *Publish browser helper*.

## Listing

- **Name:** WonderJobs helper
- **Summary (≤132):** the manifest description.
- **Category:** Productivity → Workflow & Planning
- **Description:**

  WonderJobs helper fills job application forms with the details, résumé and answers you approved in
  WonderJobs (https://jobs.wonderapps.biz).

  • Contact, address, education and work history, from your Career Profile and résumé
  • The résumé and cover letter you prepared for that role, as a file or text
  • Application answers you saved, such as salary and notice period
  • Sensitive questions (demographics, work authorization, declarations, ID numbers) only if you turn that
    group on in WonderJobs and confirm the answers

  Anything it can't match is left blank and listed for you — it never invents a value. It never reads
  password, one-time-code or payment fields. It presses a page's own Next button to move through a form, and
  presses the final Submit only if you turned on Submit applications in WonderJobs; otherwise you submit.

  Works on Greenhouse, Lever, Ashby and Workday forms automatically, and on other career sites after you allow
  that one site.

- **Privacy policy URL:** https://jobs.wonderapps.biz/privacy
- **Single purpose:** Help the user apply to the job they're viewing: score it against their WonderJobs profile, save it to their Pipeline, and fill its application form with their own approved details.

### Permission justifications

| Permission | Why |
|---|---|
| `storage` | Keeps the short-lived WonderJobs session token and the user's per-site choices. |
| `scripting` | Runs the form filler on an employer site the user has just allowed. |
| `activeTab` | Reads the job on the tab the user clicked the icon on (to score it), and fills the form there when they press Fill. |
| `sidePanel` | The helper opens beside the page, so the user can read the job and its score together. |
| Host: `jobs.wonderapps.biz` | Talks to the user's own WonderJobs account. |
| Host: Greenhouse, Lever, Ashby, Workday | Recognise and fill application forms on these hiring platforms. |
| Optional host: `https://*/*` | Requested one site at a time, only when the user allows a company's own careers site — or LinkedIn and Naukri together, when the user chooses "Always read jobs on LinkedIn and Naukri". |

### Data use disclosures

Collects *personally identifiable information* and *website content* (the job posting the user is viewing while the
helper's panel is open, to score it, kept only if they press Save; form labels on an application page, to fill it),
used only for that; not sold, not used for anything unrelated, not used for
credit decisions.
