import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetKeys, buildRequest, fetchTheirStack, keyOrder, theirStackKeys } from "./theirstack";

const job = (id: number) => ({ id, job_title: "IAM Director", final_url: `https://boards.greenhouse.io/acme/jobs/${id}`, company: "Acme", location: "Remote", date_posted: "2026-10-01" });
const used: string[] = [];

/** A fake TheirStack: each key answers with the given status (200 returns two jobs). */
function fakeTheirStack(status: Record<string, number>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      const key = init.headers.authorization.replace("Bearer ", "");
      if (url.includes("/catalog/")) return new Response("[]", { status: 200 });
      used.push(key);
      const s = status[key] ?? 200;
      return s === 200 ? new Response(JSON.stringify({ data: [job(used.length * 10 + 1), job(used.length * 10 + 2)] }), { status: 200 }) : new Response("{}", { status: s });
    }),
  );
}

const criteria = { query: "iam director", locations: ["Remote"] };

beforeEach(() => {
  __resetKeys();
  used.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("TheirStack keys", () => {
  it("reads comma-separated keys plus the single key, without duplicates or blanks", () => {
    expect(theirStackKeys({ THEIRSTACK_API_KEYS: " a, b ,,c ", THEIRSTACK_API_KEY: "a" })).toEqual(["a", "b", "c"]);
    expect(theirStackKeys({ THEIRSTACK_API_KEY: "solo" })).toEqual(["solo"]);
    expect(theirStackKeys({})).toEqual([]);
  });

  it("takes turns, one key per search", async () => {
    fakeTheirStack({});
    for (let i = 0; i < 4; i++) await fetchTheirStack(criteria, ["a", "b", "c"]);
    expect(used).toEqual(["a", "b", "c", "a"]);
  });

  it("sets aside a key that is out of credits or rejected, and moves on to the next", async () => {
    fakeTheirStack({ a: 402, b: 401 });
    const jobs = await fetchTheirStack(criteria, ["a", "b", "c"]);
    expect(jobs).toHaveLength(2);
    expect(used).toEqual(["a", "b", "c"]);
    // Set aside for the rest of the month: only "c" is offered now.
    expect(keyOrder(["a", "b", "c"])).toEqual(["c"]);
    expect(keyOrder(["a", "b", "c"], Date.parse("2099-01-15T00:00:00Z"))).toHaveLength(3);
  });

  it("says plainly when every key is spent, and stops asking", async () => {
    fakeTheirStack({ a: 402, b: 402 });
    await expect(fetchTheirStack(criteria, ["a", "b"])).rejects.toThrow(/out of API credits on all 2 key/);
    used.length = 0;
    await expect(fetchTheirStack(criteria, ["a", "b"])).rejects.toThrow(/Every TheirStack API key/);
    expect(used).toEqual([]);
  });

  it("tries the next key on a rate limit without setting the busy one aside", async () => {
    fakeTheirStack({ a: 429 });
    expect(await fetchTheirStack(criteria, ["a", "b"])).toHaveLength(2);
    expect(keyOrder(["a", "b"]).sort()).toEqual(["a", "b"]);
  });

  it("asks nothing without a key", async () => {
    fakeTheirStack({});
    expect(await fetchTheirStack(criteria, [])).toEqual([]);
    expect(used).toEqual([]);
  });
});

describe("TheirStack repeat searches", () => {
  it("asks only for jobs TheirStack discovered since the last answer", async () => {
    const since = "2026-10-09T10:20:00.000Z";
    const body = await buildRequest({ query: "iam director", locations: ["Remote"], since }, 10, "k", async () => null);
    expect(body).toMatchObject({ discovered_at_gte: since, posted_at_max_age_days: 21 });
    expect(await buildRequest({ query: "iam director", locations: ["Remote"] }, 10, "k", async () => null)).not.toHaveProperty("discovered_at_gte");
  });
});
