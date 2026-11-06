"use client";
import Link from "next/link";
import { PageTitle } from "@/components/jobslake/ui";
import { CredentialsPanel } from "@/components/jobslake/CredentialsPanel";
import { KeyGroups } from "@/components/jobslake/KeyGroups";

/**
 * Sources → Keys: the API keys the data sources need, set here instead of in the hosting dashboard (owner, 2026-11-01).
 * The platform's own keys (email, AI, push, the collection runner) are on Settings → Platform keys (owner, 2026-11-06).
 */
export default function ApiKeysPage() {
  return (
    <>
      <PageTitle
        title="Data source keys"
        subtitle={
          <>
            The keys the data sources need. Saved encrypted and shown only masked; a value still set in the deployment wins, and Copy from the deployment moves it here. Email, AI and push keys are on{" "}
            <Link href="/platform/jobs-lake/platform-keys" className="font-medium text-brand-600 hover:underline">
              Platform keys
            </Link>
            .
          </>
        }
      />
      <KeyGroups groups={["sources"]} />
      <CredentialsPanel />
    </>
  );
}
