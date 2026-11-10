"use client";

import { useState, useEffect, useCallback } from "react";
import {
  saveRecord,
  getRecord,
  saveMessage,
  saveGameScore,
  saveSetting,
  getSetting,
  openRelayDB,
  closeRelayDB,
} from "@/utils/db";

/**
 * Unified React Hook for IndexedDB access.
 *
 * Provides a simple [data, updateData, loading] interface for reading and
 * writing chat histories, high scores, settings, and other client-side state
 * without boilerplate.
 *
 * @param storeName - IndexedDB object store name (e.g., "messages", "game_scores", "settings")
 * @param key - Record key within the store
 * @param initialValue - Fallback value when no record exists yet
 *
 * @returns [data, updateData, loading]
 *
 * @example
 * const [score, setScore, loading] = useRelayDB("game_scores", "snake_1", 0);
 * await setScore(42); // writes to IndexedDB and updates local state
 */
export function useRelayDB(
  storeName: string,
  key: string | number,
  initialValue: any
): [any, (newValue: any) => Promise<void>, boolean] {
  const [data, setData] = useState<any>(initialValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        await openRelayDB();
        const res = await getRecord(storeName, key);
        if (!cancelled) {
          setData(res !== undefined ? res : initialValue);
          setLoading(false);
        }
      } catch (err) {
        console.error(`useRelayDB load error (${storeName}/${key}):`, err);
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [storeName, key, initialValue]);

  const updateData = useCallback(
    async (newValue: any) => {
      setData(newValue);
      try {
        await openRelayDB();
        await saveRecord(storeName, { key, ...newValue, updatedAt: Date.now() });
      } catch (err) {
        console.error(`useRelayDB save error (${storeName}/${key}):`, err);
        throw err;
      }
    },
    [storeName, key]
  );

  return [data, updateData, loading] as const;
}

/**
 * Convenience hook specifically for game high scores.
 * @param gameId - The arcade game ID
 * @param userId - The user ID
 */
export function useGameScore(gameId: number, userId: string) {
  return useRelayDB("game_scores", `${userId}:${gameId}`, 0);
}

/**
 * Convenience hook for application settings.
 * @param key - Setting key
 * @param initialValue - Default value
 */
export function useAppSetting(key: string, initialValue: any) {
  return useRelayDB("settings", key, initialValue);
}

/**
 * Convenience hook for persisting a chat message.
 * @param chatId - The conversation ID
 * @param messageId - The message ID
 */
export function useChatMessage(chatId: string, messageId: string) {
  return useRelayDB("messages", `${chatId}:${messageId}`, null);
}

/**
 * Expose low-level DB functions for direct use.
 */
export const relayDB = {
  saveRecord,
  getRecord,
  saveMessage,
  saveGameScore,
  saveSetting,
  getSetting,
  openRelayDB,
  closeRelayDB,
};
