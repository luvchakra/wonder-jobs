import type { HistoryDraft } from "@/domain/career/historyImport";

/**
 * WonderJobs ATS readiness — how well an applicant-tracking system can read a résumé and find what
 * recruiters search for. There is no published standard (each ATS parses differently and none shares a
 * score), so this is WonderJobs' own check, and every point is explainable: a fixed list of rules, each
 * with its weight, the résumé text it's about and how to fix it. Deterministic: code decides the score,
 * never a model. `ATS_RULES_VERSION` changes whenever a rule or weight does, so scores stay comparable.
 */
export const ATS_RULES_VERSION = "ats-2026.10.1";

export type AtsCategory = "parse" | "structure" | "content" | "hygiene";
export const ATS_CATEGORY_LABEL: Record<AtsCategory, string> = {
  parse: "Can an ATS read it?",
  structure: "Can it find your sections?",
  content: "Does the content work?",
  hygiene: "File hygiene",
};

export type AtsStatus = "pass" | "warn" | "fail" | "na";
export type AtsSeverity = "fix_first" | "improve" | "tip";

export interface AtsFinding {
  id: string;
  category: AtsCategory;
  title: string;
  status: AtsStatus;
  severity: AtsSeverity;
  earned: number;
  possible: number;
  /** What was found, in plain words. */
  detail: string;
  /** The résumé's own text this is about (a few examples). */
  evidence?: string[];
  /** How to fix it: in the Career Profile, in the ATS-ready builder, or in the file itself. */
  fix?: { where: "profile" | "builder" | "file"; text: string };
}

export interface AtsReport {
  rulesVersion: string;
  score: number;
  findings: AtsFinding[];
  categories: { key: AtsCategory; label: string; earned: number; possible: number }[];
  /** The file the score is for, so a stale report can be told apart. */
  file: { name?: string; format: "pdf" | "docx" | "text"; pages: number | null; sha256?: string };
  checkedAt: string;
}

export interface AtsFileSignals {
  format: "pdf" | "docx" | "text";
  pageCount: number | null;
  imageCount: number;
  multiColumn: boolean | null;
  fontsWithoutUnicode: number;
  links: string[];
  docx?: { tables: number; textBoxes: number; columns: number; headerFooterText: string };
}

export interface AtsInput {
  file: { name?: string; sha256?: string; signals: AtsFileSignals };
  text: string;
  readable: boolean;
  /** From the profile reader: the candidate's name, stated/derived years, and skills it recognised. */
  profile: { name?: string; yearsExperience?: number; skills: string[] };
  history: HistoryDraft;
  outline: { headings: { kind: string; text: string }[]; unreadRoles: string[]; unknownHeadings: string[]; intro?: string };
  now?: Date;
}

/* ----------------------------------------------------------------- lexicon */

const ACTION_VERBS = new Set(
  "accelerated achieved acquired administered advised aligned analysed analyzed architected arranged assessed audited automated balanced boosted briefed budgeted built captured centralised centralized chaired championed clarified coached collaborated combined completed composed conceived conducted consolidated constructed consulted contributed controlled converted coordinated created cultivated cut debugged decreased defined delivered deployed designed determined developed devised diagnosed directed discovered doubled drafted drove earned eliminated enabled engineered enhanced established evaluated exceeded executed expanded expedited facilitated finalised finalized forecast forecasted formulated founded generated grew guided halved headed identified implemented improved increased influenced initiated innovated inspected installed instituted integrated introduced invented investigated launched led leveraged maintained managed mapped marketed maximised maximized measured mentored merged migrated minimised minimized modelled modeled modernised modernized monitored motivated negotiated onboarded operated optimised optimized orchestrated organised organized originated outperformed overhauled oversaw owned partnered performed piloted pioneered planned prepared presented prioritised prioritized processed produced programmed promoted proposed prototyped published raised ran rebuilt recommended reconciled recruited redesigned reduced refactored refined regulated remodelled renegotiated reorganised reorganized replaced reported represented researched resolved restructured revamped reviewed revitalised revitalized saved scaled scheduled secured selected served set shaped shipped simplified sold solved spearheaded standardised standardized steered streamlined strengthened structured supervised supported surpassed synthesised synthesized taught tested trained transformed translated tripled troubleshot turned unified upgraded validated won wrote"
    .split(" "),
);
/** Present-tense forms for current roles ("Lead", "Own", "Drive"). */
const PRESENT = /^(lead|own|drive|manage|build|run|design|develop|deliver|oversee|direct|head|set|shape|define|partner|coach|mentor|scale|grow|launch|ship|architect|steer|champion|establish|implement|create|support|coordinate|plan|maintain|monitor|deploy|automate|optimi[sz]e|negotiate|present|write|review|advise|govern|sets|drives|owns|leads|manages|builds|runs|designs|develops|delivers|oversees|directs|heads|shapes|defines|partners|coaches|mentors|scales|grows|launches|ships|architects|steers|champions|establishes|implements|creates|supports|coordinates|plans|maintains|monitors|deploys|automates|negotiates|presents|writes|reviews|advises|governs)$/i;
const WEAK_OPENER = /^(responsible for|worked on|helped|assisted|duties (included|include)|involved in|tasked with|participated in|was part of|in charge of)\b/i;
const NUMBER = /\d|%|₹|\$|€|£/;
const PRONOUN = /\b(I|me|my|myself)\b/;
const PLACEHOLDER = /\[(your|add|insert)[^\]]*\]|lorem ipsum|\bXX+\b|\bTBD\b|<[a-z ]+>/i;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,5}\)[\s-]?)?\d[\d\s-]{6,14}\d/;

/* ------------------------------------------------------------------ helpers */

type Rule = Omit<AtsFinding, "earned" | "severity"> & { severity?: AtsSeverity };
const pick = <T,>(list: T[], n = 3) => list.slice(0, n);
const short = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function earned(status: AtsStatus, possible: number): number {
  return status === "pass" ? possible : status === "warn" ? possible / 2 : 0;
}

function severityOf(r: Rule): AtsSeverity {
  if (r.severity) return r.severity;
  if (r.status === "fail" && (r.category === "parse" || r.category === "structure")) return "fix_first";
  if (r.status === "fail" || r.status === "warn") return r.category === "hygiene" ? "tip" : "improve";
  return "tip";
}

const firstWord = (b: string) => b.replace(/^[^A-Za-z]+/, "").split(/[\s,;:]/)[0] ?? "";
const startsWithVerb = (b: string) => {
  const w = firstWord(b).toLowerCase();
  if (ACTION_VERBS.has(w) || PRESENT.test(w) || (/ed$/.test(w) && w.length > 4)) return true;
  // Present tense of a listed verb: "integrates" → "integrated", "leads" → "led" is already listed.
  const stem = w.replace(/(es|s)$/, "");
  return w !== stem && [`${stem}d`, `${stem}ed`, `${w.replace(/s$/, "")}d`].some((v) => ACTION_VERBS.has(v));
};

/* -------------------------------------------------------------------- check */

export function checkAts(input: AtsInput): AtsReport {
  const { signals } = input.file;
  const rules: Rule[] = [];
  const text = input.text;
  const roles = input.history.experience;
  const bullets = roles.flatMap((r) => r.bullets);
  const headingKinds = new Set(input.outline.headings.map((h) => h.kind));

  /* Can an ATS read it? (40) */
  rules.push(
    input.readable
      ? { id: "text_layer", category: "parse", title: "Real, selectable text", status: "pass", possible: 12, detail: `Wonder read ${text.split(/\s+/).length.toLocaleString("en")} words of text from this file.` }
      : { id: "text_layer", category: "parse", title: "Real, selectable text", status: "fail", possible: 12, detail: "Almost no text could be read — the résumé is probably a scan or a picture. An ATS sees it as blank.", fix: { where: "builder", text: "Create an ATS-ready version from your Career Profile, or export your résumé again as a text PDF or Word file." } },
  );
  if (!input.readable) return finish(input, rules, true);

  const odd = (text.match(/[-�]/g) ?? []).length;
  const oddShare = odd / Math.max(1, text.length);
  rules.push(
    signals.fontsWithoutUnicode > 0 || oddShare > 0.02
      ? { id: "glyphs", category: "parse", title: "Characters read correctly", status: "fail", possible: 8, detail: signals.fontsWithoutUnicode ? `${signals.fontsWithoutUnicode} font${signals.fontsWithoutUnicode === 1 ? "" : "s"} in this PDF can't be turned back into text, so parts of it read as gibberish.` : `${odd} characters couldn't be read.`, fix: { where: "builder", text: "Export it again with standard fonts, or create an ATS-ready version." } }
      : oddShare > 0.002
        ? { id: "glyphs", category: "parse", title: "Characters read correctly", status: "warn", possible: 8, detail: `${odd} characters couldn't be read (symbols or icon fonts).`, fix: { where: "file", text: "Replace icon symbols with plain words, e.g. “Email:” instead of an envelope icon." } }
        : { id: "glyphs", category: "parse", title: "Characters read correctly", status: "pass", possible: 8, detail: "Every character maps back to real text." },
  );
  rules.push(
    signals.multiColumn === null
      ? { id: "columns", category: "parse", title: "One column, top to bottom", status: "na", possible: 10, detail: "Plain text has no layout to check." }
      : signals.multiColumn
        ? { id: "columns", category: "parse", title: "One column, top to bottom", status: "fail", possible: 10, detail: signals.format === "docx" ? `This document is set in ${signals.docx?.columns ?? 2} columns.` : "Text sits side by side in columns (or a grid). Many ATS read straight across the page and mix the columns together.", fix: { where: "builder", text: "Use a single-column layout — the ATS-ready version is one column." } }
        : { id: "columns", category: "parse", title: "One column, top to bottom", status: "pass", possible: 10, detail: "Text reads in one column, top to bottom." },
  );
  const tables = signals.docx ? signals.docx.tables + signals.docx.textBoxes : 0;
  rules.push(
    !signals.docx
      ? { id: "tables", category: "parse", title: "No tables or text boxes", status: "na", possible: 5, detail: "Checked for Word documents." }
      : tables
        ? { id: "tables", category: "parse", title: "No tables or text boxes", status: signals.docx.textBoxes ? "fail" : "warn", possible: 5, detail: [signals.docx.tables ? `${signals.docx.tables} table${signals.docx.tables === 1 ? "" : "s"}` : "", signals.docx.textBoxes ? `${signals.docx.textBoxes} text box${signals.docx.textBoxes === 1 ? "" : "es"}` : ""].filter(Boolean).join(" and ") + " found. Text boxes are often skipped entirely; tables can be read out of order.", fix: { where: "file", text: "Move that text into normal paragraphs." } }
        : { id: "tables", category: "parse", title: "No tables or text boxes", status: "pass", possible: 5, detail: "No tables or text boxes." },
  );
  const hf = signals.docx?.headerFooterText ?? "";
  const contactOnlyInHeader = (EMAIL.test(hf) && !EMAIL.test(text)) || (PHONE.test(hf) && !PHONE.test(text));
  rules.push(
    !signals.docx
      ? { id: "header_footer", category: "parse", title: "Contact details in the body", status: "na", possible: 5, detail: "Checked for Word documents." }
      : contactOnlyInHeader
        ? { id: "header_footer", category: "parse", title: "Contact details in the body", status: "fail", possible: 5, detail: "Your email or phone is only in the page header or footer, which many ATS ignore.", evidence: [short(hf)], fix: { where: "file", text: "Put your contact details at the top of the page itself." } }
        : { id: "header_footer", category: "parse", title: "Contact details in the body", status: "pass", possible: 5, detail: hf ? "The header/footer doesn't hold anything the body lacks." : "Nothing important is in the page header or footer." },
  );

  /* Can it find your sections? (25) */
  const missing = [["experience", "Experience"], ["education", "Education"], ["skills", "Skills"]].filter(([k]) => !headingKinds.has(k)).map(([, l]) => l);
  rules.push(
    !missing.length
      ? { id: "headings", category: "structure", title: "Standard section headings", status: input.outline.unknownHeadings.length ? "warn" : "pass", possible: 8, detail: input.outline.unknownHeadings.length ? `Found Experience, Education and Skills; these headings aren't standard and may not be recognised: ${pick(input.outline.unknownHeadings).join(", ")}.` : `Found: ${input.outline.headings.map((h) => h.text).join(", ")}.`, fix: input.outline.unknownHeadings.length ? { where: "file", text: "Rename them to common headings (e.g. “Projects”, “Awards”)." } : undefined }
      : { id: "headings", category: "structure", title: "Standard section headings", status: missing.includes("Experience") ? "fail" : "warn", possible: 8, detail: `No ${missing.join(", ")} heading found. An ATS uses headings to file each part of your résumé.`, fix: { where: "builder", text: "Use standard headings — the ATS-ready version always does." } },
  );
  const c = input.history.contact;
  const contactParts: [boolean, string, number][] = [[!!c.email, "email", 3], [!!c.phone, "phone", 2], [!!c.location, "location", 1], [!!c.linkedinUrl, "LinkedIn", 1]];
  const contactMissing = contactParts.filter(([ok]) => !ok).map(([, l]) => l);
  const contactScore = contactParts.reduce((n, [ok, , w]) => n + (ok ? w : 0), 0);
  // A LinkedIn link hidden behind the word "LinkedIn" is invisible to an ATS that reads text only.
  const hiddenLinkedIn = !c.linkedinUrl && input.file.signals.links.some((u) => /linkedin\.com\/in\//i.test(u));
  rules.push({
    id: "contact",
    category: "structure",
    title: "Contact details",
    status: contactScore === 7 ? "pass" : c.email && c.phone ? "warn" : "fail",
    possible: 7,
    detail: contactMissing.length ? `Couldn't find your ${contactMissing.join(", ")}${hiddenLinkedIn ? " as text — your LinkedIn address is only behind a link, which many ATS don't read" : ""}.` : "Email, phone, location and LinkedIn all found.",
    fix: contactMissing.length ? { where: "profile", text: hiddenLinkedIn ? "Write your LinkedIn address out in full (linkedin.com/in/…), not just the word “LinkedIn”." : `Add your ${contactMissing.join(", ")} to the top of your résumé.` } : undefined,
  });
  rules.push(
    !roles.length
      ? { id: "roles", category: "structure", title: "Every role has a title, employer and dates", status: "fail", possible: 6, detail: input.outline.unreadRoles.length ? "Your roles couldn't be read." : "No roles with dates were found.", evidence: pick(input.outline.unreadRoles), fix: { where: "file", text: "Write each role as “Title, Employer — Month Year – Month Year” on its own line." } }
      : input.outline.unreadRoles.length
        ? { id: "roles", category: "structure", title: "Every role has a title, employer and dates", status: "warn", possible: 6, detail: `${roles.length} role${roles.length === 1 ? "" : "s"} read; ${input.outline.unreadRoles.length} couldn't be split into title and employer.`, evidence: pick(input.outline.unreadRoles), fix: { where: "file", text: "Put the job title and employer on the same line, separated by a comma or dash." } }
        : { id: "roles", category: "structure", title: "Every role has a title, employer and dates", status: "pass", possible: 6, detail: `${roles.length} role${roles.length === 1 ? "" : "s"} read, each with a title, employer and dates.` },
  );
  const order = roles.map((r) => (r.current ? "9999" : r.startDate));
  const reversed = order.every((v, i) => i === 0 || order[i - 1] >= v);
  rules.push(roles.length < 2 ? { id: "order", category: "structure", title: "Most recent role first", status: "na", possible: 2, detail: "Needs two or more roles." } : reversed ? { id: "order", category: "structure", title: "Most recent role first", status: "pass", possible: 2, detail: "Roles run from newest to oldest." } : { id: "order", category: "structure", title: "Most recent role first", status: "warn", possible: 2, detail: "Roles aren't listed newest first, which is what ATS and recruiters expect.", fix: { where: "builder", text: "List roles newest first." } });
  const withMonth = roles.filter((r) => r.startDate.length > 4).length;
  rules.push(roles.length < 2 ? { id: "dates", category: "structure", title: "Consistent dates", status: "na", possible: 2, detail: "Needs two or more roles." } : withMonth === 0 || withMonth === roles.length ? { id: "dates", category: "structure", title: "Consistent dates", status: "pass", possible: 2, detail: withMonth ? "Every role gives month and year." : "Every role gives the year." } : { id: "dates", category: "structure", title: "Consistent dates", status: "warn", possible: 2, detail: "Some roles give a month and some only a year.", evidence: pick(roles.filter((r) => r.startDate.length === 4).map((r) => `${r.title} · ${r.employer}`)), fix: { where: "profile", text: "Give month and year for every role." } });

  /* Does the content work? (25) */
  const recent = roles.slice(0, 3);
  const thin = recent.filter((r) => r.bullets.length < 3);
  rules.push(!recent.length ? { id: "bullets", category: "content", title: "3–6 achievements for recent roles", status: "na", possible: 5, detail: "No roles found." } : !thin.length ? { id: "bullets", category: "content", title: "3–6 achievements for recent roles", status: "pass", possible: 5, detail: "Each recent role lists at least three achievements." } : { id: "bullets", category: "content", title: "3–6 achievements for recent roles", status: thin.some((r) => r.bullets.length === 0) ? "fail" : "warn", possible: 5, detail: `${thin.length} recent role${thin.length === 1 ? " has" : "s have"} fewer than three achievements.`, evidence: thin.map((r) => `${r.title} · ${r.employer}: ${r.bullets.length}`), fix: { where: "builder", text: "Add what you achieved in each recent role — the builder asks you, one role at a time." } });
  const numbered = bullets.filter((b) => NUMBER.test(b));
  const share = bullets.length ? numbered.length / bullets.length : 0;
  rules.push(!bullets.length ? { id: "numbers", category: "content", title: "Results with numbers", status: "na", possible: 6, detail: "No achievement lines found." } : { id: "numbers", category: "content", title: "Results with numbers", status: share >= 0.4 ? "pass" : share >= 0.2 ? "warn" : "fail", possible: 6, detail: `${numbered.length} of ${bullets.length} achievements include a number (${Math.round(share * 100)}%). Aim for at least 40%.`, evidence: share >= 0.4 ? undefined : pick(bullets.filter((b) => !NUMBER.test(b)).map((b) => short(b))), fix: share >= 0.4 ? undefined : { where: "builder", text: "Add the real result where you know it — how much, how many, how fast. Wonder never adds a number for you." } });
  const verbed = bullets.filter(startsWithVerb);
  const weak = bullets.filter((b) => WEAK_OPENER.test(b.trim()));
  const vshare = bullets.length ? verbed.length / bullets.length : 0;
  rules.push(!bullets.length ? { id: "verbs", category: "content", title: "Achievements start with an action verb", status: "na", possible: 4, detail: "No achievement lines found." } : { id: "verbs", category: "content", title: "Achievements start with an action verb", status: vshare >= 0.7 && !weak.length ? "pass" : vshare >= 0.4 ? "warn" : "fail", possible: 4, detail: `${verbed.length} of ${bullets.length} start with an action verb${weak.length ? `; ${weak.length} start with phrases like “responsible for”` : ""}.`, evidence: pick([...weak, ...bullets.filter((b) => !startsWithVerb(b) && !weak.includes(b))].map((b) => short(b))), fix: vshare >= 0.7 && !weak.length ? undefined : { where: "builder", text: "Lead with what you did: “Led…”, “Built…”, “Reduced…”. The builder can suggest wording (you approve each one)." } });
  const long = bullets.filter((b) => b.length > 320);
  rules.push(!bullets.length ? { id: "length", category: "content", title: "Achievements fit in two lines", status: "na", possible: 3, detail: "No achievement lines found." } : long.length ? { id: "length", category: "content", title: "Achievements fit in two lines", status: long.length > 2 ? "fail" : "warn", possible: 3, detail: `${long.length} achievement${long.length === 1 ? " is" : "s are"} longer than about three lines.`, evidence: pick(long.map((b) => short(b, 80))), fix: { where: "builder", text: "Split or tighten long achievements." } } : { id: "length", category: "content", title: "Achievements fit in two lines", status: "pass", possible: 3, detail: "Achievements are a readable length." });
  const pron = bullets.filter((b) => PRONOUN.test(b));
  rules.push(!bullets.length ? { id: "pronouns", category: "content", title: "No “I” or “my”", status: "na", possible: 2, detail: "No achievement lines found." } : pron.length ? { id: "pronouns", category: "content", title: "No “I” or “my”", status: "warn", possible: 2, detail: `${pron.length} achievement${pron.length === 1 ? " uses" : "s use"} “I” or “my”.`, evidence: pick(pron.map((b) => short(b))), fix: { where: "builder", text: "Résumés drop the pronoun: “Led the team”, not “I led the team”." } } : { id: "pronouns", category: "content", title: "No “I” or “my”", status: "pass", possible: 2, detail: "Written without “I” or “my”." });
  const summary = input.history.summary?.value ?? "";
  rules.push(!summary ? { id: "summary", category: "content", title: "A short professional summary", status: "warn", possible: 2, detail: input.outline.intro ? "Your opening paragraph has no “Summary” heading, so an ATS may not file it as your summary." : "No summary section found. Two or three lines at the top help a recruiter — and keyword search — place you.", evidence: input.outline.intro ? [short(input.outline.intro)] : undefined, fix: { where: input.outline.intro ? "file" : "builder", text: input.outline.intro ? "Put a “Summary” heading above it." : "Add a summary in your own words." } } : summary.length > 900 ? { id: "summary", category: "content", title: "A short professional summary", status: "warn", possible: 2, detail: `Your summary is long (${summary.length} characters). Keep it to about 2–4 lines.`, fix: { where: "builder", text: "Trim the summary." } } : { id: "summary", category: "content", title: "A short professional summary", status: "pass", possible: 2, detail: "Summary found, and a good length." });
  const skills = input.profile.skills;
  rules.push(!headingKinds.has("skills") ? { id: "skills", category: "content", title: "A Skills section ATS can match", status: "fail", possible: 3, detail: `No Skills section found${skills.length ? `, though ${skills.length} recognised skills appear in the text` : ""}. Recruiters filter by skills.`, fix: { where: "builder", text: "Add a Skills section listing the skills you actually use." } } : skills.length >= 5 ? { id: "skills", category: "content", title: "A Skills section ATS can match", status: "pass", possible: 3, detail: `${skills.length} recognised skills, e.g. ${pick(skills, 5).join(", ")}.` } : { id: "skills", category: "content", title: "A Skills section ATS can match", status: "warn", possible: 3, detail: `Only ${skills.length} skill${skills.length === 1 ? " is" : "s are"} recognisable to job search. Use the common name for each skill (e.g. “Identity and Access Management”, “SQL”).`, fix: { where: "profile", text: "List your skills by their usual names." } });

  /* File hygiene (10) */
  const years = input.profile.yearsExperience ?? 0;
  const pages = signals.pageCount;
  const pageLimit = years >= 15 ? 3 : 2;
  rules.push(pages == null ? { id: "pages", category: "hygiene", title: "Length", status: "na", possible: 4, detail: "Page count unknown." } : pages <= pageLimit ? { id: "pages", category: "hygiene", title: "Length", status: "pass", possible: 4, detail: `${pages} page${pages === 1 ? "" : "s"}${years >= 15 ? ` — fine for ${years} years of experience` : ""}.` } : { id: "pages", category: "hygiene", title: "Length", status: pages > pageLimit + 1 ? "fail" : "warn", possible: 4, detail: `${pages} pages. Aim for ${pageLimit} or fewer${years >= 15 ? "" : " (3 is fine past 15 years)"}.`, fix: { where: "builder", text: "Keep the most recent 10–15 years in detail and summarise earlier roles." } });
  const fname = input.file.name ?? "";
  const nameTokens = (input.profile.name ?? "").toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const goodName = !fname || nameTokens.some((t) => fname.toLowerCase().includes(t));
  const copyMark = /\(\d+\)|copy|final|v\d\b|untitled|document\d*/i.test(fname);
  rules.push(!fname ? { id: "filename", category: "hygiene", title: "A clear file name", status: "na", possible: 2, detail: "No file name." } : goodName && !copyMark ? { id: "filename", category: "hygiene", title: "A clear file name", status: "pass", possible: 2, detail: `“${fname}” names you.` } : { id: "filename", category: "hygiene", title: "A clear file name", status: "warn", possible: 2, detail: `“${fname}” ${goodName ? "has a copy marker like “(1)” or “final”" : "doesn't include your name"}.`, fix: { where: "file", text: `Name it like “${(input.profile.name ?? "Firstname Lastname").replace(/\s+/g, "-")}-Resume.${signals.format === "docx" ? "docx" : "pdf"}”.` } });
  rules.push(signals.imageCount ? { id: "images", category: "hygiene", title: "No photos, logos or icon images", status: "warn", possible: 2, detail: `${signals.imageCount} image${signals.imageCount === 1 ? "" : "s"} found. An ATS ignores them, so anything they say (a logo's company name, an icon's meaning) is lost.`, fix: { where: "builder", text: "Keep information in text; the ATS-ready version uses no images." } } : { id: "images", category: "hygiene", title: "No photos, logos or icon images", status: "pass", possible: 2, detail: "No images." });
  const placeholder = text.split("\n").find((l) => PLACEHOLDER.test(l));
  const dupHeadings = input.outline.headings.map((h) => h.text.toLowerCase()).filter((h, i, a) => a.indexOf(h) !== i);
  rules.push(placeholder || dupHeadings.length ? { id: "leftovers", category: "hygiene", title: "No placeholders or repeated sections", status: "fail", possible: 2, detail: placeholder ? "Template placeholder text is still in the résumé." : `A section appears twice: ${dupHeadings[0]}.`, evidence: placeholder ? [short(placeholder)] : undefined, fix: { where: "file", text: placeholder ? "Replace or remove the placeholder." : "Merge the repeated sections." } } : { id: "leftovers", category: "hygiene", title: "No placeholders or repeated sections", status: "pass", possible: 2, detail: "No placeholder text or repeated sections." });

  return finish(input, rules, false);
}

function finish(input: AtsInput, rules: Rule[], unreadable: boolean): AtsReport {
  // Evidence and fixes are for what needs attention; a passing check only says what was found.
  const findings: AtsFinding[] = rules.map((r) => ({ ...r, ...(r.status === "pass" || r.status === "na" ? { evidence: undefined, fix: undefined } : {}), earned: r.status === "na" ? 0 : earned(r.status, r.possible), severity: severityOf(r) }));
  const scored = findings.filter((f) => f.status !== "na");
  const cats = (Object.keys(ATS_CATEGORY_LABEL) as AtsCategory[]).map((key) => {
    const fs = scored.filter((f) => f.category === key);
    return { key, label: ATS_CATEGORY_LABEL[key], earned: fs.reduce((n, f) => n + f.earned, 0), possible: fs.reduce((n, f) => n + f.possible, 0) };
  });
  const possible = scored.reduce((n, f) => n + f.possible, 0);
  // An unreadable file scores 0: nothing else can be checked, and an ATS reads nothing either.
  const score = unreadable ? 0 : Math.round((scored.reduce((n, f) => n + f.earned, 0) / Math.max(1, possible)) * 100);
  return { rulesVersion: ATS_RULES_VERSION, score, findings, categories: cats.filter((c) => c.possible > 0), file: { name: input.file.name, format: input.file.signals.format, pages: input.file.signals.pageCount, sha256: input.file.sha256 }, checkedAt: (input.now ?? new Date()).toISOString() };
}
