"use client";
import { CAPABILITIES, CAPABILITY_META, type AutomationPolicy as Policy, type Capability, type PolicyMode } from "@/domain/automation/policy";
import { Badge } from "@/components/common/Badge";
import { Segmented } from "@/components/common/Input";
import { cn } from "@/lib/cn";

const GROUPS: { title: string; blurb: string; risk: "low" | "medium" | "high" }[] = [
  { title: "Routine work", blurb: "Low risk. Nothing leaves your account.", risk: "low" },
  { title: "Drafting", blurb: "Medium risk. Wonder writes; you review before anything is used.", risk: "medium" },
  { title: "Actions with outside effects", blurb: "High risk. Contacting employers or changing your profile. Ask me is the default.", risk: "high" },
];

/** The boundary of what Wonder may do without asking (spec §12). */
export function AutomationPolicyEditor({ policy, onChange, className }: { policy: Policy; onChange: (c: Capability, m: PolicyMode) => void; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {GROUPS.map((g) => (
        <section key={g.risk} aria-labelledby={`policy-${g.risk}`}>
          <div className="mb-2 flex items-center gap-2">
            <h3 id={`policy-${g.risk}`} className="text-[14px] font-semibold text-ink">
              {g.title}
            </h3>
            <Badge tone={g.risk === "low" ? "success" : g.risk === "medium" ? "warning" : "danger"}>{g.risk} risk</Badge>
          </div>
          <p className="mb-2 text-[12px] text-ink-3">{g.blurb}</p>
          <ul className="divide-y divide-line rounded-[16px] border border-line bg-surface">
            {CAPABILITIES.filter((c) => CAPABILITY_META[c].risk === g.risk).map((c) => {
              const meta = CAPABILITY_META[c];
              return (
                <li key={c} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-ink">
                      {meta.label}
                      {meta.external && <span className="ml-2 text-[11px] font-normal text-ink-4">external</span>}
                    </p>
                    <p className="text-[12px] text-ink-3">{meta.description}</p>
                  </div>
                  <Segmented<PolicyMode> label={`${meta.label} permission`} size="sm" value={policy[c]} onChange={(m) => onChange(c, m)} options={[{ value: "automatic", label: "Automatic" }, { value: "ask", label: "Ask me" }, { value: "off", label: "Off" }]} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
