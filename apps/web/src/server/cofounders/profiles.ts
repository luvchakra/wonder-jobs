/**
 * Co-founders' profiles: a person's own profile (the only one they ever read in full), and the public listing made of
 * the fields they chose to show everyone. A profile is listed only while its owner is open to being found.
 */
import type { Session } from "../auth";
import { HiringError } from "../hiring";
import { newId } from "@/lib/ids";
import { cleanProfile, COFOUNDERS, viewProfile, termsOfProfile, type CofounderListing, type Profile } from "@/modules/cofounders/domain";
import { now, profiles, type ProfileRow } from "./store";

export const WONDERWORKS_COFOUNDERS = "cof_wonderworks";
export const SOURCE_NAME = "WonderWorks founders";

export const toProfile = (r: ProfileRow): Profile => ({ name: r.name, headline: r.headline, ...(r.role ? { role: r.role } : {}), skills: r.skills, ...(r.commitment ? { commitment: r.commitment } : {}), location: r.location, ideaState: r.idea_state, idea: r.idea, about: r.about, lookingFor: r.looking_for, equity: r.equity, tiers: r.tiers, open: r.open });

/** The person's own profile, in full. */
export async function myProfile(s: Session): Promise<(Profile & { publicId: string }) | null> {
  const r = await profiles().one({ tenant_id: s.tenantId });
  return r ? { ...toProfile(r), publicId: r.public_id } : null;
}

/** Save the person's profile (creating it, or editing the one they own). Turning "open" off removes it from Find at once. */
export async function saveProfile(s: Session, input: unknown): Promise<Profile & { publicId: string }> {
  const c = cleanProfile(input);
  if ("problem" in c) throw new HiringError(c.problem);
  const p = c.value;
  const at = now();
  const fields = { name: p.name, headline: p.headline, role: p.role ?? null, skills: p.skills, commitment: p.commitment ?? null, location: p.location, idea_state: p.ideaState, idea: p.idea, about: p.about, looking_for: p.lookingFor, equity: p.equity, tiers: p.tiers, open: p.open, updated_at: at };
  const had = await profiles().one({ tenant_id: s.tenantId });
  if (had) {
    await profiles().update({ tenant_id: s.tenantId }, fields);
    return { ...p, publicId: had.public_id };
  }
  const row: ProfileRow = { tenant_id: s.tenantId, public_id: newId("cfp"), ...fields, created_at: at };
  await profiles().insert(row);
  return { ...p, publicId: row.public_id };
}

/** Open or close the person's listing without touching the rest. */
export async function setOpen(s: Session, open: boolean): Promise<void> {
  const n = await profiles().update({ tenant_id: s.tenantId }, { open, updated_at: now() });
  if (!n) throw new HiringError("Save your profile first.", 404);
}

/** A profile as Find lists it: its headline and only the fields its owner shows everyone. */
export function profileListing(r: ProfileRow): CofounderListing {
  const v = viewProfile(toProfile(r), "public");
  return { id: r.public_id, kind: "person", title: v.headline, company: "Looking for a co-founder", location: v.location ?? "", terms: termsOfProfile(v), description: [v.idea, v.about, v.lookingFor].filter(Boolean).join("\n\n"), postedAt: r.updated_at, sourceId: WONDERWORKS_COFOUNDERS, sourceName: SOURCE_NAME };
}

/** Every profile whose owner is open to being found (public fields only): one of the module's two cross-tenant reads. */
export async function openProfiles(limit = 300): Promise<{ tenant: string; listing: CofounderListing }[]> {
  return (await profiles().find({ open: true }, { order: "updated_at", desc: true, limit })).map((r) => ({ tenant: r.tenant_id, listing: profileListing(r) }));
}

/** One open profile by its public id. */
export async function openProfile(publicId: string): Promise<{ tenant: string; row: ProfileRow } | null> {
  const r = await profiles().one({ public_id: publicId, open: true });
  return r ? { tenant: r.tenant_id, row: r } : null;
}

export const MODULE = COFOUNDERS;
