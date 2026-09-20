import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { publicJobTeaser } from "@/server/jobs/teaser";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const jobTeaser = await publicJobTeaser(next);
  return (
    <Suspense fallback={null}>
      <AuthForm mode="sign-up" jobTeaser={jobTeaser} />
    </Suspense>
  );
}
