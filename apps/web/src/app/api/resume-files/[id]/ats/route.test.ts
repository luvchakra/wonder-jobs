import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { deflateSync } from "node:zlib";

let tenant: string | null = "tenant-a";
vi.mock("@/server/auth", () => ({
  requireSession: async () => (tenant ? { userId: tenant, tenantId: tenant, email: `${tenant}@example.com` } : NextResponse.json({ error: "Sign in required" }, { status: 401 })),
}));

import { MemoryResumeFileStore, setResumeFileStoreForTests } from "@/server/resume/files";
import { POST as ats } from "./route";

/** A one-page PDF whose content stream draws the given lines — what a word processor exports. */
function pdf(lines: string[]): Buffer {
  const content = `BT /F1 12 Tf 14 TL 72 720 Td\n${lines.map((l) => `(${l.replace(/([()\\])/g, "\\$1")}) Tj T*`).join("\n")}\nET`;
  const body = deflateSync(Buffer.from(content, "latin1"));
  return Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${body.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), body, Buffer.from("\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF", "latin1")]);
}

const RESUME = ["Arjun Mehta", "arjun@mehta.dev", "Summary", "Engineer with ten years building payments infrastructure, ledgers and reconciliation systems for companies of every size.", "Known for careful migrations, clear writing and mentoring engineers across several teams and time zones.", "Professional Experience", "Staff Software Engineer, Stripe - Mar 2020 - Present", "- Led the migration of the ledger service.", "Education", "Stanford University - M.S. in Computer Science, 2014 - 2016"];
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string) => ats(new Request(`http://localhost/api/resume-files/${id}/ats`, { method: "POST" }), ctx(id));

let store: MemoryResumeFileStore;
beforeEach(() => {
  tenant = `tenant-${Math.random().toString(36).slice(2)}`;
  store = new MemoryResumeFileStore();
  setResumeFileStoreForTests(store);
});
afterEach(() => setResumeFileStoreForTests(undefined));

describe("POST /api/resume-files/[id]/ats", () => {
  it("scores the candidate's own stored file and explains every point, storing nothing", async () => {
    const f = await store.save(tenant!, { filename: "Arjun-Mehta-Resume.pdf", mime: "application/pdf", bytes: pdf(RESUME) });
    const res = await post(f.id);
    expect(res.status).toBe(200);
    const { report } = (await res.json()) as { report: { score: number; rulesVersion: string; file: { name: string; sha256: string }; findings: { id: string; status: string; possible: number }[] } };
    expect(report.rulesVersion).toMatch(/^ats-/);
    expect(report.file).toMatchObject({ name: "Arjun-Mehta-Resume.pdf", sha256: f.sha256 });
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.findings.find((x) => x.id === "text_layer")?.status).toBe("pass");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await store.list(tenant!)).toHaveLength(1);
  });

  it("can't check another account's file, a deleted one, or a malformed id", async () => {
    const f = await store.save(tenant!, { filename: "A.pdf", mime: "application/pdf", bytes: pdf(RESUME) });
    const owner = tenant;
    tenant = "someone-else";
    expect((await post(f.id)).status).toBe(404);
    tenant = owner;
    await store.remove(tenant!, f.id);
    expect((await post(f.id)).status).toBe(404);
    expect((await post("../../etc")).status).toBe(404);
  });

  it("needs a signed-in account", async () => {
    tenant = null;
    expect((await post("rf_abcdefgh12")).status).toBe(401);
  });
});

