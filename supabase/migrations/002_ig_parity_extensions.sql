-- 12. IG Parity Extensions: Private Accounts, Blocks, Moderation Reports, Story Views, Notes & Post Archives
alter table public.wg_profiles add column if not exists is_private boolean not null default false;
alter table public.wg_follows add column if not exists status text not null default 'accepted';
alter table public.wg_posts add column if not exists archived boolean not null default false;
alter table public.wg_post_comments add column if not exists parent_id text;
alter table public.wg_post_comments add column if not exists pinned boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wg_follows_status_chk' and conrelid = 'public.wg_follows'::regclass
  ) then
    alter table public.wg_follows add constraint wg_follows_status_chk check (status in ('accepted', 'pending'));
  end if;
end $$;

create index if not exists idx_wg_follows_pending on public.wg_follows(following_id, status) where status = 'pending';
create index if not exists idx_wg_posts_active_created on public.wg_posts(archived, created_at desc);

create table if not exists public.wg_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.wg_blocks enable row level security;
drop policy if exists "wg_blocks_own" on public.wg_blocks;
create policy "wg_blocks_own" on public.wg_blocks for all to authenticated
  using (blocker_id = (select auth.uid()))
  with check (blocker_id = (select auth.uid()));

create table if not exists public.wg_reports (
  id text primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('user', 'post', 'reel', 'story', 'comment', 'message')),
  target_id text not null,
  reason text not null default 'spam',
  details text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);
alter table public.wg_reports enable row level security;
drop policy if exists "wg_reports_own" on public.wg_reports;
create policy "wg_reports_own" on public.wg_reports for all to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()));

create table if not exists public.wg_story_views (
  story_id text not null references public.wg_stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
alter table public.wg_story_views enable row level security;
drop policy if exists "wg_story_views_select" on public.wg_story_views;
create policy "wg_story_views_select" on public.wg_story_views for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.wg_stories s where s.id = story_id and s.user_id = (select auth.uid()))
  );
drop policy if exists "wg_story_views_insert" on public.wg_story_views;
create policy "wg_story_views_insert" on public.wg_story_views for insert to authenticated
  with check (user_id = (select auth.uid()));

create table if not exists public.wg_notes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  text text not null default '',
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);
alter table public.wg_notes enable row level security;
drop policy if exists "wg_notes_select" on public.wg_notes;
create policy "wg_notes_select" on public.wg_notes for select to authenticated using (true);
drop policy if exists "wg_notes_own" on public.wg_notes;
create policy "wg_notes_own" on public.wg_notes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.wg_profile_stats(p_target_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'postsCount', (select count(*)::int from public.wg_posts where user_id = p_target_id and coalesce(archived, false) = false),
    'followersCount', (select count(*)::int from public.wg_follows where following_id = p_target_id and coalesce(status, 'accepted') = 'accepted'),
    'followingCount', (select count(*)::int from public.wg_follows where follower_id = p_target_id and coalesce(status, 'accepted') = 'accepted'),
    'highlightsCount', (select count(*)::int from public.wg_highlights where user_id = p_target_id)
  );
$$;
revoke all on function public.wg_profile_stats(uuid) from public, anon;
grant execute on function public.wg_profile_stats(uuid) to authenticated;

alter table public.wg_notes replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.wg_notes;
exception when duplicate_object then null;
end $$;

