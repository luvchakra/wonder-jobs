"use client";
import Link from "next/link";
import { PageTitle } from "@/components/jobslake/ui";
import { KeyGroups, PLATFORM_GROUPS } from "@/components/jobslake/KeyGroups";

/**
 * Settings → Platform keys: the platform's own settings, moved here from the deployment (owner, 2026-11-06), kept apart
 * from the data sources' keys ("keep these keys in separate section to differentiate from data source keys").
 */
export default function PlatformKeysPage() {
  return (
    <>
      <PageTitle
        title="Platform keys"
        subtitle={
          <>
            Email, WonderWorks AI, push notifications and the collection runner. Secrets are saved encrypted and shown only masked; a value still set in the deployment wins, and Copy from the deployment moves it here so the variable can be deleted. The data sources&apos; keys are on{" "}
            <Link href="/platform/jobs-lake/keys" className="font-medium text-brand-600 hover:underline">
              Data source keys
            </Link>
            .
          </>
        }
      />
      <KeyGroups groups={PLATFORM_GROUPS} />
    </>
  );
}
