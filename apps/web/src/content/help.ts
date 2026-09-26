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
      "Create an account with your email and a password, a magic link, or Google. Confirm your email if the deployment asks you to. Onboarding starts by asking what you'd like Wonder to help with — find my next role, improve my career profile, prepare an application, track my applications, or let Wonder work for me — and takes you there when you finish. Along the way you set your career goal, preferred locations, a short profile (headline, level, years, skills, industries) and how much you want Wonder to do on its own. You can import these from your résumé instead of typing them.",
      "Everything you enter becomes your Career Profile. Wonder scores every real posting against it, so honest answers give better matches. You can refine it any time under Career.",
      "From Home, press Find opportunities and tell Wonder what you're looking for in your own words — for example “Senior product roles in Bengaluru or remote, preferably fintech”. Type it, or tap the mic and say it: your words land in the same box so you can correct them before anything runs. Wonder then shows what it read (roles, places, industry preference) and where each came from, searches live job sources, removes duplicates, compares each posting with your Career Profile, checks hiring signals, puts what deserves your attention first, prepares Application Packs for the top roles and asks for your review.",
      "Getting around: the app has five places — Home (what deserves your attention today, and your progress), Jobs, Applications, Career (your Career Profile plus Insights, Resume Studio, Interview Prep and Learning) and Wonder (your searches, scheduled searches and what Wonder can do). On a phone they're the bar at the bottom; the menu at the top left has everything else. Ask Wonder, the search bar at the top, gets you anywhere from anywhere.",
      "- Sign in: /sign-in · Create account: /sign-up · Forgot password: /forgot-password",
      "- Curious first? Open the demo from the avatar menu: sample data on your device only, no account needed.",
    ],
  },
  {
    id: "ask-wonder",
    title: "Ask Wonder",
    summary: "Ask a question in plain words; Wonder answers from your own data and opens the right place.",
    keywords: ["ask wonder", "ask", "question", "command", "search bar", "cmd k", "ctrl k", "shortcut", "today", "priorities", "focus", "missing skills", "why isn't", "why didn't", "attention", "progress"],
    body: [
      "Ask Wonder is the search bar at the top of every screen. Press ⌘K (Ctrl+K on Windows) or tap it, and ask in plain words.",
      "It recognises these questions and answers them from your own jobs, applications and Career Profile:",
      "- “What should I focus on today?” — applications that need you and strong matches posted this week.",
      "- “What applications need my attention?” and “Show my application progress”.",
      "- “Find me IAM jobs in Mumbai” — opens Find opportunities with your words, so you see what Wonder will search before it starts. “Search again” and “Change my preferences” work too.",
      "- “Why didn't you show the Razorpay role?” — names the preference hiding it, or says it isn't among the jobs Wonder has found.",
      "- “Why is the Razorpay role a good match?”, “Prepare the strongest two”, or “Prepare an application for Stripe” — opens that job's reasons, your strongest matches, or the job itself; nothing is prepared or sent until you choose.",
      "- “What skills am I missing?” — skills your own strong and worth-considering matches ask for that aren't in your Career Profile.",
      "- “Search for backend engineer roles weekly” — opens a new scheduled search filled in with your words; nothing is scheduled until you save it.",
      "Anything else is treated as a job search. Ask Wonder doesn't chat or guess: every answer comes from data you can open, and it only ever takes you somewhere — it never acts on your behalf.",
    ],
  },
  {
    id: "career-dna",
    title: "Career Profile",
    summary: "The profile Wonder matches against, and how each field is used.",
    keywords: ["career dna", "profile", "skills", "seniority", "level", "industries", "locations", "salary", "headline", "goal", "edit profile", "work history", "experience", "education", "certifications", "projects", "import", "remembered answers", "needs confirmation"],
    body: [
      "Career Profile (Career in the menu) is one page: career direction (name, headline, goal), experience (level and years), work history, education and contact, skills (each rated 1–5), preferences (industries, locations, work modes, minimum salary), strengths and growth areas, your résumé, and where your details came from.",
      "Work history, education, certifications, projects, publications and contact details are what résumé templates are built from — Wonder never adds a role, date or achievement you didn't enter.",
      "How matching uses it: skills are looked for in each posting's own text (with common inflections, so 'roadmap' counts for 'Roadmapping'); level compares the posting's inferred seniority with yours; industries compare with the posting's inferred industry; the career goal's key words are checked against the title; locations decide location fit, including whether a remote role is actually open to your region; minimum salary compares with disclosed pay.",
      "Filling it in from a resume: **Import from resume** on the Career Profile page (and during onboarding) reads a PDF, Word file or pasted text and suggests a headline, level, years, skills, industries and locations. Every suggestion shows the words it came from, you tick what to keep, and nothing changes until you apply it. Where the résumé disagrees with something already in your profile, both are shown side by side and your current value stays unless you tick the new one; lists only gain missing items, and your own skill ratings are never changed. Your career goal, salary and work modes are never guessed. The file is read and discarded — Wonder does not store it. A scanned or image-only PDF has no text in it, so Wonder says so and asks you to paste instead.",
      "- Needs confirmation: when you mark roles “Not for me” for the same reason three or more times, Wonder suggests treating it as a preference. It only nudges ranking — it never hides a role outright — and you can keep or dismiss it here.",
      "- Remembered answers: answers you chose to remember while applying (such as notice period or expected salary) are listed here to edit or forget. Wonder still asks you to confirm them on each application.",
      "- Include 'Remote' in locations to allow remote roles anywhere. A remote role restricted to another region can be worth a look but is never marked a strong opportunity.",
      "- Changing your Career Profile re-scores every job you have already discovered; you do not need to run again.",
    ],
  },
  {
    id: "runs",
    title: "Searches and how Wonder works",
    summary: "What you see while Wonder searches, and the twelve steps under “See how Wonder worked”.",
    keywords: ["run", "workflow", "stages", "progress", "pause", "resume", "stop", "restart", "rerun", "logs", "evidence", "timeline", "waiting"],
    body: [
      "While a search runs you see plain-language progress — searching the market, removing duplicates, checking relevant roles, comparing opportunities with your Career Profile, prioritizing — each ticked only when that work has actually finished, plus a real count of opportunities found so far. When it's done: “Your search is ready” with strong / worth considering / other counts and, after your second search, how many are new since the last one.",
      "- Pause keeps everything and waits (“Wonder is paused”, Continue). Stop finishes safely: “Search stopped. Everything already found is still available.” When Wonder needs you — for example to review prepared applications — it says “Wonder needs your input” with the reason, and Continue carries on.",
      "- Search again starts a new search; Recheck these opportunities re-compares the same results with your current Career Profile without searching again.",
      "Everything technical is one click down, under “See how Wonder worked” on the search's page: sources, each step's evidence, inputs you changed, the AI provider and billing, decisions, and the full log. The twelve steps are:",
      "- Understanding your profile — reads your Career Profile and records the inputs the run will use.",
      "- Searching job sources — asks each enabled source for postings that fit your goal and locations; evidence shows the count per source, 'Needs setup' for sources missing credentials, and 'Unavailable' if a source failed. Tap Discovered to list the postings found (each opens its job) or Sources to see each source with its own count.",
      "- Removing duplicates — collapses the same role seen on several sources.",
      "- Understanding opportunities — reads each posting: skills, seniority, industry, work mode, salary, requirements.",
      "- Matching with your career goals — scores every posting against your Career Profile and explains each dimension.",
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
    keywords: ["sources", "jobslake", "where was this job found", "duplicates", "linkedin", "indeed", "naukri", "glassdoor", "remotive", "jobicy", "remote ok", "himalayas", "arbeitnow", "adzuna", "career sites", "greenhouse", "lever", "ashby", "where do jobs come from"],
    body: [
      "Wonder searches real, public job feeds server-side and reads every posting itself. Nothing is invented.",
      "- Company career sites — public Greenhouse, Lever and Ashby boards of companies hiring in India and remotely (Stripe, Airbnb, Figma, GitLab, Databricks, Coinbase, Groww, CRED, Meesho, Notion, Linear, Ramp, Supabase, Replit, OpenAI, Zapier and more). Applications go straight to the employer.",
      "- Jobicy, Remote OK, Himalayas — remote job feeds. Himalayas has no search of its own, so Wonder scans its newest postings.",
      "- Arbeitnow — Europe-focused, off by default. Remotive — its public feed exposes only a handful of listings, off by default.",
      "- Adzuna India — India-wide postings across boards; needs free developer keys on the server and shows 'needs setup' until then.",
      "LinkedIn, Indeed, Naukri, Foundit and Glassdoor do not offer public job APIs, so Wonder does not search them and does not claim to. Turn sources on or off under Find opportunities → More options.",
      "All of these are searched together through JobsLake, WonderJobs' job-data layer: one search asks every source you have switched on, and the same role posted on several sources becomes one job. Open a job → Sources & signals → “Where this job was found” to see every listing, which one WonderJobs shows (the employer's own site when there is one) and which source each key field came from; “Check … now” re-reads the original listing. A search's “See how Wonder worked” shows how many sources answered and what each returned.",
    ],
  },
  {
    id: "jobs",
    title: "Jobs, matches and quality",
    summary: "Reading a match score, fit labels, and hiring-confidence signals.",
    keywords: ["match", "score", "fit", "strong", "worth considering", "stretch", "low fit", "quality", "hiring confidence", "signals", "save", "not for me", "filters", "refine", "for you", "all jobs", "saved", "hidden", "filtered", "show it anyway", "compare", "share", "link", "job detail", "why this job"],
    body: [
      "Every job shows a fit label: Strong Opportunity (82+), Worth Considering (68+), Stretch (55+) or Low-Fit — the percentage is there on hover, never on its own. The score is a weighted blend of skills, seniority, industry, career goal, location and compensation; the Why it fits tab (“Why this job?”) explains each one in plain language.",
      "Each card also says why Wonder surfaced the job, what to consider, and a suggested next step — only from the scores and signals computed for that posting.",
      "Job quality is separate from fit: it estimates how likely a posting is to lead to a real hire from freshness, reposts, cross-posting, whether it appears on the employer's own site, salary transparency and source reliability. Low confidence roles are excluded from the shortlist.",
      "- Jobs has three views: For You (worth considering and better), All Jobs and Saved. Remote, Hybrid and On-site chips narrow by work mode; Refine holds the rest — fit, freshness, salary and source. Sort by best match, date or salary.",
      "- When jobs are hidden, Wonder says how many and which preference hides each group, with Show it anyway and Change preference. Show it anyway never brings back a job you marked Not for me — undo that from the job itself.",
      "- Compare: tick two to four jobs to see them side by side. Wonder points out real differences; it doesn't pick a winner.",
      "- Save keeps a job in your list and can be picked up by the next run. Not for me hides it; mark three or more for the same reason and Wonder offers to treat that as a preference (see Career Profile → Needs confirmation).",
      "- Share on a job opens your device's share sheet or copies its link. Someone without an account who opens it sees that job's real details — description, requirements, company and hiring signals — and signs in only to see their own match, save or apply.",
      "- Signed-in accounts keep the best 300 discovered jobs between sessions; a new run refreshes the list.",
    ],
  },
  {
    id: "applications",
    title: "Applications and the hand-off",
    summary: "Materials, review, submitting on the employer's site, tracking and follow-ups.",
    keywords: ["application", "apply", "submit", "hand-off", "handoff", "resume", "cover letter", "answers", "review", "tracker", "follow up", "follow-up", "interview", "status", "mark as submitted", "why doesn't wonder apply", "application pack", "download", "word", "docx", "timeline", "pipeline", "needs attention", "continue to employer"],
    body: [
      "The Application Pack is one workspace per application: a tailored résumé, cover letter and screening answers, a fit summary for the role, and anything the employer may ask for that your Career Profile doesn't hold. It opens with “Application ready”, listing only the materials that actually exist and who wrote each one (AI-generated draft, Edited by you, or Written by you).",
      "- Every draft is shown as formatted text you can edit in place; changes save as you type. Regenerate, compare and restore earlier versions at any time.",
      "- On an application's page, “Download resume (.docx)” and “Download cover letter (.docx)” save the current version as a Word file. For a designed PDF, choose a résumé template instead (see Résumé templates).",
      "Wonder never submits on an employer's site. Their forms need your own identity and consent, so every application ends with a hand-off: Continue to Employer (or Open application page) opens the employer's own form, you submit it there — yourself, or with Apply with Wonder filling it first — and then choose Mark as submitted so Wonder tracks it.",
      "- If you press Continue on a search with approvals still pending, those hand-offs are recorded as not approved; open the application later or rerun from that stage.",
      "- Applications opens on a Timeline: Needs attention at the top (follow-ups due, interviews coming up, packs ready for review, employer replies), then a pipeline — Preparing, Applied, Interview, Outcome. The List view is one click away.",
      "- Each application keeps its own history: discovered, prepared, submitted, responses, interviews, outcome. Add notes and follow-ups; reminders appear in notifications and on the calendar.",
      "- Follow-up and thank-you emails: Wonder drafts one, you copy it and send it from your own email, then choose Mark as sent. Wonder has no recruiter's address and doesn't send email itself; each one is recorded in the audit log.",
    ],
  },
  {
    id: "apply-with-wonder",
    title: "Apply with Wonder",
    summary: "Wonder fills the employer's form with your approved details; you answer what only you can, review, and submit.",
    keywords: ["apply", "apply with wonder", "jobsapply", "autofill", "fill", "extension", "helper", "submit", "guided", "application form", "captcha", "sign in", "password"],
    body: [
      "Open a job and choose Apply with Wonder. Pick how: the browser helper fills the form for you, Guide me puts every value and document one click from your clipboard, or download the Application Pack.",
      "- The helper fills only what comes from you: your Career Profile details, the résumé you chose, and answers you approved. It shows what it filled and what needs you.",
      "- Work authorization, sponsorship, salary, legal and equal-opportunity questions are always yours — Wonder never answers them. Salary and notice period can be remembered for next time; Wonder still asks you to confirm.",
      "- Wonder can draft answers to open questions from your Career Profile, labelled as AI drafts; it asks you for any number rather than inventing one.",
      "- You sign in on the employer's own site. WonderJobs never asks for, sees or stores your portal password, and the helper never gets past a verification challenge — it waits for you.",
      "- Wonder never submits. You press the employer's submit button, then tell Wonder “Yes, application submitted”; only that adds it to Applications as submitted.",
      "- If the page moves to an unexpected site or asks for payment, Wonder stops and says why. Stop in the helper or in WonderJobs halts it at any time.",
    ],
  },
  {
    id: "resume-templates",
    title: "Résumé templates",
    summary: "Eight ATS-friendly designs, rendered from your own Career Profile, downloadable as PDF and Word.",
    keywords: ["resume", "résumé", "cv", "template", "pdf", "docx", "word", "ats", "download", "executive", "technical", "classic", "leadership", "career shift", "academic", "creative", "modern", "my resumes"],
    body: [
      "Resume Studio → Templates shows eight designs — Executive, Modern Minimal, Technical, Classic ATS, Leadership, Career Shift, Academic / Research and Creative Modern — each previewed with your own details. Wonder recommends one and says why, from your profile.",
      "- Templates only change presentation. Every résumé shows the same facts from Career Profile → Work history, education and contact; nothing is invented, and changing template never edits your profile.",
      "- Generate runs real checks before you can download: required details, section order, layout (nothing cut off, no heading stranded at the bottom of a page), ATS structure (real text, standard headings) and your links. Anything that would make the file unreliable blocks the download; smaller items are shown first.",
      "- PDF and Word (DOCX) downloads are built from the same content. The PDF is made on your device, exactly as the preview shows it.",
      "- From an application, “Choose a résumé template” makes a version for that job: your own experience and skills, ordered by relevance to the role.",
      "- My resumes keeps every résumé you generate with the template version it used, so an old one reopens exactly as it was even after you update your profile.",
    ],
  },
  {
    id: "automation",
    title: "How much Wonder handles",
    summary: "Help me, Work with me, Work independently, Keep watch — and per-capability rules.",
    keywords: ["automation", "level", "help me", "work with me", "work independently", "keep watch", "assist", "guided", "autonomous", "continuous", "policy", "permission", "ask me", "risk", "capability"],
    body: [
      "Choose how much Wonder should handle for each search: Help me (Wonder finds opportunities and asks before doing anything else, even drafting), Work with me (the recommended default: searching, comparing and drafting happen on their own, and Wonder asks before anything that matters), Work independently (anything you've set to Automatic in What Wonder can do runs without asking each time), Keep watch (as Work independently, and Wonder also searches on your schedule, telling you only when something is worth your attention).",
      "What Wonder can do (under Wonder) sets a rule per capability: search jobs, deduplicate, analyze jobs, rank opportunities, save jobs, generate résumé, generate cover letter, fill application forms, hand off application, draft a recruiter message, draft a follow-up email, change search preferences and change Career Profile. Each is Automatic, Ask me, or Off.",
      "- Fill application forms (Apply with Wonder) starts as Ask me. Even on Automatic it only fills fields — it can never submit, and hand off application only ever opens the employer's page for you.",
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
      "“How often should Wonder look?” — choose Every day, Every week, Keep watch (tells you only when there are strong matches) or I'll search manually, and describe what to look for in your own words. That's all a scheduled search needs; the full builder is under Advanced search automation.",
      "Scheduled searches repeat a workflow (for example Daily Job Discovery at 8 am). Each schedule has a condition such as 'strong matches found' or 'new jobs found': if the condition is not met the run finishes quietly and you are not notified. Silence is a valid outcome.",
      "The builder lets you set trigger, frequency, conditions, actions, AI provider and model, or start from a template. Duplicate, pause or run any schedule now.",
      "- Turn on notifications in Profile to get a nudge on your phone or desktop when a scheduled search finds strong matches. It's per browser, permission is only asked when you press the button, and everything still appears in the app either way.",
      "- Schedules fire on Wonder's servers as well as in your browser, so a run still happens while you're away — with the app open they fire at exactly their time, and when it's closed the server picks them up on its next sweep. Either way the results are waiting when you next sign in, and a schedule never runs twice for the same occurrence.",
      "- Stages that need you — preparing materials, your review, the hand-off to an employer — are never done without you. A scheduled run finds, scores and shortlists; you decide what to do with it.",
    ],
  },
  {
    id: "calendar",
    title: "Calendar, notifications and the app",
    summary: "Put interviews and follow-ups in your own calendar, get nudges, and install WonderJobs on your phone.",
    keywords: ["calendar", "google calendar", "outlook", "apple calendar", "ical", "ics", "subscribe", "interview", "reminder", "notifications", "push", "install", "app", "home screen", "phone", "iphone", "android", "pwa"],
    body: [
      "The calendar shows everything with a date: interviews, follow-ups and scheduled searches. Open it from Home → Upcoming → View all, from Profile, or by typing “Calendar” in Ask Wonder.",
      "- Subscribe (signed-in accounts): gives you a private link to add in Google Calendar (Other calendars → + → From URL), Outlook (Add calendar → Subscribe from web) or Apple Calendar (File → New Calendar Subscription). Your calendar app keeps it up to date on its own — usually every 30 minutes or so, not instantly. It's read-only, and anyone with the link can see your upcoming interviews and follow-ups, so treat it like a password. The demo has no account to link, so Subscribe doesn't appear there.",
      "- Notifications: the bell at the top lists what needs you. Turn on Profile → Notifications on this device to also get a nudge on that phone or computer — when a scheduled search finds strong matches, and for follow-up and interview reminders — even while WonderJobs is closed. It's per browser, and permission is only asked when you press the button.",
      "- Install the app: in Chrome, Edge and other Chromium browsers, Install app appears in the avatar menu when your browser allows it. On iPhone, open WonderJobs in Safari and choose Share → Add to Home Screen (that's also how iPhone allows notifications). The installed app is the same WonderJobs, always showing your live data.",
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
      "Your Career Profile, jobs, applications, runs, schedules and settings are stored per account in the product's database, with a namespaced copy on each device you use. Signing out revokes the session and removes that device's copy. Provider keys are stored encrypted; external actions are written to an append-only audit log.",
    ],
  },
  {
    id: "roadmap",
    title: "Roadmap and known limitations",
    summary: "What is not there yet, in the open.",
    keywords: ["roadmap", "backlog", "coming", "limitation", "not supported", "missing", "future", "planned", "billing", "pro", "email delivery", "scheduler"],
    body: [
      "- Follow-up emails are drafted for you to copy and send yourself; sending them from WonderJobs is planned once a mail provider is connected.",
      "- More sources: the platform team adds employer boards (Greenhouse, Lever, Ashby, SmartRecruiters, Workable), official APIs, feeds and MCP sources through JobsLake, each activated only after a real test. Adzuna India needs keys; LinkedIn, Indeed and Naukri stay off until a partnership exists.",
      "- Pro plan and billing are not connected; Upgrade records interest only.",
      "- Interview Prep and Learning are early: they organise your prep, with deeper AI coaching planned. Résumé templates have no two-column or photo layouts or US Letter page size yet, and don't import roles from a résumé file — add them under Career Profile.",
      "- Calendar: you can subscribe to a read-only feed today (see Calendar, notifications and the app). A direct two-way connection with Google or Microsoft calendars is planned.",
      "- Apply with Wonder: the browser helper isn't on the Chrome Web Store yet (install it from the Extension page), and no employer's application API is connected — Wonder helps in your browser instead. Wonder will not submit applications for you; that stays your decision.",
    ],
  },
];

export const HELP_FAQ: HelpFaq[] = [
  { q: "Does Apply with Wonder submit applications for me?", a: "No. Wonder fills what it can from your own approved details and stops for anything only you should answer. You review and press the employer's submit button, then confirm in WonderJobs.", section: "apply-with-wonder" },
  { q: "Do I have to give WonderJobs my job-portal password?", a: "No. You sign in on the employer's own site. The helper never reads password or verification-code fields, and WonderJobs never stores portal credentials.", section: "apply-with-wonder" },
  { q: "Where do the jobs come from? Are they real?", a: "Yes. Signed-in runs search live public feeds and company career boards, read each posting and score it. Only the demo uses generated sample data.", section: "sources" },
  { q: "Why doesn't Wonder search LinkedIn, Naukri or Indeed?", a: "They don't provide public job APIs. Wonder only claims sources it actually reads; employer boards and open feeds are searched instead.", section: "sources" },
  { q: "Why does a great-looking remote job show as 'Worth Considering' rather than 'Strong'?", a: "The employer restricts hiring to a region you are not in. Wonder never marks a role strong when you could not be hired for it.", section: "jobs" },
  { q: "Will my résumé template make things up to look better?", a: "No. Templates render only the roles, education, skills and contact details in your Career Profile. For a specific job Wonder may reorder your own points by relevance; it never adds an achievement, number or skill.", section: "resume-templates" },
  { q: "Does Wonder apply for me?", a: "No. It prepares everything, then hands off: you approve, open the employer's application page, submit, and mark it submitted so it is tracked.", section: "applications" },
  { q: "Can I download my tailored résumé and cover letter?", a: "Yes. On the application's page, “Download resume (.docx)” and “Download cover letter (.docx)” save the current versions as Word files. For a designed PDF, pick one of the résumé templates.", section: "applications" },
  { q: "What can I ask Wonder?", a: "Things like “What should I focus on today?”, “Why didn't you show the Razorpay role?”, “What skills am I missing?” or “Search for backend roles weekly”. Wonder answers from your own data and opens the right place; anything else becomes a job search.", section: "ask-wonder" },
  { q: "Can I say what I'm looking for instead of typing?", a: "Yes. Tap the mic in the Find opportunities box and speak; your words land in the box so you can fix them before searching. Your browser's own speech service does the transcription, and the mic only appears in browsers that have one.", section: "getting-started" },
  { q: "Why are some jobs hidden?", a: "Your preferences hide them — location, fit, salary and so on. Jobs says how many each preference hides, with Show it anyway and Change preference. Jobs you marked Not for me stay hidden until you undo that on the job itself.", section: "jobs" },
  { q: "Can I share a job with someone who doesn't use WonderJobs?", a: "Yes. Share on a job copies its link or opens your share sheet. They see the job's real details without an account, and sign in only to see their own match, save or apply.", section: "jobs" },
  { q: "Can I add my interviews and follow-ups to Google Calendar or Outlook?", a: "Yes. Calendar → Subscribe gives you a private link to add to Google Calendar, Outlook or Apple Calendar; it keeps itself up to date. Keep the link private — anyone with it can see those dates.", section: "calendar" },
  { q: "Can I install WonderJobs on my phone?", a: "Yes. In Chrome or Edge, choose Install app in the avatar menu when it appears. On iPhone, use Safari's Share → Add to Home Screen.", section: "calendar" },
  { q: "I closed the app while a run was waiting for my review. Is it lost?", a: "No. The run is restored as waiting; open it and press Continue.", section: "runs" },
  { q: "Can Wonder read my resume instead of me typing all this?", a: "Yes. Use 'Import from resume' on the Career Profile page or during onboarding: PDF, Word or pasted text. It suggests each field with the words it came from, you tick what to keep, and the file is discarded afterwards. Scanned PDFs have no text to read — paste those.", section: "career-dna" },
  { q: "I got zero strong matches. What now?", a: "Check your Career Profile: add skills you actually have, include 'Remote' in locations if remote works for you, and widen the goal. Wonder still prepares materials for the top of the shortlist.", section: "career-dna" },
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
  const terms = helpTerms(question);
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

/**
 * The FAQ in a section that best answers a question: most shared meaningful
 * words (stop words and short words ignored), first on a tie. Null when none
 * shares enough of the question to be a fair answer.
 */
export function bestFaq(question: string, sectionId: string): HelpFaq | null {
  const terms = helpTerms(question);
  if (!terms.length) return null;
  const need = Math.min(2, Math.ceil(terms.length / 2));
  let best: HelpFaq | null = null;
  let bestScore = 0;
  for (const f of HELP_FAQ) {
    if (f.section !== sectionId) continue;
    const words = helpTerms(f.q);
    const score = terms.filter((t) => words.some((w) => w === t || w.startsWith(t) || t.startsWith(w) || (w.length >= 4 && t.endsWith(w)))).length;
    if (score > bestScore) [best, bestScore] = [f, score];
  }
  return bestScore >= need ? best : null;
}

function helpTerms(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}

const STOP = new Set(["the", "and", "for", "with", "how", "what", "why", "does", "can", "you", "your", "are", "this", "that", "from", "have", "not", "when", "where", "who", "will", "did", "get", "use", "into", "about", "wonder", "wonderjobs", "app", "page", "there", "they", "them", "its", "our"]);
