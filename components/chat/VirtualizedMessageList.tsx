"use client";

import React, { useRef, useState, useEffect, useMemo } from "react";

export interface LocalMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  status?: "sent" | "delivered" | "read";
  createdAt: string;
}

interface VirtualizedMessageListProps {
  messages: LocalMessage[];
  itemHeight?: number; // Estimated average message height in pixels
  onReactMessage?: (id: string, emoji: string) => void;
  onReplyMessage?: (msg: LocalMessage) => void;
}

export const VirtualizedMessageList: React.FC<VirtualizedMessageListProps> = ({
  messages,
  itemHeight = 72,
  onReactMessage,
  onReplyMessage,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setContainerHeight(containerRef.current.clientHeight);
    }
  }, [messages.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const totalCount = messages.length;
  const totalHeight = totalCount * itemHeight;

  // Calculate visible element slice window
  const { startIndex, endIndex, offsetY } = useMemo(() => {
    const buffer = 5; // Overscan buffer elements above and below
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
    const visibleCount = Math.ceil(containerHeight / itemHeight) + 2 * buffer;
    const end = Math.min(totalCount, start + visibleCount);
    const topOffset = start * itemHeight;

    return { startIndex: start, endIndex: end, offsetY: topOffset };
  }, [scrollTop, containerHeight, totalCount, itemHeight]);

  const visibleMessages = useMemo(
    () => messages.slice(startIndex, endIndex),
    [messages, startIndex, endIndex]
  );

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="relative flex-1 w-full overflow-y-auto px-4 py-2 scrollbar-thin scrollbar-thumb-slate-800"
    >
      {/* Container matching full scroll height */}
      <div style={{ height: `${totalHeight}px`, position: "relative" }}>
        {/* Absolute window translation for visible elements */}
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleMessages.map((msg) => (
            <div key={msg.id} style={{ minHeight: `${itemHeight}px` }}>
              {/* Render inline message bubble to avoid external dependency */}
              <div
                className={`flex ${msg.senderId === "me" ? "justify-end" : "justify-start"} mb-2`}
              >
                <div
                  className={`max-w-[75%] p-3 rounded-2xl shadow-sm ${
                    msg.senderId === "me"
                      ? "rounded-tl-xl rounded-tr-xl rounded-bl-xl bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#E1306C] text-white"
                      : "rounded-tr-xl rounded-tl-xl rounded-br-xl bg-[#16232b] text-zinc-100 border border-[#2A3942]"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                  <div className="flex justify-end items-center gap-1 text-[10px]">
                    <span className={msg.senderId === "me" ? "text-zinc-400" : "text-zinc-500"}>
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {msg.senderId === "me" && (
                      <span className="text-zinc-400">{msg.status || "sent"}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
