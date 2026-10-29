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
import { BOARDS, cleanProfile, GRADE_BANDS, profileFromCareer, QUALIFICATIONS, type TeacherProfile } from "../domain";
import { selectProfile, useTeachingStore } from "../store";
import { BackgroundCheck } from "./Listing";
import { Pick, splitList } from "./Pick";

const noop = () => () => undefined;

/**
 * Teaching → You (WJ-419): the teacher's profile — subjects, grades, boards, qualifications, languages and their own
 * statement about a background check — with qualifications prefilled from the Career Profile's certifications and
 * degrees where it names them (read only; nothing is written back), and the rest asked. Below it, the one setting this
 * module adds (teaching.apply) and, folded, posting roles as a school.
 */
export function TeachingYou() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const saved = useTeachingStore(selectProfile);
  const dna = useCareerStore((s) => s.dna);
  if (!mounted) return null;
  return <ProfileForm key={saved ? "saved" : "new"} initial={saved ?? profileFromCareer(dna)} />;
}

function ProfileForm({ initial }: { initial: TeacherProfile }) {
  const [p, setP] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const mode = useAutomationStore((s) => s.policy["teaching.apply"]) ?? "ask";
  const setCapability = useAutomationStore((s) => s.setCapability);
  const set = (patch: Partial<TeacherProfile>) => setP((x) => ({ ...x, ...patch }));
  const save = () => {
    const c = cleanProfile(p);
    if ("problem" in c) return setProblem(c.problem);
    setProblem(null);
    useTeachingStore.getState().setPersona({ ...c.value });
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
        <h2 className="text-[15px] font-semibold text-ink">Your Teaching profile</h2>
        {initial.from === "career_profile" && <p className="text-[12.5px] text-ink-3">Qualifications filled from your Career Profile. Check them and add the rest.</p>}
        <Field label="Subjects you teach (comma-separated)" htmlFor="tp-subj" required>
          <Input id="tp-subj" defaultValue={p.subjects.join(", ")} onChange={(e) => set({ subjects: splitList(e.target.value) })} />
        </Field>
        <Pick label="Grades" options={GRADE_BANDS} value={p.grades} onChange={(grades) => set({ grades })} />
        <Pick label="Boards" options={BOARDS} value={p.boards} onChange={(boards) => set({ boards })} />
        <Pick label="Qualifications" options={QUALIFICATIONS} value={p.qualifications} onChange={(qualifications) => set({ qualifications })} />
        <Field label="Languages you teach in (comma-separated)" htmlFor="tp-lang">
          <Input id="tp-lang" defaultValue={p.languages.join(", ")} onChange={(e) => set({ languages: splitList(e.target.value) })} />
        </Field>
        <BackgroundCheck value={p.backgroundCheck} onChange={(backgroundCheck) => set({ backgroundCheck })} />
        {problem && <p className="text-[13px] text-danger-600">{problem}</p>}
        <Button type="submit" full>
          Save
        </Button>
      </form>
      <Fold title={CAPABILITY_META["teaching.apply"].label} hint={mode === "automatic" ? "Automatic" : mode === "ask" ? "Ask me" : "Off"}>
        <p className="mb-3 text-[13px] text-ink-3">{CAPABILITY_META["teaching.apply"].description}</p>
        <Segmented<PolicyMode> label={CAPABILITY_META["teaching.apply"].label} value={mode} onChange={(v) => setCapability("teaching.apply", v)} options={[{ value: "automatic", label: "Automatic" }, { value: "ask", label: "Ask me" }, { value: "off", label: "Off" }]} />
      </Fold>
      <Fold title="Post teaching roles" hint="For schools, colleges and coaching centres with a hiring workspace">
        <p className="mb-3 text-[13px] text-ink-3">Institutions post teaching roles from their hiring workspace and book demo classes. Teachers apply on WonderStar.</p>
        <Button variant="outline" href="/app/m/teaching/school" icon={<Building2 className="size-4" aria-hidden />}>
          Open School
        </Button>
      </Fold>
    </div>
  );
}
