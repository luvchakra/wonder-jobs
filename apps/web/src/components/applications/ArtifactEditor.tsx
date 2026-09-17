"use client";
import { useState } from "react";
import { History, RefreshCw, Save, Undo2, Columns2 } from "lucide-react";
import type { ApplicationArtifact, ArtifactType } from "@/domain/applications/types";
import { PROVENANCE_META } from "@/domain/workflow/resolve";
import { formatDate, formatTime } from "@/lib/format";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Textarea } from "@/components/common/Input";
import { cn } from "@/lib/cn";

const LABEL: Record<ArtifactType, string> = { resume: "Resume", cover_letter: "Cover letter", answers: "Screening answers" };

/** Edit / regenerate / compare / restore an artifact's versions (spec §16). */
export function ArtifactEditor({ type, artifact, onSave, onRegenerate, onRestore, regenerating, disabled }: { type: ArtifactType; artifact?: ApplicationArtifact; onSave: (content: string) => void; onRegenerate: () => void; onRestore: (versionId: string) => void; regenerating?: boolean; disabled?: boolean }) {
  const current = artifact?.versions.find((v) => v.id === artifact.currentVersionId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [compareId, setCompareId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const compare = artifact?.versions.find((v) => v.id === compareId);

  if (!artifact || !current) {
    return (
      <div className="rounded-[16px] border border-dashed border-line-strong p-6 text-center">
        <p className="text-[14px] font-medium text-ink">No {LABEL[type].toLowerCase()} yet</p>
        <p className="mt-1 text-[13px] text-ink-3">Wonder can draft one from your Career DNA and this role. You&apos;ll review it before anything is sent.</p>
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
          {!editing ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(current.content);
                setEditing(true);
              }}
              disabled={disabled}
            >
              Edit manually
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                icon={<Save className="size-3.5" aria-hidden />}
                onClick={() => {
                  onSave(draft);
                  setEditing(false);
                }}
              >
                Save version
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" icon={<RefreshCw className="size-3.5" aria-hidden />} onClick={onRegenerate} loading={regenerating} disabled={disabled || editing}>
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

      {editing ? (
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[360px] font-mono text-[13px]" aria-label={`Edit ${LABEL[type]}`} />
      ) : compare ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Current</p>
            <pre className="whitespace-pre-wrap rounded-[14px] bg-surface-2 p-4 font-sans text-[13px] leading-relaxed text-ink-2">{current.content}</pre>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Comparing</p>
            <pre className="whitespace-pre-wrap rounded-[14px] bg-surface-2 p-4 font-sans text-[13px] leading-relaxed text-ink-2">{compare.content}</pre>
          </div>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap rounded-[14px] bg-surface-2 p-4 font-sans text-[13px] leading-relaxed text-ink-2">{current.content}</pre>
      )}
      <p className="mt-3 text-[12px] text-ink-4">You can edit this at any time and rerun this step with your changes.</p>
    </div>
  );
}
