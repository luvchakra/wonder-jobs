/**
 * WonderJobs cloud browser worker.
 *
 *   POST   /sessions                 open a session for an Apply with Wonder session   (app → worker, shared secret)
 *   POST   /sessions/:id/fill        the candidate chose Fill in the app                (app → worker)
 *   POST   /sessions/:id/continue    continue after a stop: the helper re-reads the page (app → worker)
 *   DELETE /sessions/:id             end it — the browser context and everything in it go  (app → worker)
 *   GET    /health
 *   WS     /stream?token=…           frames out, the candidate's taps and typing in     (candidate's browser → worker)
 *
 * Only the WonderJobs app may open, fill or end a session (`x-wonder-secret`). Only the holder of a
 * stream token the worker minted for that session may watch and drive it, from an allowed origin.
 */
import http from "node:http";
import { chromium } from "playwright";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { serviceAuthorized, signStreamToken, verifyStreamToken } from "./auth.js";
import { readConfig } from "./config.js";
import { CloudSession } from "./session.js";

const config = readConfig();
const STREAM_TTL_MS = 60 * 60_000;

const StartSchema = z.object({
  sessionId: z.string().min(1).max(120),
  tenantId: z.string().min(1).max(200),
  url: z
    .string()
    .url()
    .max(2048)
    .refine((u) => /^https?:\/\//i.test(u), "http(s) only"),
  helperToken: z.string().min(10).max(4096),
  domains: z.array(z.string().max(253)).max(50).default([]),
});
const TenantSchema = z.object({ tenantId: z.string().min(1).max(200) });

const sessions = new Map<string, CloudSession>();
const browser = await chromium.launch({ headless: true, executablePath: config.chromiumPath });

const log = (msg: string, extra: Record<string, unknown> = {}) => console.info(`[cloud-browser] ${msg}`, JSON.stringify(extra));

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage, max = 64_000): Promise<unknown> {
  return new Promise((resolve) => {
    let text = "";
    req.on("data", (c: Buffer) => {
      text += c.toString();
      if (text.length > max) {
        resolve(null);
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function streamFor(s: CloudSession) {
  return { cloudId: s.id, streamToken: signStreamToken({ cloudId: s.id, tenantId: s.init.tenantId, exp: Date.now() + STREAM_TTL_MS }, config.secret), viewport: config.viewport, streamPath: "/stream" };
}

function sessionOf(id: string, tenantId: string): CloudSession | undefined {
  const s = sessions.get(id);
  return s && !s.ended && s.init.tenantId === tenantId ? s : undefined;
}

async function endSession(s: CloudSession, reason: string) {
  sessions.delete(s.id);
  await s.end(reason);
  log("ended", { cloudId: s.id, sessionId: s.init.sessionId, reason });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://worker");
  if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, sessions: sessions.size, max: config.maxSessions });
  if (!serviceAuthorized(req.headers["x-wonder-secret"], config.secret)) return json(res, 401, { error: "unauthorized" });

  if (req.method === "POST" && url.pathname === "/sessions") {
    const parsed = StartSchema.safeParse(await readBody(req));
    if (!parsed.success) return json(res, 400, { error: "invalid", detail: parsed.error.issues.map((i) => i.message) });
    const init = parsed.data;
    // One browser per Apply with Wonder session: opening again (a reload) returns the same one with a fresh stream token.
    const existing = [...sessions.values()].find((s) => !s.ended && s.init.sessionId === init.sessionId && s.init.tenantId === init.tenantId);
    if (existing) {
      existing.updateToken(init.helperToken);
      void existing.deliver({ type: "jobsApplyPaired", sessionId: init.sessionId });
      return json(res, 200, { ...streamFor(existing), reused: true });
    }
    if (sessions.size >= config.maxSessions) return json(res, 429, { error: "busy", message: "The cloud browser is at capacity right now. Try again in a few minutes, or use Guide me." });
    try {
      const s = await CloudSession.open(browser, init, config);
      sessions.set(s.id, s);
      log("opened", { cloudId: s.id, sessionId: init.sessionId, host: new URL(init.url).hostname });
      return json(res, 201, { ...streamFor(s), reused: false });
    } catch (e) {
      return json(res, 503, { error: "unavailable", message: e instanceof Error ? e.message : "Couldn't open a browser." });
    }
  }

  const m = url.pathname.match(/^\/sessions\/([0-9a-f-]{36})(?:\/(fill|continue))?$/);
  if (!m) return json(res, 404, { error: "not_found" });
  const body = TenantSchema.safeParse(await readBody(req));
  if (!body.success) return json(res, 400, { error: "invalid" });
  const s = sessionOf(m[1], body.data.tenantId);
  if (!s) return json(res, 404, { error: "not_found" });

  if (req.method === "DELETE" && !m[2]) {
    await endSession(s, "ended_by_app");
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && m[2] === "fill") {
    // The app already applied the candidate's fill policy; the helper asks it again for the plan before it touches a field.
    await s.deliver({ type: "fillNow" });
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && m[2] === "continue") {
    await s.deliver({ type: "jobsApplyPaired", sessionId: s.init.sessionId });
    return json(res, 200, { ok: true });
  }
  return json(res, 405, { error: "method_not_allowed" });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 16_000 });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://worker");
  const origin = (req.headers.origin ?? "").replace(/\/$/, "");
  const claims = verifyStreamToken(url.searchParams.get("token"), config.secret);
  const s = claims ? sessionOf(claims.cloudId, claims.tenantId) : undefined;
  if (url.pathname !== "/stream" || !config.allowedOrigins.includes(origin) || !s) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => void s.attach(ws));
});

// Idle and overlong sessions are closed on their own: no browser stays open for a candidate who left.
setInterval(() => {
  const now = Date.now();
  for (const s of sessions.values()) {
    const idle = s.clientCount === 0 && now - s.lastActivity > config.idleMs;
    if (idle || now - s.createdAt > config.maxMs) void endSession(s, idle ? "idle" : "max_duration");
  }
}, 30_000).unref();

async function shutdown() {
  log("shutting down", { sessions: sessions.size });
  await Promise.all([...sessions.values()].map((s) => endSession(s, "shutdown")));
  await browser.close().catch(() => undefined);
  server.close(() => process.exit(0));
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

server.listen(config.port, () => log("listening", { port: config.port, app: config.appOrigin, origins: config.allowedOrigins }));
