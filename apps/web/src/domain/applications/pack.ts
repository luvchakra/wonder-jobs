import type { Application, ArtifactType, ArtifactVersion } from "./types";

/**
 * The "Application ready" summary at the top of an Application Pack (outcome spec §21–23). It reads
 * only what actually exists on the application — an artifact is listed as ready only when a version
 * of it is stored, and its provenance says whether the model or the candidate wrote the current text.
 * Nothing here claims an application was sent: the final action is always the candidate's.
 */
export interface PackItem {
  type: ArtifactType;
  label: string;
  ready: boolean;
  /** Who wrote the current version — shown next to the item so an AI draft is never passed off as the candidate's. */
  source?: string;
}

export interface PackSummary {
  title: string;
  ready: boolean;
  readyCount: number;
  total: number;
  items: PackItem[];
}

export const PACK_ITEM_LABEL: Record<ArtifactType, string> = {
  resume: "Tailored résumé",
  cover_letter: "Cover letter",
  answers: "Screening answers",
};

const SOURCE_LABEL: Record<ArtifactVersion["provenance"], string> = {
  AI_GENERATED: "AI-generated draft",
  USER_MODIFIED: "Edited by you",
  USER_PROVIDED: "Written by you",
};

const ORDER: ArtifactType[] = ["resume", "cover_letter", "answers"];

export function describeApplicationPack(app: Application): PackSummary {
  const items = ORDER.map((type): PackItem => {
    const a = app.artifacts.find((x) => x.type === type);
    const current = a?.versions.find((v) => v.id === a.currentVersionId) ?? a?.versions[a.versions.length - 1];
    return { type, label: PACK_ITEM_LABEL[type], ready: !!current, source: current ? SOURCE_LABEL[current.provenance] : undefined };
  });
  const readyCount = items.filter((i) => i.ready).length;
  const ready = readyCount === items.length;
  const title = ready ? "Application ready" : readyCount === 0 ? "Nothing prepared yet" : `${readyCount} of ${items.length} materials ready`;
  return { title, ready, readyCount, total: items.length, items };
}
