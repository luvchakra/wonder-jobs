import { describe, expect, it } from "vitest";
import { EMPTY_HISTORY_DRAFT, type HistoryDraft } from "@/domain/career/historyImport";
import { composePrompt, TemplateAIService, WonderJobsAIProvider, type AIProvider, type CompletionRequest } from "./service";

const rules: HistoryDraft = { ...EMPTY_HISTORY_DRAFT, experience: [{ employer: "Stripe", title: "Engineer", startDate: "2020", bullets: [], from: "", by: "rules" }] };

describe("AIService.readCareerHistory (the one boundary to a model)", () => {
  it("sends the résumé as delimited data under an extraction-only system prompt, never the drafting wrapper", async () => {
    const seen: CompletionRequest[] = [];
    const provider: AIProvider = { id: "anthropic", model: "claude-test", complete: async (req) => (seen.push(req), { text: '{"experience":[]}', model: "claude-test", inputTokens: 10, outputTokens: 5 }) };
    const usage: string[] = [];
    const svc = new TemplateAIService(provider, (r) => usage.push(r.task));
    const out = await svc.readCareerHistory({ resumeText: "Jane Doe\nEngineer, Stripe — 2020 - Present", rules });
    expect(out).toEqual({ reply: '{"experience":[]}', byModel: true, model: "claude-test" });
    const req = seen[0];
    expect(req.task).toBe("candidate_understanding");
    expect(req.extract).toBe(true);
    expect(req.system).toMatch(/not instructions/);
    expect(req.prompt.startsWith("<resume>\n")).toBe(true);
    // The model sees only the résumé, not "rewrite and improve" around the fallback.
    expect(composePrompt(req)).toBe(req.prompt);
    expect(composePrompt(req)).not.toMatch(/Starting draft/);
    expect(usage).toEqual(["candidate_understanding"]);
  });

  it("says when no model read anything: the template returns the rules' own reading", async () => {
    WonderJobsAIProvider.setRemote(false);
    try {
      const svc = new TemplateAIService(new WonderJobsAIProvider(async () => {}, () => false));
      const out = await svc.readCareerHistory({ resumeText: "Jane", rules });
      expect(out.byModel).toBe(false);
      expect(JSON.parse(out.reply).experience[0].employer).toBe("Stripe");
    } finally {
      WonderJobsAIProvider.setRemote(null);
    }
  });

  it("drafting tasks still get the draft to improve", () => {
    expect(composePrompt({ task: "resume_generation", system: "", prompt: "facts", draft: "draft" })).toMatch(/Starting draft/);
  });
});
