"use client";

import React, { useState } from "react";

interface SharedItem {
  id: string;
  type: "image" | "video" | "doc" | "link";
  url: string;
  name: string;
  date: string;
}

interface MediaVaultDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  chatName: string;
  items?: SharedItem[];
}

export const MediaVaultDrawer: React.FC<MediaVaultDrawerProps> = ({
  isOpen,
  onClose,
  chatName,
  items = [],
}) => {
  const [activeTab, setActiveTab] = useState<"media" | "docs" | "links">("media");

  if (!isOpen) return null;

  const filteredItems = items.filter((item) => {
    if (activeTab === "media") return item.type === "image" || item.type === "video";
    if (activeTab === "docs") return item.type === "doc";
    return item.type === "link";
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white/95 dark:bg-slate-900/95 border-l border-slate-200/60 dark:border-slate-800 shadow-2xl backdrop-blur-xl flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Media & Vault
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{chatName}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="flex border-b border-slate-100 dark:border-slate-800 px-4 pt-2">
            {(["media", "docs", "links"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-xs font-semibold capitalize border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {filteredItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-6 text-slate-400">
                <span className="text-3xl mb-2">📁</span>
                <p className="text-xs">No {activeTab} shared in this chat yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {filteredItems.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50 flex items-center justify-center p-2 text-center hover:opacity-90 transition-opacity"
                  >
                    {item.type === "image" ? (
                      <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs truncate font-medium text-slate-700 dark:text-slate-200">
                        {item.name}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
