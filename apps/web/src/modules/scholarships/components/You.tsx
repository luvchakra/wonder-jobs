"use client";
import { useState, useSyncExternalStore } from "react";
import { Building2, GraduationCap, Sparkles, Zap } from "lucide-react";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { YouOverview } from "@/wonderworks/you/YouOverview";
import { useResumeRow } from "@/wonderworks/you/useResumeRow";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Field, Input, Segmented, Select } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { CAPABILITY_META, type Capability, type PolicyMode } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { CATEGORIES, cleanProfile, EMPTY_PROFILE, GENDER_LABEL, LEVEL_LABEL, LEVELS, type Gender, type Level, type StudentProfile } from "../domain";
import { selectProfile, useScholarshipsStore } from "../store";

const noop = () => () => undefined;
const MODE_LABEL: Record<PolicyMode, string> = { automatic: "Automatic", ask: "Ask me", off: "Off" };

/**
 * Scholarships & Projects → You: Jobs' You page — the Career Profile and its rows — with this module's own rows: the
 * student's details, My Resume (WonderWorks' row), the settings it adds (scholarships.apply, scholarships.draft) and
 * posting scholarships and projects.
 */
export function ScholarshipsYou() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useScholarshipsStore(selectProfile);
  const apply = useAutomationStore((s) => s.policy["scholarships.apply"]) ?? "ask";
  const draft = useAutomationStore((s) => s.policy["scholarships.draft"]) ?? "ask";
  const details = mounted && saved ? [saved.level ? LEVEL_LABEL[saved.level] : null, saved.field].filter(Boolean).join(" · ") : "";
  const resume = useResumeRow();
  return (
    <YouOverview
      module={{
        label: "Scholarships & Projects",
        rows: [
          { href: "/app/m/scholarships/you/profile", label: "Your details", value: details || "Add them", icon: GraduationCap },
          { ...resume, value: mounted ? resume.value : "" },
          { href: "/app/m/scholarships/you/profile#apply", label: CAPABILITY_META["scholarships.apply"].label, value: mounted ? MODE_LABEL[apply] : "", icon: Zap },
          { href: "/app/m/scholarships/you/profile#draft", label: CAPABILITY_META["scholarships.draft"].label, value: mounted ? MODE_LABEL[draft] : "", icon: Sparkles },
          { href: "/app/m/scholarships/company", label: "Post scholarships and projects", value: "For organisations", icon: Building2 },
        ],
      }}
    />
  );
}

/** The student's details, asked (never inferred), and this module's settings. */
export function ScholarshipsProfile() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useScholarshipsStore(selectProfile);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your Scholarships & Projects details" back={{ href: "/app/m/scholarships/you", label: "You" }} />
      {mounted && <ProfileForm key={saved ? "saved" : "new"} initial={saved ?? EMPTY_PROFILE} />}
    </div>
  );
}

function Setting({ capability, id }: { capability: Capability; id: string }) {
  const mode = useAutomationStore((s) => s.policy[capability]) ?? "ask";
  const setCapability = useAutomationStore((s) => s.setCapability);
  const meta = CAPABILITY_META[capability];
  return (
    <section id={id} aria-label={meta.label} className="wj-card scroll-mt-24 space-y-3 p-4">
      <h2 className="text-[15px] font-semibold text-ink">{meta.label}</h2>
      <p className="text-[13px] text-ink-3">{meta.description}</p>
      <Segmented<PolicyMode> label={meta.label} value={mode} onChange={(v) => setCapability(capability, v)} options={[{ value: "automatic", label: "Automatic" }, { value: "ask", label: "Ask me" }, { value: "off", label: "Off" }]} />
    </section>
  );
}

function ProfileForm({ initial }: { initial: StudentProfile }) {
  const [p, setP] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<StudentProfile>) => setP((x) => ({ ...x, ...patch }));
  const save = () => {
    const c = cleanProfile(p);
    if ("problem" in c) return setProblem(c.problem);
    setProblem(null);
    useScholarshipsStore.getState().setPersona({ ...c.value });
    setP(c.value);
    toast.success("Saved", "Matching and applications use these details.");
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Level" htmlFor="sp-level" required>
            <Select id="sp-level" value={p.level ?? ""} onChange={(e) => set({ level: (e.target.value || undefined) as Level | undefined })}>
              <option value="">Choose</option>
              {LEVELS.map((v) => (
                <option key={v} value={v}>
                  {LEVEL_LABEL[v]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Course or field" htmlFor="sp-field" required>
            <Input id="sp-field" value={p.field} onChange={(e) => set({ field: e.target.value })} />
          </Field>
          <Field label="School or college" htmlFor="sp-inst" required>
            <Input id="sp-inst" value={p.institution} onChange={(e) => set({ institution: e.target.value })} />
          </Field>
          <Field label="State and country (optional)" htmlFor="sp-region">
            <Input id="sp-region" value={p.region} onChange={(e) => set({ region: e.target.value })} />
          </Field>
          <Field label="Latest marks % (optional)" htmlFor="sp-marks">
            <Input id="sp-marks" inputMode="numeric" value={p.marks ?? ""} onChange={(e) => set({ marks: e.target.value === "" ? undefined : Number(e.target.value.replace(/[^\d]/g, "")) })} />
          </Field>
        </div>
        {p.level === "school" && (
          <label className="flex items-start gap-2 text-[13px] text-ink-2">
            <input type="checkbox" className="mt-0.5" checked={!!p.guardianConsent} onChange={(e) => set({ guardianConsent: e.target.checked || undefined })} />A parent or guardian knows I use Scholarships & Projects and agrees.
          </label>
        )}
        <Fold title="Income, gender and category (optional)" hint={p.sensitiveConsent ? "Used to match" : "Not used"}>
          <label className="flex items-start gap-2 text-[13px] text-ink-2">
            <input type="checkbox" className="mt-0.5" checked={!!p.sensitiveConsent} onChange={(e) => set({ sensitiveConsent: e.target.checked || undefined })} />
            Use these only to match me. Never sent to a provider unless I choose to share them when applying.
          </label>
          {p.sensitiveConsent && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Family income a year" htmlFor="sp-income">
                <Input id="sp-income" inputMode="numeric" value={p.incomeBand ?? ""} onChange={(e) => set({ incomeBand: e.target.value === "" ? undefined : Number(e.target.value.replace(/[^\d]/g, "")) })} />
              </Field>
              <Field label="Gender" htmlFor="sp-gender">
                <Select id="sp-gender" value={p.gender ?? ""} onChange={(e) => set({ gender: (e.target.value || undefined) as Gender | undefined })}>
                  <option value="">Prefer not to say</option>
                  {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
                    <option key={g} value={g}>
                      {GENDER_LABEL[g]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Category" htmlFor="sp-cat">
                <Select id="sp-cat" value={p.category ?? ""} onChange={(e) => set({ category: e.target.value || undefined })}>
                  <option value="">Prefer not to say</option>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
        </Fold>
        {problem && <p className="text-[13px] text-danger-600">{problem}</p>}
        <Button type="submit" full>
          Save
        </Button>
      </form>
      <Setting capability="scholarships.apply" id="apply" />
      <Setting capability="scholarships.draft" id="draft" />
    </div>
  );
}
