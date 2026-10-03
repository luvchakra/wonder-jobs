"use client";
import { ChevronDown } from "lucide-react";
import { useAutomationStore } from "@/store/automation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { AutomationPolicyEditor } from "@/components/automation/AutomationPolicy";
import { AutomationLevelSelector } from "@/components/automation/AutomationLevelSelector";
import { toast } from "@/components/feedback/Toast";

export default function AutomationSettingsPage() {
  const policy = useAutomationStore((s) => s.policy);
  const setCapability = useAutomationStore((s) => s.setCapability);
  const resetPolicy = useAutomationStore((s) => s.resetPolicy);
  const defaultLevel = useAutomationStore((s) => s.defaultLevel);
  const setDefaultLevel = useAutomationStore((s) => s.setDefaultLevel);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="What Wonder can do" description="How much Wonder does on its own. Anything set to Ask me waits for you; Wonder never submits an application for you — that's always your click, on the employer's site." />
      <Card className="mb-4">
        <AutomationLevelSelector value={defaultLevel} onChange={setDefaultLevel} compact />
      </Card>
      <details className="wj-card group">
        <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink">Fine-tune each action</span>
            <span className="block text-[12px] text-ink-3">Automatic, Ask me or Off for each thing Wonder can do</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-ink-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-4">
          <AutomationPolicyEditor policy={policy} onChange={setCapability} />
          <Button
            className="mt-4"
            variant="ghost"
            size="sm"
            onClick={() => {
              resetPolicy();
              toast.success("Defaults restored");
            }}
          >
            Restore defaults
          </Button>
        </div>
      </details>
    </div>
  );
}
