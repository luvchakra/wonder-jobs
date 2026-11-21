-- Hiring workspaces outlive the account that created them (owner, 2026-11-21: deleting an account does not delete a
-- hiring workspace the person owns). hiring_orgs.created_by referenced tenants with "on delete cascade", so deleting the
-- creator's account deleted the workspace with its jobs, applications and conversations. Now the column may be empty and
-- a deleted creator only empties it; server/hiringAccount.ts hands the workspace to its next owner first.
alter table wonderjobs.hiring_orgs alter column created_by drop not null;
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any (con.conkey)
    where nsp.nspname = 'wonderjobs' and rel.relname = 'hiring_orgs' and con.contype = 'f' and att.attname = 'created_by'
  loop
    execute format('alter table wonderjobs.hiring_orgs drop constraint %I', c);
  end loop;
end $$;
alter table wonderjobs.hiring_orgs add constraint hiring_orgs_created_by_fkey foreign key (created_by) references wonderjobs.tenants(id) on delete set null;
