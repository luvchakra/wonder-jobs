/**
 * Reading the candidate's career history out of their résumé text — contact details, work history,
 * education and certifications — by fixed, explainable rules.
 *
 * Like `parseResume`, nothing here writes anywhere: it returns a proposal (`HistoryDraft`) with the
 * résumé line each entry came from, which the candidate reviews entry by entry. Every value is copied
 * from the résumé, never composed; when a role's title or employer can't be told apart it is left out
 * rather than guessed. Résumé text is data: nothing in it changes what this code does.
 */
import { validContact, type HistoryDraft, type ImportedCertification, type ImportedEducation, type ImportedExperience } from "@/domain/career/historyImport";
import { KNOWN_LOCATIONS } from "./parseResume";

type Section = "summary" | "experience" | "education" | "certifications" | "other";

const HEADINGS: [Section, RegExp][] = [
  ["summary", /^(professional |career |executive )?(summary|profile|objective)$|^about( me)?$|^career objective$/],
  ["experience", /^(work |professional |relevant |employment |career )?(experience|history)$|^employment$|^work history$|^experience & achievements$/],
  ["education", /^(education|academic background|academics|qualifications|education (and|&) training|academic qualifications)$/],
  ["certifications", /^(certifications?|licen[cs]es?|certifications? (and|&) licen[cs]es?|licen[cs]es? (and|&) certifications?|courses|courses (and|&) certifications|training (and|&) certifications)$/],
  ["other", /^(skills|technical skills|key skills|core skills|core competencies|competencies|projects|key projects|achievements|awards|honou?rs|publications|languages|interests|hobbies|volunteer(ing)?|references|tools|technologies|contact|personal details|declaration)$/],
];

function sectionOf(line: string): Section | null {
  if (line.length > 48) return null;
  const t = line
    .replace(/[:\-–—_=*#|]+\s*$/g, "")
    .replace(/^[#*\s]+/, "")
    .trim()
    .toLowerCase();
  if (!t || t.split(" ").length > 5) return null;
  for (const [section, re] of HEADINGS) if (re.test(t)) return section;
  return null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE = `(?:${MONTH}\\.?,?\\s+(?:19|20)\\d\\d|(?:0?[1-9]|1[0-2])[/.](?:19|20)\\d\\d|(?:19|20)\\d\\d)`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|until)\\s*(${DATE}|present|current|now|till date|to date|ongoing)`, "i");
const SINGLE_YEAR = /\b((?:19|20)\d\d)\b/;

/** "Jan 2021" → "2021-01", "03/2020" → "2020-03", "2019" → "2019". */
export function toMonth(v: string): string | undefined {
  const t = v.trim().toLowerCase();
  const named = t.match(new RegExp(`^(${MONTH})\\.?,?\\s+((?:19|20)\\d\\d)$`, "i"));
  if (named) return `${named[2]}-${String(MONTHS[named[1].slice(0, named[1].startsWith("sept") ? 4 : 3)]).padStart(2, "0")}`;
  const numeric = t.match(/^(0?[1-9]|1[0-2])[/.]((?:19|20)\d\d)$/);
  if (numeric) return `${numeric[2]}-${numeric[1].padStart(2, "0")}`;
  const year = t.match(/^((?:19|20)\d\d)$/);
  return year ? year[1] : undefined;
}

const BULLET = /^[-–—•·▪●◦*>✓✔➢➤]\s*/;
const TITLE_WORDS = /\b(engineer|developer|manager|director|architect|analyst|designer|consultant|specialist|lead|head|scientist|administrator|officer|president|vp|founder|co-founder|owner|strategist|marketer|recruiter|accountant|auditor|advisor|coach|producer|editor|writer|intern|associate|executive|assistant|coordinator|partner|principal|programmer|researcher|technician|teacher|professor|lecturer|nurse|physician|product owner|scrum master|cto|ceo|cfo|coo|cmo)\b/i;
const INSTITUTION = /\b(university|universit[äé]|college|institute|school|academy|polytechnic|iit|iim|nit|bits|iiit|iisc|xlri|isb|mit|stanford|harvard|oxford|cambridge)\b/i;
const DEGREE = /\b(ph\.?\s?d|doctorate|m\.?\s?b\.?\s?a|pgdm|pgp|m\.?\s?tech|m\.?\s?e\b|m\.?\s?sc|m\.?\s?s\b|m\.?\s?a\b|m\.?\s?com|m\.?\s?c\.?\s?a|master(?:'s|s)?(?: of [a-z ]+)?|b\.?\s?tech|b\.?\s?e\b|b\.?\s?sc|b\.?\s?s\b|b\.?\s?a\b|b\.?\s?com|b\.?\s?b\.?\s?a|b\.?\s?c\.?\s?a|bachelor(?:'s|s)?(?: of [a-z ]+)?|diploma|associate degree|high school|higher secondary|hsc|ssc|12th|10th)\b/i;
const SEPARATORS = /\s+[|•·]\s+|\s+[—–-]\s+|\s*,\s+|\s+at\s+|\s+@\s+/i;

const isLocation = (t: string) => /^remote$/i.test(t) || KNOWN_LOCATIONS.some((c) => new RegExp(`^${c}\\b`, "i").test(t)) || /^[A-Z][a-z]+,\s*[A-Z][a-z]+$/.test(t);
const clean = (t: string) =>
  t
    .replace(BULLET, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,|–—-]+|[\s,|–—:-]+$/g, "")
    .trim();
const looksLikeHeader = (line: string) => !BULLET.test(line) && !/[.;]$/.test(line) && line.split(" ").length <= 12 && line.length <= 110;

export function parseHistory(text: string): HistoryDraft {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const sections: Record<Section, string[]> = { summary: [], experience: [], education: [], certifications: [], other: [] };
  let current: Section | null = null;
  const head: string[] = [];
  for (const line of lines) {
    const s = sectionOf(line);
    if (s) {
      current = s;
      continue;
    }
    if (current) sections[current].push(line);
    else head.push(line);
  }
  const draft: HistoryDraft = { contact: contactOf(head.length ? head : lines.slice(0, 12), text), experience: [], education: [], certifications: [] };
  const summary = sections.summary.join(" ").trim();
  if (summary.length >= 40) draft.summary = { value: summary.slice(0, 1200), from: summary.slice(0, 120) };
  draft.experience = experienceOf(sections.experience);
  draft.education = educationOf(sections.education);
  draft.certifications = certificationsOf(sections.certifications);
  return draft;
}

function contactOf(head: string[], text: string): HistoryDraft["contact"] {
  const out: HistoryDraft["contact"] = {};
  const put = (field: keyof HistoryDraft["contact"], raw: string | undefined, from: string) => {
    const v = raw && validContact(field, raw);
    if (v && !out[field]) out[field] = { value: v, from };
  };
  const email = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  if (email) put("email", email[0], email[0]);
  const headText = head.join(" · ");
  const phone = headText.match(/(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,5}\)[\s-]?)?\d[\d\s-]{6,14}\d/);
  if (phone && (phone[0].match(/\d/g) ?? []).length >= 10) put("phone", phone[0].trim(), phone[0].trim());
  const linkedin = text.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[\w%-]+\/?/i);
  if (linkedin) put("linkedinUrl", linkedin[0], linkedin[0]);
  const github = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+\/?/i);
  if (github) put("portfolioUrl", github[0], github[0]);
  for (const m of headText.matchAll(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|io|dev|me|net|org|co|ai|app|site)(?:\/[\w./%-]*)?/gi)) {
    if (/linkedin\.com|github\.com|@/.test(m[0]) || email?.[0].includes(m[0])) continue;
    put("websiteUrl", m[0], m[0]);
  }
  for (const part of head.flatMap((l) => l.split(/\s*[|•·]\s*/))) {
    const p = part.trim();
    if (p.length > 60 || /@|\d{5,}|https?:|\.com/.test(p)) continue;
    if (KNOWN_LOCATIONS.some((c) => new RegExp(`\\b${c}\\b`, "i").test(p))) {
      put("location", p, p);
      break;
    }
  }
  return out;
}

function experienceOf(section: string[]): ImportedExperience[] {
  const anchors = section.map((l, i) => (RANGE.test(l) ? i : -1)).filter((i) => i >= 0);
  const out: ImportedExperience[] = [];
  const starts: number[] = [];
  for (let a = 0; a < anchors.length; a++) {
    const i = anchors[a];
    const floor = a > 0 ? anchors[a - 1] + 1 : 0;
    let start = i;
    while (start - 1 >= floor && i - (start - 1) <= 2 && looksLikeHeader(section[start - 1])) start--;
    starts.push(start);
  }
  for (let a = 0; a < anchors.length; a++) {
    const i = anchors[a];
    const end = a + 1 < anchors.length ? starts[a + 1] : section.length;
    const range = section[i].match(RANGE)!;
    const startDate = toMonth(range[1]);
    if (!startDate) continue;
    const isCurrent = /present|current|now|till date|to date|ongoing/i.test(range[2]);
    const endDate = isCurrent ? undefined : toMonth(range[2]);
    const anchorRest = clean(section[i].replace(range[0], " ").replace(/\(\s*\)/g, ""));
    const headerLines = [...section.slice(starts[a], i), anchorRest].filter(Boolean);
    let bodyFrom = i + 1;
    let tokens = headerLines.flatMap((l) => l.split(SEPARATORS)).map((t) => clean(t.replace(/\s*\([^)]*\)\s*$/, ""))).filter(Boolean);
    // "Senior PM — Jan 2021 – Present" then "PayCircle, Bengaluru": the employer is on the next line.
    if (tokens.filter((t) => !isLocation(t)).length < 2 && bodyFrom < end && looksLikeHeader(section[bodyFrom])) {
      tokens = [...tokens, ...section[bodyFrom].split(SEPARATORS).map((t) => clean(t.replace(/\s*\([^)]*\)\s*$/, ""))).filter(Boolean)];
      bodyFrom++;
    }
    const location = tokens.find(isLocation);
    const rest = tokens.filter((t) => t !== location && !SINGLE_YEAR.test(t));
    const title = rest.find((t) => TITLE_WORDS.test(t));
    const employer = rest.find((t) => t !== title);
    if (!title || !employer || title.length > 100 || employer.length > 100) continue;
    out.push({ employer, title, location, startDate, endDate, current: isCurrent || undefined, bullets: bulletsOf(section.slice(bodyFrom, end)), from: [...section.slice(starts[a], i + 1)].join(" / ").slice(0, 200), by: "rules" });
  }
  return out;
}

function bulletsOf(body: string[]): string[] {
  // Joined as written (a wrapped line keeps its punctuation), then trimmed once at the ends.
  const out: string[] = [];
  for (const line of body) {
    if (BULLET.test(line)) out.push(line.replace(BULLET, ""));
    else if (out.length && /^[a-z(]/.test(line)) out[out.length - 1] = `${out[out.length - 1]} ${line}`;
    else if (line.length > 40 || /\.$/.test(line)) out.push(line);
  }
  return out
    .map((b) => clean(b).replace(/[\s;,]+$/, "").slice(0, 400))
    .filter((b) => b.length >= 3)
    .slice(0, 12);
}

function educationOf(section: string[]): ImportedEducation[] {
  const out: ImportedEducation[] = [];
  let cur: { institution?: string; degree?: string; field?: string; years: string[]; from: string[] } | null = null;
  const flush = () => {
    if (cur?.institution) {
      const [startDate, endDate] = cur.years.length >= 2 ? [cur.years[0], cur.years[cur.years.length - 1]] : [undefined, cur.years[0]];
      out.push({ institution: cur.institution, degree: cur.degree, field: cur.field, startDate, endDate, from: cur.from.join(" / ").slice(0, 200), by: "rules" });
    }
    cur = null;
  };
  for (const raw of section) {
    const line = clean(raw);
    if (!line || line.length > 160) continue;
    const parts = line.split(SEPARATORS).map(clean).filter(Boolean);
    const inst = parts.find((p) => INSTITUTION.test(p) && !DEGREE.test(p.replace(INSTITUTION, "")));
    const deg = parts.find((p) => DEGREE.test(p) && p !== inst);
    if (!inst && !deg && !SINGLE_YEAR.test(line)) continue;
    if (inst && cur?.institution) flush();
    if (deg && cur?.degree && !inst) flush();
    cur ??= { years: [], from: [] };
    cur.from.push(line);
    if (inst) cur.institution = inst.replace(/\s*\([^)]*\)\s*$/, "");
    if (deg) {
      const m = deg.match(/^(.*?)\s+(?:in|of)\s+(.+)$/i);
      const degreeOnly = m && DEGREE.test(m[1]) ? m : null;
      cur.degree = degreeOnly ? degreeOnly[1].trim() : deg;
      if (degreeOnly) cur.field = degreeOnly[2].trim();
      else {
        const field = parts.find((p) => p !== inst && p !== deg && !SINGLE_YEAR.test(p) && !isLocation(p) && !/^(gpa|cgpa|grade|percentage)\b/i.test(p));
        if (field && field.length <= 80) cur.field = field;
      }
    }
    const range = line.match(RANGE);
    if (range) {
      const a = toMonth(range[1]);
      const b = /present|current|now/i.test(range[2]) ? undefined : toMonth(range[2]);
      cur.years = [a, b].filter((x): x is string => !!x);
    } else {
      const y = line.match(SINGLE_YEAR);
      if (y && !cur.years.length) cur.years = [y[1]];
    }
  }
  flush();
  return out.slice(0, 10);
}

function certificationsOf(section: string[]): ImportedCertification[] {
  const out: ImportedCertification[] = [];
  for (const raw of section) {
    const line = clean(raw);
    if (line.length < 3 || line.length > 150) continue;
    // Not split on an en dash or hyphen: those sit inside names ("Solutions Architect – Associate").
    const parts = line.split(/\s+[|•·]\s+|\s+—\s+|\s*,\s+|\s+by\s+/i).map(clean).filter(Boolean);
    const name = parts[0];
    if (!name || SINGLE_YEAR.test(name) && name.length <= 8) continue;
    const dated = line.match(new RegExp(DATE, "i"));
    const issuer = parts.slice(1).find((p) => !new RegExp(`^${DATE}$`, "i").test(p) && !/^(issued|expires|credential)/i.test(p));
    out.push({ name, issuer, issueDate: dated ? toMonth(dated[0]) : undefined, from: line.slice(0, 200), by: "rules" });
  }
  return out.slice(0, 20);
}
