import type { Metadata } from "next";
import { MarketingPage } from "@/components/landing/MarketingPage";

export const metadata: Metadata = { title: "Privacy policy", description: "What WonderJobs stores, why, and how to remove it." };

export default function PrivacyPage() {
  return (
    <MarketingPage
      eyebrow="Legal"
      title="Privacy policy"
      intro="Plain-language summary of what WonderJobs collects and what it does with it. This describes how the product actually works today."
      updated="September 2026"
      sections={[
        {
          id: "what-we-store",
          title: "What we store",
          body: (
            <ul>
              <li>Account: your email, name and a hashed password (or your Google identity) held by our authentication provider, Supabase.</li>
              <li>Career Profile: the goals, skills, locations, pay expectations and background you enter, so Wonder can score jobs against them.</li>
              <li>Decisions and applications: saved and dismissed jobs, drafted applications, submission records, follow-ups, interviews and run history.</li>
              <li>Provider keys: if you bring your own AI key it is encrypted with a server-side key before it is stored, and only ever decrypted on the server for the request you make.</li>
              <li>Contact messages: name, email, topic and message when you write to us from the landing page.</li>
            </ul>
          ),
        },
        {
          id: "what-we-dont",
          title: "What we don't do",
          body: (
            <ul>
              <li>We don&apos;t sell or share your data with advertisers.</li>
              <li>We don&apos;t apply to jobs, message employers or post anything on your behalf.</li>
              <li>We don&apos;t send your Career Profile to an AI provider unless you run a feature that needs it, and then only to the provider you chose (or WonderJobs AI).</li>
              <li>Demo mode stores nothing on our servers; sample data lives in your browser only.</li>
            </ul>
          ),
        },
        {
          id: "third-parties",
          title: "Services we rely on",
          body: (
            <ul>
              <li>Supabase for authentication and the database, Vercel for hosting.</li>
              <li>Job sources: public company career boards (Greenhouse, Lever, Ashby) and job APIs (Jobicy, Remote OK, Himalayas, Arbeitnow, Remotive, Adzuna). Search terms are sent to them; your identity is not.</li>
              <li>AI providers: Anthropic, OpenAI or Google, whichever you connect your own key to, or the platform&apos;s own model behind WonderJobs AI (Anthropic, OpenAI or Google, depending on the deployment).</li>
            </ul>
          ),
        },
        {
          id: "your-rights",
          title: "Your data, your call",
          body: (
            <>
              <p>You can edit or clear your Career Profile, decisions and applications inside the app at any time. To delete your account and everything attached to it, or to request an export, contact us from the address you signed up with.</p>
            </>
          ),
        },
      ]}
    />
  );
}
