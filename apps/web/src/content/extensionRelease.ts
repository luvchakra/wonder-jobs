/**
 * The browser helper release the /extension page offers. `version` must match `extension/manifest.json`
 * (a unit test holds them together); bump both, repack (`node scripts/pack-extension.mjs`), and add a line
 * to `changes` when the helper changes.
 */
export const EXTENSION_RELEASE = {
  version: "0.3.6",
  date: "2026-10-17",
  /** What changed in recent versions, newest first — the page shows these. */
  changes: [
    { version: "0.3.6", note: "The side panel shows the company's logo from JobsLake, and its wording matches the app (Career Profile, Automation, Guide me)." },
    { version: "0.3.5", note: "Ignores third-party frames inside application forms, finds Submit links styled as buttons, and reads Lever's required marks." },
    { version: "0.3.4", note: "Never treats a portal's Sign In or Create Account button as a step, and skips hidden fields meant for bots." },
    { version: "0.3.3", note: "In a background fill, answers searchable dropdowns (Greenhouse's newer forms) with the employer's own options." },
    { version: "0.3.2", note: "Reads Greenhouse's newer forms correctly: dropdown questions, no duplicate blank questions, and verification checks no longer pause filling." },
    { version: "0.3.1", note: "Tells WonderJobs when it reaches a form's last page, so Apply for this job can offer Submit this application." },
    { version: "0.3.0", note: "Opens beside the page: scores the job you're viewing against your profile and saves it to your Pipeline in one click." },
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
