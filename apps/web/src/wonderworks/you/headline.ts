/** What a person wrote about themselves, cleaned for showing and searching (every module's profile card uses these). */

/** "I am a senior director" / "I'm …" / the common "iam …" typo at the start of a goal is the candidate
 *  talking about themselves, not a search term — left in, "iam" reads as identity-and-access-management. */
export function stripSelfReference(text: string): string {
  // "I am" / "I'm" in any case; "iam" / "Iam" only — written in capitals, "IAM" is the field (identity and access management).
  return text.replace(/^\s*(?:i\s+am|i['’]?m)\b\s*(?:an?\s+)?/i, "").replace(/^\s*(?:iam|Iam)\b\s*(?:an?\s+)?/, "");
}

/** A headline sometimes leads with a meta-label ("Target: Senior Director / SVP — …") rather than
 *  the role itself — the label names the *field*, not part of the title, and searching for it
 *  literally finds nothing (no real posting is titled "Target …"). Strip it before the role is read. */
export function stripHeadlineLabel(text: string): string {
  return text.replace(/^\s*(?:target|goal|objective|seeking|desired\s*role|looking\s*for|open\s*to|career\s*goal)\s*[:\-–—]\s*/i, "");
}
