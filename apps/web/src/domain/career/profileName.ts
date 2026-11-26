import type { CareerDNA } from "./types";

/**
 * The Career Profile's own name among the candidate's profiles (owner, 2026-11-26: "give option to edit profile
 * name"), shown where it's picked or searched as. Roles have their own titles; this one reads "My profile" until named.
 */
export const DEFAULT_PROFILE_NAME = "My profile";
export const PROFILE_NAME_MAX = 40;

/** A name as typed, tidied and capped; undefined when nothing is left (the profile then reads "My profile"). */
export function cleanProfileName(input: string): string | undefined {
  const name = input.replace(/\s+/g, " ").trim().slice(0, PROFILE_NAME_MAX).trim();
  return name || undefined;
}

export const profileNameOf = (dna: Pick<CareerDNA, "profileName"> | undefined): string => cleanProfileName(dna?.profileName ?? "") ?? DEFAULT_PROFILE_NAME;
