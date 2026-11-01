-- Company bans (owner, 2026-11-01: "give option to ban companies"). A platform admin can ban a company in WorksLake's
-- company directory; its listings are then left out of every module's search results. Platform-wide data, no tenant:
--   banned_at  when it was banned (null: not banned)
--   ban_reason the admin's reason, shown in the directory
--   banned_by  the admin who banned it (also in the audit log)
-- Additive only; the partial index keeps the "banned" list and search's check cheap.
alter table wonderjobs.jobslake_companies add column if not exists banned_at timestamptz;
alter table wonderjobs.jobslake_companies add column if not exists ban_reason text;
alter table wonderjobs.jobslake_companies add column if not exists banned_by text;
create index if not exists jobslake_companies_banned_idx on wonderjobs.jobslake_companies (banned_at) where banned_at is not null;
