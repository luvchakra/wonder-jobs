/**
 * Therapists' sessions (WJ-443): a client's request for a session, the practitioner's confirmed time, and how it ends.
 * Pure, so the server, the screens and the tests share it.
 *
 * The flow, as therapist directories run it when the practitioner keeps their own calendar (Psychology Today's
 * "request an appointment", Practo's and Amaha's request-then-confirm): the client asks for a way of meeting, a day
 * and a time of day; the practitioner confirms an exact time (with the meeting link or address) or declines with a
 * stated reason; either side can cancel before it starts; the practitioner marks it held. The fee is paid to the
 * practitioner directly: no money moves through WonderWorks.
 *
 * Health data is kept to the minimum until legal review: no notes, no reason for seeking therapy, no free-text from
 * the client at all. The phone, if the client gives one, reaches the practitioner only once the session is confirmed.
 */
import { addDays, todayIst } from "@/wonderworks/listing/terms";
import { MODE_LABEL, MODES, type Mode } from "./domain";

export { addDays, todayIst };

export type SessionStatus = "requested" | "confirmed" | "held" | "declined" | "cancelled";
export const STATUS_LABEL: Record<SessionStatus, string> = { requested: "Requested", confirmed: "Confirmed", held: "Held", declined: "Declined", cancelled: "Cancelled" };

/** Sessions' stages (the manifest's ids): declined and cancelled end under Held / Closed, as chips. */
export const STAGE_OF: Record<SessionStatus, "requested" | "upcoming" | "held_closed"> = { requested: "requested", confirmed: "upcoming", held: "held_closed", declined: "held_closed", cancelled: "held_closed" };
export const LIVE: SessionStatus[] = ["requested", "confirmed"];

export const SLOTS = ["morning", "afternoon", "evening"] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<Slot, string> = { morning: "Morning (8 am–12 pm)", afternoon: "Afternoon (12–4 pm)", evening: "Evening (4–9 pm)" };

/** Why a practitioner can't take it: chosen, never typed, so nothing personal is written down. */
export const DECLINE_REASONS = { full: "Fully booked around then", new_clients: "Not taking new clients", fit: "Not the right fit — try another practitioner" } as const;
export type DeclineReason = keyof typeof DECLINE_REASONS;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, all: readonly T[]) => (typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : undefined);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * The server answers 409 with this when the person's saved setting (read there, failing closed) is Ask me while the
 * browser's copy said Automatic. The screen then shows its review step.
 */
export const needsConfirm = (e: unknown) => (e as { status?: number }).status === 409 && /then press Send/.test((e as Error).message ?? "");

/* ------------------------------------------------------------------ the request */

export interface SessionRequest {
  mode: Mode;
  date: string;
  slot: Slot;
  /** Shared with the practitioner only once they confirm. */
  phone?: string;
}

/** The client's request, checked against the ways the practitioner meets. Nothing else is accepted. */
export function cleanSessionRequest(raw: unknown, offered: Mode[] | undefined, today: string): { value: SessionRequest } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mode = oneOf(r.mode, MODES);
  if (!mode || (offered?.length && !offered.includes(mode))) return { problem: "Choose how you'd like to meet." };
  if (!isDate(r.date) || r.date < today || r.date > addDays(today, 60)) return { problem: "Choose a day in the next two months." };
  const slot = oneOf(r.slot, SLOTS);
  if (!slot) return { problem: "Choose a time of day." };
  const phone = text(r.phone, 20);
  if (phone && !/^\+?[\d\s-]{8,20}$/.test(phone)) return { problem: "Check the phone number, or leave it out." };
  return { value: { mode, date: r.date, slot, ...(phone ? { phone } : {}) } };
}

export const requestLabel = (r: Pick<SessionRequest, "mode" | "date" | "slot">) => `${MODE_LABEL[r.mode]} · ${dayLabel(r.date)}, ${SLOT_LABEL[r.slot].split(" (")[0].toLowerCase()}`;

/* ------------------------------------------------------------------ the confirmed session */

export interface ConfirmedSession {
  date: string;
  /** HH:MM, India time. */
  time: string;
  minutes: number;
  mode: Mode;
  /** The meeting link or the address, as the practitioner gave it. */
  where?: string;
}

export interface SessionDeal {
  session?: ConfirmedSession;
  reason?: DeclineReason;
  cancelledBy?: "client" | "practitioner";
}

export function readDeal(raw: unknown): SessionDeal {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const s = r.session && typeof r.session === "object" ? (r.session as Record<string, unknown>) : null;
  const session = s && isDate(s.date) && typeof s.time === "string" && TIME.test(s.time) && typeof s.minutes === "number" && oneOf(s.mode, MODES) ? { date: s.date, time: s.time, minutes: s.minutes, mode: s.mode as Mode, ...(typeof s.where === "string" && s.where ? { where: s.where } : {}) } : undefined;
  const reason = oneOf(r.reason, Object.keys(DECLINE_REASONS) as DeclineReason[]);
  const cancelledBy = oneOf(r.cancelledBy, ["client", "practitioner"] as const);
  return { ...(session ? { session } : {}), ...(reason ? { reason } : {}), ...(cancelledBy ? { cancelledBy } : {}) };
}

/** The practitioner's confirmed time, checked. */
export function cleanSession(raw: unknown, req: SessionRequest, today: string): { value: ConfirmedSession } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (!isDate(r.date) || r.date < today || r.date > addDays(today, 90)) return { problem: "Choose a day from today, within three months." };
  if (typeof r.time !== "string" || !TIME.test(r.time)) return { problem: "Choose a start time." };
  const minutes = typeof r.minutes === "number" && Number.isInteger(r.minutes) && r.minutes >= 10 && r.minutes <= 300 ? r.minutes : undefined;
  if (!minutes) return { problem: "Session length is in minutes, from 10 to 300." };
  const where = text(r.where, 300);
  if (req.mode === "online" && where && !/^https:\/\/\S+$/.test(where)) return { problem: "The meeting link should start with https://, or leave it out and send it later." };
  return { value: { date: r.date, time: r.time, minutes, mode: req.mode, ...(where ? { where } : {}) } };
}

/** When a confirmed session starts, as an instant (its time is India time). */
export const startsAt = (s: Pick<ConfirmedSession, "date" | "time">) => Date.parse(`${s.date}T${s.time}:00+05:30`);

export function dayLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "Mon 3 Nov, 6:00 pm IST · 50 min · Online". */
export function sessionLabel(s: ConfirmedSession) {
  const [h, m] = s.time.split(":").map(Number);
  const time = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  return `${dayLabel(s.date)}, ${time} IST · ${s.minutes} min · ${MODE_LABEL[s.mode]}`;
}

/* ------------------------------------------------------------------ who may do what */

export type ClientMove = "cancel";
export type PractitionerMove = "confirm" | "decline" | "held" | "cancel";

/** The client can cancel a request, or a confirmed session before it starts. */
export function clientMay(status: SessionStatus, d: SessionDeal, now = Date.now()): ClientMove[] {
  if (status === "requested") return ["cancel"];
  if (status === "confirmed" && d.session && startsAt(d.session) > now) return ["cancel"];
  return [];
}

/** The practitioner confirms or declines a request; a confirmed session is cancelled before it starts, or marked held after. */
export function practitionerMay(status: SessionStatus, d: SessionDeal, now = Date.now()): PractitionerMove[] {
  if (status === "requested") return ["confirm", "decline"];
  if (status === "confirmed" && d.session) return startsAt(d.session) > now ? ["cancel"] : ["held", "cancel"];
  return [];
}

/* ------------------------------------------------------------------ what each side sees */

export interface MySession {
  id: string;
  listingId: string;
  title: string;
  practitioner: string;
  status: SessionStatus;
  request: SessionRequest;
  deal: SessionDeal;
  createdAt: string;
  updatedAt: string;
}

export interface PractitionerSession {
  id: string;
  listingId: string;
  title: string;
  name: string;
  /** Only once confirmed. */
  email?: string;
  phone?: string;
  status: SessionStatus;
  request: Omit<SessionRequest, "phone">;
  deal: SessionDeal;
  createdAt: string;
  updatedAt: string;
}
