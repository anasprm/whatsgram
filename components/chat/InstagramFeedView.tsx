"use client";

import React, { useState } from "react";
import { StoryViewer } from "./StoryViewer";

interface Post {
  id: string;
  username: string;
  userAvatar: string;
  mediaUrl: string;
  likes: number;
  caption: string;
  timeAgo: string;
  isLiked: boolean;
}

interface StoryUser {
  id: string;
  username: string;
  avatarUrl: string;
  hasUnread: boolean;
}

export const InstagramFeedView: React.FC = () => {
  const [isStoryOpen, setIsStoryOpen] = useState(false);
  const [activeStoryUser, setActiveStoryUser] = useState<string | null>(null);

  const [stories] = useState<StoryUser[]>([
    { id: "s0", username: "Your Story", avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop", hasUnread: false },
    { id: "s1", username: "alex.dev", avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop", hasUnread: true },
    { id: "s2", username: "sarah_ui", avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop", hasUnread: true },
    { id: "s3", username: "marcus_ux", avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop", hasUnread: true },
    { id: "s4", username: "design_hub", avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop", hasUnread: true },
  ]);

  const [posts, setPosts] = useState<Post[]>([
    {
      id: "p1",
      username: "alex.dev",
      userAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
      mediaUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&h=1000&fit=crop",
      likes: 1242,
      caption: "Building the next-gen web UI with Tailwind & React. Absolute buttery smooth performance 🚀",
      timeAgo: "2 hours ago",
      isLiked: false,
    },
    {
      id: "p2",
      username: "sarah_ui",
      userAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
      mediaUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&h=1000&fit=crop",
      likes: 856,
      caption: "Late night coding sessions are unmatched. Cyberpunk aesthetic in full effect ⚡",
      timeAgo: "5 hours ago",
      isLiked: true,
    },
  ]);

  const handleToggleLike = (postId: string) => {
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id === postId) {
          const isLiked = !post.isLiked;
          return {
            ...post,
            isLiked,
            likes: isLiked ? post.likes + 1 : post.likes - 1,
          };
        }
        return post;
      })
    );
  };

  const handleOpenStory = (username: string) => {
    setActiveStoryUser(username);
    setIsStoryOpen(true);
  };

  return (
    <div className="relative flex h-[90vh] w-full max-w-md mx-auto flex-col rounded-3xl border border-slate-800 bg-[#070b14] text-slate-100 shadow-2xl overflow-hidden font-sans">
      
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-[#0e1621] px-5 py-3.5 select-none">
        <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent">
          RelayGram
        </h1>
        <div className="flex items-center space-x-4 text-xl">
          <button onClick={() => alert("Create post modal opened")} className="hover:text-cyan-400 transition-colors">➕</button>
          <button onClick={() => alert("Direct messages opened")} className="hover:text-cyan-400 transition-colors">💬</button>
        </div>
      </div>

      {/* Main Feed Container */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-6 scrollbar-none">
        
        {/* Interactive Stories Tray */}
        <div className="flex space-x-3 overflow-x-auto px-4 py-3 bg-[#0e1621]/60 border-b border-slate-800/60 scrollbar-none">
          {stories.map((story) => (
            <div 
              key={story.id} 
              onClick={() => handleOpenStory(story.username)}
              className="flex flex-col items-center space-y-1 flex-shrink-0 cursor-pointer group"
            >
              <div className={`p-[2px] rounded-full transition-transform group-active:scale-95 ${story.hasUnread || story.username === "alex.dev" ? "bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600" : "bg-slate-700"}`}>
                <img 
                  src={story.avatarUrl} 
                  alt={story.username} 
                  className="h-14 w-14 rounded-full object-cover border-2 border-[#070b14]" 
                />
              </div>
              <span className="text-[10px] text-slate-300 font-medium truncate w-16 text-center">{story.username}</span>
            </div>
          ))}
        </div>

        {/* Post Feeds */}
        {posts.map((post) => (
          <div key={post.id} className="bg-[#0e1621] border-y border-slate-800/80">
            {/* Post Author Header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center space-x-2.5">
                <img src={post.userAvatar} alt={post.username} className="h-8 w-8 rounded-full object-cover border border-slate-700" />
                <span className="text-xs font-bold text-slate-100">{post.username}</span>
              </div>
              <button className="text-slate-400 hover:text-slate-200">•••</button>
            </div>

            {/* Post Media Viewport with Double-Tap Like */}
            <div 
              className="relative aspect-square w-full bg-slate-900 overflow-hidden cursor-pointer"
              onDoubleClick={() => handleToggleLike(post.id)}
            >
              <img src={post.mediaUrl} alt="Post content" className="h-full w-full object-cover" />
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center space-x-4 text-xl">
                <button 
                  onClick={() => handleToggleLike(post.id)} 
                  className="transition-transform active:scale-125 hover:opacity-80"
                >
                  {post.isLiked ? "❤️" : "🤍"}
                </button>
                <button onClick={() => alert(`Opening comments for ${post.id}`)} className="hover:text-cyan-400 transition-colors">💬</button>
                <button onClick={() => alert("Post shared!")} className="hover:text-cyan-400 transition-colors">✈️</button>
              </div>
              <button onClick={() => alert("Post bookmarked!")} className="hover:text-cyan-400 transition-colors">🔖</button>
            </div>

            {/* Likes & Caption */}
            <div className="px-4 pb-4 space-y-1.5">
              <p className="text-xs font-bold text-slate-100">{post.likes.toLocaleString()} likes</p>
              <p className="text-xs text-slate-200 leading-relaxed">
                <span className="font-bold mr-2 text-slate-100">{post.username}</span>
                {post.caption}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">{post.timeAgo}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Navigation Bar */}
      <div className="flex items-center justify-around border-t border-slate-800 bg-[#0e1621] py-3 px-4">
        <button className="text-xl text-cyan-400">🏠</button>
        <button onClick={() => alert("Explore search view")} className="text-xl text-slate-400 hover:text-slate-200">🔍</button>
        <button onClick={() => alert("Create reel/post")} className="text-xl text-slate-400 hover:text-slate-200">➕</button>
        <button onClick={() => alert("Reels view")} className="text-xl text-slate-400 hover:text-slate-200">🎬</button>
        <div className="h-6 w-6 rounded-full overflow-hidden border border-slate-700">
          <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=50&h=50&fit=crop" alt="Profile" className="h-full w-full object-cover" />
        </div>
      </div>

      {/* Immersive Story Modal */}
      {isStoryOpen && (
        <StoryViewer onClose={() => setIsStoryOpen(false)} />
      )}
    </div>
  );
};
