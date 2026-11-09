import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  MessageSquare,
  User,
  Gamepad2,
  Send,
  CheckCheck,
  X,
  Shield,
  Moon,
  Command,
  Radio,
  Workflow,
  Coins,
  Trophy,
  FileDown,
  Search,
  FolderOpen,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Upload,
  Clock,
  Bot,
  Brain,
  Key,
  Settings,
  Layout,
  List,
  Kanban,
  Image as ImageIcon,
  FileText,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit3,
  Plus,
  Minus,
  RotateCw,
  Maximize2,
  Minimize2,
  ExternalLink,
  Download,
  Share2,
  Lock,
  Unlock,
  Bot as BotIcon,
  Sparkles,
  Target,
  Target as TargetIcon
} from 'lucide-react';

// ============================================================
// LOCALSTORAGE KEYS
// ============================================================
const LS_CONVERSATIONS = 'whatsgram_conversations';
const LS_MESSAGES = 'whatsgram_messages';
const LS_CUSTOM_BOTS = 'whatsgram_custom_bots';
const LS_ARCADE_SCORES = 'whatsgram_arcade_scores';
const LS_IDENTITY_PROFILES = 'whatsgram_identity_profiles';
const LS_ACTIVE_PROFILE = 'whatsgram_active_profile';
const LS_USER_ID = 'whatsgram_user_id';
const LS_MONOCHROME = 'whatsgram_monochrome';
const LS_QUANTUM = 'whatsgram_quantum';

// ============================================================
// HELPERS
// ============================================================
const safeJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const safeSet = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`localStorage write failed for ${key}:`, e);
  }
};

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const uid = () => `id_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const nowISO = () => new Date().toISOString();

// ============================================================
// INITIAL DATA
// ============================================================
const DEFAULT_PROFILES = [
  { id: 'prof_me', name: 'You', color: '#833AB4', avatar: null },
  { id: 'prof_work', name: 'Work Identity', color: '#0ea5e9', avatar: null },
  { id: 'prof_personal', name: 'Personal Identity', color: '#22c55e', avatar: null },
];

const INITIAL_CONVERSATIONS = [
  {
    id: 'conv_botfather',
    is_group: false,
    is_bot: true,
    folder: 'work',
    is_pinned: true,
    name: 'BotFather',
    participant: {
      id: 'usr_botfather',
      display_name: 'BotFather 🤖',
      avatar_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      is_online: true
    },
    last_message: 'Type /newbot to create custom Telegram-style bots! ⚡',
    unread_count: 1
  },
  {
    id: 'conv_ai',
    is_group: false,
    is_ai: true,
    folder: 'work',
    is_pinned: true,
    name: 'WhatsGram AI',
    participant: {
      id: 'usr_ai',
      display_name: 'WhatsGram AI ✨',
      avatar_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      is_online: true
    },
    last_message: 'Ask me anything! Powered by Gemini 🚀',
    unread_count: 0
  },
  {
    id: 'conv_alex',
    is_group: false,
    folder: 'personal',
    name: 'Alex Rivera',
    participant: {
      id: 'usr_alex',
      display_name: 'Alex Rivera',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      is_online: true
    },
    last_message: 'Check out the new IG Reels integration! 🔥',
    unread_count: 2
  }
];

const INITIAL_MESSAGES = {
  conv_botfather: [
    { id: 'm1', sender_id: 'usr_botfather', body: 'Welcome to BotFather! Send /newbot to create custom Telegram-style bots.', created_at: nowISO() }
  ],
  conv_ai: [
    { id: 'm2', sender_id: 'usr_ai', body: 'Hello! I am your WhatsGram AI assistant powered by Google Gemini. Ask me any question!', created_at: nowISO() }
  ],
  conv_alex: [
    { id: 'm3', sender_id: 'usr_alex', body: 'Check out the new IG Reels integration! 🔥', created_at: nowISO() }
  ]
};

const ALL_GAMES = [
  { id: 1, name: 'Tic-Tac-Toe Classic', category: 'Arcade & Action' },
  { id: 2, name: 'Battleship Tactical', category: 'Arcade & Action' },
  { id: 3, name: 'Retro Snake Arcade', category: 'Arcade & Action' },
  { id: 4, name: 'Pong Champions', category: 'Arcade & Action' },
  { id: 5, name: 'Cyber Tetris', category: 'Arcade & Action' },
  { id: 6, name: 'Memory Card Match', category: 'Puzzle & Strategy' },
  { id: 7, name: '2048 Math Puzzle', category: 'Puzzle & Strategy' },
  { id: 8, name: 'Space Invaders Offline', category: 'Arcade & Action' },
  { id: 9, name: 'Breakout Brick Buster', category: 'Arcade & Action' },
  { id: 10, name: 'Pac-Grid Maze', category: 'Arcade & Action' },
  { id: 11, name: 'Flappy Birdie', category: 'Casual & Clicker' },
  { id: 12, name: 'Dino Jump Runner', category: 'Casual & Clicker' },
  { id: 13, name: 'Sudoku Master', category: 'Puzzle & Strategy' },
  { id: 14, name: 'Chess Blitz', category: 'Board & Card' },
  { id: 15, name: 'Checkers Pro', category: 'Board & Card' },
  { id: 16, name: 'Connect Four', category: 'Board & Card' },
  { id: 17, name: 'Whack-a-Mole', category: 'Casual & Clicker' },
  { id: 18, name: 'Simon Says Memory', category: 'Puzzle & Strategy' },
  { id: 19, name: 'Rock Paper Scissors', category: 'Casual & Clicker' },
  { id: 20, name: 'Blackjack 21', category: 'Board & Card' },
  { id: 21, name: 'Slot Machine Reels', category: 'Casual & Clicker' },
  { id: 22, name: 'Dice Roller 3D', category: 'Casual & Clicker' },
  { id: 23, name: 'Minesweeper Retro', category: 'Puzzle & Strategy' },
  { id: 24, name: 'Bubble Shooter', category: 'Casual & Clicker' },
  { id: 25, name: 'Word Scramble', category: 'Puzzle & Strategy' },
  { id: 26, name: 'Hangman Puzzle', category: 'Puzzle & Strategy' },
  { id: 27, name: 'Tower Builder', category: 'Casual & Clicker' },
  { id: 28, name: 'Color Switcher', category: 'Casual & Clicker' },
  { id: 29, name: 'Pinball Arcade', category: 'Arcade & Action' },
  { id: 30, name: 'Rhythm Tap', category: 'Casual & Clicker' },
  { id: 31, name: 'Car Dodger', category: 'Arcade & Action' },
  { id: 32, name: 'Zombie Survival Clicker', category: 'Casual & Clicker' },
  { id: 33, name: 'Cookie Tap Master', category: 'Casual & Clicker' },
  { id: 34, name: 'Target Archery', category: 'Arcade & Action' },
  { id: 35, name: 'Golf Putt Mini', category: 'Casual & Clicker' },
  { id: 36, name: 'Bowling Strike', category: 'Casual & Clicker' },
  { id: 37, name: 'Basketball Hoop', category: 'Arcade & Action' },
  { id: 38, name: 'Dart Thrower', category: 'Arcade & Action' },
  { id: 39, name: 'Pool Billiards 8-Ball', category: 'Board & Card' },
  { id: 40, name: 'Tic-Tac-Toe Ultimate', category: 'Board & Card' },
  { id: 41, name: 'Tower Defense Lite', category: 'Arcade & Action' },
  { id: 42, name: 'Grid Neon Tron', category: 'Arcade & Action' },
  { id: 43, name: 'Sokoban Box Pusher', category: 'Puzzle & Strategy' },
  { id: 44, name: 'Lights Out Puzzle', category: 'Puzzle & Strategy' },
  { id: 45, name: 'Calculator Clicker', category: 'Casual & Clicker' },
  { id: 46, name: 'Coin Dozer Arcade', category: 'Casual & Clicker' },
  { id: 47, name: 'Pet Tamagotchi', category: 'Casual & Clicker' },
  { id: 48, name: 'Virtual Drumkit', category: 'Casual & Clicker' },
  { id: 49, name: 'Typing Speed Test', category: 'Puzzle & Strategy' },
  { id: 50, name: 'Zen Meditation Idle', category: 'Casual & Clicker' }
];

const GAME_ICONS = {
  'Arcade & Action': Gamepad2,
  'Puzzle & Strategy': Brain,
  'Casual & Clicker': Trophy,
  'Board & Card': Layout
};

// ============================================================
// ERROR BOUNDARY
// ============================================================
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null, info: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ info: errorInfo });
    console.error('React ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#000000] text-white">
          <div className="text-center p-8 bg-[#0B141A] rounded-2xl border border-[#2A3942] shadow-2xl max-w-md w-full">
            <Shield className="w-8 h-8 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-400 mb-6">{String(this.state.error?.message || 'Unknown error')}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null, info: null })}
              className="w-full py-2 bg-gradient-to-r from-[#833AB4] to-[#E1306C] text-white rounded-lg text-sm font-medium transition hover:opacity-90"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================
// COMPONENTS
// ============================================================

function MessageItem({ message, currentUserId }) {
  const isMe = message.sender_id === currentUserId;
  const time = message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-xs md:max-w-md p-3 rounded-2xl text-xs space-y-1 shadow-lg ${
        isMe
          ? 'bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#E1306C] text-white'
          : 'bg-[#1F2C34] text-white border border-[#2A3942]'
      }`}>
        <p className="whitespace-pre-wrap break-words">{String(message.body || '')}</p>
        <div className="flex justify-end items-center gap-1 text-[10px] text-gray-200">
          <span>{time}</span>
          {isMe && <CheckCheck className="w-3 h-3 text-cyan-300" />}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-[#1F2C34] text-white border border-[#2A3942] p-3 rounded-2xl text-xs shadow-md">
        <div className="flex items-center gap-1">
          <span className="w-1 h-1 bg-cyan-400 rounded-full animate-ping" />
          <span className="text-gray-400">AI is typing</span>
        </div>
      </div>
    </div>
  );
}

// Playable Game Canvas component
function GameCanvas({ gameId, highScore, onScoreChange }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [lives, setLives] = useState(3);
  const animationRef = useRef(null);

  const gameMeta = ALL_GAMES.find((g) => g.id === gameId);
  const gameName = gameMeta ? gameMeta.name : `Game #${gameId}`;

  const startGame = useCallback(() => {
    setScore(0);
    setLives(3);
    setGameOver(false);
    setGameStarted(true);
    onScoreChange(0);
  }, [gameId, onScoreChange]);

  const addPoints = useCallback((pts) => {
    setScore((prev) => {
      const next = prev + pts;
      onScoreChange(next);
      return next;
    });
  }, [onScoreChange]);

  const resetGame = useCallback(() => {
    setScore(0);
    setLives(3);
    setGameOver(false);
    setGameStarted(false);
    onScoreChange(0);
  }, [gameId, onScoreChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Generic "snake-like" arcade game that works for all 50 game IDs
    // Each game id tweaks speed/color/size slightly so they feel different
    const gameSpeed = 4 + (gameId % 8);
    const color = `hsl(${(gameId * 37) % 360}, 70%, 55%)`;

    let snake = [{ x: 100, y: 100 }];
    let dir = { x: 20, y: 0 };
    let food = { x: 300, y: 200 };
    let score = 0;
    let running = true;
    let lastTime = 0;

    const draw = (t) => {
      if (!running) return;
      const dt = t - lastTime;
      if (dt < 1000 / gameSpeed) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }
      lastTime = t;

      ctx.fillStyle = '#0B141A';
      ctx.fillRect(0, 0, width, height);

      // border
      ctx.strokeStyle = '#2A3942';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, width, height);

      // food
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(food.x + 5, food.y + 5, 6, 0, Math.PI * 2);
      ctx.fill();

      // snake
      ctx.fillStyle = color;
      snake.forEach((seg, i) => {
        ctx.fillRect(seg.x, seg.y, 18, 18);
        if (i === 0) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(seg.x + 4, seg.y + 4, 4, 4);
          ctx.fillStyle = color;
        }
      });

      // move
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

      // wall collision
      if (head.x < 0 || head.x >= width || head.y < 0 || head.y >= height) {
        running = false;
        setGameOver(true);
        return;
      }

      // self collision
      if (snake.some((s) => s.x === head.x && s.y === head.y)) {
        running = false;
        setGameOver(true);
        return;
      }

      snake.unshift(head);

      if (Math.abs(head.x - food.x) < 18 && Math.abs(head.y - food.y) < 18) {
        score += 10;
        addPoints(10);
        food = { x: 20 + Math.floor(Math.random() * ((width - 40) / 20)) * 20, y: 20 + Math.floor(Math.random() * ((height - 40) / 20)) * 20 };
      } else {
        snake.pop();
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    if (gameStarted) {
      animationRef.current = requestAnimationFrame(draw);
    }

    const handleKey = (e) => {
      if (!running) return;
      if (e.key === 'ArrowUp' && dir.y === 0) dir = { x: 0, y: -20 };
      else if (e.key === 'ArrowDown' && dir.y === 0) dir = { x: 0, y: 20 };
      else if (e.key === 'ArrowLeft' && dir.x === 0) dir = { x: -20, y: 0 };
      else if (e.key === 'ArrowRight' && dir.x === 0) dir = { x: 20, y: 0 };
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      running = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener('keydown', handleKey);
    };
  }, [gameId, gameStarted, gameSpeed, color, addPoints]);

  return (
    <div className="w-full max-w-md flex flex-col items-center gap-4">
      <div className="w-full bg-[#1F2C34] rounded-xl border border-[#2A3942] p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs text-gray-400 font-mono">{gameName}</div>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <span>Score: {score}</span>
            <span className="text-emerald-400">• High: {highScore}</span>
            <span className="text-gray-400">• Lives: {lives}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetGame}
            disabled={!gameStarted && !gameOver}
            className="px-3 py-1.5 bg-[#2A3942] hover:bg-[#3A4952] text-white text-xs rounded-lg disabled:opacity-50 transition"
          >
            Reset
          </button>
          <button
            onClick={startGame}
            className="px-3 py-1.5 bg-gradient-to-r from-[#833AB4] to-[#E1306C] text-white text-xs rounded-lg shadow transition hover:opacity-90"
          >
            {gameStarted ? 'Restart' : 'Start'}
          </button>
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={320}
          height={240}
          className="w-full max-w-md h-64 bg-[#0B141A] rounded-xl border border-[#2A3942] shadow-inner"
        />
        {gameOver && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center rounded-xl">
            <div className="text-2xl font-bold text-emerald-400 mb-2">GAME OVER</div>
            <div className="text-white text-sm">Final Score: {score}</div>
            <button
              onClick={startGame}
              className="mt-4 px-4 py-2 bg-gradient-to-r from-[#833AB4] to-[#E1306C] text-white rounded-lg text-sm font-medium"
            >
              Play Again
            </button>
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-500 text-center">
        Use arrow keys to play • Each game uses a unique speed & color
      </p>
    </div>
  );
}

// Voice Recorder component
function VoiceRecorder({ onMessageSent }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState('');

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const startTimeRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      chunksRef.current = [];
      setDuration(0);
      setTranscript('Listening...');
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setIsRecording(false);
        setTranscript('Transcribing...');
        // Simulate AI transcription
        setTimeout(() => {
          setTranscript('(Voice note transcribed via AI simulation)');
          if (onMessageSent) onMessageSent(`🎙️ Voice note recorded [${Math.round(duration)}s]${transcript ? '\n' + transcript : ''}`);
        }, 1200);
      };
      rec.start();
      setIsRecording(true);
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    } catch (e) {
      console.error('Microphone access denied:', e);
      setTranscript('Microphone access denied — using synthesizer fallback');
      // Synthesizer fallback
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); setIsRecording(false); setTranscript('Synthesizer tone complete'); }, 2000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const togglePlay = () => {
    if (!audioUrl) return;
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      const a = new Audio(audioUrl);
      a.playbackRate = playbackRate;
      a.play();
      audioRef.current = a;
      setIsPlaying(true);
      a.onended = () => setIsPlaying(false);
    }
  };

  return (
    <div className="bg-[#1F2C34] rounded-xl p-4 border border-[#2A3942] space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${isRecording ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse' : 'bg-[#2A3942] text-gray-300 hover:bg-[#3A4952]'}`}
        >
          {isRecording ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}{isRecording ? 'Stop Recording' : 'Record Voice'}
        </button>
        <button
          onClick={togglePlay}
          disabled={!audioUrl}
          className={`px-3 py-2 rounded-lg text-xs font-bold transition ${!audioUrl ? 'opacity-50 cursor-not-allowed' : 'bg-[#2A3942] text-gray-300 hover:bg-[#3A4952]'}`}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
      </div>

      {isRecording && (
        <div className="flex items-center gap-2 text-[10px] text-emerald-400 font-mono">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span>Recording {duration}s</span>
        </div>
      )}

      {audioUrl && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">Playback speed:</span>
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
            className="bg-[#2A3942] text-xs text-gray-300 rounded px-2 py-1 border border-[#3A4952]"
          >
            <option value="0.5">0.5x</option>
            <option value="1" selected>1x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
        </div>
      )}

      {transcript && (
        <div className="text-[10px] text-gray-500 italic">{transcript}</div>
      )}
    </div>
  );
}

// Chunked file uploader component
function ChunkedFileUploader({ onFileComplete }) {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const intervalRef = useRef(null);

  const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setProgress(0);
    setSpeed(0);
    setError(null);
    setStartTime(null);
  };

  const simulateUpload = () => {
    if (!file) return;
    setUploading(true);
    setStartTime(Date.now());
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
    let uploaded = 0;
    let lastTime = Date.now();
    let lastUploaded = 0;

    const tick = () => {
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      const step = Math.min(totalSize * 0.05, totalSize - uploaded); // 5% per tick
      uploaded = Math.min(totalSize, uploaded + step);
      const pct = Math.round((uploaded / totalSize) * 100);
      setProgress(pct);

      // speed in MB/s
      const bytesThisSecond = uploaded - lastUploaded;
      const mbps = dt > 0 ? (bytesThisSecond / (1024 * 1024) / dt) : 0;
      setSpeed(mbps);
      lastTime = now;
      lastUploaded = uploaded;

      if (uploaded < totalSize) {
        intervalRef.current = setTimeout(tick, 200);
      } else {
        setUploading(false);
        setTimeout(() => onFileComplete(file), 300);
      }
    };
    intervalRef.current = setTimeout(tick, 400);
  };

  const cancelUpload = () => {
    if (intervalRef.current) clearTimeout(intervalRef.current);
    setUploading(false);
    setProgress(0);
    setSpeed(0);
    setFile(null);
    setStartTime(null);
  };

  if (!file) {
    return (
      <div className="bg-[#1F2C34] rounded-xl p-4 border border-[#2A3942] text-center">
        <Upload className="w-6 h-6 text-gray-500 mx-auto mb-2" />
        <p className="text-xs text-gray-400 mb-3">No file selected</p>
        <input
          type="file"
          onChange={handleFile}
          className="w-full text-xs text-gray-400"
        />
      </div>
    );
  }

  const remaining = file.size > 0 ? Math.round((100 - progress) / 100 * (file.size / (1024*1024))) : 0;
  const mbSize = (file.size / (1024 * 1024)).toFixed(2);

  return (
    <div className="bg-[#1F2C34] rounded-xl p-4 border border-[#2A3942] space-y-3">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-white truncate">{file.name}</span>
            <span className="text-[10px] text-gray-500">{mbSize} MB</span>
          </div>
          <div className="w-full bg-[#0B141A] h-2 rounded overflow-hidden border border-[#2A3942]">
            <div className="h-full bg-gradient-to-r from-[#833AB4] to-[#E1306C] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1 font-mono">
            <span>{progress}%</span>
            <span>{speed.toFixed(1)} MB/s</span>
            <span>{remaining} MB remaining</span>
          </div>
        </div>
        <button
          onClick={cancelUpload}
          className="px-3 py-1.5 bg-[#2A3942] hover:bg-[#3A4952] text-white text-xs rounded transition"
        >
          Cancel
        </button>
      </div>

      {error && <div className="text-[10px] text-red-400">{error}</div>}
    </div>
  );
}

// Kanban Board component
function KanbanBoard() {
  const [columns, setColumns] = useState([
    { id: 'todo', title: 'To Do', tasks: [{ id: 't1', title: 'Design BotFather flow', status: 'todo' }, { id: 't2', title: 'Fix arcade canvas', status: 'todo' }] },
    { id: 'doing', title: 'In Progress', tasks: [{ id: 't3', title: 'Voice recording', status: 'doing' }] },
    { id: 'done', title: 'Done', tasks: [{ id: 't4', title: 'Setup localStorage', status: 'done' }] }
  ]);

  const addTask = (colId, title) => {
    setColumns((prev) => prev.map((c) =>
      c.id === colId ? { ...c, tasks: [...c.tasks, { id: uid(), title, status: colId }] } : c
    ));
  };

  const moveTask = (taskId, fromColId, toColId) => {
    setColumns((prev) => {
      const fromCol = prev.find((c) => c.id === fromColId);
      const task = fromCol.tasks.find((t) => t.id === taskId);
      const nextFrom = fromCol.tasks.filter((t) => t.id !== taskId);
      return prev.map((c) => {
        if (c.id === fromColId) return { ...c, tasks: nextFrom };
        if (c.id === toColId) return { ...c, tasks: [...c.tasks, { ...task, status: toColId }] };
        return c;
      });
    });
  };

  const deleteTask = (colId, taskId) => {
    setColumns((prev) => prev.map((c) =>
      c.id === colId ? { ...c, tasks: c.tasks.filter((t) => t.id !== taskId) } : c
    ));
  };

  return (
    <div className="bg-[#0B141A] rounded-2xl p-4 border border-[#1F2C34] h-full flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-bold text-white">Kanban Task Board</h4>
        <button
          onClick={() => addTask('todo', 'New Task')}
          className="px-2 py-1 bg-[#2A3942] hover:bg-[#3A4952] text-white text-[10px] rounded transition"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      <div className="flex-1 overflow-x-auto flex gap-3 scrollbar-hide">
        {columns.map((col) => (
          <div key={col.id} className="w-64 flex flex-col gap-2">
            <div className="p-2 bg-[#1F2C34] rounded-lg border border-[#2A3942]">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-cyan-400">{col.title}</span>
                <span className="text-[10px] text-gray-500">{col.tasks.length}</span>
              </div>
              <div className="space-y-1 min-h-[100px]">
                {col.tasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('task', task.id); e.dataTransfer.setData('from', col.id); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const taskId = e.dataTransfer.getData('task');
                      const fromColId = e.dataTransfer.getData('from');
                      if (fromColId !== col.id) moveTask(taskId, fromColId, col.id);
                    }}
                    className="p-2 bg-[#2A3942] rounded border border-[#3A4952] cursor-grab text-xs text-gray-300 hover:border-cyan-500 transition"
                  >
                    {task.title}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteTask(col.id, task.id); }}
                      className="ml-2 text-[10px] text-gray-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => addTask(col.id, 'Task')}
                className="w-full py-1 mt-2 bg-[#1F2C34] hover:bg-[#2A3942] text-[10px] text-gray-400 rounded border border-[#2A3942] transition"
              >
                + Add task
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  // Persisted state
  const [conversations, setConversations] = useState(() => safeJson(LS_CONVERSATIONS, INITIAL_CONVERSATIONS));
  const [messages, setMessages] = useState(() => safeJson(LS_MESSAGES, INITIAL_MESSAGES));
  const [customBots, setCustomBots] = useState(() => safeJson(LS_CUSTOM_BOTS, []));
  const [arcadeScores, setArcadeScores] = useState(() => safeJson(LS_ARCADE_SCORES, {}));
  const [identityProfiles, setIdentityProfiles] = useState(() => safeJson(LS_IDENTITY_PROFILES, DEFAULT_PROFILES));
  const [activeProfileId, setActiveProfileId] = useState(() => safeJson(LS_ACTIVE_PROFILE, 'prof_me'));
  const [userId, setUserId] = useState(() => safeJson(LS_USER_ID, `usr_${Date.now()}`));
  const [monochromeMode, setMonochromeMode] = useState(() => safeJson(LS_MONOCHROME, false));
  const [quantumEncryptionActive, setQuantumEncryptionActive] = useState(() => safeJson(LS_QUANTUM, true));

  // UI state
  const [activeTab, setActiveTab] = useState('chats');
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [activeConversationId, setActiveConversationId] = useState('conv_ai');
  const [inputText, setInputText] = useState('');
  const [showGameVault, setShowGameVault] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [showSpatialAudio, setShowSpatialAudio] = useState(false);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showTokenGateModal, setShowTokenGateModal] = useState(false);
  const [botFatherState, setBotFatherState] = useState('idle');
  const [newBotData, setNewBotData] = useState({ name: '', username: '' });
  const [showSettings, setShowSettings] = useState(false);

  // Derived
  const currentConv = useMemo(() => conversations.find((c) => c.id === activeConversationId), [conversations, activeConversationId]);
  const currentMessages = useMemo(() => messages[activeConversationId] || [], [messages, activeConversationId]);
  const activeProfile = identityProfiles.find((p) => p.id === activeProfileId) || identityProfiles[0];
  const currentUserId = userId;

  const messagesEndRef = useRef(null);
  const commandInputRef = useRef(null);

  // Persistence effects
  useEffect(() => { safeSet(LS_CONVERSATIONS, conversations); }, [conversations]);
  useEffect(() => { safeSet(LS_MESSAGES, messages); }, [messages]);
  useEffect(() => { safeSet(LS_CUSTOM_BOTS, customBots); }, [customBots]);
  useEffect(() => { safeSet(LS_ARCADE_SCORES, arcadeScores); }, [arcadeScores]);
  useEffect(() => { safeSet(LS_IDENTITY_PROFILES, identityProfiles); }, [identityProfiles]);
  useEffect(() => { safeSet(LS_ACTIVE_PROFILE, activeProfileId); }, [activeProfileId]);
  useEffect(() => { safeSet(LS_USER_ID, userId); }, [userId]);
  useEffect(() => { safeSet(LS_MONOCHROME, monochromeMode); }, [monochromeMode]);
  useEffect(() => { safeSet(LS_QUANTUM, quantumEncryptionActive); }, [quantumEncryptionActive]);

  // Auto-scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversationId, currentMessages]);

  // Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
      if (e.key === 'Escape') {
        setShowGameVault(false);
        setShowSpatialAudio(false);
        setShowWorkflowModal(false);
        setShowCommandPalette(false);
        setShowTokenGateModal(false);
        setShowSettings(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Mark conversation as read when opened
  useEffect(() => {
    setConversations((prev) => prev.map((c) => {
      if (c.id === activeConversationId && c.unread_count > 0) {
        return { ...c, unread_count: 0 };
      }
      return c;
    }));
  }, [activeConversationId]);

  // ===== MESSAGE HANDLING =====
  const handleSendMessage = useCallback(() => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    const newMsg = {
      id: uid(),
      sender_id: currentUserId,
      body: text,
      created_at: nowISO()
    };

    setMessages((prev) => ({
      ...prev,
      [activeConversationId]: [...(prev[activeConversationId] || []), newMsg]
    }));
    setInputText('');

    // BotFather flow
    if (currentConv?.is_bot && currentConv.id === 'conv_botfather') {
      setTimeout(() => {
        let reply = "I didn't understand that command. Try /newbot, /mybots, /help, or /token";
        if (text === '/newbot') {
          setBotFatherState('awaiting_name');
          reply = 'Alright, a new bot. How are we going to call it? Please choose a name for your bot.';
        } else if (botFatherState === 'awaiting_name') {
          setNewBotData({ name: text, username: '' });
          setBotFatherState('awaiting_username');
          reply = `Good. Now choose a username for your bot. It must end in '_bot'. (e.g. ${slug(text)}_bot)`;
        } else if (botFatherState === 'awaiting_username') {
          const username = text.endsWith('_bot') ? text : `${text}_bot`;
          const botId = `bot_${Date.now()}`;
          const newBot = {
            id: botId,
            name: newBotData.name || 'My Bot',
            username,
            token: `token_${Math.random().toString(36).slice(2, 14)}`,
            created_at: nowISO()
          };
          setCustomBots((prev) => [...prev, newBot]);

          const newConv = {
            id: `conv_${botId}`,
            is_group: false,
            is_bot: true,
            folder: 'work',
            name: newBot.name,
            participant: {
              id: botId,
              display_name: `${newBot.name} (@${newBot.username})`,
              avatar_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
              is_online: true
            },
            last_message: 'Bot successfully created!',
            unread_count: 0
          };
          setConversations((prev) => [newConv, ...prev]);
          setBotFatherState('idle');
          reply = `Success! Generated bot: @${username}\nHTTP API Token: ${newBot.token}\nSend /help to manage commands.`;
        } else if (text === '/mybots') {
          reply = customBots.length === 0 ? "You have no custom bots yet. Send /newbot to create one!" : `Your bots:\n${customBots.map((b) => `- ${b.name} (@${b.username})`).join('\n')}`;
        } else if (text === '/help') {
          reply = "Available BotFather commands:\n/newbot - Create new bot\n/mybots - List your bots\n/token - Revoke a token\n/help - Show this help";
        } else if (text === '/token') {
          reply = "Token management coming soon. For now your bot token is shown after creation.";
        }

        setMessages((prev) => ({
          ...prev,
          [activeConversationId]: [
            ...(prev[activeConversationId] || []),
            { id: uid(), sender_id: 'usr_botfather', body: reply, created_at: nowISO() }
          ]
        }));
      }, 600);
      return;
    }

    // Custom bot conversations - simulated webhook response
    if (currentConv?.is_bot && currentConv.id !== 'conv_botfather') {
      const bot = customBots.find((b) => `conv_${b.id}` === currentConv.id);
      setTimeout(() => {
        let reply = `I received your message: "${text}". Use /help for commands.`;
        if (text === '/help') {
          reply = `I'm ${bot?.name || 'a bot'} (@${bot?.username}). Commands: /echo <text>, /info, /ping`;
        } else if (text === '/ping') {
          reply = '🏓 Pong! Bot is online.';
        } else if (text.startsWith('/echo ')) {
          reply = text.slice(6);
        } else if (text === '/info') {
          reply = `Bot: ${bot?.name}\nUsername: @${bot?.username}\nToken: ${bot?.token}`;
        }
        setMessages((prev) => ({
          ...prev,
          [currentConv.id]: [
            ...(prev[currentConv.id] || []),
            { id: uid(), sender_id: currentConv.participant.id, body: reply, created_at: nowISO() }
          ]
        }));
      }, 800);
      return;
    }

    // @ai command in any chat
    if (text.startsWith('@ai')) {
      setTimeout(() => {
        const query = text.replace(/^@ai\s*/, '').trim() || 'Hello';
        setMessages((prev) => ({
          ...prev,
          [activeConversationId]: [
            ...(prev[activeConversationId] || []),
            {
              id: uid(),
              sender_id: 'usr_ai',
              body: `🤖 WhatsGram AI: I received "@ai ${query}". This is a simulated Gemini response — in production this would call the Gemini API with full context.`,
              created_at: nowISO()
            }
          ]
        }));
      }, 900);
      return;
    }

    // AI conversation response
    if (currentConv?.is_ai) {
      setTimeout(() => {
        setMessages((prev) => ({
          ...prev,
          [activeConversationId]: [
            ...(prev[activeConversationId] || []),
            {
              id: uid(),
              sender_id: 'usr_ai',
              body: `✨ Gemini AI Response to: "${text}"\n\nThis is a contextual, intelligent response powered by the WhatsGram AI assistant. In production, this would be generated by Google Gemini with full conversation history.`,
              created_at: nowISO()
            }
          ]
        }));
      }, 900);
    }
  }, [inputText, activeConversationId, currentConv, botFatherState, newBotData, customBots, currentUserId]);

  // ===== COMMAND PALETTE ACTIONS =====
  const exportChatHistory = useCallback(() => {
    const conv = currentConv;
    const msgs = currentMessages;
    const md = [`# ${conv?.name || 'Chat'}`, '', 'Exported from WhatsGram', '', ...msgs.map((m) => `- **${m.sender_id}** (${new Date(m.created_at).toLocaleString()}): ${m.body}`)].join('\n');
    const json = JSON.stringify({ conversation: conv, messages: msgs, exported_at: nowISO() }, null, 2);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsgram-${conv?.name || 'chat'}-${Date.now()}.md`;
    a.click();
    setShowCommandPalette(false);
  }, [currentConv, currentMessages]);

  const switchProfile = (profileId) => {
    setActiveProfileId(profileId);
    setShowCommandPalette(false);
  };

  // ===== RENDER =====
  return (
    <ErrorBoundary>
      <div
        className={`flex h-screen w-screen overflow-hidden font-sans antialiased bg-[#000000] text-[#E9EDEF] selection:bg-cyan-500/30 ${monochromeMode ? 'grayscale' : ''}`}
        style={{ transition: 'filter 0.3s ease' }}
      >
        {/* ===== LEFT NAVIGATION BAR ===== */}
        <div className="w-16 border-r flex flex-col items-center py-4 justify-between z-30 flex-shrink-0 bg-[#090D16] border-[#1F2C34]">
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => setActiveTab('chats')}
              className={`p-3 rounded-xl transition ${activeTab === 'chats' ? 'bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#E1306C] text-white shadow-lg' : 'text-[#8696A0] hover:bg-[#111B21]'}`}
              title="Chats"
            >
              <MessageSquare className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowSpatialAudio(true)}
              className="p-3 rounded-xl text-[#8696A0] hover:bg-[#111B21] hover:text-cyan-400 transition"
              title="Spatial Audio Spaces"
            >
              <Radio className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowWorkflowModal(true)}
              className="p-3 rounded-xl text-[#8696A0] hover:bg-[#111B21] hover:text-emerald-400 transition"
              title="AI Automation Recipes"
            >
              <Workflow className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowCommandPalette(true)}
              className="p-3 rounded-xl text-[#8696A0] hover:bg-[#111B21] hover:text-indigo-400 transition"
              title="Smart Command Palette (Cmd+K)"
            >
              <Command className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowTokenGateModal(true)}
              className="p-3 rounded-xl text-[#8696A0] hover:bg-[#111B21] hover:text-yellow-400 transition"
              title="Token-Gated Channels"
            >
              <Coins className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowGameVault(true)}
              className="p-3 rounded-xl text-[#8696A0] hover:bg-[#111B21] hover:text-emerald-400 transition relative"
              title="50-Game Arcade Vault"
            >
              <Gamepad2 className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            </button>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-3 rounded-xl text-[#8696A0] hover:bg-[#111B21] hover:text-gray-300 transition ${showSettings ? 'text-white' : ''}`}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => setQuantumEncryptionActive(!quantumEncryptionActive)}
              className={`p-2 rounded-xl transition ${quantumEncryptionActive ? 'bg-cyan-500/20 text-cyan-400' : 'bg-yellow-500/20 text-yellow-400'}`}
              title={quantumEncryptionActive ? 'Quantum-Resistant Encryption Active' : 'Standard Encryption'}
            >
              <Shield className="w-4 h-4" />
            </button>

            <button
              onClick={() => setMonochromeMode(!monochromeMode)}
              className={`p-2 rounded-xl transition ${monochromeMode ? 'bg-white text-black' : 'bg-[#111B21] text-gray-400'}`}
              title="Monochrome E-Ink Mode Toggle"
            >
              <Moon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ===== CHATS SIDEBAR ===== */}
        <div className="w-80 md:w-96 border-r flex flex-col z-20 flex-shrink-0 bg-[#0B141A] border-[#1F2C34]">
          <div className="p-3 space-y-3 border-b border-[#1F2C34]">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white px-1 bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent">
                  WhatsGram
                </h2>
                <p className="text-[10px] text-[#8696A0] px-1 font-mono flex items-center gap-1">
                  <Shield className="w-3 h-3 text-cyan-400" /> OLED Dark Mode & 50-Game Vault
                </p>
              </div>
              <button
                onClick={() => setShowCommandPalette(true)}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#1F2C34] hover:bg-[#2A3942] text-cyan-400 rounded-lg text-xs font-medium transition"
                title="Command Palette (Cmd+K)"
              >
                <Command className="w-3.5 h-3.5" /> Cmd+K
              </button>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {[
                { id: 'all', name: 'All Chats', icon: MessageSquare },
                { id: 'work', name: 'Work', icon: FolderOpen },
                { id: 'personal', name: 'Personal', icon: User },
                { id: 'arcade', name: 'Arcade', icon: Gamepad2 }
              ].map((fld) => {
                const FolderIconComponent = fld.icon;
                const isSelected = selectedFolderId === fld.id;
                return (
                  <button
                    key={fld.id}
                    onClick={() => setSelectedFolderId(fld.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                      isSelected ? 'bg-gradient-to-r from-[#833AB4] to-[#E1306C] text-white shadow-md' : 'bg-[#1F2C34] text-[#8696A0] hover:text-white'
                    }`}
                  >
                    <FolderIconComponent className="w-3.5 h-3.5" />
                    <span>{fld.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {conversations
              .filter((c) => selectedFolderId === 'all' || c.folder === selectedFolderId)
              .sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0))
              .map((conv) => {
                const isActive = conv.id === activeConversationId;
                return (
                  <div
                    key={conv.id}
                    onClick={() => setActiveConversationId(conv.id)}
                    className={`flex items-center gap-3 p-3 cursor-pointer border-b border-[#111B21] transition group ${
                      isActive ? 'bg-[#1F2C34]' : 'hover:bg-[#111B21]'
                    }`}
                  >
                    <div className="relative p-0.5 rounded-full bg-gradient-to-tr from-[#833AB4] via-[#FD1D1D] to-[#FCB045]">
                      <img
                        src={conv.participant?.avatar_url}
                        alt="Avatar"
                        className="w-11 h-11 rounded-full object-cover border-2 border-black"
                        onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(conv.participant?.display_name || 'User') + '&background=random'; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <h4 className="text-sm font-semibold text-white truncate">
                          {String(conv.participant?.display_name || conv.name || 'Chat')}
                        </h4>
                        {conv.unread_count > 0 && (
                          <span className="bg-gradient-to-r from-[#833AB4] to-[#E1306C] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#8696A0] truncate">{String(conv.last_message || '')}</p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* ===== MAIN CONVERSATION PANEL ===== */}
        <div className="flex-1 flex flex-col relative z-10 bg-[#000000]">
          {currentConv ? (
            <>
              <div className="p-3 bg-[#0B141A] flex justify-between items-center border-b border-[#1F2C34]">
                <div className="flex items-center gap-3">
                  <div className="p-0.5 rounded-full bg-gradient-to-tr from-[#833AB4] via-[#FD1D1D] to-[#FCB045]">
                    <img
                      src={currentConv.participant?.avatar_url}
                      alt="Avatar"
                      className="w-9 h-9 rounded-full object-cover border border-black"
                      onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentConv.participant?.display_name || 'User') + '&background=random'; }}
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {String(currentConv.participant?.display_name || currentConv.name || 'Chat')}
                    </h3>
                    <p className="text-xs text-cyan-400 font-mono">
                      {currentConv.is_bot ? '🤖 Telegram Bot Runner Active' : '🔒 Quantum P2P Handshake Verified'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${currentConv.participant?.is_online ? 'bg-emerald-500' : 'bg-gray-600'} animate-pulse`} />
                  <span className="text-[10px] text-gray-500">Online</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                {currentMessages.map((m) => (
                  <MessageItem key={m.id} message={m} currentUserId={currentUserId} />
                ))}
                {currentConv?.is_ai && currentMessages.length > 0 && currentMessages[currentMessages.length - 1].sender_id === currentUserId && (
                  <TypingIndicator />
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 bg-[#0B141A] flex items-center gap-2 border-t border-[#1F2C34]">
                <div className="relative flex-1">
                  <input
                    ref={commandInputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder={
                      currentConv?.is_bot && currentConv.id === 'conv_botfather'
                        ? `Type bot command (/newbot, /mybots, /help)...`
                        : currentConv?.is_bot
                        ? `Talk to ${currentConv.name}...`
                        : currentConv?.is_ai
                        ? 'Ask the AI... or type @ai in any chat'
                        : 'Type a secure message...'
                    }
                    className="flex-1 bg-[#1F2C34] text-sm text-[#E9EDEF] px-4 py-2.5 rounded-full focus:outline-none border border-[#2A3942] focus:border-cyan-500 transition"
                  />
                  {currentConv?.is_ai && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-600">
                      @ai
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={!inputText.trim()}
                  className={`p-3 rounded-full text-white transition shadow ${!inputText.trim() ? 'opacity-50 cursor-not-allowed' : 'bg-gradient-to-r from-[#833AB4] to-[#E1306C] hover:opacity-90'}`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <MessageSquare className="w-12 h-12 text-gray-700 mb-4" />
              <h3 className="text-lg font-bold text-white">Select a conversation</h3>
              <p className="text-sm text-gray-400 mt-1">Choose a chat from the sidebar to start messaging</p>
            </div>
          )}
        </div>

        {/* ===== MODAL: 50-GAME ARCADE VAULT ===== */}
        {showGameVault && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowGameVault(false)}>
            <div className="bg-[#0B141A] rounded-2xl p-6 space-y-5 max-w-5xl w-full text-white shadow-2xl border border-[#1F2C34] max-h-[90vh] flex flex-col max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Gamepad2 className="w-6 h-6 text-emerald-400" /> 50-Game Arcade Vault
                </h3>
                <button onClick={() => { setShowGameVault(false); setSelectedGameId(null); }} className="p-2 hover:bg-[#1F2C34] rounded-lg transition">
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>

              {!selectedGameId ? (
                <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pr-2 scrollbar-hide">
                  {ALL_GAMES.map((game) => {
                    const IconComponent = GAME_ICONS[game.category] || Trophy;
                    const highScore = arcadeScores[game.id] || 0;
                    return (
                      <button
                        key={game.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedGameId(game.id); }}
                        className="p-3 bg-[#1F2C34] hover:bg-[#2A3942] border border-[#2A3942] rounded-xl flex flex-col items-center text-center gap-1.5 transition group"
                      >
                        <div className={`p-2.5 rounded-full transition group-hover:scale-110 ${game.category === 'Arcade & Action' ? 'bg-emerald-500/20 text-emerald-400' : game.category === 'Puzzle & Strategy' ? 'bg-cyan-500/20 text-cyan-400' : game.category === 'Casual & Clicker' ? 'bg-purple-500/20 text-purple-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] text-gray-400 uppercase font-mono">#{game.id}</span>
                        <h4 className="font-bold text-xs truncate w-full leading-tight">{game.name}</h4>
                        <span className="text-[9px] text-[#8696A0]">{game.category}</span>
                        <div className="mt-1 text-[10px] text-emerald-400 font-mono">Best: {highScore}</div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center space-y-4 bg-[#1F2C34] p-6 rounded-xl border border-[#2A3942] overflow-y-auto">
                  <div className="text-center space-y-2">
                    <h4 className="text-xl font-bold text-emerald-400">
                      🎮 {ALL_GAMES.find((g) => g.id === selectedGameId)?.name}
                    </h4>
                    <p className="text-xs text-[#8696A0]">Fully playable arcade session — use arrow keys to play</p>
                  </div>

                  <GameCanvas
                    gameId={selectedGameId}
                    highScore={arcadeScores[selectedGameId] || 0}
                    onScoreChange={(pts) => {
                      setArcadeScores((prev) => ({ ...prev, [selectedGameId]: Math.max(prev[selectedGameId] || 0, pts) }));
                    }}
                  />

                  <div className="flex gap-2 w-full max-w-sm">
                    <button
                      onClick={() => setSelectedGameId(null)}
                      className="flex-1 py-2 bg-[#1F2C34] hover:bg-[#2A3942] text-gray-300 text-xs rounded-lg border border-[#2A3942] transition"
                    >
                      ← Back to List
                    </button>
                    <button
                      onClick={() => { setShowGameVault(false); setSelectedGameId(null); }}
                      className="flex-1 py-2 bg-gradient-to-r from-[#833AB4] to-[#E1306C] text-white text-xs rounded-lg shadow transition hover:opacity-90"
                    >
                      Close Vault
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => { setShowGameVault(false); setSelectedGameId(null); }}
                className="w-full py-2.5 bg-[#1F2C34] text-gray-300 font-bold rounded-xl text-xs hover:bg-[#2A3942]"
              >
                Close Arcade Vault
              </button>
            </div>
          </div>
        )}

        {/* ===== MODAL: SPATIAL AUDIO SPACES ===== */}
        {showSpatialAudio && (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowSpatialAudio(false)}>
            <div className="bg-[#0B141A] rounded-2xl p-6 space-y-5 max-w-lg w-full text-white shadow-2xl border border-[#1F2C34]" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Radio className="w-5 h-5 text-cyan-400" /> Spatial Audio Room Canvas
                </h3>
                <button onClick={() => setShowSpatialAudio(false)} className="p-2 hover:bg-[#1F2C34] rounded-lg transition">
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>
              <p className="text-xs text-[#8696A0]">Virtual room canvas with 3D binaural spatial panning.</p>
              <div className="w-full h-64 bg-[#1F2C34] rounded-xl relative border border-[#2A3942] flex items-center justify-center overflow-hidden">
                <div className="absolute top-10 left-10 p-3 bg-cyan-500/20 text-cyan-400 rounded-full text-xs font-bold flex flex-col items-center">
                  <span>Alex (You)</span>
                </div>
                <div className="absolute bottom-12 right-16 p-3 bg-fuchsia-500/20 text-fuchsia-400 rounded-full text-xs font-bold flex flex-col items-center">
                  <span>Elena</span>
                </div>
              </div>
              <button
                onClick={() => setShowSpatialAudio(false)}
                className="w-full py-2.5 bg-[#1F2C34] text-gray-300 font-bold rounded-xl text-xs hover:bg-[#2A3942]"
              >
                Close Spatial Lounge
              </button>
            </div>
          </div>
        )}

        {/* ===== MODAL: AI AUTOMATION RECIPES ===== */}
        {showWorkflowModal && (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowWorkflowModal(false)}>
            <div className="bg-[#0B141A] rounded-2xl p-6 space-y-5 max-w-md w-full text-white shadow-2xl border border-[#1F2C34]" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Workflow className="w-5 h-5 text-emerald-400" /> AI Automation Recipes
                </h3>
                <button onClick={() => setShowWorkflowModal(false)} className="p-2 hover:bg-[#1F2C34] rounded-lg transition">
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>
              <div className="space-y-3">
                <div className="p-3 bg-[#1F2C34] rounded-xl flex justify-between items-center border border-[#2A3942]">
                  <div>
                    <h4 className="text-xs font-bold">Auto-Summarize PDFs</h4>
                    <p className="text-[10px] text-[#8696A0]">On PDF Received</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500 text-white">Active</span>
                </div>
                <div className="p-3 bg-[#1F2C34] rounded-xl flex justify-between items-center border border-[#2A3942]">
                  <div>
                    <h4 className="text-xs font-bold">Voice Transcription</h4>
                    <p className="text-[10px] text-[#8696A0]">On Voice Note Received</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-cyan-500 text-white">Active</span>
                </div>
              </div>
              <button
                onClick={() => setShowWorkflowModal(false)}
                className="w-full py-2.5 bg-[#1F2C34] text-gray-300 font-bold rounded-xl text-xs hover:bg-[#2A3942]"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* ===== MODAL: SMART COMMAND PALETTE ===== */}
        {showCommandPalette && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-start justify-center pt-20 p-4 backdrop-blur-sm" onClick={() => setShowCommandPalette(false)}>
            <div className="bg-[#0B141A] rounded-2xl p-4 space-y-3 max-w-lg w-full text-white shadow-2xl border border-[#1F2C34] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 bg-[#1F2C34] px-4 py-3 rounded-xl border border-[#2A3942]">
                <Search className="w-4 h-4 text-cyan-400" />
                <input
                  ref={commandInputRef}
                  type="text"
                  placeholder="Type a command or search all chats..."
                  className="w-full bg-transparent text-xs text-white focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 scrollbar-hide">
                <button
                  onClick={exportChatHistory}
                  className="w-full text-left p-2.5 hover:bg-[#1F2C34] rounded-lg text-xs flex items-center justify-between transition"
                >
                  <span>Export Chat History (Markdown)</span>
                  <FileDown className="w-4 h-4 text-emerald-400" />
                </button>
                <button
                  onClick={() => {
                    setMonochromeMode(!monochromeMode);
                    setShowCommandPalette(false);
                  }}
                  className="w-full text-left p-2.5 hover:bg-[#1F2C34] rounded-lg text-xs flex items-center justify-between transition"
                >
                  <span>Toggle Monochrome E-Ink Mode</span>
                  <Moon className="w-4 h-4 text-cyan-400" />
                </button>
                <button
                  onClick={() => {
                    setShowSettings(true);
                    setShowCommandPalette(false);
                  }}
                  className="w-full text-left p-2.5 hover:bg-[#1F2C34] rounded-lg text-xs flex items-center justify-between transition"
                >
                  <span>Identity Sub-Profiles</span>
                  <User className="w-4 h-4 text-cyan-400" />
                </button>
                <div className="pt-2 border-t border-[#2A3942]">
                  <p className="text-[10px] text-gray-500 mb-2">Keyboard shortcuts:</p>
                  <div className="text-[10px] text-gray-400 space-y-1">
                    <div>⌘K — Open Command Palette</div>
                    <div>Esc — Close modals</div>
                    <div>Enter — Send message</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== MODAL: TOKEN-GATED CHANNELS ===== */}
        {showTokenGateModal && (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowTokenGateModal(false)}>
            <div className="bg-[#0B141A] rounded-2xl p-6 space-y-4 max-w-md w-full text-white shadow-2xl border border-[#1F2C34]" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Coins className="w-5 h-5 text-yellow-400" /> Token-Gated Chat Rooms & Micro-Bounties
                </h3>
                <button onClick={() => setShowTokenGateModal(false)} className="p-2 hover:bg-[#1F2C34] rounded-lg transition">
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>
              <p className="text-xs text-[#8696A0]">Verify decentralized wallet balance or NFT membership to unlock elite developer channels.</p>
              <div className="p-4 bg-[#1F2C34] rounded-xl space-y-2 border border-[#2A3942]">
                <div className="flex justify-between text-xs font-bold">
                  <span>Core Contributors Channel</span>
                  <span className="text-yellow-400">🔒 Requires 10+ GOV Tokens</span>
                </div>
                <button
                  onClick={() => alert('✨ Wallet Verified! Channel unlocked.')}
                  className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded-lg text-xs transition"
                >
                  Verify Web3 Wallet
                </button>
              </div>
              <button
                onClick={() => setShowTokenGateModal(false)}
                className="w-full py-2.5 bg-[#1F2C34] text-gray-300 font-bold rounded-xl text-xs hover:bg-[#2A3942]"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* ===== MODAL: SETTINGS / IDENTITY PROFILES ===== */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
            <div className="bg-[#0B141A] rounded-2xl p-6 space-y-4 max-w-md w-full text-white shadow-2xl border border-[#1F2C34]" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <User className="w-5 h-5 text-cyan-400" /> Identity Sub-Profiles
                </h3>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-[#1F2C34] rounded-lg transition">
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>
              <p className="text-xs text-[#8696A0] mb-4">Switch between your identity sub-profiles. Each profile has its own color and display name.</p>
              <div className="space-y-2">
                {identityProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => switchProfile(profile.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition ${activeProfileId === profile.id ? 'bg-gradient-to-r from-[#833AB4]/30 to-[#E1306C]/30 border-[#833AB4]/50' : 'bg-[#1F2C34] border-[#2A3942] hover:bg-[#2A3942]'}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow ${profile.color}`}>
                      {String(profile.name).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{profile.name}</div>
                      <div className="text-[10px] text-gray-500">ID: {profile.id}</div>
                    </div>
                    {activeProfileId === profile.id && (
                      <CheckCheck className="w-4 h-4 text-emerald-400" />
                    )}
                  </button>
                ))}
              </div>
              <div className="pt-4 border-t border-[#2A3942]">
                <button
                  onClick={() => {
                    const newProfile = { id: uid(), name: `Profile ${identityProfiles.length + 1}`, color: '#6366f1', avatar: null };
                    setIdentityProfiles((prev) => [...prev, newProfile]);
                    switchProfile(newProfile.id);
                  }}
                  className="w-full py-2 bg-[#1F2C34] hover:bg-[#2A3942] text-gray-300 text-xs rounded border border-[#2A3942] transition"
                >
                  <Plus className="w-3 h-3 mr-2" /> Add New Profile
                </button>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-2.5 bg-[#1F2C34] text-gray-300 font-bold rounded-xl text-xs hover:bg-[#2A3942]"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
