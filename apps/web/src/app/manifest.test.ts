import { describe, expect, it, vi } from "vitest";

const headerValues = new Map<string, string>();
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => headerValues.get(k) ?? null }) }));

const { default: manifest } = await import("./manifest");

describe("web app manifest", () => {
  it("has everything browsers need to install it", async () => {
    headerValues.clear();
    headerValues.set("host", "wonderjobs.example");
    const m = await manifest();
    expect(m).toMatchObject({ id: "/app", name: expect.any(String), short_name: "WonderJobs", start_url: "/app", scope: "/", display: "standalone" });
    expect(m.description).toBeTruthy();
    expect(m.theme_color).toBeTruthy();
    expect(m.background_color).toBeTruthy();
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  });

  it("lists itself as a related web app (same origin) so a tab can tell it's installed", async () => {
    headerValues.clear();
    headerValues.set("host", "wonderjobs.example");
    headerValues.set("x-forwarded-proto", "https");
    const m = await manifest();
    expect(m.related_applications).toEqual([{ platform: "webapp", url: "https://wonderjobs.example/manifest.webmanifest" }]);
    expect(m.prefer_related_applications).toBe(false);

    headerValues.clear();
    headerValues.set("host", "localhost:3000");
    expect((await manifest()).related_applications).toEqual([{ platform: "webapp", url: "http://localhost:3000/manifest.webmanifest" }]);
  });
});
