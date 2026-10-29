"use client";
import { use, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useInterviewPractice, NEEDS_AI } from "@/modules/jobs/useInterviewPractice";
import { useApplicationsStore } from "@/store/applications";
import { MOCK_MAX_QUESTIONS, MOCK_MINUTES, parseMockQuestion, parseMockReview, transcriptText, type MockSession, type MockTurn } from "@/domain/applications/practice";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/States";
import { Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { formatDate } from "@/lib/format";
import { newId } from "@/lib/ids";
import { cn } from "@/lib/cn";

type Phase = "intro" | "asking" | "answering" | "reviewing" | "done";
const LIMIT = MOCK_MINUTES * 60_000;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** A mock interview for this job, up to ten minutes; scored with feedback at the end and kept on the application. */
export default function MockInterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { app, job, allowed, ask } = useInterviewPractice(id);
  const recordPractice = useApplicationsStore((s) => s.recordPractice);
  const [phase, setPhase] = useState<Phase>("intro");
  const [turns, setTurns] = useState<MockTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<MockSession | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const live = phase === "asking" || phase === "answering";
  const ending = useRef(false);
  const back = { href: `/app/applications/${id}/interview`, label: "Interview prep" };

  // The latest "end now", for the clock below.
  const endNow = useRef<() => void>(() => {});
  // The clock ticks once a second, only while the interview runs; at ten minutes the interview ends itself.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at - startedAt >= LIMIT) endNow.current();
    }, 1000);
    return () => clearInterval(t);
  }, [live, startedAt]);

  const nextQuestion = async (so: MockTurn[]) => {
    setPhase("asking");
    const res = await ask("mock_interview", transcriptText(so));
    const q = res.byModel ? parseMockQuestion(res.text) : null;
    if (!q) throw new Error(res.byModel ? "The interviewer didn't reply. Try again." : NEEDS_AI);
    if (ending.current) return;
    setTurns([...so, { q, a: "" }]);
    setPhase("answering");
  };

  const start = async () => {
    ending.current = false;
    setTurns([]);
    setResult(null);
    setFailed(null);
    setStartedAt(Date.now());
    setNow(Date.now());
    try {
      await nextQuestion([]);
    } catch (e) {
      toast.error("Couldn't start the interview", e instanceof Error ? e.message : undefined);
      setPhase("intro");
    }
  };

  const finish = async (so: MockTurn[]) => {
    if (ending.current) return;
    ending.current = true;
    const asked = so.filter((t) => t.q);
    if (!asked.some((t) => t.a.trim())) {
      setFailed("You ended before answering a question, so there's nothing to score.");
      setPhase("done");
      return;
    }
    setPhase("reviewing");
    try {
      const res = await ask("mock_review", transcriptText(asked));
      const review = res.byModel ? parseMockReview(res.text) : null;
      if (!review) throw new Error(res.byModel ? "The review didn't come back complete." : NEEDS_AI);
      const session: MockSession = { id: newId("mock"), at: new Date().toISOString(), seconds: Math.round((Date.now() - startedAt) / 1000), questions: asked.map((t) => t.q), ...review };
      recordPractice(id, { mock: session });
      setResult(session);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Couldn't score this interview.");
    }
    setPhase("done");
  };

  useEffect(() => {
    endNow.current = () => void finish(turns);
  });

  const send = async () => {
    const a = draft.trim();
    if (!a) return;
    const so = turns.map((t, i) => (i === turns.length - 1 ? { ...t, a } : t));
    setTurns(so);
    setDraft("");
    if (so.length >= MOCK_MAX_QUESTIONS || Date.now() - startedAt >= LIMIT) return finish(so);
    try {
      await nextQuestion(so);
    } catch (e) {
      toast.error("The interviewer didn't reply", e instanceof Error ? e.message : undefined);
      setPhase("answering");
    }
  };

  if (!app || !(job ?? app.job)) {
    return (
      <div>
        <PageHeader back={back} title="Mock interview" />
        <EmptyState title="This job's details aren't available" action={{ label: "Back to interview prep", href: back.href }} />
      </div>
    );
  }
  const role = job ?? app.job!;
  const past = app.practice?.mocks ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={back} eyebrow="Mock interview" title={`${role.title} · ${role.company}`} />

      {phase === "intro" && (
        <Card>
          <p className="text-[14px] text-ink-2">
            An AI interviewer asks up to {MOCK_MAX_QUESTIONS} questions for this role, one at a time. Up to {MOCK_MINUTES} minutes; end whenever you like. You get a score, feedback and what to improve.
          </p>
          {!allowed ? (
            <p className="mt-4 text-[13px] text-ink-3">Interview practice is off in Automation.</p>
          ) : (
            <Button className="mt-4" onClick={start} disabled={!job}>
              Start interview
            </Button>
          )}
          {past.length > 0 && (
            <div className="mt-5">
              <p className="mb-1.5 text-[12.5px] font-semibold text-ink-2">Past interviews</p>
              <ul className="flex flex-col gap-1 text-[13px]">
                {past.slice(0, 5).map((m) => (
                  <li key={m.id} className="flex justify-between gap-3">
                    <span className="text-ink-3">
                      {formatDate(m.at)} · {Math.max(1, Math.round(m.seconds / 60))} min
                    </span>
                    <span className="font-medium text-ink">{m.score}/100</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {(live || phase === "reviewing") && (
        <div className="flex flex-col gap-3">
          <div className="sticky top-2 z-10 flex items-center justify-between rounded-[14px] border border-line bg-surface/95 px-3 py-2 backdrop-blur">
            <span className={cn("text-[15px] font-semibold tabular-nums", LIMIT - (now - startedAt) < 60_000 ? "text-danger-600" : "text-ink")}>{mmss(LIMIT - (now - startedAt))}</span>
            <span className="text-[12.5px] text-ink-3">
              Question {Math.max(1, turns.length)} of up to {MOCK_MAX_QUESTIONS}
            </span>
            <Button size="sm" variant="outline" disabled={phase === "reviewing"} onClick={() => void finish(turns)}>
              End interview
            </Button>
          </div>
          <ol className="flex flex-col gap-3" aria-label="Interview">
            {turns.map((t, i) => (
              <li key={i} className="flex flex-col gap-2">
                <p className="max-w-[85%] self-start rounded-[16px] rounded-tl-[4px] bg-brand-50 px-3.5 py-2.5 text-[14px] text-ink">{t.q}</p>
                {t.a && <p className="max-w-[85%] self-end whitespace-pre-line rounded-[16px] rounded-tr-[4px] bg-surface px-3.5 py-2.5 text-[14px] text-ink-2 shadow-sm">{t.a}</p>}
              </li>
            ))}
          </ol>
          {phase === "asking" && <p className="text-[13px] text-ink-3">The interviewer is thinking…</p>}
          {phase === "reviewing" && <p className="text-[13px] text-ink-3">Scoring your interview…</p>}
          {phase === "answering" && (
            <div className="flex flex-col gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={5}
                aria-label="Your answer"
                placeholder="Answer as you would in the interview: the situation, what you did, the result."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
                }}
              />
              <Button onClick={() => void send()} disabled={!draft.trim()} className="self-end">
                Send answer
              </Button>
            </div>
          )}
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col gap-4">
          {result ? (
            <>
              <Card className="text-center">
                <p className="text-[40px] font-semibold leading-none text-ink">
                  {result.score}
                  <span className="text-[18px] text-ink-3">/100</span>
                </p>
                <p className="mx-auto mt-3 max-w-md text-[14px] text-ink-2">{result.summary}</p>
                <p className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-ink-3">
                  <Sparkles className="size-3" aria-hidden /> AI-generated review · saved · shows in Insights
                </p>
              </Card>
              {result.strengths.length > 0 && (
                <Card>
                  <h2 className="mb-2 text-[14px] font-semibold text-success-600">What went well</h2>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] text-ink-2">
                    {result.strengths.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </Card>
              )}
              <Card>
                <h2 className="mb-2 text-[14px] font-semibold text-warning-600">To improve</h2>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] text-ink-2">
                  {result.improvements.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </Card>
            </>
          ) : (
            <Card>
              <p className="text-[14px] text-ink-2">{failed}</p>
            </Card>
          )}
          <Button onClick={start} className="self-center">
            New interview
          </Button>
        </div>
      )}
    </div>
  );
}
