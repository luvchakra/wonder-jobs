import { afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/* Auth: signed in or not, as each test says. The help assistant answers only signed-in accounts (WJ-309). */
let signedIn = false;
vi.mock("@/server/auth", () => ({
  requireSession: async () => (signedIn ? { userId: "u1", tenantId: "u1" } : NextResponse.json({ error: "Sign in required" }, { status: 401, headers: { "cache-control": "no-store" } })),
}));
// No platform model: answers come straight from the guide.
vi.mock("@/server/providers/platform", () => ({ platformAI: () => null }));

import { POST } from "./route";

const ask = (question: string) => POST(new Request("http://localhost/api/help/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) }));

afterEach(() => {
  signedIn = false;
});

describe("POST /api/help/ask — signed-in accounts only", () => {
  it("signed out: 401 and nothing from the guide", async () => {
    const res = await ask("Where do the jobs come from?");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Sign in required" });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("signed in: answers from the guide, privately", async () => {
    signedIn = true;
    const res = await ask("Where do the jobs come from?");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { answer: string; sectionId: string; source: string };
    expect(body.sectionId).toBe("sources");
    expect(body.source).toBe("guide");
    expect(body.answer.length).toBeGreaterThan(20);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("signed in: a bad question is still refused, without guide text", async () => {
    signedIn = true;
    const res = await ask("x");
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
