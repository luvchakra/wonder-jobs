/**
 * Ask Wonder: a deterministic natural-language-to-action router (spec Phase 3.1/3.3).
 *
 * This is not a chatbot: there is no model call, no free-text reply and no hidden reasoning.
 * A typed phrase is matched against a fixed, small set of real actions by pattern; anything that
 * doesn't match a specific pattern falls back to a job search, exactly like the command palette
 * already did before this existed. The caller (CommandPalette) resolves a match against the
 * candidate's own real data before showing anything — this module only decides *which* action a
 * phrase means and what's left of the phrase once the intent words are stripped out.
 */

export type WonderIntentType =
  | "today_priorities"
  | "application_progress"
  | "missing_skills"
  | "applications_attention"
  | "career_headline"
  | "create_schedule"
  | "change_preferences"
  | "find_opportunities"
  | "explain_why_not_shown"
  | "explain_job"
  | "prepare_strongest"
  | "prepare_application"
  | "search_jobs";

export interface WonderIntent {
  type: WonderIntentType;
  /** What's left of the phrase after the intent's own keywords are stripped — a subject to look up or a search query. Never fabricated: it's a substring of what the candidate typed. */
  subject: string;
}

interface Rule {
  type: WonderIntentType;
  test: RegExp;
  /** Non-global pattern(s) to strip from the phrase to get the subject. Applied in order. */
  strip?: RegExp[];
}

const RULES: Rule[] = [
  {
    type: "today_priorities",
    test: /\b(focus on|priorit(?:y|ies|ise|ize)|what should i (?:do|work on))\b/i,
  },
  {
    type: "application_progress",
    test: /\bapplications?\b.*\b(progress|status|going|stand)\b|\b(progress|status)\b.*\bapplications?\b|^show (?:me )?my applications?\b/i,
  },
  {
    type: "career_headline",
    test: /\b(linkedin|headline)\b.*\b(improve|update|fix|rewrite|write|better)\b|\b(improve|update|fix|rewrite|write|better)\b.*\b(linkedin|headline)\b/i,
  },
  {
    type: "missing_skills",
    test: /\bskills?\b.*\b(missing|lack|need|gap|don'?t have)\b|\bwhat\b.*\bskills?\b.*\b(should i|do i need)\b/i,
  },
  {
    type: "applications_attention",
    test: /\bapplications?\b.*\b(need|needs|require|requires)\b.*\battention\b|\bneeds?\s+(my\s+)?attention\b|\bwhat\b.*\b(follow.?up|act on)\b/i,
  },
  {
    type: "create_schedule",
    test: /\b(every day|daily|every week|weekly|every month|monthly|schedule|automatically|recurring|keep searching|keep looking)\b/i,
    strip: [
      /\b(every day|daily|every week|weekly|every month|monthly|schedule(?:\s+a)?|set up a schedule for|automatically|recurring|keep (?:searching|looking) for)\b/gi,
      /^(?:search|look)\s+for\s+|^find\s+/i,
    ],
  },
  {
    type: "change_preferences",
    test: /\b(change|update|edit|adjust)\b.*\b(preferences?|locations?|salary|pay|work mode|industr(?:y|ies)|seniority)\b/i,
  },
  {
    type: "find_opportunities",
    test: /^(?:search again|run (?:the |my )?search again|new search|find me|find (?:new |more )?(?:jobs|roles|opportunities)|look for|search for)\b/i,
    strip: [/^(?:search again|run (?:the |my )?search again|new search|find me(?: (?:new|more))?|find (?:new |more )?(?:jobs|roles|opportunities)|look for|search for)\b\s*(?:with|for|in|as|:)?\s*/i],
  },
  {
    type: "explain_why_not_shown",
    test: /\bwhy\b.*\b(isn'?t|is not|can'?t|cannot|wasn'?t|didn'?t|did not|don'?t|not)\b.*\b(show(?:ing|n)?|see|find|filtered|hidden)\b/i,
    strip: [/^why\s+(?:isn'?t|is not|can'?t|cannot|wasn'?t|didn'?t|did not|don'?t|not)\s+(?:i\s+|you\s+|wonder\s+)?(?:see|find|show(?:ing)?)?\s*(?:me\s+)?/i, /(?:\s+(?:show(?:ing)?|shown|filtered|hidden))?(?:\s+(?:to\s+)?me)?\s*\??$/i],
  },
  {
    type: "explain_job",
    test: /^explain\b|\bwhy\b.*\b(good|strong|great|recommended|surfaced|suggested)\b|\bwhy (?:does|did|is|was)\b.*\b(match|fit)\b/i,
    strip: [/^(?:explain|why (?:is|was|does|did))\s+/i, /\s+(?:(?:a|such a)\s+)?(?:good|strong|great)?\s*(?:match|fit|recommended|surfaced|suggested)(?:\s+for me)?\??$/i, /\?$/],
  },
  {
    type: "prepare_strongest",
    test: /\b(prepare|draft|start)\b.*\b(strongest|top|best)\b/i,
  },
  {
    type: "prepare_application",
    test: /\b(prepare|start|draft|begin)\b.*\b(application|resume|cover letter)\b/i,
    strip: [/\b(?:prepare|start|draft|begin)\b.*?\b(?:an?\s+)?(?:application|resume|cover letter)\b\s*(?:for|at)?\s*/i],
  },
];

export function parseWonderIntent(raw: string): WonderIntent {
  const q = raw.trim();
  if (!q) return { type: "search_jobs", subject: "" };
  for (const rule of RULES) {
    if (!rule.test.test(q)) continue;
    let subject = q;
    for (const strip of rule.strip ?? []) subject = subject.replace(strip, "");
    return { type: rule.type, subject: subject.trim() };
  }
  return { type: "search_jobs", subject: q };
}
