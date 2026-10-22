import { NextResponse } from "next/server";
import { DEFAULT_NOTIFY_ADMIN, NOTIFY_ADMIN_LIMITS } from "@/domain/notifications/admin";
import { NOTIFY_TOPICS } from "@/domain/notifications/prefs";
import { requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { badJson, json, readJson } from "@/server/jobslake/http";
import { loadNotifyAdmin, saveNotifyAdmin } from "@/server/notifications/admin";
import { stateStore } from "@/server/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The platform's notification settings, with their defaults and limits, and how many people chose each topic. Admins only. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const [settings, choices] = await Promise.all([loadNotifyAdmin({ fresh: true }), stateStore.listTenants("wj.notifyprefs", 1000).catch(() => [] as string[])]);
  return json({ settings, defaults: DEFAULT_NOTIFY_ADMIN, limits: NOTIFY_ADMIN_LIMITS, topics: NOTIFY_TOPICS, peopleWithChoices: choices.length });
}

/** Save them (cleaned: known fields only, numbers kept in range). */
export async function PUT(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = await readJson(req);
  if (!body) return badJson();
  const settings = await saveNotifyAdmin(body, a.actor);
  await audit(a.actor, "notifications.update", undefined, { channels: settings.channels, topics: settings.topics, messageEmailEveryMin: settings.messageEmailEveryMin, interviewLeadHours: settings.interviewLeadHours, followUpLeadHours: settings.followUpLeadHours });
  return json({ settings });
}
