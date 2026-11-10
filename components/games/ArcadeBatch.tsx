"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { enqueueOutboxMessage, processOutboxQueue } from "../../lib/outbox";

interface ArcadeBatchProps {
  batch: 1 | 2 | 3;
  title: string;
  gameIds: number[]; // The global game ID range this batch covers
  subtitle?: string;
}

/**
 * ArcadeBatch — Iframe wrapper for Relay Vault batch HTML demos.
 *
 * Handles postMessage high-score submissions from the embedded game pages and
 * forwards them to our IndexedDB outbox engine (lib/outbox.ts) so scores
 * persist offline and sync when connectivity returns.
 */
export function ArcadeBatch({ batch, title, gameIds, subtitle }: ArcadeBatchProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [score, setScore] = useState<number | null>(null);
  const [lastGameId, setLastGameId] = useState<number | null>(null);

  const handleScore = useCallback(
    (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const { type, gameId, score: s } = event.data || {};
      if (type === "ARCADE_SCORE" && gameId && s) {
        setScore(s);
        setLastGameId(gameId);

        // Enqueue into our offline-first outbox engine for persistence
        enqueueOutboxMessage(
          `game_${gameId}`,
          JSON.stringify({ batch, gameId, score: s, source: `batch_${batch}` }),
          "arcade",
          undefined
        ).catch(console.error);
      }
    },
    [batch]
  );

  useEffect(() => {
    window.addEventListener("message", handleScore);
    return () => window.removeEventListener("message", handleScore);
  }, [handleScore]);

  const src = `/games/batch${batch}.html`;

  return (
    <div className="flex flex-col w-full max-w-2xl">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${batch === 1 ? 'bg-emerald-400' : batch === 2 ? 'bg-cyan-400' : 'bg-purple-400'}`} />
          {title}
        </h3>
        {subtitle && <p className="text-[10px] text-slate-500">{subtitle}</p>}
      </div>

      <div className="relative w-full aspect-[4/3] bg-[#05070a] rounded-2xl border border-[#16232b] overflow-hidden shadow-xl">
        <iframe
          ref={iframeRef}
          src={src}
          className="w-full h-full border-0"
          title={`${title} — Batch ${batch}`}
          allow="keyboard-display; clipboard-read; clipboard-write"
          loading="eager"
        />
      </div>

      {score !== null && lastGameId !== null && (
        <div className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-mono">
          <span>🏆 Score {score} submitted for game #{lastGameId}</span>
          <span className="ml-auto text-slate-500">Saved to IndexedDB outbox</span>
        </div>
      )}
    </div>
  );
}
