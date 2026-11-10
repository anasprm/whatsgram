/**
 * Relay Messenger — IndexedDB Central State Manager
 * Robust, client-side storage for messages, encrypted keys, game scores,
 * and application settings. Works offline-first with automatic sync.
 */

export interface RelayDBStore {
  name: string;
  keyPath: string;
  indexes?: string[];
}

export interface DBConfig {
  name: string;
  version: number;
  stores: RelayDBStore[];
}

const DEFAULT_CONFIG: DBConfig = {
  name: "RelayMessengerDB",
  version: 1,
  stores: [
    { name: "messages", keyPath: "id", indexes: ["chatId", "status", "createdAt"] },
    { name: "game_scores", keyPath: "gameId", indexes: ["userId", "score"] },
    { name: "settings", keyPath: "key", indexes: [] },
    { name: "encrypted_keys", keyPath: "id", indexes: ["userId", "roomId"] },
    { name: "outbox", keyPath: "id", indexes: ["status", "createdAt", "chatId"] },
  ],
};

let dbInstance: IDBDatabase | null = null;
let openPromise: Promise<IDBDatabase> | null = null;

/**
 * Open (or create) the Relay IndexedDB database. Handles schema upgrades
 * idempotently so repeated calls are safe.
 */
export const openRelayDB = (config: DBConfig = DEFAULT_CONFIG): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (openPromise) return openPromise;

  openPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }

    const request = indexedDB.open(config.name, config.version);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      config.stores.forEach((store) => {
        if (!db.objectStoreNames.contains(store.name)) {
          const objectStore = db.createObjectStore(store.name, { keyPath: store.keyPath });
          (store.indexes || []).forEach((idx) => {
            objectStore.createIndex(idx, idx, { unique: false });
          });
        }
      });
    };
  });

  return openPromise;
};

/**
 * Close the database connection and reset the singleton.
 */
export const closeRelayDB = (): void => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    openPromise = null;
  }
};

/**
 * Save (upsert) a record into the given object store.
 */
export const saveRecord = async (
  storeName: string,
  data: Record<string, unknown>
): Promise<void> => {
  const db = await openRelayDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(data);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
  });
};

/**
 * Retrieve a single record by key from the given object store.
 */
export const getRecord = async <T = unknown>(
  storeName: string,
  key: string | number
): Promise<T | undefined> => {
  const db = await openRelayDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Delete a record by key from the given object store.
 */
export const deleteRecord = async (
  storeName: string,
  key: string | number
): Promise<void> => {
  const db = await openRelayDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Retrieve all records from the given object store.
 */
export const getAllRecords = async <T = unknown>(
  storeName: string
): Promise<T[]> => {
  const db = await openRelayDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Clear all records from the given object store.
 */
export const clearStore = async (storeName: string): Promise<void> => {
  const db = await openRelayDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Convenience: save a message record.
 */
export const saveMessage = (message: Record<string, unknown>): Promise<void> =>
  saveRecord("messages", message);

/**
 * Convenience: save a game score record.
 */
export const saveGameScore = (score: Record<string, unknown>): Promise<void> =>
  saveRecord("game_scores", score);

/**
 * Convenience: save an encrypted key record.
 */
export const saveEncryptedKey = (keyData: Record<string, unknown>): Promise<void> =>
  saveRecord("encrypted_keys", keyData);

/**
 * Convenience: save an outbox item.
 */
export const saveOutboxItem = (item: Record<string, unknown>): Promise<void> =>
  saveRecord("outbox", item);

/**
 * Convenience: save a setting key/value.
 */
export const saveSetting = (key: string, value: unknown): Promise<void> =>
  saveRecord("settings", { key, value });

/**
 * Convenience: get a setting by key.
 */
export const getSetting = async (key: string): Promise<unknown> => {
  const rec = await getRecord<{ value: unknown }>("settings", key);
  return rec?.value;
};
