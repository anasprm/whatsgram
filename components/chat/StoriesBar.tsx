"use client";

import React from "react";

interface StoryUser {
  id: string;
  name: string;
  avatarUrl: string;
  hasUnseenStory: boolean;
}

interface StoriesBarProps {
  users?: StoryUser[];
  onSelectUser: (id: string) => void;
}

export const StoriesBar: React.FC<StoriesBarProps> = ({
  users = [
    {
      id: "1",
      name: "Anas",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
      hasUnseenStory: true,
    },
    {
      id: "2",
      name: "Sarah",
      avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop",
      hasUnseenStory: true,
    },
    {
      id: "3",
      name: "Dev Team",
      avatarUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&h=100&fit=crop",
      hasUnseenStory: false,
    },
  ],
  onSelectUser,
}) => {
  return (
    <div className="w-full overflow-x-auto py-3 px-4 flex items-center space-x-4 scrollbar-none border-b border-slate-800/60 bg-slate-950/40 backdrop-blur-md">
      {users.map((user) => (
        <div
          key={user.id}
          onClick={() => onSelectUser(user.id)}
          className="flex flex-col items-center space-y-1.5 cursor-pointer flex-shrink-0 group"
        >
          {/* Avatar Ring */}
          <div
            className={`p-0.5 rounded-full transition-transform group-hover:scale-105 ${
              user.hasUnseenStory
                ? "bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 shadow-lg shadow-pink-500/20"
                : "bg-slate-700"
            }`}
          >
            <div className="h-14 w-14 rounded-full bg-slate-900 p-0.5 overflow-hidden">
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-full w-full rounded-full object-cover"
              />
            </div>
          </div>
          <span className="text-[11px] text-slate-300 font-medium truncate max-w-[64px]">
            {user.name}
          </span>
        </div>
      ))}
    </div>
  );
};
