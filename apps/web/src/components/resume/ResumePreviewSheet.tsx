"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Download, Pencil, Plus, X } from "lucide-react";
import type { ResumeBullet, ResumeDocument, ResumeSection } from "@/domain/resume/document";
import { groupSkills } from "@/domain/resume/document";
import { editedBullet, finishEdit } from "@/domain/resume/edit";
import type { TemplateDesign } from "@/domain/resume/templates";
import { fontKey } from "@/domain/resume/fonts";
import { formatRange } from "@/domain/career/history";
import type { GeneratedResume } from "@/services/resume/generate";
import { ResumeFonts, ResumePage } from "./ResumePage";
import { cn } from "@/lib/cn";

/**
 * A generated résumé, full screen (owner, 2026-10-25): every page edge to edge, Edit to change its words in
 * place — in the template's own format (fonts, colours, headings, chips, a round bullet on every line) — Cancel to
 * drop the changes, Save to keep them (the pages re-flow in the same template) and Download for the Word file of
 * what's on screen, edits included.
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
          <span className="block truncate text-[12px] text-ink-3">{draft ? "Tap any text to change it" : `${subtitle} · ${current.layout.pages.length} ${current.layout.pages.length === 1 ? "page" : "pages"}`}</span>
        </span>
        {draft ? (
          <>
            {/* Cancel drops every change made since Edit; nothing is saved. */}
            <button type="button" onClick={() => setDraft(null)} className={cn(btn, "border border-line bg-surface text-ink")}>
              Cancel
            </button>
            <button type="button" onClick={save} className={cn(btn, "wj-gradient-bg text-white")}>
              <Check className="size-4" aria-hidden /> Save
            </button>
          </>
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
          <ResumeEditor doc={draft} design={current.template.design} onChange={setDraft} />
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

/** Points on the page to pixels in the editor: the same proportions, large enough to type in on a phone. */
const PX = 1.6;

/** An input exactly as wide as its words (`field-sizing`), so separators and chip edges sit where the page has them. */
const FIT = { fieldSizing: "content" } as React.CSSProperties;

const fieldBase = "block w-full min-w-0 resize-none rounded-[4px] border border-transparent bg-transparent p-0 outline-none hover:border-dashed hover:border-[#c9c6ea] focus:border-solid focus:border-brand-400 focus:bg-brand-50/30";

/** A text field that grows with its words, styled by the caller to look like the page. */
function Text({ value, onChange, label, style, className, multiline = false, onEnter, onEmptyBackspace, focusToken }: { value: string; onChange: (v: string) => void; label: string; style?: React.CSSProperties; className?: string; multiline?: boolean; onEnter?: () => void; onEmptyBackspace?: () => void; focusToken?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Asked to take the cursor (a new line after Enter, the line above after removing one): at the end of its words.
  useEffect(() => {
    const el = ref.current;
    if (!focusToken || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusToken]);
  // Grows to its words on every change, on a width change and once the template's fonts have loaded.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "0px";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [value]);
  return (
    <textarea
      ref={ref}
      aria-label={label}
      rows={1}
      value={value}
      onChange={(e) => onChange(multiline ? e.target.value : e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          onEnter?.();
        } else if (e.key === "Backspace" && !value && onEmptyBackspace) {
          e.preventDefault();
          onEmptyBackspace();
        }
      }}
      className={cn(fieldBase, className)}
      style={style}
    />
  );
}

/** Lines with a round bullet each: Enter starts the next line, Backspace on an empty line removes it. */
function BulletList({ items, onChange, label, design, font }: { items: ResumeBullet[]; onChange: (b: ResumeBullet[]) => void; label: string; design: TemplateDesign; font: React.CSSProperties }) {
  // Which line takes the cursor next, with a fresh token each time so the same line can be asked twice.
  const [focus, setFocus] = useState<{ at: number; token: number }>({ at: -1, token: 0 });
  const moveTo = (at: number) => setFocus((f) => ({ at, token: f.token + 1 }));
  const set = (k: number, text: string) => onChange(items.map((b, j) => (j === k ? editedBullet(b, text) : b)));
  const insertAfter = (k: number) => {
    onChange([...items.slice(0, k + 1), editedBullet(undefined, ""), ...items.slice(k + 1)]);
    moveTo(k + 1);
  };
  const remove = (k: number) => {
    onChange(items.filter((_, j) => j !== k));
    moveTo(Math.max(0, k - 1));
  };
  return (
    <ul className="flex flex-col" style={{ gap: design.space.bullet * PX }}>
      {items.map((b, k) => (
        <li key={k} className="flex items-start" style={{ gap: 6 }}>
          <span aria-hidden className="shrink-0 select-none" style={{ ...font, color: design.theme.muted, width: design.space.bulletIndent * PX - 6, lineHeight: design.lineHeight }}>
            •
          </span>
          <Text label={`${label}, line ${k + 1}`} value={b.text} onChange={(v) => set(k, v)} onEnter={() => insertAfter(k)} onEmptyBackspace={() => remove(k)} focusToken={focus.at === k ? focus.token : undefined} style={{ ...font, color: design.theme.text, lineHeight: design.lineHeight }} />
        </li>
      ))}
      <li>
        <button type="button" onClick={() => insertAfter(items.length - 1)} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:underline" style={{ marginLeft: design.space.bulletIndent * PX }}>
          <Plus className="size-3.5" aria-hidden /> Add line
        </button>
      </li>
    </ul>
  );
}

/** Chips, as the template draws skills and strengths: each one editable, × to remove, + to add. */
function ChipList({ items, onChange, label, design, font }: { items: string[]; onChange: (v: string[]) => void; label: string; design: TemplateDesign; font: React.CSSProperties }) {
  return (
    <div className="flex flex-wrap" style={{ gap: 4 * PX }}>
      {items.map((it, k) => (
        <span key={k} className="inline-flex items-center rounded-[4px]" style={{ background: design.theme.tint, padding: `${2 * PX}px ${6 * PX}px`, color: design.theme.text }}>
          <input aria-label={`${label} ${k + 1}`} value={it} size={Math.max(2, Math.ceil(it.length * 0.85))} onChange={(e) => onChange(items.map((x, j) => (j === k ? e.target.value : x)))} className="min-w-[2ch] bg-transparent outline-none" style={{ ...font, ...FIT, fontSize: design.size.small * PX }} />
          <button type="button" aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((_, j) => j !== k))} className="ml-1 text-ink-4 hover:text-danger-600">
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <button type="button" onClick={() => onChange([...items, ""])} aria-label={`Add to ${label}`} className="inline-flex items-center rounded-[4px] border border-dashed border-line px-2 text-[12px] text-brand-600">
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function ResumeEditor({ doc, design: d, onChange }: { doc: ResumeDocument; design: TemplateDesign; onChange: (doc: ResumeDocument) => void }) {
  const h = doc.header;
  const fam = (f: keyof TemplateDesign["fonts"], w: 400 | 600 | 700) => ({ fontFamily: `wj-${fontKey(d.fonts[f], w)}, Inter, system-ui, sans-serif` });
  const body: React.CSSProperties = { ...fam("body", 400), fontSize: d.size.body * PX };
  const center = d.header === "centered" || d.header === "band";
  const align = center ? "text-center" : "text-left";
  const setHeader = (patch: Partial<ResumeDocument["header"]>) => onChange({ ...doc, header: { ...h, ...patch } });
  const at = (type: ResumeSection["type"]) => doc.sections.findIndex((s) => s.type === type);
  const setSection = (i: number, s: ResumeSection) => onChange({ ...doc, sections: doc.sections.map((x, j) => (j === i ? s : x)) });
  const item = <T,>(items: T[], k: number, patch: Partial<T>) => items.map((x, j) => (j === k ? { ...x, ...patch } : x));
  const contact: [keyof ResumeDocument["header"], string][] = [["location", "Location"], ["phone", "Phone"], ["email", "Email"], ["linkedinUrl", "LinkedIn"], ["portfolioUrl", "Portfolio"], ["websiteUrl", "Website"]];
  const shown = contact.filter(([k]) => h[k]);
  const sep = d.header === "left" || d.header === "left-accent" ? "|" : "·";

  return (
    // The template's page, at a size made for typing: margins, fonts, colours, headings and order as it prints.
    <div className="mx-auto max-w-[860px] bg-white sm:my-2 sm:shadow-sm" style={{ padding: `${d.page.margin.top * 0.6}px ${Math.min(d.page.margin.left * 0.5, 24)}px`, color: d.theme.text }}>
      <header className={cn("flex flex-col", center ? "items-center" : "items-start")} style={{ background: d.header === "band" ? d.theme.tint : undefined, gap: 2 }}>
        <Text label="Name" value={h.name} onChange={(v) => setHeader({ name: v })} className={cn(align, d.nameCase === "upper" && "uppercase")} style={{ ...fam("name", 700), fontSize: d.size.name * PX * 0.8, lineHeight: 1.15, color: d.header === "left-accent" ? d.theme.primary : d.theme.text }} />
        <Text label="Headline" value={h.headline ?? ""} onChange={(v) => setHeader({ headline: v || undefined })} className={align} style={{ ...fam("body", 400), fontSize: d.size.headline * PX, lineHeight: d.lineHeight, color: d.header === "left-accent" ? d.theme.primary : d.theme.muted }} />
        <div className={cn("flex flex-wrap items-center gap-x-1.5", center && "justify-center")} style={{ ...fam("body", 400), fontSize: d.size.contact * PX, color: d.theme.muted }}>
          {shown.map(([k, l], n) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              {n > 0 && <span aria-hidden>{sep}</span>}
              <input aria-label={l} value={h[k] ?? ""} size={Math.max(2, Math.ceil((h[k] ?? "").length * 0.85))} onChange={(e) => setHeader({ [k]: e.target.value || undefined })} className="min-w-[2ch] max-w-full bg-transparent text-center outline-none hover:underline hover:decoration-dashed focus:bg-brand-50/30" style={FIT} />
            </span>
          ))}
        </div>
      </header>
      {d.sections.map(({ type, title }) => {
        const i = at(type);
        if (i < 0) return null;
        const s = doc.sections[i];
        return (
          <section key={type} style={{ marginTop: d.space.section * PX }}>
            <h3 className={cn("font-semibold", d.sectionCase === "upper" && "uppercase tracking-wide")} style={{ ...fam("heading", 600), fontSize: d.size.section * PX, color: d.sectionHeading === "plain" ? d.theme.text : d.theme.primary, borderBottom: d.sectionHeading === "rule" ? `1px solid ${d.theme.border}` : undefined, background: d.sectionHeading === "bar" ? d.theme.tint : undefined, paddingBottom: 2, marginBottom: d.space.afterHeading * PX }}>
              {title}
            </h3>
            {s.type === "summary" && <Text multiline label={title} value={s.text} onChange={(v) => setSection(i, { ...s, text: v })} style={{ ...body, lineHeight: d.lineHeight }} />}
            {s.type === "selected_achievements" && <BulletList label={title} items={s.items} onChange={(items) => setSection(i, { ...s, items })} design={d} font={body} />}
            {s.type === "strengths" && <BulletList label={title} items={s.items.map((t) => editedBullet(undefined, t, true))} onChange={(items) => setSection(i, { ...s, items: items.map((x) => x.text) })} design={d} font={body} />}
            {(s.type === "transferable_skills" || s.type === "research_interests") && <ChipList label={title} items={s.items} onChange={(items) => setSection(i, { ...s, items })} design={d} font={body} />}
            {s.type === "skills" && <ChipList label={title} items={s.ordered ?? s.groups.flatMap((g) => g.skills)} onChange={(list) => setSection(i, { ...s, ordered: list, groups: groupSkills(list.map((x) => x.trim()).filter(Boolean)) })} design={d} font={body} />}
            {s.type === "experience" &&
              s.items.map((e, k) => {
                const employer = <Text label="Employer" value={e.employer} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { employer: v }) })} style={{ ...fam("heading", 700), fontSize: d.size.entryTitle * PX }} />;
                const role = <Text label="Title" value={e.title} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { title: v }) })} style={{ ...fam("heading", 600), fontSize: d.size.body * PX, color: d.theme.primary }} />;
                const muted: React.CSSProperties = { ...fam("body", 400), fontSize: d.size.small * PX, color: d.theme.muted, whiteSpace: "nowrap" };
                return (
                  <div key={e.id} style={{ marginTop: k ? d.space.entry * PX : 0 }}>
                    <div className="flex items-baseline gap-3">
                      <div className="min-w-0 flex-1">{d.entry === "company-first" ? employer : role}</div>
                      <span style={muted}>{formatRange(e.startDate, e.endDate, e.current)}</span>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <div className="min-w-0 flex-1">{d.entry === "company-first" ? role : employer}</div>
                      {e.location && <span style={muted}>{e.location}</span>}
                    </div>
                    <div style={{ marginTop: 2 * PX }}>
                      <BulletList label={`${e.title} at ${e.employer}`} items={e.bullets} onChange={(bullets) => setSection(i, { ...s, items: item(s.items, k, { bullets }) })} design={d} font={body} />
                    </div>
                  </div>
                );
              })}
            {s.type === "education" &&
              s.items.map((e, k) => (
                <div key={e.id} style={{ marginTop: k ? (d.space.entry - 2) * PX : 0 }}>
                  <Text label="Institution" value={e.institution} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { institution: v }) })} style={{ ...fam("heading", 700), fontSize: d.size.entryTitle * PX }} />
                  <Text label="Degree" value={[e.degree, e.field].filter(Boolean).join(", ")} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { degree: v || undefined, field: undefined }) })} style={{ ...body, color: d.theme.muted }} />
                </div>
              ))}
            {s.type === "certifications" && (
              <BulletList
                label={title}
                items={s.items.map((c) => editedBullet(undefined, [c.name, c.issuer].filter(Boolean).join(" — "), true))}
                onChange={(lines) => setSection(i, { ...s, items: lines.map((l, k) => { const [name, issuer] = l.text.split(/\s+—\s+/); return { ...(s.items[k] ?? { id: `cert-edit-${k}` }), name: name ?? "", issuer: issuer || undefined }; }) })}
                design={d}
                font={body}
              />
            )}
            {s.type === "projects" &&
              s.items.map((p, k) => (
                <div key={p.id} style={{ marginTop: k ? d.space.entry * PX : 0 }}>
                  <Text label="Project" value={p.name} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { name: v }) })} style={{ ...fam("heading", 700), fontSize: d.size.entryTitle * PX }} />
                  {p.description !== undefined && <Text multiline label="Description" value={p.description} onChange={(v) => setSection(i, { ...s, items: item(s.items, k, { description: v }) })} style={{ ...body, lineHeight: d.lineHeight }} />}
                  {!!p.bullets?.length && <BulletList label={p.name} items={p.bullets} onChange={(bullets) => setSection(i, { ...s, items: item(s.items, k, { bullets }) })} design={d} font={body} />}
                </div>
              ))}
            {s.type === "publications" && (
              <BulletList label={title} items={s.items.map((p) => editedBullet(undefined, [p.title, p.publication].filter(Boolean).join(" — "), true))} onChange={(lines) => setSection(i, { ...s, items: lines.map((l, k) => { const [t, pub] = l.text.split(/\s+—\s+/); return { ...(s.items[k] ?? { id: `pub-edit-${k}` }), title: t ?? "", publication: pub || undefined }; }) })} design={d} font={body} />
            )}
          </section>
        );
      })}
    </div>
  );
}
