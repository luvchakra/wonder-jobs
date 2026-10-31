/**
 * What a person sees of one connection (docs/WONDERWORKS_PLATFORM.md §4, step 10): who is on the other side, how far it
 * has got, what is waiting on them and what has been shared. Built on the server from the caller's own side only, so the
 * other side's hidden fields, and a block or a pass, never reach the screen. Pure helpers for the screens and the tests.
 */
import type { CofounderListing, ConnKind, ConnStatus, EndReason, ProfileView } from "./domain";

export interface ConnMessage {
  id: string;
  mine: boolean;
  /** The sender's name once interest is mutual; otherwise empty. */
  from: string;
  body: string;
  at: string;
}

export interface Counterpart {
  kind: "person" | "team";
  /** The page of the person or team (cfp_… or cft_…). */
  listingId: string;
  /** A person's headline or a team's name. */
  title: string;
  /** What they show: a person's profile at the audience the connection allows; a team's public listing. */
  profile?: ProfileView;
  team?: CofounderListing;
  /** A team's founders, each at the audience the connection allows. */
  founders?: ProfileView[];
}

export interface ConnView {
  id: string;
  kind: ConnKind;
  status: ConnStatus;
  /** How it started, from the viewer's side. */
  how: "you_connected" | "they_connected" | "you_asked" | "they_asked" | "you_invited" | "they_invited";
  counterpart: Counterpart;
  /** The viewer's own team, for a founder looking at a person's request or an invitation. */
  yourTeam?: { id: string; name: string };
  /** The viewer's agreement is needed now to accept. */
  needsYou: boolean;
  /** The viewer already agreed and the other side hasn't: waiting on them. */
  waiting: boolean;
  /** Messages are open (interest is mutual). */
  canMessage: boolean;
  /** The viewer marked "we're building", and whether both sides now have. */
  youMarkedBuilding: boolean;
  /** Contact details the other side shared with the viewer. */
  contacts: { name: string; email: string }[];
  youSharedContact: boolean;
  /** The reason it ended, as a viewer may be told: never that they were blocked. */
  ended?: "passed" | "left" | "closed";
  createdAt: string;
  updatedAt: string;
}

/** A block is never announced: it reads as a pass. */
export const shownEnd = (r: EndReason | null): ConnView["ended"] => (r === "left" ? "left" : r === "closed" ? "closed" : r ? "passed" : undefined);

export function lineOf(v: Pick<ConnView, "how" | "status" | "needsYou" | "waiting" | "ended" | "counterpart">): string {
  const who = v.counterpart.kind === "team" ? "the team" : "them";
  if (v.status === "passed") return v.ended === "left" ? "Someone left the team" : v.ended === "closed" ? "The team closed" : "Passed";
  if (v.status === "interested") {
    if (v.needsYou) return v.how === "they_asked" ? "Asked to join your team — decide" : v.how === "they_invited" ? "Invited you to their team — decide" : "Interested in you — decide";
    return v.how === "you_asked" ? "You asked to join · waiting for the founders" : v.how === "you_invited" ? "You invited them · waiting for their answer" : `Waiting for ${who}`;
  }
  if (v.status === "mutual") return "Interest is mutual — say hello";
  if (v.status === "talking") return v.waiting ? "Talking · you want to build together" : "Talking";
  return "Building together";
}
