-- One home for each piece of company data (owner, 2026-10-24: no duplication in JobsLake). H-1B totals live only
-- in jobslake_h1b_employers (keyed by company-name key) and are read from there, so the copy on each company goes.
-- Company facts live only on jobslake_companies (per source: facts = TheirStack, wikidata = Wikidata), never on
-- postings; postings reference their company by employer domain.
alter table wonderjobs.jobslake_companies drop column if exists h1b;
