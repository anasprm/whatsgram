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
  Send,
  User,
  Clock,
} from 'lucide-react';

const gradientText = 'bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent';

export default function LandingPage({ onGetStarted, onSignIn }) {
  const [activeTab, setActiveTab] = useState('messaging');
  const [isScrolled, setIsScrolled] = useState(false);

  const handleScroll = () => {
    setIsScrolled(window.scrollY > 20);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      {/* Dynamic Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[700px] bg-gradient-to-b from-indigo-600/15 via-violet-600/8 to-transparent blur-[140px] pointer-events-none" />
      <div className="absolute top-[20%] left-5 w-[400px] h-[400px] bg-purple-600/8 blur-[180px] rounded-full pointer-events-none" />
      <div className="absolute top-[60%] right-5 w-[400px] h-[400px] bg-blue-600/8 blur-[180px] rounded-full pointer-events-none" />
      <div className="absolute bottom-20 left-1/3 w-[500px] h-[500px] bg-indigo-600/6 blur-[160px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30 pointer-events-none" />

      {/* Navigation Header */}
      <header className={`sticky top-0 z-50 flex items-center justify-between px-6 lg:px-24 py-5 border-b border-zinc-800/40 bg-[#09090b]/60 backdrop-blur-md transition-colors duration-300 ${isScrolled ? 'bg-[#09090b]/95 shadow-sm' : ''}`}>
        <div className="flex items-center space-x-3 cursor-pointer group" onClick={onGetStarted}>
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 transition-all duration-300 group-hover:scale-105">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <span className="text-xl font-black tracking-tight {gradientText}">
            WhatsGram
          </span>
        </div>

        <nav className="hidden md:flex items-center space-x-7 text-sm font-medium text-zinc-400">
          <a href="#features" className="hover:text-white transition-colors duration-200">
            Features
          </a>
          <a href="#arcade" className="hover:text-white transition-colors duration-200">
            50+ Arcade
          </a>
          <a href="#bots" className="hover:text-white transition-colors duration-200">
            Telegram Bots
          </a>
          <a href="#security" className="hover:text-white transition-colors duration-200">
            Security
          </a>
        </nav>

        <div className="flex items-center space-x-4">
          <button
            onClick={onSignIn}
            className="text-sm font-medium text-zinc-300 hover:text-white px-4 py-2 transition-colors duration-200"
          >
            Sign In
          </button>
          <button
            onClick={onGetStarted}
            className="relative group overflow-hidden rounded-xl p-px font-semibold text-xs uppercase tracking-wider"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 group-hover:opacity-100 transition duration-300" />
            <span className="relative block px-5 py-2.5 rounded-[11px] bg-[#09090b] text-white transition group-hover:bg-opacity-0">
              Launch Workspace
            </span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-32 pb-32 px-6 lg:px-24 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-pink-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full text-indigo-300 text-xs font-semibold mb-10 backdrop-blur-md animate-fadeInUp">
          <Zap size={14} className="text-amber-400 animate-pulse" />
          <span>WhatsApp Messaging + Instagram Feeds + 50 Arcade Games in One App</span>
        </div>

        <h1 className="text-6xl sm:text-8xl lg:text-9xl font-black tracking-tight text-white leading-[1.05] mb-8 animate-fadeInUp delay-100">
          The Ultimate
          <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400 bg-clip-text text-transparent">
            Power-User Workspace
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-zinc-400 max-w-3xl mx-auto mb-10 leading-relaxed animate-fadeInUp delay-200">
          Lightning-fast communication, Telegram-style bot automation, offline PWA gaming, and
          zero-compromise security built into a single, gorgeous OLED interface.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fadeInUp delay-300">
          <button
            onClick={onGetStarted}
            className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold px-8 py-4 rounded-2xl shadow-xl shadow-indigo-600/25 flex items-center justify-center space-x-3 text-sm tracking-wide active:scale-95 transition-all duration-200"
          >
            <span>Get Started Free</span>
            <ArrowRight size={18} />
          </button>

          <button
            onClick={onSignIn}
            className="w-full sm:w-auto bg-[#09090b]/80 hover:bg-zinc-800 text-zinc-200 font-bold px-8 py-4 rounded-2xl border border-zinc-800/80 backdrop-blur-xl flex items-center justify-center space-x-2 text-sm tracking-wide transition-all duration-200"
          >
            <span>Sign In to Account</span>
            <User size={18} />
          </button>
        </div>

        {/* Trust indicators */}
        <div className="mt-16 flex items-center justify-center gap-8 text-zinc-600 text-xs animate-fadeInUp delay-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>End-to-end encrypted</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>Offline PWA support</span>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            <span>Multi-platform sync</span>
          </div>
        </div>
      </section>

      {/* Interactive Feature Preview Container */}
      <section className="mt-24 relative px-6 lg:px-24 max-w-7xl mx-auto">
        <div className="flex items-center justify-between pb-8 mb-8 border-b border-zinc-800/60 px-4">
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
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${activeTab === 'messaging' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
            >
              Unified Inbox
            </button>
            <button
              onClick={() => setActiveTab('arcade')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${activeTab === 'arcade' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
            >
              50+ Arcade Vault
            </button>
            <button
              onClick={() => setActiveTab('bots')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${activeTab === 'bots' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
            >
              BotFather Engine
            </button>
          </div>
        </div>

        <div className="bg-[#0b0b0f] rounded-2xl border border-zinc-900 h-[500px] sm:h-[600px] flex items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.08)_0,transparent_70%)]" />
          <div className="absolute top-10 left-10 w-20 h-20 bg-indigo-500/20 rounded-full blur-[60px] animate-blob" />
          <div className="absolute bottom-10 right-10 w-20 h-20 bg-pink-500/20 rounded-full blur-[60px] animate-blob animation-delay-2000" />

          {activeTab === 'messaging' && (
            <div className="relative z-10 flex flex-col items-center text-center p-6 animate-fadeInUp animate-delay-100">
              <div className="w-20 h-20 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-6 shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform duration-300">
                <MessageSquare size={36} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">WhatsApp &amp; Instagram Unified</h3>
              <p className="text-sm text-zinc-400 max-w-md mb-6">
                Manage all direct messages, stories, and media feeds with split-screen multi-tasking
                and instant keyboard shortcuts.
              </p>
              <button
                onClick={onGetStarted}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition-all duration-200"
              >
                Open Inbox Simulator
              </button>
            </div>
          )}

          {activeTab === 'arcade' && (
            <div className="relative z-10 flex flex-col items-center text-center p-6 animate-fadeInUp animate-delay-100">
              <div className="w-20 h-20 rounded-2xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 mb-6 shadow-lg shadow-violet-500/20 group-hover:scale-110 transition-transform duration-300">
                <Gamepad2 size={36} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">50-Game Offline PWA Arcade Vault</h3>
              <p className="text-sm text-zinc-400 max-w-md mb-6">
                Play Tic-Tac-Toe, Battleship, Snake, 2048, and classic puzzle games with local high
                scores and offline mesh sync.
              </p>
              <button
                onClick={onGetStarted}
                className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 transition-all duration-200"
              >
                Browse Arcade Library
              </button>
            </div>
          )}

          {activeTab === 'bots' && (
            <div className="relative z-10 flex flex-col items-center text-center p-6 animate-fadeInUp animate-delay-100">
              <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-6 shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform duration-300">
                <Bot size={36} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Telegram-Style Bot Engine</h3>
              <p className="text-sm text-zinc-400 max-w-md mb-6">
                Issue tokens via BotFather, configure webhook endpoints, and deploy custom inline
                keyboards and AI triggers instantly.
              </p>
              <button
                onClick={onGetStarted}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-all duration-200"
              >
                Launch BotFather
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Feature Bento Grid */}
      <section id="features" className="py-32 px-6 lg:px-24 max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-4 animate-fadeInUp">
            Engineered for Power Users
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base max-w-lg mx-auto animate-fadeInUp delay-100">
            Packed with next-gen features designed to give you complete control over your workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeInUp delay-200">
          {/* Card 1 */}
          <div className="group relative bg-zinc-950/60 border border-zinc-800/80 rounded-3xl p-8 flex flex-col justify-between hover:border-indigo-500/50 hover:bg-zinc-950/80 transition-all duration-300">
            <div className="overflow-hidden">
              <div className="w-14 h-14 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6 group-hover:scale-110 transition-all duration-300">
                <Bot size={24} />
              </div>
              <h3 className="text-lg font-bold text-white mb-3">BotFather &amp; API Hub</h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                Build custom automated bots with token hashing, webhook routing, and interactive
                inline action buttons.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-zinc-900">
              <div className="flex items-center gap-1">
                <span className="text-xs text-indigo-400 font-bold">Full Telegram API parity</span>
                <Send className="w-3 h-3 text-indigo-400" />
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div id="arcade" className="group relative bg-zinc-950/60 border border-zinc-800/80 rounded-3xl p-8 flex flex-col justify-between hover:border-violet-500/50 hover:bg-zinc-950/80 transition-all duration-300">
            <div className="overflow-hidden">
              <div className="w-14 h-14 rounded-3xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-6 group-hover:scale-110 transition-all duration-300">
                <Gamepad2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-white mb-3">50-Game Arcade Vault</h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                Enjoy 50+ standalone casual web games with local high-score tracking and pass-and-play
                split-screen modes.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-zinc-900">
              <div className="flex items-center gap-1">
                <span className="text-xs text-violet-400 font-bold">100% offline PWA support</span>
                <Send className="w-3 h-3 text-violet-400" />
              </div>
            </div>
          </div>

          {/* Card 3 */}
          <div id="security" className="group relative bg-zinc-950/60 border border-zinc-800/80 rounded-3xl p-8 flex flex-col justify-between hover:border-emerald-500/50 hover:bg-zinc-950/80 transition-all duration-300">
            <div className="overflow-hidden">
              <div className="w-14 h-14 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6 group-hover:scale-110 transition-all duration-300">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-lg font-bold text-white mb-3">Quantum-Ready Security</h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                End-to-end cryptographic handshakes, hardware-bound TPM signatures, and local
                zero-knowledge media filters.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-zinc-900">
              <div className="flex items-center gap-1">
                <span className="text-xs text-emerald-400 font-bold">Absolute data sovereignty</span>
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-16 px-6 lg:px-24 text-center text-xs text-zinc-500 animate-fadeInUp">
        <div className="flex items-center justify-center space-x-2 mb-6">
          <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
          <span className="font-bold text-zinc-300">WhatsGram Workspace</span>
        </div>
        <p>© 2026 WhatsGram Platform. All rights reserved. Built for power users and modern communities.</p>
      </footer>
    </div>
  );
}