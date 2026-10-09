"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, MapPin, RefreshCw, Sparkles, X } from "lucide-react";
import { onlyLevel, type ReadinessBlocker, type RelevanceNote } from "@/domain/jobs/readiness";
import { profileSearchQuery, stripSelfReference } from "@/services/jobs/normalize";
import { STAGES } from "@/domain/workflow/stages";
import type { JobSearch } from "@/lib/useJobSearch";
import { foundNothing } from "@/lib/useJobSearch";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { useWorkflowStore } from "@/store/workflow";
import { Button } from "@/components/common/Button";
import { WonderSearching } from "@/components/brand/WonderSearching";
import { Chip, Input } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { track } from "@/lib/analytics";

/* ------------------------------------------------------------------ blocker */

/**
 * The one thing between the candidate and relevant jobs, done right here — no trip to another page
 * unless the step genuinely lives there (reading a CV into the profile).
 */
export function ReadinessBlockerCard({ blocker }: { blocker: ReadinessBlocker }) {
  return (
    <section aria-labelledby="readiness-title" className="wj-card p-5 md:p-6">
      {blocker.kind === "profile" && <ProfileStep blocker={blocker} />}
      {blocker.kind === "role" && <RoleStep suggested={blocker.suggested} level={blocker.level} />}
      {blocker.kind === "sources" && <SourcesStep blocker={blocker} />}
    </section>
  );
}

function ProfileStep({ blocker }: { blocker: Extract<ReadinessBlocker, { kind: "profile" }> }) {
  const router = useRouter();
  const upload = useResumeFilesStore((s) => s.upload);
  const base = useCareerStore((s) => s.baseResume);
  const setBase = useCareerStore((s) => s.setBaseResume);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const meta = await upload(file);
      if (!base) setBase({ kind: "upload", id: meta.id });
      track("jobs_readiness_action", { step: "cv_uploaded" });
      router.push(`/app/career-dna?fill=${encodeURIComponent(meta.id)}`);
    } catch (e) {
      toast.error("Upload didn't work", e instanceof Error ? e.message : undefined);
      setBusy(false);
    }
  };
  return (
    <>
      <p className="wj-eyebrow mb-1">One step to your jobs</p>
      <h2 id="readiness-title" className="text-[20px] font-semibold text-ink">
        {blocker.hasResume ? "Fill your profile from your CV" : "Add your CV"}
      </h2>
      <p className="mt-1 text-[14px] text-ink-3">Wonder matches every job to your experience. It reads your roles, skills and level from your CV — you check what it found before anything is saved.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {blocker.hasResume && blocker.resumeFileId ? (
          <Button href={`/app/career-dna?fill=${encodeURIComponent(blocker.resumeFileId)}`} icon={<Sparkles className="size-4" aria-hidden />}>
            Read my CV
          </Button>
        ) : (
          <>
            <input ref={input} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" aria-label="Choose your CV" onChange={(e) => onPick(e.target.files?.[0])} />
            <Button loading={busy} onClick={() => input.current?.click()} icon={<FileUp className="size-4" aria-hidden />}>
              Upload CV (PDF or Word)
            </Button>
          </>
        )}
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <RoleStep compact />
      </div>
    </>
  );
}

function RoleStep({ suggested, level, compact }: { suggested?: string; level?: string; compact?: boolean }) {
  const updateDNA = useCareerStore((s) => s.updateDNA);
  const [value, setValue] = useState(level ?? suggested ?? "");
  // A level alone ("director") isn't a search: job boards drop level words and search the rest.
  const levelOnly = onlyLevel(stripSelfReference(value));
  const save = () => {
    const v = value.trim();
    if (!v || levelOnly) return;
    updateDNA({ careerGoal: v });
    track("jobs_readiness_action", { step: "role_set" });
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {compact ? (
        <label htmlFor="readiness-role" className="text-[13px] font-medium text-ink-2">
          No CV handy? Tell Wonder the role you want
        </label>
      ) : (
        <>
          <p className="wj-eyebrow mb-1">One step to your jobs</p>
          <h2 id="readiness-title" className="text-[20px] font-semibold text-ink">
            {level ? `Which ${level.toLowerCase()} role?` : "What role are you looking for?"}
          </h2>
          <p className="mt-1 text-[14px] text-ink-3">{level ? `Add the field to “${level}”, e.g. “identity and access management ${level.toLowerCase()}”.` : suggested ? `Your latest role is filled in — change it if you're after something else.` : "Name the role and its field, e.g. “identity and access management director” or “data analyst”."}</p>
        </>
      )}
      <div className="mt-2 flex gap-2">
        <Input id="readiness-role" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. data analyst" className="min-w-0 flex-1" aria-label="The role you want" />
        <Button type="submit" disabled={!value.trim() || levelOnly}>
          Show jobs
        </Button>
      </div>
    </form>
  );
}

function SourcesStep({ blocker }: { blocker: Extract<ReadinessBlocker, { kind: "sources" }> }) {
  const sources = useJobsStore((s) => s.sources);
  const setEnabled = useJobsStore((s) => s.setSourceEnabled);
  const off = sources.filter((s) => s.integrated && !s.enabled && s.available !== false);
  return (
    <>
      <p className="wj-eyebrow mb-1">One step to your jobs</p>
      <h2 id="readiness-title" className="text-[20px] font-semibold text-ink">
        No job source is switched on
      </h2>
      <p className="mt-1 text-[14px] text-ink-3">
        {blocker.off.length ? `Off: ${blocker.off.join(", ")}.` : ""} {blocker.needsSetup.length ? `Not available on WonderJobs yet: ${blocker.needsSetup.join(", ")}.` : ""}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {off.length > 0 && <Button onClick={() => off.forEach((s) => setEnabled(s.id, true))}>Turn them on</Button>}
        <Button variant="outline" href="/app/settings">
          Job sources
        </Button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- notes */

/** The first thing weakening relevance, with one fix. Dismissed notes stay hidden for this visit. */
export function RelevanceNoteBar({ notes }: { notes: RelevanceNote[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const note = notes.find((n) => !hidden.includes(noteKey(n)));
  if (!note) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-3 rounded-[14px] border border-warning-600/25 bg-warning-100/40 p-3">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-warning-600" aria-hidden />
      <div className="min-w-0 flex-1 text-[13px] text-ink-2">
        <NoteBody note={note} />
      </div>
      <button type="button" onClick={() => setHidden((h) => [...h, noteKey(note)])} aria-label="Hide this for now" className="rounded-[8px] p-1 text-ink-3 hover:bg-surface">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

const noteKey = (n: RelevanceNote) => `${n.kind}:${"workflowId" in n ? n.workflowId : "roleId" in n ? n.roleId : ""}`;

function NoteBody({ note }: { note: RelevanceNote }) {
  const workflows = useWorkflowStore((s) => s.workflows);
  const upsertWorkflow = useWorkflowStore((s) => s.upsertWorkflow);
  const roles = useCareerStore((s) => s.roles ?? []);
  const updateRole = useCareerStore((s) => s.updateRole);
  const dna = useCareerStore((s) => s.dna);
  const updateDNA = useCareerStore((s) => s.updateDNA);
  const [roleField, setRoleField] = useState("");

  if (note.kind === "stale_schedule") {
    const fix = () => {
      const wf = workflows[note.workflowId];
      if (!wf) return;
      upsertWorkflow({ ...wf, config: { ...wf.config, searchCriteria: { ...wf.config.searchCriteria, query: note.suggested } }, updatedAt: new Date().toISOString() });
      track("jobs_readiness_action", { step: "schedule_query_fixed" });
      toast.success("Scheduled search updated", `It now looks for “${note.suggested}”.`);
    };
    return (
      <>
        <p>
          Your scheduled search “{note.name}” looks for <strong>“{note.query}”</strong>, which isn&apos;t your field — so it keeps finding jobs that don&apos;t fit.
        </p>
        <Button size="sm" className="mt-2" onClick={fix}>
          Search for “{note.suggested}” instead
        </Button>
      </>
    );
  }
  if (note.kind === "generic_skills") {
    return (
      <>
        <p>
          Your skills ({note.skills.join(", ")}) are ones most roles share, so matching can&apos;t tell your field apart. Add the specific ones — tools, platforms, your discipline.
        </p>
        <Button size="sm" className="mt-2" href={note.resumeFileId ? `/app/career-dna?fill=${encodeURIComponent(note.resumeFileId)}` : "/app/career-dna"}>
          {note.resumeFileId ? "Read them from my CV" : "Add my skills"}
        </Button>
      </>
    );
  }
  if (note.kind === "role_without_field") {
    const role = roles.find((r) => r.id === note.roleId);
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!role || !roleField.trim()) return;
          updateRole(role.id, { title: role.title, query: `${role.title} ${roleField}`.trim(), goal: role.goal, baseResume: role.baseResume });
          track("jobs_readiness_action", { step: "role_field_set" });
        }}
      >
        <p>
          Your “{note.title}” role says the level but not the field, so it would match every {note.title.toLowerCase()} job. What field?
        </p>
        <div className="mt-2 flex gap-2">
          <Input value={roleField} onChange={(e) => setRoleField(e.target.value)} placeholder="e.g. identity and access management" className="h-9 min-w-0 flex-1" aria-label={`Field for your ${note.title} role`} />
          <Button size="sm" type="submit" disabled={!roleField.trim()}>
            Save
          </Button>
        </div>
      </form>
    );
  }
  // no_location
  const choose = (place: string) => {
    updateDNA({ preferredLocations: [place], workModes: place === "Remote" ? ["remote"] : dna.workModes });
    track("jobs_readiness_action", { step: "location_set" });
  };
  return (
    <>
      <p>Where do you want to work? Nearby jobs then rank first.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {note.suggested && (
          <Button size="sm" variant="outline" icon={<MapPin className="size-3.5" aria-hidden />} onClick={() => choose(note.suggested!)}>
            {note.suggested}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => choose("Remote")}>
          Remote
        </Button>
        <Button size="sm" variant="ghost" href="/app/career-dna">
          Somewhere else
        </Button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- status */

/** One line: what Wonder is doing now, or what the list is from — with the per-source detail a tap away. */
/**
 * The role Wonder searches for, said up front with one tap to change it — the Career Profile's "Role you
 * want", edited in place. Saving searches for the new role straight away.
 */
export function WantedRole({ search, className }: { search: JobSearch; className?: string }) {
  const dna = useCareerStore((s) => s.dna);
  const updateDNA = useCareerStore((s) => s.updateDNA);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const role = dna.careerGoal.trim();

  const save = async () => {
    const goal = draft.trim();
    if (!goal || onlyLevel(goal)) {
      setHint(goal ? `Which ${goal} role? Add the field — e.g. “${goal}, identity and access management”.` : "Say the role you want, e.g. “Director, identity and access management”.");
      return;
    }
    setEditing(false);
    setHint(null);
    if (goal === role) return;
    useJobsStore.getState().setFilters({ query: "" });
    // Started before the profile changes, so the page's own "the profile's search changed" doesn't start a second one.
    await search.searchNow({ query: profileSearchQuery({ headline: dna.headline, careerGoal: goal }), careerGoal: goal });
    updateDNA({ careerGoal: goal });
  };

  if (!editing) {
    return (
      <div className={cn("mb-3 text-[14px] text-ink-2", className)}>
        <p className="flex items-center justify-between gap-2">
          <span>Looking for</span>
          <button
            type="button"
            onClick={() => {
              setDraft(role);
              setEditing(true);
            }}
            className="inline-flex min-h-9 items-center font-medium text-brand-600 hover:underline"
          >
            Change
          </button>
        </p>
        <strong className="block min-w-0 font-semibold text-ink">{role || "no role yet"}</strong>
      </div>
    );
  }
  return (
    <form
      className={cn("mb-3 flex flex-col gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor="wj-wanted-role" className="text-[13px] font-medium text-ink-2">
        Role you want
      </label>
      <div className="flex flex-wrap gap-2">
        <Input id="wj-wanted-role" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Director, identity and access management" className="min-w-0 flex-1" />
        <Button type="submit">Search</Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      <p className={cn("text-[12px]", hint ? "text-danger-600" : "text-ink-3")} role={hint ? "alert" : undefined}>
        {hint ?? "One role and its field. Add other roles in your Career Profile."}
      </p>
    </form>
  );
}

export function SearchStatusLine({ search, monitoring = false }: { search: JobSearch; monitoring?: boolean }) {
  // "Search again" repeats what was searched — the candidate's own words or role stay theirs.
  const { active, last, widened } = search;
  const sources = useJobsStore((s) => s.sources);
  if (active) {
    const stage = active.currentStage ? STAGES[active.currentStage] : undefined;
    const found = active.stages.find((s) => s.key === "search")?.counts?.discovered;
    // A search in progress is the most important thing on the page until it ends: a tinted banner with
    // the moving mark, what's happening, a live count and a progress sweep — not a line of grey text.
    return (
      <div role="status" aria-live="polite" className="mb-4 overflow-hidden rounded-2xl border border-brand-300 bg-brand-50">
        <div className="flex items-center gap-3 px-4 py-3">
          <WonderSearching size={32} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink">
              {stage?.activeLabel ?? "Searching"}…{found ? <span className="ml-2 font-normal text-brand-700">{found.toLocaleString("en-IN")} found so far</span> : null}
            </p>
            <p className="truncate text-[13px] text-ink-2">For “{active.config.searchCriteria.query}” — results appear here as they arrive.</p>
          </div>
          <Link href={`/app/runs/${active.id}`} className="shrink-0 text-[13px] font-medium text-brand-700 underline-offset-2 hover:underline">
            Details
          </Link>
        </div>
        <div className="h-1 w-full overflow-hidden bg-brand-200" aria-hidden>
          <div className="wj-sweep h-full w-2/5 rounded-full bg-brand-500" />
        </div>
      </div>
    );
  }
  if (!last) return null;
  const c = last.config.searchCriteria;
  const n = last.config.sourceIds.length || sources.filter((s) => s.enabled).length;
  const failed = last.status === "FAILED" && !foundNothing(last);
  return (
    <div className="mb-4 text-[13px]">
      {widened && <p className="mb-1 text-ink-2">{widened}</p>}
      <p className={cn("flex items-center gap-1.5", failed ? "text-danger-600" : "text-ink-3")} role={failed ? "alert" : undefined}>
        {/* The line itself opens the search's details; one icon searches again. */}
        <Link href={`/app/runs/${last.id}`} aria-label={`Details — ${failed ? "the last search didn't finish" : `searched ${n} sources for ${c.query}`}`} className="min-w-0 underline-offset-2 hover:underline">
          {failed ? `The last search didn't finish: ${last.error?.message ?? "a source failed"}` : `Searched ${n} source${n === 1 ? "" : "s"} for “${c.query}”${c.locations.length ? ` in ${c.locations.join(", ")}` : ""} · ${relativeTime(last.completedAt ?? last.createdAt)}${monitoring ? " · checks again on schedule" : ""}`}
        </Link>
        <button type="button" onClick={() => void search.searchNow(last.config.origin === "words" || last.config.role ? { query: c.query, locations: c.locations, workModes: c.workModes, careerGoal: last.config.careerGoal, origin: "words", role: last.config.role } : undefined)} aria-label={failed ? "Try again" : "Search again"} title={failed ? "Try again" : "Search again"} className="-my-1 shrink-0 rounded-full p-2 text-brand-600 hover:bg-brand-50">
          <RefreshCw className="size-3.5" aria-hidden />
        </button>
      </p>
    </div>
  );
}

/** The empty list while a search runs: the mark dressing up, centred, and what's being searched. */
export function SearchingPanel({ search }: { search: JobSearch }) {
  if (!search.active) return null;
  const c = search.active.config.searchCriteria;
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-line-strong px-6 py-12 text-center">
      <WonderSearching size={88} />
      <p className="text-base font-semibold text-ink">Searching for “{c.query}”{c.locations.length ? ` in ${c.locations.join(", ")}` : ""}</p>
      <p className="text-[13px] text-ink-3">Finding roles worth dressing up for…</p>
    </div>
  );
}

/** What the list shows before there's anything in it: searching, or why nothing was found. */
export function JobsEmpty({ search }: { search: JobSearch }) {
  const { active, last } = search;
  if (active || (!last && !search.readiness.blocker)) {
    if (active) return <SearchingPanel search={search} />;
    return (
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading jobs">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="wj-card h-36 animate-pulse bg-bg-soft" />
        ))}
      </ul>
    );
  }
  if (last && foundNothing(last)) {
    const c = last.config.searchCriteria;
    return (
      <div className="rounded-[20px] border border-dashed border-line-strong px-6 py-10 text-center">
        <p className="text-[15px] font-semibold text-ink">No postings match “{c.query}” right now</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-3">Wonder searched {last.config.sourceIds.length || "every"} source{last.config.sourceIds.length === 1 ? "" : "s"}{c.locations.length ? ` in ${c.locations.join(", ")}` : " everywhere"}. Try naming your role more broadly in your Career Profile — the field rather than one title.</p>
        <Button className="mt-4" variant="outline" href="/app/career-dna">
          Edit my role
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-[20px] border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-[15px] font-semibold text-ink">No jobs yet</p>
      <Button className="mt-4" onClick={() => void search.searchNow()}>
        Search now
      </Button>
    </div>
  );
}

/** Search as the whole profile or as one of the candidate's roles — one tap, it searches. */
export function RoleChips({ roles, current, onPick, busy }: { roles: { id: string; title: string }[]; current: string | null; onPick: (roleId: string | null) => void; busy: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]" role="group" aria-label="Search as">
      <span className="shrink-0 text-[12px] font-medium text-ink-3">Search as</span>
      <Chip active={current === null} onClick={() => onPick(null)} className="h-9 shrink-0 px-3 text-[12px]" disabled={busy}>
        My profile
      </Chip>
      {roles.map((r) => (
        <Chip key={r.id} active={current === r.id} onClick={() => onPick(r.id)} className="h-9 shrink-0 px-3 text-[12px]" disabled={busy}>
          {r.title}
        </Chip>
      ))}
    </div>
  );
}
