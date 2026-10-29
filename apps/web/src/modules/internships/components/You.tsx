"use client";
import { useState, useSyncExternalStore } from "react";
import { Building2, GraduationCap, Zap } from "lucide-react";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { YouOverview } from "@/wonderworks/you/YouOverview";
import { Button } from "@/components/common/Button";
import { Field, Input, Segmented } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { CAPABILITY_META, type PolicyMode } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { useCareerStore } from "@/store/career";
import { cleanProfile, profileFromCareer, type StudentProfile } from "../domain";
import { selectProfile, useInternshipsStore } from "../store";

const noop = () => () => undefined;

const MODE_LABEL: Record<PolicyMode, string> = { automatic: "Automatic", ask: "Ask me", off: "Off" };

/**
 * Internships → You (WJ-418, WJ-421): Jobs' You page — the Career Profile and its rows — with Internships' own rows in
 * the same style: the student's details, the one setting this module adds (internships.apply) and posting internships.
 */
export function InternshipsYou() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useInternshipsStore(selectProfile);
  const mode = useAutomationStore((s) => s.policy["internships.apply"]) ?? "ask";
  const details = mounted && saved ? [saved.college, saved.course].filter(Boolean).join(" · ") : "";
  return (
    <YouOverview
      module={{
        label: "Internships",
        rows: [
          { href: "/app/m/internships/you/profile", label: "Your details", value: details || "Add them", icon: GraduationCap },
          { href: "/app/m/internships/you/profile#apply", label: CAPABILITY_META["internships.apply"].label, value: mounted ? MODE_LABEL[mode] : "", icon: Zap },
          { href: "/app/m/internships/company", label: "Post internships", value: "For companies", icon: Building2 },
        ],
      }}
    />
  );
}

/**
 * The student's Internships details — college, course, graduation year and when they can intern — prefilled from their
 * Career Profile's education when it has one (read only; nothing is written back to it), and asked otherwise; and the
 * one setting this module adds.
 */
export function InternshipsProfile() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useInternshipsStore(selectProfile);
  const dna = useCareerStore((s) => s.dna);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your Internships details" back={{ href: "/app/m/internships/you", label: "You" }} />
      {mounted && <ProfileForm key={saved ? "saved" : "new"} initial={saved ?? profileFromCareer(dna)} />}
    </div>
  );
}

function ProfileForm({ initial }: { initial: StudentProfile }) {
  const [p, setP] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const mode = useAutomationStore((s) => s.policy["internships.apply"]) ?? "ask";
  const setCapability = useAutomationStore((s) => s.setCapability);
  const set = (patch: Partial<StudentProfile>) => setP((x) => ({ ...x, ...patch }));
  const save = () => {
    const c = cleanProfile(p);
    if ("problem" in c) return setProblem(c.problem);
    setProblem(null);
    useInternshipsStore.getState().setPersona({ ...c.value });
    setP(c.value);
    toast.success("Saved", "Applications use these details.");
  };
  return (
    <div className="space-y-3">
      <form
        className="wj-card space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {initial.from === "career_profile" && <p className="text-[12.5px] text-ink-3">Filled from your Career Profile&apos;s education. Check it and add when you&apos;re available.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="College" htmlFor="ip-college" required>
            <Input id="ip-college" value={p.college} onChange={(e) => set({ college: e.target.value })} />
          </Field>
          <Field label="Course" htmlFor="ip-course" required>
            <Input id="ip-course" value={p.course} onChange={(e) => set({ course: e.target.value })} />
          </Field>
          <Field label="Graduation year" htmlFor="ip-year" required>
            <Input id="ip-year" inputMode="numeric" value={p.graduationYear ?? ""} onChange={(e) => set({ graduationYear: Number(e.target.value) || undefined })} />
          </Field>
          <div />
          <Field label="Available from" htmlFor="ip-from" required>
            <Input id="ip-from" type="date" value={p.availableFrom ?? ""} onChange={(e) => set({ availableFrom: e.target.value || undefined })} />
          </Field>
          <Field label="Available to" htmlFor="ip-to" required>
            <Input id="ip-to" type="date" value={p.availableTo ?? ""} onChange={(e) => set({ availableTo: e.target.value || undefined })} />
          </Field>
        </div>
        {problem && <p className="text-[13px] text-danger-600">{problem}</p>}
        <Button type="submit" full>
          Save
        </Button>
      </form>
      <section id="apply" aria-label={CAPABILITY_META["internships.apply"].label} className="wj-card scroll-mt-24 space-y-3 p-4">
        <h2 className="text-[15px] font-semibold text-ink">{CAPABILITY_META["internships.apply"].label}</h2>
        <p className="text-[13px] text-ink-3">{CAPABILITY_META["internships.apply"].description}</p>
        <Segmented<PolicyMode> label={CAPABILITY_META["internships.apply"].label} value={mode} onChange={(v) => setCapability("internships.apply", v)} options={[{ value: "automatic", label: "Automatic" }, { value: "ask", label: "Ask me" }, { value: "off", label: "Off" }]} />
      </section>
    </div>
  );
}
