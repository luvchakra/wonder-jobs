import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { deflateSync } from "node:zlib";

let tenant: string | null = "tenant-a";
vi.mock("@/server/auth", () => ({
  requireSession: async () => (tenant ? { userId: tenant, tenantId: tenant, email: `${tenant}@example.com` } : NextResponse.json({ error: "Sign in required" }, { status: 401 })),
}));

import { MemoryResumeFileStore, setResumeFileStoreForTests } from "@/server/resume/files";
import { POST as read } from "./route";

/** A one-page PDF whose content stream draws the given lines — what a word processor exports. */
function pdf(lines: string[]): Buffer {
  const content = `BT /F1 12 Tf 14 TL 72 720 Td\n${lines.map((l) => `(${l.replace(/([()\\])/g, "\\$1")}) Tj T*`).join("\n")}\nET`;
  const body = deflateSync(Buffer.from(content, "latin1"));
  return Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${body.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), body, Buffer.from("\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF", "latin1")]);
}

const RESUME = ["Arjun Mehta", "arjun@mehta.dev", "Summary", "Engineer with ten years building payments infrastructure, ledgers and reconciliation systems for companies of every size.", "Known for careful migrations, clear writing and mentoring engineers across several teams and time zones.", "Professional Experience", "Staff Software Engineer, Stripe - Mar 2020 - Present", "- Led the migration of the ledger service.", "Education", "Stanford University - M.S. in Computer Science, 2014 - 2016"];
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string) => read(new Request(`http://localhost/api/resume-files/${id}/read`, { method: "POST" }), ctx(id));

let store: MemoryResumeFileStore;
beforeEach(() => {
  tenant = `tenant-${Math.random().toString(36).slice(2)}`;
  store = new MemoryResumeFileStore();
  setResumeFileStoreForTests(store);
});
afterEach(() => setResumeFileStoreForTests(undefined));

describe("POST /api/resume-files/[id]/read", () => {
  it("proposes profile and history entries from the candidate's own stored file, writing nothing", async () => {
    const f = await store.save(tenant!, { filename: "Arjun CV.pdf", mime: "application/pdf", bytes: pdf(RESUME) });
    const res = await post(f.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { draft: { name?: string }; history: { experience: { employer: string }[]; education: { institution: string }[]; contact: { email?: { value: string } } }; text: string; filename: string };
    expect(body.filename).toBe("Arjun CV.pdf");
    expect(body.draft.name).toBe("Arjun Mehta");
    expect(body.history.contact.email?.value).toBe("arjun@mehta.dev");
    expect(body.history.experience.map((e) => e.employer)).toEqual(["Stripe"]);
    expect(body.history.education.map((e) => e.institution)).toEqual(["Stanford University"]);
    expect(body.text).toContain("Staff Software Engineer");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await store.list(tenant!)).toHaveLength(1);
  });

  it("can't read another account's file, a deleted one, or a malformed id", async () => {
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
