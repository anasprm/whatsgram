"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "../ui/Modal";

interface ContactAliasDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  currentNote?: string;
  onSave: (alias: string, note: string) => void;
}

export const ContactAliasDialog: React.FC<ContactAliasDialogProps> = ({
  isOpen,
  onClose,
  currentName,
  currentNote = "",
  onSave,
}) => {
  const [alias, setAlias] = useState(currentName);
  const [note, setNote] = useState(currentNote);

  useEffect(() => {
    setAlias(currentName);
    setNote(currentNote);
  }, [currentName, currentNote, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(alias, note);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Contact Details">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Display Alias
          </label>
          <input
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Custom nickname..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Private Notes
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Add notes visible only to you..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
          />
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
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
};
