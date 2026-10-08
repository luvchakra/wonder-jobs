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

  it("FAQ questions are unique", () => {
    const qs = HELP_FAQ.map((f) => f.q);
    expect(new Set(qs).size).toBe(qs.length);
  });

  it("keeps the anchors the rest of the site links to", () => {
    const ids = new Set(HELP_SECTIONS.map((s) => s.id));
    for (const id of ["getting-started", "roadmap", "sources", "ask-wonder", "calendar"]) expect(ids.has(id), id).toBe(true);
  });

  it("every section leads with a sentence of its own, because the assistant falls back to it", () => {
    for (const s of HELP_SECTIONS) {
      expect(s.body[0]?.startsWith("- "), s.id).toBe(false);
      expect(s.body[0]?.length, s.id).toBeGreaterThan(60);
      expect(s.keywords.length, s.id).toBeGreaterThan(3);
    }
  });

  it("says what the product does, never what it is built with", () => {
    const text = [...HELP_SECTIONS.flatMap((s) => [s.title, s.summary, ...s.body]), ...HELP_FAQ.flatMap((f) => [f.q, f.a])].join("\n");
    expect(text).not.toMatch(/supabase|postgres|vercel|next\.?js|react|row-level|\bRLS\b|database|webhook|\bSMTP\b|aes-?256/i);
  });

  it("does not describe a public demo, which no longer exists", () => {
    const text = HELP_SECTIONS.flatMap((s) => s.body).concat(HELP_FAQ.map((f) => f.a)).join("\n");
    expect(text).not.toMatch(/\bdemo\b/i);
  });
});

describe("help assistant retrieval", () => {
  it.each([
    ["can I install the app on my iphone", "calendar", "Can I install WonderJobs on my phone?"],
    ["why are some jobs hidden", "jobs", "Why are some jobs hidden?"],
    ["how do I add my interviews to google calendar", "calendar", "Can I add my interviews and follow-ups to Google Calendar or Outlook?"],
    ["what can I ask wonder", "ask-wonder", "What can I ask Wonder?"],
    ["download my cover letter as word", "applications", "Can I download my tailored résumé and cover letter?"],
    ["how do I cancel my subscription", "billing-data", "How do I cancel my subscription?"],
    ["how do I delete my data", "billing-data", "How do I download or delete my data?"],
    ["is my card safe if I pay for pro", "billing-data", "How do I pay for a plan, and is my card safe?"],
    ["why doesn't the list change when I type", "finding-jobs", "Why doesn't the list change while I type in the search box?"],
    ["which role is wonder searching for", "finding-jobs", "Which role is Wonder searching for, and how do I change it?"],
    ["a job disappeared from my list", "jobs", "Why did a job disappear from my list?"],
    ["wonder found nothing what now", "troubleshooting", "Wonder found nothing. What now?"],
    ["how do I contact someone", "troubleshooting", "How do I contact someone about a problem?"],
    ["does the helper press next on the employer form", "apply-with-wonder", "Does the helper press buttons on the employer's form?"],
    ["the browser helper isn't installed", "apply-with-wonder", "The Apply page says the browser helper isn't installed."],
    ["can I apply from my phone", "apply-with-wonder", "Can I apply from my phone?"],
    ["where does wonder use ai", "ai", "Where does Wonder use AI, and what does it never decide?"],
    ["does ai decide which jobs I see", "jobs", "Does AI decide which jobs I see?"],
    ["what do free pro and max include", "billing-data", "What do Free, Pro and Max include?"],
    ["i hit a plan limit", "billing-data", "I've hit a plan limit. What can I do?"],
    ["can i try pro without paying", "billing-data", "Can I try Pro or Max without paying?"],
    ["how do I stop the activity email", "calendar", "How do I stop the activity email?"],
    ["where can I see how my week is going", "calendar", "Where can I see how my week is going?"],
    ["notifications won't turn on", "calendar", "Notifications won't turn on. What should I check?"],
    ["my resume upload was refused", "resume-templates", "What résumé files can I upload, and why was mine refused?"],
    ["how do I rename my resume", "resume-templates", "How do I rename a résumé?"],
    ["the link in my email opened in another browser", "account", "My email link says it opened in a different browser."],
    ["how do I schedule a search every day", "scheduled-runs", "How do I set up a scheduled search?"],
    ["what has wonder learned about me", "career-dna", "What has Wonder learned about me, and can I turn it off?"],
    ["why does wonder ask for my salary", "career-dna", "Why does Wonder ask me for my salary or notice period?"],
    ["how do I turn off a job source", "sources", "Can I turn a job source off?"],
  ])("%s", (question, section, faq) => {
    expect(answer(question)).toEqual({ section, faq });
  });

  it.each([
    ["how do I edit my career profile", "career-dna"],
    ["what is keep watch", "automation"],
    ["how many roles can I add", "career-dna"],
  ])("routes %s to its section", (question, section) => {
    expect(searchHelp(question, 1)[0]?.section.id).toBe(section);
  });

  it("does not take part of a word for a keyword (\"pro\" in \"profile\", \"ai\" in \"email\")", () => {
    expect(searchHelp("edit my profile", 3).map((r) => r.section.id)).not.toContain("billing-data");
    expect(searchHelp("did the email arrive", 1)[0]?.section.id).not.toBe("ai");
  });

  it("picks the best-matching FAQ in a section, not the first that shares a few words", () => {
    expect(bestFaq("why are some jobs hidden", "jobs")?.q).toBe("Why are some jobs hidden?");
  });

  it("returns no FAQ when the question shares too little with any of them", () => {
    expect(bestFaq("pricing refund invoice", "jobs")).toBeNull();
    expect(bestFaq("the and for", "jobs")).toBeNull();
  });
});
