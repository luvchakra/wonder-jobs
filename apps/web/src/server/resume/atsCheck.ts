import { checkAts, type AtsReport } from "@/domain/resume/ats/check";
import { extractResumeText } from "./extractText";
import { fileSignals } from "./fileSignals";
import { analyseHistory } from "./parseHistory";
import { parseResume } from "./parseResume";

/**
 * The ATS check for a résumé file: read it the way the import does (the same text, the same rules),
 * add what the file's own structure shows, and score it. Deterministic; nothing is stored or sent.
 */
export function checkResumeAts(bytes: Buffer, name?: string, sha256?: string): AtsReport {
  const extracted = extractResumeText(bytes, name);
  const signals = fileSignals(bytes, extracted.format);
  const draft = parseResume(extracted.text);
  const { draft: history, outline } = analyseHistory(extracted.text);
  return checkAts({
    file: { name, sha256, signals },
    text: extracted.text,
    readable: extracted.readable,
    profile: { name: draft.name, yearsExperience: draft.yearsExperience, skills: (draft.skills ?? []).map((s) => s.name) },
    history,
    outline,
  });
}
