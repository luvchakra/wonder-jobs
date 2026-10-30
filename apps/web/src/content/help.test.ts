import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { HELP_FAQ, HELP_SECTIONS, bestFaq, searchHelp } from "./help";

const WEB = path.resolve(__dirname, "../..");

/** Every file under a directory, recursively (no node_modules, no build output). */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

/** The app's routes as path patterns: route groups dropped, a [dynamic] segment matching any one segment. */
function appRoutes(): RegExp[] {
  const app = path.join(WEB, "src/app");
  return files(app)
    .filter((f) => /\/(page|route)\.tsx?$/.test(f))
    .map((f) => {
      const segs = path.relative(app, path.dirname(f)).split(path.sep).filter((x) => x && !/^\(.*\)$/.test(x));
      const body = segs.map((x) => (/^\[.*\]$/.test(x) ? "[^/]+" : x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/");
      return new RegExp(`^/${body}$`);
    });
}

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

  it("every link to a help section anywhere in the app points at a section that exists", () => {
    const ids = new Set(["faq", ...HELP_SECTIONS.map((s) => s.id)]);
    const sources = [...files(path.join(WEB, "src")), ...files(path.join(WEB, "e2e")), ...files(path.join(WEB, "scripts"))].filter((f) => /\.(tsx?|mjs)$/.test(f));
    const broken: string[] = [];
    for (const f of sources) for (const m of readFileSync(f, "utf8").matchAll(/\/help#([a-z0-9-]+)/g)) if (!ids.has(m[1])) broken.push(`${path.relative(WEB, f)} → /help#${m[1]}`);
    expect(broken).toEqual([]);
  });

  it("every app address the guide mentions is a real route", () => {
    const routes = appRoutes();
    expect(routes.some((r) => r.test("/help"))).toBe(true);
    const text = [...HELP_SECTIONS.flatMap((s) => [s.summary, ...s.body]), ...HELP_FAQ.map((f) => f.a)].join("\n");
    const mentioned = [...text.matchAll(/(?<![\w.:/])\/(?:app|sign-in|sign-up|forgot-password|reset-password|help|extension|api-reference|privacy|terms|cookies|security|about)(?:\/[a-z0-9-]+)*/g)].map((m) => m[0]);
    const missing = mentioned.filter((p) => !routes.some((r) => r.test(p)));
    expect(missing).toEqual([]);
  });

  it("every section says when it was last checked against the app", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const s of HELP_SECTIONS) {
      expect(s.updated, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(s.updated)), s.id).toBe(false);
      expect(s.updated <= today, `${s.id} is dated in the future`).toBe(true);
    }
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

  it("does not describe a public demo, which no longer exists (Teaching's demo class is a lesson, not a demo of the app)", () => {
    const text = HELP_SECTIONS.flatMap((s) => s.body).concat(HELP_FAQ.map((f) => f.a)).join("\n");
    expect(text).not.toMatch(/\bdemo\b(?![ -]class)/i);
  });
});

describe("help assistant retrieval", () => {
  it.each([
    ["can I install the app on my iphone", "calendar", "Can I install WonderWorks on my phone?"],
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
