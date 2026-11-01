/**
 * WonderWorks Teaching: demo-class bookings (module-keyed `bookings`, docs/WONDERWORKS_PLATFORM.md §5), the flow the
 * owner approved (2026-10-30):
 * - the school offers times on an application (applications.decide, checked on the server, filtered by org_id and module);
 * - the teacher requests one — their own press, gated by `resolveCapability("teaching.book_demo")` read here from their
 *   saved policy (fails closed to asking), once per application (idempotency key demo:{response}:{tenant}, and the
 *   database's one-live-booking index), audited by the route;
 * - the school confirms or declines it, then marks it held or cancels it. Either side can cancel before it starts.
 * The teacher's reads and moves filter by their own tenant (responder_tenant) and module.
 */
import type { Session } from "../auth";
import { table } from "../db/table";
import { HiringError, requirePermission } from "../hiring";
import { deliver, type Notice } from "../notifications/deliver";
import { capabilityDecision, emailTeam, listings, newId, now, orgDomain, orgs, record, responses as allResponses } from "../modules/responses";
import { cleanSlots, demoKey, isOpenApplication, readTerms, SCHOOL_MAY, slotLabel, TEACHER_MAY, TEACHING, type BookingStatus, type DemoBooking, type DemoMode, type SlotInput, type TeacherProfile, type TeachingStatus } from "@/modules/teaching/domain";

type BookingRow = { id: string; module: string; response_id: string; org_id: string; responder_tenant: string; starts_at: string; duration_min: number; mode: DemoMode; location: string; note: string; status: BookingStatus; created_by: string; created_at: string; updated_at: string; idempotency_key?: string | null };

const bookings = () => table<BookingRow>("bookings");
const responses = () => allResponses<TeachingStatus, TeacherProfile>();
const LIVE: BookingStatus[] = ["requested", "confirmed"];

const toBooking = (r: BookingRow): DemoBooking => ({ id: r.id, responseId: r.response_id, startsAt: r.starts_at, durationMin: r.duration_min, mode: r.mode, location: r.location, note: r.note, status: r.status });

export const bookDecision = (tenantId: string) => capabilityDecision(tenantId, "teaching.book_demo");

async function tell(tenantId: string, notice: Notice) {
  try {
    await deliver(tenantId, notice);
  } catch {
    // The move stands; a bell or push that couldn't go is not worth failing it for.
  }
}

async function titles(r: { listing_id: string; org_id: string }) {
  const [p, o] = await Promise.all([listings().one({ id: r.listing_id, org_id: r.org_id, module: TEACHING }), orgs().one({ id: r.org_id })]);
  return { title: p?.title ?? "the teaching job", school: o?.name ?? "The school" };
}

const notice = (title: string, body: string): Notice => ({ category: "application_status", module: TEACHING, title, body, href: "/app/m/teaching/pipeline", action: "Open Pipeline" });

// ---- school side ---------------------------------------------------------------------------------------------------

/** The school offers demo-class times on an application that's still open and has no requested or confirmed one. */
export async function offerDemo(s: Session, orgId: string, responseId: string, slots: SlotInput[]): Promise<DemoBooking[]> {
  await requirePermission(s, orgId, "applications.decide");
  const r = await responses().one({ id: responseId, org_id: orgId, module: TEACHING });
  if (!r) throw new HiringError("That application isn't in this workspace.", 404);
  if (!isOpenApplication(r.status)) throw new HiringError("This application is no longer open.", 409);
  // A demo class is the school's own choice per job: only a job that says so can have one.
  const job = await listings().one({ id: r.listing_id, org_id: orgId, module: TEACHING });
  if (!readTerms(job?.attrs).demo) throw new HiringError("This job doesn't include a demo class. Turn Demo class on in the job first.", 409);
  const c = cleanSlots(slots);
  if ("problem" in c) throw new HiringError(c.problem);
  const current = await bookings().find({ response_id: r.id, org_id: orgId, module: TEACHING });
  if (current.some((b) => LIVE.includes(b.status))) throw new HiringError("A demo class is already requested or confirmed for this application.", 409);
  const at = now();
  const rows: BookingRow[] = c.value.map((x) => ({ id: newId("bkg"), module: TEACHING, response_id: r.id, org_id: orgId, responder_tenant: r.responder_tenant, starts_at: x.startsAt, duration_min: x.durationMin, mode: x.mode, location: x.location, note: x.note, status: "proposed", created_by: s.tenantId, created_at: at, updated_at: at }));
  for (const row of rows) await bookings().insert(row);
  await record(r, "demo:offered", s.tenantId, `${rows.length} time${rows.length > 1 ? "s" : ""}`);
  const { title, school } = await titles(r);
  await tell(r.responder_tenant, notice(`Demo-class times from ${school}`, `${school} offered ${rows.length === 1 ? "a time" : `${rows.length} times`} for a demo class for ${title}. Pick one in Pipeline.`));
  return rows.map(toBooking);
}

/** The workspace's demo classes (applications.view). */
export async function orgBookings(s: Session, orgId: string): Promise<DemoBooking[]> {
  await requirePermission(s, orgId, "applications.view");
  return (await bookings().find({ org_id: orgId, module: TEACHING }, { order: "starts_at", limit: 500 })).map(toBooking);
}

/**
 * The school answers a request (confirm / decline), marks a confirmed one held, or cancels one. Confirming moves the
 * application to Demo class and withdraws the other times offered on it.
 */
export async function answerDemo(s: Session, orgId: string, bookingId: string, to: "confirmed" | "declined" | "held" | "cancelled"): Promise<DemoBooking> {
  await requirePermission(s, orgId, "applications.decide");
  const b = await bookings().one({ id: bookingId, org_id: orgId, module: TEACHING });
  if (!b) throw new HiringError("That demo class isn't in this workspace.", 404);
  if (!(SCHOOL_MAY[b.status] as string[]).includes(to)) throw new HiringError(`A demo class that's ${b.status} can't be ${to}.`, 409);
  // Only the row still in the status we read moves, so two people answering at once tell the teacher once.
  const n = await bookings().update({ id: b.id, org_id: orgId, module: TEACHING, status: b.status }, { status: to, updated_at: now() });
  if (!n) throw new HiringError("Someone else just changed this demo class. Reload and try again.", 409);
  const r = await responses().one({ id: b.response_id, org_id: orgId, module: TEACHING });
  if (r) {
    await record(r, `demo:${to}`, s.tenantId, slotLabel(toBooking(b), "UTC"));
    if (to === "confirmed") {
      for (const other of await bookings().find({ response_id: r.id, org_id: orgId, module: TEACHING, status: "proposed" })) await bookings().update({ id: other.id, org_id: orgId, module: TEACHING, status: "proposed" }, { status: "cancelled", updated_at: now() });
      if ((r.status === "applied" || r.status === "shortlisted") && (await responses().update({ id: r.id, org_id: orgId, module: TEACHING, status: r.status }, { status: "demo_class", updated_at: now() }))) await record(r, "status:demo_class", s.tenantId);
    }
    if (to !== "held") {
      const { title, school } = await titles(r);
      const when = slotLabel(toBooking(b), "Asia/Kolkata");
      if (to === "confirmed") await tell(r.responder_tenant, notice(`Demo class confirmed by ${school}`, `${school} confirmed your demo class for ${title}: ${when} (IST).`));
      else if (to === "declined") await tell(r.responder_tenant, notice(`${school} can't do that time`, `${school} declined the demo-class time you asked for (${when} IST) for ${title}. Pick another time in Pipeline.`));
      else if (b.status !== "proposed") await tell(r.responder_tenant, notice(`Demo class cancelled by ${school}`, `${school} cancelled your demo class for ${title} (${when} IST).`));
    }
  }
  return toBooking({ ...b, status: to });
}

// ---- teacher side ----------------------------------------------------------------------------------------------------

/** The teacher's own demo classes, newest first, with the opening and school each is for. */
export async function myBookings(s: Session): Promise<(DemoBooking & { title: string; school: string; schoolDomain?: string })[]> {
  const rows = await bookings().find({ responder_tenant: s.tenantId, module: TEACHING }, { order: "starts_at", limit: 300 });
  const rs = new Map((await responses().findIn("id", [...new Set(rows.map((b) => b.response_id))], { responder_tenant: s.tenantId, module: TEACHING })).map((r) => [r.id, r]));
  const posts = new Map((await listings().findIn("id", [...new Set([...rs.values()].map((r) => r.listing_id))], { module: TEACHING })).map((p) => [p.id, p.title]));
  const schools = new Map((await orgs().findIn("id", [...new Set(rows.map((b) => b.org_id))])).map((o) => [o.id, o]));
  return rows.flatMap((b) => {
    const r = rs.get(b.response_id);
    const school = schools.get(b.org_id);
    return r ? [{ ...toBooking(b), title: posts.get(r.listing_id) ?? "Teaching job", school: school?.name ?? "The school", ...(school ? { schoolDomain: orgDomain(school).domain } : {}) }] : [];
  });
}

/**
 * The teacher requests one of the times offered. Their own press; `teaching.book_demo` decides whether it goes at once
 * (Automatic), only after they've seen it (Ask me) or not at all (Off). A retry of a request already made returns it
 * and changes nothing.
 */
export async function requestDemo(s: Session, bookingId: string, confirmed = false): Promise<{ booking: DemoBooking; repeated: boolean; notify: () => Promise<void> }> {
  const b = await bookings().one({ id: bookingId, responder_tenant: s.tenantId, module: TEACHING });
  if (!b) throw new HiringError("That demo class isn't yours.", 404);
  const key = demoKey(b.response_id, s.tenantId);
  const done = await bookings().one({ idempotency_key: key, responder_tenant: s.tenantId, module: TEACHING });
  if (done && done.id === b.id && LIVE.includes(done.status)) return { booking: toBooking(done), repeated: true, notify: async () => undefined };
  const decision = await bookDecision(s.tenantId);
  if (decision === "skip") throw new HiringError("Demo-class requests are turned off in Teaching → You.", 403);
  if (decision === "ask" && !confirmed) throw new HiringError("Check the time, then press Request.", 409);
  if (!TEACHER_MAY[b.status].includes("request")) throw new HiringError("That time is no longer offered.", 409);
  if (Date.parse(b.starts_at) <= Date.now()) throw new HiringError("That time has passed.", 409);
  const r = await responses().one({ id: b.response_id, responder_tenant: s.tenantId, module: TEACHING });
  if (!r || !isOpenApplication(r.status)) throw new HiringError("This application is no longer open.", 409);
  const siblings = await bookings().find({ response_id: b.response_id, responder_tenant: s.tenantId, module: TEACHING });
  if (siblings.some((x) => LIVE.includes(x.status))) throw new HiringError("You've already asked for a demo-class time on this application.", 409);
  // A declined or cancelled request frees its key, so another time can be asked for.
  if (done) await bookings().update({ id: done.id, responder_tenant: s.tenantId, module: TEACHING }, { idempotency_key: null });
  let n = 0;
  try {
    n = await bookings().update({ id: b.id, responder_tenant: s.tenantId, module: TEACHING, status: "proposed" }, { status: "requested", idempotency_key: key, updated_at: now() });
  } catch (e) {
    // The unique key or one-live index: a second press that raced the first.
    if (/duplicate|unique/i.test(e instanceof Error ? e.message : "")) throw new HiringError("You've already asked for a demo-class time on this application.", 409);
    throw e;
  }
  if (!n) throw new HiringError("That time is no longer offered.", 409);
  const when = slotLabel(toBooking(b), "Asia/Kolkata");
  await record(r, "demo:requested", "applicant", when);
  const { title } = await titles(r);
  return {
    booking: toBooking({ ...b, status: "requested" }),
    repeated: false,
    notify: () =>
      emailTeam(r, {
        tag: "teaching",
        subject: `Demo-class request for ${title}: ${r.name}`,
        heading: `${r.name} asked for a demo class`,
        intro: `${r.name} asked for ${when} (IST) for ${title} on WonderWorks Teaching. Confirm or decline it in Teaching.`,
        rows: [
          ["Time", `${when} (IST)`],
          ["Email", r.email],
        ],
        href: `/app/m/teaching/company?org=${encodeURIComponent(r.org_id)}&tab=applications`,
      }),
  };
}

/** The teacher cancels a request or a confirmed demo class before it starts. */
export async function cancelMyDemo(s: Session, bookingId: string): Promise<void> {
  const b = await bookings().one({ id: bookingId, responder_tenant: s.tenantId, module: TEACHING });
  if (!b) throw new HiringError("That demo class isn't yours.", 404);
  if (!TEACHER_MAY[b.status].includes("cancel")) throw new HiringError(`It's already ${b.status}.`, 409);
  const n = await bookings().update({ id: b.id, responder_tenant: s.tenantId, module: TEACHING, status: b.status }, { status: "cancelled", updated_at: now() });
  if (!n) throw new HiringError("The school just changed this demo class. Reload and try again.", 409);
  const r = await responses().one({ id: b.response_id, responder_tenant: s.tenantId, module: TEACHING });
  if (r) await record(r, "demo:cancelled", "applicant", slotLabel(toBooking(b), "Asia/Kolkata"));
}
