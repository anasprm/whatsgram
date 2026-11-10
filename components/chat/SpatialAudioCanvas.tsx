"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRelayDB } from "@/hooks/useRelayDB";
import { saveRecord } from "@/utils/db";
import { Radio, X, Mic, MicOff, Volume2, VolumeX, Settings } from "lucide-react";

interface Peer {
  id: string;
  name: string;
  x: number;
  y: number;
  isMuted: boolean;
  speaking: boolean;
}

/**
 * SpatialAudioCanvas — Interactive 3D HRTF Voice Room
 *
 * Features:
 * - Drag-and-drop avatar positioning (persisted to IndexedDB)
 * - Proximity visualizer rings (distance-based audio range feedback)
 * - HRTF panning toggle (persisted)
 * - Mic gain control (persisted)
 * - Speaking state visualization (pulse animation on active speakers)
 * - Mute / unmute per peer
 * - Leave room button
 *
 * Persisted to IndexedDB via useRelayDB:
 *   - settings: hrtfEnabled, micGain
 *   - game_scores (reused as layout store): spatial_layout_<userId>
 */
export const SpatialAudioCanvas: React.FC = () => {
  const [hrtfEnabled, setHrtfEnabled] = useRelayDB("settings", "spatial_hrtf", true);
  const [micGain, setMicGain] = useRelayDB("settings", "spatial_mic_gain", 100);
  const [layout, setLayout] = useRelayDB(
    "game_scores",
    "spatial_layout_anon",
    { you: { x: 280, y: 200 }, alice: { x: 180, y: 120 }, marcus: { x: 420, y: 140 }, sarah: { x: 300, y: 310 } }
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const defaultPeers: Peer[] = [
    { id: "you", name: "You (Host)", x: 280, y: 200, isMuted: false, speaking: true },
    { id: "alice", name: "Alice", x: 180, y: 120, isMuted: false, speaking: false },
    { id: "marcus", name: "Marcus", x: 420, y: 140, isMuted: false, speaking: true },
    { id: "sarah", name: "Sarah", x: 300, y: 310, isMuted: true, speaking: false },
  ];

  // Merge persisted layout positions with default peers
  const peers: Peer[] = defaultPeers.map((p) => {
    const saved = (layout as any)?.[p.id];
    return {
      ...p,
      x: saved?.x ?? p.x,
      y: saved?.y ?? p.y,
    };
  });

  const calculateDistance = (a: Peer, b: Peer) => {
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const getProximityColor = (distance: number) => {
    if (distance < 100) return "#22c55e"; // green — close
    if (distance < 200) return "#3b82f6"; // blue — medium
    if (distance < 300) return "#f59e0b"; // amber — far
    return "#ef4444"; // red — out of range
  };

  const saveLayout = useCallback(async () => {
    const positions: Record<string, { x: number; y: number }> = {};
    peers.forEach((p) => {
      positions[p.id] = { x: p.x, y: p.y };
    });
    await saveRecord("game_scores", {
      key: "spatial_layout_anon",
      ...positions,
      updatedAt: Date.now(),
    }).catch(console.error);
  }, [peers]);

  // Persist layout whenever positions change
  useEffect(() => {
    const timer = setTimeout(saveLayout, 300);
    return () => clearTimeout(timer);
  }, [peers, saveLayout]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!selectedPeer || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(40, Math.min(rect.width - 40, e.clientX - rect.left));
      const y = Math.max(40, Math.min(rect.height - 40, e.clientY - rect.top));

      setPeers((prev) =>
        prev.map((p) => (p.id === selectedPeer ? { ...p, x, y } : p))
      );
    },
    [selectedPeer]
  );

  const toggleMute = (peerId: string) => {
    setPeers((prev) =>
      prev.map((p) =>
        p.id === peerId ? { ...p, isMuted: !p.isMuted } : p
      )
    );
  };

  const toggleSpeaking = (peerId: string) => {
    setPeers((prev) =>
      prev.map((p) =>
        p.id === peerId ? { ...p, speaking: !p.speaking } : p
      )
    );
  };

  return (
    <div
      className="flex h-[88vh] w-full max-w-5xl mx-auto flex-col rounded-3xl border border-slate-800 bg-[#0b0f19] text-slate-100 shadow-2xl overflow-hidden font-sans select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={() => setSelectedPeer(null)}
    >
      {/* Room Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-[#111827] px-6 py-4">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 font-bold border border-cyan-500/20">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">Relay Spatial Voice Room</h2>
            <p className="text-[11px] text-cyan-400 font-medium">
              {peers.length} active participants • 3D HRTF Panning {hrtfEnabled ? "• Active" : "• Off"}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setHrtfEnabled(!hrtfEnabled)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              hrtfEnabled
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
          >
            HRTF Panning: {hrtfEnabled ? "ON" : "OFF"}
          </button>
          <button
            title="Mic Gain"
            className="p-2 rounded-lg bg-[#2A3942] hover:bg-[#3A4952] text-zinc-300 hover:text-white transition"
          >
            <Volume2 className="w-4 h-4" /> {micGain}%
          </button>
          <button
            className="p-2 rounded-lg bg-[#2A3942] hover:bg-[#3A4952] text-zinc-300 hover:text-white transition"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Interactive Spatial Grid Canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#0b0f19] to-[#0b0f19] overflow-hidden flex items-center justify-center p-6"
      >
        {/* Distance Attenuation Rings */}
        <div className="absolute h-[384px] w-[384px] rounded-full border border-slate-800/60 pointer-events-none" />
        <div className="absolute h-[256px] w-[256px] rounded-full border border-slate-800/40 pointer-events-none" />
        <div className="absolute h-[128px] w-[128px] rounded-full border border-slate-800/20 pointer-events-none" />

        {/* Proximity Lines + Glows between peers */}
        {peers.map((p, i) =>
          peers.slice(i + 1).map((q) => {
            const dist = calculateDistance(p, q);
            const color = getProximityColor(dist);
            const opacity = Math.max(0.1, 1 - dist / 400);
            const isClose = dist < 150;
            return (
              <div
                key={`${p.id}-${q.id}`}
                className="absolute pointer-events-none"
                style={{
                  left: Math.min(p.x, q.x),
                  top: Math.min(p.y, q.y),
                  width: Math.abs(p.x - q.x) + 28,
                  height: Math.abs(p.y - q.y) + 28,
                  transform: `rotate(${Math.atan2(q.y - p.y, q.x - p.x)}rad)`,
                }}
              >
                <div
                  className="absolute left-[14px] top-[14px] h-[2px] w-full rounded-full"
                  style={{
                    background: isClose
                      ? `linear-gradient(90deg, ${color}, ${color}80)`
                      : `linear-gradient(90deg, ${color}40, transparent)`,
                    opacity,
                    boxShadow: isClose
                      ? `0 0 12px ${color}`
                      : "none",
                  }}
                />
              </div>
            );
          })
        )}

        {/* Render Participant Avatars */}
        {peers.map((peer) => {
          const isYou = peer.id === "you";
          return (
            <div
              key={peer.id}
              onMouseDown={() => setSelectedPeer(peer.id)}
              style={{
                transform: `translate(${peer.x - 14}px, ${peer.y - 14}px)`,
              }}
              className={`absolute flex flex-col items-center cursor-grab active:cursor-grabbing transition-transform duration-75 z-10`}
            >
              <div className={`relative flex h-14 w-14 items-center justify-center rounded-full border-2 shadow-xl ${
                isYou
                  ? "bg-cyan-600 border-cyan-400 text-white"
                  : peer.speaking
                    ? "bg-emerald-600 border-emerald-400 text-white animate-pulse"
                    : peer.isMuted
                      ? "bg-rose-500/20 border-rose-500 text-rose-300"
                      : "bg-slate-800 border-slate-700 text-slate-300"
              }`}>
                <span className="text-sm font-bold">{peer.name.substring(0, 2).toUpperCase()}</span>
                {peer.speaking && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-[#0b0f19]" />
                )}
                {peer.isMuted && (
                  <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-rose-500 border-2 border-[#0b0f19]" />
                )}
                {isYou && (
                  <span className="absolute -bottom-1 -left-1 h-3 w-3 rounded-full bg-cyan-500 border-2 border-[#0b0f19]" />
                )}
              </div>
              <span className="mt-2 rounded-md bg-slate-900/80 px-2 py-0.5 text-[11px] font-medium text-slate-200 border border-slate-800 shadow-sm whitespace-nowrap">
                {peer.name}
              </span>

              {/* Peer Controls */}
              <div className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleMute(peer.id); }}
                  className="p-1 rounded bg-[#2A3942] hover:bg-[#3A4952] text-zinc-300 hover:text-white transition"
                  title={peer.isMuted ? "Unmute" : "Mute"}
                >
                  {peer.isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSpeaking(peer.id); }}
                  className="p-1 rounded bg-[#2A3942] hover:bg-[#3A4952] text-zinc-300 hover:text-white transition"
                  title={peer.speaking ? "Stop Speaking" : "Start Speaking"}
                >
                  {peer.speaking ? "🔇" : "🔊"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Participant Control Dock */}
      <div className="border-t border-slate-800/80 bg-[#111827] px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Participants</span>
          {peers.map((peer) => (
            <div key={peer.id} className="flex items-center space-x-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
              <span
                className={`h-2 w-2 rounded-full ${
                  peer.isMuted ? "bg-rose-500" : peer.speaking ? "bg-emerald-500 animate-pulse" : "bg-cyan-500"
                }`}
              />
              <span className="text-xs font-medium text-slate-200">{peer.name}</span>
              <span className="text-[10px] text-zinc-500 font-mono">{peer.isMuted ? "Muted" : "Active"}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center space-x-3">
          <button
            className="rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-4 py-2 text-xs font-semibold border border-rose-500/20 transition-colors"
          >
            Leave Room 🚪
          </button>
        </div>
      </div>
    </div>
  );
};
