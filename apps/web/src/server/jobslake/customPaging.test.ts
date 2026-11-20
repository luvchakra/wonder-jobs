import { describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("./safeFetch", () => ({
  safeFetch: async (url: string) => {
    calls.push(url);
    const cursor = new URL(url).searchParams.get("cursor");
    const page = cursor ? Number(cursor) : 0;
    const items = Array.from({ length: page < 2 ? 100 : 30 }, (_, i) => ({ id: `${page}-${i}`, title: `Role ${page}-${i}`, employer: "Example", applyUrl: `https://example.org/${page}/${i}` }));
    return { status: 200, contentType: "application/json", text: JSON.stringify({ items, nextCursor: page < 2 ? String(page + 1) : null }), finalUrl: url, headers: new Headers(), bytes: Buffer.from("") };
  },
}));

import { fetchJsonApi, type JsonApiConfig } from "./custom";

const cfg: JsonApiConfig = { endpoint: "https://gw.example/v1/workslake/jobs/listings", mapping: { itemsPath: "items", fields: { externalId: "id", title: "title", employer: "employer", applyUrl: "applyUrl" } } as JsonApiConfig["mapping"], pagination: { cursorParam: "cursor", nextCursorPath: "nextCursor", pageSize: 100 } };

describe("a paged API (the data gateway) reads past its first page only when asked for more", () => {
  it("follows nextCursor until it has as many as asked, or the pages end", async () => {
    calls.length = 0;
    const r = await fetchJsonApi(cfg, { query: "", locations: [], maxResults: 1000 });
    expect(r.raws).toHaveLength(230);
    expect(calls).toHaveLength(3);
  });
  it("a search that asks for no more than one page reads one page", async () => {
    calls.length = 0;
    const r = await fetchJsonApi(cfg, { query: "", locations: [] });
    expect(r.raws).toHaveLength(100);
    expect(calls).toHaveLength(1);
  });
});
