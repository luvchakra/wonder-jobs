"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, GraduationCap, Plus } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { skillGaps, type GapJob } from "@/domain/skills/gap";
import { certificationsAsked, type CertJob } from "@/domain/skills/certifications";
import { LEARN_PLATFORMS, searchTerm } from "@/domain/skills/learn";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { EmptyState } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";

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
 * Skill Up (owner, 2026-10-20): where the candidate gets better at what their jobs ask for. The skills and
 * certifications come from the postings that fit them, compared with their own Career Profile — counted, not
 * assumed — and each says which postings asked. Where to learn is Microsoft Learn's public catalog (its
 * certifications and learning paths) and each platform's own search for the exact term.
 */
export default function SkillUpPage() {
  const skills = useCareerStore((s) => s.dna.skills);
  const held = useCareerStore((s) => s.dna.history?.certifications ?? []);
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
      out.push({ id: j.id, title: j.title, company: j.company, skills: j.skills ?? [], text: [(j.requirements ?? []).join("\n"), (j.niceToHave ?? []).join("\n"), j.description ?? ""].join("\n") });
    }
    return out;
  }, [matches, jobs, closed, rejected]);

  const haveNames = useMemo(() => skills.map((s) => s.name), [skills]);
  const report = useMemo(() => skillGaps(haveNames, fitting), [haveNames, fitting]);
  const certNames = useMemo(() => held.map((c) => c.name), [held]);
  const certs = useMemo(() => certificationsAsked(fitting, certNames), [fitting, certNames]);

  // Microsoft Learn, asked once for everything on screen.
  const [learn, setLearn] = useState<Learn | null>(null);
  const skillKey = report.gaps.map((g) => g.skill).join("|");
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
      <PageHeader title="Skill Up" description="Skills and certifications your best-matching jobs ask for, and where to learn them." />
      {!skills.length ? (
        <EmptyState icon={<GraduationCap className="size-5" aria-hidden />} title="Add your skills first" body="Skill Up compares what your jobs ask for with the skills in your Career Profile." action={{ label: "Open Career Profile", href: "/app/career-dna" }} />
      ) : !fitting.length ? (
        <EmptyState icon={<GraduationCap className="size-5" aria-hidden />} title="No matching jobs to compare yet" body="Skill Up learns from the jobs that fit you. Search, then come back." action={{ label: "Find jobs", href: "/app/jobs" }} />
      ) : (
        <>
          <p className="mb-4 text-[13px] text-ink-3">
            Compared {plural(fitting.length, "job")} that fit you with the {plural(skills.length, "skill")} in your Career Profile.
          </p>
          {learn && !learn.available && <p className="mb-3 text-[13px] text-ink-3">Microsoft Learn couldn&apos;t be reached just now, so only the platform searches are shown.</p>}

          <h2 className="mb-2 text-[15px] font-semibold text-ink">Skills to build</h2>
          {report.gaps.length === 0 ? (
            <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">The jobs that fit you ask for nothing your Career Profile doesn&apos;t already show.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {report.gaps.map((g) => (
                <li key={g.skill}>
                  <Fold title={g.skill} hint={`Asked in ${g.jobs} of ${plural(report.considered, "job")} that fit you`}>
                    <AskedBy jobs={g.examples} more={g.jobs - g.examples.length} />
                    <Resources term={g.skill} items={learn?.skills[g.skill] ?? []} />
                    <Button variant="outline" size="sm" className="mt-4" icon={<Plus className="size-4" aria-hidden />} onClick={() => addSkill(g.skill)}>
                      I already have this
                    </Button>
                  </Fold>
                </li>
              ))}
            </ul>
          )}

          {certs.length > 0 && (
            <>
              <h2 className="mb-2 mt-8 text-[15px] font-semibold text-ink">Certifications employers ask for</h2>
              <ul className="flex flex-col gap-3">
                {certs.map((c) => {
                  const official = learn?.certs[c.name];
                  return (
                    <li key={c.name}>
                      <Fold title={c.name} hint={`Named in ${c.jobs} of ${plural(report.considered, "job")} that fit you`}>
                        <AskedBy jobs={c.examples} more={c.jobs - c.examples.length} />
                        <Resources term={searchTerm(c.name)} items={official ? [official] : []} />
                      </Fold>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

function AskedBy({ jobs, more }: { jobs: GapJob[]; more: number }) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-ink-2">Asked by</h3>
      <ul className="mt-1 flex flex-col">
        {jobs.map((j) => (
          <li key={j.id}>
            <Link href={`/app/jobs/${j.id}`} className="flex min-h-10 items-center text-[14px] text-brand-600 hover:underline">
              {j.title} · {j.company}
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
    <div className="mt-4">
      {items.length > 0 && (
        <>
          <h3 className="text-[13px] font-semibold text-ink-2">From Microsoft Learn</h3>
          <ul className="mt-1 flex flex-col divide-y divide-line">
            {items.map((i) => (
              <li key={i.url}>
                <a href={i.url} target="_blank" rel="noopener noreferrer" className="flex flex-col py-2 hover:underline">
                  <span className="inline-flex items-center gap-1 text-[14px] font-medium text-brand-600">
                    {i.title} <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                  </span>
                  <span className="text-[12px] text-ink-3">{[i.kind === "certification" ? "Certification" : "Learning path", i.level, i.minutes ? `${Math.round(i.minutes / 60) || 1} h` : ""].filter(Boolean).join(" · ")}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className={items.length ? "mt-3 text-[13px] font-semibold text-ink-2" : "text-[13px] font-semibold text-ink-2"}>Find courses for “{term}”</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {LEARN_PLATFORMS.map((p) => (
          <li key={p.id}>
            <a href={p.href(term)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 hover:border-line-strong hover:bg-surface-2">
              {p.name} <ExternalLink className="size-3" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
