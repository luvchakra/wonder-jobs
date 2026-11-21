/**
 * Co-founders and the person's own data rights: what "Download my data" includes, and what "Delete my account" removes.
 * This module's tables (migration 0040) have no foreign key to the tenant row, so deleting the account doesn't cascade
 * to them: this does (server/privacy/accountData.ts runs it).
 *
 * Teams: a team the person founded alone is closed and removed (its other members and the join requests on it go with
 * it); a team that has another founder keeps running without them: only their membership goes, their approvals and
 * shared email come off its join requests, and if they created it another founder becomes its creator.
 */
import { blocks, conns, members, msgs, profiles, reports, teams, now, type ConnRow } from "./store";

const LIMIT = 10_000;
const uniq = <T extends { id: string }>(rows: T[]): T[] => [...new Map(rows.map((r) => [r.id, r])).values()];

/** Every pair connection the person is on, every join request they sent, and every invitation they made. */
const mineConns = async (tenant: string): Promise<ConnRow[]> =>
  uniq([...(await conns().find({ person_tenant: tenant }, { limit: LIMIT })), ...(await conns().find({ other_tenant: tenant }, { limit: LIMIT })), ...(await conns().find({ initiator: tenant }, { limit: LIMIT }))]);

/**
 * The person's own Co-founders data: their profile, the teams they are on (their role and how many people, never who),
 * their connections and invitations (what kind, where it stands, their side, what they sent and the email they shared), and counts of
 * who they blocked and the reports they filed. Never the other person's account id, name, contact details or words, and
 * never the join requests other people made to a team.
 */
export async function exportCofounders(tenant: string): Promise<unknown> {
  const [profile, mine, memberships, sent, blocked, filed] = await Promise.all([
    profiles().one({ tenant_id: tenant }),
    mineConns(tenant),
    members().find({ tenant_id: tenant }, { limit: LIMIT }),
    msgs().find({ sender_tenant: tenant }, { order: "created_at", limit: LIMIT }),
    blocks().find({ blocker_tenant: tenant }, { limit: LIMIT }),
    reports().find({ reporter_tenant: tenant }, { order: "created_at", limit: LIMIT }),
  ]);
  const teamIds = [...new Set([...memberships.map((m) => m.team_id), ...mine.flatMap((c) => (c.team_id ? [c.team_id] : []))])];
  const teamRows = new Map((await teams().findIn("id", teamIds)).map((t) => [t.id, t]));
  const mineIds = new Set(mine.map((c) => c.id));
  return {
    profile: profile
      ? { name: profile.name, headline: profile.headline, role: profile.role, skills: profile.skills, commitment: profile.commitment, location: profile.location, ideaState: profile.idea_state, idea: profile.idea, about: profile.about, lookingFor: profile.looking_for, equity: profile.equity, visibility: profile.tiers, open: profile.open, shareable: profile.shareable, createdAt: profile.created_at, updatedAt: profile.updated_at }
      : null,
    teams: await Promise.all(
      memberships.map(async (m) => {
        const t = teamRows.get(m.team_id);
        return { name: t?.name ?? null, idea: t?.idea ?? null, stage: t?.stage ?? null, yourRole: m.role, people: (await members().find({ team_id: m.team_id }, { limit: LIMIT })).length, closed: t?.closed ?? null, joinedAt: m.joined_at };
      }),
    ),
    connections: mine.map((c) => ({
      id: c.id,
      kind: c.kind,
      team: c.team_id ? (teamRows.get(c.team_id)?.name ?? null) : null,
      yourSide: c.kind === "join" ? "you asked to join" : c.initiator === tenant ? "you reached out" : "you were reached",
      status: c.status,
      endReason: c.end_reason,
      youAgreed: c.approvals.includes(tenant),
      ...(c.shared.some((x) => x.tenant === tenant) ? { youSharedEmail: c.shared.find((x) => x.tenant === tenant)!.email } : {}),
      startedAt: c.created_at,
      updatedAt: c.updated_at,
    })),
    messagesYouSent: sent.filter((m) => mineIds.has(m.connection_id)).map((m) => ({ connection: m.connection_id, body: m.body, at: m.created_at })),
    peopleAndTeamsYouBlocked: blocked.length,
    reportsYouFiled: filed.map((r) => ({ about: r.subject_kind, reason: r.reason, at: r.created_at })),
  };
}

/**
 * Remove the person's Co-founders data for good: their profile, every connection they are on with its messages, what
 * they sent elsewhere, their blocks (and the blocks that name them) and reports (and those about them), and their team
 * memberships, as described above. The profile goes last, so a run that stopped part-way can be run again to finish. Safe
 * to run again, and a person with none of it is a no-op.
 */
export async function eraseCofounders(tenant: string): Promise<void> {
  const profile = await profiles().one({ tenant_id: tenant });
  const gone = new Set<string>(); // ids reports may point at: connections' messages, removed teams
  const goneConns = new Map<string, ConnRow>((await mineConns(tenant)).map((c) => [c.id, c]));
  const deadTeams: string[] = [];

  for (const m of await members().find({ tenant_id: tenant }, { limit: LIMIT })) {
    const founders = (await members().find({ team_id: m.team_id, role: "founder" })).map((f) => f.tenant_id);
    const others = founders.filter((f) => f !== tenant);
    if (m.role === "founder" && !others.length) {
      // The only founder: the team ends with them, and so does everything that hangs on it.
      deadTeams.push(m.team_id);
      for (const c of await conns().find({ team_id: m.team_id }, { limit: LIMIT })) goneConns.set(c.id, c);
      continue;
    }
    // Others carry on: only this person comes off.
    await members().remove({ team_id: m.team_id, tenant_id: tenant });
    const t = await teams().one({ id: m.team_id });
    if (t?.created_by === tenant && others.length) await teams().update({ id: t.id }, { created_by: others[0], updated_at: now() });
    for (const c of await conns().find({ team_id: m.team_id }, { limit: LIMIT })) {
      if (goneConns.has(c.id)) continue;
      if (c.approvals.includes(tenant) || c.build_marks.includes(tenant) || c.shared.some((x) => x.tenant === tenant)) {
        await conns().update({ id: c.id }, { approvals: c.approvals.filter((a) => a !== tenant), build_marks: c.build_marks.filter((a) => a !== tenant), shared: c.shared.filter((x) => x.tenant !== tenant), updated_at: now() });
      }
    }
  }

  // Messages: the whole thread of every connection that goes, and whatever the person sent on the ones that stay.
  for (const c of goneConns.values()) {
    for (const m of await msgs().find({ connection_id: c.id }, { limit: LIMIT })) gone.add(m.id);
    await msgs().remove({ connection_id: c.id });
    await conns().remove({ id: c.id });
  }
  for (const m of await msgs().find({ sender_tenant: tenant }, { limit: LIMIT })) gone.add(m.id);
  await msgs().remove({ sender_tenant: tenant });
  for (const id of deadTeams) {
    gone.add(id);
    await members().remove({ team_id: id });
    await blocks().remove({ kind: "team", blocked_id: id });
    await teams().remove({ id });
  }

  await blocks().remove({ blocker_tenant: tenant });
  await blocks().remove({ kind: "person", blocked_id: tenant });
  await reports().remove({ reporter_tenant: tenant });
  // Reports other people filed about what is now gone.
  for (const id of gone) await reports().remove({ subject_id: id });
  if (profile) {
    await reports().remove({ subject_kind: "person", subject_id: profile.public_id });
    await profiles().remove({ tenant_id: tenant });
  }
}
