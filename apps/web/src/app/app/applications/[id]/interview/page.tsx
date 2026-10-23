"use client";
import { use, useMemo } from "react";
import { CalendarDays, CheckCircle2, ExternalLink, Lightbulb, MessageCircleQuestion } from "lucide-react";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { useCareerStore } from "@/store/career";
import { interviewPrep } from "@/domain/applications/interviewPrep";
import { useRecoverJobs } from "@/components/jobs/useRecoverJobs";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Fold } from "@/components/common/Fold";
import { EmptyState } from "@/components/common/States";
import { formatDate, formatTime } from "@/lib/format";

const BACK = { href: "/app/applications", label: "Pipeline" };

function Section({ icon: Icon, title, hint, children }: { icon: typeof Lightbulb; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Icon className="size-4 text-brand-600" aria-hidden />
        {title}
      </h2>
      {hint && <p className="mt-0.5 text-[12.5px] text-ink-3">{hint}</p>}
      <div className="mt-3">{children}</div>
    </Card>
  );
}

/** Interview prep for one application: everything on it comes from the posting and the candidate's Career Profile. */
export default function InterviewPrepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const app = useApplicationsStore((s) => s.applications[id]);
  const job = useJobsStore((s) => (app ? s.jobs[app.jobId] : undefined));
  useRecoverJobs([app?.jobId]);
  const dna = useCareerStore((s) => s.dna);
  const role = job ?? app?.job;
  const prep = useMemo(() => (role ? interviewPrep(job ?? { title: role.title, company: role.company }, dna) : null), [role, job, dna]);

  if (!app || !role || !prep) {
    return (
      <div>
        <PageHeader back={BACK} title="Interview prep" />
        <EmptyState title="This application isn't available" action={{ label: "Back to Pipeline", href: "/app/applications" }} />
      </div>
    );
  }
  const interview = app.followUps.filter((f) => f.kind === "interview" && !f.done).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={BACK} eyebrow="Interview prep" title={`${role.title} · ${role.company}`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1.5 text-[12.5px] font-medium text-blue-600">
          <CalendarDays className="size-3.5" aria-hidden />
          {interview ? `${formatDate(interview.dueAt)} · ${formatTime(interview.dueAt)}${interview.note ? ` · ${interview.note}` : ""}` : "No interview date yet"}
        </span>
        {role.applyUrl && (
          <a href={role.applyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1.5 text-[12.5px] font-medium text-brand-700 hover:underline">
            The posting <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Section icon={CheckCircle2} title="Lead with" hint="Skills they ask for that you have — with a line from your own history to tell.">
          {prep.leadWith.length ? (
            <ul className="flex flex-col gap-2">
              {prep.leadWith.map((s) => (
                <li key={s.skill} className="rounded-[12px] bg-success-100/60 px-3 py-2">
                  <p className="text-[13px] font-semibold text-success-600">{s.skill}</p>
                  {s.story ? (
                    <p className="mt-0.5 text-[12.5px] text-ink-2">
                      “{s.story.text}” <span className="text-ink-4">— {s.story.role}</span>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[12.5px] text-ink-3">Pick an example that shows it.</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-3">{job?.skills.length ? "None of the skills this posting lists are in your Career Profile yet." : "This posting doesn't list skills."}</p>
          )}
          {dna.strengths.length > 0 && (
            <p className="mt-3 text-[12.5px] text-ink-3">
              Your strengths: <span className="text-ink-2">{dna.strengths.slice(0, 4).join(" · ")}</span>
            </p>
          )}
        </Section>

        {prep.gaps.length > 0 && (
          <Section icon={Lightbulb} title="Prepare a story for" hint="They ask for these; your Career Profile doesn't list them. Have an example, or how you'd learn it.">
            <ul className="flex flex-col gap-2">
              {prep.gaps.map((g) => (
                <li key={g.skill} className="rounded-[12px] bg-warning-100/60 px-3 py-2">
                  <p className="text-[13px] font-semibold text-warning-600">{g.skill}</p>
                  {g.story && (
                    <p className="mt-0.5 text-[12.5px] text-ink-2">
                      Maybe: “{g.story.text}” <span className="text-ink-4">— {g.story.role}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section icon={MessageCircleQuestion} title="Practise these" hint={prep.lookingFor.length ? "From the posting's requirements — answer each with one example: situation, what you did, the result." : undefined}>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13.5px] text-ink-2">
            {prep.questions.map((q) => (
              <li key={q.q}>{q.q}</li>
            ))}
          </ol>
        </Section>

        {prep.lookingFor.length + prep.niceToHave.length > 0 && (
          <Fold title="What the posting asks for" hint={`${prep.lookingFor.length} requirements${prep.niceToHave.length ? ` · ${prep.niceToHave.length} nice to have` : ""}`}>
            <ul className="mb-4 flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
              {prep.lookingFor.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {prep.niceToHave.length > 0 && (
              <>
                <p className="mb-1 text-[12.5px] font-semibold text-ink-2">Nice to have</p>
                <ul className="mb-4 flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
                  {prep.niceToHave.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            )}
          </Fold>
        )}
      </div>
    </div>
  );
}
