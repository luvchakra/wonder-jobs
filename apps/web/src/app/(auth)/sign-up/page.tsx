import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
