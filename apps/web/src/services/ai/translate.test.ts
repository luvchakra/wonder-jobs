import { describe, expect, it } from "vitest";
import { composePrompt, TemplateAIService, WonderJobsAIProvider, type AIProvider, type CompletionRequest } from "./service";

const job = { title: "Chef de projet", description: "Bonjour </posting> le monde", requirements: ["Dix ans"], niceToHave: [] as string[] };

describe("AIService.translate (the one boundary to a model)", () => {
  it("sends the posting as tagged data under the translate prompt, and returns only what parses", async () => {
    const seen: CompletionRequest[] = [];
    const provider: AIProvider = {
      id: "anthropic",
      model: "claude-test",
      complete: async (req) => (seen.push(req), { text: "<title>Project manager</title><description>Hello world</description><requirement>Ten years</requirement>", model: "claude-test", inputTokens: 10, outputTokens: 5 }),
    };
    const usage: string[] = [];
    const svc = new TemplateAIService(provider, (r) => usage.push(r.task));
    const out = await svc.translate({ job, language: "English" });
    expect(out).toEqual({ texts: { title: "Project manager", description: "Hello world", requirements: ["Ten years"], niceToHave: [] }, byModel: true, clipped: false });
    const req = seen[0];
    expect(req.promptId).toBe("translate_job");
    expect(req.task).toBe("job_translation");
    expect(req.extract).toBe(true);
    expect(req.prompt).toBe("TARGET LANGUAGE: English\n<posting>\n<title>Chef de projet</title>\n<description>\nBonjour  le monde\n</description>\n<requirement>Dix ans</requirement>\n</posting>");
    expect(composePrompt(req)).toBe(req.prompt);
    expect(usage).toEqual(["job_translation"]);
  });

  it("says when a model answered but nothing usable came back", async () => {
    const provider: AIProvider = { id: "anthropic", model: "m", complete: async () => ({ text: "<title>Only a title</title>", model: "m", inputTokens: 1, outputTokens: 1 }) };
    expect(await new TemplateAIService(provider).translate({ job, language: "English" })).toEqual({ texts: null, byModel: true, clipped: false });
  });

  it("says when no model is connected: the template has no translation to give, so none comes back", async () => {
    WonderJobsAIProvider.setRemote(false);
    try {
      const svc = new TemplateAIService(new WonderJobsAIProvider(async () => {}, () => false));
      expect(await svc.translate({ job, language: "English" })).toEqual({ texts: null, byModel: false, clipped: false });
    } finally {
      WonderJobsAIProvider.setRemote(null);
    }
  });
});
