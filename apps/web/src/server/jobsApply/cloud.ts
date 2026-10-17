/**
 * The cloud browser (apps/browser-worker): "Wonder fills, you press submit" without the Chrome
 * extension. The worker opens the employer's page in an isolated browser, streams it to the candidate,
 * and runs the same helper script the extension runs — talking back to this app's helper routes with
 * the session's own token, so every fill goes through the same gate (`fillGate` / automation policy).
 *
 * This module is the only place the app talks to the worker. The shared secret never reaches the
 * browser; the candidate gets a short-lived stream token for one session, minted by the worker.
 */
import { closeCloud, openCloud, recordPortalSignIn } from "@/domain/jobs-apply/session";
import { portalSignInDecision } from "@/domain/jobs-apply/policy";
import { credentialFor, generatePassword, recordConnectionResult, saveConnection, ConnectionError } from "@/server/connections";
import { act, automationOf, type ApiResult } from "./service";
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

/**
 * Opens (or returns) the cloud browser for a started session. Tenant-checked through the session's own token mint.
 * `headless`: a background fill (WJ-311) — the page is never streamed to anyone, and only the candidate's
 * "Submit this application" in WonderJobs can submit it. Opening it to watch (the Apply page) clears that.
 */
export async function startCloud(tenantId: string, id: string, opts: { headless?: boolean } = {}): Promise<ApiResult> {
  const headless = opts.headless === true;
  const c = config();
  if (!c) return err(503, "NOT_CONFIGURED", "The cloud browser isn't set up on this deployment — choose Guide me.");
  // Same rules as pairing the extension: started, not stopped, not ended; the token is this session's and nobody else's.
  const minted = await act(tenantId, id, "token", {});
  if (minted.status !== 200) return minted;
  const { token, destination } = minted.body as { token: string; destination: { url: string; domain: string; relatedDomains: string[] } };
  const s = await getSession(tenantId, id);
  if (!s) return err(404, "NOT_FOUND", "Application session not found.");
  if (s.mode === "guided") return err(409, "NOT_ALLOWED", "Guide me doesn't use the cloud browser.");
  // A background fill only where the link is an applicant-tracking system's own job page: a job board's or careers
  // site's listing holds the board's own forms (search, job alerts), never the application (WJ-314).
  // A job board's listing is allowed only to follow its own Apply link to the employer first (WJ-315).
  const listing = s.destination.type === "aggregator" && !s.listingFollowed;
  if (headless && s.destination.type !== "ats" && !listing && !s.listingFollowed) return err(409, "NOT_FILLABLE", "Wonder can fill this one in the background only on the employer's application system. Open the employer's page and use Guide me.");
  const r = await worker("/sessions", "POST", { sessionId: id, tenantId, url: destination.url, helperToken: token, domains: [destination.domain, ...destination.relatedDomains, ...s.approvedDomains].filter(Boolean), ...(headless && listing ? { followListing: true } : {}) });
  if (r.status === 429) return err(429, "BUSY", String(r.data?.message ?? "The cloud browser is at capacity right now. Try again in a few minutes, or choose Guide me."));
  if ((r.status !== 200 && r.status !== 201) || !r.data) return err(503, "UNAVAILABLE", UNAVAILABLE);
  const d = r.data as { cloudId: string; streamToken: string; viewport: { width: number; height: number }; streamPath: string; reused?: boolean };
  if (s.cloud?.id !== d.cloudId || s.cloud?.endedAt || !!s.cloud?.headless !== headless) await mutateSession(tenantId, id, (x) => openCloud(x, nowIso(), d.cloudId, headless));
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

export type SignInRequest = { mode: "sign_in" } | { mode: "create" } | { mode: "save"; email: string; password: string };

/**
 * Sign in to the employer's portal in a background fill, or create the account (WJ-316). Runs only on the
 * candidate's press for this application (`portal_sign_in`, "Off" always wins). "create" makes one account per
 * portal — never a second while a connection exists — with the candidate's own email and a generated password,
 * saved encrypted before the cloud browser uses it. "save" is the candidate's existing sign-in. The password goes
 * to the cloud browser for this one sign-in and nowhere else.
 */
export async function signInCloud(tenantId: string, id: string, req: SignInRequest): Promise<ApiResult> {
  const c = config();
  if (!c) return err(503, "NOT_CONFIGURED", "The cloud browser isn't set up on this deployment.");
  const s = await getSession(tenantId, id);
  if (!s) return err(404, "NOT_FOUND", "Application session not found.");
  if (!s.cloud || s.cloud.endedAt || !s.cloud.headless) return err(409, "NO_CLOUD", "Start Apply for this job first.");
  const a = await automationOf(tenantId);
  if (portalSignInDecision(a.policy, a.level) === "skip") return err(403, "NOT_ALLOWED", "Signing in to job portals is turned off in Automation.");
  const host = s.destination.domain;

  let email: string;
  let password: string;
  let connectionId: string;
  try {
    if (req.mode === "save") {
      const saved = await saveConnection(tenantId, { host, provider: s.destination.provider, email: req.email, password: req.password, createdBy: "candidate" });
      ({ email, password } = { email: req.email.trim(), password: req.password });
      connectionId = saved.id;
    } else if (req.mode === "sign_in") {
      const cred = await credentialFor(tenantId, host);
      if (!cred) return err(409, "NO_CONNECTION", `There's no saved sign-in for ${host}.`);
      ({ email, password } = cred);
      connectionId = cred.connection.id;
    } else {
      // One account per portal: an existing connection signs in instead of creating a second.
      if (await credentialFor(tenantId, host)) return err(409, "CONNECTION_EXISTS", `You already have a saved sign-in for ${host} — sign in with it.`);
      const own = s.pack.profile.email?.value?.trim();
      if (!own) return err(409, "NO_EMAIL", "Add your email to your Career Profile first.");
      email = own;
      password = generatePassword();
      const saved = await saveConnection(tenantId, { host, provider: s.destination.provider, email, password, createdBy: "wonder" });
      connectionId = saved.id;
    }
  } catch (e) {
    if (e instanceof ConnectionError) return err(400, "INVALID", e.message);
    throw e;
  }

  const mode = req.mode === "create" ? "create" : "sign_in";
  const r = await worker(`/sessions/${s.cloud.id}/sign-in`, "POST", { tenantId, mode, email, password });
  if (r.status === 404) {
    await mutateSession(tenantId, id, (x) => closeCloud(x, nowIso(), "worker_lost"));
    return err(409, "NO_CLOUD", "That cloud browser has closed. Start again.");
  }
  if (r.status !== 200 || !r.data) return err(503, "UNAVAILABLE", UNAVAILABLE);
  const result = String(r.data.result ?? "failed") as "signed_in" | "needs_verification" | "failed" | "no_form";
  const message = typeof r.data.message === "string" ? r.data.message : undefined;
  await recordConnectionResult(tenantId, connectionId, result === "signed_in" ? "active" : result === "needs_verification" ? "needs_verification" : "failed", result === "signed_in" ? (mode === "create" ? "Account created" : "Signed in") : (message ?? "Didn't sign in"));
  await mutateSession(tenantId, id, (x) => recordPortalSignIn(x, mode, host, email, result, message, nowIso()));
  return ok({ result, ...(message ? { message } : {}), host, email });
}
