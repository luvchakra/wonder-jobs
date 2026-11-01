import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
const mailed = vi.hoisted(() => [] as { to: string; subject: string }[]);
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async (m: { to: string; subject: string }) => (mailed.push(m), { sent: true })), parseEmailList: () => [] }));
const delivered = vi.hoisted(() => [] as { tenantId: string; notice: { module?: string; title: string; href: string } }[]);
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async (tenantId: string, notice: { title: string; href: string }) => (delivered.push({ tenantId, notice }), { pushed: 0, emailed: false })) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests, table } from "@/server/db/table";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import * as H from "@/server/hiring";
import { saveService, setServiceStatus } from "./listings";
import { clientAct, clientInvoice, listingReviews, myRequest, myRequests, orgRequests, proAct, proInvoice, requestQuote } from "./requests";
import { renderInvoice } from "./invoice";

const pro: Session = { userId: "u-pro", tenantId: "u-pro", email: "ravi@coolfix.test", name: "Ravi" };
const recruiter: Session = { userId: "u-rec", tenantId: "u-rec", email: "rec@coolfix.test" };
const client: Session = { userId: "u-cli", tenantId: "u-cli", email: "meera@example.com" };
const other: Session = { userId: "u-oth", tenantId: "u-oth", email: "ravi.k@example.com" };
const TODAY = "2026-11-01";
const AC = { title: "Split AC service and gas refill", description: "Wet service of indoor and outdoor units, gas pressure check and refill, and a test run.", lane: "local", category: "AC service & repair", location: "Pune", areas: ["Kothrud"], priceKind: "visit", priceMin: 599, warrantyDays: 30 };
const ASK = { details: "Split AC not cooling, 1.5 ton, second floor.", area: "Kothrud", date: "2026-11-03", slot: "morning" };
const QUOTE = { items: [{ label: "Service charge", amount: 599 }, { label: "Gas refill", amount: 2200 }], start: "2026-11-03", slot: "morning", validUntil: "2026-11-05" };
const BOOK = { address: "Flat 4, Shanti Apartments, Kothrud", phone: "98765 43210" };

const policy = (t: string, p: Record<string, string>) => writeClientState(t, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), ...p }, defaultLevel: "guided" } as never);

beforeEach(async () => {
  resetTablesForTests();
  mailed.length = 0;
  delivered.length = 0;
  await policy(client.tenantId, {});
});

async function listed() {
  const { org } = await H.createWorkspace(pro, { name: "CoolFix Pune" });
  const p = await saveService(pro, org.id, AC);
  await setServiceStatus(pro, org.id, p.id, "open");
  return { orgId: org.id, listingId: p.id };
}
const ask = (listingId: string, s = client, extra: Record<string, unknown> = {}) => requestQuote(s, { listingId, name: "Meera Iyer", request: ASK, ...extra }, TODAY);

describe("a quote request, quote, booking, done, paid and review", () => {
  it("runs end to end, each move only by the side it belongs to, and each notifies the other", async () => {
    const { orgId, listingId } = await listed();
    const { id } = await ask(listingId);
    expect(await table<{ id: string; module: string; status: string }>("responses").find({ id })).toEqual([expect.objectContaining({ module: "services", status: "requested" })]);

    // Before booking the pro sees what and where, never the client's email, address or phone.
    let [seen] = await orgRequests(pro, orgId);
    expect(seen).toMatchObject({ id, name: "Meera Iyer", status: "requested", request: { area: "Kothrud", slot: "morning" } });
    expect(seen.email).toBeUndefined();

    await proAct(pro, orgId, id, { action: "quote", quote: QUOTE }, TODAY);
    expect(delivered.at(-1)).toMatchObject({ tenantId: client.tenantId, notice: { module: "services", title: "CoolFix Pune sent a quote: ₹2,799", href: `/app/m/services/pipeline/${id}` } });
    expect((await myRequest(client, id)).deal.quote).toMatchObject({ total: 2799, validUntil: "2026-11-05" });

    await clientAct(client, id, { action: "accept", booking: BOOK }, TODAY);
    [seen] = await orgRequests(pro, orgId);
    expect(seen).toMatchObject({ status: "booked", email: "meera@example.com", deal: { booking: { address: BOOK.address, phone: "9876543210" } } });

    await proAct(pro, orgId, id, { action: "done" }, TODAY);
    await clientAct(client, id, { action: "paid" }, TODAY);
    await proAct(pro, orgId, id, { action: "paid" }, TODAY);
    await clientAct(client, id, { action: "review", review: { rating: 5, text: "On time, fixed it." } }, TODAY);
    const mine = await myRequest(client, id);
    expect(mine).toMatchObject({ status: "done", warrantyDays: 30, deal: { paid: { client: expect.any(String), pro: expect.any(String) }, review: { rating: 5, name: "Meera" } } });
    expect(mine.history.map((h) => h.status)).toEqual(["requested", "quoted", "booked", "done", "paid_client", "paid_pro", "reviewed"]);
    expect((await listingReviews([listingId])).get(listingId)).toMatchObject({ rating: 5, count: 1 });
  });

  it("only what each side may do next: no accepting an expired quote, no review before done, no second review", async () => {
    const { orgId, listingId } = await listed();
    const { id } = await ask(listingId);
    await expect(clientAct(client, id, { action: "review", review: { rating: 4 } }, TODAY)).rejects.toMatchObject({ status: 409 });
    await expect(clientAct(client, id, { action: "accept", booking: BOOK }, TODAY)).rejects.toMatchObject({ status: 409 });
    await expect(proAct(pro, orgId, id, { action: "done" }, TODAY)).rejects.toMatchObject({ status: 409 });
    await proAct(pro, orgId, id, { action: "quote", quote: QUOTE }, TODAY);
    await expect(clientAct(client, id, { action: "accept", booking: BOOK }, "2026-11-06")).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/expired/) });
    await expect(clientAct(client, id, { action: "accept", booking: { address: "x", phone: "1" } }, TODAY)).rejects.toMatchObject({ status: 400 });
    await clientAct(client, id, { action: "accept", booking: BOOK }, TODAY);
    // A retry of the same press finds it already booked and changes nothing.
    await expect(clientAct(client, id, { action: "accept", booking: BOOK }, TODAY)).rejects.toMatchObject({ status: 409 });
    await proAct(pro, orgId, id, { action: "done" }, TODAY);
    await clientAct(client, id, { action: "review", review: { rating: 4 } }, TODAY);
    await expect(clientAct(client, id, { action: "review", review: { rating: 1 } }, TODAY)).rejects.toMatchObject({ status: 409 });
  });

  it("one live request per service, and the same pro can be booked again once the last job ended", async () => {
    const { orgId, listingId } = await listed();
    const first = await ask(listingId);
    await expect(ask(listingId)).rejects.toMatchObject({ status: 409 });
    await proAct(pro, orgId, first.id, { action: "decline", reason: "Fully booked that week" }, TODAY);
    expect(delivered.at(-1)).toMatchObject({ notice: { title: "CoolFix Pune can't take this one", module: "services" } });
    const again = await ask(listingId);
    expect(again.id).not.toBe(first.id);
    expect((await myRequests(client)).map((r) => r.status).sort()).toEqual(["declined", "requested"]);
  });
});

describe("the gates, read on the server", () => {
  it("services.request_quote: Ask me needs the client's confirm, Off refuses, no saved policy asks (fails closed)", async () => {
    const { listingId } = await listed();
    await policy(client.tenantId, { "services.request_quote": "off" });
    await expect(ask(listingId)).rejects.toMatchObject({ status: 403 });
    await policy(client.tenantId, { "services.request_quote": "ask" });
    await expect(ask(listingId)).rejects.toMatchObject({ status: 409 });
    expect((await ask(listingId, client, { confirmed: true })).id).toMatch(/^rsp_/);
    // Someone who never saved a policy is asked first.
    await expect(requestQuote(other, { listingId, name: "Ravi K", request: ASK }, TODAY)).rejects.toMatchObject({ status: 409 });
  });

  it("services.book: Off refuses the booking; Ask me needs the confirm", async () => {
    const { orgId, listingId } = await listed();
    const { id } = await ask(listingId);
    await proAct(pro, orgId, id, { action: "quote", quote: QUOTE }, TODAY);
    await policy(client.tenantId, { "services.book": "off" });
    await expect(clientAct(client, id, { action: "accept", booking: BOOK }, TODAY)).rejects.toMatchObject({ status: 403 });
    await policy(client.tenantId, { "services.book": "ask" });
    await expect(clientAct(client, id, { action: "accept", booking: BOOK }, TODAY)).rejects.toMatchObject({ status: 409 });
    expect((await clientAct(client, id, { action: "accept", booking: BOOK, confirmed: true }, TODAY)).status).toBe("booked");
  });
});

describe("tenant and workspace isolation", () => {
  it("a client sees and moves only their own requests; a pro only their workspace's, and only with a role that may", async () => {
    const { orgId, listingId } = await listed();
    const { id } = await ask(listingId);
    await policy(other.tenantId, {});
    await expect(myRequest(other, id)).rejects.toMatchObject({ status: 404 });
    await expect(clientAct(other, id, { action: "cancel" }, TODAY)).rejects.toMatchObject({ status: 404 });
    expect(await myRequests(other)).toEqual([]);
    // Another workspace can't read or quote it, even by id.
    const { org: theirs } = await H.createWorkspace(other, { name: "Other Pros" });
    expect(await orgRequests(other, theirs.id)).toEqual([]);
    await expect(proAct(other, theirs.id, id, { action: "quote", quote: QUOTE }, TODAY)).rejects.toMatchObject({ status: 404 });
    await expect(orgRequests(other, orgId)).rejects.toMatchObject({ status: 403 });
    // A recruiter in the pro's workspace may read requests but not quote (applications.decide).
    await table("hiring_members").insert({ org_id: orgId, tenant_id: recruiter.tenantId, role: "recruiter", email: recruiter.email, name: null, joined_at: new Date().toISOString() } as never);
    expect(await orgRequests(recruiter, orgId)).toHaveLength(1);
    await expect(proAct(recruiter, orgId, id, { action: "quote", quote: QUOTE }, TODAY)).rejects.toMatchObject({ status: 403 });
  });

  it("a draft or another module's listing can't be requested, and reviews come only from jobs marked done", async () => {
    const { org } = await H.createWorkspace(pro, { name: "CoolFix Pune" });
    const draft = await saveService(pro, org.id, AC);
    await expect(ask(draft.id)).rejects.toMatchObject({ status: 404 });
    await setServiceStatus(pro, org.id, draft.id, "open");
    const { id } = await ask(draft.id);
    // A review written straight into a request that isn't done isn't read.
    await table("responses").update({ id } as never, { deal: { review: { rating: 1, text: "x", name: "X", at: new Date().toISOString() } } } as never);
    expect((await listingReviews([draft.id])).size).toBe(0);
  });
});

describe("GST, TDS and the invoice summary", () => {
  const GSTIN = "27ABCDE1234F1Z5";
  async function listedWithGstin() {
    const { org } = await H.createWorkspace(pro, { name: "CoolFix <Pune>" });
    const p = await saveService(pro, org.id, { ...AC, gstin: GSTIN });
    await setServiceStatus(pro, org.id, p.id, "open");
    return { orgId: org.id, listingId: p.id };
  }

  it("a pro can charge GST only with a GSTIN on their listing, and the quote carries exactly what they stated", async () => {
    const { orgId, listingId } = await listed();
    const { id } = await ask(listingId);
    await expect(proAct(pro, orgId, id, { action: "quote", quote: { ...QUOTE, gstRate: 18, sac: "998733" } }, TODAY)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/GSTIN/) });
    const w = await listedWithGstin();
    const r2 = await ask(w.listingId, client);
    await proAct(pro, w.orgId, r2.id, { action: "quote", quote: { ...QUOTE, gstRate: 18, sac: "998733", tdsSection: "194J", tdsRate: 10 } }, TODAY);
    expect((await myRequest(client, r2.id)).deal.quote).toMatchObject({ taxable: 2799, gst: { rate: 18, sac: "998733", amount: 503.82 }, total: 3302.82, tds: { section: "194J", amount: 279.9 }, net: 3022.92 });
  });

  it("the invoice summary exists only once the job is booked, only for the two sides, and shows only what the pro stated", async () => {
    const w = await listedWithGstin();
    const { id } = await ask(w.listingId);
    await expect(clientInvoice(client, id)).rejects.toMatchObject({ status: 409 });
    await proAct(pro, w.orgId, id, { action: "quote", quote: { ...QUOTE, gstRate: 18, sac: "998733" } }, TODAY);
    await expect(clientInvoice(client, id)).rejects.toMatchObject({ status: 409 });
    await clientAct(client, id, { action: "accept", booking: BOOK }, TODAY);
    await proAct(pro, w.orgId, id, { action: "done" }, TODAY);
    await clientAct(client, id, { action: "paid" }, TODAY);

    const html = renderInvoice(await clientInvoice(client, id), "client");
    expect(html).toContain("Invoice summary");
    expect(html).toContain("GSTIN 27ABCDE1234F1Z5 (as the pro states it)");
    expect(html).toContain("GST at 18%");
    expect(html).toContain("SAC 998733");
    expect(html).toContain("₹3,302.82");
    expect(html).toContain("You marked it paid");
    expect(html).toContain("It is not a GST tax invoice");
    // Another person's invoice, another workspace's and a role without view rights are refused; the client's email is the pro's view only.
    await expect(clientInvoice(other, id)).rejects.toMatchObject({ status: 404 });
    await expect(proInvoice(other, w.orgId, id)).rejects.toMatchObject({ status: 403 });
    const { org: theirs } = await H.createWorkspace(other, { name: "Other Pros" });
    await expect(proInvoice(other, theirs.id, id)).rejects.toMatchObject({ status: 404 });
    expect(renderInvoice(await proInvoice(pro, w.orgId, id), "pro")).toContain("meera@example.com");
    expect(html).not.toContain("meera@example.com");
  });

  it("a quote without tax says none; TDS is shown only when the pro named it; whatever anyone typed is escaped", async () => {
    const w = await listedWithGstin();
    const { id } = await ask(w.listingId);
    await proAct(pro, w.orgId, id, { action: "quote", quote: { ...QUOTE, note: "<script>alert(1)</script>" } }, TODAY);
    await clientAct(client, id, { action: "accept", booking: { ...BOOK, address: "Flat 4, <img src=x onerror=alert(1)>, Kothrud" } }, TODAY);
    const html = renderInvoice(await clientInvoice(client, id), "client");
    expect(html).not.toContain("GST at");
    expect(html).not.toContain("TDS under");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(renderInvoice(await proInvoice(pro, w.orgId, id), "pro")).toContain("CoolFix &lt;Pune&gt;");
  });
});
