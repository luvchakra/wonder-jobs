import { after, NextResponse } from "next/server";
import { siteUrl } from "@/lib/siteUrl";
import { startImport, startModuleImport } from "@/server/gateway/collectJob";
import { collectGatewaySource, registerFromCatalogue, registerPartner, setGatewaySource, testGatewaySource, uploadPartnerList } from "@/server/gateway/admin";
import { updateSource } from "@/server/jobslake/admin";
import { MODULE_IDS } from "@/wonderworks/manifest";
import { continueSetupJob, handOnSetupJob, runSetupItem } from "@/server/gateway/setupJob";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { setDecision } from "@/server/jobslake/decisions";
import { json, readJson } from "@/server/jobslake/http";
import { importView } from "@/server/jobslake/importView";
import { setupTodo } from "@/server/jobslake/setup";
import { loadScheduler, saveScheduler } from "@/server/scheduler/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Admin → Data → Import: every module's sources, what the gateway holds and what Find shows, in one read. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json(await importView());
}

const ID = /^src_[a-f0-9]{24}$/;
const MODULES = ["jobs", "internships", "teaching", "services", "therapists", "cofounders", "events", "marketplace", "scholarships"];

/**
 * The page's actions, each audited. "import": the whole pipeline on the server (server/gateway/collectJob.ts).
 * "item": one row's own step now, in this request (add & activate, or test & activate). "schedule": whether the hourly
 * run also sets up waiting sources. "decide": an owner decision marked done or reopened. "pause" / "activate": a gateway
 * source. "register" / "upload": a partner who gave written permission, and its list. Every gateway action runs through
 * the gateway's own checks; a source goes live only after its test passes.
 */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 2_300_000)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const origin = siteUrl().origin;

  if (action === "import") {
    const r = await startImport(a.actor, origin);
    if (!r.ok) return jlError("INVALID_REQUEST", r.message, 409);
    await audit(a.actor, "import.started", undefined, { queued: r.queued, skipped: r.skipped });
    if (r.queued)
      after(async () => {
        const c = await continueSetupJob();
        if (c.left && c.ran) await handOnSetupJob(origin);
      });
    return json({ ok: true, queued: r.queued, skipped: r.skipped });
  }
  if (action === "item") {
    // Only an item the server itself lists as runnable: the page sends its id, never what to run.
    const id = typeof body?.id === "string" ? body.id.slice(0, 120) : "";
    const item = (await setupTodo()).items.find((i) => i.id === id && i.run);
    if (!item?.run) return jlError("NOT_FOUND", "That source isn't waiting any more.", 404);
    const r = await runSetupItem(item.run);
    await audit(a.actor, "import.item", r.ok ? r.sourceId : undefined, { id, ok: r.ok, ...(r.ok ? { valid: r.valid } : { step: r.step }) });
    return json(r, r.ok ? 200 : 422);
  }
  if (action === "schedule") {
    const current = await loadScheduler();
    const saved = await saveScheduler({ ...current, gateway: { ...current.gateway, activateWaiting: body?.activateWaiting === true } }, a.actor);
    await audit(a.actor, "scheduler.update", undefined, { gateway: saved.gateway });
    return json({ ok: true, activateWaiting: saved.gateway.activateWaiting });
  }
  const mod = typeof body?.module === "string" && (MODULE_IDS as readonly string[]).includes(body.module) ? body.module : null;
  if (action === "module_pause") {
    // Pause or resume one module's import: it's not collected, set up or refreshed while paused; what Find has stays.
    if (!mod) return jlError("INVALID_REQUEST", "Name the module.", 400);
    const current = await loadScheduler();
    const set = new Set(current.gateway.pausedModules);
    if (body?.paused === true) set.add(mod);
    else set.delete(mod);
    const saved = await saveScheduler({ ...current, gateway: { ...current.gateway, pausedModules: [...set] } }, a.actor);
    await audit(a.actor, body?.paused === true ? "import.module_paused" : "import.module_resumed", undefined, { module: mod });
    return json({ ok: true, pausedModules: saved.gateway.pausedModules });
  }
  if (action === "module_import") {
    if (!mod) return jlError("INVALID_REQUEST", "Name the module.", 400);
    const r = await startModuleImport(mod, a.actor, origin);
    if (!r.ok) return jlError("INVALID_REQUEST", r.message, 409);
    await audit(a.actor, "import.module_started", undefined, { module: mod, queued: r.queued });
    after(async () => {
      const c = await continueSetupJob();
      if (c.left && c.ran) await handOnSetupJob(origin);
    });
    return json({ ok: true, queued: r.queued });
  }
  if (action === "dismiss") {
    // A source that keeps failing (a site that refuses us): Import never tries it until restored. Audited.
    const id = typeof body?.id === "string" ? body.id.slice(0, 120) : "";
    if (!/^(gateway:src_[a-f0-9]{24}|catalogue:[a-z0-9-]{1,80}\.json)$/.test(id)) return jlError("INVALID_REQUEST", "Name the source.", 400);
    const current = await loadScheduler();
    const set = new Set(current.gateway.dismissed);
    if (body?.dismissed === false) set.delete(id);
    else set.add(id);
    await saveScheduler({ ...current, gateway: { ...current.gateway, dismissed: [...set] } }, a.actor);
    await audit(a.actor, body?.dismissed === false ? "import.source_restored" : "import.source_dismissed", undefined, { id });
    return json({ ok: true });
  }
  if (action === "source_status") {
    // A WorksLake source paused or resumed by the admin (the same change its own page makes), audited there.
    const id = typeof body?.id === "string" ? body.id.slice(0, 120) : "";
    const status = body?.status === "paused" ? "paused" : body?.status === "active" ? "active" : null;
    if (!id || !status) return jlError("INVALID_REQUEST", "Name the source and the status.", 400);
    const r = await updateSource(id, { status }, a.actor);
    if (!r.ok) return jlError(r.error.code, r.error.message, r.status);
    return json({ ok: true, status: r.value.status });
  }
  if (action === "decide") {
    const id = typeof body?.decision === "string" ? body.decision.slice(0, 80) : "";
    const done = body?.done !== false;
    const note = typeof body?.note === "string" ? body.note : undefined;
    if (!id || !(await setDecision(id, done, a.actor, note))) return jlError("NOT_FOUND", "No such decision.", 404);
    await audit(a.actor, done ? "setup_decision.done" : "setup_decision.reopened", undefined, { id });
    return json({ ok: true });
  }
  if (action === "register") {
    const p = { name: String(body?.name ?? "").trim().slice(0, 120), website: String(body?.website ?? "").trim().slice(0, 300), module: String(body?.module ?? ""), permissionEvidence: String(body?.permissionEvidence ?? "").trim().slice(0, 500), consentVerified: body?.consentVerified === true };
    if (!p.name || !p.website || !MODULES.includes(p.module) || p.permissionEvidence.length < 8) return jlError("INVALID_REQUEST", "Give the partner's name, website (https://…), module and what permission they gave.", 400);
    const r = await registerPartner(p);
    await audit(a.actor, "gateway.partner_registered", undefined, { name: p.name, module: p.module, ok: r.status === 201 });
    return json(r.body, r.status);
  }
  if (action === "add_catalogue") {
    const file = typeof body?.file === "string" ? body.file.slice(0, 80) : "";
    const r = await registerFromCatalogue(file);
    await audit(a.actor, "gateway.catalogue_added", undefined, { file, ok: r.status === 201 });
    return json(r.body, r.status);
  }
  const sourceId = typeof body?.sourceId === "string" && ID.test(body.sourceId) ? body.sourceId : null;
  if (!sourceId) return jlError("INVALID_REQUEST", "Name the gateway source.", 400);
  if (action === "upload") {
    const format = body?.format === "json" ? "json" : body?.format === "csv" ? "csv" : null;
    if (!format || typeof body?.content !== "string") return jlError("INVALID_REQUEST", "Upload a CSV or JSON file.", 400);
    const r = await uploadPartnerList(sourceId, format, body.content);
    await audit(a.actor, "gateway.partner_uploaded", sourceId, { ok: r.body.ok === true, rows: r.body.rows, valid: r.body.valid });
    return json(r.body, r.status);
  }
  if (action === "collect") {
    const r = await collectGatewaySource(sourceId);
    await audit(a.actor, "gateway.collect", sourceId, { ok: r.ok, ...(r.ok ? { valid: r.valid } : { code: r.code }) });
    return json(r, r.ok ? 200 : 422);
  }
  if (action === "test") {
    const r = await testGatewaySource(sourceId);
    await audit(a.actor, "gateway.test", sourceId, { ok: r.status === 200 });
    return json(r.body, r.status);
  }
  if (action === "activate" || action === "pause") {
    const r = await setGatewaySource(sourceId, action);
    await audit(a.actor, `gateway.${action}`, sourceId, { ok: r.status === 200 });
    return json(r.body, r.status);
  }
  return jlError("INVALID_REQUEST", "Unknown action.", 400);
}
