"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Send, User } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { cn } from "@/lib/cn";

type Turn = { role: "user" | "assistant"; text: string; sectionId?: string | null; sectionTitle?: string | null; source?: "guide" | "model" };

const SUGGESTIONS = ["Where do the jobs come from?", "Does Wonder apply for me?", "How do I reset my password?", "Why is a remote job only 'worth considering'?"];

/** Asks the guide. Answers always link to the section they came from. */
export function HelpAssistant({ className }: { className?: string }) {
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    setTurns((t) => [...t, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/help/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: text }) });
      const data = (await res.json().catch(() => ({}))) as Partial<Turn> & { error?: string; answer?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setTurns((t) => [...t, { role: "assistant", text: data.answer ?? "", sectionId: data.sectionId, sectionTitle: data.sectionTitle, source: data.source }]);
    } catch (e) {
      setTurns((t) => [...t, { role: "assistant", text: e instanceof Error ? e.message : "Something went wrong. Browse the sections below instead." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cn("rounded-[24px] border border-line bg-surface p-5 shadow-sm", className)} aria-label="Ask the guide">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Bot className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-[16px] font-semibold text-ink">Ask the guide</h2>
          <p className="text-[12px] text-ink-3">Answers come from this guide and link to the section they came from.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3" aria-live="polite">
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] text-ink-2 hover:border-line-strong hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn("flex gap-2.5", t.role === "user" ? "justify-end" : "justify-start")}>
            {t.role === "assistant" && (
              <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Bot className="size-3.5" aria-hidden />
              </span>
            )}
            <div className={cn("max-w-[85%] rounded-[16px] px-3.5 py-2.5 text-[13.5px] leading-relaxed", t.role === "user" ? "bg-brand-500 text-white" : "bg-surface-2 text-ink")}>
              <p>{t.text}</p>
              {t.role === "assistant" && t.sectionId && (
                <Link href={`#${t.sectionId}`} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-600 hover:underline">
                  Read: {t.sectionTitle} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              )}
              {t.role === "assistant" && t.source && <p className="mt-1 text-[10.5px] text-ink-4">{t.source === "model" ? "Written by WonderJobs AI from the guide" : "From the guide"}</p>}
            </div>
            {t.role === "user" && (
              <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <User className="size-3.5" aria-hidden />
              </span>
            )}
          </div>
        ))}
        {busy && <p className="text-[12px] text-ink-3">Looking that up…</p>}
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about WonderJobs…" aria-label="Your question" maxLength={500} />
        <Button type="submit" disabled={busy || !q.trim()} icon={<Send className="size-4" aria-hidden />}>
          Ask
        </Button>
      </form>
    </section>
  );
}
