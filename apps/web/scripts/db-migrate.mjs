#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql in order, idempotently, to DATABASE_URL.
 *   DATABASE_URL="postgresql://..." npm run db:migrate
 * Uses the session pooler / direct URL from Supabase → Project Settings → Database.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required (Supabase → Project Settings → Database → connection string).");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 });
await client.connect();
try {
  await client.query(`create table if not exists public._wonderjobs_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await client.query(`select name from public._wonderjobs_migrations`)).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) {
      console.log(`skip  ${f}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(`insert into public._wonderjobs_migrations (name) values ($1)`, [f]);
      await client.query("commit");
      console.log(`apply ${f}`);
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }
  console.log("done");
} finally {
  await client.end();
}
