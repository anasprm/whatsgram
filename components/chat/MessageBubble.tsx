"use client";

import React, { useState } from "react";

interface MessageBubbleProps {
  message: {
    id: string;
    text: string;
    timestamp: string;
    isSender: boolean;
    reactions?: string[];
  };
  onReact?: (emoji: string) => void;
}

export const InstagramMessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onReact,
}) => {
  const [showHeart, setShowHeart] = useState(false);
  let lastClickTime = 0;

  const handleTouchOrClick = () => {
    const now = Date.now();
    if (now - lastClickTime < 300) {
      // Double tap detected
      setShowHeart(true);
      onReact?.("❤️");
      setTimeout(() => setShowHeart(false), 1000);
    }
    lastClickTime = now;
  };

  return (
    <div
      onClick={handleTouchOrClick}
      className={`relative flex w-full ${
        message.isSender ? "justify-end" : "justify-start"
      } mb-3 select-none`}
    >
      {/* Floating Double-Tap Heart Animation */}
      {showHeart && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none animate-in zoom-in-75 fade-in duration-200">
          <span className="text-4xl filter drop-shadow-lg">❤️</span>
        </div>
      )}

      {/* Bubble Container */}
      <div
        className={`relative max-w-[80%] sm:max-w-[65%] rounded-3xl px-4 py-3 text-sm transition-all shadow-md ${
          message.isSender
            ? "bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 text-white rounded-br-sm shadow-pink-900/20"
            : "bg-slate-900/90 border border-slate-800 text-slate-100 rounded-bl-sm backdrop-blur-md"
        }`}
      >
        <p className="leading-relaxed break-words">{message.text}</p>
        <div className="mt-1 flex items-center justify-end space-x-1 text-[10px] opacity-70">
          <span>{message.timestamp}</span>
          {message.isSender && <span>✓✓</span>}
        </div>

        {/* Reaction badges */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="absolute -bottom-2.5 right-3 flex items-center space-x-0.5 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] shadow-md">
            {message.reactions.map((r, i) => (
              <span key={i}>{r}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
