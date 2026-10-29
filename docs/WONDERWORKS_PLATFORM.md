# WonderWorks — one platform, many modules

Owner request (2026-10-28): research every module and design a common platform, where each module inherits shared
features and keeps its own flavour. Jobs (WonderJobs) is the first module. The platform is called **WonderWorks**.

Status: design. Nothing here changes the product until a module is built; Jobs keeps working as it is while the core
is extracted from it step by step (§8).

---

## 1. The modules, and what people come to do

| Module | Seeker | Owner (the other side) | The core action | What "done" looks like |
| --- | --- | --- | --- | --- |
| **Jobs** (today) | Job seeker | Company hiring workspace | Apply (Easy Apply, helper, guided) | Hired |
| **Internships** | Student | Company / startup | Apply (with college, availability) | Offer accepted, start date |
| **Teaching** | Teacher / tutor | School, college, coaching centre, parent | Apply, then demo class | Appointed |
| **Co-founders** | Founder | Founder (both sides are people) | Show interest; connect only when it's mutual | Agreed to build together |
| **Talent & Services** | Client | Freelancer / service pro | Request a quote → book | Job done, paid, reviewed |
| **Therapists** | Client | Licensed counsellor | Book a session | Session held |
| **Events & Social** | Attendee | Organiser / group | RSVP (or ticket) | Attended |
| **Buy, Sell & Rent** | Buyer / tenant | Seller / owner | Message, make an offer, book a visit | Sold / rented |

### What the leading products in each space do (research summary)

- **Jobs / ATS** — Greenhouse is built around structured hiring (stages, interview kits, scorecards); Ashby pairs a
  stage pipeline with analytics (time in stage, conversion per stage); Lever leans on a CRM of candidates before a role
  opens. Knock-out screening questions (work authorization, minimum years, location) are table stakes. LinkedIn
  Easy Apply pre-fills screening answers the candidate gave before and lets them review before sending.
  → WonderJobs now has: screening questions with must-haves, a stage pipeline per job, skills fit, team scorecards
  (WJ-412).
- **Internships** — listings carry a stipend (monthly, sometimes a range), a duration (typically weeks to six months),
  a start date, work-from-home or a city, and an application deadline, often with one or two short questions.
  Students are verified by college; availability dates matter more than experience.
- **Teaching** — subject and grade levels, board (CBSE/ICSE/State/IB), qualifications (B.Ed, CTET/TET), a demo class
  before appointment, and background checks for anyone working with children.
- **Co-founders** — YC Co-Founder Matching: a profile (location, skills — product, design, engineering, sales,
  operations — interests, what they want in a co-founder), browse, and a connection only when interest is mutual;
  profiles are reviewed before people can connect.
- **Talent & Services** — Upwork/Fiverr (gigs, proposals, milestones, escrow) and Urban Company/Thumbtack (local
  pros, request a quote or book a slot, fixed prices, ratings after the job). Payment protection is what makes
  strangers trust each other.
- **Therapists** — Psychology Today-style directories: credentials, licence number and state/expiry, specialties,
  modalities, fees, insurance, languages; a "verified" mark when the licence was checked. Clinical outcomes are never
  rated publicly; privacy (health data) and crisis resources are mandatory.
- **Events & Social** — Meetup/Eventbrite: groups and events with time, place, capacity, RSVP with a waitlist,
  tickets for paid events, reminders, and safety reporting.
- **Buy, Sell & Rent** — OLX/Facebook Marketplace/NoBroker: photos, price, condition, location, chat in-app, offers,
  site visits for rentals, and heavy anti-scam measures (no payment outside, verified phone, report and block).

Sources consulted: [Greenhouse vs Lever vs Ashby (OutSail)](https://www.outsail.co/post/greenhouse-vs-lever-vs-ashby),
[How recruiters sort candidates (ATS Verification)](https://atsverification.com/blog/how-recruiters-sort-candidates-ats-2026/),
[Ashby ATS guide (JobMentis)](https://www.jobmentis.com/en/guide/ashby-ats),
[LinkedIn: how your job application information is used](https://www.linkedin.com/help/linkedin/answer/102697),
[LinkedIn: apply to jobs directly](https://www.linkedin.com/help/linkedin/answer/a512353),
[YC: co-founder matching](https://www.ycombinator.com/blog/co-founder-matching/),
[YC: what people want in a co-founder](https://www.ycombinator.com/blog/what-do-people-want-in-a-co-founder),
[NIAAA: finding a therapist](https://alcoholtreatment.niaaa.nih.gov/sites/default/files/TipstoHelpSrchAdctTherpsts-508.pdf),
[Internshala internship report (CXOToday)](https://cxotoday.com/media-coverage/200-rise-in-internship-opportunities-in-past-5-years/).
Several of these are secondary sources; field lists were taken as patterns, not specs.

---

## 2. The shape every module shares

Every module is the same loop, with different nouns:

```
 Owner side                         Platform core                           Seeker side
 ──────────                         ─────────────                           ───────────
 Workspace ──posts──▶ Listing ──▶  Lake (own listings + outside sources)  ◀── Profile (core + module persona)
     ▲                              │  normalise · de-duplicate · provenance        │
     │                              ▼                                               ▼
     │                         Search & Match (query, place, filters, fit + why) ─▶ Find
     │                                                                              │
     └──── Pipeline (owner) ◀── Response (Apply / Request / Book / RSVP / Offer / Connect) ◀── Act
                 │                    │ state machine · answers · consent · audit
                 ▼                    ▼
           Messages · Scheduling · Payments (optional) · Reviews (per module) · Notifications
```

So the platform owns the **nouns** (Profile, Listing, Response, Workspace, Conversation, Booking, Review) and the
**machinery** (search, matching, pipelines, messaging, trust, money, AI, automation, admin). A module only describes
its own flavour of each.

---

## 3. What the platform provides (inherited by every module)

| Core capability | Today in WonderJobs (reused) | Generalised in WonderWorks |
| --- | --- | --- |
| **Identity & tenancy** | Supabase Auth, tenant = user id, `server/auth.ts`, tenant filter on every query | Same, for every module. One account across all modules. |
| **Profile** | Career Profile (Career DNA), résumé import, Application answers | `Profile` core (name, photo, contact, places, languages, verification) + one **persona** per module (Career DNA is the Jobs persona; a Tutor persona, a Founder persona…). Saved answers become a platform-wide answer bank keyed by question. |
| **Listing** | `employer_jobs`, JobsLake opportunities | `Listing` core (title, description, owner, place/geo, price or pay, status, media, provenance) + `attrs` validated by the module's schema. |
| **Lake** | JobsLake: sources, connectors, planner, de-duplication, provenance, warm cache, admin portal | One Lake with a `module` dimension: each module registers its sources and normaliser; de-duplication and provenance are shared. |
| **Search & match** | Find, Refine, `computeMatch`, "Why it fits", AI fit within a band | Query + place + facets from the module schema; a module supplies match signals and weights; "why" is always shown; AI only nudges within a band. |
| **Response** | Applications (candidate side), `job_applications` (company side), Easy Apply, screening questions, withdraw | `Response` with a module-defined verb and state machine, answers to the listing's questions, the profile snapshot shared, consent and audit — one table, one API. |
| **Pipeline** | Pipeline (seeker), Hiring Applications tab (owner): stages, fit, scorecards | The one tab each module shapes (§4.1): its own name, stages, card and sections, driven by the module's state machine; reviews/scorecards where the module allows them. |
| **Workspace** | Hiring workspaces, roles Owner/Hiring manager/Recruiter, `domain/org/permissions.ts::can` | `Workspace` with module-scoped roles; the permission matrix stays the single gate, one matrix per module. |
| **Messages** | Company ↔ candidate threads, decline/block/reopen | Same threads for every module; who may write first is module policy (e.g. co-founders only after mutual interest). |
| **Scheduling** | Calendar, reminders, ICS feed | Slots and bookings (interviews, demo classes, sessions, visits, events). |
| **Trust & safety** | Company verification, report, block | Verification tiers (phone, email, ID, licence, organisation), report & block, moderation queue, rate limits, scam signals. |
| **Reviews** | — | Optional per module: on for services, off for therapy outcomes and for jobs. |
| **Payments** | Plans and billing (Stripe/Razorpay) | Plans for everyone; optional bookings/escrow for modules with money between users (Services, paid Events, Therapy fees). |
| **AI** | `services/ai/service.ts` boundary, server-held prompts, `SYSTEM_GUARD`, drafts labelled AI-generated | Same boundary; modules add prompt ids, never instructions in the browser. |
| **Automation** | `resolveCapability`: risk tier × level × per-capability policy | Capabilities are namespaced per module (`jobs.easy_apply`, `events.rsvp`…); the resolver is unchanged. |
| **Notifications** | Bell, push, email, digest | Same channels; modules register their notice kinds and default channels. |
| **Navigation & admin** | Bottom bar Find · Saved · Pipeline · You (`navigation/nav.ts`), Find dropdown kinds, platform-admin menus, Coming soon | The same four tabs in every module (owner, 2026-10-28; §4.1). Find, Saved and You are the platform's; Pipeline is the module's. The Find dropdown switches module and lists modules from the registry; admins switch a module on/off (already modelled by `MENUS.find_kinds`). |
| **Real data & provenance** | Rules in CLAUDE.md, run provenance | Platform rule for every module: nothing shown that wasn't found, computed or received. |

---

## 4. What each module adds (its flavour)

A module is a **manifest** plus, only where needed, its own components. The manifest is data the core reads.

```ts
// src/modules/<id>/manifest.ts — the shape every module fills in (sketch)
export interface ModuleManifest {
  id: "jobs" | "internships" | "teaching" | "cofounders" | "services" | "therapists" | "events" | "marketplace";
  label: string;              // "Internships"
  hint: string;               // "Student roles and co-ops" (the Find dropdown's subtitle, today's UPCOMING_KINDS)
  icon: IconName;
  accent: TokenName;          // a colour token, so each module is recognisable but the design system stays one

  persona: FieldSchema[];     // what the seeker's profile adds for this module (e.g. college, graduation year)
  listing: FieldSchema[];     // module attributes on a listing (stipend, duration, start date…), with facet/filter flags
  sources: SourceRef[];       // Lake connectors that bring outside listings (none for co-founders)

  match: { signals: MatchSignal[]; explain: (m) => string[] };   // what "fits" means here, always explained
  response: {
    verb: "apply" | "request_quote" | "book" | "rsvp" | "offer" | "connect";
    questions: boolean;                 // owners may ask screening questions
    mutual?: boolean;                   // both sides must say yes before contact (co-founders)
    states: StateMachine;               // e.g. requested → quoted → booked → done → reviewed
    capability: CapabilityKey;          // gated through resolveCapability
  };
  pipeline: {                 // the one tab a module shapes (§4.1); Find, Saved and You are fixed
    label: string;            // bottom-bar name: "Pipeline", "Bookings", "Connections", "My events", "Deals"
    icon: IconName;
    stages: Stage[];          // the seeker's columns, from response.states (e.g. Requested · Confirmed · Held)
    card: CardField[];        // what each item shows (next step, date, price, counterpart)
    sections?: SectionRef[];  // extra views inside the tab (Jobs: Calendar, Insights, Interview prep)
  };
  ownerSide: { workspace: "company" | "person" | "none"; roles: RoleMatrix; pipelineStages: Stage[] };
  trust: { verification: VerificationTier[]; reviews: "off" | "after_done" | "both_sides"; safety: SafetyRule[] };
  money?: { kind: "none" | "fee_display" | "booking_payment" | "escrow"; currency: "INR" | string };
  compliance?: ("health_data" | "minors" | "payments" | "housing")[];
  copy: HelpSection[];        // help content, in the UI's words
}
```

### Module-by-module

| Module | Persona adds | Listing adds | Response & states | Owner side | Trust & compliance |
| --- | --- | --- | --- | --- | --- |
| **Jobs** | Career DNA, résumé, answers | Salary, work mode, job type, skills, screening | Apply · new → reviewing → interview → offer → hired / declined | Company workspace, 3 roles, scorecards | Company verification; final submit opt-in (WJ-249) |
| **Internships** | College, course, graduation year, availability window | Stipend (monthly, range), duration, start date, deadline, part/full-time | Apply · same states + "offer accepted" | Company workspace (reuse Hiring) | College email verification; minimum age |
| **Teaching** | Subjects, grade levels, boards, qualifications (B.Ed, CTET), languages | Subject, grades, board, hours, school type, pay | Apply → demo class (booking) → appointed | School workspace; parents as individual owners | Background check badge; `minors` compliance |
| **Co-founders** | Role (tech/business), skills, commitment, idea or open, equity expectations, location | (No listings: people are the listings) | Connect · interested → mutual → talking → building / passed | None (person to person) | Profile review before connecting; `mutual` before messages |
| **Talent & Services** | Skills, rates, portfolio, service area | Service, price (fixed/hourly/quote), area, availability | Request quote → quoted → booked → done → paid → reviewed | Individual pro or agency workspace | ID verification; reviews after done; escrow / payments |
| **Therapists** | Concerns, preferences (language, gender, mode), budget | Licence (number, body, expiry), specialties, modalities, fee, languages, online/in-person | Book · requested → confirmed → held / cancelled | Individual practitioner or clinic workspace | Licence verification + re-check on expiry; `health_data`; crisis resources on every page; no public outcome ratings |
| **Events & Social** | Interests, city | Time, place/online, capacity, price (free/paid), group | RSVP · going / waitlist → attended / no-show | Organiser or group workspace | Report/block, venue safety, age limits |
| **Buy, Sell & Rent** | Area, phone verified | Category, price, condition, photos, rent terms (deposit, availability) | Message → offer → visit (booking) → sold / rented | Individual seller; brokers flagged | Anti-scam rules (no off-platform payment), phone verification, `housing` for rentals |

### 4.1 Navigation: one set of four tabs, one page structure (owner, 2026-10-29)

Find, Saved and You are WonderWorks' (`src/wonderstar/`) and identical across modules, with Jobs' look as the
reference; a module supplies only its own fields, filters, card details and data. Only the Pipeline tab varies: its
name, stages and views come from the module's manifest (`moduleTabs`). WonderJobs keeps "Pipeline"; Internships' is
"Applications" (owner, 2026-10-29).

Every module uses **the jobs portal's own four tabs and page structure** (owner, 2026-10-28 and 2026-10-29: "reuse the
4 tabs … keep the structure and the look and feel the same, so when I change from jobs to internship the look and feel
of the page does not change. Only the requirement-related aspects change."):

- **The app's bottom bar is the module's tabs.** There is no second tab row, header or "Explore" link inside a module.
  The active module is picked in Find's menu in the top bar (Full Time Jobs, Part Time Jobs, then each live module,
  all the same kind of item); it is kept per account (`store/ui.ts::activeModule`) and `/app` opens on it. While a
  module is active, Find / Saved / Pipeline / You go to `/app/m/<module>`, `/saved`, `/pipeline`, `/you`; for Jobs they
  stay today's routes. Account and settings pages under You keep the active module's tabs.
- **The same pages, built from parts extracted from Jobs** (`platform/find`, `platform/pipeline`, `components/you`), which
  Jobs itself renders through unchanged (pixel- and behaviour-identical, checked with before/after screenshots and the
  golden/outcome/jobslake specs).

| Tab | Same in every module (Jobs' own structure) | What the module changes |
| --- | --- | --- |
| **Find** | Search box (microphone, clear, recent searches); one row of Refine, two pills and the round Search button; the Refine panel ("Back to …", one corner check box, chips/selects, Location, Save, Clear refinements); "Showing N … from M sources" with Sort by; the result card (logo, fit, Apply · title · facts · skills · why it fits · source · Save); empty states; the sources searched a tap away | Its facets (`FacetSpec`), the facts on its card, its search and its detail sheet |
| **Saved** | The box that narrows the saves, chips, Hide Pipeline, the same cards; one list across modules, filterable by module | Nothing (cards are the module's Find cards) |
| **Pipeline** | "Applications" with the stages as tiles with counts, opening on the one with something to do; a stage's status chips; compact cards with one action each; extra sections under it | Name, stages, card facts, actions, extra sections — from `pipeline` in the manifest |
| **You** | Jobs' You page: the Career Profile and its rows | Its persona rows (e.g. Internships: your details, one-tap applications, post internships) |

The owner side (company, practitioner, organiser) uses Hiring's workspace layout: the workspace name and your role,
the workspace picker, underline tabs and Hiring's rows (e.g. Internships → Company: Internships · Applications).

The Pipeline tab per module:

| Module | Tab label | Stages (seeker side) | Extra sections |
| --- | --- | --- | --- |
| **Jobs** | Pipeline | Saved to apply · Applied · Interview · Offer · Hired / Closed | Calendar, Insights, Interview prep (today's) |
| **Internships** | Applications | Applied · Shortlisted · Offer · Accepted / Closed | Deadlines |
| **Teaching** | Pipeline | Applied · Demo class · Appointed / Closed | Demo-class bookings |
| **Co-founders** | Connections | Interested · Mutual · Talking · Building / Passed | — (mutual-only messaging lives on each item) |
| **Talent & Services** | Bookings | Requested · Quoted · Booked · Done · Reviewed | Payments and receipts |
| **Therapists** | Sessions | Requested · Confirmed · Upcoming · Held / Cancelled | Crisis resources (always shown); no ratings |
| **Events & Social** | My events | Going · Waitlist · Attended | Calendar |
| **Buy, Sell & Rent** | Deals | Messaged · Offer · Visit · Done | My listings (selling side) |

Rules: the tab keeps one place in the bar and the label is the module's; it opens on the stage with something to do;
the owner side (company, practitioner, organiser) stays in a workspace under You, as Hiring is today. The bar shows
the active module's Pipeline; Saved shows every module's saves so nothing is lost on switching.

---

## 5. Data model (generalising what Jobs already has)

| Platform table | Generalises | Key columns |
| --- | --- | --- |
| `profiles` | Career DNA in `app_state` | tenant_id, core (jsonb), personas (jsonb by module), visibility per module |
| `workspaces`, `workspace_members` | `hiring_orgs`, `hiring_members` | id, module, kind (company/person), verified; role per member |
| `listings` | `employer_jobs` + Lake opportunities | id, module, workspace_id or source, status, title, description, geo, price, attrs (jsonb, validated by the module schema), questions (jsonb), provenance |
| `responses` | `job_applications` | id, module, listing_id, responder tenant/email, status, answers, profile snapshot, consent_at, via |
| `response_events` | `job_application_events` | append-only history and audit |
| `response_reviews` | `job_application_reviews` | owner-side scorecards/notes (Jobs, Internships, Teaching) |
| `conversations`, `messages` | today's company ↔ candidate threads | module, participants, status (open/declined/blocked) |
| `bookings` | — (new) | listing/response, slot, status, payment ref |
| `reviews` | — (new) | subject (person/workspace), author, rating, text, module policy |
| `verifications` | company verification | subject, tier, evidence, checked_at, expires_at |

Rules carried over unchanged: RLS on and service-role only; every query filters by tenant or workspace after the
`can` check; an index for every new filter; idempotency keys and audit for every external effect.

---

## 6. Code layout

WonderWorks is the shared layer. WonderJobs, Internships and every other module inherit from it and extend it.
Anything shared lives in WonderWorks. No module contains another module's code. A change in one module never breaks
another (owner, 2026-10-29).

```
apps/web/src/
  wonderstar/            # the shared layer; imports no module (boundaries.test.ts)
    manifest.ts          # ModuleManifest and its parts, shellRoutes, stagesOf, isLive
    store.ts             # one capped store per module (saves, responses, Find's and Saved's history, persona)
    find/parts.tsx       # Find's parts: SearchBox, RefineToggle, PillButton, SearchSubmit, RefinePanel, RefineField,
                         #   ChoiceChips, RefineSelect, RefineCheck, RefinePlaces, SortSelect, ResultsLine, ResultsGrid,
                         #   ShowMore, SearchingBanner, ResultCard, FitPill, SaveButton, FilterBox, TogglePill
    find/ModuleFind.tsx  # a module's whole Find from those parts: give it facets, a search, a card and a sheet
    find/place.ts        # shortPlace, WorkMode
    pipeline/parts.tsx   # StageTiles, StageFilter, StageList, StageEmpty, StageCard
    you/                 # YouOverview (the Career Profile card, then the module's rows), YouRows, headline helpers
    chrome/              # TopBar + ModuleMenu, MobileNav, Sidebar, SectionTabs, PageHeader, nav.ts (moduleTabs), slots.tsx
    shell/ModulePages.tsx  # Saved (every module), and Pipeline / You for a module without its own yet
    brand/               # the mark, the splash, tinted module tiles
  modules/
    registry.ts          # composition root: every module's manifest, read by the Find menu, the tabs and JobsLake
    nav.ts               # composition root: each module's tabs (moduleNav) and a page's module (moduleFromPath)
    chrome.tsx           # composition root: fills WonderWorks' chrome slots (tabs, sections, Find menu, Tasks/status)
    savedCards.tsx       # composition root: each module's card in the shared Saved
    jobs/                # WonderJobs: manifest, nav (PRIMARY_NAV, SECTION_TABS), chrome, components/ (Find, Saved,
                         #   cards), pipeline/ (Applications), you/ (JobsYou and its rows)
    internships/         # Internships: manifest (Pipeline tab "Applications"), components, store, domain
  app/app/               # routes and AppShell (composition); app/app/m/[module]/ find · saved · pipeline · you
                         # (Jobs keeps /app/jobs, /app/saved, /app/applications, /app/you)
```

- A module imports only WonderWorks, the app's foundation (`lib`, `components/common`, `store/*` and `domain/*` that
  aren't a module's, `services`) and itself. WonderWorks imports no module.
- Jobs' stores and domain code (`store/jobs`, `store/applications`, `domain/jobs`, `domain/applications`,
  `services/jobs`) haven't moved into `modules/jobs/` yet; they count as Jobs' code, so nothing else imports them.
- Not yet: the app foundation still reaches Jobs' code indirectly (store hydration and the workflow scheduler in
  `app/app/AppShell.tsx`, Ask Wonder in the command palette, `store/ui` reading the registry). Moving those behind
  module hooks is the next shared-layer step.
- Each module has its own Claude session. All work for a module happens in that one session, never in another
  module's session, and never across several sessions for the same module. WonderWorks shared-layer work has its own
  session too.

How a module plugs in (Internships is the example):

1. **Manifest** — `modules/<id>/manifest.ts`, listed in `modules/registry.ts`. Its `pipeline.label` names the third tab.
2. **Find** — `modules/<id>/components/Find.tsx` returns `<ModuleFind>` with `facets` (chips, selects, a corner check
   box; the first two chips facets with `pill` show in the row), `search`, `refine` (apply the facets and sort), `Card`
   (a `ResultCard` with the module's facts in the facts line) and `Sheet`.
3. **Saved** — register the card in `modules/savedCards.tsx` (`SavedCard`, `savedText`).
4. **Pipeline** — the stages come from the manifest; build the page from `StageTiles` / `StageFilter` / `StageList` /
   `StageCard` under `PageHeader` + `SectionHeader`, as `modules/internships/components/Pipeline.tsx` does.
5. **You** — `<YouOverview rows={…} module={{ label, rows }} />` with the module's rows; their detail pages under `you/…`.
6. **Owner side** — Hiring's layout (`PageHeader` with back to Hiring, workspace `Select`, underline `Tabs`, Hiring rows).

A module overrides a part only when its fields can't be expressed (e.g. Jobs' résumé studio, Events' map,
Marketplace's photo gallery), so the design stays one system: same tokens, one primary action per screen, folds for
the rare.

---

## 7. Governance, the same everywhere

- **Real data only**, per module: a module without sources says so; nothing seeded for a real account.
- **AI proposes; code decides**: one model boundary; prompts live on the server; every draft labelled.
- **One gate**: `resolveCapability`, with module-namespaced capabilities and risk tiers; a missing lookup fails closed.
- **Consent and audit** on every Response that leaves the platform (an application, a booking request, an offer).
- **Sensitive modules** (Therapists: health data; Teaching/Events: minors; Marketplace: housing and payments) get
  their compliance flags checked by the platform before a module can be switched on.

---

## 8. How to get there without breaking Jobs

1. **Registry** — `modules/registry.ts` with the Jobs manifest describing today's Jobs; the Find dropdown reads
   module entries from it (today's `UPCOMING_KINDS` become manifests with `status: "soon"`).
   The bottom bar reads the active module's `pipeline` label and icon (Jobs: Pipeline, unchanged); Find, Saved and
   You stay as they are.
   **Done (WJ-415, 2026-10-28):** `modules/registry.ts` with all eight manifests (Jobs live, the rest soon);
   `UPCOMING_KINDS` derives from it; the module shell `/app/m/[module]` (Find · Saved · Pipeline · You, from
   `platform/shell` and module-scoped stores `wonderstar/store.ts`) shows Coming soon until a module goes live.
   Jobs' bottom bar is unchanged. Platform `listings`/`responses` tables wait for the module that needs them.
2. **Listing & Response cores** — extract `employer_jobs` / `job_applications` logic behind `platform/listing` and
   `platform/response` (Jobs-first; tables renamed by views so nothing moves at once). Screening questions, answers,
   profile snapshots and scorecards (WJ-412) are already shaped this way.
3. **Workspace core** — Hiring workspaces become `workspaces` with `module = "jobs"`; the permission matrix gains a
   module key.
4. **Lake with modules** — JobsLake gets a `module` column on sources and opportunities: **a separate dataset per
   module** (owner, 2026-10-28). Jobs' sources and listings are `module = 'jobs'` and nothing else ever reads them as
   another module's; each module registers its own sources.
   **Done (WJ-415, 2026-10-28):** migration 0034; every store read filters by module (default jobs), another
   module's pool rows are keyed `module:id`, search and the v1 API take `module`; Jobs reads exactly what it did.
5. **First new module: Internships** — about nine-tenths reuse (listing attrs: stipend, duration, start date; persona:
   college, graduation). Proves the manifest.
   **Rule (owner, 2026-10-28): the jobs portal stays exactly as it is** (CLAUDE.md). Internships is built as its own
   module at `/app/m/internships` with its own JobsLake dataset — not as a mode of Jobs' Find (WJ-413's Find mode was
   taken back out in WJ-414). Kept for it: `domain/org/internship.ts` (stipend a month, duration, start date) and
   `employer_jobs.internship` (migration 0032).
   **Done (WJ-418, 2026-10-29):** Internships is live at `/app/m/internships` — its own JobsLake sources (WonderWorks
   companies, Adzuna India, Greenhouse/Lever/Ashby, SmartRecruiters, Remotive, Remote OK; Internshala and LinkedIn have
   no open API), company postings in Internships → Company (same workspace and roles), the platform `listings` /
   `responses` tables (migration 0035, module-keyed), the student profile (prefilled from Career Profile education,
   read only), Find with stipend/duration/start/remote facets and match reasons, one-tap Apply gated by
   `internships.apply`, Pipeline (Applied · Shortlisted · Offer · Accepted / Closed + Deadlines), Saved across
   modules, bell + push on a company's decision. Not used: `employer_jobs.internship` (Jobs' table stays Jobs').
6. **Teaching** — adds a demo-class booking (introduces `bookings`).
7. **Talent & Services** — adds quotes, payments and reviews.
8. **Events & Social** — adds capacity, RSVP and waitlist.
9. **Buy, Sell & Rent** — adds photos, offers and anti-scam rules.
10. **Co-founders** — adds mutual matching (no listings).
11. **Therapists** — last: licence verification, health-data compliance and crisis resources need legal review first.

Each step ships as its own PR with tests, help and tracker rows, like every Jobs change today.

---

## 9. Brand: WonderWorks identity (owner, 2026-10-28)

Reference: `docs/brand/wonderstar-identity.png` (the owner's identity sheet). It applies to **the whole app, the jobs
portal included** (owner, 2026-10-28: "apply the brand to the jobs portal too"; WJ-416) — the module shell, Explore,
module pages, the app icon/splash, and every jobs screen. **Name:** the product is **WonderWorks** (owner, 2026-10-29), after WonderJobs and then WonderStar; the sheet still shows "WonderStar" and stays the visual reference — only the wordmark's second word changed ("Works", same style).
One set of brand files: the logo SVGs in `public/brand/` (`scripts/brand-svg.py`), the tokens at the top of
`globals.css` (`--wj-*`, with the sheet's names as `--color-star-purple` etc. pointing at them), Poppins in
`app/layout.tsx`, and the tile tints in `platform/brand/tiles.tsx`.

- **Logo:** the WonderWorks mark (a "W" of two violet-to-pink wings with a four-point star above) + "WonderWorks" — "Wonder"
  in Deep Navy (white on dark), "Works" in a violet→blue gradient. Variants: primary horizontal, stacked with the
  tagline, app icon (mark on Deep Navy, rounded square). Tagline: "DISCOVER OPPORTUNITIES. UNLOCK POSSIBILITIES."
  (letter-spaced caps). Recreate as SVG in `public/brand/` — never a raster screenshot of the sheet.
- **Colours** (the app's design tokens): Star Purple `#7C3AED`, Sky Blue
  `#3B82F6`, Magenta `#EC4899`, Indigo `#4F46E5`, Soft Lavender `#EDE9FE`, Light Blue `#EFF6FF`, Deep Navy `#0F172A`.
  Primary action: Star Purple→Indigo gradient; splash/hero: deep indigo→violet with soft waves.
- **Type:** Poppins (Google Fonts, via `next/font`), app-wide.
- **Icons:** lucide line icons in a soft rounded-square tile tinted per module — Jobs (briefcase, lavender), Part-time
  (clock, light blue), Internships (graduation cap, peach), Teaching (open book, mint), Co-founders (handshake, lavender),
  Talent & Services (people, light blue), Therapists (heart-pulse, lavender), Events & Social (calendar, pink),
  Buy, Sell & Rent (storefront, peach). Each manifest's `icon` + `accent` carries these.
- **Explore (the hub):** "Find your next opportunity / Search across jobs, services, events and more", one search box
  with a round gradient arrow button, then the modules as tiles (phone: 3-column grid; desktop: chips under the search),
  "Popular searches" chips from real searches only. Desktop: left rail Explore · Saved · Messages · Profile. Phone:
  top bar with avatar, the logo centred, search and bell. Footer line "More opportunities. A brighter you."
- **Splash:** the stacked logo and tagline on the indigo→violet gradient.
- **Done (WJ-415, 2026-10-28):** the section's colour tokens in `globals.css` (`star-purple`, `sky-blue`, `magenta`,
  `indigo`, `soft-lavender`, `light-blue`, `deep-navy`), the mark drawn inline (`platform/brand/Logo.tsx`), Explore at
  `/app/m`, tinted tiles from each manifest's `icon` + `accent`, splash on Coming soon. Logo files and Poppins come with
  the app-wide rebrand. Not yet: Explore's own left rail / top bar (it sits inside the app shell, which is the jobs portal's).
