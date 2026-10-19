-- Lock PostgREST: revoke grants and enable RLS with no policies.
-- The API connects as the table owner, which bypasses RLS.

do $$
declare
  target record;
begin
  for target in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', target.tablename);
  end loop;
end
$$;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all routines  in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on routines  from anon, authenticated;

-- New tables still need RLS enabled; the lines above cover grants only.
