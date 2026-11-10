"use client";

import React, { useState, useEffect, useRef } from "react";

interface WhatsAppAudioPlayerProps {
  duration?: string;
  isSender?: boolean;
  audioSrc?: string;
}

export const WhatsAppAudioPlayer: React.FC<WhatsAppAudioPlayerProps> = ({
  duration = "0:32",
  isSender = false,
  audioSrc,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio element
  useEffect(() => {
    if (audioSrc && typeof window !== "undefined") {
      audioRef.current = new Audio(audioSrc);
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [audioSrc]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleRate = () => {
    if (playbackRate === 1) setPlaybackRate(1.5);
    else if (playbackRate === 1.5) setPlaybackRate(2);
    else setPlaybackRate(1);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`flex items-center space-x-3 rounded-2xl p-3 max-w-sm ${
        isSender
          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20"
          : "bg-slate-900/90 border border-slate-800 text-slate-100"
      }`}
    >
      {/* Play / Pause */}
      <button
        onClick={togglePlay}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-all shadow"
      >
        {isPlaying ? "⏸" : "▶"}
      </button>

      {/* Waveform Bars + Timeline */}
      <div className="flex-1 space-y-1.5">
        {/* Frequency waveform visualization */}
        <div className="flex items-center space-x-0.5 h-6 cursor-pointer">
          {[35, 65, 30, 90, 50, 80, 40, 95, 60, 85, 45, 75, 55, 90, 40].map(
            (height, idx) => (
              <div
                key={idx}
                style={{ height: `${height}%` }}
                className={`w-1 rounded-full transition-all ${
                  isPlaying && idx < 8
                    ? "bg-emerald-300 animate-pulse"
                    : isSender
                    ? "bg-white/50"
                    : "bg-slate-600"
                }`}
              />
            )
          )}
        </div>
        <div className="flex justify-between text-[10px] opacity-80 font-mono">
          <span>{formatTime(currentTime)} / {duration}</span>
          <span>Voice message</span>
        </div>
      </div>

      {/* Speed Badge */}
      <button
        onClick={toggleRate}
        className="rounded-lg bg-black/30 hover:bg-black/40 px-2 py-1 text-[10px] font-bold tracking-wider text-emerald-300"
      >
        {playbackRate}x
      </button>
    </div>
  );
};
