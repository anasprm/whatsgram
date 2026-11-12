const crypto = require('node:crypto');

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,23}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INTERNAL_EMAIL_DOMAIN = 'users.whatsgram.invalid';
const BLOCKED_MIME_RE = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/javascript|application\/javascript|application\/x-javascript|application\/x-msdownload|application\/x-sh|application\/x-executable)/i;
const ALLOWED_MIME_RE = /^(image\/(png|jpeg|jpg|gif|webp|avif)|video\/(mp4|webm|quicktime|x-m4v)|audio\/(webm|ogg|mpeg|mp3|mp4|wav|aac|flac)|application\/pdf|application\/octet-stream|application\/zip|application\/json|text\/plain)$/i;

function normalizeUsername(raw) {
  return String(raw || '').trim().replace(/^@+/, '').toLowerCase();
}

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function internalAuthEmail(username) {
  return `${username}@${INTERNAL_EMAIL_DOMAIN}`;
}

function maskEmail(email) {
  const clean = normalizeEmail(email);
  const at = clean.indexOf('@');
  if (at <= 0) return clean;
  const local = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function sha256Hex(val) {
  return crypto.createHash('sha256').update(String(val)).digest('hex');
}

function deriveUsernameFromEmail(email) {
  const local = normalizeEmail(email).split('@')[0] || '';
  let base = local.replace(/[^a-z0-9._-]/g, '_').replace(/^[^a-z0-9]+/, '').slice(0, 20);
  if (base.length < 3) base = `wg_${sha256Hex(email).slice(0, 6)}`;
  return base;
}

function getAppOrigin(req) {
  const envUrl = (process.env.APP_URL || '').trim();
  if (envUrl) {
    try { return new URL(envUrl).origin; } catch {}
  }
  const hostRaw = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  if (hostRaw && /^[a-zA-Z0-9.:-]+$/.test(hostRaw)) {
    const protoHdr = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(hostRaw);
    const proto = protoHdr === 'http' || protoHdr === 'https' ? protoHdr : (isLocal ? 'http' : 'https');
    return `${proto}://${hostRaw}`;
  }
  const vercelUrl = (process.env.VERCEL_URL || '').trim().replace(/^https?:\/\//, '');
  if (vercelUrl && /^[a-zA-Z0-9.:-]+$/.test(vercelUrl)) return `https://${vercelUrl}`;
  return 'https://whatsgram-seven.vercel.app';
}

function isMissingRelationErr(res) {
  const msg = String(res?.data?.message || res?.data || '');
  return res?.status === 404 || /relation .* does not exist|Could not find the (table|column|function)/i.test(msg);
}

function pickEnv(candidates, suffixRe, validate) {
  for (const k of candidates) {
    const v = (process.env[k] || '').trim();
    if (v && (!validate || validate(v))) return v;
  }
  if (suffixRe) {
    for (const [k, v] of Object.entries(process.env)) {
      if (suffixRe.test(k) && typeof v === 'string') {
        const clean = v.trim();
        if (clean && (!validate || validate(clean))) return clean;
      }
    }
  }
  return '';
}

function getConfig() {
  const rawUrl = pickEnv(
    ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL', 'PUBLIC_SUPABASE_URL', 'SUPABASE_PROJECT_URL', 'SUPABASE_API_URL'],
    /^[A-Z0-9_]*SUPABASE_URL$/i,
    v => /^https?:\/\//i.test(v)
  );
  const url = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const secretKey = pickEnv(
    ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_PRIVATE_KEY'],
    /^[A-Z0-9_]*SUPABASE_(SECRET|SERVICE_ROLE)_KEY$/i
  );
  const publishableKey = pickEnv(
    ['SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'PUBLIC_SUPABASE_ANON_KEY'],
    /^[A-Z0-9_]*SUPABASE_(PUBLISHABLE|ANON)_KEY$/i
  );
  return { url, secretKey, publishableKey };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers?.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function setSessionCookies(req, res, at, rt) {
  const isHttps = req.headers?.['x-forwarded-proto'] === 'https' || req.connection?.encrypted;
  const sec = isHttps ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `wg_at=${encodeURIComponent(at)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${sec}`,
    `wg_rt=${encodeURIComponent(rt)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${sec}`
  ]);
}

function clearSessionCookies(req, res) {
  const isHttps = req.headers?.['x-forwarded-proto'] === 'https' || req.connection?.encrypted;
  const sec = isHttps ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `wg_at=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${sec}`,
    `wg_rt=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${sec}`
  ]);
}

async function sbFetch(cfg, path, { method = 'GET', body, userJwt, prefer, usePub = false } = {}) {
  const key = usePub && cfg.publishableKey ? cfg.publishableKey : cfg.secretKey;
  const headers = { apikey: key };
  if (userJwt) headers.Authorization = `Bearer ${userJwt}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const r = await fetch(`${cfg.url}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

async function getUserFromToken(cfg, token) {
  if (!token) return null;
  const r = await sbFetch(cfg, '/auth/v1/user', { userJwt: token, usePub: Boolean(cfg.publishableKey) });
  return r.ok && r.data?.id ? r.data : null;
}

async function requireUser(cfg, req, res) {
  const cookies = parseCookies(req);
  let at = cookies.wg_at || '';
  const rt = cookies.wg_rt || '';
  let user = await getUserFromToken(cfg, at);

  if (!user && rt) {
    const ref = await sbFetch(cfg, '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: rt },
      usePub: Boolean(cfg.publishableKey)
    });
    if (ref.ok && ref.data?.access_token && ref.data?.user?.id) {
      at = ref.data.access_token;
      user = ref.data.user;
      setSessionCookies(req, res, ref.data.access_token, ref.data.refresh_token || rt);
    }
  }
  return user ? { user, accessToken: at } : null;
}

async function ensureProfile(cfg, user, opts = {}) {
  const o = typeof opts === 'string' ? { displayName: opts } : (opts || {});
  const unameRaw = o.username || user.user_metadata?.username || '';
  const username = unameRaw && USERNAME_RE.test(normalizeUsername(unameRaw)) ? normalizeUsername(unameRaw) : null;
  const fallbackName = username || (user.email ? user.email.split('@')[0] : 'User');
  const name = String(o.displayName || user.user_metadata?.display_name || fallbackName || 'User').trim().slice(0, 60);
  const profileEmail = normalizeEmail(o.profileEmail || user.email || (username ? internalAuthEmail(username) : ''));
  const row = { id: user.id, email: profileEmail, display_name: name, status: 'Online' };
  if (username) row.username = username;

  const r = await sbFetch(cfg, '/rest/v1/wg_profiles?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [row]
  });
  if (!r.ok && username && /column .*username.* does not exist/i.test(String(r.data?.message || ''))) {
    delete row.username;
    await sbFetch(cfg, '/rest/v1/wg_profiles?on_conflict=id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: [row]
    });
  }
  return { id: user.id, username, email: profileEmail, display_name: name };
}

function safeSeg(v, fallback = 'file') {
  return String(v || fallback).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || fallback;
}

function encodeStoragePath(p) {
  return String(p || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function validateUploadMime(rawMime) {
  const base = String(rawMime || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  if (!base) return { ok: true, mime: 'application/octet-stream' };
  if (BLOCKED_MIME_RE.test(base) || !ALLOWED_MIME_RE.test(base)) {
    return { ok: false, mime: base, error: `Unsupported or unsafe media MIME type: ${base}` };
  }
  return { ok: true, mime: base };
}

async function sbStorageFetch(cfg, path, { method = 'GET', body, rawBody, headers: extra = {} } = {}) {
  const headers = { apikey: cfg.secretKey, ...extra };
  let payload = undefined;
  if (rawBody !== undefined) {
    payload = rawBody;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(`${cfg.url}/storage/v1${path}`, { method, headers, body: payload });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

async function ensureMediaBucket(cfg) {
  const chk = await sbStorageFetch(cfg, '/bucket/wg-media');
  if (chk.ok) return true;
  const cr = await sbStorageFetch(cfg, '/bucket', {
    method: 'POST',
    body: { id: 'wg-media', name: 'wg-media', public: false, file_size_limit: 15728640 }
  });
  return cr.ok || cr.status === 409;
}

async function signDownloadUrl(cfg, mediaPath, expiresIn = 900) {
  if (!mediaPath || String(mediaPath).includes('..')) return null;
  const sr = await sbStorageFetch(cfg, `/object/sign/wg-media/${encodeStoragePath(mediaPath)}`, {
    method: 'POST',
    body: { expiresIn }
  });
  const rel = sr.data?.signedURL || sr.data?.signedUrl || '';
  if (!sr.ok || !rel) return { ok: false, status: sr.status || 500, error: sr.data?.message || 'Failed to sign download URL' };
  const url = rel.startsWith('http') ? rel : `${cfg.url}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`;
  return { ok: true, url };
}

async function deleteMediaObjects(cfg, paths) {
  const clean = [...new Set((paths || []).filter(p => typeof p === 'string' && p.length > 0 && !p.includes('..')))];
  if (!clean.length) return;
  await Promise.all(clean.map(p => sbStorageFetch(cfg, `/object/wg-media/${encodeStoragePath(p)}`, { method: 'DELETE' }).catch(() => null)));
}

async function assertConvAccess(cfg, convId, userId) {
  const r = await sbFetch(cfg, `/rest/v1/wg_conversations?id=eq.${encodeURIComponent(convId)}&select=id,owner_id,peer_user_id,is_group,pin_msg_id,owner_read_ms,peer_read_ms`);
  const conv = Array.isArray(r.data) ? r.data[0] : null;
  if (!conv) return null;
  if (conv.owner_id === userId || conv.peer_user_id === userId) return conv;
  if (conv.is_group) {
    const mr = await sbFetch(cfg, `/rest/v1/wg_conversation_members?conversation_id=eq.${encodeURIComponent(convId)}&user_id=eq.${encodeURIComponent(userId)}&select=user_id,role,last_read_ms&limit=1`);
    const mem = mr.ok && Array.isArray(mr.data) ? mr.data[0] : null;
    if (mem) return { ...conv, _member: mem };
  }
  return false;
}

async function signUrlMap(cfg, paths) {
  const unique = [...new Set((paths || []).filter(p => typeof p === 'string' && p.length > 0 && !p.includes('..')))];
  const map = new Map();
  if (!unique.length) return map;
  await Promise.all(unique.map(async p => {
    const r = await signDownloadUrl(cfg, p).catch(() => null);
    if (r?.ok && r.url) map.set(p, r.url);
  }));
  return map;
}

function mapPublicProfile(p, avatarUrl = null) {
  if (!p) return null;
  return {
    id: p.id,
    username: p.username || null,
    email: p.email || null,
    display_name: p.display_name || p.username || 'User',
    status: p.status || 'Online',
    public_key: p.public_key || null,
    key_fp: p.key_fp || null,
    bio: p.bio || '',
    category: p.category || '',
    website: p.website || '',
    links: Array.isArray(p.links) ? p.links : [],
    contact_email: p.contact_email || '',
    location_text: p.location_text || '',
    avatar_path: p.avatar_path || '',
    avatarUrl: avatarUrl || null,
    verified: Boolean(p.verified),
    is_private: Boolean(p.is_private),
    threads_handle: p.threads_handle || ''
  };
}

function sanitizeSafeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s.slice(0, 300);
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) return `https://${s}`.slice(0, 300);
  return '';
}

function normalizeLinks(rawLinks) {
  if (!Array.isArray(rawLinks)) return [];
  const out = [];
  for (const item of rawLinks) {
    if (!item || typeof item !== 'object') continue;
    const url = sanitizeSafeUrl(item.url || '');
    if (!url) continue;
    const title = String(item.title || url.replace(/^https?:\/\//i, '').split('/')[0] || 'Link').trim().slice(0, 60);
    out.push({ title, url });
    if (out.length >= 6) break;
  }
  return out;
}

function normalizePostTags(rawTags, caption) {
  const set = new Set();
  if (Array.isArray(rawTags)) {
    for (const t of rawTags) {
      const clean = String(t || '').trim().replace(/^[@#]+/, '').toLowerCase();
      if (clean && /^[a-z0-9._-]{2,32}$/.test(clean)) set.add(clean);
    }
  }
  const cap = String(caption || '');
  for (const m of cap.matchAll(/[@#]([a-z0-9][a-z0-9._-]{1,31})/gi)) {
    set.add(String(m[1]).toLowerCase());
  }
  return [...set].slice(0, 20);
}

const RATE_BUCKETS = new Map();

function checkRateLimit(key, limit = 40, windowMs = 60000) {
  const now = Date.now();
  let rec = RATE_BUCKETS.get(key);
  if (!rec || rec.resetAt <= now) {
    rec = { count: 0, resetAt: now + windowMs };
  }
  rec.count++;
  RATE_BUCKETS.set(key, rec);
  if (RATE_BUCKETS.size > 1500) {
    for (const [k, v] of RATE_BUCKETS) if (v.resetAt <= now) RATE_BUCKETS.delete(k);
  }
  return { ok: rec.count <= limit, remaining: Math.max(0, limit - rec.count), resetMs: Math.max(0, rec.resetAt - now) };
}

async function getBlockSets(cfg, uid) {
  const myBlocked = new Set();
  const blockedBy = new Set();
  const all = new Set();
  if (!uid) return { myBlocked, blockedBy, all };
  try {
    const euid = encodeURIComponent(uid);
    const r = await sbFetch(cfg, `/rest/v1/wg_blocks?or=(blocker_id.eq.${euid},blocked_id.eq.${euid})&select=blocker_id,blocked_id`);
    if (r.ok && Array.isArray(r.data)) {
      for (const row of r.data) {
        if (row.blocker_id === uid && row.blocked_id) {
          myBlocked.add(row.blocked_id);
          all.add(row.blocked_id);
        } else if (row.blocked_id === uid && row.blocker_id) {
          blockedBy.add(row.blocker_id);
          all.add(row.blocker_id);
        }
      }
    }
  } catch {}
  return { myBlocked, blockedBy, all };
}

function notifUrlForKind(kind, entityId) {
  if (kind === 'message') return entityId ? `/chat/${encodeURIComponent(entityId)}` : '/chats';
  if (kind === 'follow' || kind === 'follow_request') return entityId ? `/u/${encodeURIComponent(entityId)}` : '/profile';
  return '/feed';
}

/** Persist an in-app notification row and trigger non-blocking Web Push when configured. */
async function createNotification(cfg, { userId, actorId, actorName, kind, entityId, preview }) {
  if (!userId || (actorId && userId === actorId)) return null;
  const id = `nt_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  try {
    const cleanActor = String(actorName || '').slice(0, 60);
    const cleanPreview = String(preview || '').slice(0, 200);
    const r = await sbFetch(cfg, '/rest/v1/wg_notifications', {
      method: 'POST',
      prefer: 'return=minimal',
      body: [{
        id,
        user_id: userId,
        actor_id: actorId || null,
        actor_name: cleanActor,
        kind,
        entity_id: entityId ? String(entityId) : null,
        preview: cleanPreview
      }]
    });
    if (r.ok) {
      try {
        const { sendWebPushToUser } = require('./push');
        const label = cleanActor || 'WhatsGram';
        const url = notifUrlForKind(kind, entityId);
        sendWebPushToUser(cfg, userId, {
          title: label,
          body: cleanPreview || 'New update on WhatsGram OS',
          tag: `wg-${kind}-${entityId || userId}`,
          url,
          data: { kind, entityId: entityId || null, notifId: id, url }
        }).catch(() => null);
      } catch {}
    }
    return r.ok ? id : null;
  } catch {
    return null;
  }
}

module.exports = {
  USERNAME_RE,
  EMAIL_RE,
  INTERNAL_EMAIL_DOMAIN,
  normalizeUsername,
  normalizeEmail,
  internalAuthEmail,
  maskEmail,
  sha256Hex,
  deriveUsernameFromEmail,
  getAppOrigin,
  isMissingRelationErr,
  pickEnv,
  getConfig,
  readBody,
  parseCookies,
  setSessionCookies,
  clearSessionCookies,
  sbFetch,
  getUserFromToken,
  requireUser,
  ensureProfile,
  safeSeg,
  encodeStoragePath,
  validateUploadMime,
  sbStorageFetch,
  ensureMediaBucket,
  signDownloadUrl,
  deleteMediaObjects,
  assertConvAccess,
  signUrlMap,
  mapPublicProfile,
  sanitizeSafeUrl,
  normalizeLinks,
  normalizePostTags,
  checkRateLimit,
  getBlockSets,
  createNotification
};
