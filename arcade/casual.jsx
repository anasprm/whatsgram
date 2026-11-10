'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  GameShell, GameButton, Pad, clamp, pick, randInt, shuffle,
  useCountdown, useKeys, useRafLoop, useScore, useSfx,
} from './shared';

// ============================================================
// 17. Whack-a-Mole
// ============================================================
export function WhackAMole({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const [active, setActive] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [hits, setHits] = useState(0);
  const cd = useCountdown(30, () => setPlaying(false));

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setActive(randInt(0, 8)), 720);
    return () => clearInterval(id);
  }, [playing]);

  const start = () => {
    reset(0);
    setHits(0);
    setActive(-1);
    setPlaying(true);
    cd.start();
  };

  const whack = (i) => {
    if (!playing || i !== active) {
      if (playing) sfx(180, 0.05, 'square');
      return;
    }
    add(10);
    setHits((h) => h + 1);
    setActive(-1);
    sfx(680, 0.06);
  };

  return (
    <GameShell
      score={score}
      best={best}
      time={cd.left}
      onStart={start}
      running={playing}
      onRestart={start}
      status={playing ? hits + ' hits' : cd.left === 0 ? 'Time! ' + hits + ' moles whacked' : ''}
      hint="Tap the mole before it disappears. 30 seconds."
      accent={theme}
    >
      <Pad>
        <div className="grid grid-cols-3 gap-2 w-56 mx-auto">
          {Array.from({ length: 9 }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => whack(i)}
              className={
                'aspect-square rounded-xl border flex items-center justify-center text-2xl transition ' +
                (active === i
                  ? 'bg-amber-500/30 border-amber-400 scale-105'
                  : 'bg-[#2A3942] border-[#3A4952] hover:bg-[#3A4952]')
              }
            >
              {active === i ? '🐹' : ''}
            </button>
          ))}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 19. Rock Paper Scissors
// ============================================================
const RPS_MOVES = [
  { id: 'rock', label: 'Rock', icon: '✊' },
  { id: 'paper', label: 'Paper', icon: '✋' },
  { id: 'scissors', label: 'Scissors', icon: '✌️' },
];
const rpsBeats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

export function RPS({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const [round, setRound] = useState(0);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [draws, setDraws] = useState(0);
  const [you, setYou] = useState(null);
  const [cpu, setCpu] = useState(null);
  const [status, setStatus] = useState('Best of 5 — pick a move');

  const play = (move) => {
    if (round >= 5) return;
    const ai = pick(RPS_MOVES).id;
    setYou(move);
    setCpu(ai);
    setRound((r) => r + 1);
    if (move === ai) {
      setDraws((d) => d + 1);
      setStatus('Draw — both picked ' + move);
      sfx(380, 0.08);
    } else if (rpsBeats[move] === ai) {
      setWins((w) => w + 1);
      add(10);
      setStatus('You win the round!');
      sfx(720, 0.1);
    } else {
      setLosses((l) => l + 1);
      setStatus('AI wins the round');
      sfx(200, 0.12, 'square');
    }
  };

  const restart = () => {
    setRound(0);
    setWins(0);
    setLosses(0);
    setDraws(0);
    setYou(null);
    setCpu(null);
    setStatus('Best of 5 — pick a move');
    reset(0);
  };

  const finished = round >= 5;
  const result = finished
    ? wins > losses
      ? 'You won the match! 🏆'
      : wins < losses
        ? 'AI won the match'
        : 'Match drawn'
    : status;

  return (
    <GameShell score={score} best={best} onRestart={restart} status={result} hint="First to win the most of 5 rounds. Each round win is +10." accent={theme}>
      <Pad>
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-4">
          <span>You {wins}</span>
          <span>Draws {draws}</span>
          <span>AI {losses}</span>
        </div>
        <div className="flex items-center justify-center gap-6 mb-4 text-4xl">
          <span>{you ? RPS_MOVES.find((m) => m.id === you).icon : '❔'}</span>
          <span className="text-zinc-600 text-sm font-mono">vs</span>
          <span>{cpu ? RPS_MOVES.find((m) => m.id === cpu).icon : '❔'}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {RPS_MOVES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => play(m.id)}
              disabled={finished}
              className="py-3 rounded-xl bg-[#2A3942] hover:bg-[#3A4952] disabled:opacity-40 text-xs font-bold flex flex-col items-center gap-1"
            >
              <span className="text-xl">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
        <div className="text-center text-[10px] text-zinc-500 mt-3 font-mono">Round {Math.min(5, round + (finished ? 0 : 1))}/5</div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 20. Blackjack 21
// ============================================================
const BJ_SUITS = ['♠', '♥', '♦', '♣'];
const BJ_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
function bjDeck() {
  const deck = [];
  BJ_SUITS.forEach((s) => BJ_RANKS.forEach((r, i) => deck.push({ r, s, v: i + 1 })));
  return shuffle(deck);
}
function bjValue(hand) {
  let total = 0;
  let aces = 0;
  hand.forEach((c) => {
    if (c.r === 'A') { aces += 1; total += 11; } else total += Math.min(10, c.v);
  });
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return total;
}
function bjCard(c) {
  const red = c.s === '♥' || c.s === '♦';
  return (
    <div className={'w-11 h-16 rounded-lg bg-white border border-zinc-300 flex flex-col items-center justify-center font-bold ' + (red ? 'text-rose-600' : 'text-zinc-900')}>
      <span className="text-sm leading-none">{c.r}</span>
      <span className="text-lg leading-none">{c.s}</span>
    </div>
  );
}

export function Blackjack({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, set } = useScore(onScore, 100);
  const [deck, setDeck] = useState([]);
  const [player, setPlayer] = useState([]);
  const [dealer, setDealer] = useState([]);
  const [chips, setChips] = useState(100);
  const [bet, setBet] = useState(10);
  const [phase, setPhase] = useState('idle');
  const [status, setStatus] = useState('Press Deal to start');

  useEffect(() => { set(chips); }, [chips, set]);

  const finish = (result) => {
    setPhase('done');
    if (result === 'win') {
      setChips((c) => c + bet * 2);
      setStatus('You win! +' + bet);
      sfx(800, 0.2);
    } else if (result === 'push') {
      setChips((c) => c + bet);
      setStatus('Push — bet returned');
      sfx(420, 0.1);
    } else {
      setStatus('Dealer wins this hand');
      sfx(180, 0.2, 'square');
    }
  };

  const deal = () => {
    if (chips < bet) { setStatus('Not enough chips — lower the bet'); return; }
    const d = bjDeck();
    const p = [d.pop(), d.pop()];
    const dl = [d.pop(), d.pop()];
    setDeck(d);
    setPlayer(p);
    setDealer(dl);
    setChips((c) => c - bet);
    setPhase('player');
    setStatus('Your move — hit or stand');
    sfx(340, 0.06);
    if (bjValue(p) === 21) {
      const dealerTotal = bjValue(dl);
      if (dealerTotal === 21) finish('push');
      else finish('win');
    }
  };

  const hit = () => {
    if (phase !== 'player') return;
    const d = [...deck];
    const card = d.pop();
    const p = [...player, card];
    setDeck(d);
    setPlayer(p);
    sfx(400, 0.05);
    const total = bjValue(p);
    if (total > 21) finish('lose');
    else if (total === 21) stand(p, dealer);
  };

  const stand = (hand, dealerHand) => {
    const p = hand || player;
    const dl = [...(dealerHand || dealer)];
    const d = [...deck];
    while (bjValue(dl) < 17 && d.length) dl.push(d.pop());
    setDealer(dl);
    setDeck(d);
    const pv = bjValue(p);
    const dv = bjValue(dl);
    if (dv > 21 || pv > dv) finish('win');
    else if (pv === dv) finish('push');
    else finish('lose');
  };

  const resetGame = () => {
    setChips(100);
    setBet(10);
    setDeck([]);
    setPlayer([]);
    setDealer([]);
    setPhase('idle');
    setStatus('Press Deal to start');
  };

  const hideDealer = phase === 'player';

  return (
    <GameShell
      score={score}
      best={best}
      onRestart={resetGame}
      status={status}
      hint="Beat the dealer without going over 21. Chips are your score."
      accent={theme}
    >
      <Pad>
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-3">
          <span>Chips: <span className="text-amber-300">{chips}</span></span>
          <span>Bet: {bet}</span>
        </div>
        <div className="mb-3">
          <div className="text-[10px] text-zinc-500 font-mono mb-1">DEALER {hideDealer ? '' : '(' + bjValue(dealer) + ')'}</div>
          <div className="flex gap-1.5 min-h-[64px]">
            {dealer.map((c, i) => (
              <div key={i}>{hideDealer && i === 1 ? <div className="w-11 h-16 rounded-lg bg-[#1e293b] border border-[#334155]" /> : bjCard(c)}</div>
            ))}
          </div>
        </div>
        <div className="mb-3">
          <div className="text-[10px] text-zinc-500 font-mono mb-1">YOU {player.length ? '(' + bjValue(player) + ')' : ''}</div>
          <div className="flex gap-1.5 min-h-[64px]">
            {player.map((c, i) => <div key={i}>{bjCard(c)}</div>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {phase === 'idle' || phase === 'done' ? (
            <>
              <GameButton onClick={deal} tone="primary">Deal</GameButton>
              <GameButton onClick={() => setBet((b) => clamp(b + 10, 10, 100))}>Bet +10</GameButton>
              <GameButton onClick={() => setBet((b) => clamp(b - 10, 10, 100))}>Bet -10</GameButton>
            </>
          ) : (
            <>
              <GameButton onClick={hit} tone="success">Hit</GameButton>
              <GameButton onClick={() => stand()} tone="danger">Stand</GameButton>
            </>
          )}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 21. Slot Machine Reels
// ============================================================
const SLOT_SYMS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];

export function Slots({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, set } = useScore(onScore, 100);
  const [reels, setReels] = useState(['🍒', '🍋', '🔔']);
  const [credits, setCredits] = useState(100);
  const [spinning, setSpinning] = useState(false);
  const [status, setStatus] = useState('Spin to win. 3 of a kind pays 50.');
  const timerRef = useRef(null);

  useEffect(() => { set(credits); }, [credits, set]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const spin = () => {
    if (spinning) return;
    if (credits < 10) { setStatus('Out of credits — restart to play again'); return; }
    setCredits((c) => c - 10);
    setSpinning(true);
    setStatus('Spinning…');
    sfx(300, 0.05);
    timerRef.current = setTimeout(() => {
      const r = [pick(SLOT_SYMS), pick(SLOT_SYMS), pick(SLOT_SYMS)];
      let payout = 0;
      if (r[0] === r[1] && r[1] === r[2]) payout = r[0] === '7️⃣' ? 100 : 50;
      else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) payout = 15;
      setReels(r);
      setSpinning(false);
      if (payout) {
        setCredits((c) => c + payout);
        setStatus('Winner! +' + payout + ' credits');
        sfx(800, 0.2);
      } else {
        setStatus('No match — try again');
        sfx(200, 0.1, 'square');
      }
    }, 650);
  };

  const restart = () => {
    setCredits(100);
    setReels(['🍒', '🍋', '🔔']);
    setSpinning(false);
    setStatus('Spin to win. 3 of a kind pays 50.');
  };

  return (
    <GameShell score={score} best={best} onStart={spin} startLabel={spinning ? 'Spinning…' : 'Spin (-10)'} running={spinning} onRestart={restart} status={status} hint="3 of a kind pays 50, triple 7s pays 100, any pair pays 15." accent={theme}>
      <Pad>
        <div className="flex items-center justify-center gap-3 mb-4">
          {reels.map((sym, i) => (
            <div key={i} className={'w-16 h-20 rounded-xl bg-[#0B141A] border-2 border-[#3A4952] flex items-center justify-center text-3xl ' + (spinning ? 'animate-pulse' : '')}>
              {sym}
            </div>
          ))}
        </div>
        <div className="text-center text-[11px] font-mono text-amber-300">Credits: {credits}</div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 22. Dice Roller 3D — dice poker
// ============================================================
function diceHandPoints(dice) {
  const counts = {};
  dice.forEach((d) => { counts[d] = (counts[d] || 0) + 1; });
  const vals = Object.values(counts).sort((a, b) => b - a);
  const uniq = [...new Set(dice)].sort((a, b) => a - b);
  if (vals[0] === 5) return { name: 'Five of a kind', pts: 50 };
  if (vals[0] === 4) return { name: 'Four of a kind', pts: 30 };
  if (vals[0] === 3 && vals[1] === 2) return { name: 'Full house', pts: 25 };
  if (uniq.length === 5 && uniq[4] - uniq[0] === 4) return { name: 'Straight', pts: 20 };
  if (vals[0] === 3) return { name: 'Three of a kind', pts: 15 };
  if (vals[0] === 2 && vals[1] === 2) return { name: 'Two pair', pts: 10 };
  if (vals[0] === 2) return { name: 'Pair', pts: 5 };
  return { name: 'Nothing', pts: 0 };
}

export function DiceRoller({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const [dice, setDice] = useState(() => Array.from({ length: 5 }, () => randInt(1, 6)));
  const [held, setHeld] = useState([false, false, false, false, false]);
  const [rollsLeft, setRollsLeft] = useState(3);
  const [round, setRound] = useState(1);
  const [status, setStatus] = useState('Roll, keep the dice you like, then score.');

  const roll = () => {
    if (rollsLeft <= 0) return;
    setDice((d) => d.map((v, i) => (held[i] ? v : randInt(1, 6))));
    setRollsLeft((r) => r - 1);
    sfx(420, 0.05);
    setStatus('Roll ' + (3 - rollsLeft + 1) + ' — select dice to keep');
  };

  const scoreHand = () => {
    const hand = diceHandPoints(dice);
    add(hand.pts);
    if (hand.pts) {
      sfx(700, 0.12);
      setStatus(hand.name + ' +' + hand.pts);
    } else {
      sfx(200, 0.1, 'square');
      setStatus('No combination — 0 points');
    }
    if (round >= 5) {
      setRound(6);
      setStatus('Game complete — ' + (score + hand.pts) + ' points');
    } else {
      setRound((r) => r + 1);
      setDice(Array.from({ length: 5 }, () => randInt(1, 6)));
      setHeld([false, false, false, false, false]);
      setRollsLeft(3);
    }
  };

  const restart = () => {
    setDice(Array.from({ length: 5 }, () => randInt(1, 6)));
    setHeld([false, false, false, false, false]);
    setRollsLeft(3);
    setRound(1);
    setStatus('Roll, keep the dice you like, then score.');
    reset(0);
  };

  const over = round > 5;

  return (
    <GameShell score={score} best={best} onRestart={restart} status={status} hint="5 rounds. Each round: up to 3 rolls, then lock in the best hand." accent={theme}>
      <Pad>
        <div className="flex justify-between text-[11px] font-mono text-zinc-400 mb-3">
          <span>Round {Math.min(5, round)}/5</span>
          <span>Rolls left {rollsLeft}</span>
        </div>
        <div className="flex justify-center gap-2 mb-4">
          {dice.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setHeld((h) => h.map((v, k) => (k === i ? !v : v)))}
              className={
                'w-11 h-11 rounded-lg flex items-center justify-center text-lg font-bold border-2 transition ' +
                (held[i] ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' : 'bg-[#2A3942] border-[#3A4952] text-white')
              }
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex justify-center gap-2">
          <GameButton onClick={roll} disabled={rollsLeft <= 0 || over} tone="primary">Roll</GameButton>
          <GameButton onClick={scoreHand} disabled={over} tone="success">Score hand</GameButton>
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 27. Tower Builder
// ============================================================
const TW_W = 300;
const TW_H = 420;
const TW_BLOCK_H = 22;

function twInit() {
  return {
    blocks: [{ x: 90, w: 120 }],
    phase: 0,
    speed: 0.028,
    alive: true,
    over: false,
  };
}
function twDraw(ctx, st, theme) {
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, TW_W, TW_H);
  const top = st.blocks[st.blocks.length - 1];
  const baseY = TW_H - 30;
  st.blocks.forEach((b, i) => {
    const y = baseY - (i + 1) * TW_BLOCK_H;
    if (y < -TW_BLOCK_H) return;
    ctx.fillStyle = i % 2 === 0 ? (theme || '#f59e0b') : '#22d3ee';
    ctx.fillRect(b.x, y, b.w, TW_BLOCK_H - 2);
  });
  if (!st.over) {
    const y = baseY - (st.blocks.length + 1) * TW_BLOCK_H;
    const x = 90 + Math.sin(st.phase) * 80;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x, y, top.w, TW_BLOCK_H - 2);
  }
  ctx.fillStyle = '#64748b';
  ctx.font = '11px monospace';
  ctx.fillText('HEIGHT ' + st.blocks.length, 12, 18);
}

export function TowerStack({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(twInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const drop = () => {
    const st = stateRef.current;
    if (!playing || st.over) return;
    const top = st.blocks[st.blocks.length - 1];
    const x = 90 + Math.sin(st.phase) * 80;
    const start = Math.max(x, top.x);
    const end = Math.min(x + top.w, top.x + top.w);
    const overlap = end - start;
    if (overlap <= 0) {
      st.over = true;
      st.alive = false;
      setPlaying(false);
      setStatus('Missed the tower — height ' + st.blocks.length);
      sfx(150, 0.3, 'square');
      return;
    }
    st.blocks.push({ x: start, w: overlap });
    const perfect = Math.abs(overlap - top.w) < 4;
    add(perfect ? 20 : 10);
    st.speed = Math.min(0.06, st.speed + 0.0015);
    sfx(perfect ? 780 : 560, 0.06);
    setStatus(perfect ? 'Perfect drop! +20' : 'Nice stack +10');
  };

  useKeys((e) => {
    if (e.key === ' ' || e.key === 'Enter') drop();
  }, playing);

  useRafLoop((t) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (playing && !st.over) {
      if (!st.last) st.last = t;
      const dt = Math.min(34, t - st.last);
      st.last = t;
      st.phase += st.speed * (dt / 16.6);
    }
    twDraw(ctx, st, theme || '#f59e0b');
  }, true);

  const start = () => {
    stateRef.current = twInit();
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Click or press Space to drop. Overlap keeps the tower alive." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={TW_W}
          height={TW_H}
          onPointerDown={drop}
          className="w-full max-w-[280px] mx-auto rounded-lg border border-[#2A3942] touch-none"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 30. Rhythm Tap
// ============================================================
const RT_LANES = [50, 120, 190, 260];
const RT_KEYS = ['d', 'f', 'j', 'k'];
const RT_HIT_Y = 340;

function rtDraw(ctx, st, theme) {
  const W = 320;
  const H = 420;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  RT_LANES.forEach((x, i) => {
    ctx.fillStyle = '#16232b';
    ctx.fillRect(x - 26, 0, 52, H);
    ctx.strokeStyle = '#22323b';
    ctx.strokeRect(x - 26, 0, 52, H);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(x - 26, RT_HIT_Y - 4, 52, 4);
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(RT_KEYS[i].toUpperCase(), x, H - 12);
    ctx.textAlign = 'left';
  });
  st.notes.forEach((n) => {
    ctx.fillStyle = ['#f43f5e', '#facc15', '#22c55e', '#22d3ee'][n.lane];
    ctx.beginPath();
    ctx.arc(RT_LANES[n.lane], n.y, 13, 0, TAU);
    ctx.fill();
  });
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px monospace';
  ctx.fillText('HITS ' + st.hits + ' · MISSES ' + st.misses, 12, 20);
}

export function RhythmTap({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef({ notes: [], spawn: 0, hits: 0, misses: 0, alive: true });
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const cd = useCountdown(30, () => setPlaying(false));

  const tap = useCallback((lane) => {
    const st = stateRef.current;
    if (!st.alive) return;
    let bestIdx = -1;
    let bestD = 999;
    st.notes.forEach((n, i) => {
      if (n.lane !== lane) return;
      const d = Math.abs(n.y - RT_HIT_Y);
      if (d < bestD) { bestD = d; bestIdx = i; }
    });
    if (bestIdx >= 0 && bestD < 34) {
      st.notes.splice(bestIdx, 1);
      st.hits += 1;
      add(10);
      sfx(520 + lane * 90, 0.05);
      setStatus('Perfect! +10');
    } else {
      st.misses += 1;
      sfx(180, 0.04, 'square');
    }
  }, [add, sfx]);

  useKeys((e) => {
    const lane = RT_KEYS.indexOf(e.key.toLowerCase());
    if (lane >= 0) tap(lane);
  }, playing);

  useRafLoop((t) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (playing && st.alive) {
      if (!st.last) st.last = t;
      const dt = Math.min(34, t - st.last);
      st.last = t;
      const k = dt / 16.6;
      st.spawn -= k;
      if (st.spawn <= 0) {
        st.spawn = 34;
        st.notes.push({ lane: randInt(0, 3), y: -20 });
      }
      st.notes.forEach((n) => { n.y += 4.4 * k; });
      const before = st.notes.length;
      st.notes = st.notes.filter((n) => n.y < 400);
      if (st.notes.length < before) st.misses += before - st.notes.length;
    }
    rtDraw(ctx, st, theme || '#8b5cf6');
  }, true);

  const start = () => {
    stateRef.current = { notes: [], spawn: 0, hits: 0, misses: 0, alive: true };
    reset(0);
    setStatus('Hit the notes as they cross the line');
    setPlaying(true);
    cd.start();
  };

  useEffect(() => {
    if (!playing) return;
    if (cd.left === 0) setStatus('Time! ' + stateRef.current.hits + ' perfect hits');
  }, [cd.left, playing]);

  return (
    <GameShell score={score} best={best} time={cd.left} onStart={start} running={playing} status={status} hint="Press D F J K when the notes cross the neon line." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={320}
          height={420}
          className="w-full max-w-[300px] mx-auto rounded-lg border border-[#2A3942] touch-none"
          onPointerDown={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const r = canvas.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * 320;
            let lane = 0;
            RT_LANES.forEach((lx, i) => { if (Math.abs(lx - x) < 35) lane = i; });
            tap(lane);
          }}
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 32. Zombie Survival Clicker
// ============================================================
export function ZombieClicker({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const [zombies, setZombies] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [kills, setKills] = useState(0);
  const cd = useCountdown(30, () => setPlaying(false));
  const idRef = useRef(0);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      idRef.current += 1;
      const z = {
        id: idRef.current,
        x: randInt(4, 86),
        y: randInt(6, 78),
        emoji: pick(['🧟', '🧟‍♂️', '🧟‍♀️']),
      };
      setZombies((list) => [...list, z]);
      setTimeout(() => {
        setZombies((list) => list.filter((item) => item.id !== z.id));
      }, 1500);
    }, 620);
    return () => clearInterval(id);
  }, [playing]);

  const start = () => {
    reset(0);
    setKills(0);
    setZombies([]);
    setPlaying(true);
    cd.start();
  };

  const hit = (z) => {
    if (!playing) return;
    setZombies((list) => list.filter((item) => item.id !== z.id));
    setKills((k) => k + 1);
    add(10);
    sfx(320, 0.05, 'square');
  };

  return (
    <GameShell
      score={score}
      best={best}
      time={cd.left}
      onStart={start}
      running={playing}
      onRestart={start}
      status={playing ? kills + ' zombies down' : cd.left === 0 ? 'Survived with ' + kills + ' kills' : ''}
      hint="Tap the zombies before they vanish. 30 seconds."
      accent={theme}
    >
      <Pad>
        <div className="relative w-full h-72 rounded-xl bg-[#0B141A] border border-[#2A3942] overflow-hidden">
          {zombies.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => hit(z)}
              className="absolute text-2xl transition hover:scale-110 active:scale-90"
              style={{ left: z.x + '%', top: z.y + '%' }}
            >
              {z.emoji}
            </button>
          ))}
          {!playing && cd.left !== 30 ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">
              {cd.left === 0 ? 'Round over' : 'Press Start'}
            </div>
          ) : null}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 33. Cookie Tap Master
// ============================================================
export function CookieClicker({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, set, reset } = useScore(onScore, 0);
  const [power, setPower] = useState(1);
  const [cost, setCost] = useState(15);
  const [clicks, setClicks] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('Tap the cookie. Buy upgrades to tap harder.');
  const cd = useCountdown(60, () => setPlaying(false));

  const start = () => {
    reset(0);
    setPower(1);
    setCost(15);
    setClicks(0);
    setStatus('Tap the cookie. Buy upgrades to tap harder.');
    setPlaying(true);
    cd.start();
  };

  const bake = () => {
    if (!playing) return;
    add(power);
    setClicks((c) => c + 1);
    sfx(520, 0.03);
  };

  const upgrade = () => {
    if (!playing || score < cost) return;
    set(score - cost);
    setPower((p) => p + 1);
    setCost((c) => c * 2);
    sfx(720, 0.1);
    setStatus('Upgraded! Each tap now gives ' + (power + 1));
  };

  return (
    <GameShell
      score={score}
      best={best}
      time={cd.left}
      onStart={start}
      running={playing}
      onRestart={start}
      status={status}
      hint="60 seconds. Spend cookies on upgrades to multiply your taps."
      accent={theme}
    >
      <Pad>
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={bake}
            className="w-32 h-32 rounded-full bg-amber-500/20 border-4 border-amber-500 text-6xl flex items-center justify-center hover:scale-105 active:scale-95 transition"
          >
            🍪
          </button>
          <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
            <span>+{power}/tap</span>
            <span>{clicks} taps</span>
          </div>
          <GameButton onClick={upgrade} disabled={score < cost || !playing} tone="primary">
            Upgrade (+1/tap) · {cost} 🍪
          </GameButton>
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 45. Calculator Clicker
// ============================================================
function calcProblem() {
  const ops = ['+', '-', '×'];
  const op = pick(ops);
  const a = randInt(3, 15);
  const b = randInt(2, 12);
  let answer = 0;
  if (op === '+') answer = a + b;
  if (op === '-') answer = a - b;
  if (op === '×') answer = a * b;
  const options = new Set([answer]);
  while (options.size < 4) {
    const delta = randInt(-8, 8);
    if (delta !== 0) options.add(answer + delta);
  }
  return { a, b, op, answer, options: shuffle([...options]) };
}

export function CalculatorClicker({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const [problem, setProblem] = useState(calcProblem);
  const [solved, setSolved] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const cd = useCountdown(30, () => setPlaying(false));

  const start = () => {
    reset(0);
    setProblem(calcProblem());
    setSolved(0);
    setStatus('');
    setPlaying(true);
    cd.start();
  };

  const answer = (v) => {
    if (!playing) return;
    if (v === problem.answer) {
      add(10);
      setSolved((s) => s + 1);
      sfx(720, 0.06);
      setStatus('Correct! +10');
    } else {
      add(-5);
      sfx(200, 0.1, 'square');
      setStatus('Wrong — the answer was ' + problem.answer);
    }
    setProblem(calcProblem());
  };

  return (
    <GameShell
      score={score}
      best={best}
      time={cd.left}
      onStart={start}
      running={playing}
      onRestart={start}
      status={status}
      hint="Solve as many as you can in 30 seconds. Correct +10, wrong -5."
      accent={theme}
    >
      <Pad>
        <div className="text-center text-3xl font-mono text-white mb-1">{problem.a} {problem.op} {problem.b}</div>
        <div className="text-center text-[10px] text-zinc-500 font-mono mb-4">{solved} solved</div>
        <div className="grid grid-cols-2 gap-2">
          {problem.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => answer(opt)}
              disabled={!playing}
              className="py-3 rounded-xl bg-[#2A3942] hover:bg-[#3A4952] disabled:opacity-40 text-sm font-bold text-white"
            >
              {opt}
            </button>
          ))}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 47. Pet Tamagotchi
// ============================================================
export function Tamagotchi({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const [meters, setMeters] = useState({ hunger: 100, happy: 100, energy: 100 });
  const [playing, setPlaying] = useState(false);
  const [age, setAge] = useState(0);
  const [status, setStatus] = useState('Keep your pet fed, happy and rested.');
  const [dead, setDead] = useState(false);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      add(1);
      setAge((a) => a + 1);
      setMeters((m) => {
        const next = {
          hunger: clamp(m.hunger - 1.6, 0, 100),
          happy: clamp(m.happy - 1.2, 0, 100),
          energy: clamp(m.energy - 1, 0, 100),
        };
        if (next.hunger <= 0 || next.happy <= 0 || next.energy <= 0) {
          setPlaying(false);
          setDead(true);
          setStatus('Your pet ran out of care — game over');
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playing, add]);

  const feed = () => {
    setMeters((m) => ({ ...m, hunger: clamp(m.hunger + 26, 0, 100), happy: clamp(m.happy + 4, 0, 100) }));
    sfx(480, 0.08);
    setStatus('Nom nom — hunger restored');
  };
  const play = () => {
    setMeters((m) => ({ ...m, happy: clamp(m.happy + 24, 0, 100), energy: clamp(m.energy - 12, 0, 100), hunger: clamp(m.hunger - 6, 0, 100) }));
    sfx(640, 0.08);
    setStatus('Playtime! Happiness up');
  };
  const sleep = () => {
    setMeters((m) => ({ ...m, energy: clamp(m.energy + 30, 0, 100), hunger: clamp(m.hunger - 4, 0, 100) }));
    sfx(320, 0.12);
    setStatus('Zzz… energy restored');
  };

  const restart = () => {
    setMeters({ hunger: 100, happy: 100, energy: 100 });
    setAge(0);
    setDead(false);
    setStatus('Keep your pet fed, happy and rested.');
    reset(0);
    setPlaying(true);
  };

  const bar = (label, value, color) => (
    <div key={label}>
      <div className="flex justify-between text-[10px] font-mono text-zinc-400 mb-1">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#22323b] overflow-hidden">
        <div className={'h-full ' + color} style={{ width: value + '%' }} />
      </div>
    </div>
  );

  return (
    <GameShell score={score} best={best} onStart={restart} running={playing} onRestart={restart} status={status} hint="Meters drain over time. Feed, play and let it sleep. Score is survival time." accent={theme}>
      <Pad>
        <div className="text-center text-5xl mb-3">{dead ? '💀' : meters.happy > 60 ? '🐣' : '🐥'}</div>
        <div className="space-y-2 mb-4">
          {bar('Hunger', meters.hunger, 'bg-amber-400')}
          {bar('Happiness', meters.happy, 'bg-emerald-400')}
          {bar('Energy', meters.energy, 'bg-cyan-400')}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <GameButton onClick={feed} disabled={!playing}>🍎 Feed</GameButton>
          <GameButton onClick={play} disabled={!playing}>🎾 Play</GameButton>
          <GameButton onClick={sleep} disabled={!playing}>😴 Sleep</GameButton>
        </div>
        <div className="text-center text-[10px] text-zinc-500 mt-3 font-mono">Age {age}s</div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 48. Virtual Drumkit
// ============================================================
const DRUM_PADS = [
  { name: 'Kick', freq: 110, type: 'sine', color: 'bg-rose-500' },
  { name: 'Snare', freq: 220, type: 'square', color: 'bg-amber-400' },
  { name: 'Hat', freq: 640, type: 'triangle', color: 'bg-cyan-400' },
  { name: 'Clap', freq: 420, type: 'sawtooth', color: 'bg-violet-500' },
];

export function Drumkit({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const [phase, setPhase] = useState('idle');
  const [seq, setSeq] = useState([]);
  const [step, setStep] = useState(0);
  const [lit, setLit] = useState(-1);
  const [status, setStatus] = useState('Press Start and copy the beat.');
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  const playSeq = (list) => {
    clearTimers();
    setPhase('watch');
    setStatus('Listen…');
    list.forEach((v, i) => {
      timers.current.push(setTimeout(() => {
        setLit(v);
        sfx(DRUM_PADS[v].freq, 0.12, DRUM_PADS[v].type);
      }, i * 520));
      timers.current.push(setTimeout(() => setLit(-1), i * 520 + 300));
    });
    timers.current.push(setTimeout(() => {
      setPhase('input');
      setStep(0);
      setStatus('Your turn — copy the beat');
    }, list.length * 520 + 260));
  };

  const start = () => {
    reset(0);
    const first = [randInt(0, 3), randInt(0, 3)];
    setSeq(first);
    playSeq(first);
  };

  const press = (i) => {
    sfx(DRUM_PADS[i].freq, 0.12, DRUM_PADS[i].type);
    setLit(i);
    setTimeout(() => setLit(-1), 140);
    if (phase !== 'input') return;
    if (seq[step] !== i) {
      setPhase('idle');
      setStatus('Wrong beat — you reached ' + seq.length + ' steps');
      sfx(150, 0.3, 'sawtooth');
      return;
    }
    if (step + 1 === seq.length) {
      add(seq.length * 10);
      const next = [...seq, randInt(0, 3)];
      setSeq(next);
      setPhase('watch');
      setStatus('Nice! Level ' + seq.length + ' cleared');
      timers.current.push(setTimeout(() => playSeq(next), 750));
    } else {
      setStep((s) => s + 1);
    }
  };

  useKeys((e) => {
    const map = { a: 0, s: 1, d: 2, f: 3 };
    const i = map[e.key.toLowerCase()];
    if (i !== undefined) press(i);
  }, true);

  return (
    <GameShell score={score} best={best} onStart={start} startLabel="Start" running={phase !== 'idle'} status={status} hint="Watch the beat, then repeat it with A S D F or the pads." accent={theme}>
      <Pad>
        <div className="grid grid-cols-2 gap-2">
          {DRUM_PADS.map((pad, i) => (
            <button
              key={pad.name}
              type="button"
              onClick={() => press(i)}
              className={
                'py-5 rounded-xl text-sm font-bold text-white transition ' +
                pad.color +
                ' ' +
                (lit === i ? 'scale-95 brightness-150' : 'opacity-80 hover:opacity-100')
              }
            >
              {pad.name}
            </button>
          ))}
        </div>
        <div className="text-center text-[10px] text-zinc-500 mt-3 font-mono">Sequence: {seq.length}</div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 49. Typing Speed Test
// ============================================================
const TYPE_TEXTS = [
  'the quick brown fox jumps over the lazy dog',
  'pack my box with five dozen liquor jugs',
  'how vexingly quick daft zebras jump',
  'sphinx of black quartz judge my vow',
  'the five boxing wizards jump quickly',
  'bright vixens jump dozy fowl quack',
];

export function TypingTest({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, set } = useScore(onScore, 0);
  const [target, setTarget] = useState(TYPE_TEXTS[0]);
  const [input, setInput] = useState('');
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('Press Start and type the sentence.');
  const cd = useCountdown(30, () => setPlaying(false));
  const doneRef = useRef(false);

  const start = () => {
    setTarget(pick(TYPE_TEXTS));
    setInput('');
    setPlaying(true);
    setStatus('');
    doneRef.current = false;
    cd.start();
  };

  useEffect(() => {
    if (!playing || cd.left > 0 || doneRef.current) return;
    doneRef.current = true;
    const typed = input.length;
    const correct = input.split('').filter((ch, i) => ch === target[i]).length;
    const accuracy = typed ? correct / typed : 0;
    const wpm = Math.round((typed / 5) * 2);
    const final = Math.round(wpm * accuracy);
    set(final);
    setStatus('Done — ' + wpm + ' WPM at ' + Math.round(accuracy * 100) + '% accuracy');
    sfx(760, 0.2);
  }, [cd.left, playing, input, target, set, sfx]);

  const typed = input.split('').filter((ch, i) => ch === target[i]).length;
  const accuracy = input.length ? Math.round((typed / input.length) * 100) : 100;

  return (
    <GameShell
      score={score}
      best={best}
      time={cd.left}
      onStart={start}
      running={playing}
      onRestart={start}
      status={status}
      hint="Type the sentence exactly. Score is WPM × accuracy."
      accent={theme}
    >
      <Pad>
        <div className="font-mono text-sm leading-relaxed mb-3 text-white">
          {target.split('').map((ch, i) => {
            let cls = 'text-zinc-500';
            if (i < input.length) cls = input[i] === ch ? 'text-emerald-400' : 'bg-rose-500/40 text-white';
            else if (i === input.length) cls = 'text-cyan-300 underline';
            return <span key={i} className={cls}>{ch}</span>;
          })}
        </div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, target.length))}
          disabled={!playing}
          placeholder="Type here…"
          className="w-full bg-[#2A3942] border border-[#3A4952] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500 disabled:opacity-50"
        />
        <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-2">
          <span>{input.length}/{target.length} chars</span>
          <span>{accuracy}% accuracy</span>
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 50. Zen Meditation Idle
// ============================================================
const ZEN_PHASES = [
  { name: 'Breathe in', dur: 4 },
  { name: 'Hold', dur: 4 },
  { name: 'Breathe out', dur: 4 },
  { name: 'Rest', dur: 2 },
];

export function ZenBreathing({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const [state, setState] = useState({ phase: 0, t: 0, cycles: 0 });
  const [playing, setPlaying] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [status, setStatus] = useState('Press Start, then tap during Hold.');

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setState((s) => {
        const dur = ZEN_PHASES[s.phase].dur;
        if (s.t + 0.1 >= dur) {
          const np = (s.phase + 1) % 4;
          return { phase: np, t: 0, cycles: s.cycles + (np === 0 ? 1 : 0) };
        }
        return { ...s, t: s.t + 0.1 };
      });
    }, 100);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => {
    if (state.phase === 0) setTapped(false);
  }, [state.phase]);

  const start = () => {
    reset(0);
    setState({ phase: 0, t: 0, cycles: 0 });
    setTapped(false);
    setPlaying(true);
    setStatus('Breathe with the circle…');
  };

  const tap = () => {
    if (!playing) return;
    if (state.phase !== 1) {
      setStatus('Tap only during Hold');
      sfx(200, 0.06, 'square');
      return;
    }
    if (tapped) return;
    setTapped(true);
    add(10);
    sfx(600, 0.1);
    setStatus('Mindful moment +10');
  };

  const scale =
    state.phase === 0
      ? 0.55 + 0.45 * (state.t / ZEN_PHASES[0].dur)
      : state.phase === 1
        ? 1
        : state.phase === 2
          ? 1 - 0.45 * (state.t / ZEN_PHASES[2].dur)
          : 0.55;

  return (
    <GameShell
      score={score}
      best={best}
      onStart={start}
      running={playing}
      onRestart={start}
      status={status}
      hint="Tap the circle while the phase reads Hold. One tap per breath cycle."
      accent={theme}
    >
      <Pad>
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={tap}
            className="rounded-full bg-emerald-500/15 border-2 border-emerald-400 flex items-center justify-center transition-transform duration-100"
            style={{ width: 150, height: 150, transform: 'scale(' + scale + ')' }}
          >
            <span className="text-emerald-200 text-xs font-bold">{ZEN_PHASES[state.phase].name}</span>
          </button>
          <div className="text-[11px] font-mono text-zinc-400">
            Cycles {state.cycles} · {ZEN_PHASES[state.phase].name}
          </div>
          <div className="text-[10px] text-zinc-500 text-center">
            {tapped ? 'Cycle complete — relax until the next Hold' : 'Follow the rhythm of the circle'}
          </div>
        </div>
      </Pad>
    </GameShell>
  );
}

