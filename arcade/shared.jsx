'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Trophy, Clock } from 'lucide-react';

// ------------------------------------------------------------
// Small helpers shared by every arcade engine
// ------------------------------------------------------------
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

// ------------------------------------------------------------
// Score state that always reports upward to the parent
// ------------------------------------------------------------
export function useScore(onScore, initial = 0) {
  const [score, setScore] = useState(initial);
  const ref = useRef(initial);
  const cb = useRef(onScore);
  cb.current = onScore;
  const add = useCallback(
    (n) => {
      ref.current = Math.max(0, ref.current + n);
      setScore(ref.current);
      if (cb.current) cb.current(ref.current);
      return ref.current;
    },
    [],
  );
  const set = useCallback((v) => {
    ref.current = Math.max(0, v);
    setScore(ref.current);
    if (cb.current) cb.current(ref.current);
    return ref.current;
  }, []);
  const reset = useCallback(
    (v = initial) => {
      ref.current = v;
      setScore(v);
      if (cb.current) cb.current(v);
      return v;
    },
    [initial],
  );
  return { score, ref, add, set, reset };
}

// ------------------------------------------------------------
// Sound effects (Web Audio, no assets needed)
// ------------------------------------------------------------
export function useSfx(enabled) {
  const ctxRef = useRef(null);
  const lastRef = useRef(0);
  return useCallback(
    (freq = 440, duration = 0.08, type = 'sine') => {
      if (!enabled) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!ctxRef.current) ctxRef.current = new AudioCtx();
        const ctx = ctxRef.current;
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        if (now - lastRef.current < 0.02) return;
        lastRef.current = now;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.09, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.03);
      } catch {
        /* audio is best-effort */
      }
    },
    [enabled],
  );
}

// ------------------------------------------------------------
// Countdown timer that actually stops at zero
// ------------------------------------------------------------
export function useCountdown(seconds, onEnd) {
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(false);
  const endRef = useRef(onEnd);
  const idRef = useRef(null);
  endRef.current = onEnd;

  const clear = useCallback(() => {
    if (idRef.current) {
      clearInterval(idRef.current);
      idRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clear();
    setRunning(false);
  }, [clear]);

  const start = useCallback(() => {
    clear();
    setLeft(seconds);
    setRunning(true);
    let remaining = seconds;
    idRef.current = setInterval(() => {
      remaining -= 1;
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        clear();
        setRunning(false);
        if (endRef.current) endRef.current();
      }
    }, 1000);
  }, [clear, seconds]);

  useEffect(() => clear, [clear]);

  return { left, running, start, stop, setLeft };
}

// ------------------------------------------------------------
// requestAnimationFrame loop with correct cleanup
// ------------------------------------------------------------
export function useRafLoop(callback, running) {
  const cbRef = useRef(callback);
  cbRef.current = callback;
  useEffect(() => {
    if (!running) return undefined;
    let frame = 0;
    let stopped = false;
    const tick = (t) => {
      if (stopped) return;
      cbRef.current(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [running]);
}

// ------------------------------------------------------------
// Keyboard input helper
// ------------------------------------------------------------
export function useKeys(handler, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
      }
      ref.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

// ------------------------------------------------------------
// Common shell: score / best / timer / start / restart / hint
// ------------------------------------------------------------
export function GameShell({
  score,
  best = 0,
  time,
  status,
  onStart,
  startLabel = 'Start',
  onRestart,
  running = false,
  hint,
  accent = '#22d3ee',
  children,
}) {
  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div className="w-full max-w-md flex items-center justify-between text-[11px] font-mono text-zinc-300 bg-[#1F2C34] border border-[#2A3942] rounded-lg px-3 py-2">
        <span className="flex items-center gap-1">
          <Trophy className="w-3.5 h-3.5 text-amber-400" /> {score}
        </span>
        <span className="text-zinc-500">Best {best}</span>
        {time !== undefined && time !== null ? (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-cyan-400" /> {time}s
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </div>

      <div className="w-full max-w-md">{children}</div>

      <div className="flex items-center gap-2">
        {onStart && !running ? (
          <button
            type="button"
            onClick={onStart}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white hover:opacity-90 transition"
            style={{ background: 'linear-gradient(90deg, ' + accent + ', #E1306C)' }}
          >
            {startLabel}
          </button>
        ) : null}
        {onRestart ? (
          <button
            type="button"
            onClick={onRestart}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-[#2A3942] text-zinc-200 hover:bg-[#3A4952] transition flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restart
          </button>
        ) : null}
      </div>

      {status ? <div className="text-xs font-bold text-emerald-400 text-center">{status}</div> : null}
      {hint ? <p className="text-[10px] text-gray-500 text-center max-w-md">{hint}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------
// Canvas helper — keeps the drawing surface crisp on all screens
// ------------------------------------------------------------
export function useCanvas(draw, running) {
  const ref = useRef(null);
  useRafLoop(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    draw(ctx, canvas.width, canvas.height);
  }, running);
  return ref;
}

export function GameButton({ children, onClick, disabled, tone = 'default', className = '' }) {
  const tones = {
    default: 'bg-[#2A3942] text-zinc-200 hover:bg-[#3A4952]',
    primary: 'bg-gradient-to-r from-[#833AB4] to-[#E1306C] text-white hover:opacity-90',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    success: 'bg-emerald-500 text-white hover:bg-emerald-600',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ' +
        tones[tone] +
        ' ' +
        className
      }
    >
      {children}
    </button>
  );
}

export function Pad({ label, children }) {
  return (
    <div className="w-full max-w-md bg-[#1F2C34] rounded-xl p-4 border border-[#2A3942]">
      {label ? <div className="text-[11px] text-zinc-400 font-mono mb-2">{label}</div> : null}
      {children}
    </div>
  );
}
