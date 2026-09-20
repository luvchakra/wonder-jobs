import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { publicJobTeaser } from "@/server/jobs/teaser";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const jobTeaser = await publicJobTeaser(next);
  return (
    <Suspense fallback={null}>
      <AuthForm mode="sign-in" jobTeaser={jobTeaser} />
    </Suspense>
  );
}
