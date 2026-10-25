"use client";
import { use, useEffect, useState } from "react";
import { CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { useInterviewPractice, NEEDS_AI } from "@/lib/useInterviewPractice";
import { useApplicationsStore } from "@/store/applications";
import { parseQuiz, quizResult, QUIZ_LENGTH, QUIZ_PASS, QUIZ_SECONDS, type QuizQuestion } from "@/domain/applications/practice";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { formatDate } from "@/lib/format";
import { newId } from "@/lib/ids";
import { cn } from "@/lib/cn";

type Phase = { kind: "intro" } | { kind: "loading" } | { kind: "run"; i: number; answers: (number | null)[]; deadline: number; picked?: number | null } | { kind: "done"; answers: (number | null)[]; saved: boolean };

/** A ten-question test on the job, ten seconds a question; 90% passes. */
export default function PracticeTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { app, job, allowed, ask } = useInterviewPractice(id);
  const recordPractice = useApplicationsStore((s) => s.recordPractice);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [now, setNow] = useState(() => Date.now());
  const back = { href: `/app/applications/${id}/interview`, label: "Interview prep" };

  const run = phase.kind === "run" ? phase : null;
  const answer = (choice: number | null) =>
    setPhase((p) => {
      if (p.kind !== "run" || p.picked !== undefined) return p;
      const answers = [...p.answers];
      answers[p.i] = choice;
      return { ...p, answers, picked: choice };
    });
  // One tick every 100 ms while a question is open (nothing runs otherwise); time's up counts as no answer.
  useEffect(() => {
    if (!run || run.picked !== undefined) return;
    const t = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at >= run.deadline) answer(null);
    }, 100);
    return () => clearInterval(t);
  }, [run]);
  // After an answer, show the right one briefly, then the next question.
  useEffect(() => {
    if (!run || run.picked === undefined) return;
    const t = setTimeout(() => {
      setPhase((p) => {
        if (p.kind !== "run") return p;
        if (p.i + 1 >= questions.length) return { kind: "done", answers: p.answers, saved: false };
        return { kind: "run", i: p.i + 1, answers: p.answers, deadline: Date.now() + QUIZ_SECONDS * 1000 };
      });
      setNow(Date.now());
    }, 1100);
    return () => clearTimeout(t);
  }, [run, questions.length]);

  const start = async () => {
    setPhase({ kind: "loading" });
    try {
      const res = await ask("interview_quiz");
      const qs = res.byModel ? parseQuiz(res.text) : null;
      if (!qs) throw new Error(res.byModel ? "The AI's test didn't come back complete. Try again." : NEEDS_AI);
      setQuestions(qs);
      setNow(Date.now());
      setPhase({ kind: "run", i: 0, answers: Array(qs.length).fill(null), deadline: Date.now() + QUIZ_SECONDS * 1000 });
    } catch (e) {
      toast.error("Couldn't start the test", e instanceof Error ? e.message : undefined);
      setPhase({ kind: "intro" });
    }
  };

  if (!app || !(job ?? app.job)) {
    return (
      <div>
        <PageHeader back={back} title="Practice test" />
        <EmptyState title="This job's details aren't available" action={{ label: "Back to interview prep", href: back.href }} />
      </div>
    );
  }
  const role = job ?? app.job!;
  const past = app.practice?.quizzes ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={back} eyebrow="Practice test" title={`${role.title} · ${role.company}`} />

      {(phase.kind === "intro" || phase.kind === "loading") && (
        <Card>
          <p className="text-[14px] text-ink-2">
            {QUIZ_LENGTH} questions on this job and company · {QUIZ_SECONDS} seconds each · {Math.round(QUIZ_PASS * 100)}% to pass.
          </p>
          <p className="mt-1 text-[12.5px] text-ink-3">Written by your AI from the posting; each test is new.</p>
          {!allowed ? (
            <p className="mt-4 text-[13px] text-ink-3">Interview practice is off in Automation.</p>
          ) : (
            <Button className="mt-4" onClick={start} loading={phase.kind === "loading"} disabled={!job}>
              {phase.kind === "loading" ? "Writing your test…" : "Start test"}
            </Button>
          )}
          {past.length > 0 && (
            <div className="mt-5">
              <p className="mb-1.5 text-[12.5px] font-semibold text-ink-2">Saved scores</p>
              <ul className="flex flex-col gap-1 text-[13px]">
                {past.slice(0, 5).map((q) => (
                  <li key={q.id} className="flex justify-between">
                    <span className="text-ink-3">{formatDate(q.at)}</span>
                    <span className={q.passed ? "font-medium text-success-600" : "font-medium text-danger-600"}>
                      {q.score}/{q.total} · {q.passed ? "Pass" : "Fail"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {run && questions[run.i] && (
        <Card>
          <div className="mb-3 flex items-center justify-between text-[12.5px] text-ink-3">
            <span>
              Question {run.i + 1} of {questions.length}
            </span>
            <span className={cn("font-semibold tabular-nums", run.picked === undefined && run.deadline - now < 3000 ? "text-danger-600" : "text-ink-2")}>{run.picked === undefined ? Math.max(0, Math.ceil((run.deadline - now) / 1000)) : 0}s</span>
          </div>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-bg-soft" aria-hidden>
            <div className="h-full rounded-full bg-brand-500 transition-[width] duration-100 ease-linear" style={{ width: `${run.picked === undefined ? Math.max(0, Math.min(100, ((run.deadline - now) / (QUIZ_SECONDS * 1000)) * 100)) : 0}%` }} />
          </div>
          <p className="text-[16px] font-semibold text-ink">{questions[run.i].q}</p>
          <div className="mt-4 flex flex-col gap-2" role="group" aria-label="Options">
            {questions[run.i].options.map((o, k) => {
              const shown = run.picked !== undefined;
              const right = k === questions[run.i].answer;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={shown}
                  onClick={() => answer(k)}
                  className={cn(
                    "rounded-[12px] border px-3.5 py-3 text-left text-[14px] transition-colors",
                    !shown && "border-line bg-surface hover:border-brand-400 hover:bg-brand-50",
                    shown && right && "border-success-600 bg-success-100 text-success-600",
                    shown && !right && run.picked === k && "border-danger-600 bg-danger-100 text-danger-600",
                    shown && !right && run.picked !== k && "border-line text-ink-4",
                  )}
                >
                  {o}
                </button>
              );
            })}
          </div>
          {run.picked === null && <p className="mt-3 text-[13px] font-medium text-danger-600">Time&apos;s up.</p>}
        </Card>
      )}

      {phase.kind === "done" &&
        (() => {
          const r = quizResult(phase.answers, questions);
          return (
            <div className="flex flex-col gap-4">
              <Card className="text-center">
                <p className="text-[40px] font-semibold leading-none text-ink">
                  {r.score}/{r.total}
                </p>
                <p className={cn("mt-2 text-[16px] font-semibold", r.passed ? "text-success-600" : "text-danger-600")}>{r.passed ? "Pass" : "Fail"}</p>
                <p className="mt-1 text-[12.5px] text-ink-3">{Math.round(QUIZ_PASS * 100)}% needed to pass</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button
                    disabled={phase.saved}
                    onClick={() => {
                      recordPractice(id, { quiz: { id: newId("quiz"), at: new Date().toISOString(), ...r } });
                      setPhase({ ...phase, saved: true });
                      toast.success("Score saved", "It shows in Insights.");
                    }}
                  >
                    {phase.saved ? "Saved" : "Save score"}
                  </Button>
                  <Button variant="outline" onClick={start}>
                    New test
                  </Button>
                </div>
              </Card>
              <Card>
                <h2 className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                  Answers <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-3"><Sparkles className="size-3" aria-hidden /> AI-generated</span>
                </h2>
                <ol className="flex flex-col gap-3">
                  {questions.map((q, i) => {
                    const ok = phase.answers[i] === q.answer;
                    return (
                      <li key={i} className="text-[13px]">
                        <p className="flex gap-1.5 font-medium text-ink">
                          {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-600" aria-label="Right" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger-600" aria-label="Wrong" />}
                          {q.q}
                        </p>
                        <p className="ml-5.5 text-ink-2">
                          {q.options[q.answer]}
                          {!ok && <span className="text-ink-4"> · you: {phase.answers[i] === null ? "no answer" : q.options[phase.answers[i]!]}</span>}
                        </p>
                        {q.why && <p className="ml-5.5 text-ink-3">{q.why}</p>}
                      </li>
                    );
                  })}
                </ol>
              </Card>
            </div>
          );
        })()}
    </div>
  );
}
