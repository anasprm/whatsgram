-- =============================================================================
-- 13. Full Platform Extensions: Close Friends, Collections, Mutes, Restrict,
--     TOTP 2FA, Sessions, Key History, Devices, Call Logs, Reactions,
--     Denormalized Counters, Search Indexes, Semantic Similarity & Telemetry
-- =============================================================================

-- 13a. Profile extensions: 2FA, soft delete, presence, push prefs, mute words, quota
alter table public.wg_profiles add column if not exists totp_secret text;
alter table public.wg_profiles add column if not exists totp_enabled boolean not null default false;
alter table public.wg_profiles add column if not exists deleted_at timestamptz;
alter table public.wg_profiles add column if not exists show_online boolean not null default true;
alter table public.wg_profiles add column if not exists show_typing boolean not null default true;
alter table public.wg_profiles add column if not exists push_prefs jsonb not null default '{"dms":true,"calls":true,"likes":true,"follows":true,"ai":true,"quietStart":"","quietEnd":""}'::jsonb;
alter table public.wg_profiles add column if not exists hidden_words text[] not null default '{}';
alter table public.wg_profiles add column if not exists storage_bytes bigint not null default 0;
create index if not exists idx_wg_profiles_deleted on public.wg_profiles(deleted_at) where deleted_at is not null;

-- 13b. Post extensions: co-authors, coordinate tags, comment controls, scheduled publish, insights, counters
alter table public.wg_posts add column if not exists co_author_ids uuid[] not null default '{}';
alter table public.wg_posts add column if not exists photo_tags jsonb not null default '[]'::jsonb;
alter table public.wg_posts add column if not exists comments_mode text not null default 'everyone' check (comments_mode in ('everyone', 'followers', 'off'));
alter table public.wg_posts add column if not exists hide_likes boolean not null default false;
alter table public.wg_posts add column if not exists publish_at timestamptz;
alter table public.wg_posts add column if not exists aspect_ratio text not null default '1:1';
alter table public.wg_posts add column if not exists audio_track text not null default '';
alter table public.wg_posts add column if not exists views_count int not null default 0;
alter table public.wg_posts add column if not exists likes_count int not null default 0;
alter table public.wg_posts add column if not exists comments_count int not null default 0;
alter table public.wg_posts add column if not exists saves_count int not null default 0;
alter table public.wg_posts add column if not exists embedding jsonb;
create index if not exists idx_wg_posts_publish on public.wg_posts(publish_at) where publish_at is not null;

-- Optional GIN Trigram / Full-Text indexes for ultra-fast discovery search
do $$
begin
  create extension if not exists pg_trgm;
  create index if not exists idx_wg_profiles_name_trgm on public.wg_profiles using gin (display_name gin_trgm_ops);
  create index if not exists idx_wg_profiles_user_trgm on public.wg_profiles using gin (username gin_trgm_ops);
  create index if not exists idx_wg_posts_caption_trgm on public.wg_posts using gin (caption gin_trgm_ops);
exception when others then null;
end $$;

alter table public.wg_post_comments add column if not exists likes_count int not null default 0;
alter table public.wg_stories add column if not exists audience text not null default 'everyone' check (audience in ('everyone', 'close_friends'));
alter table public.wg_stories add column if not exists stickers jsonb not null default '[]'::jsonb;
alter table public.wg_stories add column if not exists publish_at timestamptz;
alter table public.wg_stories add column if not exists archived boolean not null default false;
alter table public.wg_reels add column if not exists audio_id text not null default '';
alter table public.wg_reels add column if not exists remix_of text;
alter table public.wg_reels add column if not exists views_count int not null default 0;
alter table public.wg_conversations add column if not exists vanish_sec int not null default 0;
alter table public.wg_conversations add column if not exists bubble_theme text not null default 'default';
alter table public.wg_conversations add column if not exists invite_token text;
alter table public.wg_conversations add column if not exists is_request boolean not null default false;
alter table public.wg_conversations add column if not exists is_broadcast boolean not null default false;
alter table public.wg_messages add column if not exists opened_at timestamptz;
alter table public.wg_messages add column if not exists send_at timestamptz;
alter table public.wg_messages add column if not exists silent boolean not null default false;
alter table public.wg_messages add column if not exists client_msg_id text;
alter table public.wg_messages add column if not exists starred_by uuid[] not null default '{}';
create unique index if not exists idx_wg_msg_client_id on public.wg_messages(conversation_id, client_msg_id) where client_msg_id is not null;
create index if not exists idx_wg_msg_send_at on public.wg_messages(send_at) where send_at is not null;

-- 13c. Soft Mutes, Comment Restricts, Close Friends, Followed Hashtags, Bookmark Collections
create table if not exists public.wg_mutes (
  user_id uuid not null references auth.users(id) on delete cascade,
  muted_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_user_id),
  check (user_id <> muted_user_id)
);
alter table public.wg_mutes enable row level security;
drop policy if exists "wg_mutes_own" on public.wg_mutes;
create policy "wg_mutes_own" on public.wg_mutes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.wg_restricted (
  user_id uuid not null references auth.users(id) on delete cascade,
  restricted_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, restricted_user_id),
  check (user_id <> restricted_user_id)
);
alter table public.wg_restricted enable row level security;
drop policy if exists "wg_restricted_own" on public.wg_restricted;
create policy "wg_restricted_own" on public.wg_restricted for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.wg_close_friends (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
alter table public.wg_close_friends enable row level security;
drop policy if exists "wg_close_friends_own" on public.wg_close_friends;
create policy "wg_close_friends_own" on public.wg_close_friends for all to authenticated
  using (user_id = (select auth.uid()) or friend_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.wg_followed_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, tag)
);
alter table public.wg_followed_tags enable row level security;
drop policy if exists "wg_followed_tags_own" on public.wg_followed_tags;
create policy "wg_followed_tags_own" on public.wg_followed_tags for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.wg_saved_collections (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  post_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.wg_saved_collections enable row level security;
drop policy if exists "wg_saved_collections_own" on public.wg_saved_collections;
create policy "wg_saved_collections_own" on public.wg_saved_collections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.wg_comment_likes (
  comment_id text not null references public.wg_post_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.wg_comment_likes enable row level security;
drop policy if exists "wg_comment_likes_all" on public.wg_comment_likes;
create policy "wg_comment_likes_all" on public.wg_comment_likes for select to authenticated using (true);
drop policy if exists "wg_comment_likes_own" on public.wg_comment_likes;
create policy "wg_comment_likes_own" on public.wg_comment_likes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.wg_reel_views (
  reel_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  viewed_day date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id, viewed_day)
);
alter table public.wg_reel_views enable row level security;
drop policy if exists "wg_reel_views_own" on public.wg_reel_views;
create policy "wg_reel_views_own" on public.wg_reel_views for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 13d. Per-user reactions, Call history, Device Keys, Key History, Sessions, AI Threads & Telemetry
create table if not exists public.wg_message_reactions (
  message_id text not null references public.wg_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.wg_message_reactions enable row level security;
drop policy if exists "wg_msg_react_own" on public.wg_message_reactions;
create policy "wg_msg_react_own" on public.wg_message_reactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.wg_calls (
  id text primary key,
  conversation_id text not null references public.wg_conversations(id) on delete cascade,
  caller_id uuid references auth.users(id) on delete set null,
  callee_id uuid references auth.users(id) on delete set null,
  kind text not null default 'voice' check (kind in ('voice', 'video', 'group')),
  status text not null default 'ended' check (status in ('ringing', 'connected', 'missed', 'declined', 'ended')),
  duration_sec int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.wg_calls enable row level security;
drop policy if exists "wg_calls_member" on public.wg_calls;
create policy "wg_calls_member" on public.wg_calls for select to authenticated
  using (caller_id = (select auth.uid()) or callee_id = (select auth.uid()));

create table if not exists public.wg_user_devices (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null default 'Browser Device',
  public_key jsonb not null,
  key_fp text not null,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.wg_user_devices enable row level security;
drop policy if exists "wg_devices_select" on public.wg_user_devices;
create policy "wg_devices_select" on public.wg_user_devices for select to authenticated using (true);
drop policy if exists "wg_devices_own" on public.wg_user_devices;
create policy "wg_devices_own" on public.wg_user_devices for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.wg_key_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  key_fp text not null,
  public_key jsonb not null,
  reason text not null default 'rotation',
  created_at timestamptz not null default now()
);
create index if not exists idx_wg_key_hist_user on public.wg_key_history(user_id, created_at desc);
alter table public.wg_key_history enable row level security;
drop policy if exists "wg_key_hist_select" on public.wg_key_history;
create policy "wg_key_hist_select" on public.wg_key_history for select to authenticated using (true);

create table if not exists public.wg_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Web Session',
  user_agent text not null default '',
  city text not null default '',
  revoked boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.wg_sessions enable row level security;
drop policy if exists "wg_sessions_own" on public.wg_sessions;
create policy "wg_sessions_own" on public.wg_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.wg_ai_threads (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Thread',
  pinned boolean not null default false,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.wg_ai_threads enable row level security;
drop policy if exists "wg_ai_threads_own" on public.wg_ai_threads;
create policy "wg_ai_threads_own" on public.wg_ai_threads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.wg_telemetry (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_wg_telemetry_event on public.wg_telemetry(event, created_at desc);
alter table public.wg_telemetry enable row level security;
drop policy if exists "wg_telemetry_own" on public.wg_telemetry;
create policy "wg_telemetry_own" on public.wg_telemetry for select to authenticated
  using (user_id = (select auth.uid()));

-- 13e. Denormalized Counter Triggers for wg_posts
create or replace function public.wg_sync_post_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'wg_post_likes' then
    update public.wg_posts set likes_count = (select count(*)::int from public.wg_post_likes where post_id = coalesce(new.post_id, old.post_id)) where id = coalesce(new.post_id, old.post_id);
  elsif tg_table_name = 'wg_post_comments' then
    update public.wg_posts set comments_count = (select count(*)::int from public.wg_post_comments where post_id = coalesce(new.post_id, old.post_id)) where id = coalesce(new.post_id, old.post_id);
  elsif tg_table_name = 'wg_post_saves' then
    update public.wg_posts set saves_count = (select count(*)::int from public.wg_post_saves where post_id = coalesce(new.post_id, old.post_id) and kind = 'save') where id = coalesce(new.post_id, old.post_id);
  end if;
  return null;
end $$;

drop trigger if exists trg_wg_sync_likes on public.wg_post_likes;
create trigger trg_wg_sync_likes after insert or delete on public.wg_post_likes for each row execute function public.wg_sync_post_counts();
drop trigger if exists trg_wg_sync_comments on public.wg_post_comments;
create trigger trg_wg_sync_comments after insert or delete on public.wg_post_comments for each row execute function public.wg_sync_post_counts();
drop trigger if exists trg_wg_sync_saves on public.wg_post_saves;
create trigger trg_wg_sync_saves after insert or delete on public.wg_post_saves for each row execute function public.wg_sync_post_counts();
