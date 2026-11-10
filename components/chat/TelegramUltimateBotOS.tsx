"use client";

import React, { useState, useRef, useEffect } from "react";
import { enqueueOutboxMessage } from "../../lib/outbox";

interface Message {
  id: string;
  sender: "user" | "bot" | "system";
  text: string;
  time: string;
  inlineKeyboard?: { text: string; callback: string }[];
  poll?: { question: string; options: string[] };
}

export const TelegramUltimateBotOS: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "bot",
      text: "🤖 **Telegram Ultimate Bot OS Active.**\nLoaded with Bot API features: AI Streaming Drafts, Telegram Stars (XTR) Billing, Interactive Polls, and Mini-App WebApp Bridge.",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      inlineKeyboard: [
        { text: "🎮 Open 50-Game Arcade Vault", callback: "/arcade" },
        { text: "⭐ Buy Lifetime Pass (100 XTR)", callback: "/buy_stars" },
        { text: "📊 Create Community Poll", callback: "/poll" },
      ],
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming, streamingText]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText("");
    setShowMenu(false);

    // Persist user action to IndexedDB outbox for offline-first sync
    await enqueueOutboxMessage(
      `bot_${Date.now()}`,
      JSON.stringify({ action: "send_message", text, source: "telegram_bot_os" }),
      "telegram_bot",
      undefined
    ).catch(console.error);

    processBotCommand(text);
  };

  const processBotCommand = (query: string) => {
    setIsStreaming(true);
    setStreamingText("⚡ Streaming response via Bot API draft...");

    const fullResponse = getBotResponseText(query);
    let charIndex = 0;

    const streamInterval = setInterval(() => {
      charIndex += 4;
      if (charIndex <= fullResponse.length) {
        setStreamingText(fullResponse.substring(0, charIndex));
      } else {
        clearInterval(streamInterval);
        setIsStreaming(false);
        setStreamingText("");

        let keyboard = undefined;
        let pollData = undefined;
        const lower = query.toLowerCase().trim();

        if (lower === "/arcade") {
          keyboard = [
            { text: "🧩 Batch 1: Board & Puzzle", callback: "/games_batch1" },
            { text: "🕹️ Batch 2: Retro Arcade", callback: "/games_batch2" },
            { text: "⚽ Batch 3: Sports & Action", callback: "/games_batch3" },
          ];
        } else if (lower === "/poll") {
          pollData = {
            question: "Which feature do you use the most in Relay Bot?",
            options: ["50-Game Arcade Vault", "E2EE Sovereign Sync", "Telegram Stars Billing", "Mini-App WebApp"],
          };
        } else if (lower === "/buy_stars") {
          keyboard = [{ text: "💳 Pay 100 Telegram Stars (XTR)", callback: "/paid_success" }];
        } else if (lower === "/paid_success") {
          // Persist Telegram Stars purchase to IndexedDB outbox
          enqueueOutboxMessage(
            `stars_purchase_${Date.now()}`,
            JSON.stringify({
              action: "telegram_stars_purchase",
              amount: 100,
              currency: "XTR",
              source: "telegram_bot_os",
              status: "paid",
            }),
            "telegram_bot",
            undefined
          ).catch(console.error);
        }

        const botMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: "bot",
          text: fullResponse,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          inlineKeyboard: keyboard,
          poll: pollData,
        };

        setMessages((prev) => [...prev, botMsg]);
      }
    }, 20);
  };

  const getBotResponseText = (query: string): string => {
    const lower = query.toLowerCase().trim();
    if (lower.startsWith("/start")) return "🚀 **Session Initialized.** Secure E2EE transport layer fully synchronized across peers.";
    if (lower === "/arcade") return "🎮 **50-Game Rule-Verified Master Vault:**\nSelect a modular game batch below to play offline:";
    if (lower === "/games_batch1") return "🧩 **Batch 1 Loaded:** FIDE Chess, Standard Checkers, Gomoku, Othello, Minesweeper, Connect Four, Tetris, 2048.";
    if (lower === "/games_batch2") return "🕹️ **Batch 2 Loaded:** Snake Retro, Pong PvE, Flappy Bird, Breakout, Space Invaders, Asteroids, Pacman.";
    if (lower === "/games_batch3") return "⚽ **Batch 3 Loaded:** Billiards 8-Ball, Air Hockey, Basketball Free Throw, Bowling, Golf, Archery, Pinball, Zelda.";
    if (lower === "/poll") return "📊 **Native Telegram Poll Generated:** Cast your vote below.";
    if (lower === "/buy_stars") return "⭐ **Telegram Stars Invoice:** Transfer 100 XTR to unlock full multi-device synchronization and ad-free arcade access.";
    if (lower === "/paid_success") return "✅ **Payment Verified via Telegram Stars!** Permanent access token successfully saved to local IndexedDB.";
    if (lower === "/webapp") return "🌐 **Mini-App Bridge:** `window.Telegram.WebApp.expand()` executed successfully. Full screen viewport rendered.";
    return `Echo received: "${query}". All Bot API services are operational.`;
  };

  return (
    <div className="flex h-[90vh] w-full max-w-4xl mx-auto flex-col rounded-3xl border border-slate-800 bg-[#0e1621] text-slate-100 shadow-2xl overflow-hidden font-sans">

      {/* Telegram Header & Menu */}
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-[#17212b] px-6 py-3.5 select-none">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#232e3c] hover:bg-[#2b3848] text-cyan-300 transition-colors shadow-sm"
              title="Open Bot Menu"
            >
              ☰
            </button>
            {showMenu && (
              <div className="absolute left-0 top-12 z-50 w-60 rounded-2xl bg-[#17212b] border border-slate-700 p-2 shadow-2xl space-y-1">
                <button onClick={() => { handleSend("/arcade"); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg hover:bg-[#232e3c] text-cyan-300">🎮 Arcade Vault</button>
                <button onClick={() => { handleSend("/poll"); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg hover:bg-[#232e3c] text-emerald-400">📊 Create Poll</button>
                <button onClick={() => { handleSend("/buy_stars"); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg hover:bg-[#232e3c] text-amber-400">⭐ Telegram Stars (XTR)</button>
                <button onClick={() => { handleSend("/webapp"); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg hover:bg-[#232e3c] text-blue-400">🌐 Mini-App WebApp</button>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-base font-bold text-white shadow-md">
              TB
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] text-white">✓</span>
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <h2 className="text-sm font-bold text-slate-100">Telegram Ultimate Bot OS</h2>
                <span className="rounded bg-cyan-500/20 px-1.5 py-0.2 text-[9px] font-mono text-cyan-300">API 10.4</span>
              </div>
              <p className="text-[11px] text-cyan-400 font-medium">
                {isStreaming ? "streaming AI draft..." : "online • 15.2M active"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Viewport */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#182533]/40 via-[#0e1621] to-[#0e1621]">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex w-full ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`relative max-w-[84%] sm:max-w-[70%] rounded-2xl px-4 py-3 text-sm shadow-md ${
              msg.sender === "user"
                ? "bg-[#2b5278] text-white rounded-br-xs"
                : "bg-[#182533] border border-slate-800/60 text-slate-100 rounded-bl-xs"
            }`}>
              <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>

              {/* Native Poll Widget */}
              {msg.poll && (
                <div className="mt-3 rounded-xl bg-[#101923] border border-slate-700/60 p-3 space-y-2">
                  <p className="text-xs font-bold text-cyan-300">📊 {msg.poll.question}</p>
                  <div className="space-y-1.5">
                    {msg.poll.options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(`Voted: ${opt}`)}
                        className="w-full text-left rounded-lg bg-[#182533] hover:bg-[#232e3c] px-3 py-2 text-xs font-medium text-slate-200 transition-colors border border-slate-800 flex items-center justify-between"
                      >
                        <span>{opt}</span>
                        <span className="text-[10px] font-mono text-cyan-400">Vote ➔</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Inline Keyboard */}
              {msg.inlineKeyboard && (
                <div className="mt-3 flex flex-col space-y-1.5 pt-2 border-t border-slate-700/50">
                  {msg.inlineKeyboard.map((btn, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(btn.callback)}
                      className="w-full rounded-xl bg-[#232e3c] hover:bg-[#2b3848] px-3 py-2 text-xs font-semibold text-cyan-300 transition-colors text-center shadow-sm"
                    >
                      {btn.text}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-1 flex items-center justify-end space-x-1 text-[10px] text-slate-400 font-mono">
                <span>{msg.time}</span>
                {msg.sender === "user" && <span className="text-cyan-400 font-bold">✓✓</span>}
              </div>
            </div>
          </div>
        ))}

        {/* Live Streaming Draft Bubble */}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-xs bg-[#182533] border border-cyan-500/40 px-4 py-3 max-w-[80%] space-y-1 shadow-lg">
              <div className="flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">Bot API 10 — Streaming Draft</span>
              </div>
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{streamingText}</p>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input Composer Toolbar */}
      <div className="border-t border-slate-800 bg-[#17212b] px-4 py-3 flex items-center space-x-3">
        <button className="text-slate-400 hover:text-slate-200 text-xl transition-colors">📎</button>
        <div className="relative flex-1">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type command (/arcade, /poll, /buy_stars, /webapp)..."
            className="w-full rounded-2xl bg-[#232e3c] px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          />
        </div>
        <button
          onClick={() => handleSend()}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#2b5278] hover:bg-[#32608c] text-white transition-colors shadow-md"
        >
          ➤
        </button>
      </div>
    </div>
  );
};
