import { NextResponse } from "next/server";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json, readJson } from "@/server/jobslake/http";
import { importPlatformKeysFromEnv, platformKeyStatus, removePlatformKeyAt, setPlatformKey, withPlatformKeys, loadPlatformKeys } from "@/server/jobslake/platformKeys";
import { sendMail, smtpConfig } from "@/server/notify";
import { generateVapidKeys } from "@/server/push/subscriptions";
import { renderEmailLayout } from "@/server/email/layout";
import { siteUrl } from "@/lib/siteUrl";
import { TESTABLE, testPlatformKey } from "@/server/jobslake/keyTest";

export const runtime = "nodejs";

/** The sources' API keys the admin sets on the platform: which are set and where from, masked — never a value. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json({ keys: (await platformKeyStatus()).map((k) => ({ ...k, testable: TESTABLE.has(k.name) })) });
}

/** Set, replace or remove one key. Audited by name only; the value is encrypted and never logged or returned. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 10_000)) as { name?: unknown; value?: unknown; test?: unknown; removeAt?: unknown; importEnv?: unknown; action?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.slice(0, 64) : "";
  // Email: one test message to the admin who pressed it, through the mailbox set here (or in the deployment).
  if (body?.action === "test_email") {
    await loadPlatformKeys(Date.now(), true);
    if (!smtpConfig(withPlatformKeys())) return jlError("INVALID_REQUEST", "Set the mail server, mailbox and password first.", 400);
    if (!a.actor.includes("@")) return jlError("INVALID_REQUEST", "Your admin account has no email address to send to.", 400);
    const mail = renderEmailLayout({ origin: siteUrl().origin, preheader: "WonderWorks email works", bodyHtml: "<p>This is a test from Admin → Keys → Email. If you're reading it, WonderWorks can send email.</p>", bodyText: "This is a test from Admin → Keys → Email. If you're reading it, WonderWorks can send email.", reason: "You're getting this because you pressed Send a test email.", settingsLink: false });
    const r = await sendMail({ to: a.actor, subject: "WonderWorks: test email", ...mail });
    await audit(a.actor, "platform_email.tested", undefined, { ok: r.sent });
    return r.sent ? json({ ok: true, message: `Sent to ${a.actor}. Check the inbox (and spam).` }) : jlError("INVALID_REQUEST", "The mail server refused it. Check the host, port, mailbox and password.", 502);
  }
  // Push: a new key pair, only when none is set (replacing a pair makes every device turn notifications on again).
  if (body?.action === "generate_vapid") {
    await loadPlatformKeys(Date.now(), true);
    const env = withPlatformKeys();
    if (env.VAPID_PUBLIC_KEY?.trim() || env.VAPID_PRIVATE_KEY?.trim()) return jlError("INVALID_REQUEST", "A push key pair is already set. Remove both keys first to make a new one (every device will then need to turn notifications on again).", 409);
    const pair = generateVapidKeys();
    const pub = await setPlatformKey("VAPID_PUBLIC_KEY", pair.publicKey);
    const priv = pub.ok ? await setPlatformKey("VAPID_PRIVATE_KEY", pair.privateKey) : pub;
    await audit(a.actor, "platform_key.generated", undefined, { name: "VAPID", ok: pub.ok && priv.ok });
    return pub.ok && priv.ok ? json({ ok: true, message: "Push key pair generated and saved." }) : jlError("INVALID_REQUEST", "Couldn't save the key pair.", 500);
  }
  // Test: one small request to the provider with the saved key (keyTest.ts); audited by name and outcome only.
  if (body?.test === true && name) {
    const r = await testPlatformKey(name);
    await audit(a.actor, "platform_key.tested", undefined, { name, ok: r.ok });
    return json(r);
  }
  // A multi-key entry's deployment keys, copied into the admin's list (values never leave the server).
  if (body?.importEnv === true && name) {
    const r = await importPlatformKeysFromEnv(name);
    await audit(a.actor, "platform_key.imported", undefined, { name, ok: r.ok });
    return json(r.ok ? r : { ...r, error: { code: "INVALID_REQUEST", message: r.message } }, r.ok ? 200 : 400);
  }
  // One key of a multi-key entry (TheirStack's), by its place in the list.
  if (typeof body?.removeAt === "number" && name) {
    const r = await removePlatformKeyAt(name, body.removeAt);
    await audit(a.actor, "platform_key.removed", undefined, { name, ok: r.ok, one: true });
    return json(r.ok ? r : { ...r, error: { code: "INVALID_REQUEST", message: r.message } }, r.ok ? 200 : 400);
  }
  const value = body?.value === null ? null : typeof body?.value === "string" ? body.value : undefined;
  if (!name || value === undefined) return jlError("INVALID_REQUEST", "Name the key and give its value (or null to remove it).", 400);
  const r = await setPlatformKey(name, value);
  await audit(a.actor, value === null ? "platform_key.removed" : "platform_key.set", undefined, { name, ok: r.ok });
  return json(r.ok ? r : { ...r, error: { code: "INVALID_REQUEST", message: r.message } }, r.ok ? 200 : 400);
}
