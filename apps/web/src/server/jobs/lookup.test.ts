import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashKey } from "@/lib/ids";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

import { findJobById } from "./lookup";

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe("findJobById — re-deriving a shared job link with no public jobs store", () => {
  it("returns null for an id whose source prefix isn't a known source", async () => {
    expect(await findJobById("not-a-source_abc123")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("finds a greenhouse posting past the query-time DETAIL_LIMIT by scanning the board's full list, not just the first page", async () => {
    // A real reported bug's link: careers_1bzrjhd. The listing at any position, not only the first 12, must resolve.
    const list = Array.from({ length: 20 }, (_, i) => ({ id: 5000 + i, absolute_url: `https://boards.greenhouse.io/groww/jobs/${5000 + i}`, title: `Role ${i}`, updated_at: "2026-01-01T00:00:00Z" }));
    const target = list[19];
    const hash = hashKey(`careers:gh:groww:${target.id}`);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes(`/boards/groww/jobs/${target.id}`)) return ok({ ...target, content: "<p>Own the roadmap for our lending products.</p>" });
      if (url.includes("/boards/groww/jobs")) return ok({ jobs: list });
      return ok({ jobs: [] });
    });
    const job = await findJobById(`careers_${hash}`);
    expect(job?.title).toBe("Role 19");
    expect(job?.company).toBe("Groww");
    expect(job?.description).toContain("lending products");
  });

  it("returns null, never a fabricated stand-in, when the posting can no longer be found on any board", async () => {
    fetchMock.mockResolvedValue(ok({ jobs: [] }));
    expect(await findJobById("careers_doesnotexist")).toBeNull();
  });

  it("finds a job from a broad-feed source by re-fetching its unfiltered feed", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("remotive.com")) {
        return ok({ jobs: [{ id: 42, url: "https://apply.example/42", title: "Staff Engineer", company_name: "Acme", category: "software-dev", tags: [], job_type: "full_time", publication_date: "2026-01-01T00:00:00Z", candidate_required_location: "Worldwide", salary: "", description: "Build reliable systems." }] });
      }
      return ok({ jobs: [] });
    });
    const hash = hashKey("remotive:42");
    const job = await findJobById(`remotive_${hash}`);
    expect(job?.title).toBe("Staff Engineer");
    expect(job?.company).toBe("Acme");
  });

  it("returns null when a broad-feed source no longer carries that posting", async () => {
    fetchMock.mockResolvedValue(ok({ jobs: [] }));
    expect(await findJobById("remotive_gone")).toBeNull();
  });
});
