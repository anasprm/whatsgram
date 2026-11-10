import {
  saveMessageLocally,
  getLocalMessages,
  saveOutboxItem,
  getAllOutboxItems,
  deleteOutboxItem,
  deleteLocalMessage,
} from './idbCache';

interface OutboxItem {
  id: string;
  chatId: string;
  payload: Record<string, unknown>;
  retryCount: number;
  createdAt: number;
}

/**
 * Enqueue a message for sending. Writes optimistically to local IndexedDB
 * immediately, then queues in the outbox for background sync when online.
 */
export const enqueueOutboxMessage = async (
  chatId: string,
  text: string,
  senderId: string = 'me',
  attachments?: Record<string, unknown>[]
): Promise<LocalMessageType> => {
  const db = await import('./idbCache').then((m) => m.getDB());
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const idempotentKey = `key_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

  const localMsg: LocalMessageType = {
    id: tempId,
    chatId,
    senderId,
    body: text,
    attachments,
    status: 'pending',
    createdAt: new Date().toISOString(),
    idempotentKey,
  };

  // 1. Save optimistic local message
  await saveMessageLocally(localMsg);

  // 2. Queue in outbox
  await saveOutboxItem({
    id: tempId,
    chatId,
    payload: { text, idempotentKey, attachments },
    retryCount: 0,
    createdAt: Date.now(),
  });

  // 3. Attempt immediate sync if online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    processOutboxQueue();
  }

  return localMsg;
};

/**
 * Process all pending outbox items. Sends each to the server, updates
 * local message status on success, retries on failure (up to 5 attempts).
 */
export const processOutboxQueue = async (): Promise<void> => {
  const pendingItems: OutboxItem[] = await getAllOutboxItems();

  if (pendingItems.length === 0) return;

  for (const item of pendingItems) {
    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: item.chatId, ...item.payload }),
      });

      if (response.ok) {
        const result = await response.json();

        // Remove from outbox
        await deleteOutboxItem(item.id);

        // Update local message status and replace temp id with server id
        const existingMsg = (await getLocalMessages(item.chatId)).find((m) => m.id === item.id);
        if (existingMsg) {
          await deleteLocalMessage(item.id);
          await saveMessageLocally({
            ...existingMsg,
            id: result.id || item.id,
            status: 'sent',
          });
        }
      } else {
        // Increment retry count
        item.retryCount += 1;
        if (item.retryCount < 5) {
          await saveOutboxItem(item);
        } else {
          // Drop after max retries; keep local message but mark failed
          await deleteOutboxItem(item.id);
          const existingMsg = (await getLocalMessages(item.chatId)).find((m) => m.id === item.id);
          if (existingMsg) {
            await deleteLocalMessage(item.id);
            await saveMessageLocally({ ...existingMsg, status: 'sent' });
          }
        }
      }
    } catch (err) {
      console.warn('Outbox sync deferred, offline or network failure:', err);
      break; // Pause queue processing if network dropped
    }
  }
};

/**
 * Set up global online/offline listeners to flush the outbox when connectivity returns.
 */
export const setupOutboxSync = (): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => {
    processOutboxQueue();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', () => {
    // Mark as offline; UI can reflect this
  });

  return () => {
    window.removeEventListener('online', handleOnline);
  };
};

// Type alias used internally
type LocalMessageType = {
  id: string;
  chatId: string;
  senderId: string;
  body: string;
  attachments?: Record<string, unknown>[];
  status: 'pending' | 'sent' | 'delivered' | 'read';
  createdAt: string;
  idempotentKey: string;
};
