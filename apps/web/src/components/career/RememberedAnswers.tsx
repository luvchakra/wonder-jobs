"use client";
import { useState } from "react";
import { freshMemory, MEMORY_LABEL, MEMORY_STALE_DAYS } from "@/domain/jobs-apply/profile";
import { MEMORY_KEYS, type MemoryKey } from "@/domain/jobs-apply/types";
import { useCareerStore } from "@/store/career";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Input } from "@/components/common/Input";

/**
 * JobsApply §83–§85: answers the candidate chose to remember from application forms. Wonder offers
 * them on the next form (and asks again once they're older than 30 days); it never fills them unasked.
 * Work authorization and sponsorship are shown for reference only — the candidate always answers
 * those on the employer's form.
 */
export function RememberedAnswers() {
  const memory = useCareerStore((s) => s.answerMemory ?? []);
  const remember = useCareerStore((s) => s.rememberAnswer);
  const forget = useCareerStore((s) => s.forgetAnswer);
  const [adding, setAdding] = useState<MemoryKey | "">("");
  const [value, setValue] = useState("");
  const unused = MEMORY_KEYS.filter((k) => !memory.some((m) => m.key === k));
  return (
    <Card aria-labelledby="wj-remembered">
      <h2 id="wj-remembered" className="text-[16px] font-semibold text-ink">
        Application answers Wonder remembers
      </h2>
      <p className="mt-1 text-[13px] text-ink-3">Offered on the next form for you to confirm — never filled without you. Asked again after {MEMORY_STALE_DAYS} days, because these change.</p>
      {memory.length ? (
        <ul className="mt-3 divide-y divide-line rounded-[14px] border border-line">
          {memory.map((m) => {
            const stale = !freshMemory([m], m.key);
            return (
              <li key={m.key} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-ink-3">{MEMORY_LABEL[m.key]}</p>
                  <p className="break-words text-[14px] text-ink">{m.value}</p>
                  <p className={`text-[11px] ${stale ? "text-warning-600" : "text-ink-4"}`}>
                    Last confirmed {new Date(m.confirmedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    {stale ? " · Wonder will ask again" : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => forget(m.key)} aria-label={`Forget ${MEMORY_LABEL[m.key]}`}>
                  Forget
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-ink-3">Nothing yet. When you answer a question like notice period or expected salary while applying, you can choose to remember it.</p>
      )}
      {unused.length > 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-3">
            Add
            <select className="h-9 rounded-[10px] border border-line bg-surface px-2 text-[13px] text-ink" value={adding} onChange={(e) => setAdding(e.target.value as MemoryKey | "")}>
              <option value="">Choose…</option>
              {unused.map((k) => (
                <option key={k} value={k}>
                  {MEMORY_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          {adding && (
            <>
              <label htmlFor="wj-remember-value" className="sr-only">
                {MEMORY_LABEL[adding]}
              </label>
              <Input id="wj-remember-value" className="h-9 min-w-0 flex-1" value={value} onChange={(e) => setValue(e.target.value)} placeholder={MEMORY_LABEL[adding]} />
              <Button
                size="sm"
                disabled={!value.trim()}
                onClick={() => {
                  remember(adding, value);
                  setAdding("");
                  setValue("");
                }}
              >
                Save
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
