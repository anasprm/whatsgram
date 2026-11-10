"use client";

import { useEffect, useCallback } from "react";

interface ShortcutMap {
  [key: string]: () => void;
}

interface UseHotkeysOptions {
  enabled?: boolean;
}

/**
 * Global keyboard shortcut / command hotkey listener.
 *
 * Normalizes key combinations (Ctrl/Cmd + Shift + Alt + Key) and fires the
 * matching callback. Automatically prevents default browser behavior for
 * registered shortcuts.
 *
 * @param shortcuts - Map of "CTRL+K" style key combos to callbacks
 * @param options - { enabled } to toggle the listener
 *
 * @example
 * useHotkeys({
 *   "Ctrl+K": () => setShowPalette(true),
 *   "Escape": () => setShowModal(false),
 *   "Ctrl+Shift+A": () => setShowArcade(true),
 * });
 */
export function useHotkeys(
  shortcuts: ShortcutMap,
  options: UseHotkeysOptions = {}
) {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const parts: string[] = [];

      // Use Meta for Mac command key, Ctrl for others
      if (e.metaKey || e.ctrlKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");

      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      // Skip modifier-only keys
      if (["Control", "Shift", "Alt", "Meta", "CapsLock"].includes(key)) return;

      parts.push(key);

      const keyCombo = parts.join("+");

      if (shortcuts[keyCombo]) {
        e.preventDefault();
        e.stopPropagation();
        shortcuts[keyCombo]();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts, enabled]);
}
