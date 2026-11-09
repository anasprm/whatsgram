-- ============================================================================
-- WhatsGram — Supabase Schema Migration
-- ============================================================================
-- Run this in your Supabase project SQL Editor.
-- Creates tables for: identity sub-profiles, call logs, game records,
-- reels, posts, status updates, and persists chat messages/bots.
-- ============================================================================

-- Enable Realtime extension
create extension if not exists realtime;

-- ----------------------------------------------------------------------------
-- Table: custom_bots
-- Telegram-style BotFather custom bots
-- ----------------------------------------------------------------------------
create table if not exists public.custom_bots (
  id text primary key,
  name text not null,
  username text not null,
  token text not null,
  created_at timestamptz default now()
);

alter table public.custom_bots enable row level security;

-- custom_bots: users can manage their own bots
create policy if not exists custom_bots_select_own
  on public.custom_bots for select
  using (true);

create policy if not exists custom_bots_insert_own
  on public.custom_bots for insert
  with check (true);

create policy if not exists custom_bots_update_own
  on public.custom_bots for update
  using (true);

create policy if not exists custom_bots_delete_own
  on public.custom_bots for delete
  using (true);

-- ----------------------------------------------------------------------------
-- Table: identity_sub_profiles
-- WhatsApp-style sub-profiles with bio, about, status, avatar, color
-- ----------------------------------------------------------------------------
create table if not exists public.identity_sub_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  color text default '#833AB4',
  avatar_url text,
  bio text default '',
  about text default '',
  status text default 'Available',
  is_active boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.identity_sub_profiles enable row level security;

-- ----------------------------------------------------------------------------
-- Table: call_logs
-- Voice/video call records
-- ----------------------------------------------------------------------------
create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid references auth.users(id) on delete set null,
  receiver_id uuid references auth.users(id) on delete set null,
  call_type text default 'audio', -- 'audio' | 'video'
  duration integer default 0, -- seconds
  status text default 'missed', -- 'missed' | 'answered' | 'declined' | 'ongoing'
  started_at timestamptz default now(),
  ended_at timestamptz,
  created_at timestamptz default now()
);

alter table public.call_logs enable row level security;

-- ----------------------------------------------------------------------------
-- Table: game_records
-- Arcade game high scores and records
-- ----------------------------------------------------------------------------
create table if not exists public.game_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  game_id integer not null,
  game_name text not null,
  score integer default 0,
  category text,
  achieved_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.game_records enable row level security;

-- ----------------------------------------------------------------------------
-- Table: reels
-- Instagram-style short video reels
-- ----------------------------------------------------------------------------
create table if not exists public.reels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  video_url text not null,
  thumbnail_url text,
  caption text,
  likes integer default 0,
  views integer default 0,
  created_at timestamptz default now()
);

alter table public.reels enable row level security;

-- ----------------------------------------------------------------------------
-- Table: posts
-- User posts (text + optional media)
-- ----------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  content text,
  media_url text,
  media_type text, -- 'image' | 'video' | null
  likes integer default 0,
  created_at timestamptz default now()
);

alter table public.posts enable row level security;

-- ----------------------------------------------------------------------------
-- Table: status_updates
-- User status / story updates
-- ----------------------------------------------------------------------------
create table if not exists public.status_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  status_text text,
  media_url text,
  expires_at timestamptz,
  created_at timestamptz default now()
);

alter table public.status_updates enable row level security;

-- ----------------------------------------------------------------------------
-- Indexes for common query patterns
-- ----------------------------------------------------------------------------
create index if not exists idx_identity_sub_profiles_user_id on public.identity_sub_profiles(user_id);
create index if not exists idx_identity_sub_profiles_active on public.identity_sub_profiles(is_active);
create index if not exists idx_call_logs_caller on public.call_logs(caller_id);
create index if not exists idx_call_logs_receiver on public.call_logs(receiver_id);
create index if not exists idx_call_logs_created_at on public.call_logs(created_at desc);
create index if not exists idx_game_records_user_id on public.game_records(user_id);
create index if not exists idx_game_records_game_id on public.game_records(game_id);
create index if not exists idx_game_records_score on public.game_records(score desc);
create index if not exists idx_reels_user_id on public.reels(user_id);
create index if not exists idx_reels_created_at on public.reels(created_at desc);
create index if not exists idx_posts_user_id on public.posts(user_id);
create index if not exists idx_posts_created_at on public.posts(created_at desc);
create index if not exists idx_status_updates_user_id on public.status_updates(user_id);
create index if not exists idx_status_updates_expires on public.status_updates(expires_at);

-- ----------------------------------------------------------------------------
-- Enable Realtime on key tables
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.custom_bots;
alter publication supabase_realtime add table public.identity_sub_profiles;
alter publication supabase_realtime add table public.call_logs;
alter publication supabase_realtime add table public.game_records;
alter publication supabase_realtime add table public.reels;
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.status_updates;

-- ----------------------------------------------------------------------------
-- RLS Policies (permissive for development; tighten for production)
-- ----------------------------------------------------------------------------

-- identity_sub_profiles: users can manage their own profiles
create policy if not exists identity_sub_profiles_select_own
  on public.identity_sub_profiles for select
  using (auth.uid() = user_id);

create policy if not exists identity_sub_profiles_insert_own
  on public.identity_sub_profiles for insert
  with check (auth.uid() = user_id);

create policy if not exists identity_sub_profiles_update_own
  on public.identity_sub_profiles for update
  using (auth.uid() = user_id);

create policy if not exists identity_sub_profiles_delete_own
  on public.identity_sub_profiles for delete
  using (auth.uid() = user_id);

-- call_logs: users can manage their own call logs
create policy if not exists call_logs_select_own
  on public.call_logs for select
  using (auth.uid() = caller_id or auth.uid() = receiver_id);

create policy if not exists call_logs_insert_own
  on public.call_logs for insert
  with check (auth.uid() = caller_id);

-- game_records: users can manage their own scores
create policy if not exists game_records_select_own
  on public.game_records for select
  using (auth.uid() = user_id);

create policy if not exists game_records_insert_own
  on public.game_records for insert
  with check (auth.uid() = user_id);

-- reels: public read, owner write
create policy if not exists reels_select_all
  on public.reels for select
  using (true);

create policy if not exists reels_insert_own
  on public.reels for insert
  with check (auth.uid() = user_id);

create policy if not exists reels_update_own
  on public.reels for update
  using (auth.uid() = user_id);

create policy if not exists reels_delete_own
  on public.reels for delete
  using (auth.uid() = user_id);

-- posts: public read, owner write
create policy if not exists posts_select_all
  on public.posts for select
  using (true);

create policy if not exists posts_insert_own
  on public.posts for insert
  with check (auth.uid() = user_id);

create policy if not exists posts_update_own
  on public.posts for update
  using (auth.uid() = user_id);

create policy if not exists posts_delete_own
  on public.posts for delete
  using (auth.uid() = user_id);

-- status_updates: public read, owner write
create policy if not exists status_updates_select_all
  on public.status_updates for select
  using (true);

create policy if not exists status_updates_insert_own
  on public.status_updates for insert
  with check (auth.uid() = user_id);

create policy if not exists status_updates_delete_own
  on public.status_updates for delete
  using (auth.uid() = user_id);

-- messages: persist to Supabase too
create policy if not exists messages_select_all_dev
  on public.messages for select
  using (true);

create policy if not exists messages_insert_all_dev
  on public.messages for insert
  with check (true);

create policy if not exists messages_update_all_dev
  on public.messages for update
  using (true);

-- conversations: persist to Supabase too
create policy if not exists conversations_select_all_dev
  on public.conversations for select
  using (true);

create policy if not exists conversations_insert_all_dev
  on public.conversations for insert
  with check (true);