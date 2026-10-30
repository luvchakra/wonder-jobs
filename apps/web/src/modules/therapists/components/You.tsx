"use client";
import { useState, useSyncExternalStore } from "react";
import { Briefcase, Languages } from "lucide-react";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { YouOverview } from "@/wonderworks/you/YouOverview";
import { Button } from "@/components/common/Button";
import { Chip, Field, Input, Segmented } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { cleanProfile, EMPTY_PROFILE, LANGUAGES, MODE_LABEL, MODES, type ClientProfile, type Mode } from "../domain";
import { selectProfile, useTherapistsStore } from "../store";

const noop = () => () => undefined;

/** Therapists → You: Jobs' You page with this module's rows under it: your preferences, and listing yourself (for practitioners). */
export function TherapistsYou() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useTherapistsStore(selectProfile);
  const value = mounted && saved ? [saved.languages.join(", "), saved.mode ? MODE_LABEL[saved.mode] : ""].filter(Boolean).join(" · ") || "Saved" : "Add them";
  return (
    <YouOverview
      module={{
        label: "Therapists",
        rows: [
          { href: "/app/m/therapists/you/profile", label: "Your preferences", value, icon: Languages },
          { href: "/app/m/therapists/company", label: "List yourself", value: "For practitioners", icon: Briefcase },
        ],
      }}
    />
  );
}

/** The client's language, way of meeting and budget, their own words. Nothing about why they want therapy is asked or kept. */
export function TherapistsProfile() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useTherapistsStore(selectProfile);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your Therapists preferences" back={{ href: "/app/m/therapists/you", label: "You" }} />
      {mounted && <PreferencesForm key={saved ? "saved" : "new"} initial={saved ?? EMPTY_PROFILE} />}
    </div>
  );
}

function PreferencesForm({ initial }: { initial: ClientProfile }) {
  const [languages, setLanguages] = useState(initial.languages);
  const [mode, setMode] = useState<Mode | "">(initial.mode);
  const [budget, setBudget] = useState(initial.budget?.toString() ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const save = () => {
    const b = budget.trim() ? Number(budget.replace(/[^\d]/g, "")) : undefined;
    const c = cleanProfile({ languages, mode, budget: b });
    if ("problem" in c) return setProblem(c.problem);
    setProblem(null);
    useTherapistsStore.getState().setPersona({ ...c.value });
    toast.success("Saved", "Each card says whether the practitioner fits these.");
  };
  return (
    <form
      className="wj-card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="text-[13px] text-ink-3">Only these three are compared with a practitioner&apos;s listing. We never ask why you&apos;re looking.</p>
      <Field label="Languages">
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <Chip key={l} active={languages.includes(l)} onClick={() => setLanguages((x) => (x.includes(l) ? x.filter((y) => y !== l) : [...x, l]))}>
              {l}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="How you'd like to meet">
        <Segmented<Mode | ""> label="How you'd like to meet" value={mode} onChange={setMode} options={[{ value: "", label: "Either" }, ...MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))]} />
      </Field>
      <Field label="Most you'd pay for a session" htmlFor="th-budget" hint="Whole rupees">
        <Input id="th-budget" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="2000" />
      </Field>
      {problem && <p className="text-[13px] text-danger-600">{problem}</p>}
      <Button type="submit" full>
        Save
      </Button>
    </form>
  );
}
