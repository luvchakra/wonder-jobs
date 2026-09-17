/**
 * Runs the bundled migrations against a Postgres URL. Supabase's direct host
 * is IPv6-only, which most serverless egress can't reach, so when given a
 * direct URL we also try the IPv4 Supavisor pooler across regions (session
 * mode, port 5432) and use the first that authenticates.
 */
import pg from "pg";
import { MIGRATIONS } from "./migrations";

const POOLER_REGIONS = ["ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2", "us-east-1", "us-east-2", "us-west-1", "us-west-2", "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-central-2", "eu-north-1", "sa-east-1", "ca-central-1"];

export interface MigrateResult {
  host: string;
  applied: string[];
  skipped: string[];
}

function candidates(databaseUrl: string): { label: string; config: pg.ClientConfig }[] {
  const u = new URL(databaseUrl);
  const password = decodeURIComponent(u.password);
  const database = u.pathname.replace(/^\//, "") || "postgres";
  const direct = { label: u.hostname, config: { host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password, database, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 6_000 } };
  const m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (!m) return [direct];
  const ref = m[1];
  const poolers = POOLER_REGIONS.map((r) => ({ label: `aws-0-${r}.pooler.supabase.com`, config: { host: `aws-0-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}`, password, database, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 6_000 } }));
  return [...poolers, direct];
}

async function connectAny(databaseUrl: string): Promise<{ client: pg.Client; host: string }> {
  const errors: string[] = [];
  for (const c of candidates(databaseUrl)) {
    const client = new pg.Client(c.config);
    try {
      await client.connect();
      return { client, host: c.label };
    } catch (e) {
      errors.push(`${c.label}: ${e instanceof Error ? e.message : String(e)}`);
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  throw new Error(`Could not connect to Postgres.\n${errors.join("\n")}`);
}

export async function runMigrations(databaseUrl: string): Promise<MigrateResult> {
  const { client, host } = await connectAny(databaseUrl);
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    await client.query(`create table if not exists public._wonderjobs_migrations (name text primary key, applied_at timestamptz not null default now())`);
    const done = new Set<string>((await client.query(`select name from public._wonderjobs_migrations`)).rows.map((r: { name: string }) => r.name));
    for (const m of MIGRATIONS) {
      if (done.has(m.name)) {
        skipped.push(m.name);
        continue;
      }
      await client.query("begin");
      try {
        await client.query(m.sql);
        await client.query(`insert into public._wonderjobs_migrations (name) values ($1)`, [m.name]);
        await client.query("commit");
        applied.push(m.name);
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
    }
  } finally {
    await client.end();
  }
  return { host, applied, skipped };
}
