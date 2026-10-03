-- public.rls_auto_enable() is the SECURITY DEFINER function behind Supabase's "enable RLS on new
-- tables in public" event trigger (ensure_rls). It isn't WonderJobs code, and it stays: the event
-- trigger keeps working, because Postgres doesn't check EXECUTE when it fires an event trigger. But
-- nobody needs to call it, so anon, authenticated, service_role and PUBLIC lose EXECUTE (Supabase
-- security advisor: anon/authenticated_security_definer_function_executable). Projects without the
-- function skip this.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;
  end if;
end
$$;
