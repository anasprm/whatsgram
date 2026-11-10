import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface LocalMessage {
  id: string;
  chatId: string;
  senderId: string;
  body: string;
  attachments?: Record<string, unknown>[];
  status: 'pending' | 'sent' | 'delivered' | 'read';
  createdAt: string;
  idempotentKey: string;
}

export interface LocalChat {
  id: string;
  name: string;
  isGroup?: boolean;
  unreadCount: number;
  lastMessage?: string;
  updatedAt: string;
}

interface RelayDBSchema extends DBSchema {
  messages: {
    key: string;
    value: LocalMessage;
    indexes: { 'by-chat': string; 'by-status': string };
  };
  chats: {
    key: string;
    value: LocalChat;
    indexes: { 'by-updated': string };
  };
  outbox: {
    key: string;
    value: {
      id: string;
      chatId: string;
      payload: Record<string, unknown>;
      retryCount: number;
      createdAt: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<RelayDBSchema>> | null = null;

export const getDB = (): Promise<IDBPDatabase<RelayDBSchema>> => {
  if (!dbPromise) {
    dbPromise = openDB<RelayDBSchema>('relay-messenger-db', 1, {
      upgrade(db) {
        // Messages store
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('by-chat', 'chatId');
        msgStore.createIndex('by-status', 'status');

        // Chats store
        const chatStore = db.createObjectStore('chats', { keyPath: 'id' });
        chatStore.createIndex('by-updated', 'updatedAt');

        // Outbox store
        db.createObjectStore('outbox', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
};

export const saveMessageLocally = async (msg: LocalMessage): Promise<void> => {
  const db = await getDB();
  await db.put('messages', msg);
};

export const getLocalMessages = async (chatId: string): Promise<LocalMessage[]> => {
  const db = await getDB();
  return db.getAllFromIndex('messages', 'by-chat', chatId);
};

export const saveChatLocally = async (chat: LocalChat): Promise<void> => {
  const db = await getDB();
  await db.put('chats', chat);
};

export const getLocalChats = async (): Promise<LocalChat[]> => {
  const db = await getDB();
  return db.getAllFromIndex('chats', 'by-updated');
};

export const saveOutboxItem = async (item: {
  id: string;
  chatId: string;
  payload: Record<string, unknown>;
  retryCount: number;
  createdAt: number;
}): Promise<void> => {
  const db = await getDB();
  await db.put('outbox', item);
};

export const getAllOutboxItems = async (): Promise<Array<{
  id: string;
  chatId: string;
  payload: Record<string, unknown>;
  retryCount: number;
  createdAt: number;
}>> => {
  const db = await getDB();
  return db.getAll('outbox');
};

export const deleteOutboxItem = async (id: string): Promise<void> => {
  const db = await getDB();
  await db.delete('outbox', id);
};

export const deleteLocalMessage = async (id: string): Promise<void> => {
  const db = await getDB();
  await db.delete('messages', id);
};
