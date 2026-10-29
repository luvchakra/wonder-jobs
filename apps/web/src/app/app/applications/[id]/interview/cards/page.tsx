"use client";
import { use, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Shuffle, Sparkles } from "lucide-react";
import { useInterviewPractice, NEEDS_AI } from "@/modules/jobs/useInterviewPractice";
import { useApplicationsStore } from "@/store/applications";
import { FLASHCARD_COUNT, parseFlashcards } from "@/domain/applications/practice";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Card } from "@/components/common/Card";
import { Button, IconButton } from "@/components/common/Button";
import { EmptyState } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { cn } from "@/lib/cn";

/** Twenty flashcards for the job: flip, know it / still learning, shuffle, practise what's left. Kept on the application. */
export default function FlashcardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { app, job, allowed, ask } = useInterviewPractice(id);
  const recordPractice = useApplicationsStore((s) => s.recordPractice);
  const deck = app?.practice?.flashcards;
  const [loading, setLoading] = useState(false);
  const [onlyLearning, setOnlyLearning] = useState(false);
  const [order, setOrder] = useState<number[] | null>(null);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const back = { href: `/app/applications/${id}/interview`, label: "Interview prep" };

  const known = useMemo(() => new Set(deck?.known ?? []), [deck?.known]);
  const all = useMemo(() => order ?? (deck ? deck.cards.map((_, i) => i) : []), [order, deck]);
  const shown = useMemo(() => (onlyLearning ? all.filter((i) => !known.has(i)) : all), [all, onlyLearning, known]);
  const at = Math.min(pos, Math.max(0, shown.length - 1));
  const card = deck && shown.length ? deck.cards[shown[at]] : undefined;

  const go = (d: number) => {
    setFlipped(false);
    setPos((p) => Math.max(0, Math.min(shown.length - 1, p + d)));
  };
  const mark = (isKnown: boolean) => {
    if (!deck || !card) return;
    const i = shown[at];
    const next = new Set(known);
    if (isKnown) next.add(i);
    else next.delete(i);
    recordPractice(id, { flashcards: { ...deck, known: [...next].sort((a, b) => a - b) } });
    setFlipped(false);
    // In "still learning" a known card leaves the list, so the same position shows the next one.
    if (!(onlyLearning && isKnown)) setPos((p) => Math.min(shown.length - 1, p + 1));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const create = async () => {
    setLoading(true);
    try {
      const res = await ask("interview_flashcards");
      const cards = res.byModel ? parseFlashcards(res.text) : null;
      if (!cards) throw new Error(res.byModel ? "The AI's cards didn't come back complete. Try again." : NEEDS_AI);
      recordPractice(id, { flashcards: { at: new Date().toISOString(), cards, known: [] } });
      setOrder(null);
      setPos(0);
      setFlipped(false);
      setOnlyLearning(false);
    } catch (e) {
      toast.error("Couldn't make the cards", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  };

  if (!app || !(job ?? app.job)) {
    return (
      <div>
        <PageHeader back={back} title="Flashcards" />
        <EmptyState title="This job's details aren't available" action={{ label: "Back to interview prep", href: back.href }} />
      </div>
    );
  }
  const role = job ?? app.job!;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={back} eyebrow="Flashcards" title={`${role.title} · ${role.company}`} />
      {!deck ? (
        <Card>
          <p className="text-[14px] text-ink-2">{FLASHCARD_COUNT} cards on this job&apos;s skills, likely questions and the company — tap to flip, sort into Know it and Still learning.</p>
          {!allowed ? (
            <p className="mt-4 text-[13px] text-ink-3">Interview practice is off in Automation.</p>
          ) : (
            <Button className="mt-4" onClick={create} loading={loading} disabled={!job}>
              {loading ? "Writing your cards…" : "Make my cards"}
            </Button>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 text-[12.5px] text-ink-3">
            <span>
              {known.size} of {deck.cards.length} known
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="size-3" aria-hidden /> AI-generated
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-soft" aria-hidden>
            <div className="h-full rounded-full bg-success-600" style={{ width: `${(known.size / deck.cards.length) * 100}%` }} />
          </div>

          {card ? (
            <>
              <button
                type="button"
                onClick={() => setFlipped((f) => !f)}
                aria-label={flipped ? "Show the question" : "Show the answer"}
                className={cn("flex min-h-[240px] flex-col items-center justify-center rounded-[20px] border p-6 text-center shadow-sm transition-colors", flipped ? "border-brand-300 bg-brand-50" : "border-line bg-surface")}
              >
                <span className="wj-eyebrow mb-3 text-[11px]">{flipped ? "Answer" : "Question"}</span>
                <span className={cn("whitespace-pre-line", flipped ? "text-[15px] text-ink-2" : "text-[18px] font-semibold text-ink")}>{flipped ? card.back : card.front}</span>
                {known.has(shown[at]) && <span className="mt-3 text-[11.5px] font-medium text-success-600">Known</span>}
              </button>
              <div className="flex items-center justify-between">
                <IconButton label="Previous card" onClick={() => go(-1)} disabled={at === 0}>
                  <ChevronLeft className="size-5" aria-hidden />
                </IconButton>
                <span className="text-[13px] tabular-nums text-ink-3">
                  {at + 1} / {shown.length}
                </span>
                <IconButton label="Next card" onClick={() => go(1)} disabled={at >= shown.length - 1}>
                  <ChevronRight className="size-5" aria-hidden />
                </IconButton>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => mark(false)}>
                  Still learning
                </Button>
                <Button onClick={() => mark(true)}>Know it</Button>
              </div>
            </>
          ) : (
            <Card className="text-center">
              <p className="text-[15px] font-semibold text-ink">You know every card.</p>
              <p className="mt-1 text-[13px] text-ink-3">Practise them all again, or make a new set.</p>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Button
              size="sm"
              variant={onlyLearning ? "primary" : "outline"}
              onClick={() => {
                setOnlyLearning((v) => !v);
                setPos(0);
                setFlipped(false);
              }}
            >
              Still learning only
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Shuffle className="size-3.5" aria-hidden />}
              onClick={() => {
                const o = deck.cards.map((_, i) => i);
                for (let i = o.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [o[i], o[j]] = [o[j], o[i]];
                }
                setOrder(o);
                setPos(0);
                setFlipped(false);
              }}
            >
              Shuffle
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw className="size-3.5" aria-hidden />}
              onClick={() => {
                recordPractice(id, { flashcards: { ...deck, known: [] } });
                setOrder(null);
                setPos(0);
                setFlipped(false);
                setOnlyLearning(false);
              }}
            >
              Start over
            </Button>
            {allowed && (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={create} loading={loading} disabled={!job}>
                New set
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
