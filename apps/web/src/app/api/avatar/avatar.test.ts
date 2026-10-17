import { describe, expect, it, vi } from "vitest";
import { photoType } from "@/server/avatar";

let tenant = "tenant_a";
vi.mock("@/server/auth", () => ({ requireSession: async () => ({ userId: tenant, tenantId: tenant }) }));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(500).fill(7)]);

describe("profile photo", () => {
  it("accepts JPEG, PNG and WebP by their bytes, and nothing else", () => {
    expect(photoType(JPEG)).toBe("image/jpeg");
    expect(photoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(photoType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeUndefined();
  });

  it("is stored for the signed-in account only, and can be removed", async () => {
    const route = await import("./route");
    tenant = "tenant_a";
    expect((await route.PUT(new Request("http://x/api/avatar", { method: "PUT", body: JPEG }))).status).toBe(200);
    const mine = await route.GET();
    expect(mine.status).toBe(200);
    expect(mine.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await mine.arrayBuffer())).toEqual(JPEG);
    tenant = "tenant_b";
    expect((await route.GET()).status).toBe(404);
    expect((await route.PUT(new Request("http://x/api/avatar", { method: "PUT", body: new TextEncoder().encode("<svg/>") }))).status).toBe(400);
    tenant = "tenant_a";
    await route.DELETE();
    expect((await route.GET()).status).toBe(404);
  });
});
