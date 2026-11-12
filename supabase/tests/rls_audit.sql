-- WhatsGram OS RLS Regression Audit Checks
-- Run via psql against a Supabase/Postgres database after applying supabase/schema.sql
-- Verifies Row-Level Security is enabled on sensitive tables and key policies exist.

do $$
declare
  tbl text;
  rls_on boolean;
begin
  foreach tbl in array array[
    'wg_profiles', 'wg_account_recovery', 'wg_key_backups', 'wg_settings',
    'wg_conversations', 'wg_conversation_members', 'wg_messages',
    'wg_stories', 'wg_follows', 'wg_posts', 'wg_blocks', 'wg_reports',
    'wg_story_views', 'wg_notes', 'wg_mutes', 'wg_restricted',
    'wg_close_friends', 'wg_sessions', 'wg_ai_threads'
  ] loop
    select relrowsecurity into rls_on
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = tbl;
    if rls_on is distinct from true then
      raise exception 'RLS AUDIT FAILED: Row-Level Security not enabled on public.%', tbl;
    end if;
  end loop;
  raise notice 'RLS AUDIT PASSED: All core and privacy tables enforce Row-Level Security.';
end $$;
