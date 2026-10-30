"use client";
import { useState, useSyncExternalStore } from "react";
import { BookOpen, Building2, Zap } from "lucide-react";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { YouOverview } from "@/wonderworks/you/YouOverview";
import { useResumeRow } from "@/wonderworks/you/useResumeRow";
import { Button } from "@/components/common/Button";
import { Chip, Field, Input, Segmented } from "@/components/common/Input";
import { CAPABILITY_META, type PolicyMode } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { toast } from "@/components/feedback/Toast";
import { BOARDS, cleanProfile, EMPTY_PROFILE, GRADE_LABEL, GRADES, QUALIFICATIONS, type TeacherProfile } from "../domain";
import { selectProfile, useTeachingStore } from "../store";

const noop = () => () => undefined;
const MODE_LABEL: Record<PolicyMode, string> = { automatic: "Automatic", ask: "Ask me", off: "Off" };
const words = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/**
 * Teaching → You: Jobs' You page — the Career Profile and its rows — with Teaching's own rows in the same style: the
 * teacher's details, My Resume (WonderWorks' row, as on Jobs), the setting this module adds (teaching.apply) and
 * posting teaching jobs.
 */
export function TeachingYou() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useTeachingStore(selectProfile);
  const resume = useResumeRow();
  const mode = useAutomationStore((s) => s.policy["teaching.apply"]) ?? "ask";
  return (
    <YouOverview
      module={{
        label: "Teaching",
        rows: [
          { href: "/app/m/teaching/you/profile", label: "Your details", value: (mounted && saved?.subjects.join(", ")) || "Add them", icon: BookOpen },
          { ...resume, value: mounted ? resume.value : "" },
          { href: "/app/m/teaching/you/profile#apply", label: CAPABILITY_META["teaching.apply"].label, value: mounted ? MODE_LABEL[mode] : "", icon: Zap },
          { href: "/app/m/teaching/company", label: "Post teaching jobs", value: "For schools", icon: Building2 },
        ],
      }}
    />
  );
}

/** The teacher's Teaching details — subjects, grade levels, boards, qualifications and languages, their own words — and the setting this module adds. */
export function TeachingProfile() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useTeachingStore(selectProfile);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your Teaching details" back={{ href: "/app/m/teaching/you", label: "You" }} />
      {mounted && <ProfileForm key={saved ? "saved" : "new"} initial={saved ?? EMPTY_PROFILE} />}
      {mounted && <ApplySetting />}
    </div>
  );
}

function ProfileForm({ initial }: { initial: TeacherProfile }) {
  const [p, setP] = useState(initial);
  const [subjects, setSubjects] = useState(initial.subjects.join(", "));
  const [languages, setLanguages] = useState(initial.languages.join(", "));
  const [problem, setProblem] = useState<string | null>(null);
  const save = () => {
    const c = cleanProfile({ ...p, subjects: words(subjects), languages: words(languages) });
    if ("problem" in c) return setProblem(c.problem);
    setProblem(null);
    useTeachingStore.getState().setPersona({ ...c.value });
    setP(c.value);
    toast.success("Saved", "Find and your matches use these details.");
  };
  return (
    <form
      className="wj-card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Subjects you teach" htmlFor="tp-subjects" hint="Separate them with commas" required>
        <Input id="tp-subjects" value={subjects} onChange={(e) => setSubjects(e.target.value)} placeholder="Physics, Mathematics" />
      </Field>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-2">Grade levels *</legend>
        <div className="flex flex-wrap gap-1.5">
          {GRADES.map((g) => (
            <Chip key={g} active={p.grades.includes(g)} onClick={() => setP((x) => ({ ...x, grades: toggle(x.grades, g) }))}>
              {GRADE_LABEL[g]}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-2">Boards you know</legend>
        <div className="flex flex-wrap gap-1.5">
          {BOARDS.map((b) => (
            <Chip key={b} active={p.boards.includes(b)} onClick={() => setP((x) => ({ ...x, boards: toggle(x.boards, b) }))}>
              {b}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-2">Qualifications you hold</legend>
        <div className="flex flex-wrap gap-1.5">
          {QUALIFICATIONS.map((q) => (
            <Chip key={q} active={p.qualifications.includes(q)} onClick={() => setP((x) => ({ ...x, qualifications: toggle(x.qualifications, q) }))}>
              {q}
            </Chip>
          ))}
        </div>
      </fieldset>
      <Field label="Languages you teach in" htmlFor="tp-langs" hint="Separate them with commas">
        <Input id="tp-langs" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="English, Hindi" />
      </Field>
      {problem && <p className="text-[13px] text-danger-600">{problem}</p>}
      <Button type="submit" full>
        Save
      </Button>
    </form>
  );
}

/** The two settings this module adds, in one card: applying and requesting demo classes (resolveCapability). */
function ApplySetting() {
  const policy = useAutomationStore((s) => s.policy);
  const setCapability = useAutomationStore((s) => s.setCapability);
  return (
    <section id="apply" aria-label="Teaching settings" className="wj-card mt-3 scroll-mt-24 space-y-4 p-4">
      {(["teaching.apply", "teaching.book_demo"] as const).map((cap) => (
        <div key={cap} className="space-y-2">
          <h2 className="text-[15px] font-semibold text-ink">{CAPABILITY_META[cap].label}</h2>
          <p className="text-[13px] text-ink-3">{CAPABILITY_META[cap].description}</p>
          <Segmented<PolicyMode> label={CAPABILITY_META[cap].label} value={policy[cap] ?? "ask"} onChange={(v) => setCapability(cap, v)} options={[{ value: "automatic", label: "Automatic" }, { value: "ask", label: "Ask me" }, { value: "off", label: "Off" }]} />
        </div>
      ))}
    </section>
  );
}
