import { describe, expect, it, vi } from "vitest";
import { boardRef, checkLinksWithOrigins, MemoryJobOriginStore, originHost, SupabaseJobOriginStore } from "./origin";
import type { FollowedLinkCheck } from "./linkCheck";

const AD = "https://www.adzuna.in/land/ad/4398123456?se=abc&utm_medium=api&utm_source=app&v=XYZ";
const NAUKRI = "https://www.naukri.com/job-listings-iam-architect-acme-mumbai-4398123456";

describe("job origins", () => {
  it("recognises an Adzuna ad link and reads the site a link landed on", () => {
    expect(boardRef(AD)).toBe("adzuna:4398123456");
    expect(boardRef("https://www.adzuna.in/details/4398123456")).toBe("adzuna:4398123456");
    expect(boardRef("https://boards.greenhouse.io/acme/jobs/123")).toBeNull();
    expect(boardRef("not a url")).toBeNull();
    expect(originHost(NAUKRI)).toBe("naukri.com");
    expect(originHost("https://www.adzuna.in/details/4398123456")).toBeNull();
    expect(originHost(undefined)).toBeNull();
  });

  it("follows the board's link once, records where it landed, and checks that site directly for the next candidate", async () => {
    const store = new MemoryJobOriginStore();
    const check = vi.fn(async (url: string): Promise<FollowedLinkCheck> => (url === AD ? { status: "open", finalUrl: NAUKRI } : { status: "open", finalUrl: url }));

    const first = await checkLinksWithOrigins([AD], { store, check });
    expect(first[AD]).toEqual({ status: "open", origin: "naukri.com" });
    expect(check).toHaveBeenLastCalledWith(AD);
    expect((await store.get(["adzuna:4398123456"])).get("adzuna:4398123456")).toMatchObject({ host: "naukri.com", finalUrl: NAUKRI });

    check.mockClear();
    const next = await checkLinksWithOrigins([AD], { store, check });
    expect(next[AD]).toEqual({ status: "open", origin: "naukri.com" });
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(NAUKRI); // Adzuna's link isn't followed again
  });

  it("claims no site when the link stays on the board or can't be followed, and never overwrites a site already found", async () => {
    const store = new MemoryJobOriginStore();
    const stays = vi.fn(async (): Promise<FollowedLinkCheck> => ({ status: "open", finalUrl: "https://www.adzuna.in/details/4398123456" }));
    expect((await checkLinksWithOrigins([AD], { store, check: stays }))[AD]).toEqual({ status: "open" });
    expect((await store.get(["adzuna:4398123456"])).get("adzuna:4398123456")).toMatchObject({ host: null });

    const fails = vi.fn(async (): Promise<FollowedLinkCheck> => ({ status: "unknown" }));
    const other = AD.replace("4398123456", "5550001111");
    expect((await checkLinksWithOrigins([other], { store, check: fails }))[other]).toEqual({ status: "unknown" });
    expect((await store.get(["adzuna:5550001111"])).size).toBe(0);

    await store.put("adzuna:4398123456", { host: "naukri.com", finalUrl: NAUKRI });
    await store.put("adzuna:4398123456", { host: null, finalUrl: "https://www.adzuna.in/details/4398123456" });
    expect((await store.get(["adzuna:4398123456"])).get("adzuna:4398123456")?.host).toBe("naukri.com");
  });

  it("leaves links that aren't a board's untouched", async () => {
    const store = { get: vi.fn(), put: vi.fn() };
    const check = vi.fn(async (): Promise<FollowedLinkCheck> => ({ status: "closed", reason: "gone", finalUrl: "https://acme.com/jobs/1" }));
    const r = await checkLinksWithOrigins(["https://acme.com/jobs/1"], { store, check });
    expect(r["https://acme.com/jobs/1"]).toEqual({ status: "closed", reason: "gone" });
    expect(store.get).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it("stores only public facts, keyed by the board's ad id (no tenant), and keeps a found site over a later miss", async () => {
    const calls: { op: string; args: unknown[] }[] = [];
    const chain = {
      select: (...args: unknown[]) => (calls.push({ op: "select", args }), chain),
      in: async (...args: unknown[]) => (calls.push({ op: "in", args }), { data: [{ source_ref: "adzuna:1", origin_host: "naukri.com", final_url: NAUKRI, resolved_at: "2026-10-04T00:00:00Z" }], error: null }),
      upsert: async (...args: unknown[]) => (calls.push({ op: "upsert", args }), { error: null }),
    };
    const sb = { from: (t: string) => (calls.push({ op: "from", args: [t] }), chain) };
    const db = new SupabaseJobOriginStore(sb as never);
    expect((await db.get(["adzuna:1"])).get("adzuna:1")).toMatchObject({ host: "naukri.com" });
    expect(calls.filter((c) => c.op === "from").every((c) => c.args[0] === "job_origins")).toBe(true);
    expect(calls.find((c) => c.op === "in")?.args).toEqual(["source_ref", ["adzuna:1"]]);

    await db.put("adzuna:2", { host: "naukri.com", finalUrl: NAUKRI });
    await db.put("adzuna:3", { host: null, finalUrl: "https://www.adzuna.in/details/3" });
    const [found, miss] = calls.filter((c) => c.op === "upsert");
    expect(Object.keys(found.args[0] as object).sort()).toEqual(["final_url", "origin_host", "resolved_at", "source_ref"]);
    expect(found.args[1]).toEqual({ onConflict: "source_ref" });
    expect(miss.args[1]).toEqual({ onConflict: "source_ref", ignoreDuplicates: true });
  });
});
