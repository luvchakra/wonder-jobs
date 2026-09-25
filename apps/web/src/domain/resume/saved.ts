import type { ResumeDocument } from "./document";

/**
 * A generated résumé, kept so it can be reopened exactly as it was (spec §64, §66–67): the document
 * snapshot (so later Career Profile edits don't change it), and the template id and version it was
 * rendered with (so a later template version doesn't either).
 */
export interface SavedResume {
  id: string;
  templateId: string;
  templateVersion: string;
  createdAt: string;
  document: ResumeDocument;
  pageCount: number;
  /** Set when generated for a job's application. */
  target?: { jobId: string; title: string; company: string; applicationId?: string };
}

export const MAX_SAVED_RESUMES = 20;
