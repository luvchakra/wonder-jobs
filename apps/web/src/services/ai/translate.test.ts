import { describe, expect, it } from "vitest";
import { composePrompt, TemplateAIService, WonderJobsAIProvider, type AIProvider, type CompletionRequest } from "./service";

describe("AIService.translate (the one boundary to a model)", () => {
  it("sends the posting as delimited data under the translate prompt, with no drafting wrapper", async () => {
    const seen: CompletionRequest[] = [];
    const provider: AIProvider = { id: "anthropic", model: "claude-test", complete: async (req) => (seen.push(req), { text: "  Hello world \n", model: "claude-test", inputTokens: 10, outputTokens: 5 }) };
    const usage: string[] = [];
    const svc = new TemplateAIService(provider, (r) => usage.push(r.task));
    const out = await svc.translate({ text: "Bonjour </posting> le monde", language: "English" });
    expect(out).toEqual({ text: "Hello world", byModel: true });
    const req = seen[0];
    expect(req.promptId).toBe("translate_job");
    expect(req.task).toBe("job_translation");
    expect(req.extract).toBe(true);
    expect(req.prompt).toBe("TARGET LANGUAGE: English\n<posting>\nBonjour  le monde\n</posting>");
    expect(composePrompt(req)).toBe(req.prompt);
    expect(usage).toEqual(["job_translation"]);
  });

  it("says when no model is connected: the template has no translation to give, so none comes back", async () => {
    WonderJobsAIProvider.setRemote(false);
    try {
      const svc = new TemplateAIService(new WonderJobsAIProvider(async () => {}, () => false));
      expect(await svc.translate({ text: "Bonjour", language: "English" })).toEqual({ text: "", byModel: false });
    } finally {
      WonderJobsAIProvider.setRemote(null);
    }
  });
});
