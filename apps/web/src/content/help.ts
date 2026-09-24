/**
 * The user guide and FAQ, as data. Rendered by /help, searched by the help
 * assistant, and kept in step with docs/PROGRESS.md — when a story ships or
 * a limitation changes, this file changes with it.
 */
export interface HelpSection {
  id: string;
  title: string;
  summary: string;
  /** Paragraphs and bullet lists (lines starting with "- "). */
  body: string[];
  keywords: string[];
}

export interface HelpFaq {
  q: string;
  a: string;
  section: string;
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    summary: "Create an account, finish onboarding, run your first search.",
    keywords: ["start", "signup", "sign up", "account", "onboarding", "first run", "begin", "register", "login", "sign in"],
    body: [
      "Create an account with your email and a password, a magic link, or Google. Confirm your email if the deployment asks you to, then finish onboarding: your career goal, preferred locations, a short profile (headline, level, years, skills, industries) and how much you want Wonder to do on its own.",
      "Everything you enter becomes your Career DNA. Wonder scores every real posting against it, so honest answers give better matches. You can refine it any time under Career DNA.",
      "From the dashboard, press Run Wonder. The run searches live job sources, removes duplicates, reads each posting, scores it against your DNA, checks hiring signals, ranks a shortlist, prepares materials for the top roles and pauses for your review.",
      "- Sign in: /sign-in · Create account: /sign-up · Forgot password: /forgot-password",
      "- Curious first? Open the demo from the avatar menu: sample data on your device only, no account needed.",
    ],
  },
  {
    id: "career-dna",
    title: "Career DNA",
    summary: "The profile Wonder matches against, and how each field is used.",
    keywords: ["career dna", "profile", "skills", "seniority", "level", "industries", "locations", "salary", "headline", "goal", "edit profile"],
    body: [
      "Career DNA is your name, headline, career goal, level and years of experience, skills (each rated 1–5), industries, preferred locations, minimum salary, strengths and growth areas.",
      "How matching uses it: skills are looked for in each posting's own text (with common inflections, so 'roadmap' counts for 'Roadmapping'); level compares the posting's inferred seniority with yours; industries compare with the posting's inferred industry; the career goal's key words are checked against the title; locations decide location fit, including whether a remote role is actually open to your region; minimum salary compares with disclosed pay.",
      "Filling it in from a resume: **Import from resume** on the Career DNA page (and during onboarding) reads a PDF, Word file or pasted text and suggests a headline, level, years, skills, industries and locations. Every suggestion shows the words it came from, you tick what to keep, and nothing changes until you apply it. Your career goal, salary and work modes are never guessed. The file is read and discarded — Wonder does not store it. A scanned or image-only PDF has no text in it, so Wonder says so and asks you to paste instead.",
      "- Include 'Remote' in locations to allow remote roles anywhere. A remote role restricted to another region can be worth a look but is never marked a strong opportunity.",
      "- Changing your DNA re-scores every job you have already discovered; you do not need to run again.",
    ],
  },
  {
    id: "runs",
    title: "Runs and the workflow",
    summary: "What each of the twelve stages does, and what you see while it works.",
    keywords: ["run", "workflow", "stages", "progress", "pause", "resume", "stop", "restart", "rerun", "logs", "evidence", "timeline", "waiting"],
    body: [
      "A run is one pass of the Wonder workflow. Its progress is real: counts, evidence and logs come from work actually done, never from a timer.",
      "- Understanding your profile — reads your Career DNA and records the inputs the run will use.",
      "- Searching job sources — asks each enabled source for postings that fit your goal and locations; evidence shows the count per source, 'Needs setup' for sources missing credentials, and 'Unavailable' if a source failed.",
      "- Removing duplicates — collapses the same role seen on several sources.",
      "- Understanding opportunities — reads each posting: skills, seniority, industry, work mode, salary, requirements.",
      "- Matching with your career goals — scores every posting against your DNA and explains each dimension.",
      "- Checking job quality — freshness, reposts, duplicates, where the application goes, salary transparency, source reliability.",
      "- Prioritizing opportunities — the shortlist above your minimum match; strong matches can be saved automatically if your policy allows.",
      "- Preparing application materials — resume, cover letter and screening answers for the top three (strong first, then the best of the shortlist).",
      "- Waiting for your review — the run pauses. Closing the app is fine: come back and press Continue.",
      "- External application — the hand-off (see Applications).",
      "- Tracking and Learning — tracker entries, reminders and an insight from this run.",
      "Controls: Pause, Resume, Stop (graceful: completed work is kept), Restart stage, Rerun from stage (a new run that inherits inputs and outputs; external actions are never repeated). Override any input on the run page; the run records that you provided it.",
    ],
  },
  {
    id: "sources",
    title: "Job sources",
    summary: "Where postings come from, and what each source can and cannot do.",
    keywords: ["sources", "linkedin", "indeed", "naukri", "glassdoor", "remotive", "jobicy", "remote ok", "himalayas", "arbeitnow", "adzuna", "career sites", "greenhouse", "lever", "ashby", "where do jobs come from"],
    body: [
      "Wonder searches real, public job feeds server-side and reads every posting itself. Nothing is invented.",
      "- Company career sites — public Greenhouse, Lever and Ashby boards of companies hiring in India and remotely (Stripe, Airbnb, Figma, GitLab, Databricks, Coinbase, Groww, CRED, Meesho, Notion, Linear, Ramp, Supabase, Replit, OpenAI, Zapier and more). Applications go straight to the employer.",
      "- Jobicy, Remote OK, Himalayas — remote job feeds. Himalayas has no search of its own, so Wonder scans its newest postings.",
      "- Arbeitnow — Europe-focused, off by default. Remotive — its public feed exposes only a handful of listings, off by default.",
      "- Adzuna India — India-wide postings across boards; needs free developer keys on the server and shows 'needs setup' until then.",
      "LinkedIn, Indeed, Naukri, Foundit and Glassdoor do not offer public job APIs, so Wonder does not search them and does not claim to. Turn sources on or off in Run Wonder → Search details.",
    ],
  },
  {
    id: "jobs",
    title: "Jobs, matches and quality",
    summary: "Reading a match score, fit labels, and hiring-confidence signals.",
    keywords: ["match", "score", "fit", "strong", "worth considering", "stretch", "low fit", "quality", "hiring confidence", "signals", "save", "not for me", "filters", "job detail", "why this job"],
    body: [
      "Every job shows a fit label: Strong Opportunity (82+), Worth Considering (68+), Stretch (55+) or Low-Fit. The score is a weighted blend of skills, seniority, industry, career goal, location and compensation; 'Why this job?' explains each one in plain language.",
      "Job quality is separate from fit: it estimates how likely a posting is to lead to a real hire from freshness, reposts, cross-posting, whether it appears on the employer's own site, salary transparency and source reliability. Low confidence roles are excluded from the shortlist.",
      "- Save keeps a job in your list and can be picked up by the next run; Not for me hides it and tells future runs.",
      "- Filters: work mode, fit, freshness, salary, source. Sort by best match, date or salary.",
      "- Signed-in accounts keep the best 300 discovered jobs between sessions; a new run refreshes the list.",
    ],
  },
  {
    id: "applications",
    title: "Applications and the hand-off",
    summary: "Materials, review, submitting on the employer's site, tracking and follow-ups.",
    keywords: ["application", "apply", "submit", "hand-off", "handoff", "resume", "cover letter", "answers", "review", "tracker", "follow up", "follow-up", "interview", "status", "mark as submitted", "why doesn't wonder apply"],
    body: [
      "Prepare Application drafts a tailored resume, cover letter and screening answers. Every draft is versioned; edit, regenerate, compare and restore. AI-generated and edited-by-you versions are labelled.",
      "Wonder never submits on an employer's site. Their forms need your own identity and consent, so the External application stage is a hand-off: you approve each one, the application gets an 'Open application page' button and a reminder, and you press submit on the employer's site. Then choose Mark as submitted so Wonder tracks it.",
      "- If you press Continue with approvals still pending, those hand-offs are recorded as not approved; open the application later or rerun from that stage.",
      "- The tracker keeps a timeline per application: discovered, prepared, submitted, responses, interviews, outcome. Add notes and follow-ups; reminders surface as notifications and on the calendar.",
      "- Follow-up and thank-you emails are drafted for you, confirmed by you, and recorded in the audit log; delivery is not connected yet (see Roadmap).",
    ],
  },
  {
    id: "automation",
    title: "Automation levels and policy",
    summary: "Assist, Guided, Autonomous, Continuous, and per-capability rules.",
    keywords: ["automation", "level", "assist", "guided", "autonomous", "continuous", "policy", "permission", "ask me", "risk", "capability"],
    body: [
      "Choose a level per run: Assist (AI helps, you decide everything), Guided (routine steps run, Wonder asks when needed), Autonomous (runs with your standing permissions), Continuous (runs on a schedule and learns).",
      "What Wonder can do set a rule per capability: search jobs, deduplicate, analyze, rank, save jobs, generate resume and cover letter, submit application, send recruiter message, change search preferences. Each is Automatic, Ask me, or Off.",
      "- Low-risk work (reading and scoring) can run unattended. Medium-risk work (drafting) can run unattended but is always reviewable. High-risk work with external side effects (anything that reaches an employer) always follows your policy and is audited.",
      "- Whatever the level, nothing is ever sent to an employer without your approval.",
    ],
  },
  {
    id: "scheduled-runs",
    title: "Scheduled searches",
    summary: "Daily discovery, conditions for notifying you, and the builder.",
    keywords: ["schedule", "scheduled", "daily", "weekly", "cron", "automatic run", "builder", "template", "notify", "silent"],
    body: [
      "Scheduled searches repeat a workflow (for example Daily Job Discovery at 8 am). Each schedule has a condition such as 'strong matches found' or 'new jobs found': if the condition is not met the run finishes quietly and you are not notified. Silence is a valid outcome.",
      "The builder lets you set trigger, frequency, conditions, actions, AI provider and model, or start from a template. Duplicate, pause or run any schedule now.",
      "- Turn on notifications in Profile to get a nudge on your phone or desktop when a scheduled search finds strong matches. It's per browser, permission is only asked when you press the button, and everything still appears in the app either way.",
      "- Schedules fire on Wonder's servers as well as in your browser, so a run still happens while you're away — with the app open they fire at exactly their time, and when it's closed the server picks them up on its next sweep. Either way the results are waiting when you next sign in, and a schedule never runs twice for the same occurrence.",
      "- Stages that need you — preparing materials, your review, the hand-off to an employer — are never done without you. A scheduled run finds, scores and shortlists; you decide what to do with it.",
    ],
  },
  {
    id: "ai",
    title: "AI providers and your own keys",
    summary: "WonderJobs AI, bringing your own key, fallback and billing.",
    keywords: ["ai", "provider", "byok", "api key", "anthropic", "openai", "gemini", "claude", "gpt", "billing", "cost", "fallback", "model", "wonderjobs ai"],
    body: [
      "Matching, ranking and quality checks are deterministic and explainable; they never depend on a language model. Drafting (resume, cover letter, answers, follow-ups, insights) uses a model.",
      "WonderJobs AI is the default. When the deployment has a platform key it uses a real model at no charge to you; otherwise it produces clearly labelled template drafts.",
      "Bring your own key: connect an Anthropic, OpenAI or Gemini key under AI provider. The key is encrypted at rest, never returned to the browser, never logged. Requests are billed to your provider account, which the product says plainly. If your provider fails, Wonder only switches to WonderJobs AI when you have allowed automatic fallback, and tells you when it did.",
      "- Usage and estimated cost per request are listed under AI provider.",
    ],
  },
  {
    id: "demo",
    title: "Demo mode",
    summary: "Sample data on your device, how to enter and leave it.",
    keywords: ["demo", "sample", "try", "explore", "alex morgan", "exit demo"],
    body: [
      "Demo mode shows the product with a sample candidate ('Alex Morgan'), a realistic history and generated postings. It lives only on your device, syncs nothing to an account and needs no sign-in.",
      "- Enter from the landing page, the sign-in page, or the avatar menu ('Demo'). Leave with 'Exit demo' in the avatar menu or on the profile page.",
      "- Your real account and the demo never mix: each keeps its own local state.",
    ],
  },
  {
    id: "account",
    title: "Account, security and privacy",
    summary: "Sessions, password reset, Google sign-in, what is stored where.",
    keywords: ["password", "reset", "forgot", "google", "session", "sign out", "privacy", "security", "data", "delete", "encryption", "audit"],
    body: [
      "Accounts use Supabase Auth: email and password, magic links, or Google. Sessions are cookies verified on the server; API routes refuse anything without one.",
      "- Forgot your password? Use 'Forgot password?' on the sign-in page. The link in the email opens a page to choose a new one and signs you in.",
      "- Show or hide what you typed with the eye icon on any password field.",
      "Your Career DNA, jobs, applications, runs, schedules and settings are stored per account in the product's database, with a namespaced copy on each device you use. Signing out revokes the session and removes that device's copy. Provider keys are stored encrypted; external actions are written to an append-only audit log.",
    ],
  },
  {
    id: "roadmap",
    title: "Roadmap and known limitations",
    summary: "What is not there yet, in the open.",
    keywords: ["roadmap", "backlog", "coming", "limitation", "not supported", "missing", "future", "planned", "billing", "pro", "email delivery", "scheduler"],
    body: [
      "- Email delivery for follow-ups is drafted and audited but not sent; a mail provider is planned.",
      "- More sources: Adzuna India needs keys today; Naukri-style boards have no public API. Employer boards are added by name; ask for one.",
      "- Pro plan and billing are not connected; Upgrade records interest only.",
      "- Resume Studio, Interview Prep and Learning are early: they organise your materials and prep, with deeper AI coaching planned.",
      "- A Google, Microsoft or Apple calendar sync is planned; today the calendar is built from your follow-ups, interviews and schedules.",
    ],
  },
];

export const HELP_FAQ: HelpFaq[] = [
  { q: "Where do the jobs come from? Are they real?", a: "Yes. Signed-in runs search live public feeds and company career boards, read each posting and score it. Only the demo uses generated sample data.", section: "sources" },
  { q: "Why doesn't Wonder search LinkedIn, Naukri or Indeed?", a: "They don't provide public job APIs. Wonder only claims sources it actually reads; employer boards and open feeds are searched instead.", section: "sources" },
  { q: "Why does a great-looking remote job show as 'Worth Considering' rather than 'Strong'?", a: "The employer restricts hiring to a region you are not in. Wonder never marks a role strong when you could not be hired for it.", section: "jobs" },
  { q: "Does Wonder apply for me?", a: "No. It prepares everything, then hands off: you approve, open the employer's application page, submit, and mark it submitted so it is tracked.", section: "applications" },
  { q: "I closed the app while a run was waiting for my review. Is it lost?", a: "No. The run is restored as waiting; open it and press Continue.", section: "runs" },
  { q: "Can Wonder read my resume instead of me typing all this?", a: "Yes. Use 'Import from resume' on the Career DNA page or during onboarding: PDF, Word or pasted text. It suggests each field with the words it came from, you tick what to keep, and the file is discarded afterwards. Scanned PDFs have no text to read — paste those.", section: "career-dna" },
  { q: "I got zero strong matches. What now?", a: "Check your Career DNA: add skills you actually have, include 'Remote' in locations if remote works for you, and widen the goal. Wonder still prepares materials for the top of the shortlist.", section: "career-dna" },
  { q: "Are AI drafts real or templates?", a: "Real when the deployment has a platform key or you connect your own; otherwise clearly labelled templates. The AI provider page shows which.", section: "ai" },
  { q: "Is my API key safe?", a: "It is encrypted at rest, only ever used from the server, never returned to the browser or logged, and you can remove it any time.", section: "ai" },
  { q: "How do I reset my password?", a: "Use 'Forgot password?' on the sign-in page; the emailed link opens a page to choose a new one.", section: "account" },
  { q: "What is the demo?", a: "A sample candidate on your device only, for exploring. It never touches your account.", section: "demo" },
  { q: "Will scheduled searches happen while I'm away?", a: "Yes. Wonder's servers fire schedules too, so a run happens while you're away and the shortlist is waiting when you sign in. With the app open they fire at exactly their time; with it closed the server picks them up on its next sweep. Anything needing your approval still waits for you.", section: "scheduled-runs" },
  { q: "Can Wonder notify me on my phone?", a: "Yes — Profile → 'Notifications on this device'. You'll get a nudge when a scheduled search finds strong matches. It's per browser, so turn it on wherever you want it. On iPhone, add WonderJobs to your Home Screen first; that's Safari's rule, not ours.", section: "scheduled-runs" },
  { q: "Can I change my automation level later?", a: "Yes, per run and in What Wonder can do; high-risk actions always follow your policy.", section: "automation" },
];

/** Deterministic retrieval: the sections that best match a question, best first. */
export function searchHelp(question: string, max = 3): { section: HelpSection; score: number }[] {
  const terms = question.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!terms.length) return [];
  return HELP_SECTIONS.map((section) => {
    const hay = `${section.title} ${section.summary} ${section.body.join(" ")}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (section.keywords.some((k) => k.includes(t) || t.includes(k))) score += 3;
      if (section.title.toLowerCase().includes(t)) score += 2;
      const n = hay.split(t).length - 1;
      score += Math.min(n, 4) * 0.5;
    }
    for (const f of HELP_FAQ) if (f.section === section.id && terms.filter((t) => f.q.toLowerCase().includes(t)).length >= Math.min(2, terms.length)) score += 2.5;
    return { section, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

const STOP = new Set(["the", "and", "for", "with", "how", "what", "why", "does", "can", "you", "your", "are", "this", "that", "from", "have", "not", "when", "where", "who", "will", "did", "get", "use", "into", "about", "wonder", "wonderjobs", "app", "page", "there", "they", "them", "its", "our"]);
