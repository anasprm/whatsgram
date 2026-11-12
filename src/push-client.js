export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getExistingPushSubscription() {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function subscribeWebPush(vapidPublicKey) {
  if (!isPushSupported()) throw new Error('Web Push not supported in this browser');
  if (!vapidPublicKey) throw new Error('VAPID public key unavailable');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission denied');
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing.toJSON();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
  });
  return sub.toJSON();
}

export async function unsubscribeWebPush() {
  const existing = await getExistingPushSubscription();
  if (!existing) return null;
  const endpoint = existing.endpoint;
  await existing.unsubscribe();
  return endpoint;
}
