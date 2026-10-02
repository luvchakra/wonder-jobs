import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/landing/MarketingPage";

export const metadata: Metadata = { title: "Security", description: "How WonderJobs protects accounts, data, payments and provider keys, and how to report a vulnerability." };

export default function SecurityPage() {
  return (
    <MarketingPage
      eyebrow="Trust"
      title="Security"
      intro="How the product is built to keep your account, your data, your payments and your AI keys safe — described as it works today, including what isn't done yet."
      updated="October 2026"
      sections={[
        {
          id: "accounts",
          title: "Accounts and sessions",
          body: (
            <ul>
              <li>Authentication is handled by Supabase Auth: passwords are hashed, email confirmation is required, and Google sign-in uses OAuth with PKCE.</li>
              <li>Every server request verifies the session token&apos;s signature against the provider&apos;s public keys before touching any data.</li>
              <li>Password reset links are single-use and expire after an hour.</li>
              <li>Sign-in redirects only ever go to a page on this site: every <code>?next=</code> value is resolved and checked to stay on our own origin.</li>
            </ul>
          ),
        },
        {
          id: "data",
          title: "Data isolation",
          body: (
            <ul>
              <li>All product data lives in a dedicated database schema that the public database keys cannot reach; only the server, with a service key, can read or write it.</li>
              <li>Every query is scoped to the signed-in account in application code. There is no shared tenant.</li>
              <li>Demo mode never writes to the server.</li>
            </ul>
          ),
        },
        {
          id: "web",
          title: "Web and API protections",
          body: (
            <ul>
              <li>Security headers on every response: a Content Security Policy that limits where scripts, styles and connections can come from, HSTS, framing blocked (clickjacking), MIME sniffing off, a strict referrer policy and a permissions policy that allows only the microphone (for dictation), only on our own pages.</li>
              <li>Requests that change data are refused when the browser reports they came from another site (CSRF protection), on top of SameSite cookies.</li>
              <li>Rate limits on the AI, upload, contact, search, payment and privacy endpoints; body-size limits on uploads and webhooks; résumé files are read in memory with decompression limits and never stored.</li>
              <li>Server errors are logged without personal data and never sent to the browser verbatim.</li>
            </ul>
          ),
        },
        {
          id: "keys",
          title: "Your AI keys",
          body: (
            <ul>
              <li>Bring-your-own keys are encrypted with AES-256-GCM before storage, using an encryption key derived (HKDF) only for that purpose, and decrypted only inside the request that uses them.</li>
              <li>Keys are never returned to the browser; the settings page shows only that a key exists and its last four characters.</li>
              <li>Provider calls happen server-side, so your key is never exposed to scripts in the page.</li>
            </ul>
          ),
        },
        {
          id: "payments",
          title: "Payments",
          body: (
            <ul>
              <li>Payments are taken by Razorpay (India) or Stripe (international) on their own hosted pages. Card, UPI and bank details never reach WonderJobs servers; both providers are PCI DSS Level 1 certified.</li>
              <li>Payment notifications are accepted only with a valid HMAC signature from the provider, compared in constant time; Stripe signatures older than five minutes are refused to stop replays.</li>
              <li>Your plan is decided on the server from those verified notifications. Returning from checkout, or anything the browser sends, can&apos;t change it.</li>
            </ul>
          ),
        },
        {
          id: "financial",
          title: "Financial records and controls",
          body: (
            <ul>
              <li>Every verified payment event is written to an append-only ledger. Each row carries a SHA-256 hash of its contents and of the row before it, so altering, removing or reordering any row is detectable.</li>
              <li>The database itself refuses updates, deletes and truncation of the ledger — for the server&apos;s own service key too — and writes rows under a lock so the chain can&apos;t fork.</li>
              <li>A redelivered event is recognised by its provider event id and recorded once; the ledger stores identifiers and amounts only, with a hash of the original payload, never names or card data.</li>
              <li>A daily reconciliation asks Razorpay and Stripe for the live status of every open subscription and records any correction in the ledger.</li>
              <li>Segregation of duties: a separate, read-only auditor credential can verify the hash chain and export the full ledger as CSV; it can&apos;t change data, deploy or migrate.</li>
              <li>Payment records are kept for eight years to meet tax and accounting law, including after an account is deleted.</li>
              <li>WonderJobs is not a public company and has not been audited under the Sarbanes-Oxley Act; these are the kinds of controls such audits test.</li>
            </ul>
          ),
        },
        {
          id: "actions",
          title: "External actions",
          body: (
            <ul>
              <li>Wonder never submits an application, sends a message or posts on your behalf. Apply steps hand you to the employer&apos;s page and record what happened.</li>
              <li>External actions are written to an audit ledger with what was done and when; its rows can&apos;t be edited.</li>
            </ul>
          ),
        },
        {
          id: "engineering",
          title: "How changes ship",
          body: (
            <ul>
              <li>Every change runs lint, type checks, the unit-test suite, a production build and a dependency vulnerability audit (high and critical advisories fail the build) before it can merge.</li>
              <li>Dependency and CI updates are proposed automatically every week, and security updates as soon as an advisory is published.</li>
              <li>Database changes are made only through versioned migrations checked into the repository.</li>
            </ul>
          ),
        },
        {
          id: "known-gaps",
          title: "Known limitations",
          body: (
            <ul>
              <li>The session cookie can be read by the page&apos;s own scripts, because the sign-in library needs that; the Content Security Policy limits what an injected script could reach, but still permits inline scripts, which the framework needs today.</li>
              <li>Rate limits are kept per server instance rather than shared across all of them.</li>
              <li>A calendar subscription link works until the account is deleted; it can&apos;t yet be rotated on its own.</li>
            </ul>
          ),
        },
        {
          id: "report",
          title: "Reporting a vulnerability",
          body: (
            <p>
              Use the <Link href="/#contact" className="font-medium text-brand-600 underline">contact form</Link> with the topic &ldquo;Report a security issue&rdquo; and describe what you found. We acknowledge within two working days and keep you informed while we fix it. Please don&apos;t access other people&apos;s data, degrade the service or run automated scans while testing. Our <a href="/.well-known/security.txt" className="font-medium text-brand-600 underline">security.txt</a> lists the same contact.
            </p>
          ),
        },
      ]}
    />
  );
}
