/**
 * What a person sent to others, and their own data rights (owner, 2026-11-22: deleting an account deletes these, with
 * a full warning first). Applications sent with Easy Apply (with the résumé copy, answers and the company's notes on
 * them), requests sent through modules (an internship application, a teaching demo request, a quote request…), and
 * demo bookings. Each is the person's own, so it goes with the account; the companies and schools lose them. Their
 * events, résumé copies, files and reviews go with them (foreign keys, on delete cascade; removed here too, so a store
 * without those keys ends the same).
 *
 * A school member who offered a demo appears on its booking as `created_by`: that booking is the other person's, so it
 * stays, naming a former member instead.
 */
import { table } from "./db/table";

type AppRow = { id: string; org_id: string; job_id: string; applicant_tenant?: string | null; created_at: string; status: string };
type ResponseRow = { id: string; module: string; listing_id: string; org_id: string; responder_tenant: string; status: string; created_at: string };
type BookingRow = { id: string; module: string; response_id: string; responder_tenant: string; created_by: string; starts_at: string; status: string };

const apps = () => table<AppRow>("job_applications");
const responses = () => table<ResponseRow>("responses");
const bookings = () => table<BookingRow>("bookings");
export const FORMER_MEMBER = "former-member";

/** What the person sent, for the warning before deletion and for the export. */
export async function sentSummary(tenantId: string): Promise<{ applications: number; companies: number; requests: Record<string, number>; bookings: number }> {
  const [a, r, b] = await Promise.all([
    apps().find({ applicant_tenant: tenantId }, { limit: 5000 }).catch(() => [] as AppRow[]),
    responses().find({ responder_tenant: tenantId }, { limit: 5000 }).catch(() => [] as ResponseRow[]),
    bookings().find({ responder_tenant: tenantId }, { limit: 5000 }).catch(() => [] as BookingRow[]),
  ]);
  const requests: Record<string, number> = {};
  for (const x of r) requests[x.module] = (requests[x.module] ?? 0) + 1;
  return { applications: a.length, companies: new Set(a.map((x) => x.org_id)).size, requests, bookings: b.length };
}

export async function exportSent(tenantId: string): Promise<unknown> {
  const [a, r, b] = await Promise.all([
    apps().find({ applicant_tenant: tenantId }, { limit: 5000 }).catch(() => [] as AppRow[]),
    responses().find({ responder_tenant: tenantId }, { limit: 5000 }).catch(() => [] as ResponseRow[]),
    bookings().find({ responder_tenant: tenantId }, { limit: 5000 }).catch(() => [] as BookingRow[]),
  ]);
  return {
    easyApplyApplications: a.map((x) => ({ id: x.id, job: x.job_id, status: x.status, at: x.created_at })),
    moduleRequests: r.map((x) => ({ id: x.id, module: x.module, listing: x.listing_id, status: x.status, at: x.created_at })),
    bookings: b.map((x) => ({ id: x.id, module: x.module, startsAt: x.starts_at, status: x.status })),
  };
}

export async function eraseSent(tenantId: string): Promise<void> {
  for (const a of await apps().find({ applicant_tenant: tenantId }, { limit: 5000 })) {
    for (const t of ["job_application_events", "job_application_files", "job_application_reviews"]) await table<{ application_id: string }>(t).remove({ application_id: a.id }).catch(() => 0);
    await apps().remove({ id: a.id });
  }
  for (const r of await responses().find({ responder_tenant: tenantId }, { limit: 5000 })) {
    for (const t of ["response_events", "response_files", "bookings"]) await table<{ response_id: string }>(t).remove({ response_id: r.id }).catch(() => 0);
    await responses().remove({ id: r.id });
  }
  await bookings().remove({ responder_tenant: tenantId });
  await bookings().update({ created_by: tenantId }, { created_by: FORMER_MEMBER });
}
