-- WhatsGram OS — Supabase Postgres Schema, RLS Policies & Realtime Setup
-- Run this once in your Supabase Dashboard -> SQL Editor.

-- 1. User Profiles (discovered for real-time user-to-user DMs + ECDH E2EE public keys)
create table if not exists public.wg_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  email text unique not null,
  display_name text not null,
  status text not null default 'Online',
  public_key jsonb,
  key_fp text,
  bio text not null default '',
  category text not null default '',
  website text not null default '',
  links jsonb not null default '[]'::jsonb,
  contact_email text not null default '',
  location_text text not null default '',
  avatar_path text not null default '',
  verified boolean not null default false,
  threads_handle text not null default '',
  created_at timestamptz not null default now()
);
alter table public.wg_profiles add column if not exists username text;
alter table public.wg_profiles add column if not exists public_key jsonb;
alter table public.wg_profiles add column if not exists key_fp text;
alter table public.wg_profiles add column if not exists bio text not null default '';
alter table public.wg_profiles add column if not exists category text not null default '';
alter table public.wg_profiles add column if not exists website text not null default '';
alter table public.wg_profiles add column if not exists links jsonb not null default '[]'::jsonb;
alter table public.wg_profiles add column if not exists contact_email text not null default '';
alter table public.wg_profiles add column if not exists location_text text not null default '';
alter table public.wg_profiles add column if not exists avatar_path text not null default '';
alter table public.wg_profiles add column if not exists verified boolean not null default false;
alter table public.wg_profiles add column if not exists threads_handle text not null default '';
create unique index if not exists idx_wg_profiles_username_lower
  on public.wg_profiles (lower(username))
  where username is not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'wg_profiles_username_format'
      and conrelid = 'public.wg_profiles'::regclass
  ) then
    alter table public.wg_profiles
      add constraint wg_profiles_username_format
      check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,23}$');
  end if;
end $$;

-- 1b. Optional Recovery Emails (private owner-scoped RLS so peer reads never expose recovery email)
create table if not exists public.wg_account_recovery (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recovery_email text not null,
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_wg_recovery_email_lower
  on public.wg_account_recovery (lower(recovery_email));

-- 1c. Hashed Single-Use Password Reset Tokens (server-only via secretKey/service_role)
create table if not exists public.wg_password_resets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  recovery_email text not null,
  token_hash text unique not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_wg_pw_resets_user_created
  on public.wg_password_resets (user_id, created_at desc);
create index if not exists idx_wg_pw_resets_active_hash
  on public.wg_password_resets (token_hash)
  where used_at is null;

-- 1d. Passphrase-Encrypted Multi-Device E2EE Key Backups (zero-knowledge ciphertext, owner-only)
create table if not exists public.wg_key_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  key_fp text not null default '',
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2. Vault & Workspace Settings
create table if not exists public.wg_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cfg jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3. Conversations (1:1 DMs, AI threads, Group chats, and read watermarks)
create table if not exists public.wg_conversations (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  peer_user_id uuid references auth.users(id) on delete set null,
  is_group boolean not null default false,
  name text not null,
  folder text not null default 'personal' check (folder in ('work', 'personal')),
  status text not null default 'Online',
  pin_msg_id text,
  unread int not null default 0,
  owner_read_ms bigint not null default 0,
  peer_read_ms bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.wg_conversations add column if not exists is_group boolean not null default false;
alter table public.wg_conversations add column if not exists owner_read_ms bigint not null default 0;
alter table public.wg_conversations add column if not exists peer_read_ms bigint not null default 0;
create index if not exists idx_wg_conv_owner on public.wg_conversations(owner_id, updated_at desc);
create index if not exists idx_wg_conv_peer on public.wg_conversations(peer_user_id, updated_at desc);

-- 3b. Group Conversation Memberships
create table if not exists public.wg_conversation_members (
  conversation_id text not null references public.wg_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  last_read_ms bigint not null default 0,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists idx_wg_conv_members_user on public.wg_conversation_members(user_id);

-- 4. Messages (with optional cloud media paths, E2EE media flag, edits & vanish expiry)
create table if not exists public.wg_messages (
  id text primary key,
  conversation_id text not null references public.wg_conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text,
  sender_role text not null check (sender_role in ('me', 'them', 'sys')),
  msg_type text not null default 'text' check (msg_type in ('text', 'voice', 'file', 'sys')),
  body text not null default '',
  file_name text,
  file_size text,
  media_path text,
  media_mime text,
  media_enc boolean not null default false,
  dur text,
  ct text,
  reply_preview jsonb,
  react jsonb not null default '{}'::jsonb,
  edited_at bigint,
  exp_at bigint,
  created_ms bigint not null default 0,
  time_label text not null,
  created_at timestamptz not null default now()
);
alter table public.wg_messages add column if not exists media_path text;
alter table public.wg_messages add column if not exists media_mime text;
alter table public.wg_messages add column if not exists media_enc boolean not null default false;
alter table public.wg_messages add column if not exists sender_name text;
alter table public.wg_messages add column if not exists edited_at bigint;
alter table public.wg_messages add column if not exists created_ms bigint not null default 0;
create index if not exists idx_wg_msg_conv on public.wg_messages(conversation_id, created_at asc);
create index if not exists idx_wg_msg_conv_ms on public.wg_messages(conversation_id, created_ms desc);
create index if not exists idx_wg_msg_exp on public.wg_messages(exp_at) where exp_at is not null;

-- 5. Stories & Poll Votes (supports optional cloud photo/video background)
create table if not exists public.wg_stories (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  author_name text not null,
  bg text not null,
  question text not null,
  media_path text,
  media_mime text,
  yes_count int not null default 0,
  no_count int not null default 0,
  link text not null default '',
  co_author text not null default '',
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);
alter table public.wg_stories add column if not exists media_path text;
alter table public.wg_stories add column if not exists media_mime text;
alter table public.wg_stories add column if not exists expires_at timestamptz not null default (now() + interval '24 hours');
create index if not exists idx_wg_stories_expires on public.wg_stories(expires_at desc);

create table if not exists public.wg_story_votes (
  story_id text not null references public.wg_stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  choice text not null check (choice in ('yes', 'no')),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

-- 6. Custom Reels, Reels Preferences & Comments
create table if not exists public.wg_reels (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  caption text not null default '',
  gradient text not null,
  media_path text,
  media_mime text,
  filter_idx int not null default 0,
  likes_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_wg_reels_created on public.wg_reels(created_at desc);

-- 6. Reels Preferences & Comments
create table if not exists public.wg_reels_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  liked int[] not null default '{}',
  saved int[] not null default '{}',
  follow text[] not null default '{"alex.rivera"}',
  filter_idx int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.wg_reel_comments (
  id text primary key,
  reel_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wg_reel_comments'
      and column_name = 'reel_id' and data_type <> 'text'
  ) then
    alter table public.wg_reel_comments alter column reel_id type text using reel_id::text;
  end if;
end $$;
create index if not exists idx_wg_reel_comments_reel on public.wg_reel_comments(reel_id, created_at asc);

-- 7. Security Vault Audit Logs
create table if not exists public.wg_audit_logs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_time text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_wg_audit_user on public.wg_audit_logs(user_id, created_at desc);

-- 11. Instagram-style Social Profile: Follows, Highlights, Posts, Likes, Comments, Reposts/Saves
create table if not exists public.wg_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists idx_wg_follows_following on public.wg_follows(following_id, created_at desc);

create table if not exists public.wg_highlights (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  cover_bg text not null default 'from-amber-400 via-rose-500 to-fuchsia-600',
  cover_path text not null default '',
  slides jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_wg_highlights_user on public.wg_highlights(user_id, sort_order asc, created_at desc);

create table if not exists public.wg_posts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  caption text not null default '',
  location_text text not null default '',
  tags jsonb not null default '[]'::jsonb,
  media_type text not null default 'image',
  media_paths jsonb not null default '[]'::jsonb,
  bg text not null default 'from-indigo-600 via-fuchsia-600 to-rose-500',
  pinned boolean not null default false,
  pinned_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_wg_posts_user on public.wg_posts(user_id, pinned desc, created_at desc);
create index if not exists idx_wg_posts_created on public.wg_posts(created_at desc);
create index if not exists idx_wg_posts_tags on public.wg_posts using gin(tags);

create table if not exists public.wg_post_likes (
  post_id text not null references public.wg_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists idx_wg_post_likes_user on public.wg_post_likes(user_id, created_at desc);

create table if not exists public.wg_post_comments (
  id text primary key,
  post_id text not null references public.wg_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_wg_post_comments_post on public.wg_post_comments(post_id, created_at asc);

create table if not exists public.wg_post_saves (
  post_id text not null references public.wg_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'save',
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);
create index if not exists idx_wg_post_saves_user on public.wg_post_saves(user_id, kind, created_at desc);
create index if not exists idx_wg_post_saves_post_kind on public.wg_post_saves(post_id, kind);

-- 12. Persisted Activity Notifications & Web Push Subscriptions
create table if not exists public.wg_notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '',
  kind text not null check (kind in ('like', 'comment', 'follow', 'repost', 'message', 'mention', 'system')),
  entity_id text,
  preview text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_wg_notif_user_created on public.wg_notifications(user_id, created_at desc);
create index if not exists idx_wg_notif_user_unread on public.wg_notifications(user_id) where read_at is null;

create table if not exists public.wg_push_subscriptions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index if not exists idx_wg_push_user on public.wg_push_subscriptions(user_id, created_at desc);

-- Enable Row Level Security (RLS) on all tables
alter table public.wg_profiles enable row level security;
alter table public.wg_account_recovery enable row level security;
alter table public.wg_password_resets enable row level security;
alter table public.wg_key_backups enable row level security;
alter table public.wg_settings enable row level security;
alter table public.wg_conversations enable row level security;
alter table public.wg_conversation_members enable row level security;
alter table public.wg_messages enable row level security;
alter table public.wg_stories enable row level security;
alter table public.wg_story_votes enable row level security;
alter table public.wg_reels enable row level security;
alter table public.wg_reels_prefs enable row level security;
alter table public.wg_reel_comments enable row level security;
alter table public.wg_audit_logs enable row level security;
alter table public.wg_follows enable row level security;
alter table public.wg_highlights enable row level security;
alter table public.wg_posts enable row level security;
alter table public.wg_post_likes enable row level security;
alter table public.wg_post_comments enable row level security;
alter table public.wg_post_saves enable row level security;
alter table public.wg_notifications enable row level security;
alter table public.wg_push_subscriptions enable row level security;

-- Profiles policies
drop policy if exists "wg_profiles_select" on public.wg_profiles;
create policy "wg_profiles_select" on public.wg_profiles for select to authenticated using (true);
drop policy if exists "wg_profiles_upsert_own" on public.wg_profiles;
create policy "wg_profiles_upsert_own" on public.wg_profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Private recovery email policies (strictly owner-scoped)
drop policy if exists "wg_account_recovery_own" on public.wg_account_recovery;
create policy "wg_account_recovery_own" on public.wg_account_recovery for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Server-only hashed password reset tokens (block direct client access; backend uses secretKey)
revoke all on table public.wg_password_resets from anon, authenticated;
drop policy if exists "wg_pw_resets_deny_clients" on public.wg_password_resets;
create policy "wg_pw_resets_deny_clients" on public.wg_password_resets for all to anon, authenticated
  using (false) with check (false);

-- Encrypted E2EE key backup policies (strictly owner-scoped)
drop policy if exists "wg_key_backups_own" on public.wg_key_backups;
create policy "wg_key_backups_own" on public.wg_key_backups for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Settings, reels prefs & audit logs policies (strictly owner-scoped)
drop policy if exists "wg_settings_own" on public.wg_settings;
create policy "wg_settings_own" on public.wg_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "wg_reels_prefs_own" on public.wg_reels_prefs;
create policy "wg_reels_prefs_own" on public.wg_reels_prefs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "wg_audit_own" on public.wg_audit_logs;
create policy "wg_audit_own" on public.wg_audit_logs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Conversation members (non-recursive self scope)
drop policy if exists "wg_conv_members_own" on public.wg_conversation_members;
create policy "wg_conv_members_own" on public.wg_conversation_members for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Conversations policies (owner, peer participant, or group member)
drop policy if exists "wg_conv_participant" on public.wg_conversations;
create policy "wg_conv_participant" on public.wg_conversations for all to authenticated
  using (
    (select auth.uid()) = owner_id
    or (select auth.uid()) = peer_user_id
    or exists (
      select 1 from public.wg_conversation_members m
      where m.conversation_id = id and m.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = owner_id
    or (select auth.uid()) = peer_user_id
    or exists (
      select 1 from public.wg_conversation_members m
      where m.conversation_id = id and m.user_id = (select auth.uid())
    )
  );

-- Messages policies (visible/writable to participants or group members)
drop policy if exists "wg_msg_participant" on public.wg_messages;
create policy "wg_msg_participant" on public.wg_messages for all to authenticated
  using (
    exists (
      select 1 from public.wg_conversations c
      where c.id = conversation_id and (c.owner_id = (select auth.uid()) or c.peer_user_id = (select auth.uid()))
    )
    or exists (
      select 1 from public.wg_conversation_members m
      where m.conversation_id = conversation_id and m.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.wg_conversations c
      where c.id = conversation_id and (c.owner_id = (select auth.uid()) or c.peer_user_id = (select auth.uid()))
    )
    or exists (
      select 1 from public.wg_conversation_members m
      where m.conversation_id = conversation_id and m.user_id = (select auth.uid())
    )
  );

-- Stories, Custom Reels & Reel comments (owner-scoped mutations; atomic RPC handles poll voting)
drop policy if exists "wg_stories_read" on public.wg_stories;
create policy "wg_stories_read" on public.wg_stories for select to authenticated using (true);
drop policy if exists "wg_stories_insert" on public.wg_stories;
create policy "wg_stories_insert" on public.wg_stories for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "wg_stories_update" on public.wg_stories;
create policy "wg_stories_update" on public.wg_stories for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "wg_stories_delete" on public.wg_stories;
create policy "wg_stories_delete" on public.wg_stories for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "wg_story_votes_read" on public.wg_story_votes;
create policy "wg_story_votes_read" on public.wg_story_votes for select to authenticated using (true);
drop policy if exists "wg_story_votes_insert" on public.wg_story_votes;
create policy "wg_story_votes_insert" on public.wg_story_votes for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "wg_reels_read" on public.wg_reels;
create policy "wg_reels_read" on public.wg_reels for select to authenticated using (true);
drop policy if exists "wg_reels_insert" on public.wg_reels;
create policy "wg_reels_insert" on public.wg_reels for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "wg_reels_update" on public.wg_reels;
create policy "wg_reels_update" on public.wg_reels for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "wg_reels_delete" on public.wg_reels;
create policy "wg_reels_delete" on public.wg_reels for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "wg_reel_comments_read" on public.wg_reel_comments;
create policy "wg_reel_comments_read" on public.wg_reel_comments for select to authenticated using (true);
drop policy if exists "wg_reel_comments_insert" on public.wg_reel_comments;
create policy "wg_reel_comments_insert" on public.wg_reel_comments for insert to authenticated with check ((select auth.uid()) = user_id);

-- Social profile policies (follows, highlights, posts, likes, comments, reposts/saves)
drop policy if exists "wg_follows_read" on public.wg_follows;
create policy "wg_follows_read" on public.wg_follows for select to authenticated using (true);
drop policy if exists "wg_follows_insert" on public.wg_follows;
create policy "wg_follows_insert" on public.wg_follows for insert to authenticated with check ((select auth.uid()) = follower_id);
drop policy if exists "wg_follows_delete" on public.wg_follows;
create policy "wg_follows_delete" on public.wg_follows for delete to authenticated using ((select auth.uid()) = follower_id);

drop policy if exists "wg_highlights_read" on public.wg_highlights;
create policy "wg_highlights_read" on public.wg_highlights for select to authenticated using (true);
drop policy if exists "wg_highlights_own" on public.wg_highlights;
create policy "wg_highlights_own" on public.wg_highlights for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "wg_posts_read" on public.wg_posts;
create policy "wg_posts_read" on public.wg_posts for select to authenticated using (true);
drop policy if exists "wg_posts_own" on public.wg_posts;
create policy "wg_posts_own" on public.wg_posts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "wg_post_likes_read" on public.wg_post_likes;
create policy "wg_post_likes_read" on public.wg_post_likes for select to authenticated using (true);
drop policy if exists "wg_post_likes_own" on public.wg_post_likes;
create policy "wg_post_likes_own" on public.wg_post_likes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "wg_post_comments_read" on public.wg_post_comments;
create policy "wg_post_comments_read" on public.wg_post_comments for select to authenticated using (true);
drop policy if exists "wg_post_comments_insert" on public.wg_post_comments;
create policy "wg_post_comments_insert" on public.wg_post_comments for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "wg_post_comments_delete" on public.wg_post_comments;
create policy "wg_post_comments_delete" on public.wg_post_comments for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "wg_post_saves_read" on public.wg_post_saves;
create policy "wg_post_saves_read" on public.wg_post_saves for select to authenticated
  using (kind = 'repost' or (select auth.uid()) = user_id);
drop policy if exists "wg_post_saves_own" on public.wg_post_saves;
create policy "wg_post_saves_own" on public.wg_post_saves for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Persisted notifications & Web Push subscriptions policies
drop policy if exists "wg_notifications_read_own" on public.wg_notifications;
create policy "wg_notifications_read_own" on public.wg_notifications for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "wg_notifications_update_own" on public.wg_notifications;
create policy "wg_notifications_update_own" on public.wg_notifications for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "wg_notifications_delete_own" on public.wg_notifications;
create policy "wg_notifications_delete_own" on public.wg_notifications for delete to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "wg_notifications_insert_actor" on public.wg_notifications;
create policy "wg_notifications_insert_actor" on public.wg_notifications for insert to authenticated
  with check (actor_id is null or (select auth.uid()) = actor_id);

drop policy if exists "wg_push_subscriptions_own" on public.wg_push_subscriptions;
create policy "wg_push_subscriptions_own" on public.wg_push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Atomic RPC for story poll voting (prevents race conditions & removes open wg_stories UPDATE)
create or replace function public.wg_vote_story(p_story_id text, p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_yes int;
  v_no int;
  v_existing text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if p_choice not in ('yes', 'no') then
    raise exception 'Invalid poll choice';
  end if;

  insert into public.wg_story_votes (story_id, user_id, choice)
  values (p_story_id, v_uid, p_choice)
  on conflict (story_id, user_id) do nothing;

  if not found then
    select choice into v_existing from public.wg_story_votes where story_id = p_story_id and user_id = v_uid;
    select yes_count, no_count into v_yes, v_no from public.wg_stories where id = p_story_id;
    return jsonb_build_object(
      'already_voted', true,
      'choice', coalesce(v_existing, p_choice),
      'yes_count', coalesce(v_yes, 0),
      'no_count', coalesce(v_no, 0)
    );
  end if;

  update public.wg_stories
  set
    yes_count = yes_count + case when p_choice = 'yes' then 1 else 0 end,
    no_count = no_count + case when p_choice = 'no' then 1 else 0 end
  where id = p_story_id
  returning yes_count, no_count into v_yes, v_no;

  if not found then
    raise exception 'Story not found';
  end if;

  return jsonb_build_object(
    'already_voted', false,
    'choice', p_choice,
    'yes_count', v_yes,
    'no_count', v_no
  );
end;
$$;
revoke all on function public.wg_vote_story(text, text) from public, anon;
grant execute on function public.wg_vote_story(text, text) to authenticated;

-- Server-side aggregated profile counts (fast SQL counts without loading all rows)
create or replace function public.wg_profile_stats(p_target_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'postsCount', (select count(*)::int from public.wg_posts where user_id = p_target_id),
    'followersCount', (select count(*)::int from public.wg_follows where following_id = p_target_id),
    'followingCount', (select count(*)::int from public.wg_follows where follower_id = p_target_id),
    'highlightsCount', (select count(*)::int from public.wg_highlights where user_id = p_target_id)
  );
$$;
revoke all on function public.wg_profile_stats(uuid) from public, anon;
grant execute on function public.wg_profile_stats(uuid) to authenticated;

-- Enable Realtime replication for live chat, group memberships, profiles, stories, reels, comments, and social profiles
alter table public.wg_conversations replica identity full;
alter table public.wg_conversation_members replica identity full;
alter table public.wg_messages replica identity full;
alter table public.wg_profiles replica identity full;
alter table public.wg_reels replica identity full;
alter table public.wg_follows replica identity full;
alter table public.wg_highlights replica identity full;
alter table public.wg_posts replica identity full;
alter table public.wg_post_likes replica identity full;
alter table public.wg_post_comments replica identity full;
alter table public.wg_post_saves replica identity full;
alter table public.wg_notifications replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.wg_conversations;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wg_conversation_members;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wg_messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wg_profiles;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wg_stories;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wg_reels;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wg_reel_comments;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wg_follows;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wg_highlights;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wg_posts;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wg_post_likes;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wg_post_comments;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wg_post_saves;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.wg_notifications;
exception when duplicate_object then null;
end $$;

-- Private Storage bucket for encrypted media, voice notes, stories, and reels (15 MB limit)
insert into storage.buckets (id, name, public, file_size_limit)
values ('wg-media', 'wg-media', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

do $$
begin
  drop policy if exists "wg_media_auth_select" on storage.objects;
  create policy "wg_media_auth_select" on storage.objects for select to authenticated
    using (bucket_id = 'wg-media');
  drop policy if exists "wg_media_auth_insert" on storage.objects;
  create policy "wg_media_auth_insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'wg-media');
  drop policy if exists "wg_media_auth_update" on storage.objects;
  create policy "wg_media_auth_update" on storage.objects for update to authenticated
    using (bucket_id = 'wg-media' and owner = (select auth.uid()))
    with check (bucket_id = 'wg-media' and owner = (select auth.uid()));
  drop policy if exists "wg_media_auth_delete" on storage.objects;
  create policy "wg_media_auth_delete" on storage.objects for delete to authenticated
    using (bucket_id = 'wg-media' and owner = (select auth.uid()));
exception when insufficient_privilege then null;
end $$;

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
