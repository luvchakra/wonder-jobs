import { describe, expect, it } from "vitest";
import { chunkNames, decodeJwtPayload, fromBase64Url, joinChunks, parseStoredSession, splitChunks, toBase64Url, COOKIE_CHUNK } from "./config";

describe("auth cookie helpers", () => {
  it("round-trips unicode through base64url", () => {
    const s = JSON.stringify({ access_token: "a.b.c", refresh_token: "r", name: "Zoë 🚀" });
    expect(fromBase64Url(toBase64Url(s))).toBe(s);
    expect(toBase64Url(s)).not.toMatch(/[+/=]/);
  });

  it("splits long values into cookie-sized chunks and reassembles them", () => {
    const value = "x".repeat(COOKIE_CHUNK * 2 + 10);
    const chunks = splitChunks(value);
    expect(chunks).toHaveLength(3);
    const jar = new Map(chunks.map((c, i) => [`wj-auth.${i}`, c]));
    expect(joinChunks((n) => jar.get(n), "wj-auth")).toBe(value);
    expect(joinChunks(() => undefined, "wj-auth")).toBeNull();
    expect(chunkNames("k", 2)).toEqual(["k", "k.0", "k.1"]);
  });

  it("parses a stored session from base64url or plain JSON and rejects junk", () => {
    const session = { access_token: "t", refresh_token: "r", expires_at: 123 };
    expect(parseStoredSession(toBase64Url(JSON.stringify(session)))).toEqual(session);
    expect(parseStoredSession(JSON.stringify(session))).toEqual(session);
    expect(parseStoredSession("nope")).toBeNull();
    expect(parseStoredSession(null)).toBeNull();
  });

  it("decodes a JWT payload without verifying it", () => {
    const payload = { sub: "user-1", exp: 1_900_000_000 };
    const jwt = `${toBase64Url("{}")}.${toBase64Url(JSON.stringify(payload))}.sig`;
    expect(decodeJwtPayload(jwt)).toEqual(payload);
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
  });
});
