"use client";
import { useState, useSyncExternalStore } from "react";
import { MapPin, Store, Zap } from "lucide-react";
import { CAPABILITY_META, type Capability, type PolicyMode } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { YouOverview } from "@/wonderworks/you/YouOverview";
import { Button } from "@/components/common/Button";
import { Field, Input, Segmented } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { cleanPersona, EMPTY_PERSONA, type Persona } from "../domain";
import { selectPersona, useMarketplaceStore } from "../store";

const noop = () => () => undefined;
const MODE_TEXT: Record<PolicyMode, string> = { automatic: "Automatic", ask: "Ask me", off: "Off" };
const SETTINGS = ["marketplace.message", "marketplace.offer", "marketplace.accept", "marketplace.share_contact", "marketplace.publish"] as const satisfies readonly Capability[];

/** Buy, Sell & Rent → You: Jobs' You page with this module's rows under it: your area, the settings, and My listings. */
export function MarketplaceYou() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useMarketplaceStore(selectPersona);
  const policy = useAutomationStore((s) => s.policy["marketplace.offer"]) ?? "ask";
  return (
    <YouOverview
      module={{
        label: "Buy, Sell & Rent",
        rows: [
          { href: "/app/m/marketplace/you/profile", label: "Your area", value: mounted && saved?.area ? saved.area : "Add it", icon: MapPin },
          { href: "/app/m/marketplace/you/profile#settings", label: CAPABILITY_META["marketplace.offer"].label, value: mounted ? MODE_TEXT[policy] : "", icon: Zap },
          { href: "/app/m/marketplace/company", label: "My listings", value: "Sell something", icon: Store },
        ],
      }}
    />
  );
}

/** The person's area, in their own words, and the settings this module adds. */
export function MarketplaceProfile() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useMarketplaceStore(selectPersona);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your Buy, Sell & Rent details" back={{ href: "/app/m/marketplace/you", label: "You" }} />
      {mounted && <AreaForm key={saved ? "saved" : "new"} initial={saved ?? EMPTY_PERSONA} />}
      {mounted && <Settings />}
    </div>
  );
}

function AreaForm({ initial }: { initial: Persona }) {
  const [area, setArea] = useState(initial.area);
  return (
    <form
      className="wj-card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const c = cleanPersona({ area });
        if ("problem" in c) return toast.error("Check it", c.problem);
        useMarketplaceStore.getState().setPersona({ ...c.value });
        toast.success("Saved", "Each listing says whether it's in your area.");
      }}
    >
      <p className="text-[13px] text-ink-3">Only your area is compared with a listing. Nothing is guessed.</p>
      <Field label="Area" htmlFor="mk-area">
        <Input id="mk-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Indiranagar, Bengaluru" />
      </Field>
      <Button type="submit" full>
        Save
      </Button>
    </form>
  );
}

/** The settings this module adds: whether each press that reaches someone acts at once (resolveCapability). */
function Settings() {
  const policy = useAutomationStore((s) => s.policy);
  const setCapability = useAutomationStore((s) => s.setCapability);
  return (
    <section id="settings" aria-label="Buy, Sell & Rent settings" className="wj-card mt-3 scroll-mt-24 space-y-4 p-4">
      {SETTINGS.map((key) => {
        const meta = CAPABILITY_META[key];
        return (
          <div key={key} className="space-y-2">
            <h2 className="text-[15px] font-semibold text-ink">{meta.label}</h2>
            <p className="text-[13px] text-ink-3">{meta.description}</p>
            <Segmented<PolicyMode> label={meta.label} value={policy[key] ?? meta.default} onChange={(v) => setCapability(key, v)} options={[{ value: "automatic", label: "Automatic" }, { value: "ask", label: "Ask me" }, { value: "off", label: "Off" }]} />
          </div>
        );
      })}
    </section>
  );
}
