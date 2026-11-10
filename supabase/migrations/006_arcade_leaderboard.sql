-- ============================================================
-- 006 — Arcade leaderboard
-- ============================================================
-- One row per (user, game) holding that player's best score.
-- The client upserts through lib/arcadeLeaderboard.js and falls back to
-- local storage whenever this table is missing.
--
-- Apply with either:
--   * Supabase dashboard → SQL Editor → paste this file → Run
--   * supabase db push (if you have the CLI + access token linked)

create extension if not exists pgcrypto;

create table if not exists public.arcade_scores (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  player_name text not null,
  game_id integer not null,
  game_name text not null,
  score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arcade_scores_user_game_key unique (user_id, game_id)
);

create index if not exists arcade_scores_game_score_idx
  on public.arcade_scores (game_id, score desc);

create index if not exists arcade_scores_score_idx
  on public.arcade_scores (score desc);

alter table public.arcade_scores enable row level security;

-- The app uses its own account system (not Supabase Auth), so the public
-- anon key is the only identity available. These policies keep the board
-- publicly readable and allow players to post/update their own best score.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'arcade_scores' and policyname = 'arcade scores are readable'
  ) then
    create policy "arcade scores are readable"
      on public.arcade_scores for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'arcade_scores' and policyname = 'arcade scores can be inserted'
  ) then
    create policy "arcade scores can be inserted"
      on public.arcade_scores for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'arcade_scores' and policyname = 'arcade scores can be updated'
  ) then
    create policy "arcade scores can be updated"
      on public.arcade_scores for update using (true) with check (true);
  end if;
end
$$;

-- Realtime is optional; harmless if the publication does not exist.
do $$
begin
  begin
    alter publication supabase_realtime add table public.arcade_scores;
  exception
    when others then null;
  end;
end
$$;

grant select, insert, update on public.arcade_scores to anon, authenticated;
