import { afterEach, describe, expect, it, vi } from "vitest";
import { proxiedImage, verifyImage } from "./imageProxy";

vi.mock("node:dns/promises", () => ({ lookup: async (host: string) => [{ address: host === "internal.example" ? "10.0.0.5" : "93.184.216.34", family: 4 }] }));

const parts = (u: string) => {
  const q = new URL(u, "https://w.example").searchParams;
  return { url: q.get("u")!, s: q.get("s")! };
};

describe("image proxy signatures", () => {
  it("signs a public https image URL and verifies only that URL", () => {
    const { url, s } = parts(proxiedImage("https://cdn.shopify.com/a.jpg")!);
    expect(url).toBe("https://cdn.shopify.com/a.jpg");
    expect(verifyImage(url, s)).toBe(true);
    expect(verifyImage("https://evil.example/a.jpg", s)).toBe(false);
    expect(verifyImage(url, s.slice(0, -1) + (s.endsWith("A") ? "B" : "A"))).toBe(false);
    expect(verifyImage(url, "")).toBe(false);
  });
  it("accepts protocol-relative URLs as https and refuses everything else", () => {
    expect(parts(proxiedImage("//cdn.shopify.com/b.png")!).url).toBe("https://cdn.shopify.com/b.png");
    for (const bad of ["http://cdn.example/a.jpg", "javascript:alert(1)", "data:image/png;base64,AA", "https://u:p@x.example/a.jpg", "not a url", 42, undefined, `https://x.example/${"a".repeat(2001)}`]) {
      expect(proxiedImage(bad)).toBeUndefined();
    }
  });
});

describe("GET /api/img", () => {
  afterEach(() => vi.restoreAllMocks());
  const call = async (u: string) => {
    const { GET } = await import("@/app/api/img/route");
    return GET(new Request(`https://w.example${u}`));
  };
  const respond = (body: BodyInit, type: string, status = 200) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status, headers: { "content-type": type } }));

  it("refuses an unsigned or tampered URL without fetching it", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    expect((await call("/api/img?u=https%3A%2F%2Fx.example%2Fa.jpg")).status).toBe(403);
    expect((await call("/api/img?u=https%3A%2F%2Fx.example%2Fa.jpg&s=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });
  it("serves a signed image with long caching and nosniff", async () => {
    respond(new Uint8Array([1, 2, 3]), "image/jpeg");
    const r = await call(proxiedImage("https://cdn.shop.example/a.jpg")!);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
  it("never serves SVG, HTML or a failed fetch", async () => {
    respond("<svg onload=alert(1)/>", "image/svg+xml");
    expect((await call(proxiedImage("https://cdn.shop.example/a.svg")!)).status).toBe(404);
    respond("<html>", "text/html");
    expect((await call(proxiedImage("https://cdn.shop.example/b")!)).status).toBe(404);
    respond("", "image/png", 500);
    expect((await call(proxiedImage("https://cdn.shop.example/c.png")!)).status).toBe(404);
  });
  it("never fetches a private address even when signed", async () => {
    const f = respond(new Uint8Array([1]), "image/png");
    expect((await call(proxiedImage("https://internal.example/a.png")!)).status).toBe(404);
    expect(f).not.toHaveBeenCalled();
  });
});
