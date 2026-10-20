"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Award, ChevronDown, ExternalLink, GraduationCap, Plus, Sparkles } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { skillGaps, type GapJob } from "@/domain/skills/gap";
import { certificationsAsked, type CertJob } from "@/domain/skills/certifications";
import { LEARN_PLATFORMS, searchTerm } from "@/domain/skills/learn";
import { GENERIC_SKILLS, mentions } from "@/services/jobs/matching";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { cn } from "@/lib/cn";

/** What Microsoft Learn's public catalog has (`/api/skill-up/learn`). */
interface LearnItem {
  kind: "certification" | "learning path";
  title: string;
  url: string;
  summary: string;
  minutes?: number;
  level?: string;
}
interface Learn {
  available: boolean;
  skills: Record<string, LearnItem[]>;
  certs: Record<string, LearnItem | null>;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/**
 * Skill Up (owner, 2026-10-20), under You: where the candidate gets better at what their jobs ask for. The
 * skills and certifications come from the postings that fit them, compared with their own Career Profile —
 * counted, not assumed — and each says which postings asked. Where to learn is Microsoft Learn's public catalog
 * (its certifications and learning paths) and each platform's own search for the exact term.
 */
export default function SkillUpPage() {
  const skills = useCareerStore((s) => s.dna.skills);
  const goals = useCareerStore((s) => s.dna.growthAreas);
  const held = useCareerStore((s) => s.dna.history?.certifications);
  const jobs = useJobsStore((s) => s.jobs);
  const matches = useJobsStore((s) => s.matches);
  const closed = useJobsStore((s) => s.closed);
  const rejected = useJobsStore((s) => s.rejected);

  // The jobs that fit the candidate: what they'd actually apply to, which is what they'd want to be ready for.
  const fitting = useMemo(() => {
    const out: (GapJob & CertJob)[] = [];
    for (const m of Object.values(matches)) {
      const j = jobs[m.jobId];
      if (!j || (m.fit !== "strong" && m.fit !== "worth_considering") || closed[j.id] || rejected[j.id]) continue;
      out.push({ id: j.id, title: j.title, company: j.company, skills: j.skills ?? [], strong: m.fit === "strong", text: [j.title, (j.requirements ?? []).join("\n"), (j.niceToHave ?? []).join("\n"), j.description ?? ""].join("\n") });
    }
    return out;
  }, [matches, jobs, closed, rejected]);

  const haveNames = useMemo(() => skills.map((s) => s.name), [skills]);
  // Skills a posting names in its text count as well as its tags, by the same whole-word rule matching uses.
  const report = useMemo(() => skillGaps(haveNames, fitting, { mentions, generic: GENERIC_SKILLS, goals }), [haveNames, fitting, goals]);
  const certNames = useMemo(() => (held ?? []).map((c) => c.name), [held]);
  const certs = useMemo(() => certificationsAsked(fitting, certNames), [fitting, certNames]);

  // Microsoft Learn, asked once for everything on screen — specific skills only: "Risk" or "Agile" match too much to mean anything.
  const [learn, setLearn] = useState<Learn | null>(null);
  const skillKey = report.gaps
    .filter((g) => !g.generic)
    .map((g) => g.skill)
    .join("|");
  const certKey = certs.map((c) => c.name).join("|");
  useEffect(() => {
    if (!skillKey && !certKey) return;
    let off = false;
    fetch(`/api/skill-up/learn?skills=${encodeURIComponent(skillKey)}&certs=${encodeURIComponent(certKey)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Learn>) : null))
      .then((d) => !off && setLearn(d))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [skillKey, certKey]);

  // The candidate's own claim, on their click: added at the level the Career Profile editor starts with.
  const addSkill = (skill: string) => {
    const before = useCareerStore.getState().dna.skills;
    if (before.some((s) => s.name.toLowerCase() === skill.toLowerCase())) return;
    useCareerStore.getState().updateDNA({ skills: [...before, { name: skill, level: 3 }] });
    toast.success(`${skill} added to your Career Profile`, "Your matches are re-scored with it.", { label: "Undo", onClick: () => useCareerStore.getState().updateDNA({ skills: before }) });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Skill Up" description="What the jobs that fit you ask for, and where to learn it." />
      {!skills.length ? (
        <EmptyState icon={<GraduationCap className="size-5" aria-hidden />} title="Add your skills first" body="Skill Up compares what your jobs ask for with the skills in your Career Profile." action={{ label: "Open Career Profile", href: "/app/career-dna" }} />
      ) : !fitting.length ? (
        <EmptyState icon={<GraduationCap className="size-5" aria-hidden />} title="No matching jobs to compare yet" body="Skill Up learns from the jobs that fit you. Search, then come back." action={{ label: "Find jobs", href: "/app/jobs" }} />
      ) : (
        <div className="flex flex-col gap-6">
          {/* The three numbers the page is about, each counted from the list below it. */}
          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Jobs compared" value={fitting.length} />
            <Stat label="Skills to build" value={report.gaps.length} />
            <Stat label="Certifications" value={certs.length} />
          </dl>
          {learn && !learn.available && <p className="-mt-3 text-[12px] text-ink-3">Microsoft Learn couldn&apos;t be reached just now, so only the platform searches are shown.</p>}

          {report.strengths.length > 0 && (
            <section aria-labelledby="bring" className="rounded-[16px] border border-line bg-surface p-4">
              <h2 id="bring" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
                <Sparkles className="size-4 text-brand-600" aria-hidden /> What you already bring — lead with these
              </h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {report.strengths.map((s) => (
                  <li key={s.skill} className="rounded-full bg-success-100/60 px-2.5 py-1 text-[12px] font-medium text-success-600">
                    {s.skill} <span className="font-normal opacity-80">· {s.jobs}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="build">
            <h2 id="build" className="mb-2 text-[15px] font-semibold text-ink">
              Skills to build
            </h2>
            {report.gaps.length === 0 ? (
              <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">The jobs that fit you ask for nothing your Career Profile doesn&apos;t already show.</p>
            ) : (
              <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
                {report.gaps.map((g) => (
                  <Row key={g.skill} title={g.skill} count={g.jobs} of={report.considered} note={[g.strong ? `${g.strong} strong` : "", g.goal ? "your growth area" : ""].filter(Boolean).join(" · ")}>
                    <AskedBy jobs={g.examples} more={g.jobs - g.examples.length} />
                    <Resources term={g.skill} items={learn?.skills[g.skill] ?? []} />
                    <button type="button" onClick={() => addSkill(g.skill)} className="mt-3 inline-flex min-h-10 items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
                      <Plus className="size-4" aria-hidden /> I already have this
                    </button>
                  </Row>
                ))}
              </ul>
            )}
          </section>

          {certs.length > 0 && (
            <section aria-labelledby="certs">
              <h2 id="certs" className="mb-2 text-[15px] font-semibold text-ink">
                Certifications employers ask for
              </h2>
              <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
                {certs.map((c) => {
                  const official = learn?.certs[c.name];
                  return (
                    <Row key={c.name} title={c.name} count={c.jobs} of={report.considered} icon={<Award className="size-4 text-brand-600" aria-hidden />}>
                      <AskedBy jobs={c.examples} more={c.jobs - c.examples.length} />
                      <Resources term={searchTerm(c.name)} items={official ? [official] : []} />
                    </Row>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface px-3 py-2.5">
      <dd className="text-[20px] font-semibold leading-tight text-ink">{value.toLocaleString("en-IN")}</dd>
      <dt className="text-[11px] text-ink-3">{label}</dt>
    </div>
  );
}

/** One skill or certification: its name, how many jobs ask (with a bar for the share), and the detail when opened. */
function Row({ title, count, of, note, icon, children }: { title: string; count: number; of: number; note?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  const share = of ? Math.max(4, Math.round((count / of) * 100)) : 0;
  return (
    <li className="border-b border-line last:border-b-0">
      <details className="group">
        <summary className="flex min-h-[60px] cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
          {icon}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-ink">{title}</span>
            <span className="mt-1 flex items-center gap-2">
              <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-bg-soft" aria-hidden>
                <span className="block h-full rounded-full bg-brand-500" style={{ width: `${share}%` }} />
              </span>
              <span className="truncate text-[12px] text-ink-3">
                {count} of {of} jobs{note ? ` · ${note}` : ""}
              </span>
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-ink-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-4 pb-4">{children}</div>
      </details>
    </li>
  );
}

function AskedBy({ jobs, more }: { jobs: GapJob[]; more: number }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">Asked by</h3>
      <ul className="mt-1 flex flex-col">
        {jobs.map((j) => (
          <li key={j.id}>
            <Link href={`/app/jobs/${j.id}`} className="flex min-h-9 min-w-0 items-baseline gap-1.5 text-[13px] hover:underline">
              <span className="truncate font-medium text-brand-600">{j.title}</span>
              <span className="shrink-0 text-ink-3">{j.company}</span>
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="text-[12px] text-ink-4">and {plural(more, "other job")}</p>}
    </div>
  );
}

/** Where to learn it: Microsoft Learn's own entries when it has them, then each platform's search for the term. */
function Resources({ term, items }: { term: string; items: LearnItem[] }) {
  return (
    <div className="mt-3">
      {items.length > 0 && (
        <>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">From Microsoft Learn</h3>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {items.map((i) => (
              <li key={i.url}>
                <a href={i.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 rounded-[12px] bg-surface-2 px-3 py-2 hover:bg-bg-soft">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13px] font-medium text-ink">{i.title}</span>
                    <span className="text-[11px] text-ink-3">{[i.kind === "certification" ? "Certification" : "Learning path", i.level, i.minutes ? `${Math.round(i.minutes / 60) || 1} h` : ""].filter(Boolean).join(" · ")}</span>
                  </span>
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-ink-4" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className={cn("text-[11px] font-semibold uppercase tracking-wide text-ink-4", items.length > 0 && "mt-3")}>Find courses</h3>
      {/* One row that scrolls sideways on a phone, rather than three lines of chips. */}
      <ul className="-mx-4 mt-1.5 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {LEARN_PLATFORMS.map((p) => (
          <li key={p.id} className="shrink-0">
            <a href={p.href(term)} target="_blank" rel="noopener noreferrer" aria-label={`Search ${p.name} for ${term}`} className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[12px] font-medium text-ink-2 hover:border-line-strong hover:bg-surface-2">
              {p.name} <ExternalLink className="size-3" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
