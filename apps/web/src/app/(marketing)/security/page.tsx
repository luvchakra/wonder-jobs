import type { Metadata } from "next";
import { MarketingPage } from "@/components/landing/MarketingPage";

export const metadata: Metadata = { title: "Security", description: "How WonderJobs protects accounts, data and provider keys." };

export default function SecurityPage() {
  return (
    <MarketingPage
      eyebrow="Trust"
      title="Security"
      intro="How the product is built to keep your account, your data and your AI keys safe."
      updated="September 2026"
      sections={[
        {
          id: "accounts",
          title: "Accounts and sessions",
          body: (
            <ul>
              <li>Authentication is handled by Supabase Auth: passwords are hashed, email confirmation is required, and Google sign-in uses OAuth with PKCE.</li>
              <li>Sessions live in HTTP-only cookies. Every server request verifies the token&apos;s signature against the provider&apos;s public keys before touching any data.</li>
              <li>Password reset links are single-use and expire after an hour.</li>
            </ul>
          ),
        },
        {
          id: "data",
          title: "Data isolation",
          body: (
            <ul>
              <li>All product data lives in a dedicated database schema with row-level security enabled and no anonymous policies. Only the server, with a service key, can read or write it.</li>
              <li>Every query is scoped to the signed-in account. There is no shared tenant.</li>
              <li>Demo mode never writes to the server.</li>
            </ul>
          ),
        },
        {
          id: "keys",
          title: "Your AI keys",
          body: (
            <ul>
              <li>Bring-your-own keys are encrypted with AES-256-GCM using a server-side secret before storage, and decrypted only inside the request that uses them.</li>
              <li>Keys are never returned to the browser; the settings page shows only that a key exists and its last four characters.</li>
              <li>Provider calls happen server-side, so your key is never exposed to third-party scripts.</li>
            </ul>
          ),
        },
        {
          id: "actions",
          title: "External actions",
          body: (
            <ul>
              <li>Wonder never submits an application, sends a message or posts on your behalf. Apply steps hand you to the employer&apos;s page and record what happened.</li>
              <li>Every external action is written to an audit ledger with what was done, when and under which automation policy.</li>
            </ul>
          ),
        },
        { id: "report", title: "Reporting a vulnerability", body: <p>If you find a security issue, use the contact form with the topic &ldquo;I need help with my account&rdquo; and describe what you found. We&apos;ll acknowledge within two working days and keep you informed while we fix it. Please don&apos;t access other people&apos;s data while testing.</p> },
      ]}
    />
  );
}
