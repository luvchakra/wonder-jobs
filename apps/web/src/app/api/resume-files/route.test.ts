import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/* Auth: whichever account the test says is signed in; null is signed out. */
let tenant: string | null = "tenant-a";
vi.mock("@/server/auth", () => ({
  requireSession: async () => (tenant ? { userId: tenant, tenantId: tenant, email: `${tenant}@example.com` } : NextResponse.json({ error: "Sign in required" }, { status: 401 })),
}));

import { MemoryResumeFileStore, setResumeFileStoreForTests } from "@/server/resume/files";
import { GET as list, POST as upload } from "./route";
import { DELETE as remove, GET as download } from "./[id]/route";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Length 20 >>\nstream\nBT (Priya Raman) Tj ET\nendstream\nendobj\n%%EOF", "latin1");
const post = (bytes: Buffer, name = "Priya Raman – CV.pdf") => {
  const body = new FormData();
  body.append("file", new File([new Uint8Array(bytes)], name));
  return upload(new Request("http://localhost/api/resume-files", { method: "POST", body }));
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let store: MemoryResumeFileStore;
beforeEach(() => {
  tenant = `tenant-${Math.random().toString(36).slice(2)}`;
  store = new MemoryResumeFileStore();
  setResumeFileStoreForTests(store);
});
afterEach(() => setResumeFileStoreForTests(undefined));

describe("/api/resume-files", () => {
  it("needs a signed-in account", async () => {
    tenant = null;
    expect((await list()).status).toBe(401);
    expect((await post(PDF)).status).toBe(401);
    expect((await download(new Request("http://x"), ctx("rf_abcdefgh12"))).status).toBe(401);
    expect((await remove(new Request("http://x"), ctx("rf_abcdefgh12"))).status).toBe(401);
  });

  it("uploads a real PDF, lists it, and downloads the exact bytes as an attachment", async () => {
    const res = await post(PDF);
    expect(res.status).toBe(201);
    const { file } = (await res.json()) as { file: { id: string; filename: string; mime: string } };
    expect(file).toMatchObject({ filename: "Priya Raman – CV.pdf", mime: "application/pdf" });
    expect(((await (await list()).json()) as { files: unknown[] }).files).toHaveLength(1);

    const d = await download(new Request("http://x"), ctx(file.id));
    expect(d.status).toBe(200);
    expect(Buffer.from(await d.arrayBuffer()).equals(PDF)).toBe(true);
    expect(d.headers.get("content-type")).toBe("application/pdf");
    expect(d.headers.get("content-disposition")).toMatch(/^attachment; filename="Priya Raman _ CV\.pdf"; filename\*=UTF-8''Priya%20Raman%20%E2%80%93%20CV\.pdf$/);
    expect(d.headers.get("x-content-type-options")).toBe("nosniff");
    expect(d.headers.get("cache-control")).toContain("no-store");
  });

  it("refuses a file that isn't a real PDF or Word document, whatever its name", async () => {
    const res = await post(Buffer.from("<script>alert(1)</script>"), "resume.pdf");
    expect(res.status).toBe(415);
    expect(store._raw(tenant!, "anything")).toBeUndefined();
    expect(((await (await list()).json()) as { files: unknown[] }).files).toEqual([]);
  });

  it("caps an account at five files", async () => {
    for (let i = 0; i < 5; i++) expect((await post(PDF, `cv-${i}.pdf`)).status).toBe(201);
    expect((await post(PDF)).status).toBe(409);
  });

  it("never serves or deletes another account's file", async () => {
    const { file } = (await (await post(PDF)).json()) as { file: { id: string } };
    const owner = tenant;
    tenant = "someone-else";
    expect((await download(new Request("http://x"), ctx(file.id))).status).toBe(404);
    expect((await remove(new Request("http://x"), ctx(file.id))).status).toBe(404);
    tenant = owner;
    expect((await download(new Request("http://x"), ctx(file.id))).status).toBe(200);
    expect((await remove(new Request("http://x"), ctx(file.id))).status).toBe(200);
    expect((await download(new Request("http://x"), ctx(file.id))).status).toBe(404);
  });

  it("rejects malformed ids before touching storage", async () => {
    for (const id of ["../etc/passwd", "rf_", "x".repeat(60), "rf_abc$def12"]) {
      expect((await download(new Request("http://x"), ctx(id))).status).toBe(404);
    }
  });
});
