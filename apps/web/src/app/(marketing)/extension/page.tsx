import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { MarketingPage } from "@/components/landing/MarketingPage";

export const metadata: Metadata = {
  title: "Browser extension",
  description: "Fill an employer's application form with the resume and cover letter you already prepared in WonderJobs.",
};

export default function ExtensionPage() {
  return (
    <MarketingPage
      eyebrow="Browser extension"
      title="Apply without retyping yourself"
      intro="WonderJobs prepares your materials. The extension puts them into the employer's own form — your name, your email, the resume and cover letter tailored to that exact role. It never submits anything for you."
      sections={[
        {
          id: "what-it-fills",
          title: "What it fills",
          body: (
            <>
              <ul>
                <li>
                  <strong>Name and email</strong> — from your Career DNA and your account.
                </li>
                <li>
                  <strong>Resume</strong> — the version you prepared for that specific posting, attached as a real <code>.docx</code>.
                </li>
                <li>
                  <strong>Cover letter</strong> — the one prepared for that posting, as text or as a file, whichever the form wants.
                </li>
              </ul>
              <p>
                Phone number, LinkedIn URL and location are deliberately left blank: WonderJobs has no field for them yet, so there is nothing real to put there. The extension lists them so you know what is still yours to type — it never invents a value to look
                complete.
              </p>
            </>
          ),
        },
        {
          id: "where-it-works",
          title: "Where it works",
          body: (
            <>
              <p>Greenhouse, Lever and Ashby application forms are recognised field by field — the same company career sites WonderJobs searches. On other sites it falls back to reading each field&apos;s visible label, which handles the obvious ones.</p>
              <p>It only ever acts when you click it, and only on the page you are looking at.</p>
            </>
          ),
        },
        {
          id: "install",
          title: "Install it",
          body: (
            <>
              <p>
                It isn&apos;t on the Chrome Web Store yet, so it installs directly — about thirty seconds:
              </p>
              {/* The shared page frame styles every `li` as a disc; `[&>li]` outranks it so these stay numbered. */}
              <ol className="ml-5 [&>li]:list-decimal">
                <li>Download the extension and unzip it somewhere you&apos;ll keep.</li>
                <li>
                  Open <code>chrome://extensions</code>.
                </li>
                <li>
                  Turn on <strong>Developer mode</strong>, top right.
                </li>
                <li>
                  Click <strong>Load unpacked</strong> and pick the folder you just unzipped.
                </li>
                <li>Open WonderJobs and sign in — the extension connects itself.</li>
              </ol>
              <p className="mt-2">
                <a href="/wonderjobs-extension.zip" download className="inline-flex items-center gap-2 rounded-[12px] bg-brand-500 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-600">
                  <Download className="size-4" aria-hidden /> Download the extension
                </a>
              </p>
              <p>Works in Chrome, Edge, Brave and any other Chromium browser.</p>
            </>
          ),
        },
        {
          id: "privacy",
          title: "What it can see",
          body: (
            <ul>
              <li>It reads your prepared materials from WonderJobs using a read-only token that expires after thirty minutes and is refreshed whenever you have WonderJobs open. There is no password or key to paste anywhere.</li>
              <li>The token never reaches the employer&apos;s page — only the extension&apos;s own background worker holds it.</li>
              <li>It sends the address of the job page you are on to WonderJobs, so it can find the materials you prepared for that posting. Nothing else about your browsing leaves your machine.</li>
              <li>
                It never submits a form. Read more in <Link href="/security">Security</Link>.
              </li>
            </ul>
          ),
        },
      ]}
    />
  );
}
