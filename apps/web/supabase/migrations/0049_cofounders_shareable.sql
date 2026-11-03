-- WonderWorks Co-founders: an owner decides whether others may share their profile or team outside WonderWorks
-- (owner, 2026-11-03: "Let others share my profile", off by default).
--   cofounder_profiles.shareable, cofounder_teams.shareable — false unless the owner turns it on. When false, Share on
--     that profile or team sends only a generic Co-founders on WonderWorks message with no profile content. It is set only
--     by the owner (server/cofounders/profiles.ts and teams.ts, after the tenant and founder checks); another person's
--     Share reads it and never changes it. Every existing row stays false.
-- Additive only, no new filter or order, so no new index.
alter table wonderjobs.cofounder_profiles add column if not exists shareable boolean not null default false;
alter table wonderjobs.cofounder_teams add column if not exists shareable boolean not null default false;
