"use client";
import { useState, useSyncExternalStore } from "react";
import { Briefcase, MapPin, Zap } from "lucide-react";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { YouOverview } from "@/wonderworks/you/YouOverview";
import { Button } from "@/components/common/Button";
import { Field, Input, Segmented } from "@/components/common/Input";
import { CAPABILITY_META, type PolicyMode } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { toast } from "@/components/feedback/Toast";
import { cleanProfile, EMPTY_PROFILE, type ClientProfile } from "../domain";
import { selectProfile, useServicesStore } from "../store";

const noop = () => () => undefined;
const MODE_LABEL: Record<PolicyMode, string> = { automatic: "Automatic", ask: "Ask me", off: "Off" };

/** Talent & Services → You: Jobs' You page with this module's rows under it: the client's area, and listing services (for pros). */
export function ServicesYou() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useServicesStore(selectProfile);
  const mode = useAutomationStore((s) => s.policy["services.request_quote"]) ?? "ask";
  return (
    <YouOverview
      module={{
        label: "Talent & Services",
        rows: [
          { href: "/app/m/services/you/profile", label: "Your area", value: (mounted && saved?.area) || "Add it", icon: MapPin },
          { href: "/app/m/services/you/profile#settings", label: CAPABILITY_META["services.request_quote"].label, value: mounted ? MODE_LABEL[mode] : "", icon: Zap },
          { href: "/app/m/services/company", label: "Offer your services", value: "For pros", icon: Briefcase },
        ],
      }}
    />
  );
}

/** The client's city or pin code, their own words: pros' service areas are compared with it. */
export function ServicesProfile() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useServicesStore(selectProfile);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your Talent & Services details" back={{ href: "/app/m/services/you", label: "You" }} />
      {mounted && <AreaForm key={saved ? "saved" : "new"} initial={saved ?? EMPTY_PROFILE} />}
      {mounted && <Settings />}
    </div>
  );
}

function AreaForm({ initial }: { initial: ClientProfile }) {
  const [area, setArea] = useState(initial.area);
  const [problem, setProblem] = useState<string | null>(null);
  const save = () => {
    const c = cleanProfile({ area });
    if ("problem" in c) return setProblem(c.problem);
    setProblem(null);
    useServicesStore.getState().setPersona({ ...c.value });
    toast.success("Saved", "Each pro's card says whether they serve this area.");
  };
  return (
    <form
      className="wj-card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Your city or pin code" htmlFor="sv-area" hint="Compared with the areas a pro says they serve" required>
        <Input id="sv-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Pune, or 411001" />
      </Field>
      {problem && <p className="text-[13px] text-danger-600">{problem}</p>}
      <Button type="submit" full>
        Save
      </Button>
    </form>
  );
}

/** The two settings this module adds, in one card: requesting quotes and booking (resolveCapability). */
function Settings() {
  const policy = useAutomationStore((s) => s.policy);
  const setCapability = useAutomationStore((s) => s.setCapability);
  return (
    <section id="settings" aria-label="Talent & Services settings" className="wj-card mt-3 scroll-mt-24 space-y-4 p-4">
      {(["services.request_quote", "services.book"] as const).map((cap) => (
        <div key={cap} className="space-y-2">
          <h2 className="text-[15px] font-semibold text-ink">{CAPABILITY_META[cap].label}</h2>
          <p className="text-[13px] text-ink-3">{CAPABILITY_META[cap].description}</p>
          <Segmented<PolicyMode> label={CAPABILITY_META[cap].label} value={policy[cap] ?? "ask"} onChange={(v) => setCapability(cap, v)} options={[{ value: "automatic", label: "Automatic" }, { value: "ask", label: "Ask me" }, { value: "off", label: "Off" }]} />
        </div>
      ))}
    </section>
  );
}
