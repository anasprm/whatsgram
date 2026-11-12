const SHELL_CACHE = 'wg-shell-v4';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/assets/app.css',
  '/assets/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      Promise.allSettled(SHELL_URLS.map(u => cache.add(u)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('wg-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then(c => c.put('/index.html', copy)).catch(() => null);
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname === '/icon.svg' || url.pathname === '/icon-192.png' || url.pathname === '/icon-512.png' || url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async cache => {
        const cached = await cache.match(req);
        const netPromise = fetch(req).then(res => {
          if (res && res.ok) cache.put(req, res.clone()).catch(() => null);
          return res;
        }).catch(() => cached);
        return cached || netPromise;
      })
    );
  }
});

self.addEventListener('push', event => {
  let payload = { title: 'WhatsGram OS', body: 'New encrypted update', url: '/' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') payload = { ...payload, ...parsed };
    }
  } catch {
    try { payload.body = event.data.text() || payload.body; } catch {}
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'WhatsGram OS', {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.tag || 'whatsgram-push',
      actions: Array.isArray(payload.actions) ? payload.actions : [
        { action: 'reply', type: 'text', title: 'Quick Reply', placeholder: 'Write a reply…' },
        { action: 'markRead', title: 'Mark read' }
      ],
      data: { ...(payload.data || {}), url: payload.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const ndata = event.notification?.data || {};
  const targetUrl = ndata.url || '/';
  if (event.action === 'reply' && event.reply && ndata.entityId) {
    const txt = String(event.reply || '').trim();
    if (txt) {
      event.waitUntil(
        fetch('/api/chat?action=sendMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'sendMessage',
            conversationId: ndata.entityId,
            message: { id: 'm_sw_' + Date.now().toString(36), from: 'me', type: 'text', text: txt, ts: Date.now(), t: 'Now' }
          })
        }).catch(() => null)
      );
      return;
    }
  }
  if (event.action === 'markRead') {
    event.waitUntil(
      Promise.all([
        ndata.notifId
          ? fetch('/api/social?action=markNotificationsRead', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'markNotificationsRead', ids: [ndata.notifId] })
            }).catch(() => null)
          : Promise.resolve(),
        ndata.kind === 'message' && ndata.entityId
          ? fetch('/api/chat?action=markRead', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'markRead', conversationId: ndata.entityId, readMs: Date.now() })
            }).catch(() => null)
          : Promise.resolve()
      ])
    );
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'wg-open-url', url: targetUrl });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

async function flushQueuedMessagesFromIdb() {
  if (typeof indexedDB === 'undefined') return;
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('wg-offline-v1', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('outbox')) {
        req.result.createObjectStore('outbox', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(() => null);
  if (!db) return;

  const items = await new Promise(resolve => {
    try {
      const tx = db.transaction('outbox', 'readonly');
      const getAll = tx.objectStore('outbox').getAll();
      getAll.onsuccess = () => resolve(getAll.result || []);
      getAll.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
  for (const item of items) {
    try {
      const r = await fetch('/api/chat?action=sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sendMessage', conversationId: item.conversationId, message: item.message })
      });
      if (r.ok || (r.status >= 400 && r.status < 500)) {
        await new Promise(resolve => {
          const tx = db.transaction('outbox', 'readwrite');
          tx.objectStore('outbox').delete(item.id);
          tx.oncomplete = resolve;
          tx.onerror = resolve;
        });
      }
    } catch {}
  }
}

self.addEventListener('sync', event => {
  if (event.tag === 'wg-outbox-sync') {
    event.waitUntil(
      flushQueuedMessagesFromIdb().then(() =>
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
          list.forEach(c => c.postMessage({ type: 'wg-flush-outbox' }));
        })
      )
    );
  }
});
