import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/career/OnboardingFlow";

export const metadata: Metadata = { title: "Get started" };

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
