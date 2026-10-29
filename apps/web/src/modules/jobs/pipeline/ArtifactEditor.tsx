"use client";
import { useEffect, useRef, useState } from "react";
import { Check, History, Loader2, RefreshCw, Undo2, Columns2 } from "lucide-react";
import type { ApplicationArtifact, ArtifactType } from "@/domain/applications/types";
import { PROVENANCE_META } from "@/domain/workflow/resolve";
import { formatDate, formatTime } from "@/lib/format";
import { markdownToHtml } from "@/lib/richtext";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { RichTextEditor } from "./RichTextEditor";
import { cn } from "@/lib/cn";

const LABEL: Record<ArtifactType, string> = { resume: "Resume", cover_letter: "Cover letter", answers: "Screening answers" };
const AUTOSAVE_DELAY_MS = 800;

/**
 * Owns the autosave debounce for one version's content. Keyed by the
 * version's id at the callsite (below) so switching to a different version
 * — a regenerate, a restore, or the parent's own `key={tab}` remount on tab
 * change — mounts a fresh instance with fresh state, rather than needing an
 * effect to reset it.
 */
function AutosavingEditor({ type, content, onSave, disabled }: { type: ArtifactType; content: string; onSave: (content: string) => void; disabled?: boolean }) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const savedRef = useRef(content);
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  });

  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current != null && pendingRef.current !== savedRef.current) {
      onSaveRef.current(pendingRef.current);
      savedRef.current = pendingRef.current;
    }
    setSaveState("saved");
  };

  // Autosave must not lose the last <800ms of typing when the user navigates away — the parent
  // remounts a fresh editor per tab/version, which unmounts this one immediately.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRef.current != null && pendingRef.current !== savedRef.current) onSaveRef.current(pendingRef.current);
    },
    [],
  );

  const handleChange = (markdown: string) => {
    pendingRef.current = markdown;
    if (markdown === savedRef.current) {
      setSaveState("saved");
      return;
    }
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-end">
        <span className="inline-flex items-center gap-1 text-[12px] text-ink-3" role="status" aria-live="polite">
          {saveState === "saving" ? (
            <>
              <Loader2 className="size-3.5 wj-animate-spin" aria-hidden /> Saving…
            </>
          ) : saveState === "saved" ? (
            <>
              <Check className="size-3.5 text-success-600" aria-hidden /> Saved
            </>
          ) : null}
        </span>
      </div>
      <RichTextEditor content={content} onChange={handleChange} disabled={disabled} ariaLabel={LABEL[type]} />
    </div>
  );
}

/** Edit (rich text, autosaving) / regenerate / compare / restore an artifact's versions (spec §16). */
export function ArtifactEditor({ type, artifact, onSave, onRegenerate, onRestore, regenerating, disabled }: { type: ArtifactType; artifact?: ApplicationArtifact; onSave: (content: string) => void; onRegenerate: () => void; onRestore: (versionId: string) => void; regenerating?: boolean; disabled?: boolean }) {
  const current = artifact?.versions.find((v) => v.id === artifact.currentVersionId);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const compare = artifact?.versions.find((v) => v.id === compareId);

  if (!artifact || !current) {
    return (
      <div className="rounded-[16px] border border-dashed border-line-strong p-6 text-center">
        <p className="text-[14px] font-medium text-ink">No {LABEL[type].toLowerCase()} yet</p>
        <p className="mt-1 text-[13px] text-ink-3">Wonder can draft one from your Career Profile and this role. You&apos;ll review it before anything is sent.</p>
        <Button className="mt-4" size="sm" onClick={onRegenerate} loading={regenerating} disabled={disabled} icon={<RefreshCw className="size-3.5" aria-hidden />}>
          Generate {LABEL[type].toLowerCase()}
        </Button>
      </div>
    );
  }
  const prov = PROVENANCE_META[current.provenance];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={prov.tone}>{prov.label}</Badge>
        <span className="text-[12px] text-ink-3">
          v{artifact.versions.indexOf(current) + 1} of {artifact.versions.length} · {formatDate(current.createdAt)} {formatTime(current.createdAt)}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" icon={<RefreshCw className="size-3.5" aria-hidden />} onClick={onRegenerate} loading={regenerating} disabled={disabled}>
            Regenerate
          </Button>
          {artifact.versions.length > 1 && (
            <Button size="sm" variant="ghost" icon={<History className="size-3.5" aria-hidden />} onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
              Versions
            </Button>
          )}
        </div>
      </div>

      {showHistory && (
        <ul className="mb-3 divide-y divide-line rounded-[14px] border border-line">
          {[...artifact.versions].reverse().map((v, i) => {
            const isCurrent = v.id === artifact.currentVersionId;
            return (
              <li key={v.id} className={cn("flex flex-wrap items-center gap-2 p-2.5 text-[12px]", isCurrent && "bg-brand-50/60")}>
                <span className="font-medium text-ink">v{artifact.versions.length - i}</span>
                <Badge tone={PROVENANCE_META[v.provenance].tone}>{PROVENANCE_META[v.provenance].label}</Badge>
                <span className="text-ink-3">
                  {formatDate(v.createdAt)} {formatTime(v.createdAt)}
                  {v.note ? ` · ${v.note}` : ""}
                </span>
                <span className="ml-auto flex gap-1">
                  {!isCurrent && (
                    <>
                      <Button size="sm" variant="ghost" icon={<Columns2 className="size-3.5" aria-hidden />} onClick={() => setCompareId(compareId === v.id ? null : v.id)} aria-pressed={compareId === v.id}>
                        Compare
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" aria-hidden />} onClick={() => onRestore(v.id)}>
                        Restore
                      </Button>
                    </>
                  )}
                  {isCurrent && <span className="text-brand-700">Current</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {compare ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Current</p>
            <div className="rounded-[14px] bg-surface-2 p-4 text-[13px] leading-relaxed text-ink-2" dangerouslySetInnerHTML={{ __html: markdownToHtml(current.content) }} />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Comparing</p>
            <div className="rounded-[14px] bg-surface-2 p-4 text-[13px] leading-relaxed text-ink-2" dangerouslySetInnerHTML={{ __html: markdownToHtml(compare.content) }} />
          </div>
        </div>
      ) : (
        <AutosavingEditor key={current.id} type={type} content={current.content} onSave={onSave} disabled={disabled} />
      )}
      <p className="mt-3 text-[12px] text-ink-4">Your edits save automatically. Regenerating creates a new version — your current one stays available under Versions.</p>
    </div>
  );
}
