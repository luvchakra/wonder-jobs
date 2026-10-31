"use client";
import type { ComponentProps } from "react";
import { Act as SharedAct } from "@/wonderworks/pipeline/Act";

/** Co-founders' press that reaches someone: WonderWorks' Act (wonderworks/pipeline/Act.tsx) with this module's settings page. */
export function Act(props: Omit<ComponentProps<typeof SharedAct>, "settings">) {
  return <SharedAct {...props} settings={{ href: "/app/m/cofounders/you/profile#settings", label: "Co-founders → You" }} />;
}
