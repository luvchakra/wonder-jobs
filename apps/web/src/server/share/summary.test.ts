import { afterEach, describe, expect, it } from "vitest";
import { setAssistModelForTests } from "@/server/ai/assist";
import { checkedSummary, clean, ruleSummary, shareSummary } from "./summary";

const input = { noun: "teaching job", title: "Maths Teacher", facts: ["Walderslade School", "Chatham"], lines: ["Subject: Mathematics", "Grades: Secondary", "From: WorksLake Data Gateway · Teaching"], details: "Maths Teacher Wanted. Do you have enthusiasm in abundance and the ability to explain algebra? Apply at https://x.test." };

afterEach(() => setAssistModelForTests(null));

describe("a share's summary", () => {
  it("without a model: the description's first sentence that says more than the title, and no highlights (the image already shows the details)", () => {
    const s = ruleSummary(input);
    expect(s).toEqual({ hook: "Do you have enthusiasm in abundance and the ability to explain algebra?", highlights: [], ai: false });
  });

  it("the model's reply is cut and checked: no links or emails, no repeat of the title, at most three highlights", () => {
    const s = checkedSummary(input, { hook: "A secondary maths post in Chatham for someone who loves explaining algebra.", highlights: ["Maths Teacher", "Secondary classes", "Email jobs@x.test", "Refurbished department", "Supportive team", "Fifth"] });
    expect(s).toEqual({ hook: "A secondary maths post in Chatham for someone who loves explaining algebra.", highlights: ["Secondary classes", "Refurbished department", "Supportive team"], ai: true });
    expect(checkedSummary(input, { hook: "See https://x.test for more", highlights: [] })).toBeNull();
    expect(checkedSummary(input, { hook: "x".repeat(400), highlights: [] })!.hook.length).toBeLessThanOrEqual(140);
  });

  it("asks the model with the listing as data (never where it came from) and falls back to the rules when the reply is unusable", async () => {
    let asked = "";
    setAssistModelForTests(async (_system, prompt) => {
      asked = prompt;
      return JSON.stringify({ hook: "Teach secondary maths in a busy, supportive department.", highlights: ["Secondary", "Recently refurbished department"] });
    });
    const s = await shareSummary("t:1", input);
    expect(s.ai).toBe(true);
    expect(s.hook).toBe("Teach secondary maths in a busy, supportive department.");
    expect(asked).toContain("Mathematics");
    expect(asked).not.toContain("WorksLake");

    setAssistModelForTests(async () => "not json");
    expect((await shareSummary("t:2", input)).ai).toBe(false);
  });

  it("a long highlight is cut at a word, never mid-word", () => {
    expect(clean("School becomes co-educational as The Capstone School in September 2027", 64)).toBe("School becomes co-educational as The Capstone School in…");
  });

  it("drops a highlight that mostly repeats what the image already shows (place, date, title)", () => {
    const ev = { noun: "event", title: "Gaming hobby group for Minecraft adventurers for 3.-6. graders", facts: ["6 Nov 2026", "Entresse Library, Espoo, Finland", ""], lines: ["Where: Entresse Library, Espoo, Finland"] };
    const s = checkedSummary(ev, { hook: "A Minecraft hobby group for young players at a library.", highlights: ["For 3rd-6th graders", "Takes place at Entresse Library, Espoo, Finland", "Date: 6 Nov 2026", "Free to join, no sign-up needed"] });
    expect(s!.highlights).toEqual(["For 3rd-6th graders", "Free to join, no sign-up needed"]);
  });
});
