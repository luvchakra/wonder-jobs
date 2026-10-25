"use client";
import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useAskWonder, type Command } from "@/lib/useAskWonder";
import { Input } from "@/components/common/Input";
import { cn } from "@/lib/cn";

/** Questions Wonder answers from your own data (each one resolves to an action — `domain/wonder/intent.ts`). */
const ASK_EXAMPLES = ["What should I focus on today?", "How are my applications going?", "Which applications need attention?", "What skills am I missing?", "Prepare my strongest match", "Search again as Director"];

function Row({ c, onGo }: { c: Command; onGo: (c: Command) => void }) {
  const Icon = c.icon;
  return (
    <button type="button" onClick={() => onGo(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink">{c.label}</span>
        {c.hint && <span className="block truncate text-[12px] text-ink-3">{c.hint}</span>}
      </span>
      <ArrowRight className="size-4 shrink-0 text-ink-4" aria-hidden />
    </button>
  );
}

/**
 * Ask Wonder as a page (from You), redesigned (owner, 2026-10-25): one box to ask or search; before anything is typed,
 * what needs you right now (from your own applications, matches and saved jobs) and questions to try, each a tap.
 * Typed words resolve to one of Wonder's own actions, a job search for them, or a page — never a free-text reply.
 */
export default function AskWonderPage() {
  const [q, setQ] = useState("");
  const { results, go } = useAskWonder(q);
  const typed = q.trim().length > 0;
  const now = results.filter((c) => c.group === "Actions");
  const pages = results.filter((c) => c.group === "Go to");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 flex items-center gap-2 text-[20px] font-semibold text-ink">
        <Sparkles className="size-5 text-brand-600" aria-hidden /> Ask Wonder
      </h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (results[0]) go(results[0]);
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask, or search jobs…" aria-label="Ask Wonder" autoFocus enterKeyHint="go" />
      </form>

      {!typed && (
        <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Try asking">
          {ASK_EXAMPLES.map((x) => (
            <button key={x} type="button" onClick={() => setQ(x)} className="h-8 shrink-0 rounded-full border border-line bg-surface px-3 text-[12.5px] text-ink-2 hover:border-brand-300 hover:text-brand-700">
              {x}
            </button>
          ))}
        </div>
      )}

      <section aria-label={typed ? "Results" : "Right now"} className="mt-3">
        <h2 className="mb-1.5 px-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-4">{typed ? "Results" : "Right now"}</h2>
        <div className="wj-card divide-y divide-line overflow-hidden p-0">
          {now.map((c) => (
            <Row key={c.id} c={c} onGo={go} />
          ))}
        </div>
      </section>

      {pages.length > 0 && (
        <section aria-label="Go to" className="mt-3">
          <h2 className="mb-1.5 px-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-4">Go to</h2>
          <div className={cn("flex flex-wrap gap-1.5")}>
            {pages.map((c) => {
              const Icon = c.icon;
              return (
                <button key={c.id} type="button" onClick={() => go(c)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12.5px] text-ink-2 hover:border-line-strong">
                  <Icon className="size-3.5" aria-hidden /> {c.label}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
