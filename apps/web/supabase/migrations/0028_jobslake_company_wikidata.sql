-- Company facts from Wikidata (owner, 2026-10-24): employees (with their year), founded, headquarters, industry,
-- stock listing and revenue, for companies whose official website on Wikidata is the domain JobsLake recorded.
-- Filled by the daily company refresh; wikidata_at is when it was last looked for ({} when Wikidata has none).
alter table wonderjobs.jobslake_companies add column if not exists wikidata jsonb;
alter table wonderjobs.jobslake_companies add column if not exists wikidata_at timestamptz;
create index if not exists jobslake_companies_wikidata_idx on wonderjobs.jobslake_companies (wikidata_at nulls first);
