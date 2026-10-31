/**
 * WonderWorks Co-founders (docs/WONDERWORKS_PLATFORM.md §4, step 10): what a profile and a team are, what each shows to
 * whom, how a connection between two people — or between a person and a team of founders — moves from interest to
 * building together, and how Refine narrows the results. Pure, so the server, the screens and the tests share it.
 *
 * People are the listings. A listing is either a PERSON (a founder looking for a partner or a team) or a TEAM (a startup
 * with one or more founders looking for more). Privacy comes first:
 * - a profile shows only the fields its owner chose, in three tiers: everyone, mutual connections only, or hidden. The
 *   headline is always public; the name is never public (it is revealed at mutual interest); contact details are never
 *   a profile field — they go out only when the owner presses Share contact;
 * - a profile is found only while its owner is open to being found;
 * - nobody is told they were passed on or blocked.
 */
import { stagesOf } from "@/wonderworks/manifest";

export const COFOUNDERS = "cofounders" as const;

export const ROLES = ["Tech", "Business"] as const;
export type Role = (typeof ROLES)[number];
export const COMMITMENTS = ["Full time", "Part time", "Weekends"] as const;
export type Commitment = (typeof COMMITMENTS)[number];
export const STAGES = ["Idea", "Prototype", "Launched", "Revenue"] as const;
export type Stage = (typeof STAGES)[number];
export const SKILLS = ["Product", "Design", "Engineering", "Data / AI", "Sales", "Marketing", "Operations", "Finance"] as const;
export const MAX_SKILLS = 8;
export const MAX_FOUNDERS = 6;
export const MAX_OPEN_ROLES = 4;
export const MAX_MESSAGE = 2000;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const para = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, all: readonly T[]) => (typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : undefined);
const list = (v: unknown, max: number, each = 40) => (Array.isArray(v) ? [...new Set(v.map((x) => text(x, each)).filter(Boolean))].slice(0, max) : []);

/* ------------------------------------------------------------------ a person's profile */

/** The fields an owner decides about. The headline is always public; the name and contact are never profile fields to show. */
export const PROFILE_FIELDS = ["role", "skills", "commitment", "location", "idea", "about", "lookingFor", "equity"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export const FIELD_LABEL: Record<ProfileField, string> = { role: "Role", skills: "Skills", commitment: "Commitment", location: "Location", idea: "Idea", about: "About me", lookingFor: "What I want in a co-founder", equity: "Equity expectations" };
export type Tier = "everyone" | "connections" | "hidden";
export const TIER_LABEL: Record<Tier, string> = { everyone: "Everyone", connections: "Mutual connections", hidden: "Only me" };

/** A profile as its owner holds it. */
export interface Profile {
  name: string;
  headline: string;
  role?: Role;
  skills: string[];
  commitment?: Commitment;
  location: string;
  /** "idea" means they have one (described in `idea`); "open" means open to any idea. */
  ideaState: "idea" | "open";
  idea: string;
  about: string;
  lookingFor: string;
  equity: string;
  /** Who sees each field. Anything not listed is hidden. */
  tiers: Partial<Record<ProfileField, Tier>>;
  /** Found in Find only while open. */
  open: boolean;
}

/** Everyone sees these by default: the three the manifest names. The rest start as mutual connections only. */
export const DEFAULT_TIERS: Partial<Record<ProfileField, Tier>> = { role: "everyone", skills: "everyone", commitment: "everyone", location: "connections", idea: "connections", about: "connections", lookingFor: "connections", equity: "connections" };

export const EMPTY_PROFILE: Profile = { name: "", headline: "", skills: [], location: "", ideaState: "open", idea: "", about: "", lookingFor: "", equity: "", tiers: DEFAULT_TIERS, open: false };

export function cleanProfile(raw: unknown): { value: Profile } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name = text(r.name, 80);
  if (!name) return { problem: "Add your name. Only people you both connect with see it." };
  const headline = text(r.headline, 80);
  if (headline.length < 4) return { problem: "Write a short headline, for example “Backend engineer, ex-fintech”. Everyone who finds you sees it." };
  const role = oneOf(r.role, ROLES);
  if (!role) return { problem: "Choose Tech or Business." };
  const skills = list(r.skills, MAX_SKILLS);
  if (!skills.length) return { problem: "Add at least one skill." };
  const commitment = oneOf(r.commitment, COMMITMENTS);
  if (!commitment) return { problem: "Say how much time you can commit." };
  const tiersIn = r.tiers && typeof r.tiers === "object" ? (r.tiers as Record<string, unknown>) : {};
  const tiers: Partial<Record<ProfileField, Tier>> = {};
  for (const f of PROFILE_FIELDS) tiers[f] = oneOf(tiersIn[f], ["everyone", "connections", "hidden"] as const) ?? DEFAULT_TIERS[f];
  const ideaState = r.ideaState === "idea" ? "idea" : "open";
  const idea = ideaState === "idea" ? para(r.idea, 600) : "";
  if (ideaState === "idea" && idea.length < 10) return { problem: "Describe your idea in a sentence or two, or choose “Open to any idea”." };
  return { value: { name, headline, role, skills, commitment, location: text(r.location, 80), ideaState, idea, about: para(r.about, 1000), lookingFor: para(r.lookingFor, 600), equity: text(r.equity, 200), tiers, open: r.open === true } };
}

/** What the viewer's relationship allows them to see of a profile. */
export type Audience = "public" | "mutual";

/** The fields of a profile one audience may see: nothing else is ever sent. The name appears only for a mutual connection. */
export interface ProfileView {
  headline: string;
  name?: string;
  role?: Role;
  skills?: string[];
  commitment?: Commitment;
  location?: string;
  ideaState?: "idea" | "open";
  idea?: string;
  about?: string;
  lookingFor?: string;
  equity?: string;
}

export function viewProfile(p: Profile, audience: Audience): ProfileView {
  const sees = (f: ProfileField) => {
    const t = p.tiers[f] ?? "hidden";
    return t === "everyone" || (t === "connections" && audience === "mutual");
  };
  const v: ProfileView = { headline: p.headline };
  if (audience === "mutual") v.name = p.name;
  if (sees("role") && p.role) v.role = p.role;
  if (sees("skills") && p.skills.length) v.skills = p.skills;
  if (sees("commitment") && p.commitment) v.commitment = p.commitment;
  if (sees("location") && p.location) v.location = p.location;
  if (sees("idea")) {
    v.ideaState = p.ideaState;
    if (p.idea) v.idea = p.idea;
  }
  if (sees("about") && p.about) v.about = p.about;
  if (sees("lookingFor") && p.lookingFor) v.lookingFor = p.lookingFor;
  if (sees("equity") && p.equity) v.equity = p.equity;
  return v;
}

/* ------------------------------------------------------------------ a team */

export type Decision = "any" | "all";
export const DECISION_LABEL: Record<Decision, string> = { any: "Any one founder can accept", all: "All founders must agree" };

export interface OpenRole {
  role: Role;
  skills: string[];
}

/** A team as its founders hold it; everything on it is public while it is open (they chose to list it). */
export interface Team {
  name: string;
  idea: string;
  description: string;
  stage: Stage;
  openRoles: OpenRole[];
  commitment?: Commitment;
  equity: string;
  location: string;
  decision: Decision;
  open: boolean;
}

export const EMPTY_TEAM: Team = { name: "", idea: "", description: "", stage: "Idea", openRoles: [], equity: "", location: "", decision: "any", open: false };

export function cleanTeam(raw: unknown): { value: Team } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name = text(r.name, 80);
  if (name.length < 2) return { problem: "Give the team or startup a name." };
  const idea = text(r.idea, 140);
  if (idea.length < 10) return { problem: "Say what you're building in a sentence." };
  const stage = oneOf(r.stage, STAGES);
  if (!stage) return { problem: "Choose the stage." };
  const openRoles: OpenRole[] = [];
  for (const o of Array.isArray(r.openRoles) ? r.openRoles.slice(0, MAX_OPEN_ROLES) : []) {
    const x = o && typeof o === "object" ? (o as Record<string, unknown>) : {};
    const role = oneOf(x.role, ROLES);
    if (role) openRoles.push({ role, skills: list(x.skills, MAX_SKILLS) });
  }
  const open = r.open === true;
  if (open && !openRoles.length) return { problem: "Add at least one role you're looking for before listing the team. People can ask to join only for an open role." };
  return { value: { name, idea, description: para(r.description, 1500), stage, openRoles, commitment: oneOf(r.commitment, COMMITMENTS), equity: text(r.equity, 200), location: text(r.location, 80), decision: r.decision === "all" ? "all" : "any", open } };
}

/** What a team's founders may do. A joined member (not a founder) can message and leave; only founders run the team. */
export type TeamRole = "founder" | "member";
export type TeamAction = "edit" | "invite" | "decide" | "close" | "message" | "leave" | "view";
const TEAM_CAN: Record<TeamRole, readonly TeamAction[]> = { founder: ["edit", "invite", "decide", "close", "message", "leave", "view"], member: ["message", "leave", "view"] };
/** An unknown role can do nothing. */
export const teamMay = (role: string | undefined | null, action: TeamAction): boolean => !!role && (TEAM_CAN as Record<string, readonly TeamAction[]>)[role]?.includes(action) === true;

/* ------------------------------------------------------------------ what Find lists */

export type ListingKind = "person" | "team";

export interface CofounderTerms {
  role?: Role;
  skills?: string[];
  commitment?: Commitment;
  ideaState?: "idea" | "open";
  idea?: string;
  equity?: string;
  stage?: Stage;
  openRoles?: OpenRole[];
  decision?: Decision;
  founders?: number;
}

/** One person or team as Find shows them: only what they chose to show everyone. */
export interface CofounderListing {
  /** `cfp_<id>` for a person, `cft_<id>` for a team: opaque ids, never an account id. */
  id: string;
  kind: ListingKind;
  /** A person's headline, or a team's name. */
  title: string;
  /** What the card's second line names: "Founder" for a person, the team's idea for a team. */
  company: string;
  location: string;
  terms: CofounderTerms;
  description: string;
  postedAt?: string;
  sourceId: string;
  sourceName: string;
}

export const idKind = (id: string): ListingKind | null => (id.startsWith("cfp_") ? "person" : id.startsWith("cft_") ? "team" : null);

export function termsOfProfile(v: ProfileView): CofounderTerms {
  return { ...(v.role ? { role: v.role } : {}), ...(v.skills ? { skills: v.skills } : {}), ...(v.commitment ? { commitment: v.commitment } : {}), ...(v.ideaState ? { ideaState: v.ideaState } : {}), ...(v.idea ? { idea: v.idea } : {}), ...(v.equity ? { equity: v.equity } : {}) };
}

/* ------------------------------------------------------------------ Refine */

export interface Facets {
  kind?: ListingKind;
  role?: Role;
  commitment?: Commitment;
  skill?: string;
  hasIdea?: boolean;
}

/** Narrow the results. A person who didn't show a field is kept out when that field is the filter, and counted as hidden. */
export function applyFacets(list: CofounderListing[], f: Facets): { kept: CofounderListing[]; hidden: number } {
  const roleOf = (l: CofounderListing) => (l.kind === "team" ? (l.terms.openRoles ?? []).map((o) => o.role) : l.terms.role ? [l.terms.role] : []);
  const skillsOf = (l: CofounderListing) => (l.kind === "team" ? (l.terms.openRoles ?? []).flatMap((o) => o.skills) : l.terms.skills ?? []);
  const kept = list.filter(
    (l) =>
      (!f.kind || l.kind === f.kind) &&
      (!f.role || roleOf(l).includes(f.role)) &&
      (!f.commitment || l.terms.commitment === f.commitment) &&
      (!f.skill || skillsOf(l).some((s) => s.toLowerCase() === f.skill!.toLowerCase())) &&
      (!f.hasIdea || (l.kind === "team" ? !!l.terms.idea : l.terms.ideaState === "idea")),
  );
  return { kept, hidden: list.length - kept.length };
}

/** How the viewer's own saved details compare: a complementary role, the same time commitment, a skill they could bring. */
export interface Fit {
  fit: "strong" | "some" | "unknown";
  signals: { tone: "good" | "warn"; text: string }[];
}

export interface Persona {
  role?: Role;
  skills: string[];
  commitment?: Commitment;
}

export function matchListing(l: CofounderListing, me: Persona | null): Fit {
  if (!me || (!me.role && !me.commitment)) return { fit: "unknown", signals: [] };
  const signals: Fit["signals"] = [];
  const theirRoles = l.kind === "team" ? (l.terms.openRoles ?? []).map((o) => o.role) : l.terms.role ? [l.terms.role] : [];
  if (me.role && theirRoles.length) {
    // A co-founder usually brings the other half: a Tech founder looks for Business, and the reverse. A team lists the roles it needs.
    const wanted = l.kind === "team" ? theirRoles.includes(me.role) : theirRoles.every((r) => r !== me.role);
    signals.push(wanted ? { tone: "good", text: l.kind === "team" ? `They need a ${me.role.toLowerCase()} co-founder` : `${theirRoles[0]} — the other half of a founding pair` } : { tone: "warn", text: l.kind === "team" ? `They're not looking for a ${me.role.toLowerCase()} co-founder` : `Also ${theirRoles[0].toLowerCase()} — you'd overlap` });
  }
  if (me.commitment && l.terms.commitment) signals.push(l.terms.commitment === me.commitment ? { tone: "good", text: `Both ${me.commitment.toLowerCase()}` } : { tone: "warn", text: `They want ${l.terms.commitment.toLowerCase()}, you said ${me.commitment.toLowerCase()}` });
  const theirSkills = l.kind === "team" ? (l.terms.openRoles ?? []).flatMap((o) => o.skills) : [];
  const shared = theirSkills.filter((s) => me.skills.some((m) => m.toLowerCase() === s.toLowerCase()));
  if (shared.length) signals.push({ tone: "good", text: `You bring ${shared.slice(0, 2).join(", ")}` });
  if (!signals.length) return { fit: "unknown", signals };
  return { fit: signals.some((s) => s.tone === "warn") ? "some" : "strong", signals };
}

/* ------------------------------------------------------------------ connections */

export type ConnStatus = "interested" | "mutual" | "talking" | "building" | "passed";
export const STATUS_LABEL: Record<ConnStatus, string> = { interested: "Interested", mutual: "Mutual", talking: "Talking", building: "Building", passed: "Passed" };
export const STAGES_OF = stagesOf("Interested", "Mutual", "Talking", "Building / Passed");
/** The manifest's stage ids; passed ends under Building / Passed as a chip. */
export const STAGE_OF: Record<ConnStatus, "interested" | "mutual" | "talking" | "building_passed"> = { interested: "interested", mutual: "mutual", talking: "talking", building: "building_passed", passed: "building_passed" };
export const LIVE: ConnStatus[] = ["interested", "mutual", "talking", "building"];
/** Messages open only once interest is mutual. */
export const MESSAGING: ConnStatus[] = ["mutual", "talking", "building"];

/** A pair connects two people; a join connects one person with a team of founders. */
export type ConnKind = "pair" | "join";
export type EndReason = "declined" | "passed" | "left" | "closed" | "blocked";

export interface ConnShape {
  kind: ConnKind;
  /** Who pressed first. */
  initiator: string;
  /** Pair: the initiator. Join: the person (who asked, or was invited). */
  person: string;
  /** Pair: the other person. */
  other?: string;
}

/** One side of a connection: the people on it and how many must agree. */
export interface Side {
  tenants: string[];
  rule: Decision;
}

/** The two sides. A person's side is just them; a team's side is its founders under the team's decision rule. */
export function sidesOf(c: ConnShape, founders: string[], decision: Decision): [Side, Side] {
  if (c.kind === "pair") return [{ tenants: [c.person], rule: "all" }, { tenants: [c.other ?? ""], rule: "all" }];
  return [{ tenants: [c.person], rule: "all" }, { tenants: founders, rule: decision }];
}

export const sideAgrees = (side: Side, marks: string[]): boolean => (side.rule === "all" ? side.tenants.length > 0 && side.tenants.every((t) => marks.includes(t)) : side.tenants.some((t) => marks.includes(t)));

/** Both sides agree, by their own rules. Used for interest becoming mutual and for deciding to build together. */
export const bothAgree = (c: ConnShape, founders: string[], decision: Decision, marks: string[]): boolean => sidesOf(c, founders, decision).every((s) => sideAgrees(s, marks));

/** Which side a tenant stands on in a connection, or null for nobody (a stranger can do nothing here). */
export function sideOf(c: ConnShape, founders: string[], tenant: string): 0 | 1 | null {
  const [a, b] = sidesOf(c, founders, "any");
  return a.tenants.includes(tenant) ? 0 : b.tenants.includes(tenant) ? 1 : null;
}

/** The status after a message: the first one moves Mutual to Talking. */
export const afterMessage = (s: ConnStatus): ConnStatus => (s === "mutual" ? "talking" : s);

/** Pair key for "one live connection per two people" and join key for "one live request per person and team". */
export const pairKey = (a: string, b: string) => `pair:${[a, b].sort().join(":")}`;
export const joinKey = (person: string, teamId: string) => `join:${teamId}:${person}`;

export function cleanMessage(v: unknown): { value: string } | { problem: string } {
  const t = para(v, MAX_MESSAGE);
  return t ? { value: t } : { problem: "Write a message first." };
}

/** The server answers 409 with this when a setting is Ask me and the person hasn't yet checked what goes. */
export const needsConfirm = (e: unknown) => (e as { status?: number }).status === 409 && /then press Send/.test((e as Error).message ?? "");

/** Search words as the facets of one Find run: the same words matched against a card's visible text. */
export const cardText = (l: CofounderListing) => [l.title, l.company, l.location, l.terms.role ?? "", ...(l.terms.skills ?? []), l.terms.idea ?? "", ...(l.terms.openRoles ?? []).flatMap((o) => [o.role, ...o.skills])].join(" ");

/** The Pipeline's own profile detail the persona holds (what the manifest calls persona): role, skills, commitment. */
export const personaOf = (p: Pick<Profile, "role" | "skills" | "commitment">): Persona => ({ role: p.role, skills: p.skills, commitment: p.commitment });
