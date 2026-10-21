import type { Metadata } from "next";
import { PRIVATE_PAGE } from "@/lib/robots";
import { OnboardingFlow } from "@/components/career/OnboardingFlow";

export const metadata: Metadata = { title: "Get started", ...PRIVATE_PAGE };

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
