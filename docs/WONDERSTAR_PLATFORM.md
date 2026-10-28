# WonderStar — one platform, many modules

Owner request (2026-10-28): research every module and design a common platform, where each module inherits shared
features and keeps its own flavour. Jobs (WonderJobs) is the first module. The platform is called **WonderStar**.

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

| Core capability | Today in WonderJobs (reused) | Generalised in WonderStar |
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

### 4.1 Navigation: four tabs everywhere, one of them the module's

Every module has the same bottom bar (owner, 2026-10-28), so moving between modules never relearns the app:

| Tab | Owned by | Same in every module | What the module changes |
| --- | --- | --- | --- |
| **Find** | Platform | Search box, place, Refine, result list, the dropdown that switches module | Facets and card fields from `listing`, match signals from `match` |
| **Saved** | Platform | Saved listings and saved searches, one list across modules, filterable by module | Nothing (card fields come from the listing schema) |
| **Pipeline** | **Module** | Stage tabs with counts, one primary action per item, history, withdraw/cancel | Name, icon, stages, card, extra sections — from `pipeline` in the manifest |
| **You** | Platform | Account, Profile core, settings, Automation, notifications, workspaces (Hiring etc.), billing | One persona section per module the person uses (Career DNA for Jobs) |

The Pipeline tab per module:

| Module | Tab label | Stages (seeker side) | Extra sections |
| --- | --- | --- | --- |
| **Jobs** | Pipeline | Saved to apply · Applied · Interview · Offer · Hired / Closed | Calendar, Insights, Interview prep (today's) |
| **Internships** | Pipeline | Applied · Shortlisted · Offer · Accepted / Closed | Deadlines |
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

```
apps/web/src/
  platform/            # the core, module-agnostic (extracted from today's Jobs code, step by step)
    profile/  listing/  lake/  match/  response/  pipeline/  workspace/  messages/  booking/  trust/  money/
  modules/
    registry.ts        # every module's manifest; the Find dropdown and admin menus read it
    jobs/              # manifest + Jobs-only components (Apply with Wonder, the helper, résumé studio)
    internships/  teaching/  cofounders/  services/  therapists/  events/  marketplace/
  app/app/[module]/    # find · listing/[id] · respond · pipeline — one set of pages, flavoured by the manifest
                       # /app/saved and /app/you stay module-agnostic (§4.1)
                       # (Jobs keeps /app/jobs and today's routes; they become aliases of /app/jobs/...)
```

A module overrides a component only when the manifest can't express it (e.g. Jobs' résumé studio, Events' map,
Marketplace's photo gallery). Everything else — cards, filters, pipeline tabs, messages, settings — is the platform's,
so the design stays one system: same tokens, one primary action per screen, folds for the rare.

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
   `platform/shell` and module-scoped stores `platform/moduleStore.ts`) shows Coming soon until a module goes live.
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
6. **Teaching** — adds a demo-class booking (introduces `bookings`).
7. **Talent & Services** — adds quotes, payments and reviews.
8. **Events & Social** — adds capacity, RSVP and waitlist.
9. **Buy, Sell & Rent** — adds photos, offers and anti-scam rules.
10. **Co-founders** — adds mutual matching (no listings).
11. **Therapists** — last: licence verification, health-data compliance and crisis resources need legal review first.

Each step ships as its own PR with tests, help and tracker rows, like every Jobs change today.

---

## 9. Brand: WonderStar identity (owner, 2026-10-28)

Reference: `docs/brand/wonderstar-identity.png` (the owner's identity sheet). It applies to **WonderStar's own surfaces** —
the module shell (`/app/m/<module>`), the Explore hub that lists modules, module pages and the app icon/splash for the
platform. The jobs portal keeps its current look (CLAUDE.md, "The jobs portal stays as it is") unless the owner says
otherwise.

- **Logo:** the WonderStar mark (a "W" of two violet-to-pink wings with a four-point star above) + "WonderStar" — "Wonder"
  in Deep Navy (white on dark), "Star" in a violet→blue gradient. Variants: primary horizontal, stacked with the
  tagline, app icon (mark on Deep Navy, rounded square). Tagline: "DISCOVER OPPORTUNITIES. UNLOCK POSSIBILITIES."
  (letter-spaced caps). Recreate as SVG in `public/brand/` — never a raster screenshot of the sheet.
- **Colours** (as design tokens beside today's, scoped to WonderStar surfaces): Star Purple `#7C3AED`, Sky Blue
  `#3B82F6`, Magenta `#EC4899`, Indigo `#4F46E5`, Soft Lavender `#EDE9FE`, Light Blue `#EFF6FF`, Deep Navy `#0F172A`.
  Primary action: Star Purple→Indigo gradient; splash/hero: deep indigo→violet with soft waves.
- **Type:** Poppins (Google Fonts, via `next/font`), for WonderStar surfaces.
- **Icons:** lucide line icons in a soft rounded-square tile tinted per module — Jobs (briefcase, lavender), Part-time
  (clock, light blue), Internships (graduation cap, peach), Teaching (open book, mint), Co-founders (handshake, lavender),
  Talent & Services (people, light blue), Therapists (heart-pulse, lavender), Events & Social (calendar, pink),
  Buy, Sell & Rent (storefront, peach). Each manifest's `icon` + `accent` carries these.
- **Explore (the hub):** "Find your next opportunity / Search across jobs, services, events and more", one search box
  with a round gradient arrow button, then the modules as tiles (phone: 3-column grid; desktop: chips under the search),
  "Popular searches" chips from real searches only. Desktop: left rail Explore · Saved · Messages · Profile. Phone:
  top bar with avatar, the logo centred, search and bell. Footer line "More opportunities. A brighter you."
- **Splash:** the stacked logo and tagline on the indigo→violet gradient.
