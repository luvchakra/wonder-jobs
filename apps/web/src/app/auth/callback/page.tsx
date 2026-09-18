import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCallback } from "@/components/auth/AuthCallback";

export const metadata: Metadata = { title: "Signing you in" };

/** Landing spot for email confirmation and magic links: exchanges the code for a session. */
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallback />
    </Suspense>
  );
}
