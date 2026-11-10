"use client";

import React, { useState } from "react";
import { BulletproofDropdown } from "./BulletproofDropdown";
import { MediaVaultDrawer } from "./MediaVaultDrawer";
import { ContactAliasDialog } from "./ContactAliasDialog";
import { ChatLockDialog } from "./ChatLockDialog";

interface ChatHeaderProps {
  activeChatId: string;
  onBack: () => void;
  chatName?: string;
  isGroup?: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  activeChatId,
  onBack,
  chatName = "Chat Conversation",
  isGroup = false,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMediaVaultOpen, setIsMediaVaultOpen] = useState(false);
  const [isAliasOpen, setIsAliasOpen] = useState(false);
  const [isGroupRenameOpen, setIsGroupRenameOpen] = useState(false);
  const [isChatLockOpen, setIsChatLockOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const menuItems = [
    {
      label: "Media, Links & Docs",
      icon: "📁",
      onClick: () => setIsMediaVaultOpen(true),
    },
    ...(isGroup
      ? [
          {
            label: "Edit Group Info",
            icon: "✏️",
            onClick: () => setIsGroupRenameOpen(true),
          },
        ]
      : [
          {
            label: "Edit Contact Alias",
            icon: "✏️",
            onClick: () => setIsAliasOpen(true),
          },
        ]),
    {
      label: isLocked ? "Unlock Chat" : "Lock Chat Thread",
      icon: isLocked ? "🔓" : "🔒",
      onClick: () => setIsChatLockOpen(true),
    },
    {
      label: "Clear Messages",
      icon: "🧹",
      onClick: () => alert("Clear messages triggered for " + activeChatId),
    },
    {
      label: "Block Contact",
      icon: "🚫",
      danger: true,
      onClick: () => alert("Block action triggered"),
    },
  ];

  return (
    <>
      <header className="glass-header relative flex h-16 w-full items-center justify-between px-4 z-30">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="flex md:hidden items-center justify-center h-9 w-9 rounded-full bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-300/60 dark:hover:bg-slate-700"
            aria-label="Back to chats"
          >
            ←
          </button>

          <div className="flex items-center space-x-3 cursor-pointer">
            <div className="relative h-10 w-10 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center font-semibold text-emerald-600 dark:text-emerald-400">
              {chatName.charAt(0).toUpperCase()}
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                {chatName}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isLocked ? "🔒 Locked thread" : "Online"}
              </p>
            </div>
          </div>
        </div>

        <div className="relative flex items-center space-x-1">
          <button
            onClick={() => setIsMediaVaultOpen(true)}
            className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/60 transition-colors"
            title="Open Media Vault"
          >
            📎
          </button>

          <div className="relative">
            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/60 transition-colors"
              aria-label="More options"
            >
              ⋮
            </button>

            <BulletproofDropdown
              isOpen={isMenuOpen}
              onClose={() => setIsMenuOpen(false)}
              items={menuItems}
              align="right"
            />
          </div>
        </div>
      </header>

      <MediaVaultDrawer
        isOpen={isMediaVaultOpen}
        onClose={() => setIsMediaVaultOpen(false)}
        chatName={chatName}
        items={[]}
      />

      <ContactAliasDialog
        isOpen={isAliasOpen}
        onClose={() => setIsAliasOpen(false)}
        currentName={chatName}
        onSave={(alias, note) => {
          console.log("Saved alias:", alias, "Note:", note);
        }}
      />

      <ChatLockDialog
        isOpen={isChatLockOpen}
        onClose={() => setIsChatLockOpen(false)}
        isLocked={isLocked}
        onToggleLock={(pin) => {
          setIsLocked((prev) => !prev);
          console.log("Lock status toggled with PIN:", pin);
        }}
      />
    </>
  );
};
