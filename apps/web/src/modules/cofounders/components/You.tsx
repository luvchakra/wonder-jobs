"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Handshake, ShieldCheck, Users, Zap } from "lucide-react";
import { CAPABILITY_META, type Capability, type PolicyMode } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { YouOverview } from "@/wonderworks/you/YouOverview";
import { call } from "@/wonderworks/api";
import { Button } from "@/components/common/Button";
import { Chip, Field, Input, Segmented, Select, Switch, Textarea } from "@/components/common/Input";
import { PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { cleanProfile, COMMITMENTS, EMPTY_PROFILE, FIELD_LABEL, MAX_SKILLS, PROFILE_FIELDS, personaOf, ROLES, SKILLS, TIER_LABEL, type Commitment, type Profile, type ProfileField, type Role, type Tier } from "../domain";
import { selectPersona, useCofoundersStore } from "../store";

const noop = () => () => undefined;
const MODE_TEXT: Record<PolicyMode, string> = { automatic: "Automatic", ask: "Ask me", off: "Off" };
const CAPS = ["cofounders.connect", "cofounders.join", "cofounders.invite", "cofounders.message", "cofounders.share_contact"] as const satisfies readonly Capability[];

/** Co-founders → You: Jobs' You page with this module's rows under it: your profile and who sees what, your teams, and the settings. */
export function CofoundersYou() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const me = useCofoundersStore(selectPersona);
  const value = mounted && me ? [me.role, me.commitment].filter(Boolean).join(" · ") || "Saved" : "Add it";
  const policy = useAutomationStore((s) => s.policy["cofounders.connect"]) ?? "ask";
  return (
    <YouOverview
      module={{
        label: "Co-founders",
        rows: [
          { href: "/app/m/cofounders/you/profile", label: "Your profile", value, icon: Handshake },
          { href: "/app/m/cofounders/you/profile#settings", label: "Who can see what", value: "Per field", icon: ShieldCheck },
          { href: "/app/m/cofounders/company", label: "Your teams", value: "Start or run one", icon: Users },
          { href: "/app/m/cofounders/you/profile#settings", label: CAPABILITY_META["cofounders.connect"].label, value: mounted ? MODE_TEXT[policy] : "", icon: Zap },
        ],
      }}
    />
  );
}

/** The person's own profile: what they are, and for every field who sees it. The name and contact are never public. */
export function CofoundersProfile() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [initial, setInitial] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    call<{ profile: Profile | null }>("/api/m/cofounders/profile")
      .then((r) => setInitial(r.profile))
      .catch(() => setInitial(null));
  }, []);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your Co-founders profile" back={{ href: "/app/m/cofounders/you", label: "You" }} />
      {!mounted || initial === undefined ? <PageLoading rows={3} /> : <ProfileForm initial={initial ?? EMPTY_PROFILE} fresh={!initial} />}
      {mounted && <Settings />}
    </div>
  );
}

function ProfileForm({ initial, fresh }: { initial: Profile; fresh: boolean }) {
  const [p, setP] = useState<Profile>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const c = cleanProfile(p);
    if ("problem" in c) return setProblem(c.problem);
    setProblem(null);
    setBusy(true);
    try {
      await call("/api/m/cofounders/profile", { method: "PUT", body: c.value });
      useCofoundersStore.getState().setPersona({ ...personaOf(c.value) });
      toast.success("Saved", c.value.open ? "You can be found, showing only what you chose." : "You are not listed. Turn on “Let people find me” when you're ready.");
    } catch (e) {
      toast.error("Couldn't save", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const tiers = (f: ProfileField): Tier => p.tiers[f] ?? "hidden";
  return (
    <form
      className="wj-card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-[13px] text-ink-3">{fresh ? "Start here. " : ""}Everyone who finds you sees your headline and the fields you set to Everyone. Your name is shown only once you both agree, and your email only when you press Share.</p>
      <Field label="Your name" htmlFor="cf-name" hint="Shown only to mutual connections">
        <Input id="cf-name" value={p.name} onChange={(e) => set("name", e.target.value)} maxLength={80} autoComplete="name" />
      </Field>
      <Field label="Headline" htmlFor="cf-head" hint="Everyone sees this">
        <Input id="cf-head" value={p.headline} onChange={(e) => set("headline", e.target.value)} maxLength={80} placeholder="Backend engineer, ex-fintech" />
      </Field>
      <Field label="Role">
        <Segmented<Role | ""> label="Role" value={p.role ?? ""} onChange={(v) => set("role", v || undefined)} options={ROLES.map((r) => ({ value: r, label: r }))} />
      </Field>
      <Field label="Skills" hint={`Up to ${MAX_SKILLS}`}>
        <div className="flex flex-wrap gap-2">
          {SKILLS.map((s) => (
            <Chip key={s} active={p.skills.includes(s)} onClick={() => set("skills", p.skills.includes(s) ? p.skills.filter((x) => x !== s) : [...p.skills, s].slice(0, MAX_SKILLS))}>
              {s}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Commitment">
        <Segmented<Commitment | ""> label="Commitment" value={p.commitment ?? ""} onChange={(v) => set("commitment", v || undefined)} options={COMMITMENTS.map((c) => ({ value: c, label: c }))} />
      </Field>
      <Field label="City" htmlFor="cf-loc">
        <Input id="cf-loc" value={p.location} onChange={(e) => set("location", e.target.value)} maxLength={80} />
      </Field>
      <Field label="Your idea">
        <Segmented<"idea" | "open"> label="Your idea" value={p.ideaState} onChange={(v) => set("ideaState", v)} options={[{ value: "open", label: "Open to any idea" }, { value: "idea", label: "I have an idea" }]} />
      </Field>
      {p.ideaState === "idea" && <Textarea aria-label="Describe your idea" rows={3} maxLength={600} value={p.idea} onChange={(e) => set("idea", e.target.value)} placeholder="What are you building, in a sentence or two?" />}
      <Field label="About you" htmlFor="cf-about">
        <Textarea id="cf-about" rows={3} maxLength={1000} value={p.about} onChange={(e) => set("about", e.target.value)} />
      </Field>
      <Field label="What you want in a co-founder" htmlFor="cf-want">
        <Textarea id="cf-want" rows={2} maxLength={600} value={p.lookingFor} onChange={(e) => set("lookingFor", e.target.value)} />
      </Field>
      <Field label="Equity expectations" htmlFor="cf-eq">
        <Input id="cf-eq" value={p.equity} onChange={(e) => set("equity", e.target.value)} maxLength={200} placeholder="For example an equal split, vesting over four years" />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-[14px] font-semibold text-ink">Who sees each field</legend>
        <p className="text-[12px] text-ink-3">Your headline is always public. Everything else is yours to decide.</p>
        {PROFILE_FIELDS.map((f) => (
          <div key={f} className="flex items-center justify-between gap-3">
            <label htmlFor={`tier-${f}`} className="text-[13px] text-ink-2">
              {FIELD_LABEL[f]}
            </label>
            <Select id={`tier-${f}`} className="max-w-[210px]" value={tiers(f)} onChange={(e) => set("tiers", { ...p.tiers, [f]: e.target.value as Tier })}>
              {(Object.keys(TIER_LABEL) as Tier[]).map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </fieldset>
      <div className="flex items-center justify-between gap-3 rounded-[12px] bg-surface-2 p-3">
        <span className="text-[13px] text-ink-2">Let people find me. Turn it off any time and you disappear from Find at once.</span>
        <Switch checked={p.open} onChange={(v) => set("open", v)} label="Let people find me" />
      </div>
      {problem && <p className="text-[13px] text-danger-600">{problem}</p>}
      <Button type="submit" full loading={busy}>
        Save
      </Button>
    </form>
  );
}

/** The five settings this module adds: each press that reaches another person asks first, shows what goes, or is off (resolveCapability). */
function Settings() {
  const policy = useAutomationStore((s) => s.policy);
  const setCapability = useAutomationStore((s) => s.setCapability);
  return (
    <section id="settings" aria-label="Co-founders settings" className="wj-card mt-3 scroll-mt-24 space-y-4 p-4">
      <h2 className="text-[15px] font-semibold text-ink">When it reaches another person</h2>
      {CAPS.map((cap) => (
        <div key={cap} className="space-y-1.5">
          <p className="text-[14px] font-medium text-ink">{CAPABILITY_META[cap].label}</p>
          <p className="text-[12px] text-ink-3">{CAPABILITY_META[cap].description}</p>
          <Segmented<PolicyMode> label={CAPABILITY_META[cap].label} size="sm" value={policy[cap] ?? CAPABILITY_META[cap].default} onChange={(v) => setCapability(cap, v)} options={[{ value: "automatic", label: "Automatic" }, { value: "ask", label: "Ask me" }, { value: "off", label: "Off" }]} />
        </div>
      ))}
    </section>
  );
}
