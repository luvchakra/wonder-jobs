"use client";
import { useEffect, useState } from "react";
import { Check, Download, Pencil, X } from "lucide-react";
import type { ResumeBullet, ResumeDocument, ResumeSection } from "@/domain/resume/document";
import { groupSkills } from "@/domain/resume/document";
import { bulletsFromLines, finishEdit, listFrom } from "@/domain/resume/edit";
import type { GeneratedResume } from "@/services/resume/generate";
import { ResumeFonts, ResumePage } from "./ResumePage";
import { cn } from "@/lib/cn";

/**
 * A generated résumé, full screen (owner, 2026-10-25): every page edge to edge, Edit to change its words in
 * place (header, summary, skills, roles and their bullets…), Save to keep them — the pages re-flow in the same
 * template — and Download for the Word file of what's on screen, edits included.
 */
export function ResumePreviewSheet({ resume, file, subtitle, onClose, onDownload, onSave, downloading }: { resume: GeneratedResume; file: string; subtitle: string; onClose: () => void; onDownload: (r: GeneratedResume) => void; onSave: (doc: ResumeDocument) => GeneratedResume | null; downloading: boolean }) {
  const [current, setCurrent] = useState(resume);
  const [draft, setDraft] = useState<ResumeDocument | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !draft && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [draft, onClose]);

  const save = () => {
    if (!draft) return;
    const next = onSave(finishEdit(draft));
    if (next) setCurrent(next);
    setDraft(null);
  };

  const btn = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold wj-press";
  return (
    <div role="dialog" aria-modal="true" aria-label={`Résumé preview: ${file}`} className="fixed inset-0 z-[60] flex flex-col bg-bg-soft">
      <ResumeFonts />
      <header className="flex items-center gap-2 border-b border-line bg-surface px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button type="button" onClick={draft ? () => setDraft(null) : onClose} aria-label={draft ? "Cancel editing" : "Close preview"} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
          <X className="size-5" aria-hidden />
        </button>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-ink" title={file}>{draft ? "Editing your résumé" : file}</span>
          <span className="block truncate text-[12px] text-ink-3">{draft ? "Tap any text to change it, then Save" : `${subtitle} · ${current.layout.pages.length} ${current.layout.pages.length === 1 ? "page" : "pages"}`}</span>
        </span>
        {draft ? (
          <button type="button" onClick={save} className={cn(btn, "wj-gradient-bg text-white")}>
            <Check className="size-4" aria-hidden /> Save
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setDraft(structuredClone(current.document))} className={cn(btn, "border border-line bg-surface text-ink")}>
              <Pencil className="size-4" aria-hidden /> Edit
            </button>
            <button type="button" onClick={() => onDownload(current)} disabled={downloading} aria-busy={downloading} aria-label="Download (.docx)" className={cn(btn, "wj-gradient-bg text-white")}>
              <Download className="size-4" aria-hidden /> .docx
            </button>
          </>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {draft ? (
          <ResumeEditor doc={draft} onChange={setDraft} />
        ) : (
          // Every page, the screen's full width, one under the other.
          <div className="mx-auto flex max-w-[860px] flex-col gap-2 py-2">
            {current.layout.pages.map((p, i) => (
              <ResumePage key={i} layout={current.layout} page={p} index={i} className="block h-auto w-full shadow-sm" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- editor */

const box = "w-full rounded-[6px] border border-transparent bg-transparent px-1 py-0.5 text-ink outline-none hover:border-line focus:border-brand-400 focus:bg-brand-50/40";

/** One line of text; reports on every key (single lines need no tidying while typing). */
function Line({ value, onChange, label, className, placeholder }: { value: string | undefined; onChange: (v: string) => void; label: string; className?: string; placeholder?: string }) {
  return <input aria-label={label} value={value ?? ""} placeholder={placeholder ?? label} onChange={(e) => onChange(e.target.value)} className={cn(box, className)} />;
}

/** Several lines; reports when the field is left, so lines aren't re-tidied under the cursor. Save leaves it first. */
function Lines({ value, onCommit, label, className }: { value: string; onCommit: (v: string) => void; label: string; className?: string }) {
  const [text, setText] = useState(value);
  return <textarea aria-label={label} value={text} rows={Math.max(2, text.split("\n").length + Math.floor(text.length / 70))} onChange={(e) => setText(e.target.value)} onBlur={() => text !== value && onCommit(text)} className={cn(box, "resize-none leading-snug", className)} />;
}

const HEADING: Record<ResumeSection["type"], string> = {
  summary: "Summary",
  strengths: "Key strengths",
  skills: "Skills",
  experience: "Experience",
  selected_achievements: "Selected achievements",
  transferable_skills: "Transferable skills",
  education: "Education",
  certifications: "Certifications",
  projects: "Projects",
  publications: "Publications",
  research_interests: "Research interests",
};

const lines = (bullets: ResumeBullet[] | undefined) => (bullets ?? []).map((b) => b.text).join("\n");

function ResumeEditor({ doc, onChange }: { doc: ResumeDocument; onChange: (d: ResumeDocument) => void }) {
  const h = doc.header;
  const setHeader = (patch: Partial<ResumeDocument["header"]>) => onChange({ ...doc, header: { ...h, ...patch } });
  const setSection = (i: number, s: ResumeSection) => onChange({ ...doc, sections: doc.sections.map((x, j) => (j === i ? s : x)) });
  const item = <T,>(items: T[], k: number, patch: Partial<T>) => items.map((x, j) => (j === k ? { ...x, ...patch } : x));

  return (
    // A page-like sheet: the same order and words as the résumé, each one editable where it stands.
    <div className="mx-auto max-w-[860px] bg-white px-3 py-4 text-[13px] text-ink sm:my-2 sm:px-8 sm:shadow-sm">
      <div className="flex flex-col items-center gap-0.5 text-center">
        <Line label="Name" value={h.name} onChange={(v) => setHeader({ name: v })} className="text-center text-[20px] font-semibold" />
        <Line label="Headline" value={h.headline} onChange={(v) => setHeader({ headline: v || undefined })} className="text-center text-brand-700" />
        <div className="grid w-full grid-cols-2 gap-x-2 text-[12px] text-ink-3 sm:grid-cols-4">
          <Line label="Location" value={h.location} onChange={(v) => setHeader({ location: v || undefined })} className="text-center" />
          <Line label="Phone" value={h.phone} onChange={(v) => setHeader({ phone: v || undefined })} className="text-center" />
          <Line label="Email" value={h.email} onChange={(v) => setHeader({ email: v || undefined })} className="text-center" />
          <Line label="LinkedIn" value={h.linkedinUrl} onChange={(v) => setHeader({ linkedinUrl: v || undefined })} className="text-center" />
        </div>
      </div>
      {doc.sections.map((s, i) => (
        <section key={s.type} className="mt-4">
          <h3 className="mb-1 border-b border-line pb-0.5 text-[12px] font-semibold uppercase tracking-wide text-brand-700">{HEADING[s.type]}</h3>
          {s.type === "summary" && <Lines label="Summary" value={s.text} onCommit={(v) => setSection(i, { ...s, text: v.trim() })} />}
          {(s.type === "strengths" || s.type === "transferable_skills" || s.type === "research_interests") && <Lines label={`${HEADING[s.type]}, separated by commas`} value={s.items.join(", ")} onCommit={(v) => setSection(i, { ...s, items: listFrom(v) })} />}
          {s.type === "skills" && (
            <Lines
              label="Skills, separated by commas"
              value={(s.ordered ?? s.groups.flatMap((g) => g.skills)).join(", ")}
              onCommit={(v) => {
                const list = listFrom(v);
                setSection(i, { ...s, groups: groupSkills(list), ordered: list });
              }}
            />
          )}
          {s.type === "selected_achievements" && <Lines label="Achievements, one per line" value={lines(s.items)} onCommit={(v) => setSection(i, { ...s, items: bulletsFromLines(v, s.items) })} />}
          {s.type === "experience" &&
            s.items.map((e, k) => (
              <div key={e.id} className="mt-2 flex flex-col">
                <div className="grid grid-cols-[1fr_auto] gap-x-2">
                  <Line label="Employer" value={e.employer} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { employer: v }) })} className="font-medium" />
                  <span className="flex items-center text-[12px] text-ink-3">
                    <Line label="Start" value={e.startDate} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { startDate: v }) })} className="w-[5.5rem] text-right" />–
                    <Line label="End" value={e.current ? "Present" : e.endDate} placeholder="Present" onChange={(v) => setSection(i, { ...s, items: item(s.items, k, /^present$/i.test(v.trim()) || !v.trim() ? { current: true, endDate: undefined } : { current: false, endDate: v }) })} className="w-[5.5rem]" />
                  </span>
                </div>
                <Line label="Title" value={e.title} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { title: v }) })} className="text-brand-700" />
                <Lines label={`${e.title} at ${e.employer}: one achievement per line`} value={lines(e.bullets)} onCommit={(v) => setSection(i, { ...s, items: item(s.items, k, { bullets: bulletsFromLines(v, e.bullets) }) })} className="mt-0.5" />
              </div>
            ))}
          {s.type === "education" &&
            s.items.map((e, k) => (
              <div key={e.id} className="mt-1 grid grid-cols-2 gap-x-2">
                <Line label="Institution" value={e.institution} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { institution: v }) })} className="col-span-2 font-medium" />
                <Line label="Degree" value={e.degree} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { degree: v || undefined }) })} />
                <Line label="Field" value={e.field} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { field: v || undefined }) })} />
              </div>
            ))}
          {s.type === "certifications" &&
            s.items.map((c, k) => (
              <div key={c.id} className="grid grid-cols-[2fr_1fr] gap-x-2">
                <Line label="Certification" value={c.name} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { name: v }) })} />
                <Line label="Issuer" value={c.issuer} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { issuer: v || undefined }) })} className="text-ink-3" />
              </div>
            ))}
          {s.type === "projects" &&
            s.items.map((p, k) => (
              <div key={p.id} className="mt-1 flex flex-col">
                <Line label="Project" value={p.name} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { name: v }) })} className="font-medium" />
                <Line label="Description" value={p.description} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { description: v || undefined }) })} />
                {!!p.bullets?.length && <Lines label={`${p.name}: one line each`} value={lines(p.bullets)} onCommit={(v) => setSection(i, { ...s, items: item(s.items, k, { bullets: bulletsFromLines(v, p.bullets) }) })} />}
              </div>
            ))}
          {s.type === "publications" &&
            s.items.map((p, k) => (
              <div key={p.id} className="grid grid-cols-[2fr_1fr] gap-x-2">
                <Line label="Publication title" value={p.title} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { title: v }) })} />
                <Line label="Where published" value={p.publication} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { publication: v || undefined }) })} className="text-ink-3" />
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
