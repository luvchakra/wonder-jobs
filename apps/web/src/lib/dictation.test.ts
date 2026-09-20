import { describe, expect, it } from "vitest";
import { appendDictated, foldResults, mergePhrases, shouldGiveUp, type RecognitionResultList } from "./dictation";

/** Builds the result list shape the Web Speech API hands to `onresult`. */
function results(...phrases: { text: string; isFinal: boolean }[]): RecognitionResultList {
  const list: Record<number, unknown> & { length: number } = { length: phrases.length };
  phrases.forEach((p, i) => {
    list[i] = { isFinal: p.isFinal, length: 1, 0: { transcript: p.text } };
  });
  return list as unknown as RecognitionResultList;
}

describe("mergePhrases", () => {
  it("keeps a single phrase as it was said", () => {
    expect(mergePhrases(["senior director at Saviynt"])).toBe("senior director at Saviynt");
  });

  it("joins genuinely different phrases", () => {
    expect(mergePhrases(["senior director at Saviynt", "remote or Bengaluru"])).toBe("senior director at Saviynt remote or Bengaluru");
  });

  it("collapses a recognizer that re-sends one sentence as it grows it", () => {
    // Reported from a real Android session: every take arrived as its own final result, and joining
    // them end to end produced "looking looking looking for looking for a…".
    const takes = [
      "looking",
      "looking",
      "looking for",
      "looking for a",
      "looking for a",
      "looking for a senior",
      "looking for a senior",
      "looking for a senior position",
      "looking for a senior position",
      "looking for a senior position in",
      "looking for a senior position in I",
      "looking for a senior position in",
      "looking for a senior position in i20",
      "looking for a senior position in i20",
    ];
    expect(mergePhrases(takes)).toBe("looking for a senior position in i20");
  });

  it("collapses the earlier report's takes too", () => {
    const takes = [
      "position",
      "position stand",
      "position stand or give me",
      "position stand or give me good",
      "position stand or give me good generation",
      "position stand or give me good generation as well",
    ];
    expect(mergePhrases(takes)).toBe("position stand or give me good generation as well");
  });

  it("prefers the later, fuller take when a word is corrected", () => {
    expect(mergePhrases(["senior position in I", "senior position in i20"])).toBe("senior position in i20");
  });

  it("ignores a shorter repeat of what was already heard", () => {
    expect(mergePhrases(["looking for a senior position in I", "looking for a senior position in"])).toBe("looking for a senior position in I");
  });

  it("stitches a phrase that picks up where the last one left off", () => {
    expect(mergePhrases(["looking for a senior position", "senior position in i20"])).toBe("looking for a senior position in i20");
  });

  it("does not merge two phrases that merely start with the same word", () => {
    expect(mergePhrases(["senior director", "senior product roles in fintech"])).toBe("senior director senior product roles in fintech");
  });

  it("compares words loosely enough to see through punctuation and case", () => {
    expect(mergePhrases(["Looking for a role.", "looking for a role in fintech"])).toBe("looking for a role in fintech");
  });

  it("skips empty phrases", () => {
    expect(mergePhrases(["", "senior director", ""])).toBe("senior director");
    expect(mergePhrases([])).toBe("");
  });
});

describe("foldResults", () => {
  it("keeps interim words out of the settled phrases", () => {
    const folded = foldResults([], results({ text: "senior director", isFinal: false }));
    expect(folded.settled).toEqual([]);
    expect(folded.interim).toBe("senior director");
  });

  it("settles a phrase once it is final", () => {
    const folded = foldResults([], results({ text: "senior director at Saviynt", isFinal: true }));
    expect(mergePhrases(folded.settled)).toBe("senior director at Saviynt");
    expect(folded.interim).toBe("");
  });

  it("does not duplicate when the browser re-sends phrases it already settled", () => {
    let settled: string[] = [];
    const list = results({ text: "senior director", isFinal: true }, { text: "remote only", isFinal: true });
    for (let replay = 0; replay < 5; replay++) settled = foldResults(settled, list).settled;
    expect(mergePhrases(settled)).toBe("senior director remote only");
  });

  it("survives growing takes arriving at their own indices", () => {
    // The shape that defeated the previous fix: each longer take is a *new* entry, not an overwrite.
    let settled: string[] = [];
    const takes = ["looking", "looking for", "looking for a senior", "looking for a senior position in i20"];
    takes.forEach((_, i) => {
      settled = foldResults(settled, results(...takes.slice(0, i + 1).map((t) => ({ text: t, isFinal: true })))).settled;
    });
    expect(mergePhrases(settled)).toBe("looking for a senior position in i20");
  });

  it("reports the interim tail while earlier phrases stay settled", () => {
    const folded = foldResults([], results({ text: "senior director", isFinal: true }, { text: "at Sav", isFinal: false }));
    expect(mergePhrases(folded.settled)).toBe("senior director");
    expect(folded.interim).toBe("at Sav");
  });

  it("ignores empty transcripts", () => {
    const folded = foldResults([], results({ text: "   ", isFinal: true }, { text: "", isFinal: false }));
    expect(mergePhrases(folded.settled)).toBe("");
    expect(folded.interim).toBe("");
  });
});

describe("appendDictated", () => {
  it("uses a dictated phrase as-is when the field is empty", () => {
    expect(appendDictated("", "senior director at Saviynt")).toBe("senior director at Saviynt");
  });

  it("appends to what is already typed with a single space", () => {
    expect(appendDictated("test", "looking for a senior position in i20")).toBe("test looking for a senior position in i20");
    expect(appendDictated("senior director ", "at Saviynt")).toBe("senior director at Saviynt");
    expect(appendDictated("senior director\n", "at Saviynt")).toBe("senior director at Saviynt");
  });

  it("starts a new sentence after terminal punctuation", () => {
    expect(appendDictated("I want a director role.", "remote only")).toBe("I want a director role. Remote only");
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

describe("shouldGiveUp", () => {
  it("does not give up on two quick silent sessions on their own", () => {
    // The reported regression: continuous:false sessions can each end within a second or two under
    // entirely normal conditions (mic init, the pause before the candidate starts talking), so a
    // session-count cap gave up before they'd had a real chance to speak. Two sessions ending after
    // barely a second of real time must not be enough on their own.
    expect(shouldGiveUp(false, 1200)).toBe(false);
    expect(shouldGiveUp(false, 4000)).toBe(false);
  });

  it("gives up once real time has passed with nothing heard", () => {
    expect(shouldGiveUp(false, 12_000)).toBe(true);
    expect(shouldGiveUp(false, 20_000)).toBe(true);
  });

  it("never gives up once something has actually been heard", () => {
    // A pause between sentences is normal dictation, not failure — only an explicit Stop ends it.
    expect(shouldGiveUp(true, 12_000)).toBe(false);
    expect(shouldGiveUp(true, 60_000)).toBe(false);
  });
});
