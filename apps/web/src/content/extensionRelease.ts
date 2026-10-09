/**
 * The browser helper release the /extension page offers. `version` must match `extension/manifest.json`
 * (a unit test holds them together); bump both, repack (`node scripts/pack-extension.mjs`), and add a line
 * to `changes` when the helper changes.
 */
export const EXTENSION_RELEASE = {
  version: "0.2.13",
  date: "2026-10-09",
  /** What changed in recent versions, newest first — the page shows these. */
  changes: [
    { version: "0.2.13", note: "Store-ready package; clearer description of when it submits." },
    { version: "0.2.12", note: "Answers gender, ethnicity, work authorization, declarations and ID numbers — only the groups you turn on in Automation, with the answers you confirmed." },
    { version: "0.2.11", note: "Offers to save what you type on a form to your Career Profile, so the next form fills it." },
    { version: "0.2.10", note: "Phone fields: separate country code, no phone in extension boxes, and a retry in the format the form asks for." },
    { version: "0.2.9", note: "Fills fully on any application page, not only ones started from WonderJobs." },
    { version: "0.2.8", note: "Understands education, address and work-history questions." },
  ],
} as const;

/** The Chrome Web Store listing, once published (set NEXT_PUBLIC_EXTENSION_STORE_URL); until then the page offers the direct download. */
export const EXTENSION_STORE_URL = process.env.NEXT_PUBLIC_EXTENSION_STORE_URL?.trim() || null;
