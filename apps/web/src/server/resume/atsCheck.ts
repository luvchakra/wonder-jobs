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
  return checkResumeAtsWithText(bytes, name, sha256).report;
}

/** The same check, with the text it read — for anything that adds to the report from that text. */
export function checkResumeAtsWithText(bytes: Buffer, name?: string, sha256?: string): { report: AtsReport; text: string } {
  const extracted = extractResumeText(bytes, name);
  const signals = fileSignals(bytes, extracted.format);
  const draft = parseResume(extracted.text);
  const { draft: history, outline } = analyseHistory(extracted.text);
  const report = checkAts({
    file: { name, sha256, signals },
    text: extracted.text,
    readable: extracted.readable,
    profile: { name: draft.name, yearsExperience: draft.yearsExperience, skills: (draft.skills ?? []).map((s) => s.name) },
    history,
    outline,
  });
  return { report, text: extracted.readable ? extracted.text : "" };
}
