import { historyDraftSize, MAX_AI_RESUME_CHARS } from "@/domain/career/historyImport";
import { parseHistory } from "./parseHistory";
import { parseResume } from "./parseResume";

const MAX_TEXT = 200_000;

/**
 * One reading of a résumé for the Career Profile: profile fields (`parseResume`), history entries
 * (`parseHistory`) and the text itself (capped) for the candidate's own AI model, if they ask it to read
 * too. Shared by the import route (a file or pasted text) and the stored-file route.
 */
export function readResumeProposal(text: string, format: string, readable: boolean) {
  if (!readable) {
    return {
      ok: false as const,
      error:
        format === "pdf"
          ? "Wonder couldn't find any text in that PDF — it's probably a scan or an image. Copy the text from your resume and paste it instead."
          : "There wasn't enough readable text in that file. Paste your resume text instead.",
    };
  }
  const body = text.slice(0, MAX_TEXT);
  const draft = parseResume(body);
  const history = parseHistory(body);
  if (!Object.keys(draft.evidence).length && !historyDraftSize(history)) {
    return { ok: false as const, error: "Wonder couldn't recognise anything to fill in from that. Check it's the right file, or fill your Career Profile in directly." };
  }
  return { ok: true as const, body: { ok: true, format, draft, history, text: body.slice(0, MAX_AI_RESUME_CHARS), characters: body.length } };
}
