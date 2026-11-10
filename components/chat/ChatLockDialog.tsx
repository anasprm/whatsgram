"use client";

import React, { useState } from "react";
import { Modal } from "../ui/Modal";

interface ChatLockDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isLocked: boolean;
  onToggleLock: (pin: string) => void;
}

export const ChatLockDialog: React.FC<ChatLockDialogProps> = ({
  isOpen,
  onClose,
  isLocked,
  onToggleLock,
}) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) {
      setError("Passcode must be at least 4 digits.");
      return;
    }
    setError("");
    onToggleLock(pin);
    setPin("");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setPin("");
        setError("");
        onClose();
      }}
      title={isLocked ? "Unlock Chat" : "Lock Chat Thread"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {isLocked
            ? "Enter your 4-digit passcode to view this conversation."
            : "Locked chats are hidden from the main list and require a passcode to open."}
        </p>

        <div>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={6}
            placeholder="••••"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 text-center text-lg tracking-widest text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            required
          />
          {error && <p className="mt-1 text-[11px] text-rose-500 font-medium">{error}</p>}
        </div>

        <div className="flex items-center justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-900/20 transition-all"
          >
            {isLocked ? "Unlock" : "Lock Thread"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
