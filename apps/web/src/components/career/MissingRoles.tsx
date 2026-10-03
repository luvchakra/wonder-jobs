"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { sortExperience, type CareerHistory } from "@/domain/career/history";
import { buildHistoryPatch, reviewHistoryImport, type HistoryDraft } from "@/domain/career/historyImport";
import { useCareerStore } from "@/store/career";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { Button } from "@/components/common/Button";

// One read of a stored CV per page load is enough: the file doesn't change under us.
const reads = new Map<string, Promise<HistoryDraft | null>>();
function readHistory(fileId: string) {
  if (!reads.has(fileId))
    reads.set(
      fileId,
      fetch(`/api/resume-files/${encodeURIComponent(fileId)}/read`, { method: "POST" })
        .then(async (r) => (r.ok ? (((await r.json()) as { history?: HistoryDraft }).history ?? null) : null))
        .catch(() => null),
    );
  return reads.get(fileId)!;
}

/**
 * Roles the candidate's own CV lists that their Career Profile doesn't — e.g. one dropped by an older
 * import. Shown with the dates read from the CV; nothing is added until they tap Add, and then only into
 * the unsaved draft (Save changes keeps it).
 */
export function MissingRoles({ history, onAdd }: { history: Partial<CareerHistory>; onAdd: (next: CareerHistory) => void }) {
  const base = useCareerStore((s) => s.baseResume);
  const files = useResumeFilesStore((s) => s.files);
  const loadFiles = useResumeFilesStore((s) => s.load);
  const [read, setRead] = useState<HistoryDraft | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);
  const fileId = base?.kind === "upload" ? base.id : files[0]?.id;
  useEffect(() => {
    if (!fileId) return;
    let live = true;
    void readHistory(fileId).then((h) => live && setRead(h));
    return () => {
      live = false;
    };
  }, [fileId]);

  if (!read || hidden) return null;
  const missing = reviewHistoryImport({ ...read, contact: {}, summary: undefined, education: [], certifications: [] }, history).filter((r) => r.group === "experience" && r.status === "new");
  if (!missing.length) return null;
  return (
    <div role="status" className="mx-4 mt-4 rounded-[14px] border border-warning-600/25 bg-warning-100/40 p-3 md:mx-5">
      <p className="text-[14px] font-semibold text-ink">
        Your CV has {missing.length} role{missing.length === 1 ? "" : "s"} your profile is missing
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {missing.map((m) => (
          <li key={m.key} className="text-[13px] text-ink-2">
            <span className="font-medium text-ink">{m.label}</span> · {m.incoming.split(" · ")[0]}
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex items-center gap-3">
        <Button
          size="sm"
          icon={<Plus className="size-3.5" aria-hidden />}
          onClick={() => {
            const next = buildHistoryPatch({ ...read, contact: {}, summary: undefined, education: [], certifications: [] }, history, missing.map((m) => m.key));
            onAdd({ ...next, experience: sortExperience(next.experience) });
          }}
        >
          Add {missing.length === 1 ? "it" : "them"}
        </Button>
        <button type="button" onClick={() => setHidden(true)} className="text-[13px] font-medium text-ink-3 hover:text-ink">
          Not now
        </button>
      </div>
    </div>
  );
}
