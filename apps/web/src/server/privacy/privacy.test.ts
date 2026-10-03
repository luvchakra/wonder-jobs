import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stateStore } from "../state";
import { secretStore } from "../secrets";
import { MemoryBillingStore, setBillingStoreForTests } from "../billing/store";
import { MemoryResumeFileStore, setResumeFileStoreForTests } from "../resume/files";
import { buildExport, eraseAccount } from "./subjectRights";
import { consentHistory, latestConsent, privacyRequests, recordConsent, resetPrivacyMemory, subjectRef } from "./records";
import { RETENTION, grievanceContact } from "@/content/privacy";

const A = { userId: "tenant-a", tenantId: "tenant-a", email: "a@example.com" };
const B = { userId: "tenant-b", tenantId: "tenant-b", email: "b@example.com" };

let billing: MemoryBillingStore;
let files: MemoryResumeFileStore;
beforeEach(async () => {
  billing = new MemoryBillingStore();
  setBillingStoreForTests(billing);
  files = new MemoryResumeFileStore();
  setResumeFileStoreForTests(files);
  resetPrivacyMemory();
  for (const t of [A, B]) {
    await stateStore.put(t.tenantId, "wj.career", { dna: { name: `name-${t.tenantId}` } });
    await secretStore.put(t.tenantId, { provider: "anthropic", ciphertext: "secret-ciphertext", masked: "sk-ant-••••abcd", connectedAt: "2026-10-01T00:00:00.000Z" });
  }
});
afterEach(() => {
  setBillingStoreForTests(undefined);
  setResumeFileStoreForTests(undefined);
});

describe("data export (access / portability)", () => {
  it("contains this account's data and nobody else's, and never the key ciphertext", async () => {
    await recordConsent(A.tenantId, { purpose: "privacy_notice", noticeVersion: "v1", granted: true });
    const out = await buildExport(A);
    const text = JSON.stringify(out);
    expect(out.appData["wj.career"]).toEqual({ dna: { name: "name-tenant-a" } });
    expect(text).not.toContain("name-tenant-b");
    expect(text).not.toContain("secret-ciphertext");
    expect(out.aiProviderKeys).toEqual([{ provider: "anthropic", masked: "sk-ant-••••abcd", model: null, connectedAt: "2026-10-01T00:00:00.000Z", lastVerifiedAt: null }]);
    expect(out.consents).toHaveLength(1);
    expect(out.retention).toBe(RETENTION);
  });

  it("lists this account's uploaded résumé files with a download link, never the file bytes or ciphertext", async () => {
    const mine = await files.save(A.tenantId, { filename: "A CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.7 tenant-a-resume-bytes") });
    await files.save(B.tenantId, { filename: "B CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.7 tenant-b-resume-bytes") });
    const out = await buildExport(A);
    expect(out.resumeFiles).toEqual([expect.objectContaining({ id: mine.id, filename: "A CV.pdf", download: `/api/resume-files/${mine.id}` })]);
    const text = JSON.stringify(out);
    expect(text).not.toContain("B CV.pdf");
    expect(text).not.toContain(files._raw(A.tenantId, mine.id)!.slice(3, 40));
  });
});

describe("account erasure", () => {
  it("refuses while a subscription would keep charging, and records the refusal", async () => {
    await billing.saveSubscription({ tenantId: A.tenantId, provider: "razorpay", subscriptionId: "sub", status: "active", cancelAtPeriodEnd: false, updatedAt: "2026-10-01T00:00:00.000Z" });
    const r = await eraseAccount(A);
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect((await stateStore.get(A.tenantId, "wj.career"))?.state).toBeTruthy();
    expect((await privacyRequests(A.tenantId)).map((x) => x.event)).toEqual(["refused"]);
  });

  it("deletes the account's data, leaves other accounts alone, keeps the billing ledger and a hashed record", async () => {
    await billing.saveSubscription({ tenantId: A.tenantId, provider: "stripe", subscriptionId: "sub", status: "active", cancelAtPeriodEnd: true, updatedAt: "2026-10-01T00:00:00.000Z" });
    await billing.append({ provider: "stripe", eventId: "evt", providerType: "invoice.paid", kind: "payment_succeeded", tenantId: A.tenantId, subscriptionId: "sub", amount: 100, currency: "USD", occurredAt: "2026-10-01T00:00:00.000Z", payloadSha256: "p", outcome: "applied" });
    await recordConsent(A.tenantId, { purpose: "privacy_notice", noticeVersion: "v1", granted: true });
    await files.save(A.tenantId, { filename: "A.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.7 a") });
    await files.save(B.tenantId, { filename: "B.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.7 b") });

    expect(await eraseAccount(A)).toEqual({ ok: true });

    expect(await stateStore.get(A.tenantId, "wj.career")).toBeUndefined();
    expect(await secretStore.list(A.tenantId)).toEqual([]);
    expect(await files.list(A.tenantId)).toEqual([]);
    expect(await files.list(B.tenantId)).toHaveLength(1);
    expect(await billing.subscriptionsForTenant(A.tenantId)).toEqual([]);
    expect(await consentHistory(A.tenantId)).toEqual([]);
    // Statutory financial record survives, untouched.
    expect(await billing.ledgerForTenant(A.tenantId)).toHaveLength(1);
    // The erasure is provable without keeping the identifier.
    expect((await privacyRequests(A.tenantId)).map((x) => x.event)).toEqual(["requested", "completed"]);
    expect(subjectRef(A.tenantId)).not.toContain(A.tenantId);
    // Tenant B untouched.
    expect((await stateStore.get(B.tenantId, "wj.career"))?.state).toEqual({ dna: { name: "name-tenant-b" } });
    expect(await secretStore.list(B.tenantId)).toHaveLength(1);
  });
});

describe("consent records", () => {
  it("are append-only: a later decision is a new row and the latest one wins", async () => {
    await recordConsent(A.tenantId, { purpose: "privacy_notice", noticeVersion: "v1", granted: true });
    await recordConsent(A.tenantId, { purpose: "privacy_notice", noticeVersion: "v2", granted: true });
    expect(await consentHistory(A.tenantId)).toHaveLength(2);
    expect((await latestConsent(A.tenantId, "privacy_notice"))?.noticeVersion).toBe("v2");
    expect(await latestConsent(B.tenantId, "privacy_notice")).toBeUndefined();
  });
});

describe("published privacy facts", () => {
  it("never invents a grievance contact", () => {
    expect(grievanceContact({})).toEqual({ name: undefined, email: undefined });
    expect(grievanceContact({ name: " ", email: "privacy@example.com" })).toEqual({ name: undefined, email: "privacy@example.com" });
  });
  it("enforces exactly one automatic retention period, for contact messages", () => {
    expect(RETENTION.filter((r) => r.days)).toEqual([expect.objectContaining({ days: 730 })]);
  });
});
