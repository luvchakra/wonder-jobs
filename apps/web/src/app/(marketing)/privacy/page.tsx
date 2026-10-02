import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/landing/MarketingPage";
import { MINIMUM_AGE, PRIVACY_NOTICE_VERSION, RETENTION, SUB_PROCESSORS, grievanceContact } from "@/content/privacy";

export const metadata: Metadata = { title: "Privacy notice", description: "What WonderJobs stores, why, who processes it, how long it's kept, and your rights under the GDPR and India's DPDP Act." };

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-line">
      <table className="w-full min-w-[520px] text-left text-[13.5px]">
        <thead className="bg-surface-2 text-ink">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPage() {
  const contact = grievanceContact();
  return (
    <MarketingPage
      eyebrow="Legal"
      title="Privacy notice"
      intro="What WonderJobs collects, why, who else processes it, how long it is kept, and how to exercise your rights under the EU/UK GDPR and India's Digital Personal Data Protection Act, 2023. It describes how the product actually works today."
      updated={`2 October 2026 · version ${PRIVACY_NOTICE_VERSION}`}
      sections={[
        {
          id: "who",
          title: "Who is responsible",
          body: (
            <p>
              WonderJobs decides why and how your personal data is processed, so it is the <em>controller</em> under the GDPR and the <em>Data Fiduciary</em> under the DPDP Act. The services listed under &ldquo;Who else processes it&rdquo; act on our instructions as processors.
            </p>
          ),
        },
        {
          id: "what-we-store",
          title: "What we store",
          body: (
            <ul>
              <li>Account: your email, name and a hashed password (or your Google identity), held by our authentication provider.</li>
              <li>Career Profile: goals, skills, locations, pay expectations, work history, education and the contact details you choose to put on your résumé.</li>
              <li>Activity: saved and dismissed jobs, drafted applications, submission records, follow-ups, interviews, search history and settings.</li>
              <li>Provider keys: if you bring your own AI key it is encrypted (AES-256-GCM) before storage and decrypted only on the server, for the request that uses it.</li>
              <li>Billing, if you subscribe: your subscription status and a ledger of payment events (amounts, currency, dates, provider reference ids). Card, UPI and bank details are entered on Razorpay&apos;s or Stripe&apos;s own page and never reach us.</li>
              <li>Records of this notice being accepted, and of any export or erasure you request.</li>
              <li>Contact messages: name, email, topic and message when you write to us.</li>
            </ul>
          ),
        },
        {
          id: "why",
          title: "Why, and on what basis",
          body: (
            <>
              <ul>
                <li>Finding, scoring and preparing jobs and applications you ask for — performing our contract with you (GDPR Art. 6(1)(b)); data you provide for that purpose (DPDP s.6 consent and s.7(a) voluntarily provided data).</li>
                <li>Drafting with AI, only when you run a drafting feature — the same basis; only the details that draft needs are sent, to the provider you chose.</li>
                <li>Taking payments and keeping financial records — contract, and legal obligation for tax and accounting records (GDPR Art. 6(1)(c)).</li>
                <li>Security, fraud prevention and the audit trail of what Wonder did on your behalf — legitimate interests (GDPR Art. 6(1)(f)).</li>
                <li>Notifications on a device — only after you turn them on, and you can turn them off at any time.</li>
              </ul>
              <p>There is no advertising, no tracking, no profiling for anyone else and no sale of data. Automated scoring of jobs is shown to you with its reasons; it never makes a decision about you that has legal or similarly significant effect.</p>
            </>
          ),
        },
        {
          id: "third-parties",
          title: "Who else processes it",
          body: <Table head={["Service", "Purpose", "Data involved"]} rows={SUB_PROCESSORS.map((s) => [s.name, s.purpose, s.data])} />,
        },
        {
          id: "transfers",
          title: "Transfers outside India and the EU",
          body: <p>Some of these services process data outside India and the EU/UK — for example AI providers and Stripe in the United States. Data goes only to the services listed above, under their data processing terms, and only what each one needs. The DPDP Act allows such transfers except to countries the Government of India restricts; we will stop any transfer that becomes restricted.</p>,
        },
        {
          id: "retention",
          title: "How long we keep it",
          body: (
            <>
              <Table head={["Data", "Kept for", "Basis"]} rows={RETENTION.map((r) => [r.data, r.period, r.basis])} />
              <p>Expired contact messages are deleted by a daily job. Deleting your account removes everything except the records the law requires us to keep, listed above.</p>
            </>
          ),
        },
        {
          id: "your-rights",
          title: "Your rights, and how to use them",
          body: (
            <>
              <ul>
                <li>
                  <strong>Access and portability</strong> — Profile → Your data → <em>Download my data</em> gives you everything stored for your account as one JSON file, straight away.
                </li>
                <li>
                  <strong>Correction</strong> — edit your Career Profile, applications and settings at any time. For anything you can&apos;t edit yourself (such as your sign-in email), contact us.
                </li>
                <li>
                  <strong>Erasure</strong> — Profile → Your data → <em>Delete account</em> deletes your account and data immediately, keeping only the records listed above.
                </li>
                <li>
                  <strong>Withdrawing consent, objecting or restricting processing</strong> — turn off the feature (notifications, AI drafting, a saved key), or delete your account. Withdrawal doesn&apos;t affect processing that already happened.
                </li>
                <li>
                  <strong>Nominating someone</strong> (DPDP s.14) to exercise these rights if you die or become unable to — tell us who through the contact below.
                </li>
                <li>
                  <strong>Complaints</strong> — contact our grievance officer first; we answer within 30 days. You can also complain to your data protection authority in the EU/UK, or, once our grievance process is exhausted, to the Data Protection Board of India.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "grievance",
          title: "Grievance officer and privacy contact",
          body: contact.email ? (
            <p>
              {contact.name ? `${contact.name} — ` : ""}
              <a href={`mailto:${contact.email}`} className="font-medium text-brand-600 underline">
                {contact.email}
              </a>
              . You can also use the <Link href="/#contact" className="font-medium text-brand-600 underline">contact form</Link> with the topic &ldquo;Privacy request&rdquo;.
            </p>
          ) : (
            <p>
              Use the <Link href="/#contact" className="font-medium text-brand-600 underline">contact form</Link> and choose the topic &ldquo;Privacy request&rdquo;. Requests are stored and answered within 30 days.
            </p>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: <p>WonderJobs is for people aged {MINIMUM_AGE} and over. Signed-in users confirm their age when they accept this notice. If you believe a child has an account, contact us and we will delete it.</p>,
        },
        {
          id: "security",
          title: "Security and breaches",
          body: (
            <p>
              How we protect data is described on the <Link href="/security" className="font-medium text-brand-600 underline">security page</Link>. If a personal-data breach happens, we will tell the affected people without undue delay, notify the Data Protection Board of India, and notify the competent EU/UK supervisory authority within 72 hours where the GDPR requires it — saying what happened, what data was involved and what we are doing about it.
            </p>
          ),
        },
        {
          id: "changes",
          title: "Changes to this notice",
          body: <p>Each version has a number (above). When we change it materially, signed-in users are asked to review and accept the new version before continuing, and the acceptance is recorded.</p>,
        },
      ]}
    />
  );
}
