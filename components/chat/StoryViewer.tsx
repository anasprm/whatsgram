"use client";

import React, { useState, useEffect } from "react";

interface StoryItem {
  id: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  duration: number; // in seconds
  caption?: string;
  songName?: string;
}

interface StoryUser {
  username: string;
  avatarUrl: string;
  timeAgo: string;
  verified: boolean;
  stories: StoryItem[];
}

interface StoryViewerProps {
  onClose?: () => void;
}

/**
 * Instagram-style Story Viewer
 *
 * Features:
 * - Segmented progress ticker (auto-advances per story)
 * - Hold-to-pause / tap interaction (mousedown/touchstart pauses, mouseup/touchend resumes)
 * - Tap left third → previous story, tap right third → next story
 * - Reply input (pauses player on focus)
 * - Like heart toggle with active feedback
 * - Mobile-framed dark modal (bg-black/95 backdrop, max-w-md container)
 */
export const StoryViewer: React.FC<StoryViewerProps> = ({ onClose }) => {
  const [currentUserIndex, setCurrentUserIndex] = useState(0);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0); // 0 to 100%
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [liked, setLiked] = useState(false);

  // Sample active stories dataset
  const users: StoryUser[] = [
    {
      username: "alex.dev",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
      timeAgo: "2h",
      verified: true,
      stories: [
        {
          id: "s1",
          mediaUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&h=1200&fit=crop",
          mediaType: "image",
          duration: 5,
          caption: "Building the next-gen web UI 🚀",
          songName: "Synthwave Boy - Lofi Beats",
        },
        {
          id: "s2",
          mediaUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&h=1200&fit=crop",
          mediaType: "image",
          duration: 5,
          caption: "Deploying Edge nodes on Vercel ⚡",
          songName: "Cyberpunk 2077 - OST",
        },
      ],
    },
    {
      username: "sarah_ui",
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
      timeAgo: "4h",
      verified: false,
      stories: [
        {
          id: "s3",
          mediaUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=1200&fit=crop",
          mediaType: "image",
          duration: 5,
          caption: "Weekend getaway vibes 🌴",
          songName: "Summer Breeze - Tropical Edit",
        },
        {
          id: "s4",
          mediaUrl: "https://images.unsplash.com/photo-1469313637793-05989c480963?w=800&h=1200&fit=crop",
          mediaType: "image",
          duration: 5,
          caption: "Sunset vibes ✨",
          songName: "Summer Breeze - Tropical Edit",
        },
      ],
    },
    {
      username: "whatsgram",
      avatarUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop",
      timeAgo: "6h",
      verified: true,
      stories: [
        {
          id: "s5",
          mediaUrl: "https://images.unsplash.com/photo-1531297526732-2c0e1a6d241a?w=800&h=1200&fit=crop",
          mediaType: "image",
          duration: 5,
          caption: "New feature drop: Stories! 📱",
          songName: "Neon Dreams",
        },
      ],
    },
  ];

  const activeUser = users[currentUserIndex];
  const activeStory = activeUser.stories[currentStoryIndex];

  // Progress bar ticker loop
  useEffect(() => {
    if (isPaused) return;

    const intervalTime = 50; // update every 50ms
    const increment = (intervalTime / (activeStory.duration * 1000)) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNextStory();
          return 0;
        }
        return prev + increment;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [currentStoryIndex, currentUserIndex, isPaused, activeStory]);

  const handleNextStory = () => {
    setLiked(false);
    if (currentStoryIndex < activeUser.stories.length - 1) {
      setCurrentStoryIndex((prev) => prev + 1);
      setProgress(0);
    } else if (currentUserIndex < users.length - 1) {
      setCurrentUserIndex((prev) => prev + 1);
      setCurrentStoryIndex(0);
      setProgress(0);
    } else {
      if (onClose) onClose();
    }
  };

  const handlePrevStory = () => {
    setLiked(false);
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((prev) => prev - 1);
      setProgress(0);
    } else {
      setProgress(0); // restart current
    }
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    // In production, this would send via your messaging API
    setReplyText("");
    setIsPaused(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 font-sans select-none">
      {/* Mobile-Framed Story Viewport */}
      <div
        className="relative h-full w-full max-w-md sm:h-[90vh] sm:max-h-[850px] sm:rounded-3xl overflow-hidden bg-slate-950 flex flex-col justify-between shadow-2xl border border-slate-800"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* Background Media Viewport */}
        <div className="absolute inset-0 z-0">
          <img
            src={activeStory.mediaUrl}
            alt="Story media"
            className="h-full w-full object-cover filter brightness-90"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
        </div>

        {/* Top Segmented Progress Bars & Header */}
        <div className="relative z-10 flex flex-col p-4 space-y-3">
          {/* Progress Bars */}
          <div className="flex space-x-1.5 w-full">
            {activeUser.stories.map((story, idx) => (
              <div key={story.id} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-75 ease-linear"
                  style={{
                    width:
                      idx < currentStoryIndex
                        ? "100%"
                        : idx === currentStoryIndex
                          ? `${progress}%`
                          : "0%",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Author Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img
                src={activeUser.avatarUrl}
                alt={activeUser.username}
                className="h-9 w-9 rounded-full object-cover border border-white/20 shadow-md"
              />
              <div className="flex items-center space-x-1.5">
                <span className="text-sm font-bold text-white tracking-wide">
                  {activeUser.username}
                </span>
                {activeUser.verified && (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[9px] text-white font-bold">
                    ✓
                  </span>
                )}
                <span className="text-xs text-white/60">• {activeUser.timeAgo}</span>
              </div>
            </div>

            <div className="flex items-center space-x-4 text-white/80">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="hover:text-white transition-colors"
              >
                {isPaused ? "▶️" : "⏸️"}
              </button>
              <button onClick={onClose} className="text-xl font-bold hover:text-white transition-colors">
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Center Content: Music Sticker & Caption */}
        <div className="relative z-10 px-6 my-auto space-y-4 pointer-events-none">
          {activeStory.songName && (
            <div className="inline-flex items-center space-x-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-white text-xs shadow-lg">
              <span className="animate-spin">🎵</span>
              <span className="font-medium">{activeStory.songName}</span>
            </div>
          )}
          {activeStory.caption && (
            <div className="bg-black/50 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 text-white text-sm font-medium shadow-xl inline-block max-w-full">
              {activeStory.caption}
            </div>
          )}
        </div>

        {/* Navigation Hitboxes (Left/Right Tap Zones) */}
        <div className="absolute inset-y-0 left-0 w-1/3 z-20 cursor-pointer" onClick={handlePrevStory} />
        <div className="absolute inset-y-0 right-0 w-1/3 z-20 cursor-pointer" onClick={handleNextStory} />

        {/* Bottom Reply & Reaction Toolbar */}
        <div className="relative z-30 p-4 bg-gradient-to-t from-black/90 to-transparent flex items-center space-x-3">
          <form onSubmit={handleSendReply} className="flex-1 flex items-center bg-black/40 backdrop-blur-md border border-white/20 rounded-full px-4 py-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => {
                setReplyText(e.target.value);
                setIsPaused(true);
              }}
              onBlur={() => setIsPaused(false)}
              placeholder={`Reply to ${activeUser.username}...`}
              className="w-full bg-transparent text-xs text-white placeholder-white/60 focus:outline-none"
            />
          </form>

          <button
            onClick={() => setLiked(!liked)}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-125 ${
              liked
                ? "bg-rose-500 text-white shadow-lg"
                : "bg-black/40 backdrop-blur-md border border-white/20 text-white hover:bg-black/60"
            }`}
          >
            {liked ? "❤️" : "🤍"}
          </button>
        </div>
      </div>
    </div>
  );
};
