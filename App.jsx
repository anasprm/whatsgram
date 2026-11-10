import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getSupabase } from '@/lib/supabase/browser';
import AuthModule from './AuthModule';
import LandingPage from './LandingPage';
import SpatialAudioRoom from './SpatialAudioRoom';
import { ArcadePlayer, Leaderboard } from './arcade';
import { queueScore, reassignQueueUser } from './lib/arcadeLeaderboard';
import {
  MessageSquare, User, Gamepad2, Send, CheckCheck, X, Shield, Moon,
  Command, Radio, Workflow, Coins, Square, FileDown, Search, FolderOpen,
  Mic, Play, Pause, Upload, Clock, Bot, Brain, Key, Settings, Layout, List,
  Image as ImageIcon, FileText, ArrowRight, ChevronLeft, ChevronRight,
  Trash2, Edit3, Plus, Minus, RotateCw, Maximize2, Minimize2,
  ExternalLink, Download, Share2, Lock, Unlock, Sparkles, Target, Camera,
  Circle, Triangle, Star, MapPin, CreditCard, Heart, Eye, Music, MessageCircle,
  MoreHorizontal, Volume2, VolumeX, RotateCcw, LogOut, Power, UserPlus,
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, Info, Speaker as SpeakerIcon,
  MoreVertical, Smile, CornerUpLeft, ShieldAlert, Volume2 as VolumeIcon, BellOff, Copy
} from 'lucide-react';

// ============================================================
// AI CHAT — proxied through /api/ai/chat (server-side key, never exposed to client)
// ============================================================

// ============================================================
// ACCOUNT SESSION & PER-USER STORAGE SCOPE
// ============================================================
const readSession = () => {
  try {
    const raw = localStorage.getItem('whatsgram_session');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const ACTIVE_SESSION = readSession();
const ACTIVE_USER_ID = ACTIVE_SESSION && ACTIVE_SESSION.userId ? ACTIVE_SESSION.userId : null;
// All app data is namespaced by the signed-in account so two accounts never
// share the same conversations, bots, scores, profiles, or settings.
const SCOPE = ACTIVE_USER_ID ? `whatsgram:${ACTIVE_USER_ID}:` : 'whatsgram:guest:';

// ============================================================
// LOCALSTORAGE KEYS (scoped per account)
// ============================================================
const LS_CONVERSATIONS = `${SCOPE}conversations`;
const LS_MESSAGES = `${SCOPE}messages`;
const LS_CUSTOM_BOTS = `${SCOPE}custom_bots`;
const LS_ARCADE_SCORES = `${SCOPE}arcade_scores`;
const LS_IDENTITY_PROFILES = `${SCOPE}identity_profiles`;
const LS_ACTIVE_PROFILE = `${SCOPE}active_profile`;
const LS_USER_ID = `${SCOPE}user_id`;
const LS_MONOCHROME = `${SCOPE}monochrome`;
const LS_QUANTUM = `${SCOPE}quantum`;

// ============================================================
// HELPERS
// ============================================================
const safeJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
};
const safeSet = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn(`localStorage write failed for ${key}:`, e); }
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const uid = () => `id_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const nowISO = () => new Date().toISOString();

// ============================================================
// SUPABASE SYNC (persists to cloud + localStorage)
// ============================================================
let supabase = null;
try { supabase = getSupabase(); } catch { /* Supabase not configured — localStorage only */ }

// Supabase cloud sync is intentionally disabled for the local-account system.
// The remote schema is keyed by Supabase Auth UUIDs, while these accounts use
// client-generated ids. Enabling it without per-user scoping would merge every
// account's data. Flip to true only after wiring Supabase Auth + RLS per user.
const REMOTE_SYNC_ENABLED = false;

const supabaseReady = () => REMOTE_SYNC_ENABLED && supabase && typeof window !== 'undefined';

const sbUpsert = async (table, row) => {
  if (!supabaseReady()) return;
  try {
    await supabase.from(table).upsert(row, { onConflict: 'id' });
  } catch (e) { console.warn(`Supabase upsert ${table} failed:`, e); }
};

const sbInsert = async (table, row) => {
  if (!supabaseReady()) return;
  try {
    await supabase.from(table).insert(row);
  } catch (e) { console.warn(`Supabase insert ${table} failed:`, e); }
};

const sbDelete = async (table, id) => {
  if (!supabaseReady()) return;
  try {
    await supabase.from(table).delete().eq('id', id);
  } catch (e) { console.warn(`Supabase delete ${table} failed:`, e); }
};

const sbSelect = async (table, filter = {}) => {
  if (!supabaseReady()) return [];
  try {
    let q = supabase.from(table).select('*');
    Object.entries(filter).forEach(([k, v]) => { q = q.eq(k, v); });
    const { data } = await q;
    return data || [];
  } catch (e) { console.warn(`Supabase select ${table} failed:`, e); return [];
  }
};

// Sync conversations to Supabase
const syncConversationsToSupabase = async (convs) => {
  if (!supabaseReady()) return;
  for (const c of convs) {
    await sbUpsert('conversations', {
      id: c.id,
      is_group: c.is_group || false,
      name: c.name || null,
      folder: c.folder || 'all',
      is_bot: c.is_bot || false,
      is_ai: c.is_ai || false,
      is_pinned: c.is_pinned || false,
      last_message: c.last_message || null,
      unread_count: c.unread_count || 0,
      participant: c.participant || null,
      updated_at: nowISO()
    });
  }
};

// Sync messages to Supabase
const syncMessagesToSupabase = async (convId, msgs) => {
  if (!supabaseReady()) return;
  for (const m of msgs) {
    await sbUpsert('messages', {
      id: m.id,
      conversation_id: convId,
      sender_id: m.sender_id,
      body: m.body || '',
      kind: 'text',
      created_at: m.created_at || nowISO(),
      updated_at: nowISO()
    });
  }
};

// Sync custom bots to Supabase
const syncBotsToSupabase = async (bots) => {
  if (!supabaseReady()) return;
  for (const b of bots) {
    await sbUpsert('custom_bots', {
      id: b.id,
      name: b.name || '',
      username: b.username || '',
      token: b.token || '',
      created_at: b.created_at || nowISO()
    });
  }
};

// Sync game scores to Supabase
const syncGameScoresToSupabase = (scores) => {
  if (!supabaseReady()) return;
  Object.entries(scores).forEach(([gameId, score]) => {
    sbUpsert('game_records', {
      id: `game_${gameId}_${uid().slice(0, 8)}`,
      game_id: parseInt(gameId),
      game_name: ALL_GAMES.find((g) => g.id === parseInt(gameId))?.name || `Game #${gameId}`,
      score: score || 0,
      category: ALL_GAMES.find((g) => g.id === parseInt(gameId))?.category || 'Unknown'
    });
  });
};

// Sync identity profiles to Supabase
const syncProfilesToSupabase = (profiles, activeProfileId) => {
  if (!supabaseReady()) return;
  profiles.forEach((p) => {
    sbUpsert('identity_sub_profiles', {
      id: p.id,
      name: p.name || '',
      color: p.color || '#833AB4',
      avatar_url: p.avatar || null,
      bio: p.bio || '',
      about: p.about || '',
      status: p.status || 'Available',
      is_active: p.id === activeProfileId
    });
  });
};

// Load initial data from Supabase on mount
const loadFromSupabase = async () => {
  if (!supabaseReady()) return null;
  try {
    const [convs, msgs, bots, scores, profiles] = await Promise.all([
      sbSelect('conversations'),
      sbSelect('messages'),
      sbSelect('custom_bots'),
      sbSelect('game_records'),
      sbSelect('identity_sub_profiles')
    ]);
    return { conversations: convs || [], messages: msgs || [], bots: bots || [], scores: scores || [], profiles: profiles || [] };
  } catch (e) {
    console.warn('Supabase load failed:', e);
    return null;
  }
};

// ============================================================
// INITIAL DATA
// ============================================================
const DEFAULT_PROFILES = [
  {
    id: 'prof_me',
    name: 'You',
    color: '#833AB4',
    avatar: null,
    bio: '',
    about: 'Hey there! I am using WhatsGram.',
    status: 'Available',
  },
  {
    id: 'prof_work',
    name: 'Work Identity',
    color: '#0ea5e9',
    avatar: null,
    bio: '',
    about: 'Professional contacts only.',
    status: 'At Work',
  },
  {
    id: 'prof_personal',
    name: 'Personal Identity',
    color: '#22c55e',
    avatar: null,
    bio: '',
    about: 'Friends and family.',
    status: 'Available',
  },
];

const INITIAL_CONVERSATIONS = [
  {
    id: 'conv_botfather',
    is_group: false, is_bot: true, folder: 'work', is_pinned: true,
    name: 'BotFather',
    participant: {
      id: 'usr_botfather', display_name: 'BotFather 🤖',
      avatar_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      is_online: true
    },
    last_message: 'Type /newbot to create custom Telegram-style bots! ⚡',
    unread_count: 1
  },
  {
    id: 'conv_ai',
    is_group: false, is_ai: true, folder: 'work', is_pinned: true,
    name: 'WhatsGram AI',
    participant: {
      id: 'usr_ai', display_name: 'WhatsGram AI ✨',
      avatar_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      is_online: true
    },
    last_message: 'Ask me anything! Powered by Gemini 🚀',
    unread_count: 0
  },
  {
    id: 'conv_alex',
    is_group: false, folder: 'personal',
    name: 'Alex Rivera',
    participant: {
      id: 'usr_alex', display_name: 'Alex Rivera',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      is_online: true
    },
    last_message: 'Check out the new IG Reels integration! 🔥',
    unread_count: 2
  }
];

const INITIAL_MESSAGES = {
  conv_botfather: [{ id: 'm1', sender_id: 'usr_botfather', body: 'Welcome to BotFather! Send /newbot to create custom Telegram-style bots.', created_at: nowISO() }],
  conv_ai: [{ id: 'm2', sender_id: 'usr_ai', body: 'Hello! I am your WhatsGram AI assistant powered by Google Gemini. Ask me any question!', created_at: nowISO() }],
  conv_alex: [{ id: 'm3', sender_id: 'usr_alex', body: 'Check out the new IG Reels integration! 🔥', created_at: nowISO() }]
};

// ============================================================
// INITIAL CALL LOGS
// ============================================================
const INITIAL_CALL_LOGS = [
  {
    id: 'call_1',
    contactId: 'usr_alex',
    contactName: 'Alex Rivera',
    contactAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    type: 'voice',
    direction: 'incoming',
    duration: 245,
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    dataUsage: 8.2,
  },
  {
    id: 'call_2',
    contactId: 'usr_botfather',
    contactName: 'BotFather',
    contactAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
    type: 'voice',
    direction: 'outgoing',
    duration: 120,
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    dataUsage: 4.1,
  },
  {
    id: 'call_3',
    contactId: 'usr_ai',
    contactName: 'WhatsGram AI',
    contactAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
    type: 'video',
    direction: 'missed',
    duration: 0,
    timestamp: new Date(Date.now() - 10800000).toISOString(),
    dataUsage: 0,
  },
  {
    id: 'call_4',
    contactId: 'usr_alex',
    contactName: 'Alex Rivera',
    contactAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    type: 'video',
    direction: 'outgoing',
    duration: 890,
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    dataUsage: 45.6,
  },
  {
    id: 'call_5',
    contactId: 'usr_ai',
    contactName: 'WhatsGram AI',
    contactAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
    type: 'voice',
    direction: 'incoming',
    duration: 67,
    timestamp: new Date(Date.now() - 172800000).toISOString(),
    dataUsage: 2.3,
  },
];

// ============================================================
// ALL 50 GAMES — each mapped to a playable engine type
// ============================================================
const GAME_TYPES = {
  SNAKE: 'snake',
  PONG: 'pong',
  BREAKOUT: 'breakout',
  TETRIS: 'tetris',
  WHACKAMOLE: 'whackamole',
  MEMORY: 'memory',
  CLICKER: 'clicker',
  TYPING: 'typing',
  FLAPPY: 'flappy',
  RPS: 'rps',
  SLOTS: 'slots',
  ARCHERY: 'archery',
  TICTACTOE: 'tictactoe',
  CONNECT4: 'connect4',
  SUDOKU: 'sudoku',
  HANGMAN: 'hangman',
  TOWER: 'tower',
  RHYTHM: 'rhythm',
  CARDODGER: 'cardodger',
  ZOMBIE: 'zombie',
  COOKIE: 'cookie',
  BASKETBALL: 'basketball',
  DART: 'dart',
  BOWLING: 'bowling',
  POOL: 'pool',
  BLACKJACK: 'blackjack',
  DICE: 'dice',
  WORDSCRAMBLE: 'wordscramble',
  COLORSWITCH: 'colorswitch',
  PINBALL: 'pinball',
  SOKOBAN: 'sokoban',
  LIGHTSOUT: 'lightsout',
  CALCULATOR: 'calculator',
  COINDOZER: 'coindozer',
  TAMAGOTCHI: 'tamagotchi',
  DRUMKIT: 'drumkit',
  ZEN: 'zen',
  BATTLESHIP: 'battleship',
  PACGRID: 'pacgrid',
  DINO: 'dino',
  SPACEINVADERS: 'spaceinvaders',
  MEMORYMATCH: 'memorymatch',
  TRIVIA: 'trivia',
  MINECRAFT: 'minecraft',
  FISHING: 'fishing',
  RACING: 'racing',
  PARKING: 'parking',
  SLIDING: 'sliding',
  MATCHING: 'matching',
  REFLEX: 'reflex',
  BOWLING2: 'dice_race',
  ASTEROIDS: 'asteroids'
};

const ALL_GAMES = [
  { id: 1,  name: 'Tic-Tac-Toe Classic',       type: GAME_TYPES.TICTACTOE,  category: 'Board & Card',   theme: '#833AB4' },
  { id: 2,  name: 'Battleship Tactical',       type: GAME_TYPES.BATTLESHIP, category: 'Board & Card',   theme: '#0ea5e9' },
  { id: 3,  name: 'Retro Snake Arcade',        type: GAME_TYPES.SNAKE,      category: 'Arcade & Action',theme: '#22c55e' },
  { id: 4,  name: 'Pong Champions',            type: GAME_TYPES.PONG,       category: 'Arcade & Action',theme: '#ef4444' },
  { id: 5,  name: 'Cyber Tetris',              type: GAME_TYPES.TETRIS,     category: 'Puzzle & Strategy',theme: '#a855f7' },
  { id: 6,  name: 'Memory Card Match',         type: GAME_TYPES.MEMORYMATCH,category: 'Puzzle & Strategy',theme: '#ec4899' },
  { id: 7,  name: '2048 Math Puzzle',          type: GAME_TYPES.SLIDING,    category: 'Puzzle & Strategy',theme: '#f59e0b' },
  { id: 8,  name: 'Space Invaders Offline',    type: GAME_TYPES.SPACEINVADERS,category: 'Arcade & Action',theme: '#10b981' },
  { id: 9,  name: 'Breakout Brick Buster',     type: GAME_TYPES.BREAKOUT,   category: 'Arcade & Action',theme: '#f43f5e' },
  { id: 10, name: 'Pac-Grid Maze',             type: GAME_TYPES.PACGRID,    category: 'Arcade & Action',theme: '#fbbf24' },
  { id: 11, name: 'Flappy Birdie',             type: GAME_TYPES.FLAPPY,     category: 'Arcade & Action',theme: '#fcd34d' },
  { id: 12, name: 'Dino Jump Runner',          type: GAME_TYPES.DINO,       category: 'Arcade & Action',theme: '#84cc16' },
  { id: 13, name: 'Sudoku Master',             type: GAME_TYPES.SUDOKU,     category: 'Puzzle & Strategy',theme: '#06b6d4' },
  { id: 14, name: 'Chess Blitz',               type: GAME_TYPES.BOARD,      category: 'Board & Card',   theme: '#4f46e5' },
  { id: 15, name: 'Checkers Pro',              type: GAME_TYPES.BOARD,      category: 'Board & Card',   theme: '#7c3aed' },
  { id: 16, name: 'Connect Four',              type: GAME_TYPES.CONNECT4,   category: 'Board & Card',   theme: '#ef4444' },
  { id: 17, name: 'Whack-a-Mole',              type: GAME_TYPES.WHACKAMOLE, category: 'Casual & Clicker',theme: '#f59e0b' },
  { id: 18, name: 'Simon Says Memory',         type: GAME_TYPES.MEMORY,     category: 'Puzzle & Strategy',theme: '#8b5cf6' },
  { id: 19, name: 'Rock Paper Scissors',       type: GAME_TYPES.RPS,        category: 'Casual & Clicker',theme: '#ec4899' },
  { id: 20, name: 'Blackjack 21',              type: GAME_TYPES.BLACKJACK,  category: 'Board & Card',   theme: '#1e293b' },
  { id: 21, name: 'Slot Machine Reels',        type: GAME_TYPES.SLOTS,      category: 'Casual & Clicker',theme: '#fbbf24' },
  { id: 22, name: 'Dice Roller 3D',            type: GAME_TYPES.DICE,       category: 'Casual & Clicker',theme: '#84cc16' },
  { id: 23, name: 'Minesweeper Retro',         type: GAME_TYPES.MINECRAFT,  category: 'Puzzle & Strategy',theme: '#64748b' },
  { id: 24, name: 'Bubble Shooter',            type: GAME_TYPES.BUBBLE,     category: 'Casual & Clicker',theme: '#06b6d4' },
  { id: 25, name: 'Word Scramble',             type: GAME_TYPES.WORDSCRAMBLE,category: 'Puzzle & Strategy',theme: '#a855f7' },
  { id: 26, name: 'Hangman Puzzle',            type: GAME_TYPES.HANGMAN,    category: 'Puzzle & Strategy',theme: '#f43f5e' },
  { id: 27, name: 'Tower Builder',             type: GAME_TYPES.TOWER,      category: 'Casual & Clicker',theme: '#f59e0b' },
  { id: 28, name: 'Color Switcher',            type: GAME_TYPES.COLORSWITCH,category: 'Casual & Clicker',theme: '#ec4899' },
  { id: 29, name: 'Pinball Arcade',            type: GAME_TYPES.PINBALL,    category: 'Arcade & Action',theme: '#fbbf24' },
  { id: 30, name: 'Rhythm Tap',                type: GAME_TYPES.RHYTHM,     category: 'Casual & Clicker',theme: '#8b5cf6' },
  { id: 31, name: 'Car Dodger',                type: GAME_TYPES.CARDODGER,  category: 'Arcade & Action',theme: '#ef4444' },
  { id: 32, name: 'Zombie Survival Clicker',   type: GAME_TYPES.ZOMBIE,     category: 'Casual & Clicker',theme: '#84cc16' },
  { id: 33, name: 'Cookie Tap Master',         type: GAME_TYPES.COOKIE,     category: 'Casual & Clicker',theme: '#a855f7' },
  { id: 34, name: 'Target Archery',            type: GAME_TYPES.ARCHERY,    category: 'Arcade & Action',theme: '#f43f5e' },
  { id: 35, name: 'Golf Putt Mini',            type: GAME_TYPES.BOWLING,    category: 'Casual & Clicker',theme: '#22c55e' },
  { id: 36, name: 'Bowling Strike',            type: GAME_TYPES.BOWLING,    category: 'Casual & Clicker',theme: '#1e293b' },
  { id: 37, name: 'Basketball Hoop',           type: GAME_TYPES.BASKETBALL, category: 'Arcade & Action',theme: '#f59e0b' },
  { id: 38, name: 'Dart Thrower',              type: GAME_TYPES.DART,       category: 'Arcade & Action',theme: '#ef4444' },
  { id: 39, name: 'Pool Billiards 8-Ball',     type: GAME_TYPES.POOL,       category: 'Board & Card',   theme: '#0f172a' },
  { id: 40, name: 'Tic-Tac-Toe Ultimate',      type: GAME_TYPES.TICTACTOE,  category: 'Board & Card',   theme: '#833AB4' },
  { id: 41, name: 'Tower Defense Lite',        type: GAME_TYPES.TOWER,      category: 'Arcade & Action',theme: '#22c55e' },
  { id: 42, name: 'Grid Neon Tron',            type: GAME_TYPES.SNAKE,      category: 'Arcade & Action',theme: '#0ea5e9' },
  { id: 43, name: 'Sokoban Box Pusher',        type: GAME_TYPES.SOKOBAN,    category: 'Puzzle & Strategy',theme: '#a855f7' },
  { id: 44, name: 'Lights Out Puzzle',         type: GAME_TYPES.LIGHTSOUT,  category: 'Puzzle & Strategy',theme: '#06b6d4' },
  { id: 45, name: 'Calculator Clicker',        type: GAME_TYPES.CALCULATOR, category: 'Casual & Clicker',theme: '#f59e0b' },
  { id: 46, name: 'Coin Dozer Arcade',         type: GAME_TYPES.COINDOZER,  category: 'Casual & Clicker',theme: '#fbbf24' },
  { id: 47, name: 'Pet Tamagotchi',            type: GAME_TYPES.TAMAGOTCHI, category: 'Casual & Clicker',theme: '#ec4899' },
  { id: 48, name: 'Virtual Drumkit',           type: GAME_TYPES.DRUMKIT,    category: 'Casual & Clicker',theme: '#64748b' },
  { id: 49, name: 'Typing Speed Test',         type: GAME_TYPES.TYPING,     category: 'Puzzle & Strategy',theme: '#0ea5e9' },
  { id: 50, name: 'Zen Meditation Idle',       type: GAME_TYPES.ZEN,        category: 'Casual & Clicker',theme: '#22c55e' },
  { id: 51, name: 'Minesweeper Classic',       type: GAME_TYPES.MINECRAFT,  category: 'Puzzle & Strategy',theme: '#64748b' },
  { id: 52, name: 'Dice Race',                 type: GAME_TYPES.BOWLING2,   category: 'Arcade & Action',theme: '#fbbf24' },
  { id: 53, name: 'Asteroids Classic',         type: GAME_TYPES.ASTEROIDS,  category: 'Arcade & Action',theme: '#22c55e' },
];

const GAME_ICONS = {
  [GAME_TYPES.SNAKE]: Gamepad2,
  [GAME_TYPES.PONG]: Square,
  [GAME_TYPES.BREAKOUT]: Square,
  [GAME_TYPES.TETRIS]: Layout,
  [GAME_TYPES.WHACKAMOLE]: Target,
  [GAME_TYPES.MEMORY]: Brain,
  [GAME_TYPES.MEMORYMATCH]: Star,
  [GAME_TYPES.CLICKER]: Square,
  [GAME_TYPES.TYPING]: Square,
  [GAME_TYPES.FLAPPY]: Square,
  [GAME_TYPES.RPS]: Square,
  [GAME_TYPES.SLOTS]: Square,
  [GAME_TYPES.ARCHERY]: Square,
  [GAME_TYPES.TICTACTOE]: Square,
  [GAME_TYPES.CONNECT4]: Square,
  [GAME_TYPES.SUDOKU]: Square,
  [GAME_TYPES.HANGMAN]: Square,
  [GAME_TYPES.TOWER]: Square,
  [GAME_TYPES.RHYTHM]: Square,
  [GAME_TYPES.CARDODGER]: Square,
  [GAME_TYPES.ZOMBIE]: Square,
  [GAME_TYPES.COOKIE]: Square,
  [GAME_TYPES.BASKETBALL]: Square,
  [GAME_TYPES.DART]: Square,
  [GAME_TYPES.BOWLING]: Square,
  [GAME_TYPES.POOL]: Square,
  [GAME_TYPES.BLACKJACK]: Square,
  [GAME_TYPES.DICE]: Square,
  [GAME_TYPES.WORDSCRAMBLE]: FileText,
  [GAME_TYPES.COLORSWITCH]: Square,
  [GAME_TYPES.PINBALL]: Square,
  [GAME_TYPES.SOKOBAN]: Square,
  [GAME_TYPES.LIGHTSOUT]: Square,
  [GAME_TYPES.CALCULATOR]: Square,
  [GAME_TYPES.COINDOZER]: Square,
  [GAME_TYPES.TAMAGOTCHI]: Square,
  [GAME_TYPES.DRUMKIT]: Square,
  [GAME_TYPES.ZEN]: Square,
  [GAME_TYPES.BATTLESHIP]: Square,
  [GAME_TYPES.PACGRID]: Square,
  [GAME_TYPES.DINO]: Square,
  [GAME_TYPES.SPACEINVADERS]: Square,
  [GAME_TYPES.TRIVIA]: Square,
  [GAME_TYPES.MINECRAFT]: Square,
  [GAME_TYPES.BOWLING2]: Square,
  [GAME_TYPES.ASTEROIDS]: Target,
  [GAME_TYPES.FISHING]: Square,
  [GAME_TYPES.RACING]: Square,
  [GAME_TYPES.PARKING]: Square,
  [GAME_TYPES.SLIDING]: Square,
  [GAME_TYPES.MATCHING]: Square,
  [GAME_TYPES.REFLEX]: Square,
  [GAME_TYPES.BUBBLE]: Square,
  [GAME_TYPES.BOARD]: Square
};

// Icon component fallbacks (lucide may not have all, use Square as generic fallback)
const Brick = Square;
const Keyboard = Square;
const Bird = Square;
const Hand = Square;
const Slot = Square;
const Bow = Square;
const Grid = Square;
const Drop = Square;
const Grid2 = Square;
const Rope = Square;
const Tower = Square;
const Car = Square;
const Skull = Square;
const Cookie = Square;
const Hoop = Square;
const Dart = Square;
const Bowling = Square;
const Pool = Square;
const Card = Square;
const Dice = Square;
const Palette = Square;
const Pinball = Square;
const Box = Square;
const Bulb = Square;
const Calc = Square;
const Coin = Square;
const Pet = Square;
const Drum = Square;
const Lotus = Square;
const Ship = Square;
const Maze = Square;
const Dino = Square;
const Alien = Square;
const Quiz = Square;
const Mine = Square;
const Fish = Square;
const Race = Square;
const Park = Square;
const Slide = Square;
const Match = Square;
const Flash = Square;
const Bubble = Square;
const Chess = Square;

// Since lucide-react might not export all these, create safe fallbacks
const safeIcon = (Component) => Component || Square;

// ============================================================
// ERROR BOUNDARY
// ============================================================
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error('ErrorBoundary:', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#000000] text-white">
          <div className="text-center p-8 bg-[#0B141A] rounded-2xl border border-[#2A3942] shadow-2xl max-w-md w-full">
            <Shield className="w-8 h-8 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-400 mb-6">{String(this.state.error?.message || 'Unknown error')}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
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
// MESSAGE COMPONENT
// ============================================================
function MessageItem({ message, currentUserId, messageReactions, setMessageReactions, messageActionsMenu, setMessageActionsMenu, showEmojiPicker, setShowEmojiPicker, setReplyingToMessage, setConversations }) {
  const isMe = message.sender_id === currentUserId;
  const time = message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const atts = message.attachments || [];
  const isReply = message.reply_to_id;
  const reactions = messageReactions[message.id] || [];
  const userHasReacted = reactions.some((r) => r.users.includes(currentUserId || 'me'));
  const totalReactions = reactions.reduce((sum, r) => sum + r.users.length, 0);

  const handleAction = (action) => {
    if (action === 'reply') {
      setReplyingToMessage(message.id);
      setMessageActionsMenu(null);
    } else if (action === 'copy') {
      navigator.clipboard.writeText(message.body || '');
      setMessageActionsMenu(null);
    } else if (action === 'delete') {
      setConversations((prev) => prev.map((c) => ({
        ...c,
        messages: c.messages?.filter((m) => m.id !== message.id) || c.messages
      })));
      setMessageActionsMenu(null);
    } else if (action === 'react') {
      setShowEmojiPicker(message.id);
      setMessageActionsMenu(null);
    }
  };

  const addReaction = (emoji) => {
    setMessageReactions((prev) => {
      const existing = prev[message.id] || [];
      const userIdx = existing.findIndex((r) => r.users.includes(currentUserId || 'me'));
      if (userIdx >= 0) {
        const updated = existing.filter((r) => r.emoji !== emoji);
        if (updated.length === 0) {
          const next = { ...prev };
          delete next[message.id];
          return next;
        }
        updated[userIdx].emoji = emoji;
        return { ...prev, [message.id]: updated };
      }
      return { ...prev, [message.id]: [...existing, { emoji, users: [currentUserId || 'me'] }] };
    });
    setShowEmojiPicker(null);
  };

  const emojiReactionsDisplay = reactions.map((r) => `${r.emoji} (${r.users.length})`).join(' ');

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      {/* Reply Quote Bubble */}
      {isReply && (
        <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1`}>
          <div className={`max-w-xs md:max-w-md p-2 rounded-xl text-[10px] space-y-1 ${
            isMe ? 'text-white/90' : 'text-zinc-400'
          } bg-zinc-800/30 border border-zinc-700/50`}>
            <span className="text-zinc-500 text-[9px] uppercase tracking-wider font-bold">Reply</span>
            <span className="text-zinc-300">{message.reply_to_body || 'Message'}</span>
          </div>
        </div>
      )}

      <div
        className={`relative group ${isMe ? 'justify-end' : 'justify-start'}`}
        onMouseEnter={() => setMessageActionsMenu({ id: message.id, x: 0, y: 0 })}
        onMouseLeave={() => setMessageActionsMenu(null)}
      >
        <div className={`max-w-[80%] md:max-w-[65%] p-3 rounded-2xl shadow-sm ${
          isMe
            ? 'rounded-tl-xl rounded-tr-xl rounded-bl-xl relay-bubble-tail-out bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#E1306C] text-white'
            : 'rounded-tr-xl rounded-tl-xl rounded-br-xl relay-bubble-tail-in bg-[#1F2C34] text-white border border-[#2A3942]'
        }`}>
          <p className="whitespace-pre-wrap break-words">{String(message.body || '')}</p>

        {/* Attachments */}
        {atts.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {atts.map((att) => {
              if (att.type === 'image') {
                return (
                  <img
                    key={att.id}
                    src={att.url}
                    alt={att.name}
                    className="w-24 h-24 rounded-lg object-cover cursor-pointer hover:opacity-90"
                    title={att.name}
                  />
                );
              }
              if (att.type === 'video') {
                return (
                  <div key={att.id} className="w-24 h-24 rounded-lg bg-[#2A3942] flex items-center justify-center relative overflow-hidden">
                    <video src={att.url} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Play className="w-6 h-6 text-white ml-1" />
                    </div>
                  </div>
                );
              }
              if (att.type === 'location') {
                return (
                  <div key={att.id} className="w-24 h-24 rounded-lg bg-[#2A3942] border border-[#3A4952] flex items-center justify-center text-[10px] text-cyan-400 cursor-pointer">
                    <MapPin className="w-4 h-4 mb-1" />
                    <div>📍 Location</div>
                  </div>
                );
              }
              if (att.type === 'payment') {
                return (
                  <div key={att.id} className="w-24 h-24 rounded-lg bg-[#2A3942] border border-[#3A4952] flex items-center justify-center text-[10px] text-pink-400">
                    <CreditCard className="w-4 h-4 mb-1" />
                    <div>$${att.amount}</div>
                  </div>
                );
              }
              if (att.type === 'contact') {
                return (
                  <div key={att.id} className="w-24 h-24 rounded-lg bg-[#2A3942] border border-[#3A4952] flex items-center justify-center text-[10px] text-gray-400">
                    <User className="w-4 h-4 mb-1" />
                    <div>{att.name}</div>
                  </div>
                );
              }
              if (att.type === 'poll') {
                return (
                  <div key={att.id} className="w-24 h-24 rounded-lg bg-[#2A3942] border border-[#3A4952] p-1 text-[10px] text-yellow-400">
                    <Star className="w-4 h-4 mb-1" />
                    <div className="truncate">{att.name}</div>
                    {att.options?.slice(0, 2).map((o, i) => (
                      <div key={i} className="text-[9px] text-gray-400">○ {o}</div>
                    ))}
                  </div>
                );
              }
              // Default file
              return (
                <div key={att.id} className="w-24 h-24 rounded-lg bg-[#2A3942] border border-[#3A4952] flex items-center justify-center text-[10px] text-purple-400 cursor-pointer">
                  <FileText className="w-4 h-4 mb-1" />
                  <div className="truncate">{att.name}</div>
                </div>
              );
            })}
          </div>
        )}
          {/* Emoji Reactions */}
          {totalReactions > 0 && (
            <div className="flex items-center gap-1 mt-1">
              {reactions.map((r) => (
                <span
                  key={r.emoji}
                  onClick={() => addReaction(r.emoji)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-700/50 text-[10px]"
                >
                  <span className="text-[11px]">{r.emoji}</span>
                  <span className="text-zinc-400">{r.users.length}</span>
                </span>
              ))}
              {!userHasReacted && (
                <button
                  onClick={() => setShowEmojiPicker(message.id)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-700/50 text-[10px] hover:bg-zinc-600 transition"
                >
                  <span className="text-[11px]">+</span>
                </button>
              )}
            </div>
          )}

          <div className="flex justify-end items-center gap-1 text-[10px] text-zinc-500">
            <span>{time}</span>
            {isMe && (
              <div className="flex items-center gap-1">
                <CheckCheck className="w-2.5 h-2.5 text-cyan-400" />
                <MoreVertical
                  className="w-2.5 h-2.5 text-zinc-500 hover:text-white cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMessageActionsMenu({ id: message.id, x: 0, y: 0 });
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Message Actions Menu */}
        {messageActionsMenu?.id === message.id && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl p-1 z-50">
            <button
              onClick={() => handleAction('reply')}
              className="flex items-center gap-2 w-full p-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg transition"
            >
              <CornerUpLeft className="w-4 h-4" />
              Reply
            </button>
            <button
              onClick={() => handleAction('copy')}
              className="flex items-center gap-2 w-full p-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg transition"
            >
              <Copy className="w-4 h-4" />
              Copy
            </button>
            <button
              onClick={() => handleAction('react')}
              className="flex items-center gap-2 w-full p-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg transition"
            >
              <Smile className="w-4 h-4" />
              React
            </button>
            <hr className="my-1 border-zinc-700" />
            <button
              onClick={() => handleAction('delete')}
              className="flex items-center gap-2 w-full p-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition"
            >
              <Trash2 className="w-4 h-4" />
              Unsend
            </button>
          </div>
        )}

        {/* Emoji Picker */}
        {showEmojiPicker === message.id && (
          <div className="absolute bottom-full left-0 mb-1 w-48 bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl p-2 z-50">
            <div className="grid grid-cols-4 gap-1">
              {['❤️', '🔥', '😂', '👍', '😍', '😮', '😭', '🎉'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => addReaction(emoji)}
                  className="p-1.5 rounded-lg text-[18px] hover:bg-zinc-800 transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SPATIAL AUDIO ROOM - Real-time Web Audio + WebRTC
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

// ============================================================
// VOICE RECORDER
// ============================================================
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

      {transcript && <div className="text-[10px] text-gray-500 italic">{transcript}</div>}
    </div>
  );
}

// ============================================================
// CHUNKED FILE UPLOADER
// ============================================================
function ChunkedFileUploader({ onFileComplete }) {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const intervalRef = useRef(null);

  const CHUNK_SIZE = 1024 * 1024;

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
    let uploaded = 0;
    let lastTime = Date.now();
    let lastUploaded = 0;

    const tick = () => {
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      const step = Math.min(totalSize * 0.05, totalSize - uploaded);
      uploaded = Math.min(totalSize, uploaded + step);
      const pct = Math.round((uploaded / totalSize) * 100);
      setProgress(pct);
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

  const remaining = file.size > 0 ? Math.round((100 - progress) / 100 * (file.size / (1024 * 1024))) : 0;
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

// ============================================================
// KANBAN BOARD
// ============================================================
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
// ATTACHMENT BUTTON COMPONENT (Instagram-style)
// ============================================================
function AttachmentButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center p-2 rounded-lg bg-[#1A202C] hover:bg-[#2A3942] border border-transparent hover:border-[#3A4952] transition text-xs group"
    >
      <div className="w-8 h-8 rounded-lg bg-[#2A3942] flex items-center justify-center mb-1 group-hover:scale-110 transition">
        {icon}
      </div>
      <span className="text-[#9CA3AF] group-hover:text-white">{label}</span>
    </button>
  );
}

// ============================================================
// INSTAGRAM STORIES VIEWER COMPONENT
// ============================================================
function StoryViewer({ onClose }) {
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [liked, setLiked] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const stories = [
    {
      id: "user_1",
      username: "alex.dev",
      userAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      timeAgo: "2h",
      isVerified: true,
      slides: [
        {
          type: "image",
          url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&auto=format&fit=crop&q=80",
          caption: "Building the next-gen web UI 🚀",
          song: "Synthwave Boy - Lofi Beats",
          viewsCount: 1420
        },
        {
          type: "image",
          url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1080&auto=format&fit=crop&q=80",
          caption: "Late night debugging session.",
          song: "Synthwave Boy - Lofi Beats",
          viewsCount: 984
        }
      ]
    },
    {
      id: "user_2",
      username: "sarah_ui",
      userAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
      timeAgo: "4h",
      isVerified: false,
      slides: [
        {
          type: "image",
          url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1080&auto=format&fit=crop&q=80",
          caption: "Weekend getaway vibes 🌴",
          song: "Summer Breeze - Tropical Edit",
          viewsCount: 3210
        },
        {
          type: "image",
          url: "https://images.unsplash.com/photo-1469313637793-05989c480963?w=1080&auto=format&fit=crop&q=80",
          caption: "Sunset vibes ✨",
          song: "Summer Breeze - Tropical Edit",
          viewsCount: 2105
        }
      ]
    },
    {
      id: "user_3",
      username: "whatsgram",
      userAvatar: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
      timeAgo: "6h",
      isVerified: true,
      slides: [
        {
          type: "image",
          url: "https://images.unsplash.com/photo-1531297526732-2c0e1a6d241a?w=1080&auto=format&fit=crop&q=80",
          caption: "New feature drop: Stories! 📱",
          song: "Neon Dreams",
          viewsCount: 5420
        }
      ]
    }
  ];

  const slideDuration = 5000;
  const activeUser = stories[currentStoryIndex];
  const activeSlide = activeUser.slides[currentSlideIndex];

  useEffect(() => {
    if (isPaused) return;
    const interval = 50;
    const step = (100 / (slideDuration / interval));
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNextSlide();
          return 0;
        }
        return prev + step;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [currentStoryIndex, currentSlideIndex, isPaused]);

  const handleNextSlide = () => {
    setProgress(0);
    setLiked(false);
    if (currentSlideIndex < activeUser.slides.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    } else {
      if (currentStoryIndex < stories.length - 1) {
        setCurrentStoryIndex(currentStoryIndex + 1);
        setCurrentSlideIndex(0);
      } else {
        setCurrentStoryIndex(0);
        setCurrentSlideIndex(0);
      }
    }
  };

  const handlePrevSlide = () => {
    setProgress(0);
    setLiked(false);
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    } else {
      if (currentStoryIndex > 0) {
        setCurrentStoryIndex(currentStoryIndex - 1);
        setCurrentSlideIndex(stories[currentStoryIndex - 1].slides.length - 1);
      }
    }
  };

  const handleSendReply = (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    alert(`Reply sent to @${activeUser.username}: "${replyText}"`);
    setReplyText("");
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center font-sans select-none z-[60]" onClick={onClose}>
      <div
        className="relative w-full h-full sm:w-[410px] sm:h-[880px] sm:rounded-2xl overflow-hidden bg-zinc-900 flex flex-col justify-between shadow-2xl"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
        onClick={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-20 text-white/60 hover:text-white transition"
          title="Close Stories"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="absolute inset-0 z-0">
          {activeSlide.url && (
            <img
              src={activeSlide.url}
              alt="Story content"
              className="w-full h-full object-cover filter brightness-90"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80 pointer-events-none" />
        </div>

        <div className="relative z-10 p-3 pt-4 flex flex-col gap-2">
          <div className="flex gap-1 w-full">
            {activeUser.slides.map((_, idx) => (
              <div key={idx} className="h-[2px] flex-1 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-75 ease-linear"
                  style={{
                    width:
                      idx < currentSlideIndex
                        ? "100%"
                        : idx === currentSlideIndex
                        ? `${progress}%`
                        : "0%",
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-white mt-1">
            <div className="flex items-center space-x-3">
              <img
                src={activeUser.userAvatar}
                alt={activeUser.username}
                className="w-8 h-8 rounded-full border border-white/20 object-cover"
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight">
                  {activeUser.username}
                </span>
                <span className="text-xs text-white/60">{activeUser.timeAgo}</span>
              </div>
              {activeUser.isVerified && (
                <span className="text-[10px] text-blue-400 font-bold">✓</span>
              )}
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="text-white hover:text-white/80 transition"
              >
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="text-white hover:text-white/80 transition"
              >
                <MoreHorizontal size={20} />
              </button>
              <button onClick={onClose} className="text-white hover:text-white/80 transition">
                <X size={22} />
              </button>
            </div>
          </div>
        </div>

        <div className="absolute inset-0 z-10 flex">
          <div className="w-1/3 h-full cursor-pointer" onClick={handlePrevSlide} />
          <div className="w-2/3 h-full cursor-pointer" onClick={handleNextSlide} />
        </div>

        <div className="relative z-10 px-4 mt-auto mb-16 pointer-events-none">
          {activeSlide.song && (
            <div className="inline-flex items-center space-x-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 mb-3">
              <Music size={14} className="text-pink-400 animate-pulse" />
              <span className="text-xs font-medium text-white">{activeSlide.song}</span>
            </div>
          )}
          {activeSlide.caption && (
            <p className="text-white text-sm font-normal drop-shadow-md bg-black/20 backdrop-blur-sm p-2.5 rounded-xl border border-white/5 inline-block">
              {activeSlide.caption}
            </p>
          )}
        </div>

        <div className="relative z-20 p-3 pb-5 flex items-center space-x-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
          <form onSubmit={handleSendReply} className="flex-1 flex items-center bg-transparent border border-white/30 rounded-full px-4 py-2 backdrop-blur-md">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Reply to ${activeUser.username}...`}
              className="bg-transparent text-white text-sm focus:outline-none w-full placeholder-white/60"
            />
          </form>

          <button
            onClick={() => setLiked(!liked)}
            className="p-2 transition transform active:scale-125"
          >
            <Heart size={26} className={liked ? "text-red-500 fill-red-500" : "text-white"} />
          </button>

          <button
            onClick={handleSendReply}
            className="p-2 transition transform active:scale-110"
          >
            <Send size={24} className="text-white -rotate-45 mb-1" />
          </button>
        </div>

        {showOptions && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end p-4">
            <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 text-center text-sm text-white">
              <button
                onClick={() => { alert("Reported story"); setShowOptions(false); }}
                className="w-full py-3.5 text-red-500 font-semibold border-b border-zinc-800 active:bg-zinc-800"
              >
                Report
              </button>
              <button
                onClick={() => { alert("Link copied to clipboard"); setShowOptions(false); }}
                className="w-full py-3.5 border-b border-zinc-800 active:bg-zinc-800"
              >
                Copy link
              </button>
              <button
                onClick={() => setShowOptions(false)}
                className="w-full py-3.5 font-semibold text-zinc-400 active:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
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
  const [identityProfiles, setIdentityProfiles] = useState(() => {
    const stored = safeJson(LS_IDENTITY_PROFILES, null);
    if (Array.isArray(stored) && stored.length > 0) return stored;
    // First load for this account: personalize the default profile.
    const base = DEFAULT_PROFILES.map((p) => ({ ...p }));
    if (ACTIVE_SESSION && ACTIVE_SESSION.username) {
      base[0] = { ...base[0], name: ACTIVE_SESSION.username };
    }
    return base;
  });
  const [activeProfileId, setActiveProfileId] = useState(() => safeJson(LS_ACTIVE_PROFILE, 'prof_me'));
  const [userId, setUserId] = useState(() => ACTIVE_USER_ID || safeJson(LS_USER_ID, `usr_${Date.now()}`));
  const [monochromeMode, setMonochromeMode] = useState(() => safeJson(LS_MONOCHROME, false));
  const [quantumEncryptionActive, setQuantumEncryptionActive] = useState(() => safeJson(LS_QUANTUM, true));

  // UI state
  const [activeTab, setActiveTab] = useState('chats');
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [activeConversationId, setActiveConversationId] = useState('conv_ai');
  const [inputText, setInputText] = useState('');
  const [showGameVault, setShowGameVault] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [arcadeTab, setArcadeTab] = useState('games');
  const [soundEnabled, setSoundEnabled] = useState(() => safeJson(`${SCOPE}arcade_sound`, true));
  const [showSpatialAudio, setShowSpatialAudio] = useState(false);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showTokenGateModal, setShowTokenGateModal] = useState(false);
  const [botFatherState, setBotFatherState] = useState('idle');
  const [newBotData, setNewBotData] = useState({ name: '', username: '' });
  const [showSettings, setShowSettings] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    try {
      const raw = localStorage.getItem('whatsgram_gemini_key');
      return raw || '';
    } catch { return ''; }
  });
  const [apiKeyError, setApiKeyError] = useState('');
  const [recipeActive, setRecipeActive] = useState(() => safeJson(`${SCOPE}recipe_active`, { pdf: true, voice: true }));

  // ===== INSTAGRAM DM STATE =====
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [chatTheme, setChatTheme] = useState(() => {
    try { return localStorage.getItem(`${SCOPE}chat_theme`) || 'dark'; } catch { return 'dark'; }
  });
  const [mutedNotifications, setMutedNotifications] = useState(false);
  const [messageActionsMenu, setMessageActionsMenu] = useState(null); // { messageId, x, y }
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [messageReactions, setMessageReactions] = useState({}); // { messageId: [{ emoji, users: [] }] }
  const [showEmojiPicker, setShowEmojiPicker] = useState(null); // messageId

  // ===== CALL LOGS STATE =====
  const [callLogs, setCallLogs] = useState(() => {
    try {
      const raw = localStorage.getItem(`${SCOPE}call_logs`);
      return raw ? JSON.parse(raw) : INITIAL_CALL_LOGS;
    } catch { return INITIAL_CALL_LOGS; }
  });
  const [callFilter, setCallFilter] = useState('all'); // 'all' | 'missed'
  const [showCallLog, setShowCallLog] = useState(false);
  const [showCallDetails, setShowCallDetails] = useState(false);
  const [selectedCall, setSelectedCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null); // { id, contact, type, status: 'calling' | 'ringing' | 'connected' | 'ended' }
  const [callTimer, setCallTimer] = useState(0);
  const [callTimerRef, setCallTimerRef] = useState(null);

  const [editingProfileId, setEditingProfileId] = useState(null);
  const [profileDraft, setProfileDraft] = useState(null);
  const [aiTyping, setAiTyping] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [showStories, setShowStories] = useState(false);
  const [showContactSearch, setShowContactSearch] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [contacts, setContacts] = useState(() => {
    try {
      const raw = localStorage.getItem(`${SCOPE}contacts`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!ACTIVE_USER_ID);
  const [user, setUser] = useState(() => (
    ACTIVE_SESSION
      ? { id: ACTIVE_SESSION.userId, username: ACTIVE_SESSION.username, email: ACTIVE_SESSION.email }
      : null
  ));
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Derived
  const currentConv = useMemo(() => conversations.find((c) => c.id === activeConversationId), [conversations, activeConversationId]);
  const currentMessages = useMemo(() => messages[activeConversationId] || [], [messages, activeConversationId]);
  const activeProfile = identityProfiles.find((p) => p.id === activeProfileId) || identityProfiles[0];
  const currentUserId = userId;

  const messagesEndRef = useRef(null);
  const commandInputRef = useRef(null);

  // Persistence effects
  useEffect(() => { setHydrated(true); }, []);

  // One-time repair: older builds generated a random local id instead of using
  // the signed-in account id, so messages you sent were rendered as someone
  // else's. Rewrite those sender ids once, then the normal save effect persists it.
  useEffect(() => {
    if (!ACTIVE_USER_ID) return;
    let legacy = null;
    try {
      legacy = JSON.parse(localStorage.getItem(LS_USER_ID) || 'null');
    } catch {
      legacy = null;
    }
    if (!legacy || legacy === ACTIVE_USER_ID) return;
    reassignQueueUser(legacy, ACTIVE_USER_ID);
    setMessages((prev) => {
      let changed = false;
      const next = {};
      Object.entries(prev || {}).forEach(([convId, list]) => {
        next[convId] = (list || []).map((m) => {
          if (m && m.sender_id === legacy) {
            changed = true;
            return { ...m, sender_id: ACTIVE_USER_ID };
          }
          return m;
        });
      });
      return changed ? next : prev;
    });
  }, []);
  useEffect(() => {
    safeSet(LS_CONVERSATIONS, conversations);
    syncConversationsToSupabase(conversations);
  }, [conversations]);
  useEffect(() => {
    safeSet(LS_MESSAGES, messages);
    Object.entries(messages).forEach(([convId, msgs]) => syncMessagesToSupabase(convId, msgs));
  }, [messages]);
  useEffect(() => {
    safeSet(LS_CUSTOM_BOTS, customBots);
    syncBotsToSupabase(customBots);
  }, [customBots]);
  useEffect(() => {
    safeSet(LS_ARCADE_SCORES, arcadeScores);
    syncGameScoresToSupabase(arcadeScores);
  }, [arcadeScores]);
  useEffect(() => {
    safeSet(LS_IDENTITY_PROFILES, identityProfiles);
    syncProfilesToSupabase(identityProfiles, activeProfileId);
  }, [identityProfiles, activeProfileId]);
  useEffect(() => { safeSet(LS_ACTIVE_PROFILE, activeProfileId); }, [activeProfileId]);
  useEffect(() => { safeSet(LS_USER_ID, userId); }, [userId]);
  useEffect(() => { safeSet(LS_MONOCHROME, monochromeMode); }, [monochromeMode]);
  useEffect(() => { safeSet(LS_QUANTUM, quantumEncryptionActive); }, [quantumEncryptionActive]);
  useEffect(() => { safeSet(`${SCOPE}recipe_active`, recipeActive); }, [recipeActive]);
  useEffect(() => { safeSet(`${SCOPE}arcade_sound`, soundEnabled); }, [soundEnabled]);
  useEffect(() => { safeSet(`${SCOPE}contacts`, contacts); }, [contacts]);
  useEffect(() => { safeSet(`${SCOPE}call_logs`, callLogs); }, [callLogs]);
  // Clean up auth keys written by the previous (non-account) auth system.
  useEffect(() => {
    try {
      localStorage.removeItem('whatsgram_authenticated');
      localStorage.removeItem('whatsgram_user');
    } catch { /* ignore */ }
  }, []);

  // Load initial data from Supabase on mount (falls back to localStorage)
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const remote = await loadFromSupabase();
      if (!mounted || !remote) return;
      // Merge remote data with local state (remote wins for server-persisted data)
      setConversations((prev) => (remote.conversations.length > 0 ? remote.conversations : prev));
      setMessages((prev) => {
        const merged = { ...prev };
        remote.messages.forEach((m) => {
          if (!merged[m.conversation_id]) merged[m.conversation_id] = [];
          merged[m.conversation_id].push(m);
        });
        return merged;
      });
      setCustomBots((prev) => (remote.bots.length > 0 ? remote.bots : prev));
      setArcadeScores((prev) => {
        const next = { ...prev };
        remote.scores.forEach((s) => { next[String(s.game_id)] = s.score; });
        return next;
      });
      setIdentityProfiles((prev) => (remote.profiles.length > 0 ? remote.profiles : prev));
    };
    load();
    return () => { mounted = false; };
  }, []);

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

  // ===== GEMINI API CALL =====
  const callGeminiAPI = useCallback(async (conversationHistory, userMessage) => {
    try {
      // Build prompt string for Gemini API
      const recentMsgs = conversationHistory.slice(-10);
      const lines = recentMsgs.map((m) => {
        const role = m.sender_id === 'usr_ai' ? 'model' : m.sender_id === currentUserId ? 'user' : 'user';
        return `${role}: ${m.body || ''}`;
      });
      lines.push(`user: ${userMessage}`);
      const prompt = lines.join('\n');

      // If user has provided their own API key, call Gemini directly client-side
      if (geminiApiKey && geminiApiKey.trim()) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey.trim()}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
            }),
          }
        );

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          if (res.status === 401 || /API_KEY_INVALID|INVALID_ARGUMENT/i.test(errBody)) {
            setApiKeyError('Invalid Gemini API key. Please update your key in Settings.');
            return '⚠️ Invalid Gemini API key. Please go to Settings and enter a valid API key.';
          }
          throw new Error(`Gemini API error ${res.status}: ${errBody || await res.text()}`);
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty response from Gemini');
        // Clear any previous key error on success
        setApiKeyError('');
        return text;
      }

      // Otherwise, use the server-side AI route
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(`AI error ${res.status}: ${errData.error || await res.text()}`);
      }

      const data = await res.json();
      if (!data.response) throw new Error('Empty response from AI service');
      setApiKeyError('');
      return data.response;
    } catch (err) {
      console.error('AI API call failed:', err);
      setApiKeyError('');
      // Smart fallback responses when no key or service unavailable
      const lower = userMessage.toLowerCase().trim();
      if (lower.match(/^(hi|hello|hey|greetings|yo|sup)(\s|$|!|\.|,)/i)) {
        return "Hello! I'm your WhatsGram AI assistant. Add your Gemini API key in Settings to unlock live AI responses. How can I help you today?";
      }
      if (lower.match(/\b(help|assist|what can you do|capabilities|features|who are you)\b/i)) {
        return "I'm your AI assistant! Add your Google Gemini API key in Settings to unlock live AI chat. Without a key, I can still help with basic greetings, jokes, and explaining WhatsGram features.";
      }
      if (lower.match(/\b(joke|funny|comedy|laugh)\b/i)) {
        const jokes = ["Why do developers prefer dark mode? Because light attracts bugs! 🐛", "Why did the React component go to therapy? It had too many state issues! ⚛️"];
        return jokes[Math.floor(Math.random() * jokes.length)];
      }
      if (lower.match(/\b(relay|whatsgram|workspace|messenger)\b/i)) {
        return "WhatsGram is your all-in-one power-user workspace combining WhatsApp messaging, Instagram feeds, Telegram-style bots, and a 50-game arcade vault. Add your Gemini API key in Settings for live AI responses!";
      }
      return `⚠️ Sorry, I'm having trouble connecting to the AI service right now. (${err.message}) Add your Gemini API key in Settings to enable live AI responses.`;
    }
  }, [currentUserId, geminiApiKey]);

  // ===== ATTACHMENT HANDLERS =====
  const handleCamera = () => {
    setShowAttachMenu(false);
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.capture = 'environment';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            setAttachments((prev) => [...prev, {
              id: uid(),
              type: file.type.startsWith('video') ? 'video' : 'image',
              url: ev.target.result,
              name: file.name,
              size: file.size,
              mime: file.type
            }]);
            setInputText((prev) => prev + (prev ? ' ' : '') + `📷 ${file.name}`);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } catch (e) {
      console.error('Camera error:', e);
      alert('Camera access not available in this browser.');
    }
  };

  const handleGallery = () => {
    setShowAttachMenu(false);
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.multiple = true;
      input.onchange = (e) => {
        const files = Array.from(e.target.files || []);
        files.forEach((file) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            setAttachments((prev) => [...prev, {
              id: uid(),
              type: file.type.startsWith('video') ? 'video' : 'image',
              url: ev.target.result,
              name: file.name,
              size: file.size,
              mime: file.type
            }]);
          };
          reader.readAsDataURL(file);
        });
        setInputText((prev) => prev + (prev ? ' ' : '') + `📁 ${files.length} media file(s)`);
      };
      input.click();
    } catch (e) {
      console.error('Gallery error:', e);
    }
  };

  const handleFile = () => {
    setShowAttachMenu(false);
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            setAttachments((prev) => [...prev, {
              id: uid(),
              type: 'file',
              url: ev.target.result,
              name: file.name,
              size: file.size,
              mime: file.type
            }]);
            setInputText((prev) => prev + (prev ? ' ' : '') + `📄 ${file.name}`);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } catch (e) {
      console.error('File error:', e);
    }
  };

  const handleLocation = () => {
    setShowAttachMenu(false);
    if (!navigator.geolocation) {
      alert('Geolocation not available.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        setAttachments((prev) => [...prev, {
          id: uid(),
          type: 'location',
          url: mapUrl,
          name: 'Location',
          size: 0,
          mime: 'text/plain',
          lat: latitude,
          lng: longitude
        }]);
        setInputText((prev) => prev + (prev ? ' ' : '') + `📍 Location shared`);
      },
      () => alert('Location access denied.')
    );
  };

  const handlePayment = () => {
    setShowAttachMenu(false);
    const amount = prompt('Enter payment amount:');
    if (!amount) return;
    const note = prompt('Add a note (optional):') || '';
    setAttachments((prev) => [...prev, {
      id: uid(),
      type: 'payment',
      url: '',
      name: `Payment: $${amount}`,
      size: 0,
      mime: 'application/json',
      amount: parseFloat(amount),
      note
    }]);
    setInputText((prev) => prev + (prev ? ' ' : '') + `💳 Payment: $${amount}${note ? ` - ${note}` : ''}`);
  };

  const handleVoice = () => {
    setShowAttachMenu(false);
    alert('Voice recording - use the 🎙️ Record Voice button in the chat header area.');
  };

  const handleContact = () => {
    setShowAttachMenu(false);
    const name = prompt('Contact name:');
    if (!name) return;
    const phone = prompt('Phone number:') || '';
    setAttachments((prev) => [...prev, {
      id: uid(),
      type: 'contact',
      url: '',
      name: name,
      size: 0,
      mime: 'text/vcard',
      phone
    }]);
    setInputText((prev) => prev + (prev ? ' ' : '') + `👤 Contact: ${name}`);
  };

  const handlePoll = () => {
    setShowAttachMenu(false);
    const question = prompt('Poll question:');
    if (!question) return;
    const options = prompt('Options (comma-separated):') || 'Option A, Option B';
    setAttachments((prev) => [...prev, {
      id: uid(),
      type: 'poll',
      url: '',
      name: question,
      size: 0,
      mime: 'application/json',
      options: options.split(',').map(s => s.trim()),
      votes: {}
    }]);
    setInputText((prev) => prev + (prev ? ' ' : '') + `📊 Poll: ${question}`);
  };

  // Remove attachment helper
  const removeAttachment = (id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // ===== MESSAGE HANDLING =====
  const handleSendMessage = useCallback(() => {
    if (!inputText.trim() && attachments.length === 0) return;
    const text = inputText.trim();
    const newMsg = {
      id: uid(),
      sender_id: currentUserId,
      body: text,
      attachments: attachments.length > 0 ? attachments : undefined,
      created_at: nowISO()
    };

    setMessages((prev) => ({
      ...prev,
      [activeConversationId]: [...(prev[activeConversationId] || []), newMsg]
    }));
    setInputText('');
    setAttachments([]);

    // BotFather flow
    if (currentConv?.is_bot && currentConv.id === 'conv_botfather') {
      setTimeout(() => {
        const lower = text.trim().toLowerCase();
        const [cmd, ...args] = lower.split(/\s+/);
        const argText = args.join(' ');
        let reply = "I didn't understand that command. Send /help for a list of commands.";

        // ===== BotFather management commands =====
        if (cmd === '/help') {
          reply = "Available BotFather commands:\n" +
            "/newbot - Create a new bot\n" +
            "/mybots - List your bots\n" +
            "/setname <bot> <name> - Change a bot's name\n" +
            "/setusername <bot> <name> - Change a bot's username\n" +
            "/setabout <bot> <text> - Set a bot's description\n" +
            "/setcommands <bot> <cmds> - Set bot commands list\n" +
            "/deletebot <bot> - Delete a bot\n" +
            "/revoke <bot> - Regenerate a bot's token\n" +
            "/token <bot> - Show a bot's token\n" +
            "/help - Show this help";
        } else if (cmd === '/newbot') {
          setBotFatherState('awaiting_name');
          reply = 'Alright, a new bot. How are we going to call it? Please choose a name for your bot.';
        } else if (botFatherState === 'awaiting_name') {
          setNewBotData({ name: argText || text, username: '' });
          setBotFatherState('awaiting_username');
          reply = `Good. Now choose a username for your bot. It must end in '_bot'. (e.g. ${slug(argText || text)}_bot)`;
        } else if (botFatherState === 'awaiting_username') {
          const username = text.endsWith('_bot') ? text : `${text}_bot`;
          const botId = `bot_${Date.now()}`;
          const newBot = {
            id: botId,
            name: newBotData.name || 'My Bot',
            username,
            token: `token_${Math.random().toString(36).slice(2, 14)}`,
            about: '',
            commands: '',
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
        } else if (cmd === '/mybots') {
          if (customBots.length === 0) {
            reply = "You have no custom bots yet. Send /newbot to create one!";
          } else {
            const lines = customBots.map((b) =>
              `- ${b.name} (@${b.username})\n   Token: ${b.token}\n   About: ${b.about || '(none)'}\n   Commands: ${b.commands || '(none)'}`
            );
            reply = `Your bots:\n${lines.join('\n\n')}`;
          }
        } else if (cmd === '/setname') {
          const [botName, ...newNameParts] = args;
          const newName = newNameParts.join(' ');
          if (!botName || !newName) {
            reply = 'Usage: /setname <bot username or name> <new name>';
          } else {
            const bot = customBots.find((b) => b.username === botName || b.name === botName);
            if (!bot) {
              reply = `Bot "${botName}" not found. Send /mybots to list your bots.`;
            } else {
              setCustomBots((prev) => prev.map((b) => b.id === bot.id ? { ...b, name: newName } : b));
              reply = `Name updated. Your bot @${bot.username} is now called "${newName}".`;
            }
          }
        } else if (cmd === '/setusername') {
          const [botName, ...newUserParts] = args;
          const newUsername = newUserParts.join(' ').endsWith('_bot') ? newUserParts.join(' ') : `${newUserParts.join(' ')}_bot`;
          if (!botName || !newUserParts.join(' ')) {
            reply = 'Usage: /setusername <bot username or name> <new username>';
          } else {
            const bot = customBots.find((b) => b.username === botName || b.name === botName);
            if (!bot) {
              reply = `Bot "${botName}" not found. Send /mybots to list your bots.`;
            } else if (customBots.some((b) => b.username === newUsername && b.id !== bot.id)) {
              reply = `Username ${newUsername} is already taken.`;
            } else {
              setCustomBots((prev) => prev.map((b) => b.id === bot.id ? { ...b, username: newUsername } : b));
              reply = `Username updated. Your bot is now @${newUsername}.`;
            }
          }
        } else if (cmd === '/setabout') {
          const [botName, ...aboutParts] = args;
          const aboutText = aboutParts.join(' ');
          if (!botName || !aboutText) {
            reply = 'Usage: /setabout <bot username or name> <description>';
          } else {
            const bot = customBots.find((b) => b.username === botName || b.name === botName);
            if (!bot) {
              reply = `Bot "${botName}" not found. Send /mybots to list your bots.`;
            } else {
              setCustomBots((prev) => prev.map((b) => b.id === bot.id ? { ...b, about: aboutText } : b));
              reply = `About updated for @${bot.username}.`;
            }
          }
        } else if (cmd === '/setcommands') {
          const [botName, ...cmdParts] = args;
          const cmdsText = cmdParts.join(' ');
          if (!botName || !cmdsText) {
            reply = 'Usage: /setcommands <bot username or name> <commands>';
          } else {
            const bot = customBots.find((b) => b.username === botName || b.name === botName);
            if (!bot) {
              reply = `Bot "${botName}" not found. Send /mybots to list your bots.`;
            } else {
              setCustomBots((prev) => prev.map((b) => b.id === bot.id ? { ...b, commands: cmdsText } : b));
              reply = `Commands set for @${bot.username}: ${cmdsText}`;
            }
          }
        } else if (cmd === '/deletebot') {
          const botName = args[0];
          if (!botName) {
            reply = 'Usage: /deletebot <bot username or name>';
          } else {
            const bot = customBots.find((b) => b.username === botName || b.name === botName);
            if (!bot) {
              reply = `Bot "${botName}" not found. Send /mybots to list your bots.`;
            } else {
              setCustomBots((prev) => prev.filter((b) => b.id !== bot.id));
              setConversations((prev) => prev.filter((c) => c.id !== `conv_${bot.id}`));
              if (activeConversationId === `conv_${bot.id}`) {
                setActiveConversationId('conv_ai');
              }
              reply = `Bot @${bot.username} deleted.`;
            }
          }
        } else if (cmd === '/revoke' || cmd === '/token') {
          const botName = args[0];
          if (!botName) {
            reply = 'Usage: /revoke <bot username or name> (or /token to show)';
          } else {
            const bot = customBots.find((b) => b.username === botName || b.name === botName);
            if (!bot) {
              reply = `Bot "${botName}" not found. Send /mybots to list your bots.`;
            } else if (cmd === '/revoke') {
              const newToken = `token_${Math.random().toString(36).slice(2, 14)}`;
              setCustomBots((prev) => prev.map((b) => b.id === bot.id ? { ...b, token: newToken } : b));
              reply = `Token revoked and regenerated for @${bot.username}:\n${newToken}`;
            } else {
              reply = `Token for @${bot.username}:\n${bot.token}`;
            }
          }
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
        const lower = text.trim().toLowerCase();
        const [cmd, ...args] = lower.split(/\s+/);
        const argText = args.join(' ');
        let reply = `I received your message: "${text}". Send /help for commands.`;

        if (cmd === '/help') {
          const botCmds = bot?.commands ? `\nCustom commands: ${bot.commands}` : '';
          reply = `I'm ${bot?.name || 'a bot'} (@${bot?.username}). Built-in commands:\n/echo <text> - Repeat your text\n/ping - Check if bot is online\n/info - Show bot details\n/time - Current time\n/date - Current date\n/calc <expr> - Simple calculator\n/roll <sides> - Roll a die\n/flip - Coin flip\n/quote - Random quote\n/joke - Random joke${botCmds}`;
        } else if (cmd === '/ping') {
          reply = '🏓 Pong! Bot is online.';
        } else if (cmd === '/info') {
          reply = `Bot: ${bot?.name}\nUsername: @${bot?.username}\nToken: ${bot?.token}\nAbout: ${bot?.about || '(none)'}\nCommands: ${bot?.commands || '(none)'}`;
        } else if (cmd === '/echo') {
          reply = argText || 'Usage: /echo <text>';
        } else if (cmd === '/time') {
          reply = `Current time: ${new Date().toLocaleTimeString()}`;
        } else if (cmd === '/date') {
          reply = `Today: ${new Date().toLocaleDateString()}`;
        } else if (cmd === '/calc') {
          try {
            // Safe-ish math: only allow digits, operators, parens, spaces, dots
            if (!/^[\d\s\+\-\*\/\(\)\.]+$/.test(argText)) throw new Error('unsafe');
            const result = new Function('return ' + argText)();
            reply = `${argText} = ${result}`;
          } catch {
            reply = 'Usage: /calc <expression> (e.g. /calc 2 + 2 * 3)';
          }
        } else if (cmd === '/roll') {
          const sides = parseInt(args[0], 10) || 6;
          const roll = Math.floor(Math.random() * Math.max(1, sides)) + 1;
          reply = `🎲 You rolled a ${roll} (1-${sides}).`;
        } else if (cmd === '/flip') {
          reply = Math.random() < 0.5 ? '🪙 Heads!' : '🪙 Tails!';
        } else if (cmd === '/quote') {
          const quotes = [
            'The only way to do great work is to love what you do. — Steve Jobs',
            'Innovation distinguishes between a leader and a follower. — Steve Jobs',
            'Stay hungry, stay foolish. — Steve Jobs',
            'The future belongs to those who believe in the beauty of their dreams. — Eleanor Roosevelt',
            'It does not matter how slowly you go as long as you do not stop. — Confucius'
          ];
          reply = quotes[Math.floor(Math.random() * quotes.length)];
        } else if (cmd === '/joke') {
          const jokes = [
            "Why don't scientists trust atoms? Because they make up everything!",
            "I told my wife she was drawing her eyebrows too high. She looked surprised.",
            "Why did the scarecrow win an award? He was outstanding in his field.",
            "Parallel lines have so much in common. It's a shame they'll never meet.",
            "I'm reading a book on anti-gravity. It's impossible to put down!"
          ];
          reply = jokes[Math.floor(Math.random() * jokes.length)];
        } else if (bot?.commands) {
          // Match custom commands set via /setcommands
          const customCmdList = bot.commands.split(',').map((c) => c.trim()).filter(Boolean);
          const matched = customCmdList.find((c) => c.toLowerCase() === cmd.slice(1));
          if (matched) {
            reply = `Custom command "${matched}" executed for ${bot.name}.`;
          } else {
            reply = `Unknown command. Send /help for available commands.`;
          }
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

    // ===== REAL GEMINI AI RESPONSE =====
    const conversationHistory = currentMessages || [];
    const isAIChat = currentConv?.is_ai;
    const isAICommand = text.startsWith('@ai');
    const aiQuery = isAICommand ? text.replace(/^@ai\s*/, '').trim() || 'Hello' : text;

    if (isAIChat || isAICommand) {
      setAiTyping(true);
      callGeminiAPI(conversationHistory, aiQuery).then((reply) => {
        setAiTyping(false);
        setMessages((prev) => ({
          ...prev,
          [activeConversationId]: [
            ...(prev[activeConversationId] || []),
            {
              id: uid(),
              sender_id: 'usr_ai',
              body: reply,
              created_at: nowISO()
            }
          ]
        }));
      });
      if (isAICommand) {
        setInputText('');
      }
      return;
    }
  }, [inputText, activeConversationId, currentConv, currentMessages, botFatherState, newBotData, customBots, currentUserId, callGeminiAPI]);

  // ===== CALL LOG HELPERS =====
  const formatCallTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const isYesterday = d.toDateString() === new Date(now - 86400000).toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today, ${time}`;
    if (isYesterday) return `Yesterday, ${time}`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time;
  };

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const addCallLog = useCallback((contact, type, direction) => {
    const log = {
      id: `call_${Date.now()}`,
      contactId: contact.id,
      contactName: contact.display_name || contact.username || contact.name || 'Unknown',
      contactAvatar: contact.avatar_url || null,
      type,
      direction,
      duration: 0,
      timestamp: nowISO(),
      dataUsage: 0,
    };
    setCallLogs((prev) => [log, ...prev]);
    return log;
  }, []);

  const handleStartCall = useCallback((contact, type = 'voice') => {
    const log = addCallLog(contact, type, 'outgoing');
    setActiveCall({
      id: log.id,
      contact: contact,
      type,
      status: 'calling',
    });
    setShowCallLog(false);
    setShowCallDetails(false);
    let elapsed = 0;
    const timer = setInterval(() => {
      setCallTimer((prev) => {
        elapsed += 1;
        return elapsed;
      });
    }, 1000);
    setCallTimerRef(timer);
    // Auto-connect after 3 seconds
    setTimeout(() => {
      setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : null));
    }, 3000);
  }, [addCallLog]);

  const handleEndCall = useCallback(() => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    setActiveCall(null);
    setCallTimer(0);
    setCallTimerRef(null);
  }, [callTimerRef]);

  const handleClearCallLog = useCallback((id) => {
    setCallLogs((prev) => prev.filter((l) => l.id !== id));
    if (selectedCall?.id === id) {
      setShowCallDetails(false);
      setSelectedCall(null);
    }
  }, [selectedCall]);

  const handleClearAllCallLogs = useCallback(() => {
    setCallLogs([]);
    setShowCallDetails(false);
    setSelectedCall(null);
  }, []);

  // ===== CONTACT SEARCH (Instagram-style "Add Contacts") =====
  const handleSearchUsers = useCallback(async () => {
    const q = contactSearchQuery.trim();
    if (!q) { setSearchResults([]); return; }
    try {
      const accounts = JSON.parse(localStorage.getItem('whatsgram_accounts') || '[]');
      const currentUsername = user?.username || '';
      const currentEmail = user?.email || '';
      const results = accounts
        .filter((a) =>
          a.username.toLowerCase().includes(q.toLowerCase()) ||
          a.email.toLowerCase().includes(q.toLowerCase())
        )
        .filter((a) => a.username !== currentUsername && a.email !== currentEmail)
        .filter((a) => !contacts.includes(a.id))
        .slice(0, 20);
      setSearchResults(results);
    } catch (e) {
      console.warn('Contact search failed:', e);
      setSearchResults([]);
    }
  }, [contactSearchQuery, contacts, user]);

  const handleStartChatWithContact = useCallback((account) => {
    // Check if a conversation already exists with this user
    const existing = conversations.find(
      (c) => !c.is_group && c.participant?.id === account.id
    );
    if (existing) {
      setActiveConversationId(existing.id);
      setShowContactSearch(false);
      setContactSearchQuery('');
      setSearchResults([]);
      return;
    }
    // Create a new conversation
    const convId = `conv_contact_${account.id}`;
    const newConv = {
      id: convId,
      is_group: false,
      is_bot: false,
      folder: 'personal',
      name: account.username,
      participant: {
        id: account.id,
        display_name: account.username,
        avatar_url: null,
        is_online: false
      },
      last_message: '',
      unread_count: 0,
      created_at: nowISO()
    };
    setConversations((prev) => [newConv, ...prev]);
    setContacts((prev) => (prev.includes(account.id) ? prev : [...prev, account.id]));
    setActiveConversationId(convId);
    setShowContactSearch(false);
    setContactSearchQuery('');
    setSearchResults([]);
  }, [conversations, contacts, nowISO]);

  // ===== COMMAND PALETTE ACTIONS =====
  const exportChatHistory = useCallback(() => {
    const conv = currentConv;
    const msgs = currentMessages;
    const md = [`# ${conv?.name || 'Chat'}`, '', 'Exported from WhatsGram', '', ...msgs.map((m) => `- **${m.sender_id}** (${new Date(m.created_at).toLocaleString()}: ${m.body}`)].join('\n');
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
      {!hydrated ? (
        <div className="h-screen w-screen bg-[#000000]" />
      ) : !isAuthenticated ? (
        showAuthScreen ? (
          <AuthModule
            onBack={() => setShowAuthScreen(false)}
            onLoginSuccess={(userData) => {
              setIsAuthenticated(true);
              setUser(userData);
              setShowAuthScreen(false);
              // Reload so every storage key is re-scoped to this account and the
              // workspace loads only this user's own data.
              window.location.reload();
            }}
          />
        ) : (
          <LandingPage
            onGetStarted={() => setShowAuthScreen(true)}
            onSignIn={() => setShowAuthScreen(true)}
          />
        )
      ) : (
        <div
          className={`flex h-screen w-screen overflow-hidden font-sans antialiased bg-[#000000] text-[#E9EDEF] selection:bg-cyan-500/30 ${monochromeMode ? 'grayscale' : ''}`}
          style={{ transition: 'filter 0.3s ease' }}
        >
        {/* ===== LEFT NAVIGATION BAR ===== */}
        <div className="w-16 border-r flex flex-col items-center py-4 justify-between z-30 flex-shrink-0 bg-[#090D16]/90 backdrop-blur-md border-[#1F2C34]/50">
          <div className="flex flex-col items-center gap-2.5">
            <button
              onClick={() => setActiveTab('chats')}
              className={`p-2.5 rounded-2xl transition-all duration-200 ${activeTab === 'chats' ? 'bg-gradient-to-r from-indigo-500/20 via-fuchsia-500/20 to-rose-500/20 text-indigo-400 border border-indigo-500/30 shadow-lg shadow-indigo-500/20' : 'text-[#8696A0] hover:bg-[#111B21]/50 hover:text-white hover:border-transparent'}`}
              title="Chats"
            >
              <MessageSquare className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowSpatialAudio(true)}
              className="p-2.5 rounded-2xl text-[#8696A0] hover:bg-[#111B21]/50 hover:text-cyan-400 transition-all duration-200"
              title="Spatial Audio Spaces"
            >
              <Radio className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowWorkflowModal(true)}
              className="p-2.5 rounded-2xl text-[#8696A0] hover:bg-[#111B21]/50 hover:text-emerald-400 transition-all duration-200"
              title="AI Automation Recipes"
            >
              <Workflow className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowStories(true)}
              className="p-2.5 rounded-2xl text-[#8696A0] hover:bg-[#111B21]/50 hover:text-white transition-all duration-200"
              title="Status"
            >
              <Layout className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowCommandPalette(true)}
              className="p-2.5 rounded-2xl text-[#8696A0] hover:bg-[#111B21]/50 hover:text-indigo-400 transition-all duration-200"
              title="Smart Command Palette (Cmd+K)"
            >
              <Command className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowTokenGateModal(true)}
              className="p-2.5 rounded-2xl text-[#8696A0] hover:bg-[#111B21]/50 hover:text-yellow-400 transition-all duration-200"
              title="Token-Gated Channels"
            >
              <Coins className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowGameVault(true)}
              className="p-2.5 rounded-2xl text-[#8696A0] hover:bg-[#111B21]/50 hover:text-emerald-400 transition-all duration-200 relative"
              title="50-Game Arcade Vault"
            >
              <Gamepad2 className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            </button>

            <button
              onClick={() => { setActiveTab('calls'); setShowCallLog(true); setCallFilter('all'); }}
              className="p-2.5 rounded-2xl text-[#8696A0] hover:bg-[#111B21]/50 hover:text-[#00a884] transition-all duration-200 relative"
              title="Call Logs"
            >
              <Phone className="w-5 h-5" />
              {callLogs.filter(l => l.direction === 'missed').length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2.5 rounded-2xl text-[#8696A0] hover:bg-[#111B21]/50 hover:text-gray-300 transition-all duration-200 ${showSettings ? 'text-white' : ''}`}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                try { localStorage.removeItem('whatsgram_session'); } catch { /* ignore */ }
                setIsAuthenticated(false);
                setUser(null);
                setShowAuthScreen(false);
                window.location.reload();
              }}
              className="p-2.5 rounded-2xl text-[#8696A0] hover:bg-[#1F2C34]/50 hover:text-red-400 transition-all duration-200"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-2.5">
            <button
              onClick={() => setQuantumEncryptionActive(!quantumEncryptionActive)}
              className={`p-2 rounded-xl transition-all duration-200 ${quantumEncryptionActive ? 'bg-cyan-500/20 text-cyan-400' : 'bg-yellow-500/20 text-yellow-400'}`}
              title={quantumEncryptionActive ? 'Quantum-Resistant Encryption Active' : 'Standard Encryption'}
            >
              <Shield className="w-4 h-4" />
            </button>

            <button
              onClick={() => setMonochromeMode(!monochromeMode)}
              className={`p-2 rounded-xl transition-all duration-200 ${monochromeMode ? 'bg-white text-black' : 'bg-[#111B21] text-gray-400'}`}
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
              <button
                onClick={() => { setShowContactSearch(true); setContactSearchQuery(''); setSearchResults([]); }}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#1F2C34] hover:bg-[#2A3942] text-emerald-400 rounded-lg text-xs font-medium transition"
                title="New Chat"
              >
                <UserPlus className="w-3.5 h-3.5" /> New Chat
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
                    className={`flex items-center gap-3 p-3 cursor-pointer border-b border-[#0a0a0a]/50 transition-all duration-200 group ${
                      isActive ? 'bg-[#1F2C34] border-[#3A4952]/50' : 'hover:bg-[#111B21]/50 hover:border-transparent'
                    }`}
                  >
                    <div className="relative p-0.5 rounded-full bg-gradient-to-tr from-[#833AB4] via-[#FD1D1D] to-[#FCB045]">
                      <img
                        src={conv.participant?.avatar_url}
                        alt="Avatar"
                        className="w-10 h-10 rounded-full object-cover border-2 border-black shadow-inner"
                        onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(conv.participant?.display_name || 'User') + '&background=random'; }}
                      />
                      {conv.participant?.is_online && (
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#09090b] animate-pulse" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <h4 className="text-sm font-semibold text-white truncate">
                          {String(conv.participant?.display_name || conv.name || 'Chat')}
                        </h4>
                        {conv.unread_count > 0 && (
                          <span className="bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#E1306C] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#8696A0] truncate leading-none">
                        {String(conv.last_message || '')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveConversationId(conv.id); }}
                        className="p-1.5 rounded-full bg-[#1F2C34] border border-[#2A3942]/50 text-zinc-400 hover:text-white hover:bg-[#2A3942] transition-all"
                        title="Open Chat"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    </div>


                );
              })}
          </div>
        </div>

        {/* ===== MAIN CONVERSATION PANEL ===== */}
        <div className="flex-1 flex flex-col relative z-10 bg-[#000000]">
          {activeTab === 'calls' ? (
            <div className="flex-1 flex flex-col bg-[#000000]">
              {/* Call Log Header */}
              <div className="p-3 bg-[#0B141A] border-b border-[#1F2C34] flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Phone className="w-5 h-5 text-[#00a884]" /> Calls
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCallFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${callFilter === 'all' ? 'bg-[#00a884]/20 text-[#00a884]' : 'text-[#8696A0] hover:bg-[#111B21]'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setCallFilter('missed')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${callFilter === 'missed' ? 'bg-[#ea0038]/20 text-[#ea0038]' : 'text-[#8696A0] hover:bg-[#111B21]'}`}
                  >
                    Missed
                  </button>
                  <button
                    onClick={() => handleClearAllCallLogs()}
                    className="text-xs text-[#ea0038] hover:text-red-400 transition"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Call Log List */}
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {callLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Phone className="w-16 h-16 text-gray-700 mb-4" />
                    <h3 className="text-lg font-bold text-white">No Call Logs</h3>
                    <p className="text-sm text-gray-400 mt-1">Your call history will appear here.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#1F2C34]">
                    {callLogs
                      .filter((l) => callFilter === 'all' || l.direction === 'missed')
                      .map((log) => {
                        const isMissed = log.direction === 'missed';
                        const isOutgoing = log.direction === 'outgoing';
                        const dirIcon = isMissed ? <PhoneMissed className="w-4 h-4 text-red-500" /> : isOutgoing ? <PhoneOutgoing className="w-4 h-4 text-[#00a884]" /> : <PhoneIncoming className="w-4 h-4 text-[#00a884]" />;
                        const mediaIcon = log.type === 'video' ? <Video className="w-3 h-3 text-[#00a884]" /> : <Phone className="w-3 h-3 text-[#00a884]" />;
                        return (
                          <button
                            key={log.id}
                            onClick={() => { setSelectedCall(log); setShowCallDetails(true); }}
                            className="flex items-center gap-3 p-4 hover:bg-[#111B21] transition group border-b border-[#0a0a0a]/50"
                          >
                            <div className="relative p-0.5 rounded-full bg-gradient-to-tr from-[#833AB4] via-[#FD1D1D] to-[#FCB045]">
                              <img
                                src={log.contactAvatar}
                                alt="Avatar"
                                className="w-11 h-11 rounded-full object-cover border-2 border-black"
                                onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(log.contactName) + '&background=random'; }}
                              />
                              {log.direction === 'missed' && (
                                <div className="absolute bottom-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-black" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-baseline">
                                <h4 className="text-sm font-semibold text-white truncate">
                                  {log.contactName}
                                </h4>
                                <span className="text-[10px] text-[#8696A0]">{formatCallTime(log.timestamp)}</span>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                {dirIcon}
                                {mediaIcon}
                                <span className="text-[10px] text-[#8696A0]">{isMissed ? 'Missed' : isOutgoing ? 'Outgoing' : 'Incoming'} • {formatDuration(log.duration)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleStartCall({ id: log.contactId, display_name: log.contactName, avatar_url: log.contactAvatar }, log.type); }}
                                className="p-2 rounded-full bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884]/20 transition"
                                title="Call"
                              >
                                <Phone className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleClearCallLog(log.id); }}
                                className="p-2 rounded-full bg-[#ea0038]/10 text-[#ea0038] hover:bg-[#ea0038]/20 transition"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          ) : currentConv ? (
            <>
              {/* ===== INSTAGRAM DM HEADER ===== */}
              <div className="p-3 bg-[#09090b] flex justify-between items-center border-b border-zinc-800">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('chats')}>
                  <CornerUpLeft className="w-4 h-4 text-zinc-400 hover:text-white transition" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      src={currentConv.participant?.avatar_url}
                      alt="Avatar"
                      className="w-9 h-9 rounded-full object-cover border border-zinc-800"
                      onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentConv.participant?.display_name || 'User') + '&background=random'; }}
                    />
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#09090b] ${currentConv.participant?.is_online ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-sm font-semibold text-white truncate">
                        {String(currentConv.participant?.display_name || currentConv.name || 'Chat')}
                      </h3>
                      {currentConv.participant?.is_online && (
                        <span className="text-[10px] text-emerald-500 font-medium flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> Active now
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500 truncate">
                      @{String(currentConv.participant?.display_name || currentConv.name || 'user').toLowerCase().replace(/\s+/g, '.')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleStartCall({ id: currentConv.participant?.id || 'unknown', display_name: currentConv.participant?.display_name || 'Contact', avatar_url: currentConv.participant?.avatar_url }, 'voice')}
                    className="p-2 rounded-full bg-zinc-900/50 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
                    title="Audio Call"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleStartCall({ id: currentConv.participant?.id || 'unknown', display_name: currentConv.participant?.display_name || 'Contact', avatar_url: currentConv.participant?.avatar_url }, 'video')}
                    className="p-2 rounded-full bg-zinc-900/50 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
                    title="Video Call"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowChatSettings(true)}
                    className="p-2 rounded-full bg-zinc-900/50 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                    title="Chat Settings"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                {currentMessages.map((m) => (
                  <MessageItem key={m.id} message={m} currentUserId={currentUserId} messageReactions={messageReactions} setMessageReactions={setMessageReactions} messageActionsMenu={messageActionsMenu} setMessageActionsMenu={setMessageActionsMenu} showEmojiPicker={showEmojiPicker} setShowEmojiPicker={setShowEmojiPicker} setReplyingToMessage={setReplyingToMessage} setConversations={setConversations} />
                ))}
                {aiTyping && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-2 bg-[#0B141A] border-t border-[#1F2C34]">
                {/* Attachment Preview Chips */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2 max-h-24 overflow-y-auto pr-1">
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-2 bg-[#2A3942] border border-[#3A4952] rounded-lg px-2 py-1.5"
                      >
                        <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold">
                          {att.type === 'image' ? '🖼️' : att.type === 'video' ? '🎬' : att.type === 'file' ? '📄' : att.type === 'location' ? '📍' : att.type === 'payment' ? '💳' : att.type === 'contact' ? '👤' : att.type === 'poll' ? '📊' : '📎'}
                        </div>
                        <span className="text-[10px] text-[#E9EDEF] truncate max-w-[120px]">{att.name}</span>
                        <button
                          onClick={() => removeAttachment(att.id)}
                          className="w-5 h-5 rounded flex items-center justify-center text-[#9CA3AF] hover:text-red-400 hover:bg-[#3A4952] transition"
                          title="Remove"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Attachment + Input Row */}
                <div className="flex items-end gap-2 bg-[#111B21]/80 backdrop-blur-md rounded-2xl p-2 border border-[#2A3942]/50 shadow-xl">
                  {/* Attachment Button (+) */}
                  <button
                    onClick={() => setShowAttachMenu(!showAttachMenu)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-emerald-400 hover:bg-[#2A3942] transition-all duration-200 border border-transparent hover:border-emerald-500/30"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  {/* Text Input */}
                  <div className="relative flex-1 min-w-0">
                    <input
                      ref={commandInputRef}
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                      placeholder={
                        currentConv?.is_bot && currentConv.id === 'conv_botfather'
                          ? `Type bot command (/newbot, /mybots, /help)...`
                          : currentConv?.is_bot
                          ? `Talk to ${currentConv.name}...`
                          : currentConv?.is_ai
                          ? 'Ask the AI... or type @ai in any chat'
                          : 'Message...'
                      }
                      className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none pr-4"
                    />
                    {currentConv?.is_ai && (
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-600 bg-[#111B21] px-1">
                        @ai
                      </div>
                    )}
                    <div className="absolute inset-y-0 right-2 flex items-center gap-1.5">
                      <button
                        onClick={() => setShowAttachMenu(!showAttachMenu)}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-[#2A3942] transition-all"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={handleSendMessage}
                        disabled={!inputText.trim() && attachments.length === 0}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200 ${inputText.trim() || attachments.length > 0 ? 'bg-gradient-to-r from-indigo-500 to-rose-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-zinc-800/50 text-zinc-500 hover:bg-zinc-700'}`}
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Attachment Menu */}
                {showAttachMenu && (
                  <div className="absolute bottom-[75px] left-4 w-64 bg-[#111B21] rounded-2xl border border-[#2A3942] shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <AttachmentButton
                        icon={<Camera className="w-5 h-5 text-cyan-400" />}
                        label="Camera"
                        onClick={handleCamera}
                      />
                      <AttachmentButton
                        icon={<ImageIcon className="w-5 h-5 text-emerald-400" />}
                        label="Gallery"
                        onClick={handleGallery}
                      />
                      <AttachmentButton
                        icon={<FileText className="w-5 h-5 text-purple-400" />}
                        label="File"
                        onClick={handleFile}
                      />
                      <AttachmentButton
                        icon={<MapPin className="w-5 h-5 text-blue-400" />}
                        label="Location"
                        onClick={handleLocation}
                      />
                      <AttachmentButton
                        icon={<CreditCard className="w-5 h-5 text-pink-400" />}
                        label="Payment"
                        onClick={handlePayment}
                      />
                      <AttachmentButton
                        icon={<Mic className="w-5 h-5 text-orange-400" />}
                        label="Voice"
                        onClick={handleVoice}
                      />
                      <AttachmentButton
                        icon={<User className="w-5 h-5 text-gray-400" />}
                        label="Contact"
                        onClick={handleContact}
                      />
                      <AttachmentButton
                        icon={<Star className="w-5 h-5 text-yellow-400" />}
                        label="Poll"
                        onClick={handlePoll}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#833AB4] via-[#FD1D1D] to-[#FCB045] flex items-center justify-center mb-4 text-white shadow-lg shadow-indigo-500/20">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Select a conversation</h3>
              <p className="text-sm text-zinc-500 mt-1">Choose a chat from the sidebar to start messaging</p>
            </div>
          )}
        </div>

        {/* ===== MODAL: ARCADE VAULT + LEADERBOARD ===== */}
        {showGameVault && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-3 md:p-4 backdrop-blur-sm" onClick={() => { setShowGameVault(false); setSelectedGameId(null); }}>
            <div className="bg-[#0B141A] rounded-2xl p-4 md:p-5 space-y-4 max-w-5xl w-full text-white shadow-2xl border border-[#1F2C34] max-h-[92vh] flex flex-col max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap justify-between items-center gap-2">
                <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                  <Gamepad2 className="w-6 h-6 text-emerald-400" /> Arcade Vault
                  <span className="text-[10px] font-mono text-zinc-500">53 games</span>
                </h3>
                <div className="flex items-center gap-2">
                  <div className="flex bg-[#1F2C34] rounded-lg p-1 border border-[#2A3942]">
                    <button
                      onClick={() => { setArcadeTab('games'); setSelectedGameId(null); }}
                      className={`px-3 py-1 rounded-md text-[11px] font-bold transition ${arcadeTab === 'games' && !selectedGameId ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-400 hover:text-white'}`}
                    >
                      Games
                    </button>
                    <button
                      onClick={() => { setArcadeTab('leaderboard'); setSelectedGameId(null); }}
                      className={`px-3 py-1 rounded-md text-[11px] font-bold transition ${arcadeTab === 'leaderboard' ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-400 hover:text-white'}`}
                    >
                      Leaderboard
                    </button>
                  </div>
                  <button
                    onClick={() => setSoundEnabled((v) => !v)}
                    className={`p-2 rounded-lg transition ${soundEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#2A3942] text-gray-500'}`}
                    title="Toggle Sound"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                  <button onClick={() => { setShowGameVault(false); setSelectedGameId(null); }} className="p-2 hover:bg-[#1F2C34] rounded-lg transition">
                    <X className="w-5 h-5 text-gray-400 hover:text-white" />
                  </button>
                </div>
              </div>

              {selectedGameId ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-3 bg-[#1F2C34] p-3 md:p-5 rounded-xl border border-[#2A3942] overflow-y-auto">
                  <div className="text-center space-y-1">
                    <h4 className="text-lg md:text-xl font-bold text-emerald-400">
                      🎮 {ALL_GAMES.find((g) => g.id === selectedGameId)?.name}
                    </h4>
                    <p className="text-[11px] text-[#8696A0]">
                      {ALL_GAMES.find((g) => g.id === selectedGameId)?.category} · Best: {arcadeScores[selectedGameId] || 0} · Sound: {soundEnabled ? 'On' : 'Off'}
                    </p>
                  </div>

                  <ArcadePlayer
                    game={ALL_GAMES.find((g) => g.id === selectedGameId) || ALL_GAMES[0]}
                    sound={soundEnabled}
                    best={arcadeScores[selectedGameId] || 0}
                    onScore={(pts) => {
                      const meta = ALL_GAMES.find((g) => g.id === selectedGameId);
                      const previous = arcadeScores[selectedGameId] || 0;
                      if (pts <= previous) return;
                      setArcadeScores((prev) => ({ ...prev, [selectedGameId]: Math.max(prev[selectedGameId] || 0, pts) }));
                      queueScore({
                        userId: currentUserId,
                        playerName: (ACTIVE_SESSION && ACTIVE_SESSION.username) || 'Player',
                        gameId: selectedGameId,
                        gameName: meta ? meta.name : `Game #${selectedGameId}`,
                        score: pts,
                      });
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
                      onClick={() => { setSelectedGameId(null); setArcadeTab('leaderboard'); }}
                      className="flex-1 py-2 bg-[#2A3942] hover:bg-[#3A4952] text-amber-200 text-xs rounded-lg border border-[#3A4952] transition"
                    >
                      🏆 Leaderboard
                    </button>
                  </div>
                </div>
              ) : arcadeTab === 'leaderboard' ? (
                <div className="flex-1 min-h-0 bg-[#1F2C34] p-3 md:p-4 rounded-xl border border-[#2A3942] flex flex-col">
                  <Leaderboard games={ALL_GAMES} currentUserId={currentUserId} />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pr-2 scrollbar-hide">
                  {ALL_GAMES.map((game) => {
                    const IconComponent = safeIcon(GAME_ICONS[game.type] || Gamepad2);
                    const highScore = arcadeScores[game.id] || 0;
                    return (
                      <button
                        key={game.id}
                        data-game-id={game.id}
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

        {/* ===== MODAL: SPATIAL AUDIO SPACE ===== */}
        {showSpatialAudio && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowSpatialAudio(false)}>
            <div className="bg-[#0B141A] rounded-2xl p-6 space-y-4 max-w-4xl w-full text-white shadow-2xl border border-[#1F2C34] flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Radio className="w-5 h-5 text-cyan-400" /> Spatial Audio Room Canvas
                </h3>
                <button onClick={() => setShowSpatialAudio(false)} className="p-2 hover:bg-[#1F2C34] rounded-lg transition">
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>
              <SpatialAudioRoom onClose={() => setShowSpatialAudio(false)} />
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
              {[ { id: 'pdf', title: 'Auto-Summarize PDFs', desc: 'On PDF Received', color: 'emerald' }, { id: 'voice', title: 'Voice Transcription', desc: 'On Voice Note Received', color: 'cyan' } ].map((recipe) => {
                const toggled = recipeActive[recipe.id] ?? true;
                const colorMap = { emerald: 'bg-emerald-500 text-emerald-900', cyan: 'bg-cyan-500 text-cyan-900' };
                return (
                  <div key={recipe.id} className="p-3 bg-[#1F2C34] rounded-xl flex justify-between items-center border border-[#2A3942]">
                    <div>
                      <h4 className="text-xs font-bold text-white">{recipe.title}</h4>
                      <p className="text-[10px] text-[#8696A0]">{recipe.desc}</p>
                    </div>
                    <button
                      onClick={() => setRecipeActive((prev) => ({ ...prev, [recipe.id]: !toggled }))}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold transition ${toggled ? colorMap[recipe.color] : 'bg-[#3A4952] text-gray-400'}`}
                    >
                      {toggled ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                );
              })}
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

        {/* ===== MODAL: INSTAGRAM STORIES ===== */}
        {showStories && (
          <StoryViewer onClose={() => setShowStories(false)} />
        )}

        {/* ===== MODAL: SETTINGS / IDENTITY PROFILES ===== */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
            <div className="glass-card p-6 max-w-2xl w-full text-white shadow-2xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <User className="w-5 h-5 text-cyan-400" />
                  {editingProfileId ? 'Edit Profile' : 'Settings'}
                </h3>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-[#1F2C34] rounded-lg transition hover-scale">
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>

              {/* ===== API KEY CONFIGURATION ===== */}
              {!editingProfileId && (
                <div className="glass-card p-4 mb-4 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-sm font-semibold text-white">Gemini API Key</h4>
                  </div>
                  <p className="text-xs text-[#8696A0] mb-2">
                    Enter your Google Gemini API key to unlock live AI responses in WhatsGram AI chat.
                    Your key is stored locally in your browser and never sent to our servers.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder="sk-... or AIza..."
                      className="glass-input px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400 transition placeholder-zinc-600 flex-1"
                    />
                    <button
                      onClick={() => {
                        if (!geminiApiKey.trim()) {
                          setApiKeyError('Please enter a valid API key.');
                          return;
                        }
                        try {
                          localStorage.setItem('whatsgram_gemini_key', geminiApiKey.trim());
                          setApiKeyError('');
                        } catch {
                          setApiKeyError('Failed to save API key to localStorage.');
                        }
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-[#833AB4] to-[#E1306C] hover:from-[#7e69af] hover:to-[#c50f5b] text-white text-xs font-bold rounded-lg transition shadow-lg shadow-emerald-500/30 hover-shadow-lg hover-shadow-[0_0_20px_rgba(131,58,180,0.4)]"
                    >
                      Save
                    </button>
                  </div>
                  {apiKeyError && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{apiKeyError}</span>
                    </div>
                  )}
                  <p className="text-[10px] text-[#5A6B7A]">
                    Get your free API key at{' '}
                    <a
                      href="https://makersuite.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:underline"
                    >
                      Google AI Studio
                    </a>
                  </p>
                </div>
              )}

              {/* Back button when editing */}
              {editingProfileId && (
                <button
                  onClick={() => { setEditingProfileId(null); setProfileDraft(null); }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[#1F2C34] hover:bg-[#2A3942] text-[#8696A0] rounded-lg text-xs font-medium transition border border-[#2A3942]"
                >
                  <ChevronLeft className="w-3 h-3 mr-1" /> Back to Profiles
                </button>
              )}

              {/* ===== PROFILE LIST VIEW ===== */}
              {!editingProfileId && (
                <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
                  <p className="text-xs text-[#8696A0] mb-3">Switch between your identity sub-profiles. Each profile has its own color, bio, and display name.</p>
                  {identityProfiles.map((profile) => {
                    const isActive = activeProfileId === profile.id;
                    return (
                      <div key={profile.id} className="flex items-center gap-3 p-3 rounded-2xl border transition-all duration-200 border-[#1F2C34] cursor-pointer group hover:border-indigo-500/50 hover:bg-[#1F2C34]/50">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shadow ${profile.color} relative`}>
                          {profile.avatar ? (
                            <img src={profile.avatar} alt="Avatar" className="w-full h-full rounded-full object-cover" onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=${profile.color.replace('#','')}&color=ffffff`; }} />
                          ) : (
                            String(profile.name).charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline">
                            <div className="text-sm font-medium text-white truncate">{profile.name}</div>
                            {isActive && <span className="bg-emerald-500 text-emerald-900 text-[9px] px-1.5 py-0.5 rounded-full font-bold">Active</span>}
                          </div>
                          {profile.about && (
                            <div className="text-[10px] text-gray-500 truncate">{profile.about}</div>
                          )}
                          <div className="text-[10px] text-gray-600">{profile.status || 'Available'}</div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); switchProfile(profile.id); }}
                            className="p-1.5 hover:bg-[#2A3942] rounded text-gray-400 transition"
                            title="Switch to this profile"
                          >
                            <CheckCheck className={`w-3 h-3 ${isActive ? 'text-emerald-400' : 'text-gray-600'}`} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingProfileId(profile.id); setProfileDraft({ ...profile }); }}
                            className="p-1.5 hover:bg-[#2A3942] rounded text-[#833AB4] transition"
                            title="Edit profile"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ===== PROFILE EDITOR VIEW (WhatsApp-style) ===== */}
              {editingProfileId && profileDraft && (
                <div className="flex-1 overflow-y-auto space-y-5 scrollbar-hide">
                  <p className="text-xs text-[#8696A0]">Customize your identity sub-profile details.</p>

                  {/* Profile Picture Section */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative group">
                      <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl border-4 border-[#1F2C34] ${profileDraft.color}`} style={{ background: profileDraft.color }}>
                        {profileDraft.avatar ? (
                          <img src={profileDraft.avatar} alt="Profile" className="w-full h-full rounded-full object-cover" onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profileDraft.name)}&background=${profileDraft.color.replace('#','')}&color=ffffff`; }} />
                        ) : (
                          <span className="text-xl font-bold text-white">{String(profileDraft.name).charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <button
                        onClick={() => { document.getElementById('profile-avatar-input')?.click(); }}
                        className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#833AB4] flex items-center justify-center text-white text-[10px] shadow-lg hover:scale-105 transition"
                        title="Change photo"
                      >
                        <Camera className="w-3 h-3" />
                      </button>
                      <input
                        id="profile-avatar-input"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setProfileDraft((prev) => prev ? { ...prev, avatar: ev.target.result } : null);
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-500">Tap to change profile photo</p>
                  </div>

                  <div className="space-y-4">
                    {/* Display Name */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-medium text-gray-400 mb-1">
                        <span>*</span> Name
                      </label>
                      <input
                        type="text"
                        value={profileDraft.name}
                        onChange={(e) => setProfileDraft((prev) => prev ? { ...prev, name: e.target.value } : null)}
                        className="w-full bg-[#1F2C34] border border-[#2A3942] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 transition"
                        placeholder="Enter name"
                      />
                    </div>

                    {/* About / Bio */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-medium text-gray-400 mb-1">
                        About
                      </label>
                      <textarea
                        value={profileDraft.about || ''}
                        onChange={(e) => setProfileDraft((prev) => prev ? { ...prev, about: e.target.value } : null)}
                        rows={3}
                        className="w-full bg-[#1F2C34] border border-[#2A3942] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 transition"
                        placeholder="Hey there! I am using WhatsGram."
                      />
                      <div className="flex justify-end mt-1">
                        <span className="text-[10px] text-gray-600">{profileDraft.about?.length || 0}/139</span>
                      </div>
                    </div>

                    {/* Status */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-medium text-gray-400 mb-1">
                        Status
                      </label>
                      <select
                        value={profileDraft.status || 'Available'}
                        onChange={(e) => setProfileDraft((prev) => prev ? { ...prev, status: e.target.value } : null)}
                        className="w-full bg-[#1F2C34] border border-[#2A3942] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 transition"
                      >
                        <option value="Available">Available</option>
                        <option value="At Work">At Work</option>
                        <option value="At the Gym">At the Gym</option>
                        <option value="In a Meeting">In a Meeting</option>
                        <option value="At the Movies">At the Movies</option>
                        <option value="Sleeping">Sleeping</option>
                        <option value="Urgent calls only">Urgent calls only</option>
                        <option value="Battery about to die">Battery about to die</option>
                        <option value="Custom…">Custom…</option>
                      </select>
                    </div>

                    {/* Profile Color */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-medium text-gray-400 mb-2">
                        Profile Color
                      </label>
                      <div className="flex gap-2">
                        {['#833AB4', '#0ea5e9', '#22c55e', '#ef4444', '#f59e0b', '#ec4899', '#a855f7', '#6366f1'].map((c) => (
                          <button
                            key={c}
                            onClick={() => setProfileDraft((prev) => prev ? { ...prev, color: c } : null)}
                            className={`w-8 h-8 rounded-full border-2 transition ${profileDraft.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0B141A]' : 'border-transparent hover:scale-110'}`}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#2A3942] flex justify-between">
                    <button
                      onClick={() => { setEditingProfileId(null); setProfileDraft(null); }}
                      className="px-4 py-2 bg-[#1F2C34] hover:bg-[#2A3942] text-gray-300 text-xs font-medium rounded-lg transition border border-[#2A3942]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        setIdentityProfiles((prev) => prev.map((p) => (p.id === profileDraft.id ? profileDraft : p)));
                        setEditingProfileId(null);
                        setProfileDraft(null);
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-[#833AB4] to-[#E1306C] text-white text-xs font-medium rounded-lg shadow hover:opacity-90 transition"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {/* Add New Profile button (only in list view) */}
              {!editingProfileId && (
                <div className="pt-4 border-t border-[#2A3942]">
                  <button
                    onClick={() => {
                      const newProfile = { id: uid(), name: `Profile ${identityProfiles.length + 1}`, color: '#6366f1', avatar: null, bio: '', about: '', status: 'Available' };
                      setIdentityProfiles((prev) => [...prev, newProfile]);
                      setEditingProfileId(newProfile.id);
                      setProfileDraft({ ...newProfile });
                    }}
                    className="w-full py-2 bg-[#1F2C34] hover:bg-[#2A3942] text-gray-300 text-xs rounded border border-[#2A3942] transition flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add New Profile
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {/* ===== MODAL: CONTACT SEARCH (Instagram-style "Add Contacts") ===== */}
      {showContactSearch && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowContactSearch(false)}>
          <div className="bg-[#0B141A] rounded-2xl p-6 w-full max-w-md text-white shadow-2xl border border-[#1F2C34] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" /> New Chat
              </h3>
              <button
                onClick={() => { setShowContactSearch(false); setContactSearchQuery(''); setSearchResults([]); }}
                className="p-2 hover:bg-[#1F2C34] rounded-lg transition"
                title="Close"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
              <input
                type="text"
                value={contactSearchQuery}
                onChange={(e) => { setContactSearchQuery(e.target.value); setSearchResults([]); }}
                onBlur={handleSearchUsers}
                placeholder="Search by username or email..."
                className="w-full bg-[#1F2C34] border border-[#2A3942] rounded-xl px-4 py-2.5 pl-10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-400 transition"
              />
            </div>

            {/* Search Results */}
            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {searchResults.length === 0 && contactSearchQuery.trim() !== '' && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <UserPlus className="w-12 h-12 text-[#2A3942] mb-2" />
                  <p className="text-xs text-[#8696A0]">No accounts found</p>
                  <p className="text-[10px] text-[#5A6B7A] mt-1">Try searching by username or email</p>
                </div>
              )}
              {searchResults.map((account) => (
                <button
                  key={account.id}
                  onClick={() => handleStartChatWithContact(account)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#1F2C34] hover:bg-[#2A3942] transition group"
                >
                  <div className="relative p-0.5 rounded-full bg-gradient-to-tr from-[#833AB4] via-[#FD1D1D] to-[#FCB045]">
                    <img
                      src={`https://ui-avatars.com/api/?name=${encodeURIComponent(account.username)}&background=random`}
                      alt="Avatar"
                      className="w-10 h-10 rounded-full object-cover border-2 border-black"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white truncate">{account.username}</h4>
                    <p className="text-[10px] text-[#8696A0] truncate">{account.email}</p>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-semibold">Add</span>
                </button>
              ))}
              {searchResults.length > 0 && (
                <div className="pt-2 border-t border-[#1F2C34]">
                  <p className="text-[10px] text-[#5A6B7A] px-3 py-2">
                    Tap an account to start a new chat
                  </p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#1F2C34] flex justify-end">
              <button
                onClick={() => { setShowContactSearch(false); setContactSearchQuery(''); setSearchResults([]); }}
                className="px-4 py-1.5 bg-[#1F2C34] text-gray-300 text-xs rounded-lg border border-[#2A3942] hover:bg-[#2A3942] transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: CALL DETAILS ===== */}
      {showCallDetails && selectedCall && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => { setShowCallDetails(false); setSelectedCall(null); }}>
          <div className="bg-[#0B141A] rounded-2xl p-6 w-full max-w-md text-white shadow-2xl border border-[#1F2C34] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Call Info</h3>
              </div>
              <button
                onClick={() => { setShowCallDetails(false); setSelectedCall(null); }}
                className="p-2 hover:bg-[#1F2C34] rounded-lg transition"
                title="Close"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </div>

            {/* Contact Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="relative p-0.5 rounded-full bg-gradient-to-tr from-[#833AB4] via-[#FD1D1D] to-[#FCB045]">
                <img
                  src={selectedCall.contactAvatar}
                  alt="Avatar"
                  className="w-16 h-16 rounded-full object-cover border-2 border-black"
                  onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(selectedCall.contactName) + '&background=random'; }}
                />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{selectedCall.contactName}</h3>
                <p className="text-xs text-[#8696A0]">{selectedCall.type === 'video' ? 'Video Call' : 'Voice Call'}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => { setShowCallDetails(false); setShowCallLog(false); }}
                  className="px-3 py-1 bg-[#00a884] hover:bg-[#00a884]/90 text-white text-xs rounded-lg transition flex items-center gap-1"
                >
                  <Phone className="w-3 h-3" /> Message
                </button>
              </div>
            </div>

            {/* Call Info Items */}
            <div className="space-y-4 mb-6">
              <div className="p-3 bg-[#1F2C34] rounded-xl border border-[#2A3942]">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-[#8696A0]">Date</span>
                  <span className="text-xs text-white">{formatCallTime(selectedCall.timestamp)}</span>
                </div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-[#8696A0]">Direction</span>
                  <span className="text-xs text-white capitalize">{selectedCall.direction}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#8696A0]">Type</span>
                  <span className="text-xs text-white capitalize">{selectedCall.type}</span>
                </div>
              </div>

              {selectedCall.duration > 0 && (
                <div className="p-3 bg-[#1F2C34] rounded-xl border border-[#2A3942]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-[#8696A0]">Duration</span>
                    <span className="text-xs text-white">{formatDuration(selectedCall.duration)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[#8696A0]">Data Used</span>
                    <span className="text-xs text-white">{selectedCall.dataUsage.toFixed(1)} MB</span>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[#1F2C34]">
                <p className="text-[10px] text-[#5A6B7A] mb-2">Recent calls with {selectedCall.contactName}</p>
                <div className="space-y-2">
                  {callLogs
                    .filter((l) => l.contactId === selectedCall.contactId && l.id !== selectedCall.id)
                    .slice(0, 3)
                    .map((l) => (
                      <div key={l.id} className="flex justify-between items-center p-2 bg-[#111B21] rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className={l.direction === 'missed' ? 'w-3 h-3 bg-red-500 rounded-full' : 'w-3 h-3 bg-[#00a884] rounded-full'} />
                          <span className="text-xs text-white">{l.direction === 'missed' ? 'Missed' : l.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}</span>
                        </div>
                        <span className="text-xs text-[#8696A0]">{formatCallTime(l.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#1F2C34] flex justify-end gap-2">
              <button
                onClick={() => { setShowCallDetails(false); setSelectedCall(null); }}
                className="px-4 py-1.5 bg-[#1F2C34] text-gray-300 text-xs rounded-lg border border-[#2A3942] hover:bg-[#2A3942] transition"
              >
                Done
              </button>
            </div>
          </div>
      )}

      {/* ===== ACTIVE CALL OVERLAY ===== */}
      {activeCall && (
        <div className="fixed inset-0 bg-[#000000] z-60 flex flex-col items-center justify-center p-4">
          <div className="bg-[#0B141A] rounded-2xl p-8 w-full max-w-md text-center shadow-2xl border border-[#1F2C34]">
            <div className="w-24 h-24 rounded-full bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#FCB045] flex items-center justify-center mx-auto mb-6 relative">
              <img
                src={activeCall.contact.avatar_url}
                alt="Avatar"
                className="w-20 h-20 rounded-full object-cover border-4 border-black"
                onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(activeCall.contact.display_name || activeCall.contact.username || 'User') + '&background=random'; }}
              />
              {activeCall.status === 'ringing' && (
                <div className="absolute -right-2 -top-2 w-3 h-3 bg-red-500 rounded-full border-2 border-black animate-pulse" />
              )}
              {activeCall.status === 'connected' && (
                <div className="absolute -right-2 -top-2 w-3 h-3 bg-[#00a884] rounded-full border-2 border-black animate-pulse" />
              )}
            </div>

            <h3 className="text-xl font-bold text-white mb-1">{activeCall.contact.display_name || activeCall.contact.username || 'User'}</h3>
            <p className="text-[#8696A0] text-sm mb-8">
              {activeCall.status === 'calling' ? 'Calling...' : activeCall.status === 'ringing' ? 'Ringing...' : activeCall.status === 'connected' ? 'On Call' : 'Call Ended'}
            </p>

            {/* Call Timer */}
            {activeCall.status === 'connected' && (
              <div className="text-2xl font-mono text-white mb-8">
                {Math.floor(callTimer / 60).toString().padStart(2, '0')}:{ (callTimer % 60).toString().padStart(2, '0') }
              </div>
            )}

            {/* Call Controls */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <button
                onClick={() => { /* toggle mute */ }}
                className="w-12 h-12 rounded-full bg-[#1F2C34] text-[#8696A0] hover:bg-[#2A3942] hover:text-white flex items-center justify-center transition"
              >
                <Mic className="w-5 h-5" />
              </button>
              <button
                onClick={() => { /* toggle speaker */ }}
                className="w-12 h-12 rounded-full bg-[#1F2C34] text-[#8696A0] hover:bg-[#2A3942] hover:text-white flex items-center justify-center transition"
              >
                <SpeakerIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => { /* switch video */ }}
                className="w-12 h-12 rounded-full bg-[#1F2C34] text-[#8696A0] hover:bg-[#2A3942] hover:text-white flex items-center justify-center transition"
              >
                <Video className="w-5 h-5" />
              </button>
            </div>

            {/* End Call Button */}
            <button
              onClick={handleEndCall}
              className="w-full py-3 bg-red-500 hover:bg-[#ea0038] text-white font-bold rounded-xl text-lg transition shadow-lg"
            >
              End Call
            </button>
          </div>
        </div>
      )}

      {/* ===== INSTAGRAM DM SETTINGS MODAL (Three-Dot Dropdown) ===== */}
      {showChatSettings && (
        <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowChatSettings(false)}>
          <div className="bg-[#09090b] rounded-2xl p-6 w-full max-w-md text-white shadow-2xl border border-zinc-800 flex flex-col max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <MoreVertical className="w-4 h-4 text-zinc-400" />
                Chat Settings
              </h3>
              <button
                onClick={() => setShowChatSettings(false)}
                className="p-2 hover:bg-zinc-800/50 rounded-lg transition"
                title="Close"
              >
                <X className="w-5 h-5 text-zinc-400 hover:text-white" />
              </button>
            </div>

            <div className="space-y-3">
              {/* View Profile */}
              <button
                onClick={() => { setShowChatSettings(false); setShowContactSearch(true); }}
                className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 hover:bg-zinc-800 transition"
              >
                <User className="w-5 h-5 text-zinc-400" />
                <span className="text-sm text-white">View Profile</span>
              </button>

              {/* Mute Notifications */}
              <button
                onClick={() => { setMutedNotifications(!mutedNotifications); setShowChatSettings(false); }}
                className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 hover:bg-zinc-800 transition"
              >
                <span className="flex items-center gap-3">
                  <BellOff className="w-5 h-5 text-zinc-400" />
                  <span className="text-sm text-white">Mute Notifications</span>
                </span>
                <div className="relative w-10 h-5 bg-zinc-800 rounded-full p-0.5">
                  <span className={`block h-4 w-4 rounded-full bg-${mutedNotifications ? '#00a884' : '#zinc-600'} transition transform ${mutedNotifications ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </button>

              {/* Search in Conversation */}
              <button
                onClick={() => { setShowChatSettings(false); }}
                className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 hover:bg-zinc-800 transition"
              >
                <Search className="w-5 h-5 text-zinc-400" />
                <span className="text-sm text-white">Search in Conversation</span>
              </button>

              {/* Theme / Chat Wallpaper */}
              <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-white">Theme</span>
                  <Info className="w-4 h-4 text-zinc-500" />
                </div>
                <div className="flex gap-2">
                  {[['dark', 'OLED Dark'], ['ig-gradient', 'Classic IG Gradient'], ['cyberpunk', 'Cyberpunk']].map(([id, name]) => (
                    <button
                      key={id}
                      onClick={() => { setChatTheme(id); localStorage.setItem(`${SCOPE}chat_theme`, id); }}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition ${
                        chatTheme === id
                          ? 'bg-zinc-800 border border-emerald-500/50'
                          : 'bg-zinc-900/30 hover:bg-zinc-800 border-transparent'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full ${
                        id === 'dark' ? 'bg-[#09090b]' :
                        id === 'ig-gradient' ? 'bg-gradient-to-tr from-[#833AB4] via-[#FD1D1D] to-[#FCB045]' :
                        'bg-gradient-to-tr from-[#0f172a] via-[#3b0764] to-[#1e3a8a]'
                      } border border-zinc-700`} />
                      <span className="text-[10px] text-zinc-400">{name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear Chat History */}
              <button
                onClick={() => { setShowChatSettings(false); }}
                className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 hover:bg-zinc-800 transition text-zinc-400"
              >
                <Trash2 className="w-5 h-5" />
                <span className="text-sm">Clear Chat History</span>
              </button>

              {/* Block / Report Contact (red) */}
              <button
                onClick={() => { setShowChatSettings(false); }}
                className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 hover:bg-red-500/10 transition text-red-400 hover:text-red-300 border border-red-500/20"
              >
                <ShieldAlert className="w-5 h-5" />
                <span className="text-sm">Block / Report Contact</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </ErrorBoundary>
  );
}








