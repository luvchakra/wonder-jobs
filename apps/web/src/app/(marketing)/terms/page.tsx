import type { Metadata } from "next";
import { MarketingPage } from "@/components/landing/MarketingPage";

export const metadata: Metadata = { title: "Terms of service", description: "The terms for using WonderJobs." };

export default function TermsPage() {
  return (
    <MarketingPage
      eyebrow="Legal"
      title="Terms of service"
      intro="Short and readable. By creating an account or using the demo you agree to these terms."
      updated="September 2026"
      sections={[
        { id: "service", title: "The service", body: <p>WonderJobs finds job postings from public sources, scores them against the profile you provide, and drafts application material for you to review. Job data comes from third parties and may be incomplete, out of date or withdrawn; always confirm on the employer&apos;s site before relying on it.</p> },
        {
          id: "your-part",
          title: "Your responsibilities",
          body: (
            <ul>
              <li>Keep your sign-in details private and tell us if you think your account has been used without permission.</li>
              <li>Review anything Wonder drafts before you send it. You are the author of every application you submit.</li>
              <li>Use your own AI provider keys only in line with that provider&apos;s terms.</li>
              <li>Don&apos;t scrape, overload or reverse-engineer the service, or use it to harass employers or other people.</li>
            </ul>
          ),
        },
        { id: "ai", title: "AI-generated content", body: <p>Drafts, scores and explanations are produced by software and can be wrong. They are suggestions, not advice, and not a promise that any employer will respond.</p> },
        { id: "free", title: "Pricing", body: <p>WonderJobs is currently free. If that changes we&apos;ll tell you in advance, and anything you&apos;ve stored stays yours to export or delete.</p> },
        { id: "liability", title: "Liability", body: <p>The service is provided as is. To the extent the law allows, WonderJobs is not liable for missed opportunities, lost data, or decisions made on the basis of its output. Nothing here limits rights you have under applicable consumer law.</p> },
        { id: "changes", title: "Changes and contact", body: <p>We may update these terms; the date above shows the current version. Questions go to the contact form on the home page.</p> },
      ]}
    />
  );
}
