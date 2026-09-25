import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/landing/MarketingPage";

export const metadata: Metadata = { title: "About WonderJobs", description: "Why WonderJobs exists, what it will and won't do for you, and who builds it." };

export default function AboutPage() {
  return (
    <MarketingPage
      eyebrow="About"
      title="Job searching is a full-time job. It shouldn't be."
      intro="WonderJobs is an AI career agent that does the repetitive part of a job search and leaves the decisions to you."
      sections={[
        {
          id: "mission",
          title: "What we're building",
          body: (
            <>
              <p>Most job seekers spend their evenings re-typing the same details into the same forms, scanning the same boards, and guessing whether a role is worth it. Wonder searches real sources, removes duplicates, reads each posting for skills, seniority, location and pay, and explains how well it fits your Career Profile.</p>
              <p>When something is worth pursuing, Wonder drafts a tailored resume, cover letter and screening answers, lays your resume out in one of eight ATS-friendly templates, and can fill the employer&apos;s application form in your browser. It stops for anything only you should answer, and you review and submit. Wonder never submits on your behalf.</p>
            </>
          ),
        },
        {
          id: "principles",
          title: "Principles",
          body: (
            <ul>
              <li>Real data, honestly labelled. Every job links back to its source and every score explains itself.</li>
              <li>You stay in control. Automation levels, approval gates and a full audit trail of every external action.</li>
              <li>Your AI, your keys. Bring your own provider key or use WonderJobs AI. Keys are encrypted and never leave the server.</li>
              <li>Quiet by default. A scheduled run that finds nothing says nothing.</li>
            </ul>
          ),
        },
        {
          id: "careers",
          title: "Careers",
          body: (
            <>
              <p>WonderJobs is a small team. We&apos;re not hiring right now, but we read every message. If you&apos;d like to work on job search, matching, or the agent runtime, tell us what you&apos;d build first.</p>
              <p>
                <Link href="/#contact" className="font-semibold text-brand-600 hover:underline">
                  Introduce yourself
                </Link>
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
