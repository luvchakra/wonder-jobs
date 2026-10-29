"use client";
import { useState, useSyncExternalStore } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Field, Input, Segmented } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { CAPABILITY_META, type PolicyMode } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { useCareerStore } from "@/store/career";
import { cleanProfile, profileFromCareer, type StudentProfile } from "../domain";
import { selectProfile, useInternshipsStore } from "../store";

const noop = () => () => undefined;

/**
 * Internships → You (WJ-417): the student's profile — college, course, graduation year and when they can intern —
 * prefilled from their Career Profile's education when it has one (read only; nothing is written back to it), and
 * asked otherwise. Below it, the one setting this module adds (internships.apply) and, folded, posting internships
 * as a company.
 */
export function InternshipsYou() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useInternshipsStore(selectProfile);
  const dna = useCareerStore((s) => s.dna);
  if (!mounted) return null;
  return <ProfileForm key={saved ? "saved" : "new"} initial={saved ?? profileFromCareer(dna)} />;
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
        <h2 className="text-[15px] font-semibold text-ink">Your Internships profile</h2>
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
      <Fold title={CAPABILITY_META["internships.apply"].label} hint={mode === "automatic" ? "Automatic" : mode === "ask" ? "Ask me" : "Off"}>
        <p className="mb-3 text-[13px] text-ink-3">{CAPABILITY_META["internships.apply"].description}</p>
        <Segmented<PolicyMode> label={CAPABILITY_META["internships.apply"].label} value={mode} onChange={(v) => setCapability("internships.apply", v)} options={[{ value: "automatic", label: "Automatic" }, { value: "ask", label: "Ask me" }, { value: "off", label: "Off" }]} />
      </Fold>
      <Fold title="Post internships" hint="For companies with a hiring workspace">
        <p className="mb-3 text-[13px] text-ink-3">Companies post internships from their hiring workspace. Students apply on WonderStar.</p>
        <Button variant="outline" href="/app/m/internships/company" icon={<Building2 className="size-4" aria-hidden />}>
          Open Company
        </Button>
      </Fold>
    </div>
  );
}
