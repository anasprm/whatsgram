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
  created_at timestamptz not null default now()
);
alter table public.wg_stories add column if not exists media_path text;
alter table public.wg_stories add column if not exists media_mime text;

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
  reel_id int not null,
  user_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
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

-- Enable Row Level Security (RLS) on all tables
alter table public.wg_profiles enable row level security;
alter table public.wg_account_recovery enable row level security;
alter table public.wg_password_resets enable row level security;
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

-- Stories, Custom Reels & Reel comments (shared across authenticated users)
drop policy if exists "wg_stories_read" on public.wg_stories;
create policy "wg_stories_read" on public.wg_stories for select to authenticated using (true);
drop policy if exists "wg_stories_insert" on public.wg_stories;
create policy "wg_stories_insert" on public.wg_stories for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "wg_stories_update" on public.wg_stories;
create policy "wg_stories_update" on public.wg_stories for update to authenticated using (true) with check (true);

drop policy if exists "wg_story_votes_read" on public.wg_story_votes;
create policy "wg_story_votes_read" on public.wg_story_votes for select to authenticated using (true);
drop policy if exists "wg_story_votes_insert" on public.wg_story_votes;
create policy "wg_story_votes_insert" on public.wg_story_votes for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "wg_reels_read" on public.wg_reels;
create policy "wg_reels_read" on public.wg_reels for select to authenticated using (true);
drop policy if exists "wg_reels_insert" on public.wg_reels;
create policy "wg_reels_insert" on public.wg_reels for insert to authenticated with check ((select auth.uid()) = user_id);

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
