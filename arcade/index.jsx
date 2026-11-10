'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trophy, RefreshCw, AlertCircle, Database, Gamepad2 } from 'lucide-react';
import {
  TicTacToe, TicTacToeUltimate, Connect4, Checkers, Chess, Battleship,
  MemoryMatch, Minesweeper, MinesweeperHard, Game2048, Simon, WordScramble,
  Hangman, Sokoban, LightsOut, Sudoku,
} from './board';
import {
  Snake, Pong, Tetris, SpaceInvaders, Breakout, PacGrid, Flappy, DinoRun,
  BubbleShooter, ColorSwitch, Pinball, CarDodger, Archery, GolfPutt, Bowling,
  Basketball, Darts, Pool, TowerDefense, Tron, CoinDozer, DiceRace, Asteroids,
} from './action';
import {
  WhackAMole, RPS, Blackjack, Slots, DiceRoller, TowerStack, RhythmTap,
  ZombieClicker, CookieClicker, CalculatorClicker, Tamagotchi, Drumkit,
  TypingTest, ZenBreathing,
} from './casual';
import {
  ARCADE_LEADERBOARD_SQL, fetchTopScores, flushQueue, leaderboardConfigured,
} from '../lib/arcadeLeaderboard';

// id -> engine. Every id in ALL_GAMES has exactly one real engine here.
export const GAME_ENGINES = {
  1: TicTacToe,
  2: Battleship,
  3: Snake,
  4: Pong,
  5: Tetris,
  6: MemoryMatch,
  7: Game2048,
  8: SpaceInvaders,
  9: Breakout,
  10: PacGrid,
  11: Flappy,
  12: DinoRun,
  13: Sudoku,
  14: Chess,
  15: Checkers,
  16: Connect4,
  17: WhackAMole,
  18: Simon,
  19: RPS,
  20: Blackjack,
  21: Slots,
  22: DiceRoller,
  23: Minesweeper,
  24: BubbleShooter,
  25: WordScramble,
  26: Hangman,
  27: TowerStack,
  28: ColorSwitch,
  29: Pinball,
  30: RhythmTap,
  31: CarDodger,
  32: ZombieClicker,
  33: CookieClicker,
  34: Archery,
  35: GolfPutt,
  36: Bowling,
  37: Basketball,
  38: Darts,
  39: Pool,
  40: TicTacToeUltimate,
  41: TowerDefense,
  42: Tron,
  43: Sokoban,
  44: LightsOut,
  45: CalculatorClicker,
  46: CoinDozer,
  47: Tamagotchi,
  48: Drumkit,
  49: TypingTest,
  50: ZenBreathing,
  51: MinesweeperHard,
  52: DiceRace,
  53: Asteroids,
};

export function hasEngine(gameId) {
  return Boolean(GAME_ENGINES[gameId]);
}

export function ArcadePlayer({ game, sound, best, onScore }) {
  const Engine = GAME_ENGINES[game?.id] || TicTacToe;

  // Engines often report a new score from inside a state updater. React runs
  // updaters during render, so calling the parent's setState there logs
  // "Cannot update a component while rendering a different component".
  // Defer the report to a microtask: it lands after the commit and stays
  // identical for every engine.
  const reportRef = useRef(onScore);
  reportRef.current = onScore;
  const report = useCallback((value) => {
    const fn = reportRef.current;
    if (!fn) return;
    Promise.resolve().then(() => {
      if (reportRef.current === fn) fn(value);
    });
  }, []);

  return (
    <Engine
      key={game?.id}
      theme={game?.theme || '#22d3ee'}
      sound={sound}
      best={best || 0}
      onScore={report}
    />
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function Leaderboard({ games = [], currentUserId }) {
  const [scope, setScope] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSql, setShowSql] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      // Push any locally queued scores in the background so the table paints
      // immediately even when the queue is long or Supabase is unreachable.
      flushQueue();
      const res = await fetchTopScores({
        gameId: scope === 'all' ? null : Number(scope),
        limit: 20,
      });
      if (!alive) return;
      setRows(res.rows);
      setError(res.ok ? null : res.reason);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [scope, refreshKey]);

  const scopeName =
    scope === 'all'
      ? 'All games'
      : (games.find((g) => g.id === Number(scope)) || {}).name || 'Selected game';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h4 className="text-sm font-bold text-white">Leaderboard</h4>
          <span className="text-[10px] font-mono text-zinc-500">top 20 · {scopeName}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="bg-[#1F2C34] border border-[#2A3942] text-xs text-white rounded-lg px-2 py-1.5 outline-none focus:border-cyan-500 max-w-[180px]"
          >
            <option value="all">All games</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>#{g.id} {g.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="p-2 rounded-lg bg-[#1F2C34] hover:bg-[#2A3942] text-zinc-300 transition"
            title="Refresh"
          >
            <RefreshCw className={'w-4 h-4 ' + (loading ? 'animate-spin' : '')} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold">
                {error === 'missing_table'
                  ? 'Leaderboard table is not set up yet'
                  : error === 'not_configured'
                    ? 'Supabase is not configured'
                    : 'Could not load the leaderboard'}
              </div>
              <p className="text-[11px] mt-1 text-amber-200/80">
                {error === 'missing_table'
                  ? 'Run the SQL below once in the Supabase dashboard (SQL Editor). Scores are kept locally until then.'
                  : error === 'not_configured'
                    ? 'Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the environment.'
                    : String(error)}
              </p>
              {error === 'missing_table' ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowSql((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-100 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg px-2.5 py-1.5 transition"
                  >
                    <Database className="w-3.5 h-3.5" />
                    {showSql ? 'Hide SQL' : 'Show setup SQL'}
                  </button>
                  {showSql ? (
                    <pre className="mt-2 max-h-56 overflow-auto text-[10px] leading-relaxed bg-[#0B141A] border border-amber-500/20 rounded-lg p-3 text-amber-100 whitespace-pre-wrap">
                      {ARCADE_LEADERBOARD_SQL}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-zinc-500 font-mono">
          Loading scores…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-500">
          <Gamepad2 className="w-8 h-8 opacity-40" />
          <p className="text-xs">No scores yet — be the first to post one.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-hide -mx-1 px-1">
          <table className="w-full text-left border-separate border-spacing-y-1">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-zinc-500 font-mono">
                <th className="px-2 py-1 w-10">#</th>
                <th className="px-2 py-1">Player</th>
                {scope === 'all' ? <th className="px-2 py-1">Game</th> : null}
                <th className="px-2 py-1 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const mine = row.user_id === currentUserId;
                return (
                  <tr
                    key={row.id || row.user_id + '-' + row.game_id}
                    className={
                      'text-xs ' +
                      (mine
                        ? 'bg-cyan-500/15 text-cyan-100'
                        : i < 3
                          ? 'bg-amber-500/10 text-amber-100'
                          : 'bg-[#1F2C34] text-zinc-200')
                    }
                  >
                    <td className="px-2 py-2 rounded-l-lg font-mono">{MEDALS[i] || i + 1}</td>
                    <td className="px-2 py-2 font-bold truncate max-w-[130px]">
                      {row.player_name || 'Player'}
                      {mine ? <span className="ml-1 text-[9px] font-mono text-cyan-300">you</span> : null}
                    </td>
                    {scope === 'all' ? (
                      <td className="px-2 py-2 text-[10px] text-zinc-400 truncate max-w-[110px]">
                        {row.game_name || 'Game #' + row.game_id}
                      </td>
                    ) : null}
                    <td className="px-2 py-2 rounded-r-lg text-right font-mono font-bold text-emerald-300">
                      {row.score}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-zinc-600 mt-2">
        {!leaderboardConfigured()
          ? 'Supabase is not configured — scores are stored locally only.'
          : error === 'missing_table'
            ? 'Scores are queued locally and will sync as soon as the table exists.'
            : 'Scores sync to Supabase automatically when you beat your best.'}
      </p>
    </div>
  );
}
