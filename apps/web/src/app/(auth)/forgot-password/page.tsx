import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/auth/PasswordReset";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
