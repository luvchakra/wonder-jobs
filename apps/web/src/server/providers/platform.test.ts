import { afterEach, describe, expect, it } from "vitest";
import { platformAI } from "./platform";

/**
 * "WonderJobs AI" (the platform-billed default) used to be hardcoded to Anthropic — the only way to
 * change vendors was to edit code. `WONDERJOBS_AI_PROVIDER` makes it configurable across all three
 * supported vendors while preserving every existing deployment's behavior when unset.
 */

const ENV_KEYS = ["WONDERJOBS_AI_PROVIDER", "WONDERJOBS_AI_KEY", "WONDERJOBS_AI_MODEL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"] as const;
const ORIGINAL = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL[k];
  }
});

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

describe("platformAI — vendor defaults and backward compatibility", () => {
  it("is null with nothing configured", () => {
    clearEnv();
    expect(platformAI()).toBeNull();
  });

  it("defaults to anthropic when WONDERJOBS_AI_PROVIDER is unset — unchanged behavior for existing deployments", () => {
    clearEnv();
    process.env.WONDERJOBS_AI_KEY = "sk-ant-test";
    expect(platformAI()).toEqual({ apiKey: "sk-ant-test", model: "claude-sonnet-5", provider: "anthropic" });
  });

  it("falls back to ANTHROPIC_API_KEY when WONDERJOBS_AI_KEY is unset (existing convenience fallback, preserved)", () => {
    clearEnv();
    process.env.ANTHROPIC_API_KEY = "sk-ant-fallback";
    expect(platformAI()).toMatchObject({ apiKey: "sk-ant-fallback", provider: "anthropic" });
  });
});

describe("platformAI — openai and gemini support", () => {
  it("runs on OpenAI when selected, with its own default model", () => {
    clearEnv();
    process.env.WONDERJOBS_AI_PROVIDER = "openai";
    process.env.WONDERJOBS_AI_KEY = "sk-openai-test";
    expect(platformAI()).toEqual({ apiKey: "sk-openai-test", model: "gpt-5-mini", provider: "openai" });
  });

  it("falls back to OPENAI_API_KEY for the openai vendor", () => {
    clearEnv();
    process.env.WONDERJOBS_AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-openai-fallback";
    expect(platformAI()).toMatchObject({ apiKey: "sk-openai-fallback", provider: "openai" });
  });

  it("runs on Gemini when selected, with its own default model", () => {
    clearEnv();
    process.env.WONDERJOBS_AI_PROVIDER = "gemini";
    process.env.WONDERJOBS_AI_KEY = "AIza-test";
    expect(platformAI()).toEqual({ apiKey: "AIza-test", model: "gemini-2.5-flash", provider: "gemini" });
  });

  it("falls back to GEMINI_API_KEY for the gemini vendor", () => {
    clearEnv();
    process.env.WONDERJOBS_AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "AIza-fallback";
    expect(platformAI()).toMatchObject({ apiKey: "AIza-fallback", provider: "gemini" });
  });

  it("never picks up the wrong vendor's key — openai selected, only an anthropic key set", () => {
    clearEnv();
    process.env.WONDERJOBS_AI_PROVIDER = "openai";
    process.env.ANTHROPIC_API_KEY = "sk-ant-only";
    expect(platformAI()).toBeNull();
  });

  it("an unrecognized WONDERJOBS_AI_PROVIDER value falls back to anthropic rather than silently misbehaving", () => {
    clearEnv();
    process.env.WONDERJOBS_AI_PROVIDER = "not-a-real-vendor";
    process.env.WONDERJOBS_AI_KEY = "sk-ant-test";
    expect(platformAI()).toMatchObject({ provider: "anthropic" });
  });

  it("is case-insensitive and trims whitespace", () => {
    clearEnv();
    process.env.WONDERJOBS_AI_PROVIDER = "  GEMINI  ";
    process.env.WONDERJOBS_AI_KEY = "AIza-test";
    expect(platformAI()).toMatchObject({ provider: "gemini" });
  });
});

describe("platformAI — WONDERJOBS_AI_MODEL overrides the vendor's default", () => {
  it("overrides the default model for whichever vendor is selected", () => {
    clearEnv();
    process.env.WONDERJOBS_AI_PROVIDER = "openai";
    process.env.WONDERJOBS_AI_KEY = "sk-openai-test";
    process.env.WONDERJOBS_AI_MODEL = "gpt-5";
    expect(platformAI()).toEqual({ apiKey: "sk-openai-test", model: "gpt-5", provider: "openai" });
  });
});
