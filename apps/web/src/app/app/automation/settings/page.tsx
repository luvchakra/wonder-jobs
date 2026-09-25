"use client";
import { ShieldCheck } from "lucide-react";
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
      <PageHeader
        title="What Wonder can do"
        description="Wonder can automate the repetitive work. You decide what it is allowed to do."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetPolicy();
              toast.success("Defaults restored");
            }}
          >
            Restore defaults
          </Button>
        }
      />
      <Card className="mb-5 flex items-start gap-4 border-brand-200 bg-brand-50/50">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-[17px] font-semibold text-ink">You&apos;re in control.</h2>
          <p className="mt-1 text-[14px] text-ink-2">Anything set to <strong>Ask me</strong> pauses the run and waits for you. Anything set to <strong>Automatic</strong> still shows up in the run log with full evidence. Nothing is ever sent to an employer without an explicit approval unless you turn that on yourself.</p>
        </div>
      </Card>
      <Card className="mb-5">
        <h2 className="mb-1 text-[15px] font-semibold text-ink">Default automation level</h2>
        <p className="mb-3 text-[12px] text-ink-3">Used when you start a run. You can change it per run.</p>
        <AutomationLevelSelector value={defaultLevel} onChange={setDefaultLevel} compact />
      </Card>
      <Card>
        <h2 className="mb-1 text-[15px] font-semibold text-ink">What Wonder may do</h2>
        <p className="mb-4 text-[12px] text-ink-3">Changes apply to your next run and to scheduled searches. Runs already in progress keep the policy they started with for the current stage.</p>
        <AutomationPolicyEditor policy={policy} onChange={setCapability} />
      </Card>
    </div>
  );
}
