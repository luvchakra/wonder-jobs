/**
 * WonderWorks Network (owner, 2026-11-20): members connect with each other, across every module. This file is the
 * rules, with no storage: what a network profile holds, who sees which part of it, and how two people stand.
 *
 * A network profile is opt-in and built from the member's own Career Profile. Each part is shown to Everyone on the
 * network, to Connections, or to nobody (its tier). Email and phone are never part of it.
 */
import type { CareerDNA } from "@/domain/career/types";

export type Tier = "everyone" | "connections" | "hidden";
export const TIERS: Tier[] = ["everyone", "connections", "hidden"];
export const TIER_LABEL: Record<Tier, string> = { everyone: "Everyone", connections: "Connections", hidden: "Hidden" };

/** The parts of a profile a member sets a tier for. Headline covers the headline, place and skills. */
export type NetPart = "name" | "photo" | "headline" | "about" | "experience" | "education" | "connections";
export const NET_PARTS: { id: NetPart; label: string }[] = [
  { id: "name", label: "Full name" },
  { id: "photo", label: "Photo" },
  { id: "headline", label: "Headline, place and skills" },
  { id: "about", label: "About" },
  { id: "experience", label: "Experience" },
  { id: "education", label: "Education" },
  { id: "connections", label: "Connections list" },
];
/** The full name shows to everyone unless the member changes it (owner, 2026-11-20). */
export const DEFAULT_TIERS: Record<NetPart, Tier> = { name: "everyone", photo: "everyone", headline: "everyone", about: "everyone", experience: "connections", education: "connections", connections: "hidden" };

export type FindBy = "everyone" | "link" | "connections";
export const FIND_BY: { id: FindBy; label: string; hint: string }[] = [
  { id: "everyone", label: "Everyone on the network", hint: "You show in search and People you may know" },
  { id: "link", label: "Only people with your link", hint: "You aren't suggested or searchable" },
  { id: "connections", label: "Connections only", hint: "New people can't open your profile" },
];
export type RequestsFrom = "everyone" | "second" | "nobody";
export const REQUESTS_FROM: { id: RequestsFrom; label: string }[] = [
  { id: "everyone", label: "Everyone" },
  { id: "second", label: "People with a mutual connection" },
  { id: "nobody", label: "Nobody" },
];

/** What a member says they're here for; each links to the module it belongs to. */
export type NetStatus = "open_to_work" | "hiring" | "cofounder" | "services";
export const NET_STATUSES: { id: NetStatus; label: string; update: string; module: string }[] = [
  { id: "open_to_work", label: "Open to work", update: "is open to work", module: "jobs" },
  { id: "hiring", label: "Hiring", update: "is hiring", module: "jobs" },
  { id: "cofounder", label: "Looking for a co-founder", update: "is looking for a co-founder", module: "cofounders" },
  { id: "services", label: "Offering services", update: "is offering services", module: "services" },
];

export interface NetExperience {
  title: string;
  org: string;
  start: string;
  end?: string;
  current?: boolean;
  location?: string;
}
export interface NetEducation {
  school: string;
  degree?: string;
  end?: string;
}

/** What the member chose to put on the network; the server stores exactly this. */
export interface NetworkProfileInput {
  name: string;
  headline: string;
  location: string;
  about: string;
  skills: string[];
  experience: NetExperience[];
  education: NetEducation[];
  tiers: Record<NetPart, Tier>;
  findBy: FindBy;
  requestsFrom: RequestsFrom;
  statuses: NetStatus[];
  shareUpdates: boolean;
}
export interface NetworkProfile extends NetworkProfileInput {
  /** The id other members see; the account id never leaves the server. */
  publicId: string;
  updatedAt: string;
}

export const HOW_KNOWN = ["Worked together", "Studied together", "Met at an event", "Shared interest", "Other"] as const;

export type Relation = "self" | "connected" | "pending_out" | "pending_in" | "none";

/** A member as another member sees them: only the parts their tiers allow. */
export interface MemberView {
  id: string;
  name: string;
  photo: boolean;
  headline?: string;
  location?: string;
  skills?: string[];
  about?: string;
  experience?: NetExperience[];
  education?: NetEducation[];
  statuses: NetStatus[];
  relation: Relation;
  /** The connection or request between the two, when there is one. */
  connectionId?: string;
  /** The note that came with their request to the viewer. */
  note?: string;
  how?: string;
  mutual: number;
  mutualNames: string[];
  sharedSkills: string[];
  /** How many connections they have, when they show their list. */
  connections?: number;
  /** Whether the viewer may send them a request now. */
  canRequest: boolean;
}

/** First name and last initial: what shows when the full name isn't for this viewer. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Member";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "");

/** The network profile a Career Profile gives, before the member's own choices. Nothing is invented: empty stays empty. */
export function networkProfileFrom(dna: CareerDNA): Pick<NetworkProfileInput, "name" | "headline" | "location" | "about" | "skills" | "experience" | "education"> {
  const h = dna.history;
  return {
    name: clip(dna.name, 80),
    headline: clip(dna.headline, 160),
    location: clip(h?.contact?.location || dna.preferredLocations?.[0], 80),
    about: clip(h?.summary, 1200),
    skills: dna.skills.map((s) => s.name.trim()).filter(Boolean).slice(0, 30),
    experience: (h?.experience ?? []).slice(0, 12).map((e) => ({ title: clip(e.title, 100), org: clip(e.employer, 100), start: clip(e.startDate, 20), end: clip(e.endDate, 20) || undefined, current: !!e.current || undefined, location: clip(e.location, 80) || undefined })),
    education: (h?.education ?? []).slice(0, 8).map((e) => ({ school: clip(e.institution, 120), degree: [clip(e.degree, 80), clip(e.field, 80)].filter(Boolean).join(", ") || undefined, end: clip(e.endDate, 20) || undefined })),
  };
}

const oneOf = <T extends string>(v: unknown, all: readonly T[], dflt: T): T => (all.includes(v as T) ? (v as T) : dflt);

/** Caps and cleans what a member sends: unknown values fall back to the defaults, never to something wider. */
export function cleanProfile(p: Partial<NetworkProfileInput>): NetworkProfileInput {
  const tiers = { ...DEFAULT_TIERS };
  for (const { id } of NET_PARTS) tiers[id] = oneOf(p.tiers?.[id], TIERS, DEFAULT_TIERS[id]);
  return {
    name: clip(p.name, 80),
    headline: clip(p.headline, 160),
    location: clip(p.location, 80),
    about: clip(p.about, 1200),
    skills: (Array.isArray(p.skills) ? p.skills : []).map((s) => clip(s, 60)).filter(Boolean).slice(0, 30),
    experience: (Array.isArray(p.experience) ? p.experience : [])
      .slice(0, 12)
      .map((e) => ({ title: clip(e?.title, 100), org: clip(e?.org, 100), start: clip(e?.start, 20), end: clip(e?.end, 20) || undefined, current: e?.current ? true : undefined, location: clip(e?.location, 80) || undefined }))
      .filter((e) => e.title || e.org),
    education: (Array.isArray(p.education) ? p.education : [])
      .slice(0, 8)
      .map((e) => ({ school: clip(e?.school, 120), degree: clip(e?.degree, 160) || undefined, end: clip(e?.end, 20) || undefined }))
      .filter((e) => e.school),
    tiers,
    findBy: oneOf(p.findBy, ["everyone", "link", "connections"] as const, "everyone"),
    requestsFrom: oneOf(p.requestsFrom, ["everyone", "second", "nobody"] as const, "everyone"),
    statuses: [...new Set((Array.isArray(p.statuses) ? p.statuses : []).filter((s): s is NetStatus => NET_STATUSES.some((x) => x.id === s)))],
    shareUpdates: p.shareUpdates !== false,
  };
}

/** One key for a pair of members, whoever asked: the database allows one row per key. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const sees = (tier: Tier, relation: Relation) => relation === "self" || tier === "everyone" || (tier === "connections" && relation === "connected");

/** Whether `viewer` may open this profile at all. A person the member asked to connect may look at who is asking. */
export function mayOpen(findBy: FindBy, relation: Relation): boolean {
  if (relation === "self" || relation === "connected" || relation === "pending_in") return true;
  return findBy !== "connections";
}

export function sharedSkills(mine: string[], theirs: string[]): string[] {
  const have = new Set(mine.map((s) => s.toLowerCase()));
  return theirs.filter((s) => have.has(s.toLowerCase()));
}

export interface Standing {
  relation: Relation;
  connectionId?: string;
  note?: string;
  how?: string;
  mutualNames: string[];
  mutual: number;
  /** Their connection count, passed only when the caller counted it. */
  connections?: number;
  /** The viewer already asked and was ignored, or one blocked the other: no new request. */
  closed?: boolean;
}

/** What `viewer` sees of `p`: each part only when its tier allows, the short name otherwise. */
export function viewOf(p: NetworkProfile, hasPhoto: boolean, viewerSkills: string[], st: Standing): MemberView {
  const r = st.relation;
  const show = (part: NetPart) => sees(p.tiers[part], r);
  const head = show("headline");
  const canRequest = r === "none" && !st.closed && (p.requestsFrom === "everyone" || (p.requestsFrom === "second" && st.mutual > 0));
  return {
    id: p.publicId,
    name: show("name") ? p.name || "Member" : shortName(p.name),
    photo: hasPhoto && show("photo"),
    headline: head ? p.headline : undefined,
    location: head ? p.location : undefined,
    skills: head ? p.skills : undefined,
    about: show("about") && p.about ? p.about : undefined,
    experience: show("experience") && p.experience.length ? p.experience : undefined,
    education: show("education") && p.education.length ? p.education : undefined,
    statuses: p.statuses,
    relation: r,
    connectionId: st.connectionId,
    note: r === "pending_in" ? st.note : undefined,
    how: r === "pending_in" ? st.how : undefined,
    mutual: st.mutual,
    mutualNames: st.mutualNames.slice(0, 2),
    sharedSkills: head ? sharedSkills(viewerSkills, p.skills) : [],
    connections: show("connections") ? st.connections : undefined,
    canRequest,
  };
}

/** Whether a profile matches every word typed, in what this viewer may see of it. */
export function matchesSearch(v: MemberView, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return false;
  const hay = [v.name, v.headline, v.location, ...(v.skills ?? []), ...(v.experience ?? []).map((e) => `${e.title} ${e.org}`)].filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Why someone is suggested, in the order that matters most; "" when there is nothing real to say (then they aren't). */
export function suggestionReason(v: Pick<MemberView, "mutual" | "sharedSkills" | "statuses">): string {
  if (v.mutual > 0) return `${v.mutual} mutual connection${v.mutual === 1 ? "" : "s"}`;
  if (v.sharedSkills.length > 0) return `${v.sharedSkills.length} shared skill${v.sharedSkills.length === 1 ? "" : "s"}`;
  return "";
}
export const suggestionScore = (v: Pick<MemberView, "mutual" | "sharedSkills">) => v.mutual * 3 + v.sharedSkills.length;
