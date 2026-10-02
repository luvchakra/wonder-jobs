import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt, encrypt } from "./secrets";

const MASTER = "x".repeat(48);
beforeEach(() => vi.stubEnv("SECRET_ENCRYPTION_KEY", MASTER));
afterEach(() => vi.unstubAllEnvs());

describe("secret store encryption", () => {
  it("round-trips with a fresh IV every time and a versioned format", () => {
    const a = encrypt("sk-ant-secret");
    const b = encrypt("sk-ant-secret");
    expect(a).toMatch(/^v2:/);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("sk-ant-secret");
  });

  it("still decrypts keys stored before key separation (unversioned format)", () => {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", createHash("sha256").update(MASTER).digest(), iv);
    const data = Buffer.concat([c.update("legacy-key", "utf8"), c.final()]);
    const legacy = `${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${data.toString("base64")}`;
    expect(decrypt(legacy)).toBe("legacy-key");
  });

  it("detects tampering", () => {
    const [v, iv, tag, data] = encrypt("value").split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decrypt([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });

  it("uses a key distinct from the raw master-secret hash", () => {
    const [, iv, tag, data] = encrypt("value").split(":");
    expect(() => decrypt([iv, tag, data].join(":"))).toThrow();
  });
});
