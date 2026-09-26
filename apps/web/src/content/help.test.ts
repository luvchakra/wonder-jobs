import { describe, expect, it } from "vitest";
import { HELP_FAQ, HELP_SECTIONS, bestFaq, searchHelp } from "./help";

function answer(question: string) {
  const best = searchHelp(question, 1)[0]?.section;
  return { section: best?.id, faq: best ? bestFaq(question, best.id)?.q : undefined };
}

describe("help guide", () => {
  it("every FAQ points at a real section", () => {
    const ids = new Set(HELP_SECTIONS.map((s) => s.id));
    for (const f of HELP_FAQ) expect(ids.has(f.section), f.q).toBe(true);
  });

  it("section ids are unique", () => {
    const ids = HELP_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("help assistant retrieval", () => {
  it.each([
    ["can I install the app on my iphone", "calendar", "Can I install WonderJobs on my phone?"],
    ["why are some jobs hidden", "jobs", "Why are some jobs hidden?"],
    ["how do I add my interviews to google calendar", "calendar", "Can I add my interviews and follow-ups to Google Calendar or Outlook?"],
    ["what can I ask wonder", "ask-wonder", "What can I ask Wonder?"],
    ["download my cover letter as word", "applications", "Can I download my tailored résumé and cover letter?"],
  ])("%s", (question, section, faq) => {
    expect(answer(question)).toEqual({ section, faq });
  });

  it("picks the best-matching FAQ in a section, not the first that shares a few words", () => {
    expect(bestFaq("why are some jobs hidden", "jobs")?.q).toBe("Why are some jobs hidden?");
  });

  it("returns no FAQ when the question shares too little with any of them", () => {
    expect(bestFaq("pricing refund invoice", "jobs")).toBeNull();
    expect(bestFaq("the and for", "jobs")).toBeNull();
  });
});
