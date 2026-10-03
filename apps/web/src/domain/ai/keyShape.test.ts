import { describe, expect, it } from "vitest";
import { detectProvider } from "./keyShape";

describe("detectProvider", () => {
  it("reads the provider from the key's shape", () => {
    expect(detectProvider("sk-ant-api03-abcdefghijklmnopqrstuvwxyz")).toBe("anthropic");
    expect(detectProvider("  sk-proj-abcdefghijklmnopqrstuvwxyz0123  ")).toBe("openai");
    expect(detectProvider("sk-abcdefghijklmnopqrstuvwxyz0123")).toBe("openai");
    expect(detectProvider("AIzaSyA1234567890abcdefghijklmnopqrstu")).toBe("gemini");
  });
  it("says so when it is none of them", () => {
    expect(detectProvider("")).toBeNull();
    expect(detectProvider("my password")).toBeNull();
    expect(detectProvider("sk-short")).toBeNull();
  });
});
