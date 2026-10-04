"use client";
import { useState } from "react";
import { Check, ChevronDown, Copy, Download, ExternalLink, FileText } from "lucide-react";
import { memoryKeyFor } from "@/domain/jobs-apply/classify";
import { freshMemory, MEMORY_LABEL, PROFILE_LABEL } from "@/domain/jobs-apply/profile";
import type { ApplicationPackSnapshot, MemoryKey, PackAnswer, RememberedAnswer } from "@/domain/jobs-apply/types";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { cn } from "@/lib/cn";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast.error("Couldn't copy", "Select the text and copy it yourself.");
    return false;
  }
}

const ORDER = ["firstName", "lastName", "fullName", "email", "phone", "location", "city", "country", "linkedinUrl", "portfolioUrl", "githubUrl", "websiteUrl", "currentEmployer", "currentTitle"] as const;

/** "coinbase.com/careers/positions/8155366" — the place, without the scheme, "www." or tracking query. */
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

const EDIT_NOTE = /\s*\((?:edit|confirm|check) this before submitting\.?\)\s*/gi;
/** An AI draft that is only an instruction to the candidate ("[Add your notice period…]") is not an answer. */
function readDraft(a: PackAnswer): { text: string; placeholder: boolean; check: boolean } {
  const check = EDIT_NOTE.test(a.answer);
  EDIT_NOTE.lastIndex = 0;
  const text = a.answer.replace(EDIT_NOTE, " ").replace(/\s+/g, " ").trim();
  return { text, placeholder: !text || /^\[[^\]]*\]$/.test(text) || /^\[(?:add|insert|describe|enter|your)\b/i.test(text), check };
}

/** One tap copies the value; the row says so for a moment. */
function CopyRow({ label, value, note, multiline }: { label: string; value: string; note?: string; multiline?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={async () => {
          if (!(await copy(value))) return;
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
        aria-label={`Copy ${label}`}
        className="flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 active:bg-brand-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] text-ink-3">{label}</span>
          <span className={cn("block text-[14px] text-ink", multiline ? "whitespace-pre-wrap" : "break-words")}>{value}</span>
          {note && <span className="block text-[11px] text-ink-4">{note}</span>}
        </span>
        <span className={cn("inline-flex shrink-0 items-center gap-1 text-[12px] font-medium", done ? "text-success-600" : "text-brand-600")}>
          {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {done ? "Copied" : "Copy"}
        </span>
      </button>
    </li>
  );
}

/** A question Wonder can't answer for the candidate: they type it once, and it is remembered for the next form. */
function AnswerField({ question, memoryKey, onRemember }: { question: string; memoryKey: MemoryKey; onRemember: (key: MemoryKey, value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <li className="px-3 py-3">
      <p className="text-[13px] font-medium text-ink">{question}</p>
      <p className="mt-0.5 text-[12px] text-ink-3">Yours to answer. Wonder remembers it as “{MEMORY_LABEL[memoryKey]}” and offers it on the next form.</p>
      <form
        className="mt-2 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          onRemember(memoryKey, value);
          toast.success("Remembered", `${MEMORY_LABEL[memoryKey]} is ready to copy above.`);
        }}
      >
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="Your answer" rows={2} className="min-h-[72px]" aria-label={question} />
        <Button type="submit" size="sm" variant="outline" className="self-start" disabled={!value.trim()}>
          Save and remember
        </Button>
      </form>
    </li>
  );
}

/** One step of the form. Only the first is open; the rest open when the candidate reaches them. */
function Step({ n, title, hint, open = false, children }: { n: number; title: string; hint?: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group border-t border-line py-3 first:border-t-0 first:pt-0" aria-label={title}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-600 text-[12px] font-semibold text-white" aria-hidden>
          {n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{title}</span>
          {hint && <span className="block text-[12.5px] text-ink-3">{hint}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2.5 sm:ml-[34px]">{children}</div>
    </details>
  );
}

/**
 * §38, §93, §102 Guided mode: the employer's form, filled by the candidate with everything ready to hand.
 * Every value is one tap to copy. Only real answers are offered — the candidate's own details, their
 * remembered answers, and AI drafts that say something; a draft that was only a note to fill in becomes a
 * field to answer once, remembered for the next form. Nothing here submits anything.
 */
export function GuidedApplication({ pack, applyUrl, memory, onOpen, onDownloadFile, onRemember }: { pack: ApplicationPackSnapshot; applyUrl: string; memory: RememberedAnswer[]; onOpen: () => void; onDownloadFile: (kind: "resume" | "cover_letter") => void; onRemember: (key: MemoryKey, value: string) => void }) {
  const fields = ORDER.filter((k) => pack.profile[k]);

  // Answers: remembered ones first (the candidate's own words), then drafts that say something, then what is still theirs to answer.
  const offered = new Set<MemoryKey>();
  const ready: { key: string; label: string; value: string; note?: string }[] = [];
  const toAnswer: { question: string; key: MemoryKey }[] = [];
  const onForm: string[] = [];
  for (const a of pack.answers) {
    const key = memoryKeyFor(a.question);
    const m = key ? freshMemory(memory, key) : undefined;
    if (key && m) {
      if (!offered.has(key)) ready.push({ key: `m-${key}`, label: a.question, value: m.value, note: "Your answer from before" });
      offered.add(key);
      continue;
    }
    const d = readDraft(a);
    if (!d.placeholder) {
      ready.push({ key: a.id, label: a.question, value: d.text, note: a.provenance === "AI_GENERATED" ? (d.check ? "AI draft — check the facts before you use it" : "AI draft, in your words") : "Your answer" });
      continue;
    }
    if (key && !offered.has(key)) {
      offered.add(key);
      if (key === "workAuthorization" || key === "sponsorship") onForm.push(a.question);
      else toAnswer.push({ question: a.question, key });
    } else onForm.push(a.question);
  }
  // Remembered answers the form may well ask for, even when no draft named them.
  for (const m of memory) {
    if (offered.has(m.key) || !freshMemory(memory, m.key) || m.key === "workAuthorization" || m.key === "sponsorship") continue;
    offered.add(m.key);
    ready.push({ key: `m-${m.key}`, label: MEMORY_LABEL[m.key], value: m.value, note: "Your answer from before" });
  }

  return (
    <Card aria-labelledby="wj-guided">
      <h2 id="wj-guided" className="text-[18px] font-semibold text-ink">
        Fill the form with Wonder beside you
      </h2>
      <p className="mt-1 text-[13px] text-ink-3">Tap to copy. You press the employer&apos;s submit button yourself.</p>

      <div className="mt-4 flex flex-col">
        <Step n={1} title="Open the employer's page" hint={shortUrl(applyUrl)} open>
          <Button className="w-full sm:w-auto" onClick={onOpen} iconRight={<ExternalLink className="size-4" aria-hidden />} data-testid="wj-apply-url" title={applyUrl}>
            Open page
          </Button>
        </Step>

        <Step n={2} title="Your details" hint={fields.length ? `${fields.length} to copy` : "None in your Career Profile yet"}>
          {fields.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line">
              {fields.map((k) => (
                <CopyRow key={k} label={PROFILE_LABEL[k]} value={pack.profile[k]!.value} />
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-3">Your Career Profile has no contact details yet.</p>
          )}
        </Step>

        <Step n={3} title="Attach your documents" hint={[pack.resume && "Résumé", pack.coverLetter && "cover letter"].filter(Boolean).join(" and ") || undefined}>
          <ul className="flex flex-col gap-2">
            {pack.resume && (
              <li className="flex items-center gap-3 rounded-[14px] border border-line p-3">
                <FileText className="size-5 shrink-0 text-brand-600" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-ink-3">Résumé</span>
                  <span className="block truncate text-[13px] text-ink" title={pack.resume.filename}>
                    {pack.resume.filename}
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => onDownloadFile("resume")} icon={<Download className="size-4" aria-hidden />}>
                  Download
                </Button>
              </li>
            )}
            {pack.coverLetter && (
              <li className="rounded-[14px] border border-line p-3">
                <div className="flex items-center gap-3">
                  <FileText className="size-5 shrink-0 text-brand-600" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-ink-3">Cover letter</span>
                    <span className="block truncate text-[13px] text-ink" title={pack.coverLetter.filename}>
                      {pack.coverLetter.filename}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => onDownloadFile("cover_letter")} icon={<Download className="size-4" aria-hidden />}>
                    Download
                  </Button>
                </div>
                {pack.coverLetter.text && (
                  <ul className="mt-2 border-t border-line pt-1">
                    <CopyRow label="Or paste it as text" value={pack.coverLetter.text.length > 160 ? `${pack.coverLetter.text.slice(0, 160).trim()}…` : pack.coverLetter.text} />
                  </ul>
                )}
              </li>
            )}
            {!pack.resume && !pack.coverLetter && <li className="text-[13px] text-ink-3">No documents in this pack.</li>}
          </ul>
        </Step>

        {(ready.length > 0 || toAnswer.length > 0) && (
          <Step n={4} title="Answers the form may ask for" hint={`${ready.length} ready${toAnswer.length ? ` · ${toAnswer.length} for you to answer once` : ""}`}>
            <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line">
              {ready.map((r) => (
                <CopyRow key={r.key} label={r.label} value={r.value} note={r.note} multiline />
              ))}
              {toAnswer.map((q) => (
                <AnswerField key={q.key} question={q.question} memoryKey={q.key} onRemember={onRemember} />
              ))}
            </ul>
          </Step>
        )}
      </div>

      <p className="mt-3 text-[12px] text-ink-4">
        {onForm.length ? `On the form itself: ${onForm.join("; ")}. ` : ""}
        Work authorization, sponsorship, salary and any legal or demographic questions are yours to answer there.
      </p>
    </Card>
  );
}
