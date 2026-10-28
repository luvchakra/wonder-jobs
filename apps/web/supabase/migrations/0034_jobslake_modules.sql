-- WonderStar (WJ-415): JobsLake keeps one dataset per module (docs/WONDERSTAR_PLATFORM.md section 8, step 4).
--   jobslake_sources.module and jobslake_opportunities.module name the module a source feeds and a posting belongs to.
--   Every existing row is Jobs' (the default), so Jobs reads and writes exactly what it did before.
--   server/jobslake/store.ts filters every read by module (default 'jobs'); another module's warm-pool rows are keyed
--   module:id (opportunityRowId), so they can never overwrite a Jobs row.
-- Additive only. Server-only like every JobsLake table (RLS on, no policies, service role).
alter table wonderjobs.jobslake_sources add column if not exists module text not null default 'jobs';
alter table wonderjobs.jobslake_opportunities add column if not exists module text not null default 'jobs';
create index if not exists jobslake_sources_module_idx on wonderjobs.jobslake_sources (module);
create index if not exists jobslake_opportunities_module_observed_idx on wonderjobs.jobslake_opportunities (module, last_observed_at desc);
