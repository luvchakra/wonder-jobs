import { beforeAll, describe, expect, it } from "vitest";
import { signExtensionToken, tenantFromAuthHeader, verifyExtensionToken } from "./extensionToken";

beforeAll(() => {
  process.env.SECRET_ENCRYPTION_KEY = "test-secret-for-extension-tokens";
});

describe("extension bearer token", () => {
  it("round-trips the tenant it was signed for", () => {
    const { token } = signExtensionToken("tenant-123");
    expect(verifyExtensionToken(token)).toEqual({ tenantId: "tenant-123" });
  });

  it("refuses a token whose payload was tampered with", () => {
    const { token } = signExtensionToken("tenant-123");
    const [encoded, signature] = [token.slice(0, token.lastIndexOf(".")), token.slice(token.lastIndexOf(".") + 1)];
    const forged = `${Buffer.from("someone-else.99999999999").toString("base64url")}.${signature}`;
    expect(verifyExtensionToken(forged)).toBeNull();
    // The original signature over the original payload still verifies — proving the check is the signature, not the shape.
    expect(verifyExtensionToken(`${encoded}.${signature}`)).toEqual({ tenantId: "tenant-123" });
  });

  it("refuses a token signed with a different secret", () => {
    const { token } = signExtensionToken("tenant-123");
    process.env.SECRET_ENCRYPTION_KEY = "a-different-secret";
    expect(verifyExtensionToken(token)).toBeNull();
    process.env.SECRET_ENCRYPTION_KEY = "test-secret-for-extension-tokens";
  });

  it("expires", () => {
    const now = Date.now();
    const { token, expiresAt } = signExtensionToken("tenant-123", now);
    expect(verifyExtensionToken(token, now)).toEqual({ tenantId: "tenant-123" });
    expect(verifyExtensionToken(token, (expiresAt + 1) * 1000)).toBeNull();
  });

  it("refuses malformed input rather than throwing", () => {
    expect(verifyExtensionToken("")).toBeNull();
    expect(verifyExtensionToken("nodot")).toBeNull();
    expect(verifyExtensionToken(".")).toBeNull();
    expect(verifyExtensionToken("!!!not-base64!!!.deadbeef")).toBeNull();
  });

  it("reads a Bearer header, and ignores anything else", () => {
    const { token } = signExtensionToken("tenant-123");
    expect(tenantFromAuthHeader(`Bearer ${token}`)).toBe("tenant-123");
    expect(tenantFromAuthHeader(`bearer ${token}`)).toBe("tenant-123");
    expect(tenantFromAuthHeader(token)).toBeNull();
    expect(tenantFromAuthHeader("Basic abc")).toBeNull();
    expect(tenantFromAuthHeader(null)).toBeNull();
  });
});
