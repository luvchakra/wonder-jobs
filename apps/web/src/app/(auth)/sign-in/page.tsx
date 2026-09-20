import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { WORK_MODE_LABEL } from "@/domain/jobs/types";
import { publicJobTeaser } from "@/server/jobs/teaser";

/**
 * A shared job link redirects here, so this page's tags are what WhatsApp,
 * Slack and the rest show for it. When the link points at a posting we can
 * still resolve, the preview names the actual role instead of saying
 * "Sign in" — the same real data the page itself teases below the form.
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ next?: string }> }): Promise<Metadata> {
  const { next } = await searchParams;
  const job = await publicJobTeaser(next);
  if (!job) return { title: "Sign in" };
  // Only `title`/`description`: returning an `openGraph` object here would *replace* the inherited one
  // and take the brand image with it, leaving a shared job link with no logo again. These flow into
  // og:title/og:description on their own, and the root's opengraph-image stays attached.
  return {
    title: `${job.title} · ${job.company}`,
    description: `${job.location} · ${WORK_MODE_LABEL[job.workMode]}${job.salary ? ` · ${job.salary}` : ""}. Shared from WonderJobs — sign in to see the full listing and your match.`,
  };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const jobTeaser = await publicJobTeaser(next);
  return (
    <Suspense fallback={null}>
      <AuthForm mode="sign-in" jobTeaser={jobTeaser} />
    </Suspense>
  );
}
