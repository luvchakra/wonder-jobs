"use client";
import { useState, useSyncExternalStore } from "react";
import { CalendarHeart, MapPin, Zap } from "lucide-react";
import { CAPABILITY_META, type Capability, type PolicyMode } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { YouOverview } from "@/wonderworks/you/YouOverview";
import { Button } from "@/components/common/Button";
import { Chip, Field, Input, Segmented } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { CATEGORIES, cleanPersona, EMPTY_PERSONA, type Persona } from "../domain";
import { selectPersona, useEventsStore } from "../store";

const noop = () => () => undefined;
const MODE_TEXT: Record<PolicyMode, string> = { automatic: "Automatic", ask: "Ask me", off: "Off" };
const SETTINGS = ["events.rsvp", "events.promote", "events.cancel"] as const satisfies readonly Capability[];

/** Events → You: Jobs' You page with this module's rows under it: your interests and city, and hosting an event. */
export function EventsYou() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useEventsStore(selectPersona);
  const policy = useAutomationStore((s) => s.policy["events.rsvp"]) ?? "automatic";
  const value = mounted && saved ? [saved.interests.slice(0, 2).join(", "), saved.city].filter(Boolean).join(" · ") || "Saved" : "Add them";
  return (
    <YouOverview
      module={{
        label: "Events & Social",
        rows: [
          { href: "/app/m/events/you/profile", label: "Your interests and city", value, icon: MapPin },
          { href: "/app/m/events/you/profile#settings", label: CAPABILITY_META["events.rsvp"].label, value: mounted ? MODE_TEXT[policy] : "", icon: Zap },
          { href: "/app/m/events/company", label: "Host an event", value: "For organisers", icon: CalendarHeart },
        ],
      }}
    />
  );
}

/** The person's interests and city, in their own words, and the three settings this module adds. */
export function EventsProfile() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useEventsStore(selectPersona);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your Events details" back={{ href: "/app/m/events/you", label: "You" }} />
      {mounted && <PersonaForm key={saved ? "saved" : "new"} initial={saved ?? EMPTY_PERSONA} />}
      {mounted && <Settings />}
    </div>
  );
}

function PersonaForm({ initial }: { initial: Persona }) {
  const [interests, setInterests] = useState(initial.interests);
  const [more, setMore] = useState(initial.interests.filter((i) => !(CATEGORIES as readonly string[]).includes(i)).join(", "));
  const [city, setCity] = useState(initial.city);
  const save = () => {
    const typed = more.split(",").map((x) => x.trim()).filter(Boolean);
    const c = cleanPersona({ interests: [...interests.filter((i) => (CATEGORIES as readonly string[]).includes(i)), ...typed], city });
    if ("problem" in c) return toast.error("Check it", c.problem);
    useEventsStore.getState().setPersona({ ...c.value });
    toast.success("Saved", "Each event says whether it fits these.");
  };
  return (
    <form
      className="wj-card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="text-[13px] text-ink-3">Only these two are compared with an event. Nothing is guessed.</p>
      <Field label="Interests">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={interests.includes(c)} onClick={() => setInterests((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))}>
              {c}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Anything else you're into" htmlFor="ev-more" hint="Separate with commas">
        <Input id="ev-more" value={more} onChange={(e) => setMore(e.target.value)} placeholder="Chess, trekking" />
      </Field>
      <Field label="City" htmlFor="ev-city">
        <Input id="ev-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Pune" />
      </Field>
      <Button type="submit" full>
        Save
      </Button>
    </form>
  );
}

/** The settings this module adds: whether RSVP, a waitlist seat and Cancel act at once (resolveCapability). */
function Settings() {
  const policy = useAutomationStore((s) => s.policy);
  const setCapability = useAutomationStore((s) => s.setCapability);
  return (
    <section id="settings" aria-label="Events settings" className="wj-card mt-3 scroll-mt-24 space-y-4 p-4">
      {SETTINGS.map((key) => {
        const meta = CAPABILITY_META[key];
        return (
          <div key={key} className="space-y-2">
            <h2 className="text-[15px] font-semibold text-ink">{meta.label}</h2>
            <p className="text-[13px] text-ink-3">{meta.description}</p>
            <Segmented<PolicyMode> label={meta.label} value={policy[key] ?? "automatic"} onChange={(v) => setCapability(key, v)} options={[{ value: "automatic", label: "Automatic" }, { value: "ask", label: "Ask me" }, { value: "off", label: "Off" }]} />
          </div>
        );
      })}
    </section>
  );
}
