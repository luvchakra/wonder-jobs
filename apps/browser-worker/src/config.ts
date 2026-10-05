/**
 * Cloud browser worker configuration — all from the environment, validated once at startup.
 *
 *   CLOUD_BROWSER_SECRET   shared with the WonderJobs app: authorises its calls here and signs stream tokens (32+ chars)
 *   WONDERJOBS_ORIGIN      the app the helper script talks to, e.g. https://jobs.wonderapps.biz
 *   CLOUD_BROWSER_ALLOWED_ORIGINS  comma-separated browser origins allowed to open a stream (defaults to WONDERJOBS_ORIGIN)
 *   PORT                   default 4100
 *   CLOUD_BROWSER_MAX_SESSIONS / _IDLE_MS / _MAX_MS   capacity and lifetimes
 *   PW_CHROMIUM_PATH       optional Chromium executable (the Playwright image ships its own)
 */
export interface Config {
  port: number;
  secret: string;
  appOrigin: string;
  allowedOrigins: string[];
  maxSessions: number;
  idleMs: number;
  maxMs: number;
  chromiumPath?: string;
  viewport: { width: number; height: number };
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const secret = env.CLOUD_BROWSER_SECRET ?? "";
  const appOrigin = (env.WONDERJOBS_ORIGIN ?? "").trim().replace(/\/$/, "");
  if (secret.length < 32) throw new Error("CLOUD_BROWSER_SECRET must be at least 32 characters.");
  if (!/^https?:\/\/[^/]+$/.test(appOrigin)) throw new Error("WONDERJOBS_ORIGIN must be an origin like https://jobs.wonderapps.biz");
  const allowed = (env.CLOUD_BROWSER_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return {
    port: Number(env.PORT ?? 4100),
    secret,
    appOrigin,
    allowedOrigins: allowed.length ? allowed : [appOrigin],
    maxSessions: Number(env.CLOUD_BROWSER_MAX_SESSIONS ?? 6),
    idleMs: Number(env.CLOUD_BROWSER_IDLE_MS ?? 10 * 60_000),
    maxMs: Number(env.CLOUD_BROWSER_MAX_MS ?? 45 * 60_000),
    chromiumPath: env.PW_CHROMIUM_PATH || undefined,
    // A phone-sized page: what the candidate sees in the app is what the employer's form lays out for.
    viewport: { width: 412, height: 860 },
  };
}
