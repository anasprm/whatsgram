'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GameShell, GameButton, Pad, clamp, pick, randInt, shuffle, useKeys, useSfx } from './shared';

// ============================================================
// 1. Tic-Tac-Toe Classic — vs unbeatable-ish AI
// ============================================================
const TT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const ttWinner = (b) => {
  for (const [a, c, d] of TT_LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 'draw' : null;
};
function ttBest(b, me, depth) {
  const w = ttWinner(b);
  if (w === 'O') return { score: 10 - depth };
  if (w === 'X') return { score: depth - 10 };
  if (w === 'draw') return { score: 0 };
  let best = null;
  for (let i = 0; i < 9; i += 1) {
    if (b[i]) continue;
    const next = b.slice();
    next[i] = me;
    const res = ttBest(next, me === 'O' ? 'X' : 'O', depth + 1);
    if (!best || (me === 'O' ? res.score > best.score : res.score < best.score)) {
      best = { score: res.score, move: i };
    }
  }
  return best;
}

export function TicTacToe({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [board, setBoard] = useState(Array(9).fill(null));
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const play = (i) => {
    if (board[i] || ttWinner(board) || busy) return;
    const next = board.slice();
    next[i] = 'X';
    sfx(520);
    let w = ttWinner(next);
    if (!w) {
      setBusy(true);
      const ai = ttBest(next, 'O', 0);
      if (ai && ai.move !== undefined) next[ai.move] = 'O';
      w = ttWinner(next);
    }
    setBoard(next);
    setBusy(false);
    if (w === 'X') {
      setScore((s) => {
        const v = s + 10;
        onScore(v);
        return v;
      });
      setStatus('You win! 🎉');
      sfx(760, 0.2);
    } else if (w === 'O') {
      setStatus('AI wins — try again');
      sfx(200, 0.25, 'square');
    } else if (w === 'draw') {
      setScore((s) => {
        const v = s + 3;
        onScore(v);
        return v;
      });
      setStatus('Draw');
    } else {
      setStatus('');
    }
  };

  const restart = () => {
    setBoard(Array(9).fill(null));
    setStatus('');
    setBusy(false);
  };

  return (
    <GameShell score={score} best={best} onRestart={restart} status={status} hint="You are X. Beat the AI." accent={theme}>
      <Pad>
        <div className="grid grid-cols-3 gap-1.5 w-48 mx-auto">
          {board.map((cell, i) => (
            <button
              key={i}
              type="button"
              onClick={() => play(i)}
              className="aspect-square rounded-lg bg-[#2A3942] border border-[#3A4952] text-2xl font-bold text-white hover:bg-[#3A4952] transition"
            >
              <span className={cell === 'X' ? 'text-cyan-400' : 'text-rose-400'}>{cell}</span>
            </button>
          ))}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 40. Tic-Tac-Toe Ultimate — 4x4, four in a row
// ============================================================
const ULT_LINES = (() => {
  const lines = [];
  for (let r = 0; r < 4; r += 1) for (let c = 0; c <= 0; c += 1) {
    lines.push([r * 4 + 0, r * 4 + 1, r * 4 + 2, r * 4 + 3]);
    lines.push([c * 4 + r, (c + 1) * 4 + r, (c + 2) * 4 + r, (c + 3) * 4 + r]);
  }
  lines.push([0, 5, 10, 15]);
  lines.push([3, 6, 9, 12]);
  return lines;
})();
const ultWinner = (b) => {
  for (const line of ULT_LINES) if (line.every((i) => b[i] === 'X')) return 'X';
  for (const line of ULT_LINES) if (line.every((i) => b[i] === 'O')) return 'O';
  return b.every(Boolean) ? 'draw' : null;
};

export function TicTacToeUltimate({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [board, setBoard] = useState(Array(16).fill(null));
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('');

  const finish = (w) => {
    if (w === 'X') {
      setScore((s) => {
        const v = s + 25;
        onScore(v);
        return v;
      });
      setStatus('Four in a row — you win!');
      sfx(800, 0.2);
    } else if (w === 'O') {
      setStatus('AI got four in a row');
      sfx(180, 0.25, 'square');
    } else if (w === 'draw') {
      setStatus('Board full — draw');
    }
  };

  const play = (i) => {
    if (board[i] || ultWinner(board)) return;
    const next = board.slice();
    next[i] = 'X';
    sfx(520);
    let w = ultWinner(next);
    if (!w) {
      // AI: block a winning line, otherwise take the centre-ish square
      let move = -1;
      for (let k = 0; k < 16; k += 1) {
        if (next[k]) continue;
        const probe = next.slice();
        probe[k] = 'X';
        if (ultWinner(probe) === 'X') { move = k; break; }
      }
      if (move === -1) {
        for (let k = 0; k < 16; k += 1) {
          if (next[k]) continue;
          const probe = next.slice();
          probe[k] = 'O';
          if (ultWinner(probe) === 'O') { move = k; break; }
        }
      }
      if (move === -1) {
        const empty = next.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0);
        const centre = [5, 6, 9, 10].filter((k) => empty.includes(k));
        move = centre.length ? pick(centre) : pick(empty);
      }
      if (move >= 0) next[move] = 'O';
      w = ultWinner(next);
    }
    setBoard(next);
    finish(w);
  };

  return (
    <GameShell
      score={score}
      best={best}
      onRestart={() => { setBoard(Array(16).fill(null)); setStatus(''); }}
      status={status}
      hint="4×4 board. Line up four X's before the AI does."
      accent={theme}
    >
      <Pad>
        <div className="grid grid-cols-4 gap-1.5 w-56 mx-auto">
          {board.map((cell, i) => (
            <button
              key={i}
              type="button"
              onClick={() => play(i)}
              className="aspect-square rounded-lg bg-[#2A3942] border border-[#3A4952] text-lg font-bold hover:bg-[#3A4952] transition"
            >
              <span className={cell === 'X' ? 'text-cyan-400' : 'text-rose-400'}>{cell}</span>
            </button>
          ))}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 16. Connect Four — real win detection + AI
// ============================================================
const C4_ROWS = 6;
const C4_COLS = 7;
const c4Empty = () => Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(null));
function c4Drop(board, col, who) {
  for (let r = C4_ROWS - 1; r >= 0; r -= 1) {
    if (!board[r][col]) {
      const next = board.map((row) => [...row]);
      next[r][col] = who;
      return next;
    }
  }
  return null;
}
function c4Winner(board) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < C4_ROWS; r += 1) {
    for (let c = 0; c < C4_COLS; c += 1) {
      const who = board[r][c];
      if (!who) continue;
      for (const [dr, dc] of dirs) {
        let n = 1;
        while (n < 4) {
          const rr = r + dr * n;
          const cc = c + dc * n;
          if (rr < 0 || rr >= C4_ROWS || cc < 0 || cc >= C4_COLS || board[rr][cc] !== who) break;
          n += 1;
        }
        if (n === 4) return who;
      }
    }
  }
  return board[0].every(Boolean) ? 'draw' : null;
}

export function Connect4({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [board, setBoard] = useState(c4Empty);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('');

  const finish = (w) => {
    if (w === 'R') {
      setScore((s) => {
        const v = s + 20;
        onScore(v);
        return v;
      });
      setStatus('You connected four! 🎉');
      sfx(780, 0.2);
    } else if (w === 'Y') {
      setStatus('AI connected four');
      sfx(190, 0.25, 'square');
    } else if (w === 'draw') {
      setStatus('Draw — board full');
    }
  };

  const drop = (col) => {
    if (c4Winner(board)) return;
    const afterPlayer = c4Drop(board, col, 'R');
    if (!afterPlayer) return;
    sfx(430);
    let w = c4Winner(afterPlayer);
    if (!w) {
      let move = -1;
      for (let c = 0; c < C4_COLS; c += 1) {
        const probe = c4Drop(afterPlayer, c, 'Y');
        if (probe && c4Winner(probe) === 'Y') { move = c; break; }
      }
      if (move === -1) {
        for (let c = 0; c < C4_COLS; c += 1) {
          const probe = c4Drop(afterPlayer, c, 'R');
          if (probe && c4Winner(probe) === 'R') { move = c; break; }
        }
      }
      if (move === -1) {
        const options = [3, 2, 4, 1, 5, 0, 6].filter((c) => afterPlayer[0][c] === null);
        move = options.length ? options[0] : -1;
      }
      const afterAi = move >= 0 ? c4Drop(afterPlayer, move, 'Y') : null;
      if (afterAi) {
        setBoard(afterAi);
        w = c4Winner(afterAi);
        finish(w);
        return;
      }
    }
    setBoard(afterPlayer);
    finish(w);
  };

  return (
    <GameShell
      score={score}
      best={best}
      onRestart={() => { setBoard(c4Empty()); setStatus(''); }}
      status={status}
      hint="Drop red discs. Four in a row (any direction) wins."
      accent={theme}
    >
      <Pad>
        <div className="grid grid-cols-7 gap-1 mb-1.5">
          {Array.from({ length: 7 }).map((_, c) => (
            <button
              key={c}
              type="button"
              onClick={() => drop(c)}
              className="h-7 rounded-t-lg bg-[#2A3942] hover:bg-[#3A4952] text-[10px] text-zinc-400 font-mono transition"
            >
              ▼
            </button>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {board.map((row, r) =>
            row.map((cell, c) => (
              <div
                key={r + '-' + c}
                className="aspect-square rounded-full border border-[#3A4952] bg-[#0B141A] flex items-center justify-center"
              >
                {cell ? (
                  <span
                    className={
                      'w-[78%] h-[78%] rounded-full ' +
                      (cell === 'R' ? 'bg-rose-500' : 'bg-amber-400')
                    }
                  />
                ) : null}
              </div>
            )),
          )}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 15. Checkers Pro — real moves, jumps, kings, AI
// ============================================================
const ckStart = () => {
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 8; c += 1) if ((r + c) % 2 === 1) b[r][c] = 'b';
  }
  for (let r = 5; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) if ((r + c) % 2 === 1) b[r][c] = 'r';
  }
  return b;
};
function ckMoves(b, who) {
  const out = [];
  const dirs = who === 'r' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
  const kingDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const p = b[r][c];
      if (!p || p.toLowerCase() !== who) continue;
      const ds = p === p.toUpperCase() ? kingDirs : dirs;
      for (const [dr, dc] of ds) {
        const r1 = r + dr;
        const c1 = c + dc;
        if (r1 < 0 || r1 > 7 || c1 < 0 || c1 > 7) continue;
        if (!b[r1][c1]) out.push({ from: [r, c], to: [r1, c1], jump: false });
        else if (b[r1][c1].toLowerCase() !== who) {
          const r2 = r + dr * 2;
          const c2 = c + dc * 2;
          if (r2 >= 0 && r2 <= 7 && c2 >= 0 && c2 <= 7 && !b[r2][c2]) {
            out.push({ from: [r, c], to: [r2, c2], jump: true, over: [r1, c1] });
          }
        }
      }
    }
  }
  const jumps = out.filter((m) => m.jump);
  return jumps.length ? jumps : out;
}
function ckApply(b, mv) {
  const next = b.map((row) => [...row]);
  const piece = next[mv.from[0]][mv.from[1]];
  next[mv.from[0]][mv.from[1]] = null;
  if (mv.over) next[mv.over[0]][mv.over[1]] = null;
  let moved = piece;
  if (piece === 'r' && mv.to[0] === 0) moved = 'R';
  if (piece === 'b' && mv.to[0] === 7) moved = 'B';
  next[mv.to[0]][mv.to[1]] = moved;
  return next;
}

export function Checkers({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [board, setBoard] = useState(ckStart);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('Your turn');

  const moves = useMemo(() => (selected ? ckMoves(board, 'r').filter((m) => m.from[0] === selected[0] && m.from[1] === selected[1]) : []), [board, selected]);

  const click = (r, c) => {
    if (status !== 'Your turn') return;
    const target = moves.find((m) => m.to[0] === r && m.to[1] === c);
    if (!target) {
      const p = board[r][c];
      if (p && p.toLowerCase() === 'r') setSelected([r, c]);
      return;
    }
    let next = ckApply(board, target);
    let gained = target.jump ? 15 : 0;
    sfx(target.jump ? 660 : 420);
    setSelected(null);
    setBoard(next);
    setStatus('AI thinking…');

    setTimeout(() => {
      const aiMoves = ckMoves(next, 'b');
      if (!aiMoves.length) {
        setScore((s) => {
          const v = s + 60 + gained;
          onScore(v);
          return v;
        });
        setStatus('You win — AI has no moves! 🏆');
        sfx(820, 0.25);
        return;
      }
      const bestMove = aiMoves.slice().sort((a, b) => (b.jump ? 1 : 0) - (a.jump ? 1 : 0))[0];
      next = ckApply(next, bestMove);
      setBoard(next);
      const playerMoves = ckMoves(next, 'r');
      if (!playerMoves.length) {
        setStatus('AI wins — no moves left');
        sfx(180, 0.25, 'square');
        return;
      }
      if (gained) {
        setScore((s) => {
          const v = s + gained;
          onScore(v);
          return v;
        });
        gained = 0;
      }
      setStatus('Your turn');
    }, 450);
  };

  return (
    <GameShell
      score={score}
      best={best}
      onRestart={() => { setBoard(ckStart()); setSelected(null); setStatus('Your turn'); }}
      status={status}
      hint="Click a red piece, then a highlighted square. Jumps are forced."
      accent={theme}
    >
      <Pad>
        <div className="grid grid-cols-8 gap-0 w-64 mx-auto border border-[#3A4952]">
          {board.map((row, r) =>
            row.map((cell, c) => {
              const dark = (r + c) % 2 === 1;
              const isSel = selected && selected[0] === r && selected[1] === c;
              const isTarget = moves.some((m) => m.to[0] === r && m.to[1] === c);
              return (
                <button
                  key={r + '-' + c}
                  type="button"
                  onClick={() => click(r, c)}
                  className={
                    'aspect-square flex items-center justify-center ' +
                    (dark ? 'bg-[#2A3942]' : 'bg-[#1F2C34]') +
                    (isSel ? ' ring-2 ring-cyan-400 ring-inset' : '') +
                    (isTarget ? ' ring-2 ring-emerald-400 ring-inset' : '')
                  }
                >
                  {cell ? (
                    <span
                      className={
                        'w-[68%] h-[68%] rounded-full border ' +
                        (cell.toLowerCase() === 'r'
                          ? 'bg-rose-500 border-rose-300'
                          : 'bg-zinc-900 border-zinc-500') +
                        (cell === cell.toUpperCase() ? ' shadow-[0_0_0_2px_#fbbf24]' : '')
                      }
                    />
                  ) : null}
                </button>
              );
            }),
          )}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 14. Chess Blitz — real piece movement, random-legal AI
// ============================================================
const CH_START = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR'.split('');
const CH_VALUE = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 1000 };
const CH_GLYPH = {
  p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
  P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔',
};
function chMoves(board, from, white) {
  const p = board[from];
  if (!p || p === '.') return [];
  if ((p === p.toUpperCase()) !== white) return [];
  const r0 = Math.floor(from / 8);
  const c0 = from % 8;
  const out = [];
  const add = (r, c) => {
    if (r < 0 || r > 7 || c < 0 || c > 7) return false;
    const t = board[r * 8 + c];
    if (t === '.') { out.push(r * 8 + c); return true; }
    if ((t === t.toUpperCase()) !== white) out.push(r * 8 + c);
    return false;
  };
  const type = p.toUpperCase();
  if (type === 'P') {
    const dir = white ? -1 : 1;
    if (r0 + dir >= 0 && r0 + dir < 8 && board[(r0 + dir) * 8 + c0] === '.') {
      out.push((r0 + dir) * 8 + c0);
      const home = white ? 6 : 1;
      if (r0 === home && board[(r0 + dir * 2) * 8 + c0] === '.') out.push((r0 + dir * 2) * 8 + c0);
    }
    for (const dc of [-1, 1]) {
      const r = r0 + dir;
      const c = c0 + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const t = board[r * 8 + c];
        if (t !== '.' && (t === t.toUpperCase()) !== white) out.push(r * 8 + c);
      }
    }
  } else if (type === 'N') {
    [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => add(r0 + dr, c0 + dc));
  } else if (type === 'B' || type === 'R' || type === 'Q') {
    const dirs = type === 'B'
      ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
      : type === 'R'
        ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
        : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
    dirs.forEach(([dr, dc]) => {
      let r = r0 + dr;
      let c = c0 + dc;
      while (add(r, c)) { r += dr; c += dc; }
    });
  } else if (type === 'K') {
    [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => add(r0 + dr, c0 + dc));
  }
  return out;
}
function chAllMoves(board, white) {
  const out = [];
  for (let i = 0; i < 64; i += 1) {
    const p = board[i];
    if (!p || p === '.') continue;
    if ((p === p.toUpperCase()) !== white) continue;
    chMoves(board, i, white).forEach((to) => out.push({ from: i, to }));
  }
  return out;
}

export function Chess({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [board, setBoard] = useState(CH_START);
  const [sel, setSel] = useState(null);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('Your move (white)');

  const legal = useMemo(() => (sel === null ? [] : chMoves(board, sel, true)), [board, sel]);

  const click = (i) => {
    if (status.startsWith('Checkmate') || status.startsWith('Stalemate')) return;
    if (sel !== null && legal.includes(i)) {
      const next = board.slice();
      const captured = next[i];
      next[i] = next[sel];
      next[sel] = '.';
      let gain = 0;
      if (captured !== '.' && captured) gain = CH_VALUE[captured.toLowerCase()] || 0;
      setSel(null);
      sfx(gain ? 620 : 400);

      const kingMissing = !next.includes('k');
      if (kingMissing) {
        const v = score + 300 + gain;
        setScore(v);
        onScore(v);
        setBoard(next);
        setStatus('Checkmate — you win! 🏆');
        sfx(840, 0.3);
        return;
      }

      setBoard(next);
      setStatus('AI thinking…');
      setTimeout(() => {
        const aiMoves = chAllMoves(next, false);
        if (!aiMoves.length) {
          const v = score + gain + 120;
          setScore(v);
          onScore(v);
          setStatus('Checkmate — you win! 🏆');
          return;
        }
        const scored = aiMoves.map((m) => {
          const t = next[m.to];
          return { ...m, v: t !== '.' ? CH_VALUE[t.toLowerCase()] || 0 : 0 };
        });
        scored.sort((a, b) => b.v - a.v);
        const chosen = scored[0].v > 0 ? scored[0] : pick(scored);
        const after = next.slice();
        const taken = after[chosen.to];
        after[chosen.to] = after[chosen.from];
        after[chosen.from] = '.';
        const playerKing = !after.includes('K');
        const v = score + gain;
        if (v > score) {
          setScore(v);
          onScore(v);
        }
        setBoard(after);
        setStatus(playerKing ? 'AI captured your king — game over' : 'Your move (white)');
        if (taken !== '.') sfx(220, 0.12, 'square');
      }, 420);
      return;
    }
    const p = board[i];
    if (p && p !== '.' && p === p.toUpperCase()) setSel(i);
    else setSel(null);
  };

  return (
    <GameShell
      score={score}
      best={best}
      onRestart={() => { setBoard(CH_START); setSel(null); setStatus('Your move (white)'); }}
      status={status}
      hint="Standard piece movement. Capture pieces to score — take the king to win."
      accent={theme}
    >
      <Pad>
        <div className="grid grid-cols-8 w-72 mx-auto border border-[#3A4952]">
          {board.map((cell, i) => {
            const r = Math.floor(i / 8);
            const c = i % 8;
            const dark = (r + c) % 2 === 1;
            const isSel = sel === i;
            const isTarget = legal.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => click(i)}
                className={
                  'aspect-square flex items-center justify-center text-lg leading-none ' +
                  (dark ? 'bg-[#2A3942]' : 'bg-[#33454f]') +
                  (isSel ? ' ring-2 ring-cyan-400 ring-inset' : '') +
                  (isTarget ? ' ring-2 ring-emerald-400 ring-inset' : '')
                }
              >
                <span className={cell !== '.' && cell === cell.toUpperCase() ? 'text-white' : 'text-zinc-900'}>
                  {cell !== '.' ? CH_GLYPH[cell] : ''}
                </span>
              </button>
            );
          })}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 2. Battleship Tactical
// ============================================================
const BS_SIZE = 8;
const BS_SHIPS = [4, 3, 3, 2];
function bsPlace() {
  const grid = Array.from({ length: BS_SIZE }, () => Array(BS_SIZE).fill(null));
  BS_SHIPS.forEach((size, id) => {
    let placed = false;
    let guard = 0;
    while (!placed && guard < 500) {
      guard += 1;
      const horizontal = Math.random() > 0.5;
      const r = randInt(0, BS_SIZE - (horizontal ? 1 : size));
      const c = randInt(0, BS_SIZE - (horizontal ? size : 1));
      let ok = true;
      for (let k = 0; k < size; k += 1) {
        const rr = r + (horizontal ? 0 : k);
        const cc = c + (horizontal ? k : 0);
        if (grid[rr][cc] !== null) { ok = false; break; }
      }
      if (!ok) continue;
      for (let k = 0; k < size; k += 1) {
        const rr = r + (horizontal ? 0 : k);
        const cc = c + (horizontal ? k : 0);
        grid[rr][cc] = { ship: id, hit: false };
      }
      placed = true;
    }
  });
  return grid;
}

export function Battleship({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [enemy, setEnemy] = useState(bsPlace);
  const [shots, setShots] = useState(Array.from({ length: BS_SIZE }, () => Array(BS_SIZE).fill(null)));
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('Fire at the enemy grid');

  const remaining = enemy.flat().filter((c) => c && !c.hit).length;
  const won = remaining === 0;

  const fire = (r, c) => {
    if (shots[r][c] || won) return;
    const nextEnemy = enemy.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
    const nextShots = shots.map((row) => [...row]);
    const target = nextEnemy[r][c];
    if (target) {
      target.hit = true;
      nextShots[r][c] = 'hit';
      sfx(660, 0.12);
      setScore((s) => {
        const v = s + 20;
        onScore(v);
        return v;
      });
    } else {
      nextShots[r][c] = 'miss';
      sfx(240, 0.08, 'square');
    }
    setEnemy(nextEnemy);
    setShots(nextShots);

    const left = nextEnemy.flat().filter((cell) => cell && !cell.hit).length;
    if (left === 0) {
      setScore((s) => {
        const v = s + 150;
        onScore(v);
        return v;
      });
      setStatus('Fleet destroyed — victory! 🏆');
      sfx(820, 0.3);
    } else {
      setStatus(left + ' ship sections left');
    }
  };

  return (
    <GameShell
      score={score}
      best={best}
      onRestart={() => { setEnemy(bsPlace()); setShots(Array.from({ length: BS_SIZE }, () => Array(BS_SIZE).fill(null))); setStatus('Fire at the enemy grid'); }}
      status={status}
      hint="Ships: 4, 3, 3, 2. Hit every section to sink the fleet."
      accent={theme}
    >
      <Pad>
        <div className="grid grid-cols-8 gap-0.5 w-full max-w-sm mx-auto">
          {shots.map((row, r) =>
            row.map((cell, c) => (
              <button
                key={r + '-' + c}
                type="button"
                onClick={() => fire(r, c)}
                className={
                  'aspect-square rounded text-[10px] font-bold ' +
                  (cell === 'hit'
                    ? 'bg-rose-500 text-white'
                    : cell === 'miss'
                      ? 'bg-[#33454f] text-zinc-500'
                      : 'bg-[#2A3942] hover:bg-[#3A4952] text-transparent')
                }
              >
                {cell === 'hit' ? '✕' : cell === 'miss' ? '•' : ''}
              </button>
            )),
          )}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 6. Memory Card Match
// ============================================================
const MM_SYMBOLS = ['🍎', '🍌', '🍇', '🍊', '🍓', '🍉', '🍍', '🥝'];

export function MemoryMatch({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [deck, setDeck] = useState(() => shuffle([...MM_SYMBOLS, ...MM_SYMBOLS]).map((sym, i) => ({ id: i, sym })));
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('');

  const done = matched.length === deck.length && deck.length > 0;

  const flip = (id) => {
    if (done || flipped.length >= 2 || flipped.includes(id) || matched.includes(id)) return;
    const next = [...flipped, id];
    setFlipped(next);
    sfx(480, 0.05);
    if (next.length === 2) {
      const [a, b] = next;
      if (deck[a].sym === deck[b].sym) {
        setTimeout(() => {
          setMatched((m) => {
            const nm = [...m, a, b];
            if (nm.length === deck.length) {
              setScore((s) => {
                const v = s + 100;
                onScore(v);
                return v;
              });
              setStatus('Board cleared! 🎉');
              sfx(820, 0.25);
            }
            return nm;
          });
          setFlipped([]);
        }, 260);
      } else {
        setTimeout(() => setFlipped([]), 750);
      }
    }
  };

  const restart = () => {
    setDeck(shuffle([...MM_SYMBOLS, ...MM_SYMBOLS]).map((sym, i) => ({ id: i, sym })));
    setFlipped([]);
    setMatched([]);
    setStatus('');
  };

  return (
    <GameShell score={score} best={best} onRestart={restart} status={status} hint="Find all 8 pairs." accent={theme}>
      <Pad>
        <div className="grid grid-cols-4 gap-1.5">
          {deck.map((card, i) => {
            const open = matched.includes(i) || flipped.includes(i);
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => flip(i)}
                className={
                  'aspect-square rounded-lg border flex items-center justify-center text-xl transition ' +
                  (matched.includes(i)
                    ? 'bg-emerald-500/25 border-emerald-500'
                    : open
                      ? 'bg-[#3A4952] border-cyan-500/60'
                      : 'bg-[#2A3942] border-[#3A4952] hover:bg-[#3A4952]')
                }
              >
                {open ? card.sym : ''}
              </button>
            );
          })}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 13 / 51. Minesweeper (two difficulties)
// ============================================================
function msBuild(size, mines) {
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => ({ mine: false, open: false, flag: false, count: 0 })));
  let placed = 0;
  while (placed < mines) {
    const r = randInt(0, size - 1);
    const c = randInt(0, size - 1);
    if (!grid[r][c].mine) {
      grid[r][c].mine = true;
      placed += 1;
    }
  }
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (!dr && !dc) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < size && cc >= 0 && cc < size && grid[rr][cc].mine) n += 1;
        }
      }
      grid[r][c].count = n;
    }
  }
  return grid;
}
function msOpen(grid, r, c, size) {
  const next = grid.map((row) => row.map((cell) => ({ ...cell })));
  const stack = [[r, c]];
  while (stack.length) {
    const [rr, cc] = stack.pop();
    if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
    const cell = next[rr][cc];
    if (cell.open || cell.flag) continue;
    cell.open = true;
    if (cell.count === 0 && !cell.mine) {
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr || dc) stack.push([rr + dr, cc + dc]);
        }
      }
    }
  }
  return next;
}

function MinesweeperBase({ size, mines, theme, sound, best, onScore, label }) {
  const sfx = useSfx(sound);
  const [grid, setGrid] = useState(() => msBuild(size, mines));
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('');
  const [dead, setDead] = useState(false);

  const openCount = grid.flat().filter((c) => c.open).length;
  const safeTotal = size * size - mines;

  const reveal = (r, c) => {
    if (dead || grid[r][c].open || grid[r][c].flag) return;
    if (grid[r][c].mine) {
      const blown = grid.map((row) => row.map((cell) => ({ ...cell, open: cell.mine ? true : cell.open })));
      setGrid(blown);
      setDead(true);
      setStatus('Boom — you hit a mine');
      sfx(160, 0.35, 'sawtooth');
      return;
    }
    const next = msOpen(grid, r, c, size);
    setGrid(next);
    const opened = next.flat().filter((cell) => cell.open).length;
    setScore((s) => {
      const v = Math.max(s, opened * 5);
      onScore(v);
      return v;
    });
    sfx(520, 0.05);
    if (opened === safeTotal) {
      setScore((s) => {
        const v = s + 150;
        onScore(v);
        return v;
      });
      setStatus('Cleared! 🏆');
      sfx(840, 0.3);
    }
  };

  const flag = (e, r, c) => {
    e.preventDefault();
    if (dead || grid[r][c].open) return;
    const next = grid.map((row) => row.map((cell) => ({ ...cell })));
    next[r][c].flag = !next[r][c].flag;
    setGrid(next);
  };

  return (
    <GameShell
      score={score}
      best={best}
      onRestart={() => { setGrid(msBuild(size, mines)); setStatus(''); setDead(false); }}
      status={status}
      hint={label + ' — click to reveal, right-click to flag.'}
      accent={theme}
    >
      <Pad>
        <div className="grid gap-0.5 mx-auto" style={{ gridTemplateColumns: 'repeat(' + size + ', minmax(0, 1fr))', maxWidth: size > 9 ? '22rem' : '18rem' }}>
          {grid.map((row, r) =>
            row.map((cell, c) => {
              const color = ['', 'text-cyan-300', 'text-emerald-300', 'text-amber-300', 'text-orange-400', 'text-rose-400', 'text-fuchsia-400', 'text-violet-300', 'text-red-300'][cell.count] || '';
              return (
                <button
                  key={r + '-' + c}
                  type="button"
                  onClick={() => reveal(r, c)}
                  onContextMenu={(e) => flag(e, r, c)}
                  className={
                    'aspect-square rounded-[3px] text-[10px] font-bold flex items-center justify-center ' +
                    (cell.open
                      ? cell.mine
                        ? 'bg-rose-600 text-white'
                        : 'bg-[#0B141A] border border-[#22323b] ' + color
                      : 'bg-[#2A3942] hover:bg-[#3A4952] text-zinc-300 border border-[#3A4952]')
                  }
                >
                  {cell.open ? (cell.mine ? '💥' : cell.count || '') : cell.flag ? '🚩' : ''}
                </button>
              );
            }),
          )}
        </div>
      </Pad>
    </GameShell>
  );
}

export function Minesweeper(props) {
  return <MinesweeperBase size={9} mines={10} label="9×9 · 10 mines" {...props} />;
}
export function MinesweeperHard(props) {
  return <MinesweeperBase size={12} mines={26} label="12×12 · 26 mines" {...props} />;
}

// ============================================================
// 7. 2048
// ============================================================
const g2048Empty = () => Array.from({ length: 4 }, () => Array(4).fill(0));
function addTile(board) {
  const empty = [];
  board.forEach((row, r) => row.forEach((v, c) => { if (!v) empty.push([r, c]); }));
  if (!empty.length) return board;
  const [r, c] = pick(empty);
  const next = board.map((row) => [...row]);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}
function slideRow(row) {
  const vals = row.filter(Boolean);
  const out = [];
  let gained = 0;
  for (let i = 0; i < vals.length; i += 1) {
    if (vals[i] === vals[i + 1]) {
      out.push(vals[i] * 2);
      gained += vals[i] * 2;
      i += 1;
    } else out.push(vals[i]);
  }
  while (out.length < 4) out.push(0);
  return { out, gained };
}
function move2048(board, dir) {
  let gained = 0;
  const rotate = (b) => b[0].map((_, c) => b.map((row) => row[c]));
  let b = board.map((row) => [...row]);
  const times = dir === 'left' ? 0 : dir === 'up' ? 1 : dir === 'right' ? 2 : 3;
  for (let i = 0; i < times; i += 1) b = rotate(b);
  b = b.map((row) => {
    const { out, gained: g } = slideRow(row);
    gained += g;
    return out;
  });
  for (let i = 0; i < (4 - times) % 4; i += 1) b = rotate(b);
  const changed = JSON.stringify(b) !== JSON.stringify(board);
  return { board: b, gained, changed };
}

export function Game2048({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [board, setBoard] = useState(() => addTile(addTile(g2048Empty())));
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('');

  const best2048 = Math.max(...board.flat());

  const move = useCallback((dir) => {
    setBoard((current) => {
      const res = move2048(current, dir);
      if (!res.changed) return current;
      const withTile = addTile(res.board);
      if (res.gained) {
        sfx(520 + Math.min(400, res.gained));
        setScore((s) => {
          const v = s + res.gained;
          onScore(v);
          return v;
        });
      }
      const top = Math.max(...withTile.flat());
      if (top >= 2048) {
        setStatus('2048 reached! Keep going 🏆');
        sfx(840, 0.3);
      }
      const stuck = ['left', 'right', 'up', 'down'].every((d) => !move2048(withTile, d).changed);
      if (stuck) {
        setStatus('No moves left — game over');
      }
      return withTile;
    });
  }, [onScore, sfx]);

  useKeys((e) => {
    if (e.key === 'ArrowLeft') move('left');
    if (e.key === 'ArrowRight') move('right');
    if (e.key === 'ArrowUp') move('up');
    if (e.key === 'ArrowDown') move('down');
  });

  const colors = {
    2: 'bg-[#33454f] text-white',
    4: 'bg-[#3d5560] text-white',
    8: 'bg-[#f59e0b] text-white',
    16: 'bg-[#f97316] text-white',
    32: 'bg-[#ef4444] text-white',
    64: 'bg-[#dc2626] text-white',
    128: 'bg-[#eab308] text-white',
    256: 'bg-[#84cc16] text-white',
    512: 'bg-[#22c55e] text-white',
    1024: 'bg-[#06b6d4] text-white',
    2048: 'bg-[#a855f7] text-white',
  };

  return (
    <GameShell
      score={score}
      best={best}
      onRestart={() => { setBoard(addTile(addTile(g2048Empty()))); setScore(0); setStatus(''); onScore(0); }}
      status={status}
      hint="Arrow keys (or the buttons) to slide tiles. Merge equal numbers."
      accent={theme}
    >
      <Pad>
        <div className="text-center text-[11px] text-zinc-400 mb-2 font-mono">Max tile: {best2048}</div>
        <div className="grid grid-cols-4 gap-1.5 w-64 mx-auto">
          {board.map((row, r) =>
            row.map((v, c) => (
              <div
                key={r + '-' + c}
                className={'aspect-square rounded-lg flex items-center justify-center text-sm font-bold ' + (v ? colors[v] || 'bg-[#a855f7] text-white' : 'bg-[#22323b]')}
              >
                {v || ''}
              </div>
            )),
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5 w-40 mx-auto mt-3">
          <span />
          <GameButton onClick={() => move('up')}>▲</GameButton>
          <span />
          <GameButton onClick={() => move('left')}>◀</GameButton>
          <GameButton onClick={() => move('down')}>▼</GameButton>
          <GameButton onClick={() => move('right')}>▶</GameButton>
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 18. Simon Says Memory
// ============================================================
const SIMON_COLORS = [
  { bg: 'bg-emerald-500', glow: 'shadow-[0_0_18px_#10b981]', tone: 392 },
  { bg: 'bg-rose-500', glow: 'shadow-[0_0_18px_#f43f5e]', tone: 494 },
  { bg: 'bg-amber-400', glow: 'shadow-[0_0_18px_#fbbf24]', tone: 587 },
  { bg: 'bg-cyan-500', glow: 'shadow-[0_0_18px_#06b6d4]', tone: 659 },
];

export function Simon({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [seq, setSeq] = useState([]);
  const [step, setStep] = useState(0);
  const [lit, setLit] = useState(-1);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [status, setStatus] = useState('Press Start to watch the pattern');

  const playSequence = useCallback((list) => {
    setPhase('watch');
    list.forEach((val, i) => {
      setTimeout(() => {
        setLit(val);
        sfx(SIMON_COLORS[val].tone, 0.18);
        setTimeout(() => setLit(-1), 320);
      }, i * 560);
    });
    setTimeout(() => {
      setPhase('input');
      setStep(0);
      setStatus('Your turn — repeat the pattern');
    }, list.length * 560 + 200);
  }, [sfx]);

  const start = () => {
    const first = [randInt(0, 3)];
    setSeq(first);
    setScore(0);
    onScore(0);
    playSequence(first);
  };

  const press = (val) => {
    if (phase !== 'input') return;
    sfx(SIMON_COLORS[val].tone, 0.1);
    setLit(val);
    setTimeout(() => setLit(-1), 160);
    if (seq[step] !== val) {
      setPhase('idle');
      setStatus('Wrong — you reached level ' + seq.length);
      sfx(150, 0.3, 'sawtooth');
      return;
    }
    const nextStep = step + 1;
    if (nextStep === seq.length) {
      const v = score + seq.length * 10;
      setScore(v);
      onScore(v);
      setStatus('Level ' + seq.length + ' cleared!');
      const extended = [...seq, randInt(0, 3)];
      setSeq(extended);
      setTimeout(() => playSequence(extended), 700);
    } else {
      setStep(nextStep);
    }
  };

  return (
    <GameShell
      score={score}
      best={best}
      onStart={start}
      startLabel="Start"
      running={phase !== 'idle'}
      onRestart={() => { setSeq([]); setPhase('idle'); setStep(0); setStatus('Press Start to watch the pattern'); }}
      status={status}
      hint="Watch the sequence, then repeat it. Each round adds one step."
      accent={theme}
    >
      <Pad>
        <div className="grid grid-cols-2 gap-2 w-48 mx-auto">
          {SIMON_COLORS.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => press(i)}
              className={
                'aspect-square rounded-xl transition ' +
                c.bg +
                ' ' +
                (lit === i ? c.glow + ' brightness-150 scale-95' : 'opacity-70 hover:opacity-100')
              }
            />
          ))}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 25. Word Scramble
// ============================================================
const SCRAMBLE_WORDS = [
  'planet', 'rocket', 'garden', 'silver', 'monkey', 'puzzle', 'wizard', 'jungle',
  'cactus', 'dragon', 'forest', 'island', 'laptop', 'magnet', 'ocean', 'pirate',
  'quartz', 'rescue', 'sprint', 'thunder', 'unicorn', 'violet', 'winter', 'zephyr',
];
const scrambleWord = (w) => {
  let out = w;
  let guard = 0;
  while (out === w && guard < 20) {
    out = shuffle(w.split('')).join('');
    guard += 1;
  }
  return out;
};

export function WordScramble({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [word, setWord] = useState(() => pick(SCRAMBLE_WORDS));
  const [input, setInput] = useState('');
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('');
  const scrambled = useMemo(() => scrambleWord(word), [word]);

  const submit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (input.trim().toLowerCase() === word) {
      setScore((s) => {
        const v = s + 10;
        onScore(v);
        return v;
      });
      setStatus('Correct!');
      sfx(720, 0.15);
      setWord(pick(SCRAMBLE_WORDS));
      setInput('');
    } else {
      setStatus('Not quite — try again');
      sfx(200, 0.12, 'square');
      setInput('');
    }
  };

  return (
    <GameShell score={score} best={best} onRestart={() => { setWord(pick(SCRAMBLE_WORDS)); setInput(''); setStatus(''); }} status={status} hint="Unscramble the word and press Enter." accent={theme}>
      <Pad>
        <div className="text-center text-2xl font-mono tracking-[0.3em] text-cyan-300 mb-4">{scrambled.toUpperCase()}</div>
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Your answer…"
            className="flex-1 bg-[#2A3942] border border-[#3A4952] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
          />
          <GameButton onClick={submit} tone="primary">Enter</GameButton>
        </form>
        <div className="text-[10px] text-zinc-500 mt-2">{word.length} letters</div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 26. Hangman
// ============================================================
const HANG_WORDS = ['javascript', 'react', 'arcade', 'quantum', 'pixel', 'neon', 'cyber', 'botfather', 'whatsapp', 'instagram', 'keyboard', 'monitor', 'gravity', 'telescope'];

export function Hangman({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [word, setWord] = useState(() => pick(HANG_WORDS));
  const [guessed, setGuessed] = useState([]);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('');

  const wrong = guessed.filter((l) => !word.includes(l)).length;
  const won = word.split('').every((l) => guessed.includes(l));
  const lost = wrong >= 6;

  const guess = (letter) => {
    if (guessed.includes(letter) || won || lost) return;
    const next = [...guessed, letter];
    setGuessed(next);
    const nextWrong = next.filter((l) => !word.includes(l)).length;
    if (!word.includes(letter)) {
      sfx(200, 0.12, 'square');
    } else {
      sfx(600, 0.08);
    }
    if (nextWrong >= 6) {
      setStatus('Out of lives — the word was ' + word);
    } else if (word.split('').every((l) => next.includes(l))) {
      setScore((s) => {
        const v = s + 50;
        onScore(v);
        return v;
      });
      setStatus('You guessed it! 🎉');
      sfx(820, 0.25);
    }
  };

  return (
    <GameShell
      score={score}
      best={best}
      onRestart={() => { setWord(pick(HANG_WORDS)); setGuessed([]); setStatus(''); }}
      status={status}
      hint="Six wrong guesses allowed."
      accent={theme}
    >
      <Pad>
        <div className="flex justify-center gap-1.5 mb-3 text-[10px] font-mono text-zinc-400">
          <span>Lives:</span>
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={i < 6 - wrong ? 'text-rose-400' : 'text-zinc-700'}>♥</span>
          ))}
        </div>
        <div className="text-center text-xl font-mono tracking-widest mb-4 text-white">
          {word.split('').map((l, i) => (guessed.includes(l) ? l : '_')).join(' ')}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {'abcdefghijklmnopqrstuvwxyz'.split('').map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => guess(l)}
              disabled={guessed.includes(l) || won || lost}
              className={
                'h-7 rounded text-[10px] font-bold border transition ' +
                (guessed.includes(l)
                  ? word.includes(l)
                    ? 'bg-emerald-500/25 border-emerald-500 text-emerald-300'
                    : 'bg-rose-500/20 border-rose-500 text-rose-300'
                  : 'bg-[#2A3942] border-[#3A4952] text-zinc-200 hover:bg-[#3A4952]')
              }
            >
              {l}
            </button>
          ))}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 43. Sokoban Box Pusher
// ============================================================
const SOKO_LEVELS = [
  [
    '#######',
    '#     #',
    '# .$  #',
    '#  @  #',
    '# .$  #',
    '#     #',
    '#######',
  ],
  [
    '########',
    '#      #',
    '# .$@  #',
    '#  $   #',
    '#  .   #',
    '#      #',
    '########',
  ],
  [
    '#########',
    '#   #   #',
    '# . $ @ #',
    '#   $ . #',
    '#  ###  #',
    '#       #',
    '#########',
  ],
];
function sokoParse(level) {
  const walls = new Set();
  const goals = new Set();
  const boxes = new Set();
  let player = 0;
  level.forEach((row, r) => {
    row.split('').forEach((ch, c) => {
      const i = r * 100 + c;
      if (ch === '#') walls.add(i);
      if (ch === '.' || ch === '*' || ch === '+') goals.add(i);
      if (ch === '$' || ch === '*') boxes.add(i);
      if (ch === '@' || ch === '+') player = i;
    });
  });
  return { walls, goals, boxes, player, width: level[0].length, height: level.length };
}

export function Sokoban({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [levelIdx, setLevelIdx] = useState(0);
  const [state, setState] = useState(() => sokoParse(SOKO_LEVELS[0]));
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('');
  const [moves, setMoves] = useState(0);

  const solved = state.boxes.size > 0 && [...state.boxes].every((b) => state.goals.has(b));

  useEffect(() => {
    if (solved) {
      setScore((s) => {
        const v = s + 100;
        onScore(v);
        return v;
      });
      setStatus('Level solved! Press Next level');
      sfx(820, 0.3);
    }
  }, [solved, onScore, sfx]);

  const move = useCallback((dr, dc) => {
    setState((cur) => {
      const r = Math.floor(cur.player / 100);
      const c = cur.player % 100;
      const nr = r + dr;
      const nc = c + dc;
      const ni = nr * 100 + nc;
      if (cur.walls.has(ni)) return cur;
      if (cur.boxes.has(ni)) {
        const br = nr + dr;
        const bc = nc + dc;
        const bi = br * 100 + bc;
        if (cur.walls.has(bi) || cur.boxes.has(bi)) return cur;
        const boxes = new Set(cur.boxes);
        boxes.delete(ni);
        boxes.add(bi);
        sfx(420, 0.05);
        setMoves((m) => m + 1);
        return { ...cur, boxes, player: ni };
      }
      setMoves((m) => m + 1);
      return { ...cur, player: ni };
    });
  }, [sfx]);

  useKeys((e) => {
    if (e.key === 'ArrowUp') move(-1, 0);
    if (e.key === 'ArrowDown') move(1, 0);
    if (e.key === 'ArrowLeft') move(0, -1);
    if (e.key === 'ArrowRight') move(0, 1);
  });

  const nextLevel = () => {
    const idx = (levelIdx + 1) % SOKO_LEVELS.length;
    setLevelIdx(idx);
    setState(sokoParse(SOKO_LEVELS[idx]));
    setMoves(0);
    setStatus('');
  };

  const cells = [];
  for (let r = 0; r < state.height; r += 1) {
    for (let c = 0; c < state.width; c += 1) {
      const i = r * 100 + c;
      cells.push({ i, wall: state.walls.has(i), goal: state.goals.has(i), box: state.boxes.has(i), player: state.player === i });
    }
  }

  return (
    <GameShell
      score={score}
      best={best}
      onRestart={() => { setState(sokoParse(SOKO_LEVELS[levelIdx])); setMoves(0); setStatus(''); }}
      status={status}
      hint={'Level ' + (levelIdx + 1) + ' · ' + moves + ' moves · Arrow keys to walk and push.'}
      accent={theme}
    >
      <Pad>
        <div className="grid gap-0 mx-auto w-fit" style={{ gridTemplateColumns: 'repeat(' + state.width + ', 1.6rem)' }}>
          {cells.map((cell) => (
            <div
              key={cell.i}
              className={
                'w-[1.6rem] h-[1.6rem] flex items-center justify-center text-xs ' +
                (cell.wall ? 'bg-[#3A4952]' : cell.goal ? 'bg-emerald-500/15' : 'bg-[#0B141A]')
              }
            >
              {cell.player ? '🙂' : cell.box ? (cell.goal ? '✅' : '📦') : cell.goal ? '•' : ''}
            </div>
          ))}
        </div>
        {solved ? (
          <div className="flex justify-center mt-3">
            <GameButton onClick={nextLevel} tone="success">Next level</GameButton>
          </div>
        ) : null}
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 44. Lights Out
// ============================================================
const LO_SIZE = 5;
const loEmpty = () => Array.from({ length: LO_SIZE }, () => Array(LO_SIZE).fill(false));
function loToggle(board, r, c) {
  const next = board.map((row) => [...row]);
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
    const rr = r + dr;
    const cc = c + dc;
    if (rr >= 0 && rr < LO_SIZE && cc >= 0 && cc < LO_SIZE) next[rr][cc] = !next[rr][cc];
  });
  return next;
}
function loScramble() {
  let b = loEmpty();
  for (let i = 0; i < 6; i += 1) b = loToggle(b, randInt(0, LO_SIZE - 1), randInt(0, LO_SIZE - 1));
  if (b.every((row) => row.every((v) => !v))) return loScramble();
  return b;
}

export function LightsOut({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [board, setBoard] = useState(loScramble);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('');
  const [moves, setMoves] = useState(0);

  const solved = board.every((row) => row.every((v) => !v));

  useEffect(() => {
    if (solved && moves > 0) {
      setScore((s) => {
        const v = s + 60;
        onScore(v);
        return v;
      });
      setStatus('All lights out! 🎉');
      sfx(820, 0.25);
    }
  }, [solved, moves, onScore, sfx]);

  const click = (r, c) => {
    setBoard((b) => loToggle(b, r, c));
    setMoves((m) => m + 1);
    sfx(520, 0.05);
  };

  return (
    <GameShell
      score={score}
      best={best}
      onRestart={() => { setBoard(loScramble()); setMoves(0); setStatus(''); }}
      status={status}
      hint={'Turn every light off · ' + moves + ' moves'}
      accent={theme}
    >
      <Pad>
        <div className="grid grid-cols-5 gap-1.5 w-52 mx-auto">
          {board.map((row, r) =>
            row.map((on, c) => (
              <button
                key={r + '-' + c}
                type="button"
                onClick={() => click(r, c)}
                className={
                  'aspect-square rounded-lg border transition ' +
                  (on ? 'bg-amber-400 border-amber-300 shadow-[0_0_12px_#fbbf24]' : 'bg-[#22323b] border-[#3A4952]')
                }
              />
            )),
          )}
        </div>
      </Pad>
    </GameShell>
  );
}

// ============================================================
// 13. Sudoku Master (valid generated puzzle)
// ============================================================
function sudokuSolved() {
  const g = Array.from({ length: 9 }, () => Array(9).fill(0));
  const ok = (r, c, v) => {
    for (let i = 0; i < 9; i += 1) if (g[r][i] === v || g[i][c] === v) return false;
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) if (g[br + i][bc + j] === v) return false;
    return true;
  };
  const fill = (idx) => {
    if (idx === 81) return true;
    const r = Math.floor(idx / 9);
    const c = idx % 9;
    for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (ok(r, c, v)) {
        g[r][c] = v;
        if (fill(idx + 1)) return true;
        g[r][c] = 0;
      }
    }
    return false;
  };
  fill(0);
  return g;
}

export function Sudoku({ theme, sound, best, onScore }) {
  const sfx = useSfx(sound);
  const [solution, setSolution] = useState(sudokuSolved);
  const [puzzle, setPuzzle] = useState(() => {
    const s = sudokuSolved();
    const p = s.map((row) => [...row]);
    for (let i = 0; i < 45; i += 1) {
      const r = randInt(0, 8);
      const c = randInt(0, 8);
      p[r][c] = 0;
    }
    return p;
  });
  const [grid, setGrid] = useState(() => puzzle.map((row) => [...row]));
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('');
  const [errors, setErrors] = useState(0);

  const setCell = (r, c, raw) => {
    if (puzzle[r][c]) return;
    const v = raw.replace(/[^1-9]/g, '').slice(-1);
    const num = v ? parseInt(v, 10) : 0;
    const next = grid.map((row) => [...row]);
    next[r][c] = num;
    setGrid(next);
    if (num && num !== solution[r][c]) {
      setErrors((e) => e + 1);
      sfx(200, 0.1, 'square');
    } else if (num) {
      sfx(560, 0.05);
    }
  };

  const check = () => {
    const filled = grid.every((row, r) => row.every((v, c) => v === solution[r][c]));
    if (filled) {
      setScore((s) => {
        const v = s + 150;
        onScore(v);
        return v;
      });
      setStatus('Solved! 🏆');
      sfx(840, 0.3);
    } else {
      setStatus('Not solved yet — ' + errors + ' wrong entries so far');
    }
  };

  const newGame = () => {
    const s = sudokuSolved();
    const p = s.map((row) => [...row]);
    for (let i = 0; i < 45; i += 1) p[randInt(0, 8)][randInt(0, 8)] = 0;
    setSolution(s);
    setPuzzle(p);
    setGrid(p.map((row) => [...row]));
    setErrors(0);
    setStatus('');
  };

  return (
    <GameShell score={score} best={best} onRestart={newGame} status={status} hint="Fill each row, column and box with 1-9." accent={theme}>
      <Pad>
        <div className="grid grid-cols-9 w-72 mx-auto border-2 border-[#3A4952]">
          {grid.map((row, r) =>
            row.map((v, c) => {
              const fixed = puzzle[r][c] !== 0;
              const wrong = v !== 0 && v !== solution[r][c];
              const thickRight = (c + 1) % 3 === 0 && c !== 8;
              const thickBottom = (r + 1) % 3 === 0 && r !== 8;
              return (
                <input
                  key={r + '-' + c}
                  value={v || ''}
                  onChange={(e) => setCell(r, c, e.target.value)}
                  readOnly={fixed}
                  className={
                    'aspect-square w-full text-center text-[11px] outline-none ' +
                    (fixed ? 'bg-[#22323b] text-zinc-400 font-bold' : wrong ? 'bg-rose-500/20 text-rose-300' : 'bg-[#0B141A] text-cyan-200') +
                    (thickRight ? ' border-r-2 border-r-[#3A4952]' : ' border-r border-r-[#22323b]') +
                    (thickBottom ? ' border-b-2 border-b-[#3A4952]' : ' border-b border-b-[#22323b]')
                  }
                />
              );
            }),
          )}
        </div>
        <div className="flex justify-center mt-3">
          <GameButton onClick={check} tone="primary">Check solution</GameButton>
        </div>
      </Pad>
    </GameShell>
  );
}
