-- Pin the search_path of the append-only trigger function (Supabase security advisor:
-- function_search_path_mutable). It references nothing by name, so an empty path is enough
-- and leaves no schema an attacker could shadow.
alter function wonderjobs.forbid_mutation() set search_path = '';
