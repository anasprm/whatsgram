'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameShell, GameButton, Pad, clamp, pick, randInt, shuffle, useKeys, useRafLoop, useScore, useSfx } from './shared';

const TAU = Math.PI * 2;

function canvasPoint(e, canvas) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * canvas.width,
    y: ((e.clientY - r.top) / r.height) * canvas.height,
  };
}

function useHeldKeys() {
  const ref = useRef({});
  useEffect(() => {
    const block = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    };
    const down = (e) => { block(e); ref.current[e.key] = true; };
    const up = (e) => { ref.current[e.key] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  return ref;
}

// ============================================================
// 3. Retro Snake Arcade
// ============================================================
const SN_COLS = 20;
const SN_ROWS = 20;
const SN_CELL = 16;

function snInit() {
  return {
    snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
    dir: { x: 1, y: 0 },
    next: { x: 1, y: 0 },
    food: { x: 15, y: 10 },
    tick: 130,
    last: 0,
    alive: true,
  };
}
function snPlaceFood(st) {
  let f = { x: 15, y: 10 };
  for (let i = 0; i < 400; i += 1) {
    const c = { x: randInt(0, SN_COLS - 1), y: randInt(0, SN_ROWS - 1) };
    if (!st.snake.some((s) => s.x === c.x && s.y === c.y)) { f = c; break; }
  }
  return f;
}
function snDraw(ctx, st, theme) {
  const W = SN_COLS * SN_CELL;
  const H = SN_ROWS * SN_CELL;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#16232b';
  ctx.lineWidth = 1;
  for (let i = 1; i < SN_COLS; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * SN_CELL, 0); ctx.lineTo(i * SN_CELL, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * SN_CELL); ctx.lineTo(W, i * SN_CELL); ctx.stroke();
  }
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(st.food.x * SN_CELL + SN_CELL / 2, st.food.y * SN_CELL + SN_CELL / 2, SN_CELL / 2 - 2, 0, TAU);
  ctx.fill();
  st.snake.forEach((seg, i) => {
    ctx.globalAlpha = i === 0 ? 1 : Math.max(0.4, 1 - i * 0.025);
    ctx.fillStyle = i === 0 ? theme : '#22c55e';
    ctx.fillRect(seg.x * SN_CELL + 1, seg.y * SN_CELL + 1, SN_CELL - 2, SN_CELL - 2);
  });
  ctx.globalAlpha = 1;
}

export function Snake({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(snInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  useKeys((e) => {
    const st = stateRef.current;
    if (!st.alive) return;
    const map = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    };
    const d = map[e.key];
    if (!d) return;
    if (d.x === -st.dir.x && d.y === -st.dir.y) return;
    st.next = d;
  }, playing);

  useRafLoop((t) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (playing && st.alive) {
      if (!st.last) st.last = t;
      if (t - st.last >= st.tick) {
        st.last = t;
        st.dir = st.next;
        const head = { x: st.snake[0].x + st.dir.x, y: st.snake[0].y + st.dir.y };
        const wall = head.x < 0 || head.x >= SN_COLS || head.y < 0 || head.y >= SN_ROWS;
        const self = st.snake.some((s) => s.x === head.x && s.y === head.y);
        if (wall || self) {
          st.alive = false;
          setPlaying(false);
          setStatus('Game over — final score ' + score);
          sfx(140, 0.4, 'sawtooth');
        } else {
          st.snake.unshift(head);
          if (head.x === st.food.x && head.y === st.food.y) {
            const v = add(10);
            st.food = snPlaceFood(st);
            st.tick = Math.max(65, st.tick - 2);
            sfx(720, 0.08);
            setStatus('Length ' + st.snake.length + ' · ' + v + ' pts');
          } else {
            st.snake.pop();
          }
        }
      }
    }
    snDraw(ctx, st, theme || '#22c55e');
  }, true);

  const start = () => {
    stateRef.current = snInit();
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Arrow keys to steer. Eat red pellets, avoid walls and yourself." accent={theme}>
      <Pad>
        <canvas ref={canvasRef} width={320} height={320} className="w-full max-w-[320px] mx-auto rounded-lg border border-[#2A3942] touch-none" />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 4. Pong Champions
// ============================================================
function pgInit() {
  return {
    ball: { x: 180, y: 120, vx: 3.2, vy: 2.2, r: 6 },
    p1: { y: 90 },
    p2: { y: 90 },
    ph: 60,
    pw: 8,
    a: 0,
    b: 0,
    over: false,
  };
}
function pgDraw(ctx, st) {
  const W = 360;
  const H = 240;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = '#1F2C34';
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(12, st.p1.y, st.pw, st.ph);
  ctx.fillStyle = '#f43f5e';
  ctx.fillRect(W - 20, st.p2.y, st.pw, st.ph);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(st.ball.x, st.ball.y, st.ball.r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(st.a + ' : ' + st.b, W / 2, 28);
  ctx.textAlign = 'left';
}

export function Pong({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(pgInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('First to 5 wins');

  const movePaddle = (e) => {
    const canvas = canvasRef.current;
    const st = stateRef.current;
    if (!canvas) return;
    const p = canvasPoint(e, canvas);
    st.p1.y = clamp(p.y - st.ph / 2, 0, 240 - st.ph);
  };

  useKeys((e) => {
    const st = stateRef.current;
    if (e.key === 'ArrowUp') st.p1.y = clamp(st.p1.y - 24, 0, 240 - st.ph);
    if (e.key === 'ArrowDown') st.p1.y = clamp(st.p1.y + 24, 0, 240 - st.ph);
  }, playing);

  useRafLoop((t) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (playing && !st.over) {
      if (!st.last) st.last = t;
      const dt = Math.min(32, t - st.last);
      st.last = t;
      const k = dt / 16.6;
      const b = st.ball;
      b.x += b.vx * k;
      b.y += b.vy * k;
      if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); }
      if (b.y + b.r > 240) { b.y = 240 - b.r; b.vy = -Math.abs(b.vy); }
      // AI follows with a little lag
      const target = b.y - st.ph / 2;
      st.p2.y = clamp(st.p2.y + (target - st.p2.y) * 0.09 * k, 0, 240 - st.ph);
      // player paddle
      if (b.vx < 0 && b.x - b.r < 20 && b.x > 8 && b.y > st.p1.y - 4 && b.y < st.p1.y + st.ph + 4) {
        b.x = 20 + b.r;
        b.vx = Math.abs(b.vx) * 1.05;
        b.vy += ((b.y - (st.p1.y + st.ph / 2)) / st.ph) * 5;
        sfx(520, 0.05);
      }
      // AI paddle
      if (b.vx > 0 && b.x + b.r > 340 && b.x < 352 && b.y > st.p2.y - 4 && b.y < st.p2.y + st.ph + 4) {
        b.x = 340 - b.r;
        b.vx = -Math.abs(b.vx) * 1.05;
        b.vy += ((b.y - (st.p2.y + st.ph / 2)) / st.ph) * 5;
        sfx(420, 0.05);
      }
      b.vy = clamp(b.vy, -7, 7);
      if (b.x < -10) {
        st.b += 1;
        sfx(180, 0.2, 'square');
        st.ball = { x: 180, y: 120, vx: 3.2, vy: 2.2, r: 6 };
        st.last = 0;
      }
      if (b.x > 370) {
        st.a += 1;
        add(20);
        sfx(720, 0.15);
        setStatus('You ' + st.a + ' — AI ' + st.b);
        st.ball = { x: 180, y: 120, vx: -3.2, vy: -2.2, r: 6 };
        st.last = 0;
      }
      if (st.a >= 5 || st.b >= 5) {
        st.over = true;
        setPlaying(false);
        setStatus(st.a >= 5 ? 'You win the match! 🏆' : 'AI wins the match');
        sfx(st.a >= 5 ? 820 : 180, 0.3, st.a >= 5 ? 'sine' : 'square');
      }
    }
    pgDraw(ctx, st);
  }, true);

  const start = () => {
    stateRef.current = pgInit();
    reset(0);
    setStatus('First to 5 wins');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Move with the mouse or ↑ ↓. Beat the AI to 5 points." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={360}
          height={240}
          onPointerMove={movePaddle}
          className="w-full max-w-[360px] mx-auto rounded-lg border border-[#2A3942] touch-none cursor-none"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 5. Cyber Tetris
// ============================================================
const TET_SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
};
const TET_COLORS = {
  I: '#22d3ee', O: '#facc15', T: '#a855f7', S: '#22c55e', Z: '#ef4444', J: '#3b82f6', L: '#f97316',
};
const TET_COLS = 10;
const TET_ROWS = 20;
const TET_CELL = 20;

function tetInit() {
  return {
    board: Array.from({ length: TET_ROWS }, () => Array(TET_COLS).fill(null)),
    piece: null,
    drop: 0,
    interval: 700,
    alive: true,
    lines: 0,
  };
}
function tetNewPiece() {
  const keys = Object.keys(TET_SHAPES);
  const key = pick(keys);
  const shape = TET_SHAPES[key].map((r) => [...r]);
  return { key, shape, x: Math.floor((TET_COLS - shape[0].length) / 2), y: 0 };
}
function tetCollide(board, piece) {
  for (let r = 0; r < piece.shape.length; r += 1) {
    for (let c = 0; c < piece.shape[r].length; c += 1) {
      if (!piece.shape[r][c]) continue;
      const rr = piece.y + r;
      const cc = piece.x + c;
      if (cc < 0 || cc >= TET_COLS || rr >= TET_ROWS) return true;
      if (rr >= 0 && board[rr][cc]) return true;
    }
  }
  return false;
}
function tetRotate(shape) {
  return shape[0].map((_, c) => shape.map((row) => row[c]).reverse());
}
function tetSpawn(st) {
  st.piece = tetNewPiece();
  if (tetCollide(st.board, st.piece)) {
    st.alive = false;
    return false;
  }
  return true;
}
function tetLock(st) {
  const p = st.piece;
  p.shape.forEach((row, r) => row.forEach((v, c) => {
    if (v) {
      const rr = p.y + r;
      const cc = p.x + c;
      if (rr >= 0) st.board[rr][cc] = p.key;
    }
  }));
  let cleared = 0;
  st.board = st.board.filter((row) => {
    if (row.every(Boolean)) { cleared += 1; return false; }
    return true;
  });
  while (st.board.length < TET_ROWS) st.board.unshift(Array(TET_COLS).fill(null));
  st.lines += cleared;
  st.interval = Math.max(160, 700 - st.lines * 22);
  return cleared;
}
function tetDraw(ctx, st, theme) {
  const W = TET_COLS * TET_CELL;
  const H = TET_ROWS * TET_CELL;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#16232b';
  for (let i = 1; i < TET_COLS; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * TET_CELL, 0); ctx.lineTo(i * TET_CELL, H); ctx.stroke();
  }
  for (let i = 1; i < TET_ROWS; i += 1) {
    ctx.beginPath(); ctx.moveTo(0, i * TET_CELL); ctx.lineTo(W, i * TET_CELL); ctx.stroke();
  }
  st.board.forEach((row, r) => row.forEach((v, c) => {
    if (!v) return;
    ctx.fillStyle = TET_COLORS[v] || theme;
    ctx.fillRect(c * TET_CELL + 1, r * TET_CELL + 1, TET_CELL - 2, TET_CELL - 2);
  }));
  if (st.piece) {
    st.piece.shape.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      ctx.fillStyle = TET_COLORS[st.piece.key] || theme;
      ctx.fillRect((st.piece.x + c) * TET_CELL + 1, (st.piece.y + r) * TET_CELL + 1, TET_CELL - 2, TET_CELL - 2);
    }));
  }
}

export function Tetris({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(tetInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const shift = (dx) => {
    const st = stateRef.current;
    if (!st.piece || !st.alive) return;
    const test = { ...st.piece, x: st.piece.x + dx };
    if (!tetCollide(st.board, test)) { st.piece = test; sfx(300, 0.03); }
  };
  const rotate = () => {
    const st = stateRef.current;
    if (!st.piece || !st.alive) return;
    const rotated = { ...st.piece, shape: tetRotate(st.piece.shape) };
    for (const off of [0, -1, 1, -2, 2]) {
      const test = { ...rotated, x: rotated.x + off };
      if (!tetCollide(st.board, test)) { st.piece = test; sfx(460, 0.04); return; }
    }
  };
  const softDrop = () => {
    const st = stateRef.current;
    if (!st.piece || !st.alive) return;
    const test = { ...st.piece, y: st.piece.y + 1 };
    if (!tetCollide(st.board, test)) { st.piece = test; st.drop = 0; }
  };
  const hardDrop = () => {
    const st = stateRef.current;
    if (!st.piece || !st.alive) return;
    while (!tetCollide(st.board, { ...st.piece, y: st.piece.y + 1 })) st.piece.y += 1;
    settle(st);
  };
  const settle = (st) => {
    const cleared = tetLock(st);
    if (cleared) {
      add(cleared * 100);
      sfx(720, 0.12);
      setStatus(cleared + ' line' + (cleared > 1 ? 's' : '') + ' cleared!');
    }
    if (!tetSpawn(st)) {
      setPlaying(false);
      setStatus('Game over — stack reached the top');
      sfx(140, 0.4, 'sawtooth');
    }
  };

  useKeys((e) => {
    if (e.key === 'ArrowLeft') shift(-1);
    if (e.key === 'ArrowRight') shift(1);
    if (e.key === 'ArrowUp') rotate();
    if (e.key === 'ArrowDown') softDrop();
    if (e.key === ' ') hardDrop();
  }, playing);

  useRafLoop((t) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (playing && st.alive && st.piece) {
      if (!st.last) st.last = t;
      const dt = t - st.last;
      st.last = t;
      st.drop += dt;
      if (st.drop >= st.interval) {
        st.drop = 0;
        const test = { ...st.piece, y: st.piece.y + 1 };
        if (!tetCollide(st.board, test)) st.piece = test;
        else settle(st);
      }
    }
    tetDraw(ctx, st, theme || '#a855f7');
  }, true);

  const start = () => {
    const st = tetInit();
    tetSpawn(st);
    stateRef.current = st;
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="← → move · ↑ rotate · ↓ soft drop · Space hard drop. Clear lines." accent={theme}>
      <Pad>
        <canvas ref={canvasRef} width={200} height={400} className="w-full max-w-[200px] mx-auto rounded-lg border border-[#2A3942] touch-none" />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 8. Space Invaders Offline
// ============================================================
function siInit() {
  return {
    px: 166,
    bullets: [],
    ebullets: [],
    invaders: Array.from({ length: 32 }, (_, i) => ({ alive: true, r: Math.floor(i / 8), c: i % 8 })),
    fx: 0,
    fy: 0,
    dir: 1,
    drop: 0,
    cool: 0,
    lives: 3,
    alive: true,
    wave: 1,
    lastShot: 0,
  };
}
function siDraw(ctx, st, theme) {
  const W = 360;
  const H = 320;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#64748b';
  ctx.font = '10px monospace';
  ctx.fillText('LIVES ' + '♥'.repeat(st.lives), 10, 16);
  ctx.fillStyle = theme || '#10b981';
  ctx.fillRect(st.px, 286, 28, 12);
  ctx.fillStyle = '#facc15';
  st.bullets.forEach((b) => ctx.fillRect(b.x - 1.5, b.y, 3, 10));
  ctx.fillStyle = '#f43f5e';
  st.ebullets.forEach((b) => ctx.fillRect(b.x - 1.5, b.y, 3, 10));
  st.invaders.forEach((inv) => {
    if (!inv.alive) return;
    const x = 26 + st.fx + inv.c * 36;
    const y = 34 + st.fy + inv.r * 26;
    ctx.fillStyle = inv.r % 2 === 0 ? '#22d3ee' : '#a855f7';
    ctx.fillRect(x, y, 24, 16);
    ctx.fillStyle = '#0B141A';
    ctx.fillRect(x + 5, y + 5, 4, 4);
    ctx.fillRect(x + 15, y + 5, 4, 4);
  });
}

export function SpaceInvaders({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(siInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  useKeys((e) => {
    const st = stateRef.current;
    if (!st.alive) return;
    if (e.key === 'ArrowLeft') st.px = clamp(st.px - 18, 0, 332);
    if (e.key === 'ArrowRight') st.px = clamp(st.px + 18, 0, 332);
    if (e.key === ' ' && Date.now() - st.lastShot > 220) {
      st.bullets.push({ x: st.px + 14, y: 280 });
      st.lastShot = Date.now();
      sfx(680, 0.04);
    }
  }, playing);

  useRafLoop((t) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (playing && st.alive) {
      if (!st.last) st.last = t;
      const dt = Math.min(40, t - st.last);
      st.last = t;
      const k = dt / 16.6;
      st.bullets.forEach((b) => { b.y -= 8 * k; });
      st.bullets = st.bullets.filter((b) => b.y > -12);
      st.ebullets.forEach((b) => { b.y += 4.2 * k; });
      st.ebullets = st.ebullets.filter((b) => b.y < 330);
      const alive = st.invaders.filter((i) => i.alive);
      if (!alive.length) {
        add(50);
        st.invaders = Array.from({ length: 32 }, (_, i) => ({ alive: true, r: Math.floor(i / 8), c: i % 8 }));
        st.fx = 0; st.fy = 0; st.dir = 1; st.wave += 1;
        setStatus('Wave ' + st.wave + ' incoming');
        sfx(820, 0.2);
      }
      const speed = (0.5 + (32 - alive.length) * 0.05 + st.wave * 0.1) * k;
      st.fx += st.dir * speed;
      if (st.fx > 46 || st.fx < -46) {
        st.dir *= -1;
        st.fy += 12;
      }
      // enemy fire
      if (t - st.lastShot > 900 && alive.length) {
        const shooter = pick(alive);
        st.ebullets.push({ x: 26 + st.fx + shooter.c * 36 + 12, y: 34 + st.fy + shooter.r * 26 + 18 });
        st.lastShot = t;
      }
      // player bullet hits
      st.bullets.forEach((b) => {
        st.invaders.forEach((inv) => {
          if (!inv.alive) return;
          const x = 26 + st.fx + inv.c * 36;
          const y = 34 + st.fy + inv.r * 26;
          if (b.x > x && b.x < x + 24 && b.y > y && b.y < y + 16) {
            inv.alive = false;
            b.y = -20;
            add(10);
            sfx(600, 0.05);
          }
        });
      });
      // enemy bullet hits player
      st.ebullets.forEach((b) => {
        if (b.x > st.px && b.x < st.px + 28 && b.y > 282 && b.y < 300) {
          b.y = 400;
          st.lives -= 1;
          sfx(180, 0.25, 'square');
          if (st.lives <= 0) {
            st.alive = false;
            setPlaying(false);
            setStatus('Game over — the invaders won');
          }
        }
      });
      if (st.fy > 210) {
        st.alive = false;
        setPlaying(false);
        setStatus('Game over — invaders reached the base');
      }
    }
    siDraw(ctx, st, theme || '#10b981');
  }, true);

  const start = () => {
    stateRef.current = siInit();
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="← → move · Space shoots. Clear every wave." accent={theme}>
      <Pad>
        <canvas ref={canvasRef} width={360} height={320} className="w-full max-w-[360px] mx-auto rounded-lg border border-[#2A3942] touch-none" />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 9. Breakout Brick Buster
// ============================================================
function brInit() {
  const bricks = [];
  for (let r = 0; r < 5; r += 1) {
    for (let c = 0; c < 7; c += 1) bricks.push({ r, c, alive: true });
  }
  return {
    paddle: 130,
    ball: { x: 160, y: 240, vx: 3, vy: -3.4, r: 5 },
    bricks,
    lives: 3,
    alive: true,
    started: false,
  };
}
function brDraw(ctx, st, theme) {
  const W = 320;
  const H = 320;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  const colors = ['#f43f5e', '#f97316', '#facc15', '#22c55e', '#22d3ee'];
  st.bricks.forEach((b) => {
    if (!b.alive) return;
    ctx.fillStyle = colors[b.r];
    ctx.fillRect(10 + b.c * 43, 28 + b.r * 18, 38, 13);
  });
  ctx.fillStyle = theme || '#f43f5e';
  ctx.fillRect(st.paddle, 300, 60, 8);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(st.ball.x, st.ball.y, st.ball.r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#64748b';
  ctx.font = '10px monospace';
  ctx.fillText('♥'.repeat(st.lives), 8, 14);
}

export function Breakout({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(brInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const movePaddle = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = canvasPoint(e, canvas);
    stateRef.current.paddle = clamp(p.x - 30, 0, 260);
  };

  useKeys((e) => {
    const st = stateRef.current;
    if (e.key === 'ArrowLeft') st.paddle = clamp(st.paddle - 26, 0, 260);
    if (e.key === 'ArrowRight') st.paddle = clamp(st.paddle + 26, 0, 260);
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
      const b = st.ball;
      b.x += b.vx * k;
      b.y += b.vy * k;
      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x + b.r > 320) { b.x = 320 - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); }
      if (b.vy > 0 && b.y + b.r > 298 && b.y < 315 && b.x > st.paddle - 4 && b.x < st.paddle + 64) {
        b.y = 298 - b.r;
        b.vy = -Math.abs(b.vy);
        b.vx += ((b.x - (st.paddle + 30)) / 30) * 2.4;
        b.vx = clamp(b.vx, -6.5, 6.5);
        sfx(520, 0.05);
      }
      st.bricks.forEach((br) => {
        if (!br.alive) return;
        const x = 10 + br.c * 43;
        const y = 28 + br.r * 18;
        if (b.x + b.r > x && b.x - b.r < x + 38 && b.y + b.r > y && b.y - b.r < y + 13) {
          br.alive = false;
          b.vy = -b.vy;
          add(10);
          sfx(660, 0.05);
        }
      });
      if (st.bricks.every((br) => !br.alive)) {
        add(100);
        st.bricks = brInit().bricks;
        st.ball = { x: 160, y: 240, vx: 3, vy: -3.4, r: 5 };
        setStatus('Board cleared! +100');
        sfx(820, 0.2);
      }
      if (b.y - b.r > 320) {
        st.lives -= 1;
        sfx(180, 0.2, 'square');
        if (st.lives <= 0) {
          st.alive = false;
          setPlaying(false);
          setStatus('Game over');
        } else {
          st.ball = { x: 160, y: 240, vx: 3, vy: -3.4, r: 5 };
          setStatus(st.lives + ' lives left');
        }
      }
    }
    brDraw(ctx, st, theme || '#f43f5e');
  }, true);

  const start = () => {
    stateRef.current = brInit();
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Mouse or ← → moves the paddle. Break every brick." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={320}
          height={320}
          onPointerMove={movePaddle}
          className="w-full max-w-[320px] mx-auto rounded-lg border border-[#2A3942] touch-none cursor-none"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 10. Pac-Grid Maze
// ============================================================
const PAC_MAZE = [
  '###########',
  '#.........#',
  '#.##.#.##.#',
  '#....#....#',
  '#.##...##.#',
  '#....G....#',
  '#.##...##.#',
  '#....#....#',
  '#.##.#.##.#',
  '#.........#',
  '###########',
];

function pacInit() {
  const walls = new Set();
  const dots = new Set();
  const ghosts = [];
  let player = { x: 1, y: 1 };
  PAC_MAZE.forEach((row, y) => {
    row.split('').forEach((ch, x) => {
      const key = x + ',' + y;
      if (ch === '#') walls.add(key);
      else if (ch === '.') dots.add(key);
      else if (ch === 'G') ghosts.push({ x, y });
    });
  });
  dots.delete('1,1');
  ghosts.push({ x: 3, y: 5 }, { x: 7, y: 5 });
  return { walls, dots, player, ghosts, alive: true, won: false };
}
function pacGhostStep(g, st) {
  const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => ({ x: g.x + dx, y: g.y + dy }))
    .filter((p) => !st.walls.has(p.x + ',' + p.y));
  if (!opts.length) return g;
  if (Math.random() < 0.8) {
    opts.sort((a, b) =>
      (Math.abs(a.x - st.player.x) + Math.abs(a.y - st.player.y)) -
      (Math.abs(b.x - st.player.x) + Math.abs(b.y - st.player.y)));
    return opts[0];
  }
  return pick(opts);
}

export function PacGrid({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const [game, setGame] = useState(pacInit);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const move = (dx, dy) => {
    if (!playing || !game.alive || game.won) return;
    const nx = game.player.x + dx;
    const ny = game.player.y + dy;
    if (game.walls.has(nx + ',' + ny)) return;
    const dots = new Set(game.dots);
    const key = nx + ',' + ny;
    const ate = dots.delete(key);
    const player = { x: nx, y: ny };
    const probe = { ...game, player };
    const ghosts = game.ghosts.map((g) => pacGhostStep(g, probe));
    const caught = ghosts.some((g) => g.x === nx && g.y === ny);
    const cleared = dots.size === 0;
    if (ate) {
      add(5);
      sfx(520, 0.05);
    }
    setGame({ ...game, dots, player, ghosts, alive: !caught, won: cleared });
    if (caught) {
      setPlaying(false);
      setStatus('Caught by a ghost — ' + score + ' points');
      sfx(150, 0.3, 'square');
    } else if (cleared) {
      add(200);
      setPlaying(false);
      setStatus('Maze cleared! 🏆 +200');
      sfx(820, 0.25);
    } else {
      setStatus(dots.size + ' dots left');
    }
  };

  useKeys((e) => {
    if (e.key === 'ArrowUp') move(0, -1);
    if (e.key === 'ArrowDown') move(0, 1);
    if (e.key === 'ArrowLeft') move(-1, 0);
    if (e.key === 'ArrowRight') move(1, 0);
  }, playing);

  const start = () => {
    setGame(pacInit());
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  const ghostKeys = new Set(game.ghosts.map((g) => g.x + ',' + g.y));

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Arrow keys move. Collect every dot and avoid the ghosts." accent={theme}>
      <Pad>
        <div className="grid gap-0 mx-auto border border-[#2A3942]" style={{ gridTemplateColumns: 'repeat(11, 1.35rem)' }}>
          {PAC_MAZE.map((row, y) =>
            row.split('').map((ch, x) => {
              const key = x + ',' + y;
              const wall = ch === '#';
              const isPlayer = game.player.x === x && game.player.y === y;
              const isGhost = ghostKeys.has(key);
              const isDot = game.dots.has(key);
              return (
                <div
                  key={key}
                  className={'w-[1.35rem] h-[1.35rem] flex items-center justify-center text-[10px] ' + (wall ? 'bg-[#1F2C34]' : 'bg-[#0B141A]')}
                >
                  {isPlayer ? (
                    <span className="w-3 h-3 rounded-full bg-amber-300" />
                  ) : isGhost ? (
                    <span className="text-xs leading-none">👻</span>
                  ) : isDot ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-200" />
                  ) : null}
                </div>
              );
            }),
          )}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 11. Flappy Birdie
// ============================================================
function flInit() {
  return { y: 200, vy: 0, pipes: [], spawn: 0, alive: true, passed: 0, started: false };
}
function flDraw(ctx, st, theme) {
  const W = 320;
  const H = 420;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0f172a');
  g.addColorStop(1, '#0B141A');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  st.pipes.forEach((p) => {
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(p.x, 0, 54, p.gap);
    ctx.fillRect(p.x, p.gap + 118, 54, H - p.gap - 118);
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(p.x - 3, p.gap - 16, 60, 16);
    ctx.fillRect(p.x - 3, p.gap + 118, 60, 16);
  });
  ctx.fillStyle = theme || '#fcd34d';
  ctx.beginPath();
  ctx.ellipse(80, st.y, 14, 11, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(92, st.y);
  ctx.lineTo(102, st.y + 3);
  ctx.lineTo(92, st.y + 6);
  ctx.fill();
  ctx.fillStyle = '#0B141A';
  ctx.beginPath();
  ctx.arc(86, st.y - 3, 2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(String(st.passed), 12, 24);
}

export function Flappy({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(flInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const flap = () => {
    const st = stateRef.current;
    if (!st.alive) return;
    st.vy = -7;
    sfx(520, 0.05);
  };

  useKeys((e) => {
    if (e.key === ' ' || e.key === 'ArrowUp') flap();
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
      st.vy += 0.42 * k;
      st.y += st.vy * k;
      if (st.y < 14) { st.y = 14; st.vy = 0; }
      if (st.y > 406) {
        st.alive = false;
        setPlaying(false);
        setStatus('Crashed — score ' + st.passed);
        sfx(160, 0.3, 'square');
      }
      if (!st.pipes.length || st.pipes[st.pipes.length - 1].x < 190) {
        st.pipes.push({ x: 340, gap: randInt(50, 240), scored: false });
      }
      st.pipes.forEach((p) => {
        p.x -= 2.5 * k;
        if (!p.scored && p.x + 54 < 80) {
          p.scored = true;
          st.passed += 1;
          add(10);
          sfx(760, 0.08);
          setStatus(st.passed + ' pipes cleared');
        }
        if (80 + 14 > p.x && 80 - 14 < p.x + 54) {
          if (st.y - 11 < p.gap || st.y + 11 > p.gap + 118) {
            st.alive = false;
            setPlaying(false);
            setStatus('Crashed — score ' + st.passed);
            sfx(160, 0.3, 'square');
          }
        }
      });
      st.pipes = st.pipes.filter((p) => p.x > -70);
    }
    flDraw(ctx, st, theme || '#fcd34d');
  }, true);

  const start = () => {
    stateRef.current = flInit();
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Click the canvas or press Space to flap. Slip through the gaps." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={320}
          height={420}
          onPointerDown={flap}
          className="w-full max-w-[320px] mx-auto rounded-lg border border-[#2A3942] touch-none"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 12. Dino Jump Runner
// ============================================================
function dnInit() {
  return { y: 0, vy: 0, air: false, cacti: [], spawn: 0, alive: true, ticks: 0, passed: 0 };
}
function dnDraw(ctx, st, theme) {
  const W = 400;
  const H = 200;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1F2C34';
  ctx.fillRect(0, 176, W, 24);
  ctx.strokeStyle = '#33454f';
  ctx.beginPath(); ctx.moveTo(0, 176); ctx.lineTo(W, 176); ctx.stroke();
  ctx.fillStyle = theme || '#84cc16';
  const dy = 148 - st.y;
  ctx.fillRect(50, dy, 26, 28);
  ctx.fillRect(56, dy - 8, 14, 10);
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(66, dy + 2, 4, 4);
  ctx.fillStyle = '#f43f5e';
  st.cacti.forEach((c) => ctx.fillRect(c.x, 176 - c.h, c.w, c.h));
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('SCORE ' + st.ticks, 12, 22);
}

export function DinoRun({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(dnInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const jump = () => {
    const st = stateRef.current;
    if (!st.alive || st.air) return;
    st.vy = 9.4;
    st.air = true;
    sfx(560, 0.06);
  };

  useKeys((e) => {
    if (e.key === ' ' || e.key === 'ArrowUp') jump();
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
      st.vy -= 0.55 * k;
      st.y += st.vy * k;
      if (st.y <= 0) { st.y = 0; st.vy = 0; st.air = false; }
      st.spawn -= k;
      if (st.spawn <= 0) {
        st.spawn = randInt(55, 100);
        st.cacti.push({ x: 420, w: randInt(12, 22), h: randInt(22, 38), scored: false });
      }
      const speed = 4.2 + Math.min(3, st.ticks / 900);
      st.cacti.forEach((c) => {
        c.x -= speed * k;
        if (!c.scored && c.x + c.w < 50) {
          c.scored = true;
          st.passed += 1;
          add(10);
          sfx(700, 0.06);
        }
        const dinoTop = 148 - st.y;
        if (c.x < 76 && c.x + c.w > 50 && dinoTop + 28 > 176 - c.h) {
          st.alive = false;
          setPlaying(false);
          setStatus('Game over — ' + st.passed + ' obstacles cleared');
          sfx(150, 0.3, 'square');
        }
      });
      st.cacti = st.cacti.filter((c) => c.x > -30);
      st.ticks += 1;
      if (st.ticks % 30 === 0) add(1);
    }
    dnDraw(ctx, st, theme || '#84cc16');
  }, true);

  const start = () => {
    stateRef.current = dnInit();
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Space or ↑ to jump. Clear the cacti for bonus points." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={400}
          height={200}
          onPointerDown={jump}
          className="w-full max-w-[400px] mx-auto rounded-lg border border-[#2A3942] touch-none"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 24. Bubble Shooter
// ============================================================
const BS_COLS = 8;
const BS_ROWS = 10;
const BS_COLORS = ['bg-rose-500', 'bg-amber-400', 'bg-emerald-500', 'bg-cyan-400'];
const BS_HEX = ['#f43f5e', '#facc15', '#22c55e', '#22d3ee'];

function bsNew() {
  const b = Array.from({ length: BS_ROWS }, () => Array(BS_COLS).fill(null));
  for (let r = 0; r < 5; r += 1) for (let c = 0; c < BS_COLS; c += 1) b[r][c] = randInt(0, 3);
  return b;
}
function bsCluster(board, r0, c0) {
  const color = board[r0][c0];
  if (color === null) return [];
  const seen = new Set();
  const out = [];
  const stack = [[r0, c0]];
  while (stack.length) {
    const [r, c] = stack.pop();
    const key = r + ',' + c;
    if (seen.has(key)) continue;
    if (r < 0 || r >= BS_ROWS || c < 0 || c >= BS_COLS) continue;
    if (board[r][c] !== color) continue;
    seen.add(key);
    out.push([r, c]);
    stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
  }
  return out;
}

export function BubbleShooter({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const [board, setBoard] = useState(bsNew);
  const [shooter, setShooter] = useState(() => randInt(0, 3));
  const [shots, setShots] = useState(0);
  const [status, setStatus] = useState('Pick a column and drop');
  const [over, setOver] = useState(false);

  const restart = () => {
    setBoard(bsNew());
    setShooter(randInt(0, 3));
    setShots(0);
    setStatus('Pick a column and drop');
    setOver(false);
    reset(0);
  };

  const drop = (col) => {
    if (over) return;
    const next = board.map((row) => [...row]);
    let row = -1;
    for (let r = BS_ROWS - 1; r >= 0; r -= 1) {
      if (next[r][col] === null) { row = r; break; }
    }
    if (row < 0) { setStatus('That column is full'); return; }
    next[row][col] = shooter;
    const group = bsCluster(next, row, col);
    if (group.length >= 3) {
      group.forEach(([r, c]) => { next[r][c] = null; });
      add(group.length * 10);
      setStatus(group.length + ' bubbles popped!');
      sfx(700, 0.12);
    } else {
      setStatus('No match — keep stacking');
      sfx(320, 0.05);
    }
    const nShots = shots + 1;
    setShots(nShots);
    if (nShots % 5 === 0) {
      if (next[BS_ROWS - 1].some(Boolean)) {
        setOver(true);
        setStatus('Board filled up — game over');
        sfx(150, 0.3, 'square');
      } else {
        next.pop();
        next.unshift(Array.from({ length: BS_COLS }, () => randInt(0, 3)));
      }
    }
    setBoard(next);
    setShooter(randInt(0, 3));
  };

  return (
    <GameShell
      score={score}
      best={best}
      onStart={restart}
      running={!over}
      onRestart={restart}
      status={status}
      hint="Match 3+ of the same colour. A new row pushes in every 5 drops."
      accent={theme}
    >
      <Pad>
        <div className="flex items-center justify-between mb-2 text-[11px] text-zinc-400 font-mono">
          <span>Next</span>
          <span className={'w-5 h-5 rounded-full ' + BS_COLORS[shooter]} />
          <span>{shots} drops</span>
        </div>
        <div className="grid grid-cols-8 gap-0.5 mb-1">
          {Array.from({ length: BS_COLS }).map((_, c) => (
            <button
              key={c}
              type="button"
              onClick={() => drop(c)}
              className="h-6 rounded bg-[#2A3942] hover:bg-[#3A4952] text-[9px] text-zinc-400"
            >
              ▼
            </button>
          ))}
        </div>
        <div className="grid grid-cols-8 gap-0.5 mx-auto" style={{ maxWidth: 280 }}>
          {board.map((row, r) =>
            row.map((cell, c) => (
              <div key={r + '-' + c} className="aspect-square rounded bg-[#101c23] flex items-center justify-center">
                {cell !== null ? <span className={'w-[86%] h-[86%] rounded-full ' + BS_COLORS[cell]} /> : null}
              </div>
            )),
          )}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 28. Color Switcher
// ============================================================
const CS_COLORS = ['#f43f5e', '#facc15', '#22c55e', '#22d3ee'];
const CS_BALL_Y = 390;

function csInit() {
  return { color: 0, bars: [], speed: 2.1, spawn: 0, alive: true, passed: 0 };
}
function csDraw(ctx, st, theme) {
  const W = 320;
  const H = 480;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  st.bars.forEach((b) => {
    ctx.fillStyle = CS_COLORS[b.color];
    ctx.fillRect(0, b.y, W, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, b.y + 16, W, 2);
  });
  ctx.fillStyle = CS_COLORS[st.color];
  ctx.beginPath();
  ctx.arc(W / 2, CS_BALL_Y, 12, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#64748b';
  ctx.font = '11px monospace';
  ctx.fillText('Tap to switch colour', 100, 24);
}

export function ColorSwitch({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(csInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const cycle = () => {
    const st = stateRef.current;
    if (!st.alive) return;
    st.color = (st.color + 1) % 4;
    sfx(400 + st.color * 90, 0.05);
  };

  useKeys((e) => {
    if (e.key === ' ' || e.key === 'ArrowUp') cycle();
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
      st.bars.forEach((b) => { b.y += st.speed * k; });
      if (!st.bars.length || st.bars[st.bars.length - 1].y > -120) {
        st.bars.push({ y: -30, color: randInt(0, 3), checked: false });
      }
      st.bars.forEach((b) => {
        if (!b.checked && b.y + 18 > CS_BALL_Y - 12 && b.y < CS_BALL_Y + 12) {
          b.checked = true;
          if (b.color !== st.color) {
            st.alive = false;
            setPlaying(false);
            setStatus('Wrong colour — ' + st.passed + ' gates passed');
            sfx(150, 0.35, 'sawtooth');
          } else {
            st.passed += 1;
            add(10);
            st.speed = Math.min(5.2, st.speed + 0.09);
            sfx(720, 0.06);
            setStatus(st.passed + ' gates passed');
          }
        }
      });
      st.bars = st.bars.filter((b) => b.y < 500);
    }
    csDraw(ctx, st, theme || '#ec4899');
  }, true);

  const start = () => {
    stateRef.current = csInit();
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Tap or press Space to cycle the ball colour. Match each gate." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={320}
          height={480}
          onPointerDown={cycle}
          className="w-full max-w-[260px] mx-auto rounded-lg border border-[#2A3942] touch-none"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 29. Pinball Arcade
// ============================================================
function pbInit() {
  return {
    ball: { x: 160, y: 120, vx: 2.4, vy: 2.6, r: 8 },
    bumpers: [
      { x: 95, y: 175, r: 18, cd: 0 },
      { x: 225, y: 175, r: 18, cd: 0 },
      { x: 160, y: 265, r: 15, cd: 0 },
    ],
    lives: 3,
    alive: true,
    over: false,
  };
}
function pbDraw(ctx, st, theme) {
  const W = 320;
  const H = 480;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#33454f';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(12, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(308, 0); ctx.lineTo(308, H); ctx.stroke();
  st.bumpers.forEach((b) => {
    ctx.fillStyle = theme || '#fbbf24';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0B141A';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 7, 0, TAU); ctx.fill();
  });
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(55, 432); ctx.lineTo(150, 452); ctx.stroke();
  ctx.strokeStyle = '#f43f5e';
  ctx.beginPath(); ctx.moveTo(265, 432); ctx.lineTo(170, 452); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(st.ball.x, st.ball.y, st.ball.r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#64748b';
  ctx.font = '11px monospace';
  ctx.fillText('BALLS ' + st.lives, 20, 20);
}

export function Pinball({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(pbInit());
  const held = useHeldKeys();
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  useRafLoop((t) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (playing && !st.over) {
      if (!st.last) st.last = t;
      const dt = Math.min(30, t - st.last);
      st.last = t;
      const k = dt / 16.6;
      const b = st.ball;
      b.vy += 0.16 * k;
      b.x += b.vx * k;
      b.y += b.vy * k;
      if (b.x - b.r < 14) { b.x = 14 + b.r; b.vx = Math.abs(b.vx); }
      if (b.x + b.r > 306) { b.x = 306 - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y - b.r < 4) { b.y = 4 + b.r; b.vy = Math.abs(b.vy); }
      st.bumpers.forEach((bp) => {
        const dx = b.x - bp.x;
        const dy = b.y - bp.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < b.r + bp.r) {
          const nx = dx / d;
          const ny = dy / d;
          const overlap = b.r + bp.r - d;
          b.x += nx * overlap;
          b.y += ny * overlap;
          const dot = b.vx * nx + b.vy * ny;
          b.vx = (b.vx - 2 * dot * nx) * 1.05;
          b.vy = (b.vy - 2 * dot * ny) * 1.05;
          if (t - bp.cd > 260) {
            bp.cd = t;
            add(25);
            sfx(660, 0.06);
          }
        }
      });
      if (b.y > 405 && b.vy > 0) {
        if (held.current.ArrowLeft && b.x > 40 && b.x < 160) {
          b.vy = -10.5;
          b.vx = (b.x - 105) * 0.14;
          sfx(420, 0.06);
        } else if (held.current.ArrowRight && b.x > 160 && b.x < 285) {
          b.vy = -10.5;
          b.vx = (b.x - 215) * 0.14;
          sfx(420, 0.06);
        }
      }
      if (b.y > 500) {
        st.lives -= 1;
        sfx(150, 0.25, 'square');
        if (st.lives <= 0) {
          st.over = true;
          setPlaying(false);
          setStatus('Game over — ' + score + ' points');
        } else {
          st.ball = { x: 160, y: 120, vx: pick([-2.4, 2.4]), vy: 2.6, r: 8 };
          setStatus(st.lives + ' balls left');
        }
      }
    }
    pbDraw(ctx, st, theme || '#fbbf24');
  }, true);

  const start = () => {
    stateRef.current = pbInit();
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="← / → flip the paddles. Bumpers score 25 each. 3 balls." accent={theme}>
      <Pad>
        <canvas ref={canvasRef} width={320} height={480} className="w-full max-w-[260px] mx-auto rounded-lg border border-[#2A3942] touch-none" />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 31. Car Dodger
// ============================================================
const CD_LANES = [60, 150, 240];

function cdInit() {
  return { lane: 1, cars: [], spawn: 0, alive: true, scoreAcc: 0, distance: 0 };
}
function cdDraw(ctx, st, theme) {
  const W = 300;
  const H = 420;
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(25, 0, 250, H);
  ctx.setLineDash([18, 16]);
  ctx.strokeStyle = '#33454f';
  ctx.lineWidth = 3;
  [105, 195].forEach((x) => {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  });
  ctx.setLineDash([]);
  st.cars.forEach((c) => {
    ctx.fillStyle = c.color;
    ctx.fillRect(CD_LANES[c.lane] - 22, c.y, 44, 70);
    ctx.fillStyle = '#0B141A';
    ctx.fillRect(CD_LANES[c.lane] - 15, c.y + 12, 30, 14);
    ctx.fillRect(CD_LANES[c.lane] - 15, c.y + 44, 30, 14);
  });
  ctx.fillStyle = theme || '#ef4444';
  ctx.fillRect(CD_LANES[st.lane] - 22, 340, 44, 70);
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(CD_LANES[st.lane] - 15, 352, 30, 14);
  ctx.fillRect(CD_LANES[st.lane] - 15, 384, 30, 14);
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(String(st.distance), 12, 22);
}

export function CarDodger({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(cdInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  useKeys((e) => {
    const st = stateRef.current;
    if (!st.alive) return;
    if (e.key === 'ArrowLeft') { st.lane = clamp(st.lane - 1, 0, 2); sfx(340, 0.04); }
    if (e.key === 'ArrowRight') { st.lane = clamp(st.lane + 1, 0, 2); sfx(340, 0.04); }
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
        st.spawn = randInt(38, 70);
        st.cars.push({ lane: randInt(0, 2), y: -80, color: pick(['#3b82f6', '#a855f7', '#22c55e', '#facc15']) });
      }
      const speed = 4 + Math.min(4, st.distance / 220);
      st.cars.forEach((c) => { c.y += speed * k; });
      st.cars = st.cars.filter((c) => c.y < 460);
      st.distance += 1;
      st.scoreAcc += k;
      if (st.scoreAcc > 26) {
        st.scoreAcc = 0;
        add(1);
      }
      st.cars.forEach((c) => {
        if (c.lane === st.lane && c.y + 70 > 340 && c.y < 410) {
          st.alive = false;
          setPlaying(false);
          setStatus('Crashed — ' + st.distance + 'm travelled');
          sfx(150, 0.35, 'square');
        }
      });
    }
    cdDraw(ctx, st, theme || '#ef4444');
  }, true);

  const start = () => {
    stateRef.current = cdInit();
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="← → change lane. Dodge the traffic as long as you can." accent={theme}>
      <Pad>
        <canvas ref={canvasRef} width={300} height={420} className="w-full max-w-[280px] mx-auto rounded-lg border border-[#2A3942] touch-none" />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 34. Target Archery
// ============================================================
const AR_CX = 268;
const AR_CY = 150;
const AR_RINGS = [88, 70, 52, 34, 17];
const AR_POINTS = [2, 4, 6, 8, 10];

function arDraw(ctx, st, theme) {
  const W = 360;
  const H = 300;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0f172a');
  g.addColorStop(1, '#0B141A');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const ringColors = ['#f8fafc', '#ef4444', '#f8fafc', '#ef4444', '#facc15'];
  AR_RINGS.forEach((r, i) => {
    ctx.fillStyle = ringColors[i];
    ctx.beginPath(); ctx.arc(AR_CX, AR_CY, r, 0, TAU); ctx.fill();
  });
  ctx.fillStyle = '#111827';
  ctx.beginPath(); ctx.arc(AR_CX, AR_CY, 7, 0, TAU); ctx.fill();
  st.shots.forEach((s) => {
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s.x - 8, s.y); ctx.lineTo(s.x + 8, s.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s.x, s.y - 8); ctx.lineTo(s.x, s.y + 8); ctx.stroke();
  });
  ctx.fillStyle = '#64748b';
  ctx.font = '11px monospace';
  ctx.fillText('WIND ' + (st.wind > 0 ? '→ ' : '← ') + Math.abs(st.wind), 12, 22);
  ctx.fillText('ARROWS ' + st.left, 12, 38);
}

export function Archery({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef({ shots: [], wind: randInt(-16, 16), left: 5, over: false });
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const shoot = (e) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!playing || st.over || !canvas) return;
    const p = canvasPoint(e, canvas);
    const land = { x: p.x + st.wind, y: p.y + randInt(-5, 5) };
    const d = Math.hypot(land.x - AR_CX, land.y - AR_CY);
    let pts = 0;
    for (let i = 0; i < AR_RINGS.length; i += 1) {
      if (d <= AR_RINGS[i]) { pts = AR_POINTS[i]; break; }
    }
    st.shots.push(land);
    st.left -= 1;
    if (pts) {
      add(pts);
      sfx(600 + pts * 20, 0.08);
      setStatus(pts === 10 ? 'Bullseye! +10' : '+' + pts + ' points');
    } else {
      sfx(220, 0.1, 'square');
      setStatus('Missed the target');
    }
    if (st.left <= 0) {
      st.over = true;
      setPlaying(false);
      setStatus('Round over — ' + score + ' total points');
    }
  };

  const start = () => {
    stateRef.current = { shots: [], wind: randInt(-16, 16), left: 5, over: false };
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Click the target to shoot. Wind pushes your arrow sideways. 5 arrows." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={360}
          height={300}
          onPointerDown={shoot}
          className="w-full max-w-[360px] mx-auto rounded-lg border border-[#2A3942] touch-none cursor-crosshair"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 35. Golf Putt Mini
// ============================================================
function gpHole() {
  return { x: randInt(250, 315), y: randInt(70, 235) };
}
function gpInit(holeIdx) {
  return {
    ball: { x: 62, y: 150, vx: 0, vy: 0, r: 7 },
    hole: gpHole(),
    strokes: 0,
    holeIdx: holeIdx || 0,
    dragging: false,
    aim: null,
    done: false,
  };
}
function gpDraw(ctx, st, theme) {
  const W = 360;
  const H = 300;
  ctx.fillStyle = '#14532d';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#166534';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i += 1) {
    ctx.beginPath(); ctx.moveTo(0, i * 26); ctx.lineTo(W, i * 26); ctx.stroke();
  }
  ctx.fillStyle = '#052e16';
  ctx.beginPath(); ctx.arc(st.hole.x, st.hole.y, 11, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(st.hole.x, st.hole.y); ctx.lineTo(st.hole.x, st.hole.y - 26); ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath(); ctx.arc(st.ball.x, st.ball.y, st.ball.r, 0, TAU); ctx.fill();
  if (st.dragging && st.aim) {
    ctx.strokeStyle = '#facc15';
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(st.ball.x, st.ball.y); ctx.lineTo(st.aim.x, st.aim.y); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = '#bbf7d0';
  ctx.font = '11px monospace';
  ctx.fillText('HOLE ' + (st.holeIdx + 1) + '/3 · STROKES ' + st.strokes, 12, 20);
}

export function GolfPutt({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(gpInit(0));
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const down = (e) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!playing || st.done || !canvas) return;
    st.dragging = true;
    st.aim = canvasPoint(e, canvas);
  };
  const move = (e) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!st.dragging || !canvas) return;
    st.aim = canvasPoint(e, canvas);
  };
  const up = () => {
    const st = stateRef.current;
    if (!st.dragging || !st.aim) return;
    st.dragging = false;
    const dx = st.ball.x - st.aim.x;
    const dy = st.ball.y - st.aim.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) return;
    const power = Math.min(13, len * 0.12);
    st.ball.vx = (dx / len) * power;
    st.ball.vy = (dy / len) * power;
    st.strokes += 1;
    st.aim = null;
    sfx(320, 0.06);
    setStatus('Putt ' + st.strokes);
  };

  useRafLoop((t) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (playing && !st.done) {
      if (!st.last) st.last = t;
      const dt = Math.min(34, t - st.last);
      st.last = t;
      const k = dt / 16.6;
      const b = st.ball;
      b.x += b.vx * k;
      b.y += b.vy * k;
      b.vx *= Math.pow(0.982, k);
      b.vy *= Math.pow(0.982, k);
      if (Math.abs(b.vx) < 0.05) b.vx = 0;
      if (Math.abs(b.vy) < 0.05) b.vy = 0;
      if (b.x - b.r < 16) { b.x = 16 + b.r; b.vx = Math.abs(b.vx) * 0.8; }
      if (b.x + b.r > 344) { b.x = 344 - b.r; b.vx = -Math.abs(b.vx) * 0.8; }
      if (b.y - b.r < 30) { b.y = 30 + b.r; b.vy = Math.abs(b.vy) * 0.8; }
      if (b.y + b.r > 276) { b.y = 276 - b.r; b.vy = -Math.abs(b.vy) * 0.8; }
      const moving = b.vx !== 0 || b.vy !== 0;
      const holed = Math.hypot(b.x - st.hole.x, b.y - st.hole.y) < 12 && Math.hypot(b.vx, b.vy) < 6;
      if (holed) {
        const pts = Math.max(10, 100 - (st.strokes - 1) * 20);
        add(pts);
        sfx(780, 0.2);
        const nextIdx = st.holeIdx + 1;
        if (nextIdx >= 3) {
          st.done = true;
          setPlaying(false);
          setStatus('Round complete — ' + score + ' points');
        } else {
          stateRef.current = gpInit(nextIdx);
          setStatus('Holed in ' + st.strokes + '! +' + pts + ' · next hole');
        }
      } else if (st.strokes >= 7 && !moving) {
        const nextIdx = st.holeIdx + 1;
        if (nextIdx >= 3) {
          st.done = true;
          setPlaying(false);
          setStatus('Round complete — ' + score + ' points');
        } else {
          stateRef.current = gpInit(nextIdx);
          setStatus('Out of strokes — moving on');
        }
      }
    }
    gpDraw(ctx, st, theme || '#22c55e');
  }, true);

  const start = () => {
    stateRef.current = gpInit(0);
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Drag away from the ball and release to putt. Sink it in as few strokes as you can." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={360}
          height={300}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="w-full max-w-[360px] mx-auto rounded-lg border border-[#2A3942] touch-none"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 36. Bowling Strike
// ============================================================
const BW_FRAMES = 5;

function bwPins() {
  const pins = [];
  const rows = [4, 3, 2, 1];
  let y = 66;
  rows.forEach((n) => {
    for (let i = 0; i < n; i += 1) {
      const x = 150 + (i - (n - 1) / 2) * 27;
      pins.push({ x, y, ox: x, oy: y, vx: 0, vy: 0, r: 7, down: false, gone: false });
    }
    y += 26;
  });
  return pins;
}
function bwInit() {
  return {
    ball: { x: 150, y: 436, vx: 0, vy: 0, r: 12 },
    pins: bwPins(),
    frame: 0,
    roll: 0,
    total: 0,
    rolling: false,
    settle: 0,
    over: false,
  };
}
function bwDraw(ctx, st, theme) {
  const W = 300;
  const H = 480;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(30, 20, 240, 440);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i += 1) {
    ctx.beginPath(); ctx.moveTo(60 + i * 20, 30); ctx.lineTo(40 + i * 22, 450); ctx.stroke();
  }
  ctx.fillStyle = '#f8fafc';
  st.pins.forEach((p) => {
    if (p.gone) return;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    if (p.down) {
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f8fafc';
    }
  });
  ctx.fillStyle = theme || '#f8fafc';
  ctx.beginPath(); ctx.arc(st.ball.x, st.ball.y, st.ball.r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#64748b';
  ctx.font = '11px monospace';
  ctx.fillText('FRAME ' + Math.min(BW_FRAMES, st.frame + 1) + '/' + BW_FRAMES + ' · ROLL ' + (st.roll + 1) + ' · PINS ' + st.total, 12, 16);
}

export function Bowling({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(bwInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const settleRoll = () => {
    const st = stateRef.current;
    const down = st.pins.filter((p) => p.down && !p.gone).length;
    st.total += down;
    if (down > 0) add(down);
    st.rolling = false;
    if (st.roll === 0 && down === 10) {
      setStatus('STRIKE! +' + down);
      sfx(820, 0.25);
      st.frame += 1;
      st.pins = bwPins();
      st.roll = 0;
    } else if (st.roll === 0) {
      setStatus(down + ' pins down — roll again');
      st.pins.forEach((p) => { if (p.down) p.gone = true; });
      st.roll = 1;
    } else {
      setStatus(down + ' pins on the second roll');
      st.frame += 1;
      st.pins = bwPins();
      st.roll = 0;
    }
    st.ball = { x: 150, y: 436, vx: 0, vy: 0, r: 12 };
    if (st.frame >= BW_FRAMES) {
      st.over = true;
      setPlaying(false);
      setStatus('Game complete — ' + st.total + ' pins');
    }
  };

  const shoot = (e) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!playing || st.over || st.rolling || !canvas) return;
    const p = canvasPoint(e, canvas);
    st.ball.vx = clamp((p.x - 150) * 0.055, -4.5, 4.5);
    st.ball.vy = -9.6;
    st.rolling = true;
    st.settle = 0;
    sfx(300, 0.08);
    setStatus('Rolling…');
  };

  useRafLoop((t) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (playing && !st.over && st.rolling) {
      if (!st.last) st.last = t;
      const dt = Math.min(34, t - st.last);
      st.last = t;
      const k = dt / 16.6;
      const b = st.ball;
      b.x += b.vx * k;
      b.y += b.vy * k;
      b.vx *= Math.pow(0.994, k);
      b.vy *= Math.pow(0.994, k);
      if (b.y < 24) { b.vy = 0; b.vx *= 0.5; }
      // ball vs pins
      st.pins.forEach((p) => {
        if (p.gone) return;
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < b.r + p.r) {
          const nx = dx / d;
          const ny = dy / d;
          const rel = b.vx * nx + b.vy * ny;
          if (rel > 0) {
            p.vx += nx * rel * 0.95;
            p.vy += ny * rel * 0.95;
            b.vx -= nx * rel * 0.3;
            b.vy -= ny * rel * 0.3;
            p.down = true;
          }
        }
      });
      // pin movement + pin vs pin
      st.pins.forEach((p) => {
        if (p.gone) return;
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.vx *= Math.pow(0.95, k);
        p.vy *= Math.pow(0.95, k);
        if (Math.abs(p.vx) < 0.04) p.vx = 0;
        if (Math.abs(p.vy) < 0.04) p.vy = 0;
        if (p.vx || p.vy) p.down = true;
        if (Math.hypot(p.x - p.ox, p.y - p.oy) > 4) p.down = true;
      });
      for (let i = 0; i < st.pins.length; i += 1) {
        for (let j = i + 1; j < st.pins.length; j += 1) {
          const a = st.pins[i];
          const c = st.pins[j];
          if (a.gone || c.gone) continue;
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d > 0 && d < a.r + c.r) {
            const nx = dx / d;
            const ny = dy / d;
            const overlap = a.r + c.r - d;
            a.x -= (nx * overlap) / 2;
            a.y -= (ny * overlap) / 2;
            c.x += (nx * overlap) / 2;
            c.y += (ny * overlap) / 2;
            const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
            if (rel < 0) {
              const jimp = (-1.6 * rel) / 2;
              a.vx -= jimp * nx;
              a.vy -= jimp * ny;
              c.vx += jimp * nx;
              c.vy += jimp * ny;
              a.down = true;
              c.down = true;
            }
          }
        }
      }
      st.settle += dt;
      const slow = Math.hypot(b.vx, b.vy) < 0.35;
      if ((slow && b.y < 250) || b.y < 0 || st.settle > 4200) {
        settleRoll();
      }
    }
    bwDraw(ctx, st, theme || '#f8fafc');
  }, true);

  const start = () => {
    stateRef.current = bwInit();
    reset(0);
    setStatus('Click the lane to aim and roll');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Click left or right of centre to angle your roll. 5 frames, 2 rolls each." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={300}
          height={480}
          onPointerDown={shoot}
          className="w-full max-w-[260px] mx-auto rounded-lg border border-[#2A3942] touch-none cursor-crosshair"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 37. Basketball Hoop
// ============================================================
const BB_HOOP_X = 246;
const BB_HOOP_Y = 118;
const BB_RIM = 27;

function bbInit() {
  return {
    ball: { x: 80, y: 340, vx: 0, vy: 0, r: 11 },
    startX: 80,
    shots: 10,
    flying: false,
    dragging: false,
    aim: null,
    over: false,
  };
}
function bbDraw(ctx, st, theme) {
  const W = 320;
  const H = 400;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(20, 20, 280, 360);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(BB_HOOP_X + 28, 78, 8, 82);
  ctx.fillStyle = '#f97316';
  ctx.fillRect(BB_HOOP_X - BB_RIM, BB_HOOP_Y, BB_RIM * 2, 5);
  ctx.strokeStyle = 'rgba(249,115,22,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(BB_HOOP_X - BB_RIM + i * 9, BB_HOOP_Y + 5);
    ctx.lineTo(BB_HOOP_X - BB_RIM + 6 + i * 8, BB_HOOP_Y + 42);
    ctx.stroke();
  }
  ctx.fillStyle = theme || '#f59e0b';
  ctx.beginPath(); ctx.arc(st.ball.x, st.ball.y, st.ball.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#0B141A';
  ctx.beginPath(); ctx.arc(st.ball.x, st.ball.y, st.ball.r, 0.4, 2.6); ctx.stroke();
  if (st.dragging && st.aim) {
    ctx.strokeStyle = '#22d3ee';
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(st.ball.x, st.ball.y); ctx.lineTo(st.aim.x, st.aim.y); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px monospace';
  ctx.fillText('SHOTS ' + st.shots, 32, 40);
}

export function Basketball({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(bbInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const down = (e) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!playing || st.over || st.flying || !canvas) return;
    st.dragging = true;
    st.aim = canvasPoint(e, canvas);
  };
  const move = (e) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!st.dragging || !canvas) return;
    st.aim = canvasPoint(e, canvas);
  };
  const up = () => {
    const st = stateRef.current;
    if (!st.dragging || !st.aim) return;
    st.dragging = false;
    const dx = st.ball.x - st.aim.x;
    const dy = st.ball.y - st.aim.y;
    const len = Math.hypot(dx, dy);
    if (len < 12) return;
    const power = Math.min(16, len * 0.14);
    st.ball.vx = (dx / len) * power;
    st.ball.vy = (dy / len) * power;
    st.flying = true;
    st.scored = false;
    st.prevY = st.ball.y;
    st.aim = null;
    sfx(300, 0.06);
    setStatus('Shot away!');
  };

  useRafLoop((t) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (playing && !st.over && st.flying) {
      if (!st.last) st.last = t;
      const dt = Math.min(34, t - st.last);
      st.last = t;
      const k = dt / 16.6;
      const b = st.ball;
      st.prevY = b.y;
      b.vy += 0.35 * k;
      b.x += b.vx * k;
      b.y += b.vy * k;
      if (b.y + b.r > 380) {
        b.y = 380 - b.r;
        b.vy = -b.vy * 0.55;
        b.vx *= 0.8;
      }
      if (b.x - b.r < 26) { b.x = 26 + b.r; b.vx = Math.abs(b.vx) * 0.6; }
      if (b.x + b.r > 294) { b.x = 294 - b.r; b.vx = -Math.abs(b.vx) * 0.6; }
      if (!st.scored && b.vy > 0 && st.prevY < BB_HOOP_Y && b.y >= BB_HOOP_Y && b.x > BB_HOOP_X - BB_RIM + 4 && b.x < BB_HOOP_X + BB_RIM - 4) {
        st.scored = true;
        const pts = st.startX < 110 ? 3 : 2;
        add(pts);
        sfx(820, 0.2);
        setStatus(pts === 3 ? 'Three pointer! +3' : 'Bucket! +2');
      }
      if (st.scored && b.y > 200) {
        st.flying = false;
        st.shots -= 1;
        if (st.shots <= 0) {
          st.over = true;
          setPlaying(false);
          setStatus('Session over — ' + score + ' points');
        } else {
          const sx = randInt(60, 150);
          st.startX = sx;
          st.ball = { x: sx, y: 340, vx: 0, vy: 0, r: 11 };
          setStatus(st.shots + ' shots left');
        }
      }
      if (!st.scored && (b.y > 400 || (b.x < 20 && b.vx <= 0) || (b.x > 300 && b.vx >= 0))) {
        st.flying = false;
        st.shots -= 1;
        if (st.shots <= 0) {
          st.over = true;
          setPlaying(false);
          setStatus('Session over — ' + score + ' points');
        } else {
          const sx = randInt(60, 150);
          st.startX = sx;
          st.ball = { x: sx, y: 340, vx: 0, vy: 0, r: 11 };
          setStatus('Missed — ' + st.shots + ' shots left');
        }
      }
      if (Math.hypot(b.vx, b.vy) < 0.2 && b.y > 360) {
        b.vx = 0;
        b.vy = 0;
      }
    }
    bbDraw(ctx, st, theme || '#f59e0b');
  }, true);

  const start = () => {
    const st = bbInit();
    st.startX = randInt(60, 150);
    st.ball.x = st.startX;
    stateRef.current = st;
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Drag back from the ball and release to shoot. 10 shots." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={320}
          height={400}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="w-full max-w-[300px] mx-auto rounded-lg border border-[#2A3942] touch-none"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 38. Dart Thrower
// ============================================================
const DT_CX = 160;
const DT_CY = 160;
const DT_RINGS = [100, 80, 60, 40, 20];
const DT_POINTS = [5, 10, 15, 25, 50];

function dtDraw(ctx, st, theme) {
  const W = 320;
  const H = 320;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  const colors = ['#1e293b', '#f8fafc', '#ef4444', '#f8fafc', '#facc15'];
  DT_RINGS.forEach((r, i) => {
    ctx.fillStyle = colors[i];
    ctx.beginPath(); ctx.arc(DT_CX, DT_CY, r, 0, TAU); ctx.fill();
  });
  ctx.strokeStyle = '#0B141A';
  ctx.lineWidth = 1;
  DT_RINGS.forEach((r) => {
    ctx.beginPath(); ctx.arc(DT_CX, DT_CY, r, 0, TAU); ctx.stroke();
  });
  st.marks.forEach((m) => {
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(m.x - 7, m.y); ctx.lineTo(m.x + 7, m.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m.x, m.y - 7); ctx.lineTo(m.x, m.y + 7); ctx.stroke();
  });
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px monospace';
  ctx.fillText('DARTS ' + st.left, 12, 18);
}

export function Darts({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef({ marks: [], left: 5, over: false });
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const throwDart = (e) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!playing || st.over || !canvas) return;
    const p = canvasPoint(e, canvas);
    const mark = { x: p.x + randInt(-7, 7), y: p.y + randInt(-7, 7) };
    const d = Math.hypot(mark.x - DT_CX, mark.y - DT_CY);
    let pts = 0;
    for (let i = 0; i < DT_RINGS.length; i += 1) {
      if (d <= DT_RINGS[i]) { pts = DT_POINTS[i]; break; }
    }
    st.marks.push(mark);
    st.left -= 1;
    if (pts) {
      add(pts);
      sfx(560 + pts * 4, 0.07);
      setStatus(pts === 50 ? 'Bullseye! +50' : '+' + pts + ' points');
    } else {
      sfx(200, 0.1, 'square');
      setStatus('Off the board');
    }
    if (st.left <= 0) {
      st.over = true;
      setPlaying(false);
      setStatus('Round over — ' + score + ' points');
    }
  };

  const start = () => {
    stateRef.current = { marks: [], left: 5, over: false };
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Click the board to throw. Inner bull is worth 50. 5 darts." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={320}
          height={320}
          onPointerDown={throwDart}
          className="w-full max-w-[300px] mx-auto rounded-lg border border-[#2A3942] touch-none cursor-crosshair"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 39. Pool Billiards 8-Ball
// ============================================================
const POOL_W = 400;
const POOL_H = 240;
const POOL_POCKETS = [
  { x: 22, y: 22 }, { x: 200, y: 18 }, { x: 378, y: 22 },
  { x: 22, y: 218 }, { x: 200, y: 222 }, { x: 378, y: 218 },
];
const POOL_COLORS = ['#facc15', '#3b82f6', '#ef4444', '#a855f7', '#f97316', '#22c55e'];

function poolRack() {
  const balls = [{ x: 100, y: 120, vx: 0, vy: 0, r: 8, color: '#f8fafc', cue: true, potted: false }];
  let idx = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col <= row; col += 1) {
      if (idx >= 6) break;
      balls.push({
        x: 262 + row * 17,
        y: 120 + (col - row / 2) * 17,
        vx: 0,
        vy: 0,
        r: 8,
        color: POOL_COLORS[idx],
        cue: false,
        potted: false,
      });
      idx += 1;
    }
  }
  return { balls, dragging: false, aim: null, shots: 0 };
}
function poolDraw(ctx, st, theme) {
  const W = POOL_W;
  const H = POOL_H;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#166534';
  ctx.fillRect(14, 14, W - 28, H - 28);
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  POOL_POCKETS.forEach((p) => {
    ctx.fillStyle = '#020617';
    ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, TAU); ctx.fill();
  });
  st.balls.forEach((b) => {
    if (b.potted) return;
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  const cue = st.balls[0];
  if (st.dragging && st.aim && !cue.potted) {
    ctx.strokeStyle = '#22d3ee';
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(cue.x, cue.y); ctx.lineTo(st.aim.x, st.aim.y); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = '#bbf7d0';
  ctx.font = '11px monospace';
  ctx.fillText('POTTED ' + st.balls.filter((b) => !b.cue && b.potted).length + '/6', 20, 12);
}

export function Pool({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(poolRack());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const down = (e) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!playing || !canvas) return;
    st.dragging = true;
    st.aim = canvasPoint(e, canvas);
  };
  const move = (e) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!st.dragging || !canvas) return;
    st.aim = canvasPoint(e, canvas);
  };
  const up = () => {
    const st = stateRef.current;
    if (!st.dragging || !st.aim) return;
    st.dragging = false;
    const cue = st.balls[0];
    if (cue.potted) return;
    const dx = st.aim.x - cue.x;
    const dy = st.aim.y - cue.y;
    const len = Math.hypot(dx, dy);
    if (len < 10) return;
    const power = Math.min(15, len * 0.1);
    cue.vx = (dx / len) * power;
    cue.vy = (dy / len) * power;
    st.shots += 1;
    st.aim = null;
    sfx(280, 0.06);
  };

  useRafLoop((t) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (playing) {
      if (!st.last) st.last = t;
      const dt = Math.min(34, t - st.last);
      st.last = t;
      const k = dt / 16.6;
      const balls = st.balls;
      balls.forEach((b) => {
        if (b.potted) return;
        b.x += b.vx * k;
        b.y += b.vy * k;
        b.vx *= Math.pow(0.988, k);
        b.vy *= Math.pow(0.988, k);
        if (Math.abs(b.vx) < 0.03) b.vx = 0;
        if (Math.abs(b.vy) < 0.03) b.vy = 0;
        if (b.x - b.r < 20) { b.x = 20 + b.r; b.vx = Math.abs(b.vx) * 0.88; }
        if (b.x + b.r > 380) { b.x = 380 - b.r; b.vx = -Math.abs(b.vx) * 0.88; }
        if (b.y - b.r < 20) { b.y = 20 + b.r; b.vy = Math.abs(b.vy) * 0.88; }
        if (b.y + b.r > 220) { b.y = 220 - b.r; b.vy = -Math.abs(b.vy) * 0.88; }
        POOL_POCKETS.forEach((p) => {
          if (Math.hypot(b.x - p.x, b.y - p.y) < 15) {
            b.potted = true;
            b.vx = 0;
            b.vy = 0;
            if (b.cue) {
              add(-5);
              sfx(180, 0.15, 'square');
              setTimeout(() => {
                b.potted = false;
                b.x = 100;
                b.y = 120;
              }, 350);
              setStatus('Cue ball pocketed (-5)');
            } else {
              add(10);
              sfx(700, 0.1);
              setStatus('Ball potted! +10');
            }
          }
        });
      });
      for (let i = 0; i < balls.length; i += 1) {
        for (let j = i + 1; j < balls.length; j += 1) {
          const a = balls[i];
          const b = balls[j];
          if (a.potted || b.potted) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d > 0 && d < a.r + b.r) {
            const nx = dx / d;
            const ny = dy / d;
            const overlap = a.r + b.r - d;
            a.x -= (nx * overlap) / 2;
            a.y -= (ny * overlap) / 2;
            b.x += (nx * overlap) / 2;
            b.y += (ny * overlap) / 2;
            const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rel < 0) {
              const jimp = (-1.9 * rel) / 2;
              a.vx -= jimp * nx;
              a.vy -= jimp * ny;
              b.vx += jimp * nx;
              b.vy += jimp * ny;
              sfx(360, 0.03);
            }
          }
        }
      }
      const remaining = balls.filter((b) => !b.cue && !b.potted).length;
      if (remaining === 0) {
        add(100);
        const fresh = poolRack();
        fresh.balls[0] = balls[0];
        fresh.balls[0].potted = false;
        fresh.balls[0].x = 100;
        fresh.balls[0].y = 120;
        fresh.balls[0].vx = 0;
        fresh.balls[0].vy = 0;
        stateRef.current = fresh;
        setStatus('Table cleared! +100 — re-racked');
        sfx(820, 0.25);
      }
    }
    poolDraw(ctx, st, theme || '#0f172a');
  }, true);

  const start = () => {
    stateRef.current = poolRack();
    reset(0);
    setStatus('Drag from the cue ball to aim, release to shoot');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Drag toward a target and release. Pot all 6 object balls. Cue ball costs 5." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={400}
          height={240}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="w-full max-w-[400px] mx-auto rounded-lg border border-[#2A3942] touch-none"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 41. Tower Defense Lite
// ============================================================
const TD_PATH = [
  { x: -20, y: 70 }, { x: 110, y: 70 }, { x: 110, y: 190 },
  { x: 270, y: 190 }, { x: 270, y: 90 }, { x: 420, y: 90 },
];
function tdInit() {
  return {
    enemies: [],
    towers: [],
    gold: 60,
    lives: 3,
    wave: 0,
    spawn: 0,
    spawnLeft: 0,
    waveGap: 0,
    alive: true,
    kills: 0,
  };
}
function tdDraw(ctx, st, theme) {
  const W = 400;
  const H = 300;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#33454f';
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  TD_PATH.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
  ctx.stroke();
  ctx.lineCap = 'butt';
  st.towers.forEach((tw) => {
    ctx.fillStyle = 'rgba(34,211,238,0.12)';
    ctx.beginPath(); ctx.arc(tw.x, tw.y, 70, 0, TAU); ctx.fill();
    ctx.fillStyle = theme || '#22c55e';
    ctx.fillRect(tw.x - 9, tw.y - 9, 18, 18);
    ctx.fillStyle = '#0B141A';
    ctx.fillRect(tw.x - 4, tw.y - 4, 8, 8);
  });
  st.enemies.forEach((en) => {
    ctx.fillStyle = en.hp > 1 ? '#f43f5e' : '#facc15';
    ctx.beginPath(); ctx.arc(en.x, en.y, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0B141A';
    ctx.fillRect(en.x - 9, en.y - 14, 18, 3);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(en.x - 9, en.y - 14, (18 * en.hp) / en.maxHp, 3);
  });
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px monospace';
  ctx.fillText('GOLD ' + st.gold + ' · LIVES ' + st.lives + ' · WAVE ' + st.wave, 10, 18);
}

export function TowerDefense({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(tdInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const place = (e) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!playing || !canvas || st.gold < 20) return;
    const p = canvasPoint(e, canvas);
    st.towers.push({ x: p.x, y: p.y, cd: 0 });
    st.gold -= 20;
    sfx(500, 0.06);
    setStatus('Tower built (-20 gold)');
  };

  useRafLoop((t) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (playing && st.alive) {
      if (!st.last) st.last = t;
      const dt = Math.min(40, t - st.last);
      st.last = t;
      const k = dt / 16.6;
      // waves
      if (st.spawnLeft <= 0 && st.enemies.length === 0) {
        st.waveGap -= dt;
        if (st.waveGap <= 0) {
          st.wave += 1;
          st.spawnLeft = 8 + st.wave * 2;
          st.spawn = 0;
          st.waveGap = 2200;
          setStatus('Wave ' + st.wave + ' incoming');
        }
      }
      if (st.spawnLeft > 0) {
        st.spawn -= dt;
        if (st.spawn <= 0) {
          st.spawn = 1100;
          st.spawnLeft -= 1;
          const hp = 2 + Math.floor(st.wave / 2);
          st.enemies.push({ x: TD_PATH[0].x, y: TD_PATH[0].y, seg: 1, hp, maxHp: hp, speed: 0.75 + st.wave * 0.04 });
        }
      }
      // enemies follow path
      st.enemies.forEach((en) => {
        const target = TD_PATH[en.seg];
        if (!target) return;
        const dx = target.x - en.x;
        const dy = target.y - en.y;
        const d = Math.hypot(dx, dy);
        const step = en.speed * k;
        if (d <= step) {
          en.x = target.x;
          en.y = target.y;
          en.seg += 1;
          if (en.seg >= TD_PATH.length) {
            en.reached = true;
          }
        } else {
          en.x += (dx / d) * step;
          en.y += (dy / d) * step;
        }
      });
      // towers shoot
      st.towers.forEach((tw) => {
        tw.cd -= dt;
        if (tw.cd > 0) return;
        let target = null;
        let bestD = 999;
        st.enemies.forEach((en) => {
          if (en.reached || en.hp <= 0) return;
          const d = Math.hypot(en.x - tw.x, en.y - tw.y);
          if (d < 70 && d < bestD) { bestD = d; target = en; }
        });
        if (target) {
          tw.cd = 620;
          target.hp -= 1;
          sfx(620, 0.03);
        }
      });
      // resolve
      st.enemies = st.enemies.filter((en) => {
        if (en.hp <= 0) {
          st.gold += 5;
          st.kills += 1;
          add(10);
          return false;
        }
        if (en.reached) {
          st.lives -= 1;
          sfx(180, 0.2, 'square');
          if (st.lives <= 0) {
            st.alive = false;
            setPlaying(false);
            setStatus('Base destroyed — ' + st.kills + ' kills');
          }
          return false;
        }
        return true;
      });
    }
    tdDraw(ctx, st, theme || '#22c55e');
  }, true);

  const start = () => {
    stateRef.current = tdInit();
    reset(0);
    setStatus('Click to build towers (20 gold each)');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Click anywhere to build a tower. Towers auto-fire at enemies in range." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={400}
          height={300}
          onPointerDown={place}
          className="w-full max-w-[400px] mx-auto rounded-lg border border-[#2A3942] touch-none cursor-crosshair"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 42. Grid Neon Tron
// ============================================================
const TRON_N = 32;
const TRON_CELL = 10;

function tronInit() {
  return {
    p: { x: 5, y: 16, dx: 1, dy: 0 },
    a: { x: 26, y: 16, dx: -1, dy: 0 },
    pt: new Set(),
    at: new Set(),
    alive: true,
    last: 0,
    tick: 70,
    over: false,
  };
}
function tronDraw(ctx, st, theme) {
  const S = TRON_N * TRON_CELL;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#0f1c26';
  ctx.lineWidth = 1;
  for (let i = 1; i < TRON_N; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * TRON_CELL, 0); ctx.lineTo(i * TRON_CELL, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * TRON_CELL); ctx.lineTo(S, i * TRON_CELL); ctx.stroke();
  }
  st.pt.forEach((key) => {
    const [x, y] = key.split(',').map(Number);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(x * TRON_CELL + 1, y * TRON_CELL + 1, TRON_CELL - 2, TRON_CELL - 2);
  });
  st.at.forEach((key) => {
    const [x, y] = key.split(',').map(Number);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(x * TRON_CELL + 1, y * TRON_CELL + 1, TRON_CELL - 2, TRON_CELL - 2);
  });
  ctx.fillStyle = '#a5f3fc';
  ctx.fillRect(st.p.x * TRON_CELL + 2, st.p.y * TRON_CELL + 2, TRON_CELL - 4, TRON_CELL - 4);
  ctx.fillStyle = '#fecdd3';
  ctx.fillRect(st.a.x * TRON_CELL + 2, st.a.y * TRON_CELL + 2, TRON_CELL - 4, TRON_CELL - 4);
}

export function Tron({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(tronInit());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  useKeys((e) => {
    const st = stateRef.current;
    if (!st.alive) return;
    const p = st.p;
    if (e.key === 'ArrowUp' && p.dy !== 1) { p.dx = 0; p.dy = -1; }
    if (e.key === 'ArrowDown' && p.dy !== -1) { p.dx = 0; p.dy = 1; }
    if (e.key === 'ArrowLeft' && p.dx !== 1) { p.dx = -1; p.dy = 0; }
    if (e.key === 'ArrowRight' && p.dx !== -1) { p.dx = 1; p.dy = 0; }
  }, playing);

  useRafLoop((t) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (playing && st.alive) {
      if (!st.last) st.last = t;
      if (t - st.last >= st.tick) {
        st.last = t;
        st.pt.add(st.p.x + ',' + st.p.y);
        st.at.add(st.a.x + ',' + st.a.y);
        const np = { x: st.p.x + st.p.dx, y: st.p.y + st.p.dy };
        // AI chooses a safe direction
        const dirs = [
          { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
        ].filter((d) => !(d.dx === -st.a.dx && d.dy === -st.a.dy));
        const safe = dirs.filter((d) => {
          const nx = st.a.x + d.dx;
          const ny = st.a.y + d.dy;
          if (nx < 0 || ny < 0 || nx >= TRON_N || ny >= TRON_N) return false;
          const key = nx + ',' + ny;
          return !st.pt.has(key) && !st.at.has(key) && !(np.x === nx && np.y === ny);
        });
        let chosen = null;
        if (safe.length) {
          safe.sort((A, B) => {
            const da = Math.hypot(st.a.x + A.dx - np.x, st.a.y + A.dy - np.y);
            const db = Math.hypot(st.a.x + B.dx - np.x, st.a.y + B.dy - np.y);
            return db - da;
          });
          chosen = safe[0];
        }
        const na = chosen ? { x: st.a.x + chosen.dx, y: st.a.y + chosen.dy, dx: chosen.dx, dy: chosen.dy } : { x: st.a.x, y: st.a.y, dx: st.a.dx, dy: st.a.dy };
        const pDead = np.x < 0 || np.y < 0 || np.x >= TRON_N || np.y >= TRON_N || st.pt.has(np.x + ',' + np.y) || st.at.has(np.x + ',' + np.y);
        const aDead = !chosen || na.x < 0 || na.y < 0 || na.x >= TRON_N || na.y >= TRON_N || st.pt.has(na.x + ',' + na.y) || st.at.has(na.x + ',' + na.y);
        if (pDead) {
          st.alive = false;
          setPlaying(false);
          setStatus('You crashed — ' + score + ' points');
          sfx(150, 0.3, 'square');
        } else if (aDead) {
          add(100);
          sfx(760, 0.15);
          const free = [];
          for (let y = 1; y < TRON_N - 1; y += 1) {
            for (let x = 1; x < TRON_N - 1; x += 1) {
              const key = x + ',' + y;
              if (!st.pt.has(key) && !st.at.has(key)) free.push({ x, y });
            }
          }
          const spot = free.length ? pick(free) : { x: 16, y: 16 };
          st.a = { x: spot.x, y: spot.y, dx: pick([-1, 1]), dy: 0 };
          st.at = new Set();
          setStatus('AI crashed! +100');
        } else {
          st.p = { x: np.x, y: np.y, dx: st.p.dx, dy: st.p.dy };
          st.a = na;
          add(1);
        }
      }
    }
    tronDraw(ctx, st, theme || '#0ea5e9');
  }, true);

  const start = () => {
    stateRef.current = tronInit();
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Arrow keys steer. Cut off the red cycle without hitting a trail." accent={theme}>
      <Pad>
        <canvas ref={canvasRef} width={320} height={320} className="w-full max-w-[320px] mx-auto rounded-lg border border-[#2A3942] touch-none" />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 46. Coin Dozer Arcade
// ============================================================
function cdInit2() {
  return {
    coins: Array.from({ length: 18 }, () => ({
      x: randInt(60, 240),
      y: randInt(190, 340),
      vy: 0,
      r: 8,
    })),
    phase: 0,
    prevFront: 0,
    alive: true,
    dropped: 0,
  };
}
function cdDraw2(ctx, st, theme) {
  const W = 300;
  const H = 400;
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(20, 30, 260, 360);
  const front = 120 + Math.sin(st.phase) * 26 + 42;
  ctx.fillStyle = '#475569';
  ctx.fillRect(34, 44, 232, front - 44);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(34, front - 6, 232, 6);
  st.coins.forEach((c) => {
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  ctx.fillStyle = '#0B141A';
  ctx.fillRect(40, 384, 220, 8);
  ctx.fillStyle = theme || '#fbbf24';
  ctx.font = '11px monospace';
  ctx.fillText('DROPS ' + st.dropped, 28, 24);
}

export function CoinDozer({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(cdInit2());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

  const drop = (e) => {
    const st = stateRef.current;
    const canvas = canvasRef.current;
    if (!playing || !canvas) return;
    const p = canvasPoint(e, canvas);
    st.coins.push({ x: clamp(p.x, 55, 245), y: 70, vy: 2.4, r: 8 });
    st.dropped += 1;
    sfx(480, 0.05);
    setStatus('Coin dropped');
  };

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
      st.phase += 0.035 * k;
      const front = 120 + Math.sin(st.phase) * 26 + 42;
      const delta = Math.max(0, front - st.prevFront);
      st.prevFront = front;
      st.coins.forEach((c) => {
        c.vy = Math.min(6, c.vy + 0.22 * k);
        c.y += c.vy * k;
        if (c.y < front && c.y > front - 46 && c.x > 40 && c.x < 260) {
          c.y += delta;
        }
        if (c.y > 392) {
          c.y = 392;
          c.vy = 0;
        }
      });
      // simple separation so coins pile naturally
      for (let i = 0; i < st.coins.length; i += 1) {
        for (let j = i + 1; j < st.coins.length; j += 1) {
          const a = st.coins[i];
          const b = st.coins[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d > 0 && d < a.r + b.r) {
            const push = (a.r + b.r - d) / 2;
            a.x -= (dx / d) * push;
            a.y -= (dy / d) * push;
            b.x += (dx / d) * push;
            b.y += (dy / d) * push;
          }
        }
      }
      const kept = [];
      st.coins.forEach((c) => {
        if (c.y >= 390 && c.vy > 0.5) {
          add(5);
          sfx(720, 0.05);
          setStatus('Coin pushed out! +5');
        } else {
          kept.push(c);
        }
      });
      st.coins = kept;
      if (st.coins.length > 60) st.coins = st.coins.slice(-60);
    }
    cdDraw2(ctx, st, theme || '#fbbf24');
  }, true);

  const start = () => {
    stateRef.current = cdInit2();
    reset(0);
    setStatus('Drop coins and let the pusher work');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="Click to drop coins. The moving pusher shoves them off the edge for points." accent={theme}>
      <Pad>
        <canvas
          ref={canvasRef}
          width={300}
          height={400}
          onPointerDown={drop}
          className="w-full max-w-[280px] mx-auto rounded-lg border border-[#2A3942] touch-none"
        />
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 52. Dice Race
// ============================================================
function Die({ value }) {
  const dots = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  };
  const on = dots[value] || [];
  return (
    <div className="grid grid-cols-3 gap-1 w-12 h-12 bg-white rounded-lg p-1.5 shadow">
      {Array.from({ length: 9 }).map((_, i) => {
        const r = Math.floor(i / 3);
        const c = i % 3;
        const filled = on.some(([rr, cc]) => rr === r && cc === c);
        return <span key={i} className={'rounded-full ' + (filled ? 'bg-zinc-900' : 'bg-transparent')} />;
      })}
    </div>
  );
}

export function DiceRace({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const [player, setPlayer] = useState(0);
  const [ai, setAi] = useState(0);
  const [dice, setDice] = useState({ p: 1, a: 1 });
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState('Roll to move. First to 30 wins.');
  const [rolls, setRolls] = useState(0);

  const roll = () => {
    if (over) return;
    const dp = randInt(1, 6);
    const da = randInt(1, 6);
    setDice({ p: dp, a: da });
    setRolls((r) => r + 1);
    add(dp * 5);
    const np = player + dp;
    const na = ai + da;
    setPlayer(np);
    setAi(na);
    sfx(420, 0.06);
    if (np >= 30) {
      setOver(true);
      add(100);
      setStatus('You reached 30 first — race won! 🏆');
      sfx(820, 0.25);
    } else if (na >= 30) {
      setOver(true);
      setStatus('AI reached 30 first — try again');
      sfx(180, 0.25, 'square');
    } else {
      setStatus('You rolled ' + dp + ', AI rolled ' + da);
    }
  };

  const restart = () => {
    setPlayer(0);
    setAi(0);
    setDice({ p: 1, a: 1 });
    setOver(false);
    setRolls(0);
    setStatus('Roll to move. First to 30 wins.');
    reset(0);
  };

  return (
    <GameShell
      score={score}
      best={best}
      onStart={roll}
      startLabel={over ? 'Play again' : 'Roll dice'}
      running={false}
      onRestart={restart}
      status={status}
      hint="Each roll moves you and the AI. Highest progress when someone hits 30 wins."
      accent={theme}
    >
      <Pad>
        <div className="flex items-center justify-between mb-3">
          <div className="text-center">
            <div className="text-[10px] text-cyan-300 font-mono mb-1">YOU</div>
            <Die value={dice.p} />
          </div>
          <div className="text-center">
            <div className="text-[10px] text-zinc-400 font-mono mb-1">AI</div>
            <Die value={dice.a} />
          </div>
        </div>
        <div className="space-y-3">
          {[{ label: 'You', v: player, color: 'bg-cyan-400' }, { label: 'AI', v: ai, color: 'bg-rose-400' }].map((row) => (
            <div key={row.label}>
              <div className="flex justify-between text-[10px] font-mono text-zinc-400 mb-1">
                <span>{row.label}</span>
                <span>{Math.min(30, row.v)}/30</span>
              </div>
              <div className="h-2.5 rounded-full bg-[#22323b] overflow-hidden">
                <div className={'h-full ' + row.color + ' transition-all'} style={{ width: Math.min(100, (row.v / 30) * 100) + '%' }} />
              </div>
            </div>
          ))}
        </div>
        <div className="text-center text-[10px] text-zinc-500 mt-3 font-mono">Rolls: {rolls}</div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 53. Asteroids Classic
// ============================================================
const AS_W = 360;
const AS_H = 360;

function asInit() {
  return {
    ship: { x: 180, y: 180, a: -Math.PI / 2, vx: 0, vy: 0 },
    bullets: [],
    rocks: Array.from({ length: 6 }, () => ({
      x: randInt(30, 330),
      y: randInt(30, 330),
      r: randInt(14, 24),
      vx: randInt(-14, 14) / 10,
      vy: randInt(-14, 14) / 10,
      rot: Math.random() * TAU,
    })),
    lives: 3,
    invuln: 0,
    alive: true,
    cool: 0,
  };
}
function asDraw(ctx, st, theme) {
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, AS_W, AS_H);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  st.rocks.forEach((r) => {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.rot);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * TAU;
      const rr = r.r * (0.75 + ((i * 37) % 25) / 100);
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  });
  ctx.fillStyle = '#facc15';
  st.bullets.forEach((b) => {
    ctx.beginPath(); ctx.arc(b.x, b.y, 2, 0, TAU); ctx.fill();
  });
  if (st.invuln <= 0 || Math.floor(st.invuln / 6) % 2 === 0) {
    ctx.save();
    ctx.translate(st.ship.x, st.ship.y);
    ctx.rotate(st.ship.a);
    ctx.strokeStyle = theme || '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-9, -8);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 8);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#64748b';
  ctx.font = '11px monospace';
  ctx.fillText('LIVES ' + st.lives, 10, 18);
}

export function Asteroids({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const { score, add, reset } = useScore(onScore, 0);
  const canvasRef = useRef(null);
  const stateRef = useRef(asInit());
  const held = useHeldKeys();
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');

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
      const keys = held.current;
      if (keys.ArrowLeft) st.ship.a -= 0.075 * k;
      if (keys.ArrowRight) st.ship.a += 0.075 * k;
      if (keys.ArrowUp) {
        st.ship.vx += Math.cos(st.ship.a) * 0.14 * k;
        st.ship.vy += Math.sin(st.ship.a) * 0.14 * k;
      }
      st.ship.vx *= Math.pow(0.992, k);
      st.ship.vy *= Math.pow(0.992, k);
      st.ship.x = (st.ship.x + st.ship.vx * k + AS_W) % AS_W;
      st.ship.y = (st.ship.y + st.ship.vy * k + AS_H) % AS_H;
      if (st.cool > 0) st.cool -= dt;
      if (keys[' '] && st.cool <= 0) {
        st.cool = 190;
        st.bullets.push({
          x: st.ship.x + Math.cos(st.ship.a) * 14,
          y: st.ship.y + Math.sin(st.ship.a) * 14,
          vx: Math.cos(st.ship.a) * 7,
          vy: Math.sin(st.ship.a) * 7,
          life: 55,
        });
        sfx(680, 0.03);
      }
      st.bullets.forEach((b) => {
        b.x = (b.x + b.vx * k + AS_W) % AS_W;
        b.y = (b.y + b.vy * k + AS_H) % AS_H;
        b.life -= k;
      });
      st.bullets = st.bullets.filter((b) => b.life > 0);
      st.rocks.forEach((r) => {
        r.x = (r.x + r.vx * k + AS_W) % AS_W;
        r.y = (r.y + r.vy * k + AS_H) % AS_H;
        r.rot += 0.01 * k;
      });
      // bullet hits
      const newRocks = [];
      st.rocks.forEach((r) => {
        let hit = false;
        st.bullets.forEach((b) => {
          if (!hit && Math.hypot(b.x - r.x, b.y - r.y) < r.r + 3) {
            hit = true;
            b.life = 0;
            add(r.r > 18 ? 20 : 10);
            sfx(520, 0.05);
            if (r.r > 16) {
              for (let i = 0; i < 2; i += 1) {
                newRocks.push({
                  x: r.x,
                  y: r.y,
                  r: r.r * 0.55,
                  vx: r.vx + randInt(-10, 10) / 8,
                  vy: r.vy + randInt(-10, 10) / 8,
                  rot: Math.random() * TAU,
                });
              }
            }
          }
        });
        if (!hit) newRocks.push(r);
      });
      st.rocks = newRocks;
      if (st.invuln > 0) st.invuln -= k;
      // ship collision
      if (st.invuln <= 0) {
        const crash = st.rocks.find((r) => Math.hypot(st.ship.x - r.x, st.ship.y - r.y) < r.r + 9);
        if (crash) {
          st.lives -= 1;
          st.invuln = 110;
          st.ship = { x: 180, y: 180, a: -Math.PI / 2, vx: 0, vy: 0 };
          sfx(160, 0.3, 'square');
          if (st.lives <= 0) {
            st.alive = false;
            setPlaying(false);
            setStatus('Ship destroyed — ' + score + ' points');
          } else {
            setStatus(st.lives + ' lives left');
          }
        }
      }
      if (!st.rocks.length) {
        add(100);
        for (let i = 0; i < 6; i += 1) {
          st.rocks.push({
            x: randInt(30, 330), y: randInt(30, 330), r: randInt(14, 24),
            vx: randInt(-14, 14) / 10, vy: randInt(-14, 14) / 10, rot: Math.random() * TAU,
          });
        }
        setStatus('Field cleared! +100');
        sfx(820, 0.2);
      }
    }
    asDraw(ctx, st, theme || '#22c55e');
  }, true);

  const start = () => {
    stateRef.current = asInit();
    reset(0);
    setStatus('');
    setPlaying(true);
  };

  return (
    <GameShell score={score} best={best} onStart={start} running={playing} status={status} hint="← → rotate · ↑ thrust · Space shoots. Asteroids split when hit." accent={theme}>
      <Pad>
        <canvas ref={canvasRef} width={360} height={360} className="w-full max-w-[340px] mx-auto rounded-lg border border-[#2A3942] touch-none" />
      </Pad>
    </GameShell>
  );
}



