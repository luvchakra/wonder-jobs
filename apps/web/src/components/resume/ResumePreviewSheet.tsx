"use client";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, Download, Pencil, X } from "lucide-react";
import type { ResumeBullet, ResumeDocument, ResumeSection } from "@/domain/resume/document";
import { editBullet, finishEdit, listFrom, skillsFromList } from "@/domain/resume/edit";
import { fontKey, type Weight } from "@/domain/resume/fonts";
import type { FontFamilyKey, ResumeTemplate } from "@/domain/resume/templates";
import type { GeneratedResume } from "@/services/resume/generate";
import { ResumeFonts, ResumePage } from "./ResumePage";
import { cn } from "@/lib/cn";

/**
 * A generated résumé, full screen (owner, 2026-10-25): every page edge to edge, Edit to change its words in
 * place (header, summary, skills, roles and their bullets…), Save to keep them — the pages re-flow in the same
 * template — and Download for the Word file of what's on screen, edits included. Editing keeps the format
 * (owner, 2026-10-25): the editor wears the template's fonts, colours, headings, order and round bullets,
 * every line item is its own bullet, and Cancel (or Escape) leaves with nothing changed.
 */
export function ResumePreviewSheet({ resume, file, subtitle, onClose, onDownload, onSave, downloading }: { resume: GeneratedResume; file: string; subtitle: string; onClose: () => void; onDownload: (r: GeneratedResume) => void; onSave: (doc: ResumeDocument) => GeneratedResume | null; downloading: boolean }) {
  const [current, setCurrent] = useState(resume);
  const [draft, setDraft] = useState<ResumeDocument | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (draft ? setDraft(null) : onClose());
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
        {draft ? null : (
          <button type="button" onClick={onClose} aria-label="Close preview" className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
            <X className="size-5" aria-hidden />
          </button>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-ink" title={file}>{draft ? "Editing your résumé" : file}</span>
          <span className="block truncate text-[12px] text-ink-3">{draft ? "Tap any text to change it" : `${subtitle} · ${current.layout.pages.length} ${current.layout.pages.length === 1 ? "page" : "pages"}`}</span>
        </span>
        {draft ? (
          <>
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
          <ResumeEditor doc={draft} template={current.template} onChange={setDraft} />
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

/** Grows with its words, so nothing is ever cut off while editing; `single` keeps it one paragraph (Enter does nothing). */
function Text({ value, onChange, label, style, single, placeholder, onKeyDown, inputRef }: { value: string | undefined; onChange: (v: string) => void; label: string; style?: CSSProperties; single?: boolean; placeholder?: string; onKeyDown?: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void; inputRef?: (el: HTMLTextAreaElement | null) => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  });
  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        inputRef?.(el);
      }}
      aria-label={label}
      rows={1}
      value={value ?? ""}
      placeholder={placeholder ?? label}
      onChange={(e) => onChange(single ? e.target.value.replace(/\n+/g, " ") : e.target.value)}
      onKeyDown={(e) => {
        if (single && e.key === "Enter") e.preventDefault();
        onKeyDown?.(e);
      }}
      style={style}
      className="block w-full resize-none overflow-hidden rounded-[4px] border border-transparent bg-transparent px-0.5 outline-none placeholder:text-ink-4 hover:border-line focus:border-brand-400 focus:bg-brand-50/40"
    />
  );
}

/** Line items as round bullets, one box each: Enter starts the next bullet, Backspace in an empty one removes it. */
function Bullets<T>({ items, text, make, onChange, label, color, style }: { items: T[]; text: (t: T) => string; make: (before: T | undefined, words: string) => T; onChange: (items: T[]) => void; label: string; color: string; style: CSSProperties }) {
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  // The bullet to move into once the split or removal has rendered.
  const focus = useRef<{ at: number; caret: "start" | "end" } | null>(null);
  useLayoutEffect(() => {
    const want = focus.current;
    const el = want && refs.current[want.at];
    if (!want || !el) return;
    focus.current = null;
    el.focus();
    const at = want.caret === "start" ? 0 : el.value.length;
    el.setSelectionRange(at, at);
  });
  const list = items.length ? items : [make(undefined, "")];
  return (
    <ul className="flex flex-col">
      {list.map((it, k) => (
        <li key={k} className="flex items-start">
          <span aria-hidden className="shrink-0 select-none text-center" style={{ ...style, color, width: "1.1em" }}>
            •
          </span>
          <Text
            label={`${label} ${k + 1}`}
            placeholder="Add a line"
            single
            value={text(it)}
            style={style}
            inputRef={(el) => (refs.current[k] = el)}
            onChange={(v) => onChange(list.map((x, j) => (j === k ? make(x, v) : x)))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const el = e.currentTarget;
                const words = el.value;
                const at = el.selectionStart ?? words.length;
                onChange([...list.slice(0, k), make(it, words.slice(0, at)), make(undefined, words.slice(at)), ...list.slice(k + 1)]);
                focus.current = { at: k + 1, caret: "start" };
              } else if (e.key === "Backspace" && !e.currentTarget.value && list.length > 1) {
                e.preventDefault();
                onChange(list.filter((_, j) => j !== k));
                focus.current = { at: Math.max(0, k - 1), caret: "end" };
              }
            }}
          />
        </li>
      ))}
    </ul>
  );
}

function ResumeEditor({ doc, template, onChange }: { doc: ResumeDocument; template: ResumeTemplate; onChange: (d: ResumeDocument) => void }) {
  const d = template.design;
  const h = doc.header;
  const setHeader = (patch: Partial<ResumeDocument["header"]>) => onChange({ ...doc, header: { ...h, ...patch } });
  const setSection = (s: ResumeSection) => onChange({ ...doc, sections: doc.sections.map((x) => (x.type === s.type ? s : x)) });
  const item = <T,>(items: T[], k: number, patch: Partial<T>) => items.map((x, j) => (j === k ? { ...x, ...patch } : x));

  // The template's own type, colours and proportions, with body text at a size that's easy to edit on a phone.
  const k = 14 / d.size.body;
  const px = (pt: number) => `${Math.round(pt * k * 10) / 10}px`;
  const font = (family: FontFamilyKey, weight: Weight) => `"wj-${fontKey(family, weight)}", system-ui, sans-serif`;
  const accent = d.theme.primary === "#000000" ? d.theme.text : d.theme.primary;
  const body: CSSProperties = { fontFamily: font(d.fonts.body, 400), fontSize: px(d.size.body), lineHeight: d.lineHeight, color: d.theme.text };
  const muted: CSSProperties = { ...body, fontSize: px(d.size.small), color: d.theme.muted };
  const semi: CSSProperties = { ...body, fontFamily: font(d.fonts.body, 600) };
  const entryTitle: CSSProperties = { ...body, fontFamily: font(d.fonts.heading, 700), fontSize: px(d.size.entryTitle) };
  const center = d.header === "centered" || (d.header === "band" && template.family !== "creative");
  const align: CSSProperties = { textAlign: center ? "center" : "left" };
  const contact: CSSProperties = { ...body, ...align, fontSize: px(d.size.contact), color: d.theme.muted };

  const heading = (title: string) => (
    <h3
      className="mb-1 flex items-center gap-2"
      style={{
        fontFamily: font(d.fonts.heading, 700),
        fontSize: px(d.size.section),
        color: d.sectionHeading === "plain" ? d.theme.text : d.theme.primary,
        textTransform: d.sectionCase === "upper" ? "uppercase" : undefined,
        letterSpacing: d.sectionCase === "upper" ? "0.04em" : undefined,
        borderBottom: d.sectionHeading === "rule" ? `1px solid ${d.theme.border}` : undefined,
        paddingBottom: d.sectionHeading === "rule" ? 3 : 0,
      }}
    >
      {d.sectionHeading === "bar" && <span aria-hidden className="inline-block w-[3px] self-stretch" style={{ background: d.theme.primary }} />}
      {title}
    </h3>
  );

  const strings = { text: (s: string) => s, make: (_: string | undefined, v: string) => v };
  const bullet = { text: (b: ResumeBullet) => b.text, make: editBullet };

  return (
    // The résumé's own page, in its template: the same order, headings and type, each word editable where it stands.
    <div className="mx-auto max-w-[860px] bg-white px-4 py-5 sm:my-2 sm:px-10 sm:shadow-sm">
      <div className="flex flex-col gap-0.5" style={d.header === "band" ? { background: d.theme.tint, margin: "-1.25rem -1rem 0", padding: "1.25rem 1rem 0.75rem" } : undefined}>
        <Text
          label="Name"
          single
          value={h.name}
          onChange={(v) => setHeader({ name: v })}
          style={{ ...align, fontFamily: font(d.fonts.name, d.fonts.name === "serif" ? 600 : 700), fontSize: px(Math.min(d.size.name, d.size.body * 2.3)), lineHeight: 1.18, color: d.header === "left-accent" || template.family === "creative" ? d.theme.primary : d.theme.text, textTransform: d.nameCase === "upper" ? "uppercase" : undefined }}
        />
        <Text
          label="Headline"
          single
          value={h.headline}
          onChange={(v) => setHeader({ headline: v || undefined })}
          style={{ ...semi, ...align, fontSize: px(d.size.headline), color: template.family === "executive" || d.header === "left-accent" ? d.theme.primary : d.theme.muted, textTransform: d.header === "band" && template.family !== "creative" ? "uppercase" : undefined }}
        />
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Text label="Location" single value={h.location} onChange={(v) => setHeader({ location: v || undefined })} style={contact} />
          <Text label="Phone" single value={h.phone} onChange={(v) => setHeader({ phone: v || undefined })} style={contact} />
          <Text label="Email" single value={h.email} onChange={(v) => setHeader({ email: v || undefined })} style={contact} />
          <Text label="LinkedIn" single value={h.linkedinUrl} onChange={(v) => setHeader({ linkedinUrl: v || undefined })} style={{ ...contact, wordBreak: "break-all" }} />
        </div>
        {d.header === "left-accent" && <div aria-hidden className="mt-1 h-[1.6px]" style={{ background: d.theme.primary }} />}
      </div>
      {d.sections.map(({ type, title }) => {
        const s = doc.sections.find((x) => x.type === type);
        if (!s) return null;
        return (
          <section key={type} className="mt-4">
            {heading(title)}
            {s.type === "summary" && <Text label={title} value={s.text} onChange={(v) => setSection({ ...s, text: v })} style={body} />}
            {s.type === "strengths" && <Bullets label={title} items={s.items} {...strings} onChange={(items) => setSection({ ...s, items })} color={accent} style={body} />}
            {s.type === "selected_achievements" && <Bullets label={title} items={s.items} {...bullet} onChange={(items) => setSection({ ...s, items })} color={accent} style={body} />}
            {(s.type === "transferable_skills" || s.type === "research_interests") && <Text label={`${title}, separated by commas`} value={s.items.join(", ")} onChange={(v) => setSection({ ...s, items: listFrom(v) })} style={body} />}
            {s.type === "skills" &&
              (d.skills === "grouped" ? (
                s.groups.map((g, gi) => (
                  <div key={g.name} className="flex items-start gap-1">
                    <span className="shrink-0 py-px" style={semi}>
                      {g.name}:
                    </span>
                    <Text
                      label={`${g.name}, separated by commas`}
                      value={g.skills.join(", ")}
                      onChange={(v) => {
                        const groups = s.groups.map((x, j) => (j === gi ? { ...x, skills: listFrom(v) } : x)).filter((x) => x.skills.length > 0);
                        setSection({ ...s, groups, ordered: groups.flatMap((x) => x.skills) });
                      }}
                      style={body}
                    />
                  </div>
                ))
              ) : d.skills === "columns" ? (
                <Bullets
                  label={title}
                  items={s.ordered ?? s.groups.flatMap((g) => g.skills)}
                  {...strings}
                  onChange={(list) => setSection({ ...s, groups: skillsFromList(list.filter((x) => x.trim()), s.groups), ordered: list })}
                  color={accent}
                  style={body}
                />
              ) : (
                <Text
                  label={`${title}, separated by commas`}
                  value={(s.ordered ?? s.groups.flatMap((g) => g.skills)).join(", ")}
                  onChange={(v) => {
                    const list = listFrom(v);
                    setSection({ ...s, groups: skillsFromList(list, s.groups), ordered: list });
                  }}
                  style={body}
                />
              ))}
            {s.type === "experience" &&
              s.items.map((e, ek) => {
                const set = (patch: Partial<typeof e>) => setSection({ ...s, items: item(s.items, ek, patch) });
                const dates = (
                  <span className="flex shrink-0 items-start" style={muted}>
                    <Text label="Start" single value={e.startDate} onChange={(v) => set({ startDate: v })} style={{ ...muted, width: "5.5em", textAlign: "right" }} />
                    <span className="py-px">–</span>
                    <Text label="End" single value={e.current ? "Present" : e.endDate} placeholder="Present" onChange={(v) => set(/^present$/i.test(v.trim()) || !v.trim() ? { current: true, endDate: undefined } : { current: false, endDate: v })} style={{ ...muted, width: "5.5em" }} />
                  </span>
                );
                const employer = <Text label="Employer" single value={e.employer} onChange={(v) => set({ employer: v })} style={d.entry === "company-first" ? entryTitle : { ...semi, color: d.theme.muted }} />;
                const role = <Text label="Title" single value={e.title} onChange={(v) => set({ title: v })} style={d.entry === "company-first" ? { ...semi, color: accent } : entryTitle} />;
                return (
                  <div key={e.id} className="mt-2 flex flex-col">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">{d.entry === "company-first" ? employer : role}</div>
                      {dates}
                    </div>
                    {d.entry === "company-first" ? role : employer}
                    {e.summary !== undefined && <Text label={`${e.employer} summary`} value={e.summary} onChange={(v) => set({ summary: v || undefined })} style={{ ...body, color: d.theme.muted }} />}
                    <Bullets label={`${e.title} at ${e.employer}`} items={e.bullets} {...bullet} onChange={(bullets) => set({ bullets })} color={accent} style={body} />
                  </div>
                );
              })}
            {s.type === "education" &&
              s.items.map((e, ek) => (
                <div key={e.id} className="mt-1 flex flex-col">
                  <Text label="Institution" single value={e.institution} onChange={(v) => setSection({ ...s, items: item(s.items, ek, { institution: v }) })} style={entryTitle} />
                  <div className="grid grid-cols-2 gap-x-2">
                    <Text label="Degree" single value={e.degree} onChange={(v) => setSection({ ...s, items: item(s.items, ek, { degree: v || undefined }) })} style={{ ...body, color: d.theme.muted }} />
                    <Text label="Field" single value={e.field} onChange={(v) => setSection({ ...s, items: item(s.items, ek, { field: v || undefined }) })} style={{ ...body, color: d.theme.muted }} />
                  </div>
                </div>
              ))}
            {s.type === "certifications" &&
              s.items.map((c, ck) => (
                <div key={c.id} className="grid grid-cols-[2fr_1fr] gap-x-2">
                  <Text label="Certification" single value={c.name} onChange={(v) => setSection({ ...s, items: item(s.items, ck, { name: v }) })} style={semi} />
                  <Text label="Issuer" single value={c.issuer} onChange={(v) => setSection({ ...s, items: item(s.items, ck, { issuer: v || undefined }) })} style={body} />
                </div>
              ))}
            {s.type === "projects" &&
              s.items.map((p, pk) => (
                <div key={p.id} className="mt-1 flex flex-col">
                  <Text label="Project" single value={p.name} onChange={(v) => setSection({ ...s, items: item(s.items, pk, { name: v }) })} style={entryTitle} />
                  <Text label="Description" value={p.description} onChange={(v) => setSection({ ...s, items: item(s.items, pk, { description: v || undefined }) })} style={body} />
                  {!!p.bullets?.length && <Bullets label={p.name} items={p.bullets} {...bullet} onChange={(bullets) => setSection({ ...s, items: item(s.items, pk, { bullets }) })} color={accent} style={body} />}
                </div>
              ))}
            {s.type === "publications" &&
              s.items.map((p, pk) => (
                <div key={p.id} className="grid grid-cols-[2fr_1fr] gap-x-2">
                  <Text label="Publication title" single value={p.title} onChange={(v) => setSection({ ...s, items: item(s.items, pk, { title: v }) })} style={body} />
                  <Text label="Where published" single value={p.publication} onChange={(v) => setSection({ ...s, items: item(s.items, pk, { publication: v || undefined }) })} style={muted} />
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}
