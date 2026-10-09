import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { MarketingPage } from "@/components/landing/MarketingPage";
import { EXTENSION_RELEASE, EXTENSION_STORE_URL } from "@/content/extensionRelease";

export const metadata: Metadata = {
  title: "Browser extension",
  description: "Fill an employer's application form with the details, résumé and answers you approved in WonderJobs.",
};

const BUTTON = "inline-flex items-center gap-2 rounded-[12px] bg-brand-500 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-600";

export default function ExtensionPage() {
  const { version, date, changes } = EXTENSION_RELEASE;
  return (
    <MarketingPage
      eyebrow={`Browser extension · version ${version}`}
      title="Apply without retyping yourself"
      intro="WonderJobs prepares your materials. The helper puts them into the employer's own form — your details, your résumé and cover letter for that role, and the answers you approved. You review; it submits only if you turn on Submit applications."
      sections={[
        {
          id: "what-it-fills",
          title: "What it fills",
          body: (
            <>
              <ul>
                <li>
                  <strong>Contact and address</strong> — name, email, phone (with a separate country code where the form wants one), LinkedIn, city, state and country, from your Career Profile.
                </li>
                <li>
                  <strong>Education and experience</strong> — schools, degrees, employers, titles and dates, read from your Career Profile and résumé in the form&apos;s own format.
                </li>
                <li>
                  <strong>Résumé and cover letter</strong> — the versions prepared for that posting, as a real file or as text, whichever the form asks for.
                </li>
                <li>
                  <strong>Application answers</strong> — salary, notice period and the like, from the answers saved in your Career Profile.
                </li>
              </ul>
              <p>
                Anything your profile doesn&apos;t hold is left blank and listed for you — the helper never invents a value to look complete. If a form rejects a value&apos;s format (a phone number, say), it tries again in the format the form asks for.
                When you type something new on a form and save it, the helper offers to keep it in your Career Profile for the next one.
              </p>
              <p>
                <strong>Sensitive questions</strong> — gender and ethnicity, work authorization and sponsorship, legal declarations and ID numbers — stay yours unless you turn that group on in Automation and confirm the exact answers. ID numbers are stored
                encrypted and shown only masked.
              </p>
            </>
          ),
        },
        {
          id: "how-it-works",
          title: "How it works",
          body: (
            <>
              <p>
                <strong>Apply with Wonder</strong> (from a job in WonderJobs): the helper opens the employer&apos;s form, fills each page, highlights what needs you, and presses the page&apos;s own Next to reach the next one. It stops for sign-in,
                verification challenges, an unexpected site, and on the page whose button submits — where you press Submit, unless you turned on Submit applications, when it presses Submit once every required answer is yours, and logs it.
              </p>
              <p>
                <strong>Any other application page</strong>: open the helper and choose Fill. It fills what it can match from your Career Profile and résumé on the form you&apos;re looking at.
              </p>
              <p>Greenhouse, Lever, Ashby and Workday forms run the helper automatically. On an employer&apos;s own careers site it asks you to allow that one site first — it never asks for access to every website.</p>
            </>
          ),
        },
        {
          id: "install",
          title: "Install it",
          body: EXTENSION_STORE_URL ? (
            <>
              <p>
                <a href={EXTENSION_STORE_URL} className={BUTTON}>
                  Add to Chrome
                </a>
              </p>
              <p>Works in Chrome, Edge, Brave and other Chromium browsers. Then open WonderJobs and sign in — the helper connects itself.</p>
            </>
          ) : (
            <>
              <p>It installs directly while its Chrome Web Store listing is in review — about thirty seconds:</p>
              {/* The shared page frame styles every `li` as a disc; `[&>li]` outranks it so these stay numbered. */}
              <ol className="ml-5 [&>li]:list-decimal">
                <li>Download the extension and unzip it somewhere you&apos;ll keep.</li>
                <li>
                  Open <code>chrome://extensions</code> and turn on <strong>Developer mode</strong>, top right.
                </li>
                <li>
                  Click <strong>Load unpacked</strong> and pick the folder you unzipped.
                </li>
                <li>Open WonderJobs and sign in — the helper connects itself.</li>
              </ol>
              <p className="mt-2">
                <a href="/wonderjobs-extension.zip" download className={BUTTON}>
                  <Download className="size-4" aria-hidden /> Download version {version}
                </a>
              </p>
              <p>
                Already installed? Your version is on <code>chrome://extensions</code>. To update, download again, replace the folder&apos;s contents, and press the reload arrow on the helper&apos;s card.
              </p>
            </>
          ),
        },
        {
          id: "whats-new",
          title: "What's new",
          body: (
            <>
              <p>
                Version {version}, {new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.
              </p>
              <ul>
                {changes.map((c) => (
                  <li key={c.version}>
                    <strong>{c.version}</strong> — {c.note}
                  </li>
                ))}
              </ul>
            </>
          ),
        },
        {
          id: "privacy",
          title: "What it can see",
          body: (
            <ul>
              <li>It reads your prepared materials from WonderJobs with a short-lived token that is refreshed while you have WonderJobs open. There is no password or key to paste anywhere.</li>
              <li>The token never reaches the employer&apos;s page — only the helper&apos;s own background worker holds it.</li>
              <li>It reads a form&apos;s labels and choices to know what to fill. It never reads password, one-time-code or payment fields.</li>
              <li>It sends the address of the application page you&apos;re on to WonderJobs, to find what you prepared for it. Nothing else about your browsing leaves your machine.</li>
              <li>
                It submits a form only when you turned on Submit applications. Read more in <Link href="/security">Security</Link>.
              </li>
            </ul>
          ),
        },
      ]}
    />
  );
}
