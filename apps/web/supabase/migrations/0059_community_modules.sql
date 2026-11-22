-- Modules in communities (owner, 2026-11-22: "integrate modules and it contents on community level ... seamless"):
--   network_communities.module — the module a community is about (jobs, teaching, events …), optional.
--   network_threads.href / about / module — the listing a discussion carries: its public page, its title, its module.
-- Additive and empty by default. Discover orders by module in memory over a capped read, so no new index.
alter table wonderjobs.network_communities add column if not exists module text;
alter table wonderjobs.network_threads add column if not exists href text;
alter table wonderjobs.network_threads add column if not exists about text;
alter table wonderjobs.network_threads add column if not exists module text;
notify pgrst, 'reload schema';
