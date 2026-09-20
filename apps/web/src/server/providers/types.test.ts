import { describe, expect, it } from "vitest";
import { classifyStatus } from "./types";

/**
 * A vendor 404 from a bad/unavailable model name used to collapse into a generic "unexpected response
 * (404)" with no way to tell it apart from any other odd status — undiagnosable without reading server
 * logs. `detail`, when the vendor's own response body carried a reason, is now surfaced in the message.
 */
describe("classifyStatus", () => {
  it("gives a 404 its own actionable message, not the generic unknown-status one", () => {
    const err = classifyStatus("gemini", 404, "Gemini");
    expect(err.kind).toBe("unknown");
    expect(err.message).toContain("couldn't find that model");
    expect(err.message).toContain("Check the configured model name");
  });

  it("appends the vendor's own detail message when one is available", () => {
    const err = classifyStatus("gemini", 404, "Gemini", "models/gemini-9000 is not found for API version v1beta.");
    expect(err.message).toContain("couldn't find that model");
    expect(err.message).toContain("models/gemini-9000 is not found for API version v1beta.");
  });

  it("still classifies auth, rate-limit, quota and 5xx as before, with detail appended when present", () => {
    expect(classifyStatus("openai", 401, "OpenAI").kind).toBe("auth");
    expect(classifyStatus("openai", 401, "OpenAI", "Incorrect API key provided.").message).toContain("Incorrect API key provided.");
    expect(classifyStatus("openai", 429, "OpenAI").kind).toBe("rate_limit");
    expect(classifyStatus("openai", 402, "OpenAI").kind).toBe("quota");
    expect(classifyStatus("openai", 503, "OpenAI").kind).toBe("network");
  });

  it("falls back to a plain unexpected-response message for other unmapped statuses", () => {
    const err = classifyStatus("anthropic", 418, "Anthropic");
    expect(err.message).toBe("Anthropic returned an unexpected response (418).");
  });
});
