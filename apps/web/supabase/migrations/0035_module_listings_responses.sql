-- WonderStar Internships (WJ-418): the platform's listings and responses (docs/WONDERSTAR_PLATFORM.md section 5),
-- module-keyed, so a module's postings and applications live apart from Jobs' employer_jobs and job_applications.
--   listings — a company's posting in one module (today: internships), posted from its hiring workspace. attrs holds the
--     module's own terms (internships: stipend a month, duration, start date, apply-by date, part or full time),
--     validated by modules/internships/domain.ts::cleanPosting. Read and written only through server/internships/*
--     after the role check (domain/org/permissions.ts::can), filtered by org_id and module; open listings are the one
--     cross-tenant read (they are public postings).
--   responses — a person's response to a listing (an internship application): the student profile they confirmed,
--     their account email and tenant, one per listing and email. The applicant reads only their own (responder_tenant);
--     the company reads its own (org_id) after applications.view.
--   response_events — append-only history and audit of each response.
--   response_files — the résumé sent with a response, encrypted per workspace like job_application_files.
-- Additive only. RLS on with no policies, service role only, like every hiring table.
create table if not exists wonderjobs.listings (
  id text primary key,
  module text not null,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  title text not null check (char_length(title) <= 160),
  description text not null,
  location text not null default '',
  work_mode text not null check (work_mode in ('remote', 'hybrid', 'onsite')),
  skills jsonb not null default '[]'::jsonb,
  attrs jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists listings_org_module_idx on wonderjobs.listings (org_id, module, updated_at desc);
create index if not exists listings_module_status_idx on wonderjobs.listings (module, status, updated_at desc);

create table if not exists wonderjobs.responses (
  id text primary key,
  module text not null,
  listing_id text not null references wonderjobs.listings(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  responder_tenant text not null,
  email text not null,
  name text not null,
  status text not null check (status in ('applied', 'shortlisted', 'offer', 'accepted', 'closed', 'withdrawn')),
  profile jsonb not null default '{}'::jsonb,
  cover_note text not null default '',
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, email)
);
create index if not exists responses_org_module_idx on wonderjobs.responses (org_id, module, created_at desc);
create index if not exists responses_responder_module_idx on wonderjobs.responses (responder_tenant, module, created_at desc);

create table if not exists wonderjobs.response_events (
  id bigint generated always as identity primary key,
  response_id text not null references wonderjobs.responses(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  event text not null,
  actor text,
  detail text,
  at timestamptz not null default now()
);
create index if not exists response_events_response_idx on wonderjobs.response_events (response_id, at);
create index if not exists response_events_org_idx on wonderjobs.response_events (org_id);

create table if not exists wonderjobs.response_files (
  response_id text primary key references wonderjobs.responses(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  filename text not null check (char_length(filename) <= 200),
  mime text not null check (char_length(mime) <= 120),
  ciphertext text not null,
  created_at timestamptz not null default now()
);
create index if not exists response_files_org_idx on wonderjobs.response_files (org_id);

alter table wonderjobs.listings enable row level security;
alter table wonderjobs.responses enable row level security;
alter table wonderjobs.response_events enable row level security;
alter table wonderjobs.response_files enable row level security;
revoke all on wonderjobs.listings, wonderjobs.responses, wonderjobs.response_events, wonderjobs.response_files from anon, authenticated;
grant all on wonderjobs.listings, wonderjobs.responses, wonderjobs.response_events, wonderjobs.response_files to service_role;
