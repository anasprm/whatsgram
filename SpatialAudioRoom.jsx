import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Volume2, VolumeX, X, Radio, Headphones, Waves, RotateCcw } from 'lucide-react';

const ROOM_W = 640;
const ROOM_H = 400;

const SEED_USERS = [
  { id: 'you', name: 'You', x: 320, y: 200, color: '#22d3ee', isSelf: true, tone: 220 },
  { id: 'alice', name: 'Alice', x: 180, y: 130, color: '#f472b6', tone: 330 },
  { id: 'marcus', name: 'Marcus', x: 460, y: 150, color: '#f43f5e', tone: 440 },
  { id: 'sarah', name: 'Sarah', x: 250, y: 300, color: '#a78bfa', tone: 550 },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distanceBetween(a, b) {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

export default function SpatialAudioRoom({ onClose, roomName = 'Relay Voice Room' }) {
  const [joined, setJoined] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [users, setUsers] = useState(SEED_USERS);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState('');
  const [hearingIds, setHearingIds] = useState([]);

  const audioCtxRef = useRef(null);
  const masterGainRef = useRef(null);
  const micStreamRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const micSourceRef = useRef(null);
  const pannersRef = useRef(new Map());
  const oscillatorsRef = useRef(new Map());
  const meterFrameRef = useRef(null);
  const dragRef = useRef(null);

  const selfUser = useMemo(() => users.find((u) => u.isSelf) || users[0], [users]);

  const cleanupAudio = useCallback(() => {
    if (meterFrameRef.current) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    oscillatorsRef.current.forEach((node) => {
      try {
        node.osc.stop();
        node.osc.disconnect();
      } catch (e) {
        /* already stopped */
      }
    });
    oscillatorsRef.current.clear();
    pannersRef.current.clear();

    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch (e) {
        /* noop */
      }
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) {
        /* noop */
      }
      audioCtxRef.current = null;
    }
    masterGainRef.current = null;
    micAnalyserRef.current = null;
  }, []);

  useEffect(() => cleanupAudio, [cleanupAudio]);

  // Keep panner positions in sync with the avatars on the canvas.
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    users.forEach((user) => {
      if (user.isSelf) return;
      const panner = pannersRef.current.get(user.id);
      if (!panner) return;
      const nx = (user.x / ROOM_W) * 2 - 1;
      const ny = (user.y / ROOM_H) * 2 - 1;
      if (panner.positionX) {
        panner.positionX.setTargetAtTime(nx * 2, ctx.currentTime, 0.05);
        panner.positionY.setTargetAtTime(-ny, ctx.currentTime, 0.05);
        panner.positionZ.setTargetAtTime(-1, ctx.currentTime, 0.05);
      } else {
        panner.setPosition(nx * 2, -ny, -1);
      }
    });
  }, [users]);

  const startMicMeter = useCallback(() => {
    const analyser = micAnalyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) {
        peak = Math.max(peak, Math.abs(data[i] - 128));
      }
      setMicLevel(clamp(peak / 70, 0, 1));
      meterFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const joinRoom = useCallback(async () => {
    setError('');
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        setError('Web Audio is not supported in this browser.');
        return;
      }
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.value = speakerOn ? 1 : 0;
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;

      // Build a panner per remote avatar so movement is audible.
      users.forEach((user) => {
        if (user.isSelf) return;
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 0.8;
        panner.maxDistance = 8;
        panner.rolloffFactor = 1.2;
        panner.connect(masterGain);
        pannersRef.current.set(user.id, panner);
      });

      // Microphone (optional - the room still works without it).
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        micSourceRef.current = source;
        micAnalyserRef.current = analyser;
        startMicMeter();
      } catch (micErr) {
        setMicMuted(true);
        setError('Microphone blocked - you can still listen and move around.');
      }

      if (ctx.state === 'suspended') await ctx.resume();
      setJoined(true);
    } catch (err) {
      setError(err?.message || 'Could not start the audio engine.');
    }
  }, [speakerOn, startMicMeter, users]);

  const leaveRoom = useCallback(() => {
    cleanupAudio();
    setJoined(false);
    setHearingIds([]);
    setMicLevel(0);
    if (onClose) onClose();
  }, [cleanupAudio, onClose]);

  const toggleMic = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      if (micStreamRef.current) {
        micStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
      }
      return next;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((prev) => {
      const next = !prev;
      if (masterGainRef.current && audioCtxRef.current) {
        masterGainRef.current.gain.setTargetAtTime(next ? 1 : 0, audioCtxRef.current.currentTime, 0.02);
      }
      return next;
    });
  }, []);

  // Play a short spatial tone from a speaker so panning is actually audible.
  const previewSpeaker = useCallback((user) => {
    const ctx = audioCtxRef.current;
    const panner = pannersRef.current.get(user.id);
    if (!ctx || !panner) {
      setError('Join the room first to hear spatial audio.');
      return;
    }
    const existing = oscillatorsRef.current.get(user.id);
    if (existing) {
      try {
        existing.osc.stop();
      } catch (e) {
        /* noop */
      }
      oscillatorsRef.current.delete(user.id);
      setHearingIds((prev) => prev.filter((id) => id !== user.id));
      return;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = user.tone || 320;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(panner);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.08);
    const entry = { osc, gain };
    oscillatorsRef.current.set(user.id, entry);
    setHearingIds((prev) => [...prev, user.id]);
    osc.stop(ctx.currentTime + 2.4);
    osc.onended = () => {
      oscillatorsRef.current.delete(user.id);
      setHearingIds((prev) => prev.filter((id) => id !== user.id));
    };
  }, []);

  const handlePointerDown = useCallback((event, user) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    if (target.setPointerCapture) target.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: user.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: user.x,
      originY: user.y,
    };
  }, []);

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    setUsers((prev) =>
      prev.map((u) =>
        u.id === drag.id
          ? { ...u, x: clamp(drag.originX + dx, 30, ROOM_W - 30), y: clamp(drag.originY + dy, 30, ROOM_H - 30) }
          : u
      )
    );
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const resetPositions = useCallback(() => {
    setUsers(SEED_USERS);
  }, []);

  const nearby = useMemo(() => {
    return users
      .filter((u) => !u.isSelf)
      .map((u) => ({ ...u, dist: distanceBetween(u, selfUser) }))
      .sort((a, b) => a.dist - b.dist);
  }, [users, selfUser]);

  return (
    <div className="flex flex-col gap-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold">{roomName}</h4>
            <p className="text-xs text-zinc-400">
              {joined ? 'Live • spatial audio on' : 'Not connected'} • {nearby.length} speakers
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={joined ? toggleMic : joinRoom}
            className={
              'p-2.5 rounded-full transition-all ' +
              (micMuted ? 'bg-red-500 text-white' : 'bg-[#1F2C34] text-zinc-300 hover:bg-[#2A3942]')
            }
            title={joined ? (micMuted ? 'Unmute mic' : 'Mute mic') : 'Join room'}
          >
            {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={toggleSpeaker}
            className={
              'p-2.5 rounded-full transition-all ' +
              (speakerOn ? 'bg-[#1F2C34] text-cyan-400' : 'bg-[#1F2C34] text-gray-500')
            }
            title={speakerOn ? 'Mute speakers' : 'Unmute speakers'}
          >
            {speakerOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={resetPositions}
            className="p-2.5 rounded-full bg-[#1F2C34] text-zinc-400 hover:bg-[#2A3942] transition-all"
            title="Reset positions"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={leaveRoom}
            className="p-2.5 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
            title="Leave room"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!joined && (
        <button
          type="button"
          onClick={joinRoom}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-sm font-bold text-white hover:opacity-90 transition"
        >
          Join voice room
        </button>
      )}

      {error && (
        <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div
        className="relative w-full bg-[#111B21] rounded-xl border border-[#2A3942] overflow-hidden select-none touch-none"
        style={{ height: ROOM_H }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div
          className="absolute inset-0 opacity-60 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 50% 50%, rgba(34,211,238,0.18), transparent 60%), radial-gradient(circle at 20% 80%, rgba(167,139,250,0.18), transparent 55%)',
          }}
        />
        <div className="absolute inset-0 pointer-events-none">
          {nearby.map((user) => (
            <div
              key={'link-' + user.id}
              className="absolute left-1/2 top-1/2 origin-left"
              style={{
                width: user.dist,
                height: 2,
                transform: 'rotate(' + Math.atan2(user.y - selfUser.y, user.x - selfUser.x) + 'rad)',
                background: 'linear-gradient(to right, rgba(34,211,238,0.45), rgba(34,211,238,0))',
                opacity: hearingIds.includes(user.id) ? 0.9 : 0.35,
              }}
            />
          ))}
        </div>

        {users.map((user) => {
          const dist = user.isSelf ? 0 : distanceBetween(user, selfUser);
          const closeness = clamp(1 - dist / 320, 0.15, 1);
          const isSpeaking = user.isSelf ? micLevel > 0.12 && !micMuted : hearingIds.includes(user.id);
          return (
            <div
              key={user.id}
              className="absolute flex flex-col items-center"
              style={{ left: user.x, top: user.y, transform: 'translate(-50%, -50%)' }}
            >
              <button
                type="button"
                onPointerDown={(e) => handlePointerDown(e, user)}
                onDoubleClick={() => !user.isSelf && previewSpeaker(user)}
                className="relative w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold border-2 cursor-grab active:cursor-grabbing transition-shadow"
                style={{
                  backgroundColor: user.color + '33',
                  borderColor: isSpeaking ? '#34d399' : user.color,
                  boxShadow: isSpeaking ? '0 0 0 6px rgba(52,211,153,0.22)' : 'none',
                  opacity: user.isSelf && micMuted ? 0.6 : 1,
                }}
                title={user.isSelf ? 'You (drag to move)' : 'Drag to move • double-click to hear'}
              >
                <span style={{ color: user.color }}>{user.name.charAt(0).toUpperCase()}</span>
                {user.isSelf && micMuted && (
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center border-2 border-[#0B141A]">
                    <MicOff className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </button>
              <span className="mt-1 text-[10px] font-medium text-zinc-300 whitespace-nowrap">{user.name}</span>
              {!user.isSelf && (
                <span className="text-[9px] text-zinc-500">
                  {Math.round(dist)}px • {closeness > 0.7 ? 'near' : closeness > 0.35 ? 'mid' : 'far'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {nearby.map((user) => {
          const playing = hearingIds.includes(user.id);
          return (
            <button
              key={'row-' + user.id}
              type="button"
              onClick={() => previewSpeaker(user)}
              className={
                'flex items-center justify-between gap-3 rounded-lg px-3 py-2 border text-left transition ' +
                (playing
                  ? 'bg-emerald-500/10 border-emerald-500/40'
                  : 'bg-[#1F2C34] border-[#2A3942] hover:bg-[#2A3942]')
              }
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: user.color }}
                />
                <span className="text-xs font-semibold truncate">{user.name}</span>
              </span>
              <span className="text-[10px] text-zinc-400 shrink-0">
                {playing ? 'playing…' : 'tap to hear'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span
            className={
              'w-2 h-2 rounded-full ' + (joined ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600')
            }
          />
          {joined ? 'Audio engine running' : 'Tap join to start audio'}
        </span>
        <span className="flex items-center gap-1.5">
          <Headphones className="w-3.5 h-3.5" /> HRTF panning
        </span>
        <span className="flex items-center gap-1.5">
          <Waves className="w-3.5 h-3.5" /> Mic {Math.round(micLevel * 100)}%
        </span>
      </div>
    </div>
  );
}
