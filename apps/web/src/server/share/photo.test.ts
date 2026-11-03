import { describe, expect, it, vi } from "vitest";

const calls: { url: string; accept?: string }[] = [];
vi.mock("@/server/jobslake/safeFetch", () => ({
  safeFetch: vi.fn(async (url: string, opts: { headers?: Record<string, string> }) => {
    calls.push({ url, accept: opts.headers?.accept });
    return { status: 200, contentType: url.endsWith(".webp") ? "image/webp" : "image/jpeg", bytes: Buffer.from([1, 2, 3]) };
  }),
}));

describe("a listing's photo on its share image", () => {
  it("is fetched from the shop asking for JPEG or PNG only (shop CDNs answer WebP otherwise), only for a URL we signed", async () => {
    vi.stubEnv("WONDERJOBS_SECRETS_KEY", "k".repeat(64));
    const { proxiedImage } = await import("@/server/imageProxy");
    const { photoDataUri } = await import("./storyImage");
    const path = proxiedImage("https://cdn.shop.test/p.jpg")!;
    expect(await photoDataUri(path)).toBe(`data:image/jpeg;base64,${Buffer.from([1, 2, 3]).toString("base64")}`);
    expect(calls[0]).toEqual({ url: "https://cdn.shop.test/p.jpg", accept: "image/jpeg,image/png;q=0.9" });
    expect(calls[0].accept).not.toMatch(/webp|avif/);
    // A tampered or unsigned link is refused without a fetch; a WebP answer is left out.
    expect(await photoDataUri(path.replace("p.jpg", "q.jpg"))).toBeNull();
    expect(await photoDataUri("/api/img?u=https%3A%2F%2Fx.test%2Fa.jpg&s=bad")).toBeNull();
    expect(await photoDataUri(proxiedImage("https://cdn.shop.test/p.webp")!)).toBeNull();
    expect(calls).toHaveLength(2);
  });
});

describe("the organisation behind a listing, for its logo", () => {
  it("comes from the module's facts before empty ones are dropped, so a missing organiser never becomes the place", async () => {
    const { organisationOf } = await import("./page");
    expect(organisationOf("events", ["7 Nov 2026", "Gardens Galleria Mall, Noida", ""])).toBeUndefined();
    expect(organisationOf("events", ["7 Nov 2026", "Noida", "Social Sailor"])).toBe("Social Sailor");
    expect(organisationOf("scholarships", [null, "₹50,000", "Apply by 1 Dec"])).toBeUndefined();
    expect(organisationOf("teaching", ["Walderslade School", "Chatham"])).toBe("Walderslade School");
    expect(organisationOf("marketplace", ["₹2,999", "New"])).toBeUndefined();
  });
});
