/**
 * The cloud browser (apps/browser-worker): "Wonder fills, you press submit" without the Chrome
 * extension. The worker opens the employer's page in an isolated browser, streams it to the candidate,
 * and runs the same helper script the extension runs — talking back to this app's helper routes with
 * the session's own token, so every fill goes through the same gate (`fillGate` / automation policy).
 *
 * This module is the only place the app talks to the worker. The shared secret never reaches the
 * browser; the candidate gets a short-lived stream token for one session, minted by the worker.
 */
import { closeCloud, openCloud } from "@/domain/jobs-apply/session";
import { act, type ApiResult } from "./service";
import { getSession, mutateSession } from "./store";

const ok = (body: unknown, status = 200): ApiResult => ({ status, body });
const err = (status: number, code: string, message: string): ApiResult => ({ status, body: { error: { code, message } } });
const nowIso = () => new Date().toISOString();

export interface CloudStream {
  cloudId: string;
  /** ws(s):// address the candidate's browser connects to, with `?token=`. */
  streamUrl: string;
  streamToken: string;
  viewport: { width: number; height: number };
  reused: boolean;
}

function config(): { url: string; secret: string } | null {
  const url = (process.env.CLOUD_BROWSER_URL ?? "").trim().replace(/\/$/, "");
  const secret = process.env.CLOUD_BROWSER_SECRET ?? "";
  return /^https?:\/\//.test(url) && secret.length >= 32 ? { url, secret } : null;
}

/** False means "Needs setup": the page offers Guide me instead and says why. */
export const cloudConfigured = () => !!config();

async function worker(path: string, method: "POST" | "DELETE", body: unknown): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const c = config();
  if (!c) return { status: 0, data: null };
  try {
    const res = await fetch(`${c.url}${path}`, { method, headers: { "x-wonder-secret": c.secret, "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(25_000) });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

const UNAVAILABLE = "The cloud browser isn't answering right now. Try again in a moment, or choose Guide me.";

/** Opens (or returns) the cloud browser for a started session. Tenant-checked through the session's own token mint. */
export async function startCloud(tenantId: string, id: string): Promise<ApiResult> {
  const c = config();
  if (!c) return err(503, "NOT_CONFIGURED", "The cloud browser isn't set up on this deployment — choose Guide me.");
  // Same rules as pairing the extension: started, not stopped, not ended; the token is this session's and nobody else's.
  const minted = await act(tenantId, id, "token", {});
  if (minted.status !== 200) return minted;
  const { token, destination } = minted.body as { token: string; destination: { url: string; domain: string; relatedDomains: string[] } };
  const s = await getSession(tenantId, id);
  if (!s) return err(404, "NOT_FOUND", "Application session not found.");
  if (s.mode === "guided") return err(409, "NOT_ALLOWED", "Guide me doesn't use the cloud browser.");
  const r = await worker("/sessions", "POST", { sessionId: id, tenantId, url: destination.url, helperToken: token, domains: [destination.domain, ...destination.relatedDomains, ...s.approvedDomains].filter(Boolean) });
  if (r.status === 429) return err(429, "BUSY", String(r.data?.message ?? "The cloud browser is at capacity right now. Try again in a few minutes, or choose Guide me."));
  if ((r.status !== 200 && r.status !== 201) || !r.data) return err(503, "UNAVAILABLE", UNAVAILABLE);
  const d = r.data as { cloudId: string; streamToken: string; viewport: { width: number; height: number }; streamPath: string; reused?: boolean };
  if (s.cloud?.id !== d.cloudId || s.cloud?.endedAt) await mutateSession(tenantId, id, (x) => openCloud(x, nowIso(), d.cloudId));
  const stream: CloudStream = { cloudId: d.cloudId, streamUrl: `${c.url.replace(/^http/, "ws")}${d.streamPath}`, streamToken: d.streamToken, viewport: d.viewport, reused: !!d.reused };
  return ok(stream);
}

/** The candidate chose Fill in the app: the helper in the cloud page asks this app for its plan (policy applied there) and fills it. */
export async function fillCloud(tenantId: string, id: string): Promise<ApiResult> {
  if (!config()) return err(503, "NOT_CONFIGURED", "The cloud browser isn't set up on this deployment.");
  const s = await getSession(tenantId, id);
  if (!s) return err(404, "NOT_FOUND", "Application session not found.");
  if (!s.cloud || s.cloud.endedAt) return err(409, "NO_CLOUD", "Open the cloud browser first.");
  const r = await worker(`/sessions/${s.cloud.id}/fill`, "POST", { tenantId });
  if (r.status === 404) {
    await mutateSession(tenantId, id, (x) => closeCloud(x, nowIso(), "worker_lost"));
    return err(409, "NO_CLOUD", "That cloud browser has closed. Open it again.");
  }
  if (r.status !== 200) return err(503, "UNAVAILABLE", UNAVAILABLE);
  return ok({ ok: true });
}

/** Ends the cloud browser (its cookies, storage and page go with it). Safe to call when there is none. */
export async function endCloud(tenantId: string, id: string, reason: string): Promise<ApiResult> {
  const s = await getSession(tenantId, id);
  if (!s) return err(404, "NOT_FOUND", "Application session not found.");
  if (!s.cloud || s.cloud.endedAt) return ok({ ok: true, ended: false });
  if (config()) await worker(`/sessions/${s.cloud.id}`, "DELETE", { tenantId });
  await mutateSession(tenantId, id, (x) => closeCloud(x, nowIso(), reason));
  return ok({ ok: true, ended: true });
}
