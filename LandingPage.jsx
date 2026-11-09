import React, { useState } from 'react';
import {
  Sparkles,
  MessageSquare,
  Shield,
  Gamepad2,
  Zap,
  ArrowRight,
  CheckCircle2,
  Bot,
  Globe,
  Smartphone,
  Lock,
  Layers,
  Code2,
  Play,
  ChevronRight,
  Star,
  ShieldCheck,
} from 'lucide-react';

export default function LandingPage({ onGetStarted, onSignIn }) {
  const [activeTab, setActiveTab] = useState('messaging');

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      {/* Dynamic Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[650px] bg-gradient-to-b from-indigo-600/20 via-violet-600/10 to-transparent blur-[120px] pointer-events-none" />
      <div className="absolute top-96 left-10 w-96 h-96 bg-purple-600/10 blur-[150px] pointer-events-none" />
      <div className="absolute top-96 right-10 w-96 h-96 bg-blue-600/10 blur-[150px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 lg:px-20 py-5 border-b border-zinc-800/60 bg-[#09090b]/80 backdrop-blur-2xl">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={onGetStarted}>
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            WhatsGram
          </span>
        </div>

        <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-zinc-400">
          <a href="#features" className="hover:text-white transition">Features</a>
          <a href="#arcade" className="hover:text-white transition">50+ Arcade</a>
          <a href="#bots" className="hover:text-white transition">Telegram Bots</a>
          <a href="#security" className="hover:text-white transition">Security</a>
        </nav>

        <div className="flex items-center space-x-4">
          <button
            onClick={onSignIn}
            className="text-sm font-medium text-zinc-300 hover:text-white px-4 py-2 transition"
          >
            Sign In
          </button>
          <button
            onClick={onGetStarted}
            className="relative group overflow-hidden rounded-xl p-px font-semibold text-xs uppercase tracking-wider"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 group-hover:opacity-100 transition duration-300" />
            <span className="relative block px-5 py-2.5 rounded-[11px] bg-zinc-950 text-white transition group-hover:bg-opacity-0">
              Launch Workspace
            </span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-24 pb-20 px-6 lg:px-20 max-w-6xl mx-auto text-center">
        <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-pink-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full text-indigo-300 text-xs font-semibold mb-8 backdrop-blur-md">
          <Zap size={14} className="text-amber-400" />
          <span>WhatsApp Messaging + Instagram Feeds + 50 Arcade Games in One App</span>
        </div>

        <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight text-white leading-[1.05] mb-8">
          The Ultimate <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400 bg-clip-text text-transparent">
            Power-User Workspace
          </span>
        </h1>

        <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto mb-12 leading-relaxed">
          Lightning-fast communication, Telegram-style bot automation, offline PWA gaming, and
          zero-compromise security built into a single, gorgeous OLED interface.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onGetStarted}
            className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold px-8 py-4 rounded-2xl shadow-xl shadow-indigo-600/25 flex items-center justify-center space-x-3 text-sm tracking-wide active:scale-95 transition"
          >
            <span>Get Started Free</span>
            <ArrowRight size={18} />
          </button>

          <button
            onClick={onSignIn}
            className="w-full sm:w-auto bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 font-semibold px-8 py-4 rounded-2xl border border-zinc-800/80 backdrop-blur-xl flex items-center justify-center space-x-2 text-sm tracking-wide transition"
          >
            <span>Sign In to Account</span>
          </button>
        </div>

        {/* Interactive Feature Preview Container */}
        <div className="mt-16 relative rounded-3xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-3xl p-4 shadow-2xl max-w-5xl mx-auto">
          <div className="flex items-center justify-between pb-4 mb-3 border-b border-zinc-800/60 px-2">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
              <span className="ml-4 text-xs font-mono text-zinc-500">
                whatsgram-workspace.app — Live Dashboard
              </span>
            </div>

            <div className="hidden sm:flex items-center space-x-2">
              <button
                onClick={() => setActiveTab('messaging')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  activeTab === 'messaging' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Unified Inbox
              </button>
              <button
                onClick={() => setActiveTab('arcade')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  activeTab === 'arcade' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                50+ Arcade Vault
              </button>
              <button
                onClick={() => setActiveTab('bots')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  activeTab === 'bots' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                BotFather Engine
              </button>
            </div>
          </div>

          <div className="bg-[#0b0b0f] rounded-2xl border border-zinc-900 h-96 sm:h-[420px] flex items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.1)_0,transparent_70%)]" />

            {activeTab === 'messaging' && (
              <div className="relative z-10 flex flex-col items-center text-center p-6 animate-fadeIn">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 shadow-lg shadow-indigo-500/20">
                  <MessageSquare size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">WhatsApp &amp; Instagram Unified</h3>
                <p className="text-sm text-zinc-400 max-w-md mb-6">
                  Manage all direct messages, stories, and media feeds with split-screen multi-tasking
                  and instant keyboard shortcuts.
                </p>
                <button
                  onClick={onGetStarted}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition"
                >
                  Open Inbox Simulator
                </button>
              </div>
            )}

            {activeTab === 'arcade' && (
              <div className="relative z-10 flex flex-col items-center text-center p-6 animate-fadeIn">
                <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 mb-4 shadow-lg shadow-violet-500/20">
                  <Gamepad2 size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">50-Game Offline PWA Arcade Vault</h3>
                <p className="text-sm text-zinc-400 max-w-md mb-6">
                  Play Tic-Tac-Toe, Battleship, Snake, 2048, and classic puzzle games with local high
                  scores and offline mesh sync.
                </p>
                <button
                  onClick={onGetStarted}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-500 transition"
                >
                  Browse Arcade Library
                </button>
              </div>
            )}

            {activeTab === 'bots' && (
              <div className="relative z-10 flex flex-col items-center text-center p-6 animate-fadeIn">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-500/20">
                  <Bot size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Telegram-Style Bot Engine</h3>
                <p className="text-sm text-zinc-400 max-w-md mb-6">
                  Issue tokens via BotFather, configure webhook endpoints, and deploy custom inline
                  keyboards and AI triggers instantly.
                </p>
                <button
                  onClick={onGetStarted}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition"
                >
                  Launch BotFather
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Feature Bento Grid */}
      <section id="features" className="py-24 px-6 lg:px-20 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-4">
            Engineered for Power Users
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base max-w-lg mx-auto">
            Packed with next-gen features designed to give you complete control over your workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-3xl p-8 flex flex-col justify-between hover:border-indigo-500/50 transition group">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6 group-hover:scale-110 transition">
                <Bot size={22} />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">BotFather &amp; API Hub</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Build custom automated bots with token hashing, webhook routing, and interactive
                inline action buttons.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-zinc-900 text-xs text-indigo-400 font-semibold flex items-center space-x-1">
              <span>Full Telegram API parity</span>
            </div>
          </div>

          {/* Card 2 */}
          <div id="arcade" className="bg-zinc-950/60 border border-zinc-800/80 rounded-3xl p-8 flex flex-col justify-between hover:border-violet-500/50 transition group">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-6 group-hover:scale-110 transition">
                <Gamepad2 size={22} />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">50-Game Arcade Vault</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Enjoy 50+ standalone casual web games with local high-score tracking and pass-and-play
                split-screen modes.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-zinc-900 text-xs text-violet-400 font-semibold flex items-center space-x-1">
              <span>100% offline PWA support</span>
            </div>
          </div>

          {/* Card 3 */}
          <div id="security" className="bg-zinc-950/60 border border-zinc-800/80 rounded-3xl p-8 flex flex-col justify-between hover:border-emerald-500/50 transition group">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6 group-hover:scale-110 transition">
                <ShieldCheck size={22} />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Quantum-Ready Security</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                End-to-end cryptographic handshakes, hardware-bound TPM signatures, and local
                zero-knowledge media filters.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-zinc-900 text-xs text-emerald-400 font-semibold flex items-center space-x-1">
              <span>Absolute data sovereignty</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-12 px-6 lg:px-20 text-center text-xs text-zinc-500">
        <div className="flex items-center justify-center space-x-2 mb-4">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <span className="font-semibold text-zinc-300">WhatsGram Workspace</span>
        </div>
        <p>© 2026 WhatsGram Platform. All rights reserved. Built for power users and modern communities.</p>
      </footer>
    </div>
  );
}
