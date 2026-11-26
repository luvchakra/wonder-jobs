"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, FileUp, Pencil } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { INDUSTRIES, type CareerDNA } from "@/domain/career/types";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Chip, Field, Input, Textarea } from "@/components/common/Input";
import { ResumeImport } from "@/components/career/ResumeImport";
import { RolesCard, useResumeChoices } from "@/components/career/RolesCard";
import { ProfileFields, type ProfileFieldsValue } from "@/components/career/ProfileFields";
import { fieldsChanged, mainFields, refKey, refOf, roleFieldsOf, roleInputOf, withMainFields } from "@/components/career/profileForm";
import { ProfileItem } from "@/components/career/ProfileItem";
import { MAIN_PROFILE, openedProfile, profileAnchor } from "@/components/career/profiles";
import { CareerHistoryEditor } from "@/components/career/CareerHistoryEditor";
import { MissingRoles } from "@/components/career/MissingRoles";
import { RememberedAnswers } from "@/components/career/RememberedAnswers";
import { historyOf, sortExperience } from "@/domain/career/history";
import { profileSearchQuery, stripHeadlineLabel } from "@/services/jobs/normalize";
import { profileChanged } from "@/domain/career/profileEdit";
import { cleanProfileName, DEFAULT_PROFILE_NAME, PROFILE_NAME_MAX, profileNameOf } from "@/domain/career/profileName";
import { LearnedPreferences } from "@/components/career/LearnedPreferences";
import { toast } from "@/components/feedback/Toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";


export default function CareerDNAPage() {
  const dna = useCareerStore((s) => s.dna);
  const updateDNA = useCareerStore((s) => s.updateDNA);
  const [draft, setDraft] = useState<CareerDNA>(dna);
  // Resume Studio → "Fill Career Profile" links here with the stored file to read.
  const params = useSearchParams();
  const router = useRouter();
  const fillFrom = params.get("fill") ?? undefined;
  // A CV headline like "Target: Senior Director — IAM" is a goal, not the role held today.
  const targetInHeadline = stripHeadlineLabel(draft.headline) !== draft.headline;
  // The history editor's contact and summary fields are uncontrolled: remount it to show imported values.
  const [importRev, setImportRev] = useState(0);
  // My profile's résumé is kept with the rest of the account (the base résumé); each role's with the role.
  const baseResume = useCareerStore((s) => s.baseResume);
  const setBaseResume = useCareerStore((s) => s.setBaseResume);
  const [mainResume, setMainResume] = useState(refKey(baseResume));
  const mainValue = { ...mainFields(draft), resume: mainResume };
  const setMain = (patch: Partial<ProfileFieldsValue>) => {
    if (patch.resume !== undefined) setMainResume(patch.resume);
    setDraft((d) => withMainFields(d, { ...mainFields(d), ...patch }));
  };
  // Each role's edits, kept until Save changes (which saves every profile that has some).
  const [roleDrafts, setRoleDrafts] = useState<Record<string, ProfileFieldsValue>>({});
  const storedRoles = useCareerStore((s) => s.roles ?? []);
  const changedRoles = storedRoles.filter((r) => roleDrafts[r.id] && fieldsChanged(roleDrafts[r.id], roleFieldsOf(r)));
  const dirty = profileChanged(draft, dna) || mainResume !== refKey(baseResume) || changedRoles.length > 0;
  const choices = useResumeChoices();
  /** Saves every profile with edits: My profile (and its résumé), then each changed role. */
  const saveAll = () => {
    updateDNA(draft);
    if (mainResume !== refKey(baseResume)) setBaseResume(refOf(mainResume));
    for (const r of changedRoles) useCareerStore.getState().updateRole(r.id, roleInputOf(r.title, roleDrafts[r.id]));
    setRoleDrafts({});
  };
  // The saved profile can change under an untouched form (it loads from your account, or another tab
  // saves): follow it then, but never over edits not yet saved.
  const seen = useRef(dna);
  useEffect(() => {
    if (seen.current === dna) return;
    const untouched = !profileChanged(draft, seen.current);
    seen.current = dna;
    if (untouched) setDraft(dna);
  }, [dna, draft]);
  const set = <K extends keyof CareerDNA>(k: K, v: CareerDNA[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // Opened from Find: Back returns there, and when the profile changed here (edits not yet saved are saved
  // first), Find searches again with it.
  const fromFind = params.get("from") === "find";
  const arrived = useRef({ dna, roles: JSON.stringify(useCareerStore.getState().roles ?? []) });
  const backToFind = () => {
    if (dirty) saveAll();
    const now = useCareerStore.getState();
    const changed = profileChanged(now.dna, arrived.current.dna) || JSON.stringify(now.roles ?? []) !== arrived.current.roles;
    router.push(changed ? "/app/jobs?refresh=1" : "/app/jobs");
  };

  // Which profile is open: the one Find's Change came from (?role=), else My profile. Opening one closes the others.
  const roles = useCareerStore((s) => s.roles ?? []);
  const [openProfile, setOpenProfile] = useState<string | null>(() => openedProfile(params.get("role"), useCareerStore.getState().roles ?? []));
  const toggleProfile = (id: string) => setOpenProfile((o) => (o === id ? null : id));
  // Renaming My profile in place: the name being typed, or null when not renaming. Saved at once (with the
  // rest of the form left as it is), so Search as and Find use it straight away.
  const [renaming, setRenaming] = useState<string | null>(null);
  const saveName = () => {
    const profileName = cleanProfileName(renaming ?? "");
    updateDNA({ profileName });
    setDraft((d) => ({ ...d, profileName }));
    setRenaming(null);
  };
  // Arriving for a role: it in view, under the Save bar.
  useEffect(() => {
    const id = openedProfile(params.get("role"), roles);
    if (id === MAIN_PROFILE) return;
    document.getElementById(profileAnchor(id))?.scrollIntoView({ block: "start" });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Change on Find's Looking for: the page from its top (Back to Find, the title, Role you want all in view),
  // with the cursor at the end of the role to go on typing.
  useEffect(() => {
    if (params.get("focus") !== "role") return;
    const el = document.getElementById("goal") as HTMLInputElement | null;
    if (!el) return;
    window.scrollTo({ top: 0 });
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Covers a closed tab or reload; an in-app Link click still navigates freely, but the visible "Unsaved
  // changes" note by Save (below) is the fallback for that case.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <div className="mx-auto max-w-3xl">
      {fromFind && (
        <button type="button" onClick={backToFind} className="mb-1 inline-flex min-h-10 items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Back to Find
        </button>
      )}
      <PageHeader
        title="Career Profile"
        className="mb-2 md:mb-3"
      />
      {/* Stays in view below the top bar while the long form scrolls, so Save is always one tap away. */}
      {/* Follows the top bar: right under it while it shows, at the very top once it has slid away (--wj-top-hidden). */}
      <div style={{ top: "calc(4rem - var(--wj-top-hidden, 0px))" }} className="sticky z-20 lg:!top-0 -mx-4 mb-4 flex items-center justify-end gap-2 border-b border-line/70 bg-bg/90 px-4 py-2.5 backdrop-blur transition-[top] duration-300 ease-out motion-reduce:transition-none md:mx-0 md:rounded-b-[14px] md:px-0">
        <Badge className="mr-auto">Updated {formatDate(dna.updatedAt)}</Badge>
        {dirty && (
          <span role="status" className="text-[12px] font-medium text-warning-600">
            Unsaved changes
          </span>
        )}
        <Button
          disabled={!dirty}
          onClick={() => {
            saveAll();
            // Opened from Find (Change): saving goes back there, and Find searches with what was saved.
            if (fromFind) return backToFind();
            // Saving stamps a new time on the stored profile; take it, so the form matches what was saved.
            const stored = useCareerStore.getState().dna;
            seen.current = stored;
            setDraft(stored);
            toast.success("Career Profile updated", "Your next run will use these values.");
          }}
        >
          Save changes
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {/* The quickest way to fill or refresh the profile: a résumé, read and offered field by field (nothing is
            applied until ticked; Save keeps it). Open by default until the profile has a role and skills. */}
        <details open={!!fillFrom || !draft.careerGoal.trim() || draft.skills.length < 3} className="group rounded-[18px] border border-brand-200 bg-gradient-to-br from-brand-50 to-surface">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
              <FileUp className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-semibold text-ink">Update from your résumé</span>
              <span className="block truncate text-[12px] text-ink-3">Upload a PDF or Word file — Wonder fills your role, skills, history and contact; you tick what to keep</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-ink-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="px-4 pb-4">
            <ResumeImport
              current={draft}
              history={draft.history ?? {}}
              onApply={(patch) => {
                setDraft((d) => ({ ...d, ...patch }));
                setImportRev((n) => n + 1);
              }}
              fileId={fillFrom}
              onFileHandled={() => router.replace("/app/career-dna")}
            />
          </div>
        </details>

        {/* Your profiles: My profile (who you are and what you want: every job is matched against it) and each role you'd
            search as. One is open at a time; Find's Change opens the one it searched as. */}
        <Card className="p-0" aria-label="Your profiles">
          <ProfileItem
            id={MAIN_PROFILE}
            title={profileNameOf(draft)}
            hint={profileSearchQuery(draft) ? `Searches for “${profileSearchQuery(draft)}”` : "Latest jobs, ranked by fit"}
            open={openProfile === MAIN_PROFILE}
            onToggle={() => toggleProfile(MAIN_PROFILE)}
            action={
              <button type="button" aria-label={`Rename ${profileNameOf(draft)}`} onClick={() => setRenaming(draft.profileName ?? "")} className="inline-flex size-8 items-center justify-center rounded-full text-ink-4 hover:bg-surface-2 hover:text-ink">
                <Pencil className="size-3.5" aria-hidden />
              </button>
            }
            editor={
              renaming !== null && (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveName();
                  }}
                >
                  <Input
                    autoFocus
                    aria-label="Profile name"
                    value={renaming}
                    maxLength={PROFILE_NAME_MAX}
                    placeholder={DEFAULT_PROFILE_NAME}
                    onChange={(e) => setRenaming(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="h-9 min-w-0 flex-1"
                  />
                  <Button size="sm" type="submit">
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                </form>
              )
            }
          >
            <ProfileFields id="main" value={mainValue} onChange={setMain} derivedWords={profileSearchQuery({ ...draft, searchWords: undefined })} choices={choices} />
          </ProfileItem>
          <RolesCard open={openProfile} onToggle={toggleProfile} onOpen={setOpenProfile} drafts={roleDrafts} setDraft={(id, patch) => setRoleDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? roleFieldsOf(roles.find((r) => r.id === id)!)), ...patch } }))} follow={mainValue} choices={choices} />
        </Card>

        {/* What every profile shares: who you are today. Skills, places and pay are each profile's own, above. */}
        <Card padding="sm" aria-label="Shared by all your profiles">
          <p className="mb-3 text-[12px] text-ink-3">Shared by all your profiles, with the sections below.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Current role" htmlFor="headline">
              <Input id="headline" value={draft.headline} onChange={(e) => set("headline", e.target.value)} />
              {targetInHeadline && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                  This reads like where you&apos;re heading, not your role today.
                  <button
                    type="button"
                    className="font-medium text-brand-600 hover:underline"
                    onClick={() => {
                      const latest = sortExperience(historyOf(draft).experience)[0];
                      setDraft((d) => ({ ...d, careerGoal: stripHeadlineLabel(d.headline), headline: latest ? `${latest.title}${latest.employer ? ` — ${latest.employer}` : ""}` : "" }));
                    }}
                  >
                    Move it to Role you want
                  </button>
                </p>
              )}
            </Field>
            <Field label="Name" htmlFor="name">
              <Input id="name" value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Years of experience" htmlFor="yoe">
              <Input
                id="yoe"
                type="number"
                min={0}
                max={50}
                value={draft.yearsExperience}
                onChange={(e) => set("yearsExperience", Number(e.target.value))}
                onBlur={(e) => set("yearsExperience", Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
              />
            </Field>
          </div>
        </Card>

        {/* Everything else, one tap down. */}
        <Card className="p-0">
          <MissingRoles
            history={historyOf(draft)}
            onAdd={(h) => {
              set("history", h);
              setImportRev((n) => n + 1);
            }}
          />
          <MoreRow title="Work history, education and contact" hint={`${historyOf(draft).experience.length} roles — what résumés are built from`}>
            <CareerHistoryEditor key={`${dna.updatedAt}-${importRev}`} value={historyOf(draft)} onChange={(h) => set("history", h)} />
          </MoreRow>
          <MoreRow title="Industries" hint={draft.industries.length ? draft.industries.slice(0, 3).join(", ") : "Any industry"}>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((i) => (
                <Chip key={i} active={draft.industries.includes(i)} onClick={() => set("industries", draft.industries.includes(i) ? draft.industries.filter((x) => x !== i) : [...draft.industries, i])}>
                  {i}
                </Chip>
              ))}
            </div>
          </MoreRow>
          <MoreRow title="Strengths and growth areas" hint="Used in your résumés and interview prep">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Strengths (one per line)" htmlFor="str">
                <Textarea id="str" value={draft.strengths.join("\n")} onChange={(e) => set("strengths", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
              </Field>
              <Field label="Growth areas (one per line)" htmlFor="grow">
                <Textarea id="grow" value={draft.growthAreas.join("\n")} onChange={(e) => set("growthAreas", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
              </Field>
            </div>
          </MoreRow>
          <MoreRow title="Application answers" hint="Salary, notice period, employment status — filled on forms for you">
            <RememberedAnswers />
          </MoreRow>
          <MoreRow title="What Wonder has learned" hint="From the jobs you marked not for me" last>
            <LearnedPreferences />
          </MoreRow>
        </Card>
      </div>
    </div>
  );
}

/** One collapsed section of the profile: a title and a one-line summary; the detail opens in place. */
function MoreRow({ title, hint, open, last, children }: { title: string; hint?: string; open?: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className={cn("group", !last && "border-b border-line")}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-ink">{title}</span>
          {hint && <span className="block truncate text-[12px] text-ink-3">{hint}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
