import { beforeEach, describe, expect, it, vi } from "vitest";
import { deflateSync } from "node:zlib";

const session = vi.fn();
vi.mock("@/server/auth", () => ({ requireSession: () => session() }));

import { POST } from "./route";

/** A one-page text PDF, the way a word processor exports one. */
function pdf(lines: string[]): Buffer {
  const content = `BT /F1 12 Tf 14 TL 72 720 Td\n${lines.map((l) => `(${l.replace(/([()\\])/g, "\\$1")}) Tj T*`).join("\n")}\nET`;
  const body = deflateSync(Buffer.from(content, "latin1"));
  return Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${body.length} /Filter /FlateDecode >>\nstream\n`, "latin1"),
    body,
    Buffer.from("\nendstream\nendobj\n%%EOF", "latin1"),
  ]);
}

const RESUME = [
  "Priya Raman",
  "Senior Product Manager",
  "Bengaluru, India",
  "Product manager with 8 years of experience building payments and lending products for consumers.",
  "Owned the roadmap for a wallet used by four million people, running product discovery every week.",
  "Built the analytics the team trusted with SQL and Mixpanel, and ran A/B testing on onboarding.",
  "Wrote PRDs, ran prioritization, and drove go-to-market with marketing and stakeholder management.",
];

const json = (body: unknown) => new Request("https://wonderjobs.test/api/career/import-resume", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function multipart(bytes: Buffer, filename: string, type: string) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], filename, { type }));
  return new Request("https://wonderjobs.test/api/career/import-resume", { method: "POST", body: form });
}

describe("POST /api/career/import-resume", () => {
  beforeEach(() => {
    session.mockReset();
    // A fresh tenant per test keeps the rate limiter out of the way.
    session.mockResolvedValue({ tenantId: `t-${Math.random().toString(36).slice(2)}` });
  });

  it("reads a pasted resume and suggests fields", async () => {
    const res = await POST(json({ text: RESUME.join("\n") }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft.name).toBe("Priya Raman");
    expect(body.draft.yearsExperience).toBe(8);
    expect(body.draft.skills.map((s: { name: string }) => s.name)).toContain("SQL");
    expect(body.format).toBe("text");
  });

  it("reads an uploaded PDF", async () => {
    const res = await POST(multipart(pdf(RESUME), "priya-resume.pdf", "application/pdf"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.format).toBe("pdf");
    expect(body.filename).toBe("priya-resume.pdf");
    expect(body.draft.headline).toBe("Senior Product Manager");
  });

  it("says a scanned PDF has no text to read, rather than returning an empty profile", async () => {
    const res = await POST(multipart(Buffer.from("%PDF-1.4\n%%EOF"), "scan.pdf", "application/pdf"));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/scan or an image/i);
  });

  it("refuses an old .doc with a way forward", async () => {
    const res = await POST(multipart(Buffer.from("\xd0\xcf\x11\xe0 old word", "latin1"), "resume.doc", "application/msword"));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/Save it as PDF or DOCX/i);
  });

  it("asks for more when barely anything is pasted", async () => {
    expect((await POST(json({ text: "Priya Raman" }))).status).toBe(400);
  });

  it("requires a session", async () => {
    const { NextResponse } = await import("next/server");
    session.mockResolvedValue(NextResponse.json({ error: "Sign in required" }, { status: 401 }));
    expect((await POST(json({ text: RESUME.join("\n") }))).status).toBe(401);
  });
});
