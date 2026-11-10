/**
 * Arcade leaderboard client.
 *
 * Scores live in Supabase table `arcade_scores`. The app degrades gracefully:
 * when Supabase is not configured, or the table has not been created yet, the
 * UI shows a clear setup message and scores stay in local storage only.
 *
 * Table shape (see supabase/migrations/006_arcade_leaderboard.sql):
 *   id uuid primary key default gen_random_uuid()
 *   user_id text not null
 *   player_name text not null
 *   game_id integer not null
 *   game_name text not null
 *   score integer not null default 0
 *   created_at timestamptz not null default now()
 *   updated_at timestamptz not null default now()
 *   unique (user_id, game_id)
 */

import { getSupabase, isSupabaseConfigured } from './supabase/browser';

export const ARCADE_TABLE = 'arcade_scores';
const QUEUE_KEY = 'whatsgram:arcade_score_queue';

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-200)));
  } catch {
    /* storage is best-effort */
  }
}

function enqueue(payload) {
  const queue = readQueue();
  const key = payload.userId + ':' + payload.gameId;
  const idx = queue.findIndex((q) => q.userId + ':' + q.gameId === key);
  if (idx >= 0) {
    if ((queue[idx].score || 0) >= payload.score) return;
    queue[idx] = payload;
  } else {
    queue.push(payload);
  }
  writeQueue(queue);
}

export function leaderboardConfigured() {
  return isSupabaseConfigured();
}

export function pendingScoreCount() {
  return readQueue().length;
}

/** Rewrites queued scores that were recorded under a legacy local id. */
export function reassignQueueUser(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return 0;
  const queue = readQueue();
  let changed = 0;
  const next = queue.map((item) => {
    if (item && item.userId === fromId) {
      changed += 1;
      return { ...item, userId: toId };
    }
    return item;
  });
  if (changed) writeQueue(next);
  return changed;
}

export async function fetchTopScores({ gameId = null, limit = 20 } = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'not_configured', rows: [] };
  }
  try {
    const supabase = getSupabase();
    let query = supabase
      .from(ARCADE_TABLE)
      .select('id,user_id,player_name,game_id,game_name,score,updated_at')
      .order('score', { ascending: false })
      .limit(limit);
    if (gameId !== null && gameId !== undefined) {
      query = query.eq('game_id', gameId);
    }
    const { data, error } = await query;
    if (error) {
      const missing = error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message || '');
      return { ok: false, reason: missing ? 'missing_table' : error.message, rows: [] };
    }
    return { ok: true, rows: data || [] };
  } catch (error) {
    return { ok: false, reason: error.message || 'network_error', rows: [] };
  }
}

export async function submitScore(payload) {
  const { userId, playerName, gameId, gameName, score } = payload || {};
  if (!userId || !gameId || !Number.isFinite(score) || score <= 0) {
    return { ok: false, reason: 'invalid' };
  }
  if (!isSupabaseConfigured()) {
    enqueue(payload);
    return { ok: false, reason: 'not_configured' };
  }
  try {
    const supabase = getSupabase();
    const { data: existing, error: selectError } = await supabase
      .from(ARCADE_TABLE)
      .select('id,score')
      .eq('user_id', userId)
      .eq('game_id', gameId)
      .maybeSingle();

    if (selectError) {
      const missing = selectError.code === 'PGRST205' || /does not exist|schema cache/i.test(selectError.message || '');
      enqueue(payload);
      return { ok: false, reason: missing ? 'missing_table' : selectError.message };
    }

    if (!existing) {
      const { error } = await supabase.from(ARCADE_TABLE).insert({
        user_id: userId,
        player_name: playerName || 'Player',
        game_id: gameId,
        game_name: gameName || 'Game',
        score,
      });
      if (error) {
        const missing = error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message || '');
        enqueue(payload);
        return { ok: false, reason: missing ? 'missing_table' : error.message };
      }
      return { ok: true };
    }

    if (score > (existing.score || 0)) {
      const { error } = await supabase
        .from(ARCADE_TABLE)
        .update({
          score,
          player_name: playerName || 'Player',
          game_name: gameName || 'Game',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) {
        enqueue(payload);
        return { ok: false, reason: error.message };
      }
    }
    return { ok: true };
  } catch (error) {
    enqueue(payload);
    return { ok: false, reason: error.message || 'network_error' };
  }
}

// Debounced per user+game so rapid score ticks do not hammer the network.
const pending = new Map();

export function queueScore(payload, delay = 1500) {
  if (!payload || !payload.userId || !payload.gameId || !(payload.score > 0)) return;
  const key = payload.userId + ':' + payload.gameId;
  const prev = pending.get(key);
  if (prev) clearTimeout(prev.timer);
  const best = prev && prev.payload.score >= payload.score ? prev.payload : payload;
  const timer = setTimeout(() => {
    pending.delete(key);
    submitScore(best);
  }, delay);
  pending.set(key, { timer, payload: best });
}

export async function flushQueue() {
  const queue = readQueue();
  if (!queue.length) return { ok: true, sent: 0 };
  const remaining = [];
  let sent = 0;
  let blocked = null;
  for (let i = 0; i < queue.length; i += 1) {
    if (blocked) {
      remaining.push(queue[i]);
      continue;
    }
    const res = await submitScore(queue[i]);
    if (res.ok) {
      sent += 1;
    } else if (res.reason === 'missing_table' || res.reason === 'not_configured') {
      // No point retrying the rest of the queue this session.
      blocked = res.reason;
      remaining.push(queue[i]);
    } else {
      remaining.push(queue[i]);
    }
  }
  writeQueue(remaining);
  return { ok: true, sent, remaining: remaining.length, blocked };
}

export const ARCADE_LEADERBOARD_SQL = `create table if not exists public.arcade_scores (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  player_name text not null,
  game_id integer not null,
  game_name text not null,
  score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_id)
);

create index if not exists arcade_scores_game_score_idx
  on public.arcade_scores (game_id, score desc);

alter table public.arcade_scores enable row level security;

create policy "arcade scores are readable"
  on public.arcade_scores for select using (true);

create policy "arcade scores can be inserted"
  on public.arcade_scores for insert with check (true);

create policy "arcade scores can be updated"
  on public.arcade_scores for update using (true) with check (true);`;
