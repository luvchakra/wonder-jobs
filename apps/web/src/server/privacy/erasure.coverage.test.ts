import { beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Account deletion reaches every table that holds a person's id (CLAUDE.md: "Account deletion and export must reach
 * every table that holds a person's data").
 *
 * Two checks, one about the schema and one about behaviour:
 *   1. Every column in the migrations that holds an account id is accounted for: the database removes it with the
 *      tenant row (a foreign key to `tenants` that cascades), an `ACCOUNT_DATA` entry erases or hands it on, or a
 *      stated retention rule keeps it. A new table or column fails here until someone says which.
 *   2. A person who used every part of the product that keeps their id outside the tenant row deletes their account
 *      through `eraseAccount`; afterwards no row in any table the in-memory store holds still names them, apart from
 *      the gaps listed in KNOWN_GAPS below, each of which must go.
 */
vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined, forgetTenant: () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })), listSubscriptions: async () => [] }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import { DEFAULT_TIERS } from "@/domain/network/network";
import { RETENTION } from "@/content/privacy";
import { hashKey } from "@/lib/ids";
import { MemoryResumeFileStore, setResumeFileStoreForTests } from "@/server/resume/files";
import { ACCOUNT_DATA } from "./accountData";
import { eraseAccount } from "./subjectRights";
import * as H from "@/server/hiring";
import * as C from "@/server/careers";
import * as N from "@/server/network/network";
import * as S from "@/server/network/social";
import * as E from "@/server/network/engage";
import { uploadMedia } from "@/server/network/media";
import { reportListing } from "@/server/moderation";
import { saveProfile } from "@/server/cofounders/profiles";
import { createTeam } from "@/server/cofounders/teams";
import { connect, respond, sendMessage as cofounderMessage } from "@/server/cofounders/connections";
import { addPhoto } from "@/server/marketplace/photos";
import { publish, saveListing } from "@/server/marketplace/listings";
import { sendMessage as marketMessage, startThread } from "@/server/marketplace/threads";
import { reportListing as reportMarketListing } from "@/server/marketplace/safety";

/* ---- 1. the schema ------------------------------------------------------------------------------------------------ */

const MIGRATIONS = join(__dirname, "../../../supabase/migrations");

/** A column that holds an account id: `tenant_id`, `*_tenant`, `*_by`, `owner_id`, or a connection's two people. */
const PERSON_COLUMN = /^(tenant_id|owner_id|requester|recipient|[a-z]+_tenant|[a-z]+_by)$/;

/** Every person column in the schema, with whether a foreign key to `tenants` removes its row with the account. */
function personColumns(): { table: string; column: string; cascades: boolean }[] {
  const out = new Map<string, { table: string; column: string; cascades: boolean }>();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const m of sql.matchAll(/create table if not exists\s+wonderjobs\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)) {
      for (const line of m[2].split("\n")) {
        const col = line.trim().split(/\s+/)[0];
        if (col && PERSON_COLUMN.test(col)) out.set(`${m[1]}.${col}`, { table: m[1], column: col, cascades: /references\s+wonderjobs\.tenants\s*\(id\)\s+on delete cascade/i.test(line) });
      }
    }
    for (const m of sql.matchAll(/alter table\s+(?:if exists\s+)?wonderjobs\.([a-z_]+)\s+add column(?: if not exists)?\s+([a-z_]+)([^;]*)/gi)) {
      if (PERSON_COLUMN.test(m[2])) out.set(`${m[1]}.${m[2]}`, { table: m[1], column: m[2], cascades: /references\s+wonderjobs\.tenants\s*\(id\)\s+on delete cascade/i.test(m[3]) });
    }
  }
  return [...out.values()];
}

/** Which `ACCOUNT_DATA` entry erases (or hands on) a table's rows when its account is deleted. */
const ERASED_BY: Record<string, string> = {
  network_profiles: "network",
  network_connections: "network",
  network_messages: "network",
  network_updates: "network",
  network_reactions: "network",
  network_comments: "network",
  network_media: "network",
  marketplace_listings: "marketplace",
  marketplace_photos: "marketplace",
  marketplace_threads: "marketplace",
  marketplace_messages: "marketplace",
  // Shared by modules; each module's entry removes its own rows (see KNOWN_GAPS for the rest).
  module_blocks: "network",
  module_reports: "network",
  cofounder_profiles: "cofounders",
  cofounder_teams: "cofounders",
  cofounder_team_members: "cofounders",
  cofounder_connections: "cofounders",
  cofounder_messages: "cofounders",
  cofounder_blocks: "cofounders",
  cofounder_reports: "cofounders",
  // Company records stay with the company; the person's name on them passes to the workspace's next owner.
  hiring_orgs: "hiring",
  hiring_members: "hiring",
  hiring_invites: "hiring",
  hiring_shortlist: "hiring",
  hiring_conversations: "hiring",
  hiring_messages: "hiring",
  employer_jobs: "hiring",
  career_sites: "hiring",
  career_site_jobs: "hiring",
  job_application_reviews: "hiring",
  listings: "hiring",
};

/** Kept after deletion on purpose, each with its stated reason. */
const KEPT: Record<string, string> = {
  "billing_ledger.tenant_id": "Billing ledger", // RETENTION: at least 8 years, by law
  "contact_messages.tenant_id": "eraseAccount deletes these itself",
  "jobslake_companies.banned_by": "an admin's decision about a company, not the admin's personal data",
  // Retired (WJ-347) and unused; each row also has `tenant_id`, which cascades from the tenant row.
  "portal_connections.created_by": "retired: removed with its tenant_id row",
};

/**
 * Account ids that deletion does not reach yet (found 2026-11-21, reported to the shared-layer session). Each line
 * goes when its table gets an `ACCOUNT_DATA` entry or a stated retention rule; the test fails until it is removed here.
 */
const KNOWN_GAPS = [
  "job_applications.applicant_tenant", // Easy Apply applications the person sent to companies
  "responses.responder_tenant", // module responses: an internship application, a teaching demo request, a quote request…
  "bookings.responder_tenant", // teaching demo bookings
  "bookings.created_by", // the school member who offered the demo (a company record; not in hiringAccount.ts's AUTHORED)
];

describe("account deletion and the schema", () => {
  const cols = personColumns();

  it("finds the person columns it should (the parser still reads the migrations)", () => {
    const names = cols.map((c) => `${c.table}.${c.column}`);
    for (const known of ["app_state.tenant_id", "network_connections.requester", "network_comments.tenant_id", "hiring_orgs.created_by", "job_applications.applicant_tenant"]) expect(names).toContain(known);
    expect(cols.find((c) => c.table === "app_state")!.cascades).toBe(true);
    expect(cols.find((c) => c.table === "network_profiles")!.cascades).toBe(false);
  });

  it("every column that holds an account id is removed with the account, erased by an ACCOUNT_DATA entry, or kept for a stated reason", () => {
    const keys = new Set(ACCOUNT_DATA.map((d) => d.key));
    const unaccounted = cols
      .filter((c) => !c.cascades)
      .map((c) => `${c.table}.${c.column}`)
      .filter((name) => {
        const table = name.split(".")[0];
        if (KEPT[name] || KNOWN_GAPS.includes(name)) return false;
        return !(ERASED_BY[table] && keys.has(ERASED_BY[table]));
      });
    expect(unaccounted, "Add an ACCOUNT_DATA entry (server/privacy/accountData.ts) for these, or a stated reason to keep them").toEqual([]);
  });

  it("a kept column names its retention rule, and every listed gap still exists (remove a line once it is fixed)", () => {
    expect(RETENTION.some((r) => r.data.startsWith(KEPT["billing_ledger.tenant_id"]))).toBe(true);
    const names = new Set(cols.map((c) => `${c.table}.${c.column}`));
    for (const gap of KNOWN_GAPS) expect(names.has(gap), `${gap} is no longer in the schema`).toBe(true);
    for (const table of Object.keys(ERASED_BY)) expect(cols.some((c) => c.table === table), `${table} is no longer in the schema`).toBe(true);
  });
});

/* ---- 2. behaviour ----------------------------------------------------------------------------------------------- */

const who = (id: string, name: string): Session => ({ userId: id, tenantId: id, email: `${id}@example.com`, name });
const asha = who("u-erase-asha", "Asha Rao");
const ravi = who("u-erase-ravi", "Ravi Shah");
const meera = who("u-erase-meera", "Meera Iyer");

const allow = (t: string) =>
  writeClientState(t, "wj.automation", POLICY_VERSION, {
    policy: {
      ...defaultPolicy(),
      "cofounders.connect": "automatic",
      "cofounders.join": "automatic",
      "cofounders.invite": "automatic",
      "cofounders.share_contact": "automatic",
      "cofounders.message": "automatic",
      "marketplace.publish": "automatic",
      "marketplace.message": "automatic",
      "marketplace.offer": "automatic",
    },
    defaultLevel: "guided",
  });

/** Every row the in-memory store holds, by table. */
const allRows = () => (globalThis as unknown as { __wjTables: Map<string, unknown[]> }).__wjTables;

/**
 * What the database does when the tenant row goes and the in-memory store doesn't: every row whose person column has a
 * foreign key to `tenants` with `on delete cascade` (read from the migrations) is removed.
 */
function cascadeLikeTheDatabase(id: string) {
  for (const { table, column } of personColumns().filter((c) => c.cascades)) {
    const rows = allRows().get(table) as Record<string, unknown>[] | undefined;
    if (rows) allRows().set(table, rows.filter((r) => r[column] !== id));
  }
}

/** Which tables still hold a row that names this account id anywhere in it. */
function tablesNaming(id: string): string[] {
  const out: string[] = [];
  for (const [name, rows] of allRows()) if (JSON.stringify(rows).includes(id)) out.push(name);
  return out.sort();
}

let files: MemoryResumeFileStore;
beforeEach(async () => {
  resetTablesForTests();
  files = new MemoryResumeFileStore();
  setResumeFileStoreForTests(files);
  vi.stubEnv("SECRET_ENCRYPTION_KEY", "test-secret-key-for-erasure-coverage-0123456789");
  for (const p of [asha, ravi, meera]) await allow(p.tenantId);
});

/** Asha uses every part of the product that keeps her id outside the tenant row, alongside Ravi and Meera. */
async function aWorldWithAsha() {
  // Network: profile, connection, messages, posts, a reaction, comments, a reshare, a report and a block.
  const net = (s: Session, name: string) => N.saveMyProfile(s, { name, headline: "Engineer", location: "Pune", about: "About me", skills: ["Go"], experience: [], education: [], tiers: DEFAULT_TIERS, findBy: "everyone", requestsFrom: "everyone", statuses: [], shareUpdates: true });
  const ashaNet = (await net(asha, "Asha Rao")).publicId;
  const raviNet = (await net(ravi, "Ravi Shah")).publicId;
  const meeraNet = (await net(meera, "Meera Iyer")).publicId;
  const v = await N.requestConnection(ravi, ashaNet, { how: "Worked together", note: "Hi Asha" }, true);
  await N.actOnConnection(asha, v.connectionId!, "accept");
  await S.sendMessage(asha, v.connectionId!, "From Asha", true);
  await S.sendMessage(ravi, v.connectionId!, "From Ravi", true);
  await S.publishPost(asha, { text: "Asha's post", audience: "everyone", media: [(await uploadMedia(asha, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xda, 0x00, 0x02, 0x01, 0x02, 0xff, 0xd9]), "image/jpeg")).id] }, true);
  await S.publishPost(ravi, { text: "Ravi's post", audience: "everyone" }, true);
  const feed = await S.feedFor(asha);
  const hers = feed.find((u) => u.text === "Asha's post")!.id;
  const his = feed.find((u) => u.text === "Ravi's post")!.id;
  await E.react(asha, his, "like", true);
  await E.react(ravi, hers, "celebrate", true);
  await E.addComment(asha, his, "Asha comments", true);
  await E.addComment(ravi, hers, "Ravi comments", true);
  await E.resharePost(asha, his, { text: "Worth reading", audience: "everyone" }, true);
  await N.reportMember(asha, meeraNet, "Pretending to be someone else");
  await N.blockMember(asha, meeraNet);
  expect(raviNet).toMatch(/^np_/);

  // Co-founders: a profile, a team, a connection and messages.
  const P = (name: string) => ({ name, headline: `${name}, builder`, role: "Tech", skills: ["Engineering"], commitment: "Full time", location: "Pune", ideaState: "open", about: `${name} builds things.`, open: true });
  await saveProfile(asha, P("Asha Rao"));
  await saveProfile(ravi, P("Ravi Shah"));
  await createTeam(asha, { name: "Chaser", idea: "Invoices that chase themselves", stage: "Prototype", openRoles: [{ role: "Business", skills: ["Sales"] }], decision: "any", open: true });
  const raviPid = (await import("@/server/cofounders/profiles")).myProfile;
  const c = await connect(asha, (await raviPid(ravi))!.publicId);
  await respond(ravi, c.id, "accept");
  await cofounderMessage(asha, c.id, "Hello Ravi");
  await cofounderMessage(ravi, c.id, "Hello Asha");

  // Buy, Sell & Rent: a listing with a photo, a conversation, and a report.
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]), Buffer.from([0xff, 0xda, 0x00, 0x02, 0x01, 0x02, 0xff, 0xd9])]);
  const L = { title: "Study table", description: "Solid wood study table, two drawers, lightly used.", category: "Furniture", price: 3500, condition: "Used", area: "Indiranagar" };
  const mine = await saveListing(asha, L);
  await addPhoto(asha, mine.listingId, jpeg);
  await publish(asha, mine.listingId);
  const theirs = await saveListing(ravi, { ...L, title: "Brass lamp" });
  await addPhoto(ravi, theirs.listingId, jpeg);
  await publish(ravi, theirs.listingId);
  const t = await startThread(asha, theirs.listingId, "Is the lamp available?");
  await marketMessage(ravi, t.id, "Yes it is");
  await reportMarketListing(asha, theirs.listingId, "This listing looks wrong to me");

  // Hiring: Asha owns a workspace with Ravi; she posts a job, shortlists and writes to Meera, who is open to recruiters.
  const { org } = await H.createWorkspace(asha, { name: "Acme" });
  await H.acceptInvite(ravi, (await H.inviteMember(asha, org.id, ravi.email!, "owner")).id);
  const job = await H.saveJob(asha, org.id, { title: "Engineer", location: "Remote", workMode: "remote", description: "Build things with a small team, in TypeScript, for real customers.", applyUrl: "https://acme.test/jobs/1" } as never);
  await H.setJobStatus(asha, org.id, job.id, "open");
  await H.saveMyTalentProfile(meera, { displayName: "Meera I.", headline: "SRE", seniority: "senior", yearsExperience: 7, skills: ["Go"], locations: ["Pune"], workModes: ["remote"], summary: "" });
  await H.addToShortlist(asha, org.id, meera.tenantId, "Strong");
  await H.startConversation(asha, org.id, meera.tenantId, "Hi Meera");

  // As a job seeker: Asha applies with Easy Apply to Ravi's company, and reports a listing in Find.
  const { org: other } = await H.createWorkspace(ravi, { name: "Globex" });
  const theirJob = await H.saveJob(ravi, other.id, { title: "Platform Engineer", location: "Remote", workMode: "remote", description: "Run the platform every product team ships on, with a small SRE group.", applyUrl: "https://globex.test/jobs/1" } as never);
  await H.setJobStatus(ravi, other.id, theirJob.id, "open");
  const cv = await files.save(asha.tenantId, { filename: "Asha CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.4 asha") });
  await C.easyApply(asha, { listingIds: [`employers_${hashKey(`employers:${theirJob.id}`)}`], name: "Asha Rao", resumeFileId: cv.id, consent: true });
  await reportListing(asha.tenantId, "jobs", "job_some_listing", "spam", "Looks like a scam");
}

describe("account deletion, end to end", () => {
  it("leaves no row that names the deleted person, apart from the known gaps", async () => {
    await aWorldWithAsha();
    const before = tablesNaming(asha.tenantId);
    // The world really reaches every part checked below (so a quiet seeding failure can't pass this test).
    for (const t of ["network_profiles", "network_connections", "network_messages", "network_updates", "network_reactions", "network_comments", "network_media", "module_reports", "module_blocks", "cofounder_profiles", "cofounder_teams", "cofounder_connections", "cofounder_messages", "marketplace_listings", "marketplace_threads", "marketplace_messages", "hiring_orgs", "hiring_members", "employer_jobs", "hiring_shortlist", "hiring_conversations", "job_applications"]) {
      expect(before, t).toContain(t);
    }

    expect(await eraseAccount(asha)).toEqual({ ok: true });
    cascadeLikeTheDatabase(asha.tenantId);

    const left = tablesNaming(asha.tenantId);
    // job_applications: her Easy Apply application to Globex. module_reports: her report of a listing in Jobs' Find,
    // which neither Network's nor Buy, Sell & Rent's erasure removes (each removes only its own module's reports).
    expect(left).toEqual(["job_applications", "module_reports"]);
    // The workspace she owned stays with Ravi, and nothing in it names her.
    expect(tablesNaming(ravi.tenantId)).toEqual(expect.arrayContaining(["hiring_orgs", "hiring_members", "employer_jobs"]));
  });

  it("the other people keep their own rows", async () => {
    await aWorldWithAsha();
    await eraseAccount(asha);
    cascadeLikeTheDatabase(asha.tenantId);
    for (const t of ["network_profiles", "network_updates", "cofounder_profiles", "marketplace_listings", "talent_profiles"]) {
      expect([...tablesNaming(ravi.tenantId), ...tablesNaming(meera.tenantId)], t).toContain(t);
    }
  });
});
