import { describe, expect, it } from "vitest";
import { appendDictated, foldResults, joinPhrases, type RecognitionResultList } from "./dictation";

/** Builds the result list shape the Web Speech API hands to `onresult`. */
function results(...phrases: { text: string; isFinal: boolean }[]): RecognitionResultList {
  const list: Record<number, unknown> & { length: number } = { length: phrases.length };
  phrases.forEach((p, i) => {
    list[i] = { isFinal: p.isFinal, length: 1, 0: { transcript: p.text } };
  });
  return list as unknown as RecognitionResultList;
}

describe("foldResults", () => {
  it("keeps interim words out of the settled phrases", () => {
    const folded = foldResults([], results({ text: "senior director", isFinal: false }));
    expect(folded.settled).toEqual([]);
    expect(folded.interim).toBe("senior director");
  });

  it("settles a phrase once it is final", () => {
    const folded = foldResults([], results({ text: "senior director at Saviynt", isFinal: true }));
    expect(joinPhrases(folded.settled)).toBe("senior director at Saviynt");
    expect(folded.interim).toBe("");
  });

  it("does not duplicate when the browser re-sends phrases it already settled", () => {
    // The standard's result list is cumulative, so every event replays earlier phrases.
    let settled: string[] = [];
    const list = results({ text: "senior director", isFinal: true }, { text: "at Saviynt", isFinal: true });
    for (let replay = 0; replay < 5; replay++) settled = foldResults(settled, list).settled;
    expect(joinPhrases(settled)).toBe("senior director at Saviynt");
  });

  it("replaces a phrase in place as the recognizer grows it, instead of stacking prefixes", () => {
    // Android's recognizer re-sends one phrase as final over and over, a word longer each time.
    // Appending each take is what produced "position position position stand position stand or…".
    const takes = ["position", "position stand", "position stand or give me", "position stand or give me good", "position stand or give me good generation"];
    let settled: string[] = [];
    for (const take of takes) settled = foldResults(settled, results({ text: take, isFinal: true })).settled;
    expect(joinPhrases(settled)).toBe("position stand or give me good generation");
  });

  it("keeps separate phrases in the order they were spoken", () => {
    let settled: string[] = [];
    settled = foldResults(settled, results({ text: "senior director", isFinal: true })).settled;
    settled = foldResults(settled, results({ text: "senior director", isFinal: true }, { text: "remote only", isFinal: true })).settled;
    expect(joinPhrases(settled)).toBe("senior director remote only");
  });

  it("reports the interim tail while earlier phrases stay settled", () => {
    const folded = foldResults([], results({ text: "senior director", isFinal: true }, { text: "at Sav", isFinal: false }));
    expect(joinPhrases(folded.settled)).toBe("senior director");
    expect(folded.interim).toBe("at Sav");
  });

  it("ignores empty transcripts", () => {
    const folded = foldResults([], results({ text: "   ", isFinal: true }, { text: "", isFinal: false }));
    expect(joinPhrases(folded.settled)).toBe("");
    expect(folded.interim).toBe("");
  });
});

describe("appendDictated", () => {
  it("uses a dictated phrase as-is when the field is empty", () => {
    expect(appendDictated("", "senior director at Saviynt")).toBe("senior director at Saviynt");
  });

  it("appends to what is already typed with a single space", () => {
    expect(appendDictated("senior director", "at Saviynt")).toBe("senior director at Saviynt");
    expect(appendDictated("senior director ", "at Saviynt")).toBe("senior director at Saviynt");
    expect(appendDictated("senior director\n", "at Saviynt")).toBe("senior director at Saviynt");
  });

  it("starts a new sentence after terminal punctuation", () => {
    expect(appendDictated("I want a director role.", "remote only")).toBe("I want a director role. Remote only");
    expect(appendDictated("Which team?", "ideally platform")).toBe("Which team? Ideally platform");
  });

  it("leaves the field alone when nothing was said", () => {
    expect(appendDictated("senior director", "")).toBe("senior director");
  });

  it("keeps the candidate's own words verbatim", () => {
    const spoken = "Staff PM, fintech, Bengaluru or remote";
    expect(appendDictated("", spoken)).toBe(spoken);
    expect(appendDictated("Looking for:", spoken)).toBe(`Looking for: ${spoken}`);
  });
});
