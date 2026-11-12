const DB_NAME = 'wg-offline-v1';
const DB_VER = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'chatId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB error'));
  });
}

export async function enqueueOutbox(item) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      tx.objectStore('outbox').put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (_) {
    return false;
  }
}

export async function listOutbox() {
  try {
    const db = await openDb();
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readonly');
      const req = tx.objectStore('outbox').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows;
  } catch (_) {
    return [];
  }
}

export async function removeOutbox(id) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      tx.objectStore('outbox').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (_) {
    return false;
  }
}

export async function clearOutbox() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      tx.objectStore('outbox').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (_) {
    return false;
  }
}

export async function saveDraftIdb(chatId, text) {
  if (!chatId) return false;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      if (!text) tx.objectStore('drafts').delete(chatId);
      else tx.objectStore('drafts').put({ chatId, text, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (_) {
    return false;
  }
}

export async function loadDraftIdb(chatId) {
  if (!chatId) return '';
  try {
    const db = await openDb();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly');
      const req = tx.objectStore('drafts').get(chatId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return row ? String(row.text || '') : '';
  } catch (_) {
    return '';
  }
}

export async function requestOutboxSync() {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    if (reg && reg.sync) {
      await reg.sync.register('wg-outbox-sync');
      return true;
    }
  } catch (_) {}
  return false;
}
