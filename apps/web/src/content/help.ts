/**
 * The user guide and FAQ, as data. Rendered by /help (signed-in accounts only)
 * and searched by the help assistant. A change that adds, removes or renames a
 * user-facing feature updates this file in the same pull request (CLAUDE.md),
 * and moves that section's `updated` date.
 *
 * Conventions: a section's first body line is its lead — the help assistant
 * falls back to it when no FAQ answers a question — so keep it self-contained.
 * Describe what the product does and where to tap, never what it is built with.
 */
import { RELEASE_NOTES } from "./releaseNotes";

export interface HelpSection {
  id: string;
  title: string;
  summary: string;
  /** Paragraphs and bullet lists (lines starting with "- "). */
  body: string[];
  keywords: string[];
  /** When this section was last checked against the app (YYYY-MM-DD); shown as "Last updated". */
  updated: string;
}

export interface HelpFaq {
  q: string;
  a: string;
  section: string;
}

const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** The Release notes section, built from `releaseNotes.ts`: newest entry first, each one's changes as a list. */
const releaseNotesSection: HelpSection = {
  id: "release-notes",
  title: "Release notes",
  summary: "What's new in WonderJobs, newest first.",
  keywords: ["release notes", "what's new", "whats new", "new features", "changes", "changelog", "updates", "latest", "version", "released"],
  updated: RELEASE_NOTES[0]?.date ?? "2026-10-19",
  body: [
    "What's new in WonderJobs, newest first. Each entry lists what went live since the one before it.",
    ...RELEASE_NOTES.flatMap((n) => [`${longDate(n.date)} — ${n.title}`, ...n.items.map((item) => `- ${item}`)]),
  ],
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    summary: "Create an account, add your CV, see your jobs, find your way around.",
    keywords: ["start", "signup", "sign up", "account", "onboarding", "first run", "begin", "register", "login", "sign in", "navigation", "menu", "avatar", "places", "tabs", "getting around", "skip"],
    updated: "2026-10-17",
    body: [
      "Create an account with your email and a password (8 characters or more), a magic link, or Google. Onboarding is two screens: add your CV (PDF or Word, up to 5 MB — or choose “No CV handy? Type it in”), then check what Wonder read — the role you want, where, and your skills — and press Show my jobs. Role you want starts empty and Show my jobs stays off until you name one, because Wonder only searches for what you say you want. Your level, years, industries and work history are saved from the CV too; nothing is saved until that press. You can also skip onboarding and finish later — Find then shows the one step it needs.",
      "Everything you enter becomes your Career Profile. Wonder scores every real posting against it, so honest answers give better matches. You can refine it any time under You → Career Profile.",
      "Signed in, the first screen is Find: real postings from live sources, ranked by how well each fits your Career Profile (see Finding jobs). If jobs can't be shown yet, Find shows the one thing to do instead — add your CV, name the role you want, or switch on a job source — right there.",
      "Getting around: four places, one per stage of a search — Find (your jobs), Saved (your shortlist), Pipeline (Applications, Calendar, This week, Insights and Interview Prep) and You (Career Profile, Skill Up, Recruiters, Résumés, Job sources, Automation, AI provider and Search history). On a phone they're the bar at the bottom; on a desktop, the sidebar. A place's own pages are tabs at its top.",
      "At the top: Ask Wonder (the search icon, or ⌘K / Ctrl+K), a Searching pill while any search runs (tap it to see each search's step and progress), the bell (what happened, each item with one button for the next step) and your avatar. The avatar menu holds Account, Plan & billing, API keys, Notifications & email, Your data, Hiring (for employers and recruiters), Get Help, Install app (when your browser allows it) and Sign out. On a phone, the round ••• button above the bottom bar opens the same menu. Analytics (below the four places in the sidebar; in that menu on a phone) shows your own numbers: applications, how many you submitted, how many heard back and how fast, applications and searches week by week (pick the range at the top: 4 weeks to all time; each bar shows its count), the funnel from start to offer, how well what you applied to fits, and which sources your applications came from — all from your own applications and searches. Your profile photo: Account → the camera on your picture adds, changes or removes it; it shows wherever your initials did.",
      "On a phone or tablet, a banner at the top offers to install WonderJobs as an app when your browser can (see Calendar, notifications and the app).",
    ],
  },
  {
    id: "finding-jobs",
    title: "Finding jobs",
    summary: "The Find screen: Full Time and Part Time, the role Wonder searches for, the search box, views and Refine.",
    keywords: ["find", "full time", "part time", "slider", "search", "share", "share a job", "whatsapp", "email a job", "send to a friend", "skip career profile", "skip profile", "job type", "part time", "gig", "searching by itself", "auto search", "automatic search", "search box", "mic", "microphone", "dictate", "say", "speak", "voice", "refine", "location", "level", "work mode", "posted", "sort", "search as", "role you want", "looking for", "change", "strictly", "career profile search", "views", "for you", "strong", "all", "nothing found", "no results", "widen", "zero results", "stale", "searched", "sources", "closed", "posting closed", "refresh", "search again", "type", "typing", "press search", "pipeline", "already applied", "hide applied"],
    updated: "2026-10-22",
    body: [
      "At the top of Find, slide (or tap) between Full Time and Part Time. Full Time searches your Career Profile: the Looking for card and one Search based on Career Profile button (tap the words Career Profile in it to open your Career Profile). Part Time searches only what you type: the search box, the job types and Search. Both have the views All, Strong and For you, Hide Pipeline and Refine, and Find remembers which you used last.",
      "Find is your ranked list of real postings, and it always says what Wonder is looking for: the top card reads “Looking for” with Change beside it and your role under it. Change edits Role you want in place — one role and its field, never a level alone (“director” needs a field) — and searches for it straight away. Refine shows the same card.",
      "Opening Find shows your last search's results as they were — it never starts a search by itself, except the very first time, before you've ever searched. To look again, press Search; coming back from Career Profile with Back to Find searches again if you changed anything. Your saved schedules run at their time while the app is open; one missed while it was closed runs in Wonder's daily run instead, not when you open the app.",
      "In Part Time only what you typed is searched: your Looking for role, places, work modes and minimum salary are all left out (a small line under the box says so). Type the work, and any places (“barista in Pune”); with no place typed it searches anywhere. Every job found is shown, not only the ones that fit your profile. Under the box (between it and the button on a phone), tap one or more job types — Contract, Consultant, Internship, Short-term, Gig — to show only those (Consultant means postings that say they're a consulting engagement, not every “Consultant” job title); the next search asks the sources that list them first.",
      "Two lines say what you're looking at. Above the jobs, “Showing 14 jobs for “…” in … from 2 sources”, counted from the list on screen (the numbers here are an example). While a search runs, a banner above the jobs reads “Searching…” with how many it has found so far, your words and a Details link, and the jobs appear under it as each source answers — already scored, so For you and Strong fill in as you watch; the list settles when the search finishes (a posting found closed then drops out); when it's done, the status line — “Searched 8 sources for “…” in … · 2 hours ago” — sits at the top of Refine: tap it for Details (every source's count, and how Wonder worked) and tap the circular arrow to search again.",
      "To share a job, tap the share icon under its save icon (or beside Save on the job's own page): WhatsApp, Email, Copy link or (on a phone) More. The other person gets a link to the job's own page on WonderJobs, with a preview card of the job. The page looks like the job in the app and shows only the posting's details — never your fit, score or notes; Save, Apply with Wonder, how it fits you and View similar jobs (a search for the job's title) ask them to create an account or sign in first, then bring them back.",
      "To search for something else, switch to Part Time, type it in the search box and press Search (or Enter). The list doesn't change while you type — your words apply when you search. Wonder then searches every source you have switched on, removes duplicates, compares each posting with your Career Profile, checks hiring signals, and puts what deserves your attention first. Tap the mic to say it instead (in browsers that have one); your words land in the box and the mic turns off, so you can fix them before searching. Wonder reads the role and any places from your words — for example “IAM director roles in Mumbai”. A place on its own (“Singapore”) searches your own roles there; pay words (“high paying jobs”) search your own roles with the best-paid first.",
      "- In Full Time the button reads Search based on Career Profile and runs the profile's own search.",
      "- If none of the jobs you already have answers what you typed, the list offers a single Search every source button.",
      "- A search never prepares applications on its own: you prepare one from a job when you choose.",
      "Three views sit under the box: All (every job — Find opens here), For you (worth considering and better) and Strong. Saved is its own place. Refine, beside the views, holds everything else:",
      "- Search as — if you've added roles in your Career Profile, they're listed here. Tapping a role only picks it; the search runs when you press Search.",
      "- Location (places separated by commas; “Remote” counts), Level, Work mode, Posted, Minimum salary and Sort (best match, newest, salary).",
      "- Job types (under the search box) — each card shows the type next to its work mode: as the source lists it, or as the job title says (hover it to see which). A posting that says neither shows no type, and picking a type hides it. Typing “part time”, “freelance” or “internship” in the search box picks that type for you (“part time designer jobs” searches designers, part-time only).",
      "- Search strictly within your Career Profile keeps only jobs whose title, skills, tags or requirements name your field and hides the rest as “outside your Career Profile”.",
      "- Only postings from the last two weeks are shown: older ones are hidden as “posted more than 2 weeks ago” (a job board's listing often outlives the employer's page), and JobsLake no longer returns them. Saved jobs always stay, whatever their age; Show me anyway on that line brings the older ones back.",
      "- Hide Pipeline (beside Refine) stays as you left it, on every device, and takes out jobs you're already preparing, have applied to or are interviewing for; they stay in Pipeline. Jobs you have only saved still show.",
      "- Search runs a search with the words and places set in Refine; Show N jobs, or Back to jobs at its top, just closes it. Compare jobs and Clear refinements are the quiet links at the bottom.",
      "Each card shows the company's logo from JobsLake, refreshed daily (or its first letter when the postings don't name the company's website), the designation and level, the salary (Not listed when the employer didn't say), the fit label and “via <source> · posted …”. For board postings it also names the site the job lives on once Wonder has followed the link, for example “naukri.com via Adzuna India”. A card has one action: Save. Tap the card to open the job.",
      "Wonder checks the jobs on screen against their own sites. A posting that has closed leaves your list — the job's page says why, and it stays in Saved if you saved it.",
      "Searching the same thing again within a day doesn't re-download everything: sources that can filter by date are asked only for jobs posted since their last answer, and the new ones are merged with the earlier results. Clearing what you typed brings back the results Wonder already had, without a new search.",
      "If a search finds nothing, Wonder searches once more, wider, and says what it let go: first a more common title for the same role (picked by AI from your own Career Profile, when WonderJobs AI is connected, and only if every word is already yours), otherwise the same search without the location and then without the level words. If that finds nothing too, the list says so — name your field rather than one title in Career Profile.",
      "A single note below the list points out anything that weakens your matches — a scheduled search looking outside your field, skills that are all general ones, a role without a field, no location — with one fix.",
    ],
  },
  {
    id: "ask-wonder",
    title: "Ask Wonder",
    summary: "Ask a question in plain words; Wonder answers from your own data and opens the right place.",
    keywords: ["ask wonder", "ask", "question", "command", "search bar", "cmd k", "ctrl k", "shortcut", "today", "priorities", "focus", "missing skills", "why isn't", "why didn't", "attention", "progress", "linkedin headline", "headline"],
    updated: "2026-10-16",
    body: [
      "Ask Wonder is the search icon beside the bell at the top of every screen. Tap it, or press ⌘K (Ctrl+K on Windows), and ask in plain words — or jump to any page.",
      "Before you type, it lists what needs you now, counted from your own data and shown only when there is something: applications you opened with Wonder that are waiting for “did you submit?”, follow-ups due within a day, strong matches to review and saved jobs you haven't started. Then Search again (naming your last search) and, if you have no scheduled search, Keep Wonder looking. Go to lists the four places; any page can be found by typing its name.",
      "It recognises these questions and answers them from your own jobs, applications and Career Profile:",
      "- “What should I focus on today?” — applications that need you and strong matches posted this week.",
      "- “What applications need my attention?” and “Show my application progress”.",
      "- “Find me IAM jobs in Mumbai” — searches every source for your words and shows the results on Find, saying what it searched. “Search again” works too.",
      "- “Why didn't you show the Razorpay role?” — names the preference hiding it, or says it isn't among the jobs Wonder has found.",
      "- “Why is the Razorpay role a good match?”, “Prepare the strongest two”, or “Prepare an application for Stripe” — opens that job's reasons, your strongest matches, or the job itself; nothing is prepared or sent until you choose.",
      "- “What skills am I missing?” — skills your own strong and worth-considering matches ask for that aren't in your Career Profile.",
      "- “Search for backend engineer roles weekly” — opens a new scheduled search filled in with your words; nothing is scheduled until you save it.",
      "- “Improve my LinkedIn headline” — says plainly that LinkedIn isn't connected and takes you to your headline in Career Profile.",
      "Anything else is treated as a job search. When your words match none of these patterns and run to three or more words, WonderJobs AI (where it's connected) may read the request and name one of the same actions; it can't write a reply, add actions or do anything on its own, and without it your words are simply searched. Ask Wonder doesn't chat or guess: every answer comes from data you can open, and it only ever takes you somewhere — it never acts on your behalf.",
    ],
  },
  {
    id: "career-dna",
    title: "Career Profile",
    summary: "The profile Wonder matches against, and how each field is used.",
    keywords: ["career dna", "profile", "roles", "role", "search as", "open to", "skills", "seniority", "level", "industries", "locations", "salary", "headline", "goal", "edit profile", "work history", "experience", "education", "certifications", "projects", "import", "remembered answers", "application answers", "notice period", "needs confirmation", "learned", "learns", "save changes", "role you want", "current role"],
    updated: "2026-10-21",
    body: [
      "Career Profile (You → Career Profile) asks two questions, each once. **What you're looking for**: Role you want (what Wonder searches for — a role and its field, not a level alone) and, folded under it, Other roles you'd take. **About you**: name, current role, level, years, where, work mode and skills (tap a skill to mark it a strength) — what every job is matched against. Below, one row each for filling from your résumé, work history / education / contact, industries and minimum salary, strengths and growth areas, application answers, what Wonder has learned, and where the profile came from. Changes are kept when you press Save changes (stuck to the top of the page); an “Unsaved changes” note shows until you do. If your CV lists a role the profile is missing, the page says so and adds it in one tap, and a current role that reads like a goal (“Target: …”) gets a one-tap Move it to Role you want.",
      "Work history, education, certifications, projects, publications and contact details are what résumé templates are built from — Wonder never adds a role, date or achievement you didn't enter.",
      "How matching uses it: your **field** — what you do, from your headline and the role you want — is looked for in each posting, and a posting that never names your field is at most a stretch. Your skills, level, industries, places and minimum salary are compared with the posting too. Each job's page shows every one of these with its reason. Where WonderJobs AI is connected, it also reads the best postings (see Jobs, matches and quality).",
      "**Other roles you'd take**: if you'd take more than one kind of job — often ones you've held before — add each as a role: a name like “Data Analyst”, optional search terms (empty reads them from the name), an optional goal for that search (empty uses the name) and a résumé to offer for it. How many roles you can add depends on your plan (see Plans, payments and your data). Pick a role under Search as in Refine on Find (or its Search button here), or choose one when setting up a scheduled search: that search uses the role's terms and goal, while skills, level, locations and salary still come from your one Career Profile. The search, its results and each job it found say which role it ran as, and Apply with Wonder offers that role's résumé first. Roles save as soon as you add them; with none, searching works exactly as before.",
      "Filling it in from a résumé: **Fill from your résumé** on the Career Profile page (its button reads Import from resume) reads one of your stored résumés (Résumés → My resumes → **Fill Career Profile** opens it straight away), a PDF or Word file you bring in once (up to 5 MB), or pasted text. It suggests a headline, level, years, skills, industries and locations, and also your contact details, summary, work history (title, employer, dates and achievement lines), education and certifications. Every suggestion shows the words it came from, you tick what to keep, and nothing changes until you apply it and save. Where the résumé disagrees with something already in your profile, both are shown side by side and your current value stays unless you tick the new one; a role, degree or certification you already have is shown as already there and never duplicated; lists only gain missing items, and your own skill ratings are never changed. Your career goal, salary and work modes are never guessed. During onboarding only the profile fields are offered. A file you bring in this way is read and discarded; to keep one, upload it under Résumés. A scanned or image-only PDF has no text in it, so Wonder says so and asks you to paste instead.",
      "- **Read with AI** (optional): if Wonder's own reading missed a role or a qualification, press Read with AI and your AI provider reads the same résumé text. Its suggestions are marked Found by AI and start unticked, and Wonder shows only entries whose names, dates and achievement lines are actually written in your résumé — anything else is dropped and counted. With no model connected, nothing extra appears. It's off when Automation → Change your Career Profile is Off.",
      "- Application answers: your current and expected salary, notice period, employment status and other answers to common form questions. Add them here, or save them from an employer's form: after you type answers to questions the helper left for you, it lists them with a tick box and Save N to your profile — nothing is kept until you press it. The helper fills them while they were confirmed in the last 30 days, then asks you once whether they still hold (Still right / Forget). Equal-opportunity, work-authorization, legal and ID questions are filled only if you turned that group on under Automation → Sensitive questions (see How much Wonder handles); otherwise they're yours.",
      "- What Wonder has learned: patterns Wonder noticed from the jobs you save, apply to, mark Not for me and the places you search — for example “Rank fintech roles higher”. A pattern needs three pieces of evidence (two for an employer), is never something already in your profile, and only nudges ranking — it never hides a role outright and never changes your preferences. Each one lists its evidence; Yes, keep this strengthens it and Turn off stops it for good.",
      "- Include 'Remote' in locations to allow remote roles anywhere. A remote role restricted to another region can be worth a look but is never marked a strong opportunity.",
      "- Changing your Career Profile re-scores every job you have already discovered; you do not need to search again.",
    ],
  },
  {
    id: "runs",
    title: "Searches and how Wonder works",
    summary: "What you see while Wonder searches, and the twelve steps under “See how Wonder worked”.",
    keywords: ["run", "workflow", "stages", "progress", "pause", "resume", "stop", "restart", "rerun", "logs", "evidence", "timeline", "waiting", "search history", "details"],
    updated: "2026-10-17",
    body: [
      "While a search runs you see plain-language progress — searching the market, removing duplicates, checking relevant roles, comparing opportunities with your Career Profile, prioritizing — each ticked only when that work has actually finished, plus a real count of opportunities found so far. When it's done: “Your search is ready” with strong / worth considering / other counts and, after your second search, how many are new since the last one. Every search is listed under You → Search history.",
      "- Pause keeps everything and waits (“Wonder is paused”, Continue). Stop finishes safely: “Search stopped. Everything already found is still available.” When Wonder needs you — for example to review prepared applications — it says “Wonder needs your input” with the reason, and Continue carries on.",
      "- Search again starts a new search; Recheck these opportunities re-compares the same results with your current Career Profile without searching again.",
      "Everything technical is one click down, under “See how Wonder worked” on the search's page: sources, each step's evidence, inputs you changed, the AI provider and billing, decisions, and the full log. The twelve steps are:",
      "- Understanding your profile — reads your Career Profile and records the inputs the run will use.",
      "- Searching job sources — asks every enabled source at once for postings that fit your goal and locations; evidence shows the count per source, 'Needs setup' for sources that aren't connected, and 'Unavailable' if a source failed. Tap Discovered to list the postings found (each opens its job) or Sources to see each source with its own count.",
      "- Removing duplicates — collapses the same role seen on several sources.",
      "- Understanding opportunities — reads each posting: skills, seniority, industry, work mode, salary, requirements.",
      "- Matching with your career goals — scores every posting against your Career Profile and explains each dimension. Where WonderJobs AI is connected, the evidence also shows “Read by AI” with how many postings it read.",
      "- Checking job quality — freshness, reposts, duplicates, where the application goes, salary transparency, source reliability and, where AI read the posting, any warning signs it found.",
      "- Prioritizing opportunities — the shortlist above your minimum match; strong matches are saved for you only if you set Save strong matches to Automatic (it starts Off; Ask me never saves on its own). Preparing a job's Application Pack or applying to it also keeps it in Saved, so you can track it.",
      "A search from Find runs the steps above and stops there — every source at once, so the slowest source decides how long it takes. Scheduled searches stop there too. The steps below run only in an advanced automation you build yourself, and only while WonderJobs is open — a scheduled search never prepares or hands off an application:",
      "- Preparing application materials — résumé, cover letter and screening answers for the top three (strong first, then the best of the shortlist).",
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
    keywords: ["sources", "where was this job found", "duplicates", "linkedin", "indeed", "naukri", "glassdoor", "remotive", "jobicy", "remote ok", "himalayas", "arbeitnow", "adzuna", "part time", "part-time", "gig", "gigs", "freelance", "freelancer", "job type", "career sites", "greenhouse", "lever", "ashby", "jazzhr", "smartrecruiters", "the muse", "where do jobs come from", "needs setup", "switch off", "jobslake", "via"],
    updated: "2026-10-18",
    body: [
      "Wonder searches real, public job feeds and reads every posting itself. Nothing is invented, sampled or generated for your account.",
      "- Company career sites — public Greenhouse, Lever and Ashby boards of companies hiring in India and remotely (Stripe, Airbnb, Figma, GitLab, Databricks, Coinbase, Cloudflare, Twilio, MongoDB, Elastic, Datadog, Rubrik, Zscaler, Druva, Groww, CRED, Meesho, Atlan, Notion, Linear, Ramp, Replit, OpenAI, Zapier and more). Applications go straight to the employer.",
      "- SmartRecruiters career sites — the public career pages of Swiggy, Freshworks, Bosch, Continental and Delivery Hero. Applications go straight to the employer.",
      "- JazzHR career sites — the public job feeds of companies that hire through JazzHR. Applications go straight to the employer.",
      "- The Muse — employers that post on The Muse, including the India offices of large companies; you apply from The Muse's page for the role.",
      "- Jobicy, Remote OK, Himalayas — remote job feeds. Himalayas has no search of its own, so Wonder scans its newest postings.",
      "- Arbeitnow — Europe-focused, off by default. Remotive — its public feed exposes only a handful of listings, off by default.",
      "- Part-time and gig work — Himalayas part-time (Himalayas' part-time and short-term remote jobs), Adzuna India part-time (Adzuna's part-time postings; needs the same setup as Adzuna India) and Freelancer.com gigs (open fixed-price and hourly projects — the client isn't named publicly, and you bid on Freelancer.com to take one on).",
      "- Adzuna India — India-wide postings across boards; each card names the site the job lives on once Wonder has followed the link (“naukri.com via Adzuna India”). It shows 'Needs setup' and is skipped on a deployment where it isn't connected.",
      "- TheirStack — a licensed, paid job-data provider that includes postings from LinkedIn, Indeed, job boards and career sites worldwide. Because it's paid per job, Wonder asks it last, and only when the free sources found too few jobs matching your words; the search's Details always show a row for it saying why it was or wasn't asked. It shows 'Needs setup' where it isn't connected.",
      "Wonder doesn't search LinkedIn, Indeed, Naukri, Foundit or Glassdoor itself — they offer no public job APIs. Postings from some of them can arrive through TheirStack, and every card says where it came from. Turn sources on or off under You → Job sources; a source that's off is skipped in your next search.",
      "One search asks every source you have switched on, and the same role posted on several sources becomes one job. Every card says which source it came from (“via …”). Open a job → Sources & hiring signals → “Where this job was found” to see every listing, which one WonderJobs shows (the employer's own site when there is one) and which source each key field came from; “Check … now” re-reads the original listing. A search's Details show how many sources answered and what each returned.",
    ],
  },
  {
    id: "jobs",
    title: "Jobs, matches and quality",
    summary: "Reading a match score, fit labels, and hiring-confidence signals.",
    keywords: ["match", "score", "fit", "strong", "worth considering", "stretch", "low fit", "quality", "hiring confidence", "signals", "save", "saved", "shortlist", "not for me", "filters", "hidden", "filtered", "show me anyway", "compare", "share", "link", "job detail", "why this job", "why it fits", "warning signs", "scam", "ai read", "closed", "description"],
    updated: "2026-10-21",
    body: [
      "Every job shows a fit label: Strong Opportunity (82+), Worth Considering (68+), Stretch (55+) or Low-Fit — the percentage is there on hover, never on its own. The score is a weighted blend of skills, seniority, industry, career goal, location and compensation; Why it fits on the job's page sums up why Wonder surfaced the job and what to consider, then explains each one in plain language.",
      "Level is read from the job title first (an analyst or engineer is an individual role; an associate director is a director). When your search names a level, that's the one compared; otherwise your Career Profile's. A role one level below yours is at most Worth Considering, and two or more below at most a Stretch.",
      "Matching starts from rules you can read. Where WonderJobs AI is connected, a model also reads the best postings of a search against a short summary of your Career Profile (role, level, years, skills, industries and places — never your name or contact details) and gives each a score and a one-line reason. That score can move the rules' score a little, never replaces it, and your location, level and field limits still decide. The job's page lists it as “AI read of the posting”, and the search's evidence shows “Read by AI”. Nothing is hidden or applied because of it.",
      "Job quality is separate from fit: it estimates how likely a posting is to lead to a real hire from freshness, reposts, cross-posting, whether it appears on the employer's own site, salary transparency and source reliability. Low confidence roles are excluded from the shortlist. Where AI is connected it also reads the posting for warning signs from a fixed list — a fee to apply, bank or ID details asked up front, something that reads like a course or an ad, applying by chat app or personal email, commission-only pay, vague duties. A sign is shown only with the posting's own words as proof under “Posting read by AI”; a strong one lowers hiring confidence, and finding nothing never raises it.",
      "- Find has three views: All (where it opens), For you (worth considering and better) and Strong; Saved is its own place and shows every job you bookmarked, whatever its fit. Refine holds sort, level, work mode, when it was posted, minimum salary, location and Compare (see Finding jobs).",
      "- When jobs are hidden, a line below the list says how many and which preference hides each group, with Show me anyway and Update Career Profile preferences; when every job is hidden, Refine search options opens Refine too. Coming back from Career Profile with Back to Find searches again if you changed anything. Show me anyway never brings back a job you marked Not for me — undo that from the job itself.",
      "- Compare: Refine → Compare jobs, then tick two to four jobs to see them side by side. Wonder points out real differences; it doesn't pick a winner.",
      "- Save (the bookmark on a card or a job) keeps a job in Saved so you can track it as an application. Saved jobs keep their details across new searches. Only your Save puts a job there: starting an application (Apply, Prepare) puts it in your Pipeline, not in Saved. Not for me is on the job's own page: it hides the job and asks why (optional, Skip is fine); undo it from the same place. Mark roles for the same reason a few times and Wonder suggests treating it as a pattern (see Career Profile → What Wonder has learned).",
      "- A job's page opens on its description (More shows all of it — where a source shares only the start, Wonder says so and links the whole posting) with the Apply button right below or beside it. Why it fits, Requirements and skills, Company and Sources & hiring signals are folded underneath; open any of them when you want the detail.",
      "- A job's page address works for someone without an account: opened signed out, it shows the posting's public details (description, requirements, company and hiring signals) next to the sign-in form, and they sign in only to see their own match, save or apply. Copy it from your browser's address bar to share it.",
      "- If Wonder finds a posting has closed on the employer's or source's site, the job's page says “This posting has closed”, the job leaves your list, and it stays in Saved if you saved it. For a job board's listing (Adzuna) Wonder also follows its Apply link to the employer's own page; a posting found closed there is left out of everyone's searches from then on. Only a page that plainly says the job is gone counts — a blocked or unclear page leaves the job in place.",
      "- Signed-in accounts keep the best 300 discovered jobs between sessions; a new search refreshes the list.",
    ],
  },
  {
    id: "skill-up",
    title: "Skill Up",
    summary: "The skills and certifications your jobs ask for that you can learn, and where to learn them.",
    keywords: ["skill up", "skills", "skill gap", "learn", "learning", "course", "courses", "certification", "certifications", "certificate", "upskill", "train", "training", "coursera", "udemy", "edx", "linkedin learning", "youtube", "microsoft learn", "interview ready"],
    updated: "2026-10-21",
    body: [
      "Skill Up is under You (a row on the You page, and a tab at the top of You's pages). It compares the jobs that fit you — the Strong and Worth considering ones in your list, not closed or marked not for me — with the skills in your Career Profile. At the top: how many jobs it compared, how many skills to build and how many certifications they name.",
      "What you already bring: your own skills those jobs ask for most, with how many ask — the ones to lead with in your résumé and interviews.",
      "Skills to build: each skill shows how many of those jobs ask for it (“3 of 16 jobs”, with a bar for the share, and how many are Strong matches), counting skills a posting names in its text as well as its tags. Skills you listed as growth areas in your Career Profile come first, then specific skills, then broad ones such as Agile or Risk. Tap a skill for the jobs that asked — tap one to read it — and where to learn it. A skill has to be asked for by at least two jobs to count, unless you have only a few jobs. If you already have a skill, press I already have this: it's added to your Career Profile (Undo is in the message) and your jobs are re-scored. If you don't want to learn it, press Not for me: Skill Up won't suggest it again (Undo is in the message; Show them again at the bottom of the page brings back everything you removed). Certifications have Not for me too.",
      "My Saved Skills: press Save to learn on any skill or certification and it joins My Saved Skills at the top of Skill Up (Saved to learn takes it off again). My Saved Skills is folded, showing how many you saved and how far along you are; tap it to open the trackers. Each has a five-step tracker you set yourself — Not started, Learning, Practising, Confident, Expert for a skill; Not started, Studying, Practice tests, Exam booked, Earned for a certification — with how far along you are, and Where to learn opens the same courses as below. Once you're Confident in a skill, or have Earned a certification, Wonder suggests putting it on your résumé: Add to Career Profile adds it (a skill at the level you reached, a certification to your certifications; Undo is in the message), and Open Résumés is where you make a new résumé with it — every résumé is made from your Career Profile. Stop tracking with the × (Undo is in the message). Wonder never changes your rating or your profile on its own.",
      "Confidence: every skill and certification has a score out of 100 in a ring — green High (70+), purple Medium (40–69), amber Low — and the list is in that order. It is higher the more of the jobs that fit you ask for it, the more of those are Strong matches, and the more plainly they ask (a skill tag or a named certification, rather than a passing mention). Broad skills count for less, and your growth areas for more. Open a row to see its own breakdown.",
      "Certifications employers ask for: credentials the same jobs name in their own words — well-known ones such as PMP, CISSP or ITIL, and “AWS / Microsoft / Google Cloud / Salesforce Certified …” roles — with how many jobs name each. Ones already in your Career Profile's certifications are left out.",
      "Where to learn: for a specific skill or a Microsoft certification, Microsoft Learn's own public catalog (its certifications and learning paths, with level and length) is shown first when it has a match by title — never for broad skills, which match too much to mean anything. For every skill and certification there are links that open Coursera, Udemy, edX, LinkedIn Learning and YouTube searching for that exact term — they are searches on those platforms, so what you see is what each platform lists today. Wonder doesn't rate or enrol you in anything.",
      "Nothing here is assumed: with no skills in your Career Profile, or no jobs that fit you yet, Skill Up says so and links to the step that fixes it. The old Learning page is now Skill Up.",
    ],
  },
  {
    id: "recruiters",
    title: "Recruiters: let companies find you",
    summary: "Open to recruiters, what they see, and messages from companies.",
    keywords: ["recruiter", "recruiters", "open to recruiters", "visible", "visibility", "privacy", "message", "messages", "inbox", "company", "employer", "headhunter", "block", "decline"],
    updated: "2026-10-20",
    body: [
      "You → Recruiters decides whether companies on WonderJobs can find you. It's off until you turn it on.",
      "What recruiters see is shown on the page before you turn it on: your first name and last initial, your headline, level, years, skills, places and work modes from your Career Profile, and an optional line you write. Never your email, phone, résumé or work history. It changes only when you press Update what recruiters see; Turn off removes it, and companies can no longer find you or start a new conversation.",
      "Messages from companies: when a recruiter writes to you, it shows here and you get a notification. Reply in the conversation, press Not interested (they can't write again unless you do), or Block the company. Open again undoes either.",
    ],
  },
  {
    id: "hiring",
    title: "Hiring: for employers and recruiters",
    summary: "A company's workspace: post jobs, find candidates, shortlist, report and message — by role.",
    keywords: ["employer", "employers", "hiring", "post a job", "job listing", "listing", "recruiter", "hiring manager", "owner", "team", "invite", "role", "roles", "permissions", "shortlist", "report", "talent", "candidates", "workspace", "company", "career site", "careers page", "applications", "applicants", "reminders"],
    updated: "2026-10-21",
    body: [
      "Hiring is in the avatar menu. Set up your company (its name and website) and you're its Owner; your job seeker account stays as it is. Hiring opens on a table of your workspaces (one per company you hire for): Open goes into one, and New workspace adds another, with its own jobs, team and applications. Inside a workspace, All workspaces goes back to the table and the picker switches between them. Owners have Edit and Delete at the end of each row: Edit changes the name and website (open jobs show the new name straight away, and a verified company that changes either is verified again); Delete asks you to type the company's name, then removes its jobs, applications, career sites, shortlist, messages, team and invitations (everyone's own account stays). It can't be undone. Colleagues join by invitation: an Owner invites their email under Team, and they sign in to WonderJobs with that email and open Hiring, where the invitation waits (Join or Decline).",
      "Roles: an Owner can do everything, including the team and roles. A Hiring manager posts and edits jobs, reads recruiters' reports and decides — Interview or Pass. A Recruiter finds candidates, shortlists and messages them, and reports them to hiring managers. Each person sees only the tabs their role uses, and WonderJobs checks the role again for every action. A workspace always keeps at least one Owner; anyone can leave.",
      "Jobs: Post a job (title, place, work mode, job type, salary if you want, description, skills and where to apply — your careers page or an email address). It starts as a draft; Open puts it in job seekers' searches on WonderJobs under your company's name, and Close takes it out. Until WonderJobs verifies your company, its open jobs tell job seekers it hasn't been checked yet. To verify it, an Owner presses Verify your company → in the note at the top of Hiring: if you're signed in with a work email on your company website's domain (not Gmail, Outlook or similar), Verify now does it at once; otherwise Request review asks the WonderJobs team, who check the website, the company's public registration and that you work there (about 2 business days) and email you when it's done. Add the website first (Hiring → the pencil next to the company). Changing the name or website later asks for verification again.",
      "Career sites: show your jobs on your own careers page (for example WonderID's) and take applications there. Under Jobs, open Career sites; an Owner adds a site and first chooses where the page is: Hosted by WonderJobs (no code: give a short company name and your page is jobs.wonderapps.biz/careers/<short name>, with your jobs, the apply form and applicants' status pages) or On our own website (your developers show the jobs with the careers API; write to connect@wonderapps.biz for the guide). Then the applications email (where new applications and reminders arrive) and how long applications are kept (6 to 36 months; then they're deleted with their history, as DPDP and GDPR require, and applicants are told when they apply), and, for a site on your own website, copies its key — shown once — into that site's settings. Edit changes any of these later; the key stays. Each job's row then has \"On <site>\": tick it, and the job shows on that page while it's open. Revoke stops the key at once. WonderJobs' own open positions are on jobs.wonderapps.biz/careers, a site on our own website like any other.",
      "Applications: what applicants sent from your career sites (name, email, phone, location, résumé link, LinkedIn and a note). The applicant gets a confirmation email with a link to see their status or withdraw, and everyone who can decide gets an email. Open one and press Start review, Invite to interview, Make an offer, Mark hired or Decline: WonderJobs emails the applicant a message for that step, with your note and a next-step link (a scheduling page, an offer letter) if you add them, and replies come to you. Owners and Hiring managers decide; Recruiters can read. If nobody acts for two days, the deciders get a reminder, every two days, up to three times.",
      "Talent: search by skills or role words, and a place if you want. Only job seekers who turned on Open to recruiters appear, with exactly what they chose to show. Shortlist one (for a job, with a note for the hiring managers) or Message them.",
      "Shortlist (Reports for hiring managers): recruiters keep notes and press Report to hiring managers; hiring managers see the reports and press Interview or Pass.",
      "Messages: the workspace's conversations with candidates. Recruiters and Owners write; Hiring managers can read. If a candidate declines or blocks your company, you can't write to them again unless they write back.",
    ],
  },
  {
    id: "applications",
    title: "Applications and the hand-off",
    summary: "Materials, review, submitting on the employer's site, tracking and follow-ups.",
    keywords: ["application", "apply", "submit", "hand-off", "handoff", "resume", "cover letter", "answers", "review", "tracker", "follow up", "follow-up", "interview", "status", "mark as submitted", "why doesn't wonder apply", "application pack", "download", "word", "docx", "timeline", "pipeline", "needs attention", "continue to employer", "add an application"],
    updated: "2026-10-16",
    body: [
      "The Application Pack is one workspace per application: a tailored résumé, cover letter and screening answers, a fit summary for the role, and anything the employer may ask for that your Career Profile doesn't hold. It opens with “Application ready”, listing only the materials that actually exist and who wrote each one (AI-generated draft, Edited by you, or Written by you).",
      "- Every draft is shown as formatted text you can edit in place; changes save as you type. Regenerate, compare and restore earlier versions at any time. How many drafts WonderJobs AI writes in a month depends on your plan; your own AI key has no limit from Wonder.",
      "- On an application's page, “Download resume (.docx)” and “Download cover letter (.docx)” save the current version as a Word file. For a designed PDF, choose a résumé template instead (see Your résumés and templates).",
      "Wonder submits on an employer's site only on an application where you set Submit for me to Always (see Apply with Wonder). Otherwise every application ends with a hand-off: Apply with Wonder fills the form for you (see Apply with Wonder), Open application page opens the employer's own form, you submit it there — yourself, or after Wonder filled it — and then choose Mark as submitted (or confirm in Apply with Wonder) so Wonder tracks it.",
      "- If you press Continue on a search with approvals still pending, those hand-offs are recorded as not approved; open the application later or rerun from that stage.",
      "- Pipeline → Applications opens with the stages — Preparing, Applied, Interview, Outcome — every stage shown, even when empty; on a phone a count strip at the top jumps to each. Needs attention (follow-ups due, interviews coming up, packs ready for review, employer replies) sits below it. Add starts tracking a saved job. Each card shows the company, role, location, work mode and any disclosed pay, and where the application stands; one you opened with Wonder goes back to Apply with Wonder, which asks whether you submitted. If a job's details can't be found any more, the card says “Job details unavailable” rather than guessing.",
      "- Each application keeps its own history: discovered, prepared, submitted, responses, interviews, outcome. Add notes and follow-ups; reminders appear in notifications and on the calendar.",
      "- Follow-up and thank-you emails: Wonder drafts one, you copy it and send it from your own email, then choose Mark as sent. Wonder has no recruiter's address and doesn't send email itself; each one is recorded in the audit log.",
      "- Insights (what's working, from your own activity — tap any count to open exactly what it counts) and Interview Prep (a prep sheet for each upcoming interview) are the other pages under Pipeline, with Calendar and This week. They organise real data from your own jobs and applications.",
    ],
  },
  {
    id: "apply-with-wonder",
    title: "Apply with Wonder",
    summary: "Wonder fills the employer's form with your approved details; you answer what only you can, review, and submit.",
    keywords: ["apply", "apply with wonder", "jobsapply", "autofill", "fill", "extension", "helper", "browser helper", "submit", "guided", "guide me", "application form", "captcha", "sign in", "password", "next", "continue", "cloud browser", "phone", "install helper", "reconnect", "stop", "multi-page", "pages", "remember answers", "sign-in connections", "workday account", "create account", "password", "apply for this job", "background", "submit this application"],
    updated: "2026-10-17",
    body: [
      "Open a job and choose Apply with Wonder; the page brings Start application into view. How you apply is set once under You → Automation → How you apply: Fill it in with the browser helper (Wonder opens the employer's form in your browser and fills it), Guide me (every value, answer and document is ready to copy here while you fill the form yourself), or Application Pack only (download everything and apply at your own pace). The Apply page shows your default with Change for this job beside it. Whichever you choose, you review and submit on the employer's own site — unless Submit for me is on for that application, when the helper submits once every required answer is yours. As plans are set today, Apply with Wonder is included in Pro and Max; a job's page says so if yours doesn't include it (see Plans, payments and your data).",
      "Where this deployment offers a cloud browser, a job whose link opens the employer's application system (Greenhouse — including company career pages built on it — Lever, Ashby, Workday, JazzHR and similar) or an arbeitnow listing shows Apply for this job; other jobs keep Apply with Wonder. From an arbeitnow listing, Wonder opens the employer's page its Apply link leads to straight away (Guide me too) — Progress shows where it went. Job boards that keep applying behind their own login or don't let automated browsers through (Adzuna, Naukri, LinkedIn, Indeed, Jobicy, RemoteOK, Himalayas, The Muse) don't offer it: open the listing and apply from there, with Guide me's values to copy. A searchable dropdown — a city, a school — gets your answer typed into its own search and the one matching choice picked; when several fit, the employer's own choices come to you here. Press it and Wonder fills the employer's form in the background — you never see that page. The button reads “Filling your application…” while it works, and Progress under it opens by itself, listing each step as it happens. Form fields, folded below it, lists what was filled, what's required and still open, and which optional fields were left empty. A question only you can answer appears right there, with the employer's own choices when it has them — including searchable dropdowns, which Wonder opens and picks your answer in. When every required field on the form's last page is filled, the button becomes Submit this application; pressing it lets Wonder press the employer's Submit once and marks it “Submitted by Wonder”. Nothing is sent before that press, and Never for that application always wins. A form with an “I'm not a robot” check can't be submitted by Wonder: it says so, and you finish on the employer's page. If the link opens a job listing rather than the form, or the employer's site wants you to sign in or solve a check, Wonder stops, says why, and offers Open the employer's page so you can finish there yourself.",
      "- The helper fills only what comes from you: your Career Profile details, the résumé you chose, and answers you approved. It shows what it filled and what needs you, and the page keeps a plain list of what Wonder did.",
      "- It reads the whole form, fills a page, and then presses that page's own Next, Continue or Save and continue to reach the next one — repeating page by page until it gets to the page whose button submits. Unless Submit for me is on for that application, that is the only kind of button it presses; it stops at anything that submits, applies, sends, finishes or confirms, and when a required question is still open for you.",
      "- Equal-opportunity, work-authorization and sponsorship, legal-declaration and ID-number questions are yours unless you turned that group on under Automation → Sensitive questions, where you enter and confirm the exact answers it may use (ID numbers are stored encrypted and shown masked). Each group starts Off, and a blank answer is left for you. Signatures, passwords, date of birth and payment details are never filled. Your salary, notice period and employment status are filled only from answers you saved yourself under Career Profile → Application answers and confirmed in the last 30 days; otherwise they're yours too.",
      "- Phone numbers go in the right boxes: a separate country-code field gets its own value, and if the form rejects a format the helper tries the other spellings of your own number before leaving it to you.",
      "- After you type answers to questions the helper left for you, it offers Save N to your profile so the next form can fill them. Nothing is saved until you press it, and sensitive answers are never saved this way.",
      "- For questions its rules can't place, WonderJobs AI (where connected) may suggest which of your own saved answers fits; it is shown as “Your answer, matched by AI”, uses only the question's wording and the names of what you've saved (not the answers themselves), and is never used for work authorization or sponsorship. Wonder can also draft answers to open questions from your Career Profile, labelled as AI drafts; it asks you for any number rather than inventing one.",
      "- In your own browser you sign in on the employer's site yourself; the helper never reads password fields and never gets past a verification challenge — it waits for you.",
      "- In Apply for this job, when the employer's site wants an account (Workday and similar), Wonder offers Sign in as your saved account, Create an account for me (your email and a strong password Wonder generates; creating it accepts the employer's terms) or I already have an account. Nothing happens until you press one. Wonder keeps these in Account → Sign-in connections: the portal, the email and a masked password (stored encrypted, never shown again), who made it and how it last went; Remove forgets it. If the portal sends a verification email, open it, then press Continue. Turn Sign in to job portals off in Automation and Wonder never signs in for you.",
      "- You press the employer's submit button; the Apply page then asks “Did you submit the application?” and you confirm. Submit for me (under Options on the Apply page, or on the application's page) is Default (off), Always or Never for that application. With Always, the helper presses Submit itself once every required answer is yours, at most once per job, and the employer's confirmation marks it “Submitted by Wonder”. Never always wins.",
      "- If the employer's form doesn't appear within about 90 seconds, the page says so — nothing has been filled or sent — lists the usual reasons (you need to sign in first, you're on the job description rather than the form, or the helper isn't on that page) and offers Open the page again, Guide me instead, Stop or Keep waiting.",
      "- If the page moves to an unexpected site or asks for payment, Wonder stops and says why. If a job board sent you to a different employer page, Wonder asks “Is this your application for … at …?” and reads nothing until you choose Continue. Stop the helper under Options on the Apply page, or in the helper itself, halts it at any time.",
      "The helper is a Chrome, Edge or Brave extension, installed from the Extension page (its Chrome Web Store listing is in review). Greenhouse, Lever, Ashby and Workday forms run it automatically; on other sites its panel asks you to allow that one site, then Fill the form on this tab — and it fills fully there too, even for an application you didn't start in WonderJobs. Workday, SmartRecruiters and Workable forms need you more often. After installing or updating it, reload the Apply page.",
      "The helper's icon also opens a side panel beside any job you're looking at: it reads that posting (only when you open the panel, or on LinkedIn and Naukri if you choose Always read jobs on LinkedIn and Naukri), scores it against your Career Profile — or asks you to add your role and skills first — and Save puts it in your Pipeline in one click. It only reads the page; it never presses anything there.",
      "No extension — on a phone, say? For a job on an employer's application system, the Apply page fills it in the background the same way as Apply for this job; the employer's page is never shown. Other jobs (a job board's or careers site's listing) need the browser helper, or Guide me, which works everywhere.",
      "Save the job from the Apply page with the Save button at its top. Options (folded on the side) holds how much Wonder does — Guide me, or Fill for me (it fills safe fields as soon as the form opens when your Automation rule for filling forms is Automatic, and when you click Fill otherwise) — plus Submit for me, Stop the helper, Download Application Pack and Cancel this application.",
    ],
  },
  {
    id: "resume-templates",
    title: "Your résumés and templates",
    summary: "Upload the résumé you already use, mark a base résumé, or generate one from eight ATS-friendly templates.",
    keywords: ["resume", "résumé", "cv", "template", "pdf", "docx", "word", "ats", "download", "executive", "technical", "classic", "leadership", "career shift", "academic", "creative", "modern", "my resumes", "upload", "base resume", "base résumé", "own resume", "file", "rename", "name"],
    updated: "2026-10-16",
    body: [
      "You → Résumés opens on My resumes: your own résumé files, the résumés you generated, and tailored drafts from applications.",
      "- Upload résumé adds the résumé you already use — a PDF or Word (.docx) file up to 3 MB, five files at most. It's checked by its contents (a real PDF or Word file, with no scripts, macros or password protection), stored encrypted, and attached to applications exactly as you uploaded it. Download or delete it any time, and tap its name to rename it — the name is what the employer sees.",
      "- Fill Career Profile on a file reads it and proposes your work history, education, certifications and contact details for the Career Profile — you tick what to add (see Career Profile).",
      "- Set as base marks the résumé Wonder offers first when you apply — one of your files or a generated résumé. Your first upload becomes your base if you have none; Wonder never picks one for you otherwise, and you can choose a different résumé for any job.",
      "Résumés → Templates shows eight designs — Executive, Modern Minimal, Technical, Classic ATS, Leadership, Career Shift, Academic / Research and Creative Modern — each previewed with your own details. Wonder recommends one and says why, from your profile. How many designs you can use depends on your plan; a design outside it says which plan has it.",
      "- Templates only change presentation. Every résumé shows the same facts from Career Profile → Work history, education and contact; nothing is invented, and changing template never edits your profile.",
      "- Generate runs real checks before you can download: required details, section order, layout (nothing cut off, no heading stranded at the bottom of a page), ATS structure (real text, standard headings) and your links. Anything that would make the file unreliable blocks the download; smaller items are shown first.",
      "- PDF and Word (DOCX) downloads are built from the same content. The PDF is made on your device, exactly as the preview shows it.",
      "- A generated résumé can be renamed on My resumes; the name is the file name on downloads and on the PDF handed over when applying.",
      "- From an application, “Choose a résumé template” makes a version for that job: your own experience and skills, ordered by relevance to the role.",
      "- My resumes keeps every résumé you generate with the template version it used, so an old one reopens exactly as it was even after you update your profile.",
    ],
  },
  {
    id: "automation",
    title: "How much Wonder handles",
    summary: "Work with me or Work independently, how you apply, sensitive questions, and per-action rules.",
    keywords: ["automation", "level", "help me", "work with me", "work independently", "keep watch", "assist", "guided", "autonomous", "continuous", "policy", "permission", "ask me", "risk", "capability", "change one action", "restore defaults", "does on its own"],
    updated: "2026-10-17",
    body: [
      "You → Automation asks “How much should Wonder handle?” with two choices: Work with me (recommended) and Work independently. Under it, the page lists exactly what Wonder does on its own, asks you first, and never — read from the same rule the app enforces, so it can't drift from what happens. Sending is never Wonder's — not an email, not a message — and it submits an application only where you set Submit for me to Always.",
      "- Work with me: searching, comparing and drafting happen on their own where you allow them, and Wonder asks before anything that matters.",
      "- Work independently: anything you've set to Automatic under Change one action runs without asking each time — including preparing and handing off applications — and the helper fills a form as soon as it opens when filling is Automatic.",
      "- A level saved earlier as Help me or Keep watch shows as the nearer of the two.",
      "How you apply sets your default method for Apply with Wonder (the browser helper, Guide me, or the Application Pack only); you can still change it for one job on its Apply page.",
      "Change one action (folded under the level) sets a rule per action — Automatic, Ask me or Off: search and rank jobs, save strong matches (starts Off), draft a tailored résumé and draft a cover letter (both start Ask me, because each draft is an AI request), fill an employer's form in your browser, open the employer's page with your materials, draft a follow-up email, draft a recruiter message, change your Career Profile, and change what it searches for. Restore defaults puts them back.",
      "Sensitive questions has four groups, each Off until you turn it on: equal-opportunity questions, work authorization and sponsorship, legal declarations, and ID numbers. Turning one on opens a dialog where you confirm the exact answers it may use — equal-opportunity questions offer the usual answers in a dropdown, or Something else… for your own words; Wonder never infers them.",
      "- Fill application forms (Apply with Wonder) starts as Ask me. Even on Automatic it only fills fields and, page by page, presses the form's own Next — it doesn't submit. Submitting is Submit for me on the Apply page or the application's page: Default (off), Always or Never for that application.",
      "- Low-risk work (reading and scoring) can run unattended. Medium-risk work (drafting) can run unattended but is always reviewable. High-risk work with external side effects (anything that reaches an employer) always follows your policy and is audited.",
      "- Whatever the level, nothing is ever sent to an employer without your approval.",
      "The same page lists your scheduled searches (see Scheduled searches).",
    ],
  },
  {
    id: "scheduled-runs",
    title: "Scheduled searches",
    summary: "Keep Wonder looking: daily or weekly searches, quiet unless something is worth your attention.",
    keywords: ["schedule", "scheduled", "daily", "weekly", "cron", "automatic run", "builder", "template", "notify", "silent", "keep looking", "every day", "every week", "run now", "duplicate", "pause", "advanced"],
    updated: "2026-10-16",
    body: [
      "You → Automation lists each scheduled search as one row — when it runs, what it waits for, how the last run went — with its on/off switch. New sets one up; change how often and when it tells you right in the row, run it now (the row then shows the step it's on and a progress bar, with Watch), or delete it (with Undo). Ready-made searches are one tap each: Weekday shortlist, Weekly roundup, Remote roles only, Top matches only, and one per role you've added — each searches your own Career Profile or role, never a canned term. Advanced search automation (the full builder) is a link at the bottom of a schedule's page.",
      "“How often should Wonder look?” — choose Every day (each morning at 8:00), Every week (Mondays at 9:00), Keep watch (every morning, and tells you only when something worth your attention appears) or I'll search manually (saved for one tap later), and describe what to look for in your own words — or pick one of your roles. “Only notify me when something worth my attention appears” keeps a run quiet otherwise. That's all a scheduled search needs. How many can be on at once, and whether they can run daily or Keep watch, depends on your plan; Wonder says which limit stopped you and which plan has it.",
      "Scheduled searches repeat a search: they find, compare and rank, and never prepare or hand off an application. Each schedule has a condition such as 'strong matches found' or 'new jobs found': if the condition is not met the run finishes quietly and you are not notified. Silence is a valid outcome. A duplicate starts paused until you switch it on.",
      "When WonderJobs is open, a scheduled search runs on the minute. When it's closed, searches run at the server's daily check, between 7:30 and 8:30 am India time: one due within the hour after that check runs then — up to an hour early — and one set for later in the day runs at the next morning's check.",
      "The builder lets you set trigger, frequency, conditions, actions, AI provider and model, or start from a template.",
      "- Turn on notifications under Account → Notifications on this device to get a nudge on your phone or desktop when a scheduled search finds strong matches. It's per browser, permission is only asked when you press the button, and everything still appears in the app either way.",
      "- Schedules fire on Wonder's servers as well as in your browser, so a run still happens while you're away — with the app open they fire at exactly their time, and when it's closed the server picks them up on its next sweep. Either way the results are waiting when you next sign in, and a schedule never runs twice for the same occurrence.",
      "- Stages that need you — preparing materials, your review, the hand-off to an employer — are never done without you. A scheduled run finds, scores and shortlists; you decide what to do with it.",
    ],
  },
  {
    id: "calendar",
    title: "Calendar, notifications and the app",
    summary: "Put interviews and follow-ups in your own calendar, see your week at a glance, get nudges and an activity email, and install WonderJobs on your phone.",
    keywords: ["calendar", "google calendar", "outlook", "apple calendar", "ical", "ics", "subscribe", "interview", "reminder", "notifications", "push", "install", "app", "home screen", "phone", "iphone", "android", "pwa", "email", "activity email", "digest", "unsubscribe", "stop emails", "bell", "dashboard", "summary", "week", "kpi", "charts"],
    updated: "2026-10-16",
    body: [
      "The calendar shows everything with a date: interviews, follow-ups and scheduled searches. Open it from Pipeline → Calendar, or by typing “Calendar” in Ask Wonder.",
      "- Subscribe has one button each for Google Calendar, Apple Calendar, Outlook.com and Outlook (work): each opens that app's own subscribe screen with your feed filled in, and you confirm there. Another app? Copy the link (folded underneath). Your calendar app keeps it up to date on its own — usually every 30 minutes or so, not instantly. It's read-only, and anyone with the link can see your upcoming interviews and follow-ups, so treat it like a password.",
      "- The bell at the top lists what happened as it happens: how each search you started went (Review matches, See jobs, or Change search when it found nothing), an application you opened with Wonder (Mark submitted), an application submitted, at interview, offered or closed, an AI-drafted résumé or cover letter ready (Review draft, labelled AI-generated), a saved job that closed, a follow-up due, and a search that needs you. Each has one button for the next step, and a repeat of the same message replaces the old one instead of piling up. Scheduled searches stay quiet unless they find something worth your attention.",
      "- Notifications on this device: Account → Notifications on this device (also in the avatar menu as Notifications & email) turns on a nudge on that phone or computer — when a scheduled search finds strong matches, and for follow-up and interview reminders — even while WonderJobs is closed. It's per browser, and permission is only asked when you press the button. It appears only where this deployment has notifications set up and your browser supports them.",
      "- This week (Pipeline → This week; the page is titled Dashboard): your last 7 days at a glance, counted from your own account — strong matches waiting, applications sent, interviews ahead and jobs reviewed; a Heads up and an Actions required list, each item a link; charts of jobs reviewed per day (14 days), your matches by fit and your application pipeline; and Going well, Needs improvement and Suggestions. It is the same reading as the activity email below, and suggestions written by AI are marked “Suggested by AI”.",
      "- Activity email: signed-in accounts get a short email when there has been activity, at most once a day, sent to your sign-in address. It says what happened, what's time-sensitive (interviews in the next week, follow-ups due, strong matches waiting, applications gone quiet), what's waiting on you, what's going well, what needs improving and a few suggestions — every number counted from your own account. Suggestions written by AI are marked “Suggested by AI”. If an email can't be sent, Email me one now says why. It's on by default: Account → Activity email (Notifications & email in the avatar menu) turns it off, or sends you one now so you can see it, and every email has a Stop these emails link.",
      "- Install the app: in Chrome, Edge and other Chromium browsers, Install app appears in the avatar menu when your browser allows it. On a phone or tablet, a banner at the top offers it too — one tap to Install where the browser can, or the Share → Add to Home Screen steps on iPhone and iPad. Close it and it stays away for 14 days; once installed it never shows again. The installed app is the same WonderJobs, always showing your live data.",
    ],
  },
  {
    id: "ai",
    title: "AI providers and your own keys",
    summary: "WonderJobs AI, bringing your own key, where AI is used, fallback and billing.",
    keywords: ["ai", "provider", "byok", "api key", "anthropic", "openai", "gemini", "claude", "gpt", "chatgpt", "billing", "cost", "fallback", "model", "wonderjobs ai", "paste key", "usage", "tokens", "drafts", "quota", "limit"],
    updated: "2026-10-16",
    body: [
      "Wonder uses AI in two ways, and the rules around both are fixed: AI proposes, Wonder's own checks decide. It never decides whether something is sent, whether an employer is contacted, or what your Career Profile says.",
      "**Drafting** (résumé, cover letter, answers, follow-ups, insights) uses the provider you choose under You → AI provider. WonderJobs AI is the default and is included in your plan: when this deployment has a model connected it writes real drafts at no charge to you, otherwise it produces clearly labelled template drafts. Every AI draft is labelled as AI-generated, and the AI provider page says which one is active.",
      "**Reading and checking** uses WonderJobs AI only, never your own key, and only where a model is connected — otherwise Wonder's rules do the whole job. (The one exception you start yourself is Read with AI on a résumé in Career Profile, which uses your active provider.) It is used to: read an Ask Wonder request the patterns don't recognise; re-score the best postings of a search and flag warning signs in them; propose a more common title when a search finds nothing; match form questions to your saved answers in Apply with Wonder; and suggest things in the activity email. Each result is checked before it is used — a reply must fit a fixed shape, quote words that really exist, or use only words that are already yours — and anything that doesn't is dropped and the rules' answer stands. Only the minimum goes to the model: postings' public text, a short summary of your profile without contact details, the question's wording, or the figures the email counted.",
      "Bring your own key: under AI provider, paste a key from ChatGPT (OpenAI), Claude (Anthropic) or Gemini — Wonder recognises whose it is, tries it once with a real request before keeping it (a key that doesn't answer is removed again), and your drafts use it from then on. “Don't have a key?” shows the steps and the one page to open. The key is encrypted at rest, never returned to the browser, never logged. Requests are billed to your provider account, which the product says plainly, and your own key never counts against a plan's monthly drafts. Advanced: models and several providers lets you pick a model per provider and test a connection.",
      "- If your provider fails, Wonder explains what went wrong (key rejected, rate limit, outage) and lets you retry or switch. It only switches to WonderJobs AI on its own when you have turned on Fall back to WonderJobs AI automatically (off by default), and it tells you when it did.",
      "- Usage lists AI requests, tokens and an estimated cost for your own keys; your provider's invoice is the source of truth.",
      "- WonderJobs AI drafts a month are limited by your plan; when you've used them Wonder says so and offers connecting your own AI or moving up a plan.",
    ],
  },
  {
    id: "account",
    title: "Account, security and privacy",
    summary: "Signing in, the avatar menu, password reset, what is stored where.",
    keywords: ["password", "reset", "forgot", "google", "magic link", "session", "sign out", "privacy", "security", "data", "delete", "encryption", "audit", "avatar", "account", "sync", "other browser", "different browser", "confirm email"],
    updated: "2026-10-16",
    body: [
      "Sign in with email and password, a magic link, or Google. Sessions are cookies verified on the server; requests without one are refused. Account (avatar menu → Account) shows your name, plan and AI provider, whether your data is synced, Notifications on this device, the activity email, Plan & billing and Your data, and has Sign out.",
      "- Forgot your password? Use 'Forgot password?' on the sign-in page. The link in the email opens a page to choose a new one and signs you in.",
      "- Show or hide what you typed with the eye icon on any password field.",
      "- An email link opened in a different browser or app from the one you started in (often a mail app's own browser) can't finish there. If it was to confirm your email, that's already done — sign in to continue. A password reset link only works in the browser you asked for it from: ask for a new one there.",
      "API keys (avatar menu → API keys, or Account → JobsLake API) creates and revokes keys for searching the same live job sources from your own code, shows this month's usage, and turns on pay-as-you-go where the deployment offers it. A key is shown once, when it's created. The API reference page lists every endpoint.",
      "Your Career Profile, jobs, applications, searches, schedules and settings are stored per account and kept on each device you use for speed. Signing out revokes the session and removes that device's copy. Provider keys are stored encrypted; external actions are written to an append-only audit log. Account says “Synced to the cloud” when your data is being saved to your account, and “Stored on this device only” if this deployment can't save to accounts.",
    ],
  },
  {
    id: "billing-data",
    title: "Plans, payments and your data",
    summary: "Free, Pro and Max, paying with Razorpay or Stripe, cancelling, and downloading or deleting your data.",
    keywords: ["pro", "max", "free", "plan", "plans", "upgrade", "billing", "payment", "pay", "razorpay", "stripe", "upi", "card", "subscription", "cancel", "refund", "invoice", "export", "download", "delete", "erase", "gdpr", "dpdp", "privacy", "consent", "grievance", "limit", "try a plan", "testing", "your data", "plan & billing"],
    updated: "2026-10-16",
    body: [
      "Plan & billing (avatar menu → Plan & billing) shows your plan and why — for example “Renews 1 Nov 2026 · confirmed by Razorpay”. The plan changes only when Razorpay or Stripe confirms a payment to our server; coming back from the payment page doesn't change it by itself.",
      "WonderJobs has three plans — Free, Pro and Max. A plan sets how much you can use: how many scheduled searches can be on at once and whether they can run daily or Keep watch, how many drafts WonderJobs AI writes a month (your own AI key never counts), how many roles you can search as, how many résumé designs you can use, and whether Apply with Wonder is included. The card lists the numbers and the monthly price of each plan above yours, and those can change over time. When a limit stops you, Wonder says which one and which plan includes it. Nothing you already have is deleted when a plan lapses — limits apply to new use.",
      "- Paying: where a provider is connected, choose the plan and pay with Razorpay (UPI AutoPay, cards, net banking) or Stripe (international cards, Apple Pay, Google Pay). You pay on their page; WonderJobs never sees your card, UPI or bank details.",
      "- If a provider says “Needs setup” or “Unavailable”, this deployment hasn't connected it or can't reach it right now — nothing is charged. Until a provider is connected, the card may offer “Try a plan — testing, no payment”: switch between Free, Pro and Max to see what each allows, with nothing charged. A real subscription always wins over a trial.",
      "- Back from paying, the card waits for the provider to confirm and updates by itself, usually within seconds. If it hasn't confirmed, nothing is charged twice; the plan updates when it does.",
      "- Cancelling: Razorpay subscriptions have Cancel subscription on the same card; Stripe subscriptions use Manage billing on Stripe (also for invoices and changing your card). Either way it ends at the close of the period you've paid for.",
      "- Payments: the card lists each payment and failed payment the provider reported.",
      "Your data (avatar menu → Your data):",
      "- Download my data: one JSON file with everything stored for your account — profile, jobs, applications, searches, settings, which AI keys are connected (never the key itself), notification devices, the record of what Wonder did, your contact messages, payments and your notice acceptances. Uploaded résumé files are listed with a link each; download them from Résumés.",
      "- Delete account: type DELETE MY ACCOUNT to confirm. Your sign-in and data are deleted at once; payment records (kept at least 8 years for tax law) and a one-way hash of the request are all that remain. Cancel an active subscription first.",
      "The first time you sign in, and whenever the privacy notice changes, you're asked to confirm you're 18 or older and accept it. Questions or complaints about your data go to the contact shown under Your data and on the privacy notice.",
    ],
  },
  {
    id: "troubleshooting",
    title: "When something goes wrong",
    summary: "What to check first for the most common problems, and how to reach us.",
    keywords: ["problem", "error", "not working", "doesn't work", "broken", "stuck", "help", "fail", "failed", "can't", "cannot", "no jobs", "no results", "nothing found", "didn't finish", "upload", "wrong", "contact", "support", "reach", "bug", "report", "unavailable", "needs setup", "not installed", "blocked", "link"],
    updated: "2026-10-16",
    body: [
      "Most problems have a message on the screen that says what to do. If yours doesn't, start here — and if it's still stuck, use the contact form (see the end of this section).",
      "- Find shows no jobs, or only weak ones: open Refine for what was searched, then Details for each source's count — a source marked Needs setup or Unavailable wasn't searched. Wonder already retries wider once and says what it let go. Then check Career Profile: name your field in Role you want (“identity and access management director”, not only “director”), add the specific skills you use, add your places (and “Remote” if it suits), and turn on the sources you want under Job sources.",
      "- “The last search didn't finish” (the status line at the top of Refine): press the circular arrow (Try again). A failed search isn't retried by itself for ten minutes. Details names the source that failed.",
      "- A job disappeared: its posting closed, and Wonder checked it against the employer's site. It stays in Saved if you saved it.",
      "- A résumé upload is refused: it must be a PDF or Word (.docx) file up to 3 MB with no password, scripts or macros, and you can keep five. A scanned, image-only PDF has no text to read — export a text PDF, or paste your résumé into Career Profile → Fill from your résumé.",
      "- The Apply page says the helper isn't installed: install it from the Extension page, then reload the Apply page. If it was installed or updated while the page was open, reload too; Reconnect helper (under Options) re-pairs it. You can always choose Guide me instead, which needs nothing installed.",
      "- Apply with Wonder stopped: it says why — a sign-in, a verification challenge, a question only you can answer, a page it doesn't know, or the page that submits. Do that step on the employer's page and carry on; Stop and Cancel this application never submit anything.",
      "- “Waiting for the application form” for a long time: after about 90 seconds the page says the form hasn't appeared and nothing was filled or sent. Sign in on the employer's site, open the actual application form (not the job description), or choose Guide me instead.",
      "- Apply for this job says Wonder can fill it only on the employer's application system: the job's link is a job board's or careers site's listing. Open the employer's page and use Guide me.",
      "- “Apply with Wonder is on Pro and Max” or “You've used this month's drafts”: that's a plan limit, not a fault. Plan & billing shows what each plan includes; your own AI key removes the draft limit.",
      "- Notifications won't turn on: your browser may be blocking them for WonderJobs — allow them in the site settings. On iPhone, add WonderJobs to your Home Screen first. In Brave, turn on “Use Google services for push messaging” in its privacy settings.",
      "- Sign-in or email link problems: see Account, security and privacy — a link opened in another browser can't finish there. “That email and password don't match” — try again or use a magic link; passwords need 8 characters or more; too many attempts need a minute's wait.",
      "- An AI provider key is rejected: Wonder tests a key once before keeping it and removes one that doesn't answer. Check you pasted the whole key and that your provider account has credit, or carry on with WonderJobs AI.",
      "- A payment you made isn't showing: the plan changes when the provider confirms it, usually within seconds. If it hasn't, nothing is charged twice; check Plan & billing again shortly.",
      "To reach the team, use Contact us at the end of the WonderJobs home page (the Still stuck? box below also links to it). Say which page you were on and what you expected; a screenshot helps. For a question or complaint about your data, use the contact shown under Your data.",
    ],
  },
  releaseNotesSection,
  {
    id: "roadmap",
    title: "Roadmap and known limitations",
    summary: "What is not there yet, in the open.",
    keywords: ["roadmap", "backlog", "coming", "limitation", "not supported", "missing", "future", "planned", "billing", "pro", "email delivery", "scheduler", "chrome web store"],
    updated: "2026-10-16",
    body: [
      "This is what WonderJobs doesn't do yet, in the open, and what is planned. Anything not listed here is meant to work today; if it doesn't, see When something goes wrong.",
      "- Simplified screens (done): four places — Find, Saved, Pipeline, You — with jobs first on every screen, CV-first onboarding, and every page trimmed to its one job. The product runs on real accounts and real data only.",
      "- Follow-up emails are drafted for you to copy and send yourself; sending them from WonderJobs is planned once a mail provider is connected.",
      "- More sources: employer boards, official APIs and feeds are added over time, each switched on only after a real test. Adzuna India shows Needs setup where it isn't connected; LinkedIn, Indeed and Naukri stay off until a partnership exists.",
      "- Plans: Free, Pro and Max exist with the limits Plan & billing lists, but whether you can pay depends on whether Razorpay or Stripe is connected on this deployment. Prices and limits can change; Plan & billing is always the current answer.",
      "- Interview Prep and Skill Up are early: they organise your prep and your learning, with deeper AI coaching and progress tracking planned. Résumé templates have no two-column or photo layouts or US Letter page size yet, and filling the Career Profile reads projects and publications only if you add them yourself. A role changes a search's terms, goal and résumé, not how matching weighs your skills.",
      "- Calendar: you can subscribe to a read-only feed today (see Calendar, notifications and the app). A direct two-way connection with Google or Microsoft calendars is planned.",
      "- Apply with Wonder: the browser helper isn't in the Chrome Web Store yet (install it from the Extension page meanwhile), and no employer's application API is connected — Wonder helps in your browser instead, and forms it doesn't know are read by their labels, so unusual questions are left for you. Wonder submits an application only where you set Submit for me to Always; there is no account-wide switch for it yet.",
      "- The browser helper's side panel reads, scores and saves a job today; tailoring a résumé, follow-up reminders and recruiter-message drafts from the panel are planned.",
    ],
  },
];

export const HELP_FAQ: HelpFaq[] = [
  { q: "Does Apply with Wonder submit applications for me?", a: "Only if you ask it to. By default Wonder fills what it can from your own approved details, moves on with the page's own Next or Continue button, and stops at the page that submits — you press the employer's submit button, then confirm in WonderJobs. Set Submit for me to Always on one application (Options on the Apply page, or the application's page) and the helper presses Submit once every required answer is yours, at most once, and marks it “Submitted by Wonder”. Apply for this job on a job's page works the same way: its Submit this application button is that ask, for that one application.", section: "apply-with-wonder" },
  { q: "Do I have to give WonderJobs my job-portal password?", a: "No. You can always sign in on the employer's own site yourself, and the browser helper never reads password fields. If you'd like Wonder to sign in during Apply for this job, it can create the account for you or use one you add; those sign-ins are stored encrypted under Account → Sign-in connections, used only when you press Sign in for an application, and you can remove them any time.", section: "apply-with-wonder" },
  { q: "Does the helper press buttons on the employer's form?", a: "Two kinds only: the page's own Next, Continue or Save and continue, after it has filled that page and when your Automation rule allows filling; and the final Submit, only when Submit for me is Always for that application and every required answer is yours. Nothing else, and it stops when a question is waiting for you.", section: "apply-with-wonder" },
  { q: "Can I apply from my phone?", a: "Yes. Guide me works anywhere: open the employer's page and copy each value from the Apply page. For a job on an employer's application system, Apply for this job also fills it in the background and asks you the rest in WonderJobs.", section: "apply-with-wonder" },
  { q: "The Apply page says the browser helper isn't installed.", a: "Install it from the Extension page (Chrome, Edge or Brave), then reload the Apply page. Or choose Guide me, which needs nothing installed. After an update, reload any open WonderJobs tab; Reconnect helper under Options re-pairs it.", section: "apply-with-wonder" },
  { q: "Why does Wonder ask me for my salary or notice period?", a: "Employer forms ask. Add your current and expected salary, notice period and employment status once under Career Profile → Application answers and the helper fills them, asking you again after 30 days. Equal-opportunity, work-authorization, legal and ID questions are filled only if you turn that group on under Automation → Sensitive questions.", section: "career-dna" },
  { q: "Where do the jobs come from? Are they real?", a: "Yes. Searches read live public feeds and company career boards, read each posting and score it. Nothing is generated or sampled for your account, and every card says which source it came from.", section: "sources" },
  { q: "Why doesn't Wonder search LinkedIn, Naukri or Indeed?", a: "They don't provide public job APIs, so Wonder doesn't search them itself. Where TheirStack, a licensed job-data provider, is connected, postings it collected from them can appear — and every card says where it came from.", section: "sources" },
  { q: "Can I turn a job source off?", a: "Yes. You → Job sources has a switch per source; one that's off is skipped in your next search. A source marked Needs setup isn't connected on this deployment and isn't searched.", section: "sources" },
  { q: "Why does a great-looking remote job show as 'Worth Considering' rather than 'Strong'?", a: "The employer restricts hiring to a region you are not in. Wonder never marks a role strong when you could not be hired for it.", section: "jobs" },
  { q: "Does AI decide which jobs I see?", a: "No. Matching starts from rules you can read. Where WonderJobs AI is connected, a model also reads the best postings and can move a score a little, shown as “AI read of the posting”; your location, level and field limits still decide, and nothing is hidden because of it.", section: "jobs" },
  { q: "Can I apply with my own résumé file instead of a template?", a: "Yes. Résumés → My resumes → Upload résumé (PDF or Word, up to 3 MB). Set it as your base résumé and Apply with Wonder offers it first; it's attached exactly as you uploaded it, and stored encrypted until you delete it.", section: "resume-templates" },
  { q: "Will my résumé template make things up to look better?", a: "No. Templates render only the roles, education, skills and contact details in your Career Profile. For a specific job Wonder may reorder your own points by relevance; it never adds an achievement, number or skill.", section: "resume-templates" },
  { q: "What résumé files can I upload, and why was mine refused?", a: "A PDF or Word (.docx) file up to 3 MB, five files at most, with no password, scripts or macros. Wonder checks the file itself, not just its name. A scanned, image-only PDF has no text to read for Fill Career Profile — export a text PDF or paste the text.", section: "resume-templates" },
  { q: "How do I rename a résumé?", a: "Résumés → My resumes: tap the file's name (or a generated résumé's name) and save the new one. It is the name employers see on downloads and when it is attached to an application.", section: "resume-templates" },
  { q: "Does Wonder apply for me?", a: "It prepares everything and can fill the employer's form, then hands off: you submit on the employer's page and mark it submitted so it is tracked. It presses Submit itself only on an application where you set Submit for me to Always.", section: "applications" },
  { q: "Can I download my tailored résumé and cover letter?", a: "Yes. On the application's page, “Download resume (.docx)” and “Download cover letter (.docx)” save the current versions as Word files. For a designed PDF, pick one of the résumé templates.", section: "applications" },
  { q: "What can I ask Wonder?", a: "Things like “What should I focus on today?”, “Why didn't you show the Razorpay role?”, “What skills am I missing?” or “Search for backend roles weekly”. Wonder answers from your own data and opens the right place; anything else becomes a job search.", section: "ask-wonder" },
  { q: "Can I say what I'm looking for instead of typing?", a: "Yes. Tap the mic in the search box on Find and speak; your words land in the box so you can fix them, then press Search. Your browser's own speech service does the transcription, and the mic only appears in browsers that have one.", section: "finding-jobs" },
  { q: "Which role is Wonder searching for, and how do I change it?", a: "The top line of Find says “Looking for …”. Change edits Role you want in place and searches for it at once. It needs a role and its field, not a level alone.", section: "finding-jobs" },
  { q: "Why doesn't the list change while I type in the search box?", a: "Your words apply when you press Search (or Enter), which searches every source you have switched on. Refine holds location, level, work mode, posted, salary and sort.", section: "finding-jobs" },
  { q: "Wonder found nothing. What now?", a: "Wonder already searched once more, wider, and says what it let go. Open Details to see each source's count, then name your field rather than one title in Role you want, add your places and check Job sources. A source marked Needs setup or Unavailable wasn't searched.", section: "troubleshooting" },
  { q: "Why are some jobs hidden?", a: "Your preferences hide them — location, fit, salary and so on. Find says how many each preference hides, with Show me anyway and Update Career Profile preferences. Jobs you marked Not for me stay hidden until you undo that on the job itself.", section: "jobs" },
  { q: "Can I share a job with someone who doesn't use WonderJobs?", a: "Yes. Copy the job page's address from your browser. Opened without an account, it shows the job's real details beside the sign-in form, and they sign in only to see their own match, save or apply.", section: "jobs" },
  { q: "Why did a job disappear from my list?", a: "Wonder checks the jobs on screen against their own sites, and the posting had closed. The job's page says so, and it stays in Saved if you saved it.", section: "jobs" },
  { q: "Can I add my interviews and follow-ups to Google Calendar or Outlook?", a: "Yes. Calendar → Subscribe has one button each for Google Calendar, Apple Calendar, Outlook.com and Outlook (work); confirm in that app and it keeps itself up to date. Keep the link private — anyone with it can see those dates.", section: "calendar" },
  { q: "Does WonderJobs email me?", a: "Yes, by default: a short activity email when something has happened, at most once a day, to your sign-in address. Turn it off, or send yourself one to see it, under Account → Activity email (Notifications & email in the avatar menu), or with Stop these emails in any message.", section: "calendar" },
  { q: "Where can I see how my week is going?", a: "Pipeline → This week shows your last 7 days from your own account: strong matches waiting, applications sent, interviews ahead, what needs you, charts of your searches, matches and applications, and what's going well or needs improving.", section: "calendar" },
  { q: "How do I stop the activity email?", a: "Account → Activity email (Notifications & email in the avatar menu) has Turn off, or use Stop these emails at the bottom of any message. You can turn it back on from the same place.", section: "calendar" },
  { q: "Can I install WonderJobs on my phone?", a: "Yes. In Chrome or Edge, choose Install app in the avatar menu when it appears. On iPhone, use Safari's Share → Add to Home Screen.", section: "calendar" },
  { q: "Notifications won't turn on. What should I check?", a: "Your browser may be blocking them for WonderJobs — allow them in its site settings and try again. On iPhone, add WonderJobs to your Home Screen first. In Brave, turn on “Use Google services for push messaging” in its privacy settings. The card only appears where this deployment has notifications set up.", section: "calendar" },
  { q: "I closed the app while a run was waiting for my review. Is it lost?", a: "No. The run is restored as waiting; open it and press Continue.", section: "runs" },
  { q: "Can Wonder read my resume instead of me typing all this?", a: "Yes. Use 'Import from resume' on the Career Profile page or during onboarding: PDF, Word or pasted text. It suggests each field with the words it came from, you tick what to keep, and the file is discarded afterwards. Scanned PDFs have no text to read — paste those.", section: "career-dna" },
  { q: "I'm open to different kinds of roles. Can Wonder search for each?", a: "Yes. Career Profile → Other roles you'd take → add a role, each with its own search terms, goal and résumé (how many depends on your plan). Pick it under Search as in Refine on Find, or when you schedule a search; jobs it finds say which role found them, and Apply offers that role's résumé first. Matching still uses your whole Career Profile.", section: "career-dna" },
  { q: "Can Wonder fill in my work history and education from my résumé?", a: "Yes. Résumés → My resumes → Fill Career Profile on your file (or Import from resume on the Career Profile page). Wonder proposes roles, dates, achievement lines, education, certifications and contact details, each with the words it came from; you tick what to add, and nothing you already have is overwritten unless you choose to. Read with AI can find what the rules missed, but only entries written in your résumé are shown.", section: "career-dna" },
  { q: "What has Wonder learned about me, and can I turn it off?", a: "Career Profile → What Wonder has learned lists patterns from the jobs you save, apply to, mark Not for me and the places you search, each with its evidence. They only nudge ranking. Yes, keep this strengthens one; Turn off stops it for good.", section: "career-dna" },
  { q: "I got zero strong matches. What now?", a: "Look at the note below your jobs first — it names what's weakening your matches and fixes it in one tap. Then check your Career Profile: name your field in Role you want (e.g. “identity and access management”, not only “Senior Director”), add the specific skills you use (tools, platforms, your discipline), and add 'Remote' to locations if remote works for you.", section: "career-dna" },
  { q: "Where does Wonder use AI, and what does it never decide?", a: "AI drafts your documents and, where WonderJobs AI is connected, helps read requests, postings and form questions. Every result is checked, and without it Wonder's rules do the job. AI never decides whether anything is sent, whether an employer is contacted, or what your Career Profile says.", section: "ai" },
  { q: "Are AI drafts real or templates?", a: "Real when the deployment has WonderJobs AI connected or you connect your own key; otherwise clearly labelled templates. The AI provider page shows which.", section: "ai" },
  { q: "Is my API key safe?", a: "It is encrypted at rest, only ever used from the server, never returned to the browser or logged, and you can remove it any time.", section: "ai" },
  { q: "What do Free, Pro and Max include?", a: "Each plan sets how many scheduled searches can be on, whether they can run daily or Keep watch, how many WonderJobs AI drafts you get a month, how many roles and résumé designs you can use, and whether Apply with Wonder is included. Account → Plan & billing lists the current numbers and prices.", section: "billing-data" },
  { q: "I've hit a plan limit. What can I do?", a: "Wonder names the limit and the plan that includes it. Connecting your own AI removes the monthly draft limit; otherwise move up a plan on Plan & billing. Nothing you already have is deleted.", section: "billing-data" },
  { q: "How do I pay for a plan, and is my card safe?", a: "Avatar menu → Plan & billing → choose a plan and pay with Razorpay (UPI, cards, net banking) or Stripe (international cards), where a provider is connected. You pay on the provider's own page; WonderJobs never sees your card, UPI or bank details, and your plan changes only when the provider confirms the payment.", section: "billing-data" },
  { q: "How do I cancel my subscription?", a: "Plan & billing: Cancel subscription (Razorpay) or Manage billing on Stripe. It ends when the period you've paid for ends, with no further charge.", section: "billing-data" },
  { q: "Can I try Pro or Max without paying?", a: "Where no payment provider is connected on this deployment, Plan & billing offers “Try a plan — testing, no payment” so you can see what each plan allows. Nothing is charged, and a real subscription always takes over from a trial.", section: "billing-data" },
  { q: "How do I download or delete my data?", a: "Avatar menu → Your data. Download my data gives you everything as one JSON file; Delete account deletes your sign-in and data at once, keeping only payment records the law requires.", section: "billing-data" },
  { q: "How do I reset my password?", a: "Use 'Forgot password?' on the sign-in page; the emailed link opens a page to choose a new one. Open it in the same browser you asked from.", section: "account" },
  { q: "My email link says it opened in a different browser.", a: "Links only finish in the browser you started from. If it was to confirm your email, that's already done — sign in. For a password reset, ask for a new link from the browser you want to use.", section: "account" },
  { q: "How do I set up a scheduled search?", a: "You → Automation: tap a ready-made search (Weekday shortlist, Weekly roundup, Remote roles only, Top matches only, or one per role), or New to say what to look for and choose Every day, Every week, Keep watch or I'll search manually. Your plan sets how many can be on at once and how often they can run.", section: "scheduled-runs" },
  { q: "Will scheduled searches happen while I'm away?", a: "Yes. Wonder's servers fire schedules too, so a run happens while you're away and the shortlist is waiting when you sign in. With the app open they fire at exactly their time; with it closed the server picks them up on its next sweep. Anything needing your approval still waits for you.", section: "scheduled-runs" },
  { q: "Can Wonder notify me on my phone?", a: "Yes — Account → 'Notifications on this device' (Notifications & email in the avatar menu). You'll get a nudge when a scheduled search finds strong matches and for follow-up and interview reminders. It's per browser, so turn it on wherever you want it. On iPhone, add WonderJobs to your Home Screen first; that's Safari's rule, not ours.", section: "calendar" },
  { q: "Can I change my automation level later?", a: "Yes, any time under You → Automation: Work with me or Work independently, plus a rule per action, how you apply and sensitive questions. High-risk actions always follow your policy.", section: "automation" },
  { q: "Can Wonder answer equal-opportunity or work-authorization questions?", a: "Only if you turn that group on under You → Automation → Sensitive questions and confirm the exact answers to use. Each group starts Off; signatures, passwords, date of birth and payment details are never filled.", section: "automation" },
  { q: "What does the browser helper's side panel do?", a: "Open it beside a job posting and it scores the job against your Career Profile and saves it to your Pipeline in one click. It only reads the page you have open — on LinkedIn and Naukri only when you open the panel, unless you choose to have it read them automatically.", section: "apply-with-wonder" },
  { q: "Why is the help center only available when I'm signed in?", a: "It describes your account's own pages and settings. Signed out, you can still reset your password from the sign-in page or reach us with Contact us on the home page.", section: "account" },
  { q: "How do I contact someone about a problem?", a: "Use Contact us at the end of the WonderJobs home page, or the Still stuck? box below. Say which page you were on and what you expected; a screenshot helps. For a question about your data, use the contact shown under Your data.", section: "troubleshooting" },
];

/** Deterministic retrieval: the sections that best match a question, best first. */
export function searchHelp(question: string, max = 3): { section: HelpSection; score: number }[] {
  const terms = helpTerms(question);
  if (!terms.length) return [];
  return HELP_SECTIONS.map((section) => {
    const hay = `${section.title} ${section.summary} ${section.body.join(" ")}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (section.keywords.some((k) => k.replace(/[^a-z0-9 ]/g, " ").split(" ").some((w) => sameWord(w, t)))) score += 3;
      if (section.title.toLowerCase().includes(t)) score += 2;
      if (t.length > 2) score += Math.min(hay.split(t).length - 1, 4) * 0.5;
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

/** Two-letter words worth searching for ("AI", "CV"); every other short word is noise. */
const SHORT_TERMS = new Set(["ai", "cv"]);

function helpTerms(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => (w.length > 2 || SHORT_TERMS.has(w)) && !STOP.has(w));
}

/**
 * Whether a keyword word and a question word are the same word: equal, or one inside the other when the
 * shorter is 4+ letters ("notification" in "notifications"), or 3 letters differing by a plural
 * ("job"/"jobs"). Never "pro" in "profile" or "ai" in "email".
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.includes(short) && (short.length >= 4 || long.length - short.length <= 1);
}

const STOP = new Set(["the", "and", "for", "with", "how", "what", "why", "does", "can", "you", "your", "are", "this", "that", "from", "have", "not", "when", "where", "who", "will", "did", "get", "use", "into", "about", "wonder", "wonderjobs", "app", "page", "there", "they", "them", "its", "our"]);
