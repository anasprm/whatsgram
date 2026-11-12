const crypto = require('node:crypto');

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,23}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INTERNAL_EMAIL_DOMAIN = 'users.whatsgram.invalid';

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
  return res?.status === 404 || /relation .* does not exist|Could not find the (table|column)/i.test(msg);
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

async function getRecoveryRecord(cfg, userId) {
  const r = await sbFetch(cfg, `/rest/v1/wg_account_recovery?user_id=eq.${encodeURIComponent(userId)}&select=user_id,recovery_email&limit=1`);
  if (!r.ok) return isMissingRelationErr(r) ? null : null;
  return Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
}

async function setRecoveryRecord(cfg, userId, recoveryEmail) {
  if (!recoveryEmail) {
    const del = await sbFetch(cfg, `/rest/v1/wg_account_recovery?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });
    return del.ok || isMissingRelationErr(del) ? { ok: true } : { ok: false, status: del.status, error: del.data?.message || 'Failed to clear recovery email' };
  }
  const clean = normalizeEmail(recoveryEmail);
  const dup = await sbFetch(cfg, `/rest/v1/wg_account_recovery?recovery_email=eq.${encodeURIComponent(clean)}&user_id=neq.${encodeURIComponent(userId)}&select=user_id&limit=1`);
  if (!dup.ok && isMissingRelationErr(dup)) {
    return { ok: false, status: 500, error: 'Database schema update required. Run updated supabase/schema.sql in Supabase SQL Editor.' };
  }
  if (dup.ok && Array.isArray(dup.data) && dup.data.length > 0) {
    return { ok: false, status: 409, error: 'That recovery email is already linked to another account.' };
  }
  const up = await sbFetch(cfg, '/rest/v1/wg_account_recovery?on_conflict=user_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{ user_id: userId, recovery_email: clean, updated_at: new Date().toISOString() }]
  });
  if (!up.ok) {
    if (up.status === 409) return { ok: false, status: 409, error: 'That recovery email is already linked to another account.' };
    return { ok: false, status: up.status || 500, error: up.data?.message || 'Could not save recovery email.' };
  }
  return { ok: true, recoveryEmail: clean };
}

async function findAccountByIdentifier(cfg, rawIdentifier) {
  const id = normalizeUsername(rawIdentifier);
  if (!id) return null;
  const isMail = EMAIL_RE.test(id);

  if (isMail) {
    const rec = await sbFetch(cfg, `/rest/v1/wg_account_recovery?recovery_email=eq.${encodeURIComponent(id)}&select=user_id,recovery_email&limit=1`);
    if (rec.ok && Array.isArray(rec.data) && rec.data[0]) {
      const uid = rec.data[0].user_id;
      const pr = await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(uid)}&select=id,username,email,display_name&limit=1`);
      const prof = Array.isArray(pr.data) && pr.data[0] ? pr.data[0] : null;
      return {
        userId: uid,
        username: prof?.username || null,
        displayName: prof?.display_name || null,
        recoveryEmail: rec.data[0].recovery_email,
        authEmail: rec.data[0].recovery_email
      };
    }
    const pr = await sbFetch(cfg, `/rest/v1/wg_profiles?email=eq.${encodeURIComponent(id)}&select=id,username,email,display_name&limit=1`);
    const prof = Array.isArray(pr.data) && pr.data[0] ? pr.data[0] : null;
    if (prof) {
      const ownRec = await getRecoveryRecord(cfg, prof.id);
      const recoveryEmail = ownRec?.recovery_email || (prof.email.endsWith(`@${INTERNAL_EMAIL_DOMAIN}`) ? null : prof.email);
      return {
        userId: prof.id,
        username: prof.username || null,
        displayName: prof.display_name || null,
        profileEmail: prof.email,
        recoveryEmail,
        authEmail: ownRec?.recovery_email || prof.email
      };
    }
    return { userId: null, username: null, profileEmail: id, recoveryEmail: null, authEmail: id };
  }

  const pr = await sbFetch(cfg, `/rest/v1/wg_profiles?username=eq.${encodeURIComponent(id)}&select=id,username,email,display_name&limit=1`);
  if (!pr.ok) return { schemaMissing: isMissingRelationErr(pr), error: pr.data?.message };
  const prof = Array.isArray(pr.data) && pr.data[0] ? pr.data[0] : null;
  if (!prof) return null;
  const ownRec = await getRecoveryRecord(cfg, prof.id);
  const recoveryEmail = ownRec?.recovery_email || (prof.email && !prof.email.endsWith(`@${INTERNAL_EMAIL_DOMAIN}`) ? prof.email : null);
  return {
    userId: prof.id,
    username: prof.username || id,
    displayName: prof.display_name || id,
    profileEmail: prof.email,
    recoveryEmail,
    authEmail: ownRec?.recovery_email || prof.email
  };
}

async function createResetTokenRecord(cfg, userId, recoveryEmail, req) {
  const recent = await sbFetch(cfg, `/rest/v1/wg_password_resets?user_id=eq.${encodeURIComponent(userId)}&used_at=is.null&order=created_at.desc&limit=1`);
  if (!recent.ok) {
    return { ok: false, status: isMissingRelationErr(recent) ? 500 : (recent.status || 500), error: isMissingRelationErr(recent) ? 'Password reset table missing. Re-run updated supabase/schema.sql in Supabase SQL Editor.' : (recent.data?.message || 'Failed to prepare reset token') };
  }
  const lastRow = Array.isArray(recent.data) ? recent.data[0] : null;
  if (lastRow?.created_at && (Date.now() - new Date(lastRow.created_at).getTime()) < 45 * 1000) {
    return { ok: false, status: 429, error: 'A reset link was just requested. Please wait 45 seconds before requesting another.' };
  }

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const id = `pr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

  const ins = await sbFetch(cfg, '/rest/v1/wg_password_resets', {
    method: 'POST',
    prefer: 'return=minimal',
    body: [{ id, user_id: userId, recovery_email: normalizeEmail(recoveryEmail), token_hash: tokenHash, expires_at: expiresAt }]
  });
  if (!ins.ok) {
    return { ok: false, status: ins.status || 500, error: ins.data?.message || 'Could not persist password reset token.' };
  }
  const appOrigin = getAppOrigin(req);
  const resetUrl = `${appOrigin}/#wg-reset=${encodeURIComponent(rawToken)}`;
  return { ok: true, id, rawToken, resetUrl, appOrigin, expiresAt };
}

async function dispatchResetEmail(cfg, { recoveryEmail, username, resetUrl, appOrigin, userId }) {
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.RESEND_FROM || 'WhatsGram OS <onboarding@resend.dev>').trim();

  if (resendKey) {
    try {
      const subject = 'Reset your WhatsGram OS password';
      const handleLabel = username ? `@${username}` : recoveryEmail;
      const html = `<div style="font-family:system-ui,-apple-system,sans-serif;background:#05060b;color:#f4f4f5;padding:32px;border-radius:16px;max-width:520px;margin:0 auto;border:1px solid #27272a"><h2 style="margin:0 0 12px;font-size:20px;color:#fff">Reset your WhatsGram OS password</h2><p style="margin:0 0 18px;color:#a1a1aa;font-size:14px;line-height:1.5">We received a password reset request for <strong style="color:#fff">${handleLabel}</strong>. Click the button below within 15 minutes to set a new password:</p><p style="margin:24px 0"><a href="${resetUrl}" style="display:inline-block;background:#0095f6;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:12px">Reset Password</a></p><p style="margin:0 0 8px;color:#71717a;font-size:12px;word-break:break-all">Or copy this link: ${resetUrl}</p><p style="margin:18px 0 0;color:#52525b;font-size:11px">If you did not request this, you can safely ignore this email.</p></div>`;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromEmail, to: [recoveryEmail], subject, html, text: `Reset your WhatsGram OS password (${handleLabel}): ${resetUrl}` })
      });
      if (r.ok) return { delivered: true, provider: 'resend' };
    } catch {}
  }

  // Ensure auth.users email matches recoveryEmail before triggering Supabase recovery email
  await sbFetch(cfg, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: { email: normalizeEmail(recoveryEmail), email_confirm: true }
  }).catch(() => null);

  const sbRec = await sbFetch(cfg, `/auth/v1/recover?redirect_to=${encodeURIComponent(appOrigin)}`, {
    method: 'POST',
    body: { email: normalizeEmail(recoveryEmail) },
    usePub: Boolean(cfg.publishableKey)
  });
  if (sbRec.ok) return { delivered: true, provider: 'supabase-smtp' };

  const code = sbRec.data?.error_code || sbRec.data?.code || '';
  const msg = sbRec.data?.msg || sbRec.data?.message || 'Email delivery unavailable.';
  return { delivered: false, code, error: msg };
}

function safeSeg(v, fallback = 'file') {
  return String(v || fallback).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || fallback;
}

function encodeStoragePath(p) {
  return String(p || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
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

async function signDownloadUrl(cfg, mediaPath) {
  if (!mediaPath || String(mediaPath).includes('..')) return null;
  const sr = await sbStorageFetch(cfg, `/object/sign/wg-media/${encodeStoragePath(mediaPath)}`, {
    method: 'POST',
    body: { expiresIn: 3600 }
  });
  const rel = sr.data?.signedURL || sr.data?.signedUrl || '';
  if (!sr.ok || !rel) return { ok: false, status: sr.status || 500, error: sr.data?.message || 'Failed to sign download URL' };
  const url = rel.startsWith('http') ? rel : `${cfg.url}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`;
  return { ok: true, url };
}

function getRtcConfig() {
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const rawTurn = (process.env.TURN_URLS || '').trim();
  if (rawTurn) {
    try {
      if (rawTurn.startsWith('[')) {
        const parsed = JSON.parse(rawTurn);
        if (Array.isArray(parsed)) return [...iceServers, ...parsed];
      } else {
        const entry = { urls: rawTurn.split(',').map(s => s.trim()).filter(Boolean) };
        if (process.env.TURN_USERNAME) entry.username = process.env.TURN_USERNAME.trim();
        if (process.env.TURN_CREDENTIAL) entry.credential = process.env.TURN_CREDENTIAL.trim();
        if (entry.urls.length) iceServers.push(entry);
      }
    } catch {}
  }
  return iceServers;
}

async function deleteMediaObjects(cfg, paths) {
  const clean = (paths || []).filter(p => typeof p === 'string' && p.length > 0 && !p.includes('..'));
  if (!clean.length) return;
  await Promise.all(clean.map(p => sbStorageFetch(cfg, `/object/wg-media/${encodeStoragePath(p)}`, { method: 'DELETE' }).catch(() => null)));
}

async function seedStarterWorkspace(cfg, userId) {
  const existing = await sbFetch(cfg, `/rest/v1/wg_conversations?select=id&owner_id=eq.${encodeURIComponent(userId)}&limit=1`);
  if (!existing.ok) return existing;
  if (Array.isArray(existing.data) && existing.data.length > 0) return { ok: true };

  const uidPrefix = userId.replace(/-/g, '').slice(0, 8);
  const c1 = `c_${uidPrefix}_1`, c2 = `c_${uidPrefix}_2`, c3 = `c_${uidPrefix}_3`;
  const m1 = `m_${uidPrefix}_1`, m2 = `m_${uidPrefix}_2`, m3 = `m_${uidPrefix}_3`, m4 = `m_${uidPrefix}_4`, m5 = `m_${uidPrefix}_5`;

  await sbFetch(cfg, '/rest/v1/wg_conversations', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=minimal',
    body: [
      { id: c1, owner_id: userId, name: 'Alex Rivera', folder: 'work', status: 'Online', pin_msg_id: m1, unread: 1 },
      { id: c2, owner_id: userId, name: 'Sarah Chen', folder: 'personal', status: 'Away', pin_msg_id: null, unread: 0 },
      { id: c3, owner_id: userId, name: 'Dev Master', folder: 'work', status: 'Online', pin_msg_id: null, unread: 2 }
    ]
  });

  await sbFetch(cfg, '/rest/v1/wg_messages', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=minimal',
    body: [
      { id: m1, conversation_id: c1, sender_id: null, sender_role: 'them', msg_type: 'text', body: 'Confirmed receipt of the Q3 project documents.', time_label: '19:40', react: { '❤️': 1 } },
      { id: m2, conversation_id: c1, sender_id: userId, sender_role: 'me', msg_type: 'text', body: 'Thanks. Let me know if any architectural revisions are required.', time_label: '19:42', react: {} },
      { id: m3, conversation_id: c2, sender_id: null, sender_role: 'them', msg_type: 'text', body: 'Analytics export is ready for review at https://example.com/reports', time_label: '14:10', react: {} },
      { id: m4, conversation_id: c3, sender_id: null, sender_role: 'them', msg_type: 'text', body: 'Can you review the deployment checklist before Friday?', time_label: '09:12', react: {} },
      { id: m5, conversation_id: c3, sender_id: null, sender_role: 'them', msg_type: 'text', body: 'Please send the updated files when ready.', time_label: '09:13', react: {} }
    ]
  });

  const stCheck = await sbFetch(cfg, '/rest/v1/wg_stories?select=id&limit=1');
  if (stCheck.ok && Array.isArray(stCheck.data) && stCheck.data.length === 0) {
    await sbFetch(cfg, '/rest/v1/wg_stories', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=minimal',
      body: [
        { id: 's_seed_1', user_id: userId, author_name: 'Alex Rivera', bg: 'linear-gradient(155deg,#833ab4,#fd1d1d 60%,#fcb045)', question: 'Ship the beta this week?', yes_count: 12, no_count: 3, link: '', co_author: '' },
        { id: 's_seed_2', user_id: userId, author_name: 'Sarah Chen', bg: 'linear-gradient(155deg,#0575e6,#021b79)', question: 'Approve the Q3 scope?', yes_count: 7, no_count: 1, link: 'example.com/scope', co_author: '' }
      ]
    });
  }
  return { ok: true };
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

async function assembleProfilePayload(cfg, viewerId, { userId, username }) {
  const profilesRes = await sbFetch(cfg, '/rest/v1/wg_profiles?select=*&order=display_name.asc');
  if (!profilesRes.ok) {
    return { ok: false, status: profilesRes.status || 500, error: profilesRes.data?.message || 'Failed to load profiles' };
  }
  const profiles = Array.isArray(profilesRes.data) ? profilesRes.data : [];
  const cleanHandle = normalizeUsername(username);
  let target = null;
  if (userId) target = profiles.find(p => p.id === String(userId));
  else if (cleanHandle) target = profiles.find(p => normalizeUsername(p.username) === cleanHandle);
  else target = profiles.find(p => p.id === viewerId);

  if (!target) return { ok: false, status: 404, error: 'Profile not found' };

  const tid = encodeURIComponent(target.id);
  const uid = encodeURIComponent(viewerId);
  const [followsRes, hlRes, postsRes, likesRes, comRes, savesRes, reelsRes] = await Promise.all([
    sbFetch(cfg, `/rest/v1/wg_follows?select=follower_id,following_id,created_at&or=(follower_id.eq.${tid},following_id.eq.${tid},follower_id.eq.${uid})`),
    sbFetch(cfg, `/rest/v1/wg_highlights?user_id=eq.${tid}&order=sort_order.asc,created_at.desc`),
    sbFetch(cfg, '/rest/v1/wg_posts?order=pinned.desc,pinned_at.desc.nullslast,created_at.desc&limit=150'),
    sbFetch(cfg, '/rest/v1/wg_post_likes?select=post_id,user_id'),
    sbFetch(cfg, '/rest/v1/wg_post_comments?order=created_at.asc&limit=400'),
    sbFetch(cfg, '/rest/v1/wg_post_saves?select=post_id,user_id,kind,created_at'),
    sbFetch(cfg, `/rest/v1/wg_reels?user_id=eq.${tid}&order=created_at.desc&limit=60`)
  ]);

  const schemaReady = !(isMissingRelationErr(followsRes) || isMissingRelationErr(postsRes));
  const follows = followsRes.ok && Array.isArray(followsRes.data) ? followsRes.data : [];
  const highlightsRaw = hlRes.ok && Array.isArray(hlRes.data) ? hlRes.data : [];
  const postsRaw = postsRes.ok && Array.isArray(postsRes.data) ? postsRes.data : [];
  const likesRaw = likesRes.ok && Array.isArray(likesRes.data) ? likesRes.data : [];
  const commentsRaw = comRes.ok && Array.isArray(comRes.data) ? comRes.data : [];
  const savesRaw = savesRes.ok && Array.isArray(savesRes.data) ? savesRes.data : [];
  const reelsRaw = reelsRes.ok && Array.isArray(reelsRes.data) ? reelsRes.data : [];

  const pathsToSign = [];
  for (const p of profiles) if (p.avatar_path) pathsToSign.push(p.avatar_path);
  for (const h of highlightsRaw) {
    if (h.cover_path) pathsToSign.push(h.cover_path);
    if (Array.isArray(h.slides)) for (const s of h.slides) if (s?.mediaPath) pathsToSign.push(s.mediaPath);
  }
  for (const pt of postsRaw) {
    if (Array.isArray(pt.media_paths)) for (const mp of pt.media_paths) if (typeof mp === 'string' && mp) pathsToSign.push(mp);
  }
  for (const rl of reelsRaw) if (rl.media_path) pathsToSign.push(rl.media_path);

  const urlMap = await signUrlMap(cfg, pathsToSign);
  const pMap = new Map(profiles.map(p => [p.id, mapPublicProfile(p, p.avatar_path ? urlMap.get(p.avatar_path) || null : null)]));

  const followerIds = follows.filter(f => f.following_id === target.id).map(f => f.follower_id);
  const followingIds = follows.filter(f => f.follower_id === target.id).map(f => f.following_id);
  const viewerFollowingSet = new Set(follows.filter(f => f.follower_id === viewerId).map(f => f.following_id));
  const targetFollowersSet = new Set(followerIds);
  const targetFollowingSet = new Set(followingIds);

  const followers = followerIds.map(id => pMap.get(id)).filter(Boolean);
  const following = followingIds.map(id => pMap.get(id)).filter(Boolean);
  const mutuals = followers.filter(u => u.id !== viewerId && viewerFollowingSet.has(u.id));
  const suggested = [...pMap.values()]
    .filter(u => u.id !== viewerId && u.id !== target.id && !viewerFollowingSet.has(u.id))
    .slice(0, 12);

  const likesByPost = new Map();
  const likedByMe = new Set();
  for (const l of likesRaw) {
    likesByPost.set(l.post_id, (likesByPost.get(l.post_id) || 0) + 1);
    if (l.user_id === viewerId) likedByMe.add(l.post_id);
  }

  const commentsByPost = new Map();
  for (const cm of commentsRaw) {
    if (!commentsByPost.has(cm.post_id)) commentsByPost.set(cm.post_id, []);
    const au = pMap.get(cm.user_id);
    commentsByPost.get(cm.post_id).push({
      id: cm.id,
      postId: cm.post_id,
      userId: cm.user_id,
      authorName: cm.author_name || au?.display_name || 'User',
      authorUsername: au?.username || null,
      authorAvatarUrl: au?.avatarUrl || null,
      text: cm.text,
      createdAt: cm.created_at
    });
  }

  const viewerSaved = new Set();
  const viewerReposted = new Set();
  const targetRepostIds = [];
  const targetSavedIds = [];
  for (const sv of savesRaw) {
    if (sv.user_id === viewerId) {
      if (sv.kind === 'repost') viewerReposted.add(sv.post_id);
      else viewerSaved.add(sv.post_id);
    }
    if (sv.user_id === target.id) {
      if (sv.kind === 'repost') targetRepostIds.push(sv.post_id);
      else if (target.id === viewerId) targetSavedIds.push(sv.post_id);
    }
  }

  const mapPost = pt => {
    const au = pMap.get(pt.user_id);
    const paths = Array.isArray(pt.media_paths) ? pt.media_paths : [];
    const mediaUrls = paths.map(mp => urlMap.get(mp) || null).filter(Boolean);
    const cmList = commentsByPost.get(pt.id) || [];
    return {
      id: pt.id,
      userId: pt.user_id,
      author: au || { id: pt.user_id, display_name: 'Creator', username: null },
      caption: pt.caption || '',
      locationText: pt.location_text || '',
      tags: Array.isArray(pt.tags) ? pt.tags : [],
      mediaType: pt.media_type || (mediaUrls.length > 1 ? 'carousel' : mediaUrls.length ? 'image' : 'card'),
      mediaPaths: paths,
      mediaUrls,
      bg: pt.bg || 'from-indigo-600 via-fuchsia-600 to-rose-500',
      pinned: Boolean(pt.pinned),
      pinnedAt: pt.pinned_at || null,
      createdAt: pt.created_at,
      likesCount: likesByPost.get(pt.id) || 0,
      commentsCount: cmList.length,
      likedByMe: likedByMe.has(pt.id),
      savedByMe: viewerSaved.has(pt.id),
      repostedByMe: viewerReposted.has(pt.id),
      comments: cmList
    };
  };

  const allMappedPosts = postsRaw.map(mapPost);
  const postById = new Map(allMappedPosts.map(p => [p.id, p]));
  const ownPosts = allMappedPosts.filter(p => p.userId === target.id)
    .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || String(b.createdAt).localeCompare(String(a.createdAt)));

  const targetHandle = normalizeUsername(target.username);
  const taggedPosts = targetHandle
    ? allMappedPosts.filter(p => p.userId !== target.id && (p.tags.includes(targetHandle) || new RegExp(`@${targetHandle}\\b`, 'i').test(p.caption)))
    : [];
  const reposts = [...new Set([...targetRepostIds, ...(target.id === viewerId ? targetSavedIds : [])])]
    .map(pid => postById.get(pid))
    .filter(Boolean);

  const highlights = highlightsRaw.map(h => ({
    id: h.id,
    userId: h.user_id,
    title: h.title,
    coverBg: h.cover_bg || 'from-amber-400 via-rose-500 to-fuchsia-600',
    coverUrl: h.cover_path ? (urlMap.get(h.cover_path) || null) : null,
    slides: Array.isArray(h.slides) ? h.slides.map(s => ({
      ...s,
      mediaUrl: s?.mediaPath ? (urlMap.get(s.mediaPath) || null) : (s?.mediaUrl || null)
    })) : []
  }));

  const reels = reelsRaw.map(r => ({
    id: /^\d+$/.test(String(r.id)) ? Number(r.id) : r.id,
    userId: r.user_id,
    author: r.author_name,
    cap: r.caption,
    g: r.gradient,
    mediaPath: r.media_path || undefined,
    mediaUrl: r.media_path ? (urlMap.get(r.media_path) || null) : null,
    mediaMime: r.media_mime || undefined,
    likes: r.likes_count || 0
  }));

  const targetMapped = pMap.get(target.id);
  return {
    ok: true,
    data: {
      ok: true,
      schemaReady,
      profile: {
        ...targetMapped,
        isOwn: target.id === viewerId,
        isFollowing: viewerFollowingSet.has(target.id),
        followsMe: targetFollowingSet.has(viewerId),
        postsCount: ownPosts.length + reels.length,
        followersCount: targetFollowersSet.size,
        followingCount: targetFollowingSet.size
      },
      followers,
      following,
      mutuals,
      highlights,
      posts: ownPosts,
      reels,
      reposts,
      taggedPosts,
      suggested
    }
  };
}

async function handleBootstrap(cfg, user, accessToken) {
  const uid = encodeURIComponent(user.id);
  const nowMs = Date.now();

  const [profilesRes, convRes, myMemRes, storiesRes, votesRes, customReelsRes, prefsRes, commentsRes, settingsRes, auditRes, recRes, myFollowsRes] = await Promise.all([
    sbFetch(cfg, '/rest/v1/wg_profiles?select=*&order=display_name.asc'),
    sbFetch(cfg, `/rest/v1/wg_conversations?or=(owner_id.eq.${uid},peer_user_id.eq.${uid})&order=updated_at.desc`),
    sbFetch(cfg, `/rest/v1/wg_conversation_members?user_id=eq.${uid}&select=conversation_id,role,last_read_ms`),
    sbFetch(cfg, '/rest/v1/wg_stories?order=created_at.asc&limit=30'),
    sbFetch(cfg, `/rest/v1/wg_story_votes?user_id=eq.${uid}&select=story_id`),
    sbFetch(cfg, '/rest/v1/wg_reels?order=created_at.desc&limit=30'),
    sbFetch(cfg, `/rest/v1/wg_reels_prefs?user_id=eq.${uid}&limit=1`),
    sbFetch(cfg, '/rest/v1/wg_reel_comments?order=created_at.asc&limit=200'),
    sbFetch(cfg, `/rest/v1/wg_settings?user_id=eq.${uid}&limit=1`),
    sbFetch(cfg, `/rest/v1/wg_audit_logs?user_id=eq.${uid}&order=id.desc&limit=40`),
    sbFetch(cfg, `/rest/v1/wg_account_recovery?user_id=eq.${uid}&select=recovery_email&limit=1`),
    sbFetch(cfg, `/rest/v1/wg_follows?select=follower_id,following_id&or=(follower_id.eq.${uid},following_id.eq.${uid})`)
  ]);

  if (!convRes.ok) {
    const msg = convRes.data?.message || 'Database tables not initialized. Run supabase/schema.sql in Supabase SQL Editor.';
    return { ok: false, status: convRes.status, error: msg };
  }

  const profiles = Array.isArray(profilesRes.data) ? profilesRes.data : [];
  const profileMap = new Map(profiles.map(p => [p.id, p]));
  let convs = Array.isArray(convRes.data) ? [...convRes.data] : [];

  // Merge group conversations where user is a member
  const myMems = myMemRes.ok && Array.isArray(myMemRes.data) ? myMemRes.data : [];
  const knownIds = new Set(convs.map(c => c.id));
  const extraIds = myMems.map(m => m.conversation_id).filter(id => id && !knownIds.has(id));
  if (extraIds.length) {
    const idList = extraIds.map(id => `"${String(id).replace(/"/g, '')}"`).join(',');
    const extraConvRes = await sbFetch(cfg, `/rest/v1/wg_conversations?id=in.(${encodeURIComponent(idList)})&order=updated_at.desc`);
    if (extraConvRes.ok && Array.isArray(extraConvRes.data)) {
      convs = [...convs, ...extraConvRes.data];
    }
  }

  const groupIds = convs.filter(c => c.is_group).map(c => c.id);
  const groupMembersByConv = new Map();
  if (groupIds.length) {
    const gidList = groupIds.map(id => `"${String(id).replace(/"/g, '')}"`).join(',');
    const gmRes = await sbFetch(cfg, `/rest/v1/wg_conversation_members?conversation_id=in.(${encodeURIComponent(gidList)})&select=conversation_id,user_id,role,last_read_ms`);
    if (gmRes.ok && Array.isArray(gmRes.data)) {
      for (const row of gmRes.data) {
        if (!groupMembersByConv.has(row.conversation_id)) groupMembersByConv.set(row.conversation_id, []);
        const p = profileMap.get(row.user_id);
        groupMembersByConv.get(row.conversation_id).push({
          id: row.user_id,
          displayName: p?.display_name || p?.email || 'Member',
          status: p?.status || 'Online',
          publicKey: p?.public_key || null,
          keyFp: p?.key_fp || null,
          role: row.role || 'member',
          readMs: Number(row.last_read_ms) || 0
        });
      }
    }
  }

  let msgs = [];
  if (convs.length) {
    const ids = convs.map(c => `"${String(c.id).replace(/"/g, '')}"`).join(',');
    const msgRes = await sbFetch(cfg, `/rest/v1/wg_messages?conversation_id=in.(${encodeURIComponent(ids)})&order=created_at.asc`);
    if (msgRes.ok && Array.isArray(msgRes.data)) {
      const expired = msgRes.data.filter(m => m.exp_at && Number(m.exp_at) <= nowMs);
      if (expired.length) {
        const expMedia = expired.map(m => m.media_path).filter(Boolean);
        if (expMedia.length) deleteMediaObjects(cfg, expMedia).catch(() => null);
        const expIds = expired.map(m => `"${String(m.id).replace(/"/g, '')}"`).join(',');
        sbFetch(cfg, `/rest/v1/wg_messages?id=in.(${encodeURIComponent(expIds)})`, { method: 'DELETE' }).catch(() => null);
      }
      msgs = msgRes.data.filter(m => !m.exp_at || Number(m.exp_at) > nowMs);
    }
  }

  const msgByConv = new Map();
  for (const m of msgs) {
    if (!msgByConv.has(m.conversation_id)) msgByConv.set(m.conversation_id, []);
    const from = m.sender_role === 'sys'
      ? 'sys'
      : (m.sender_id ? (m.sender_id === user.id ? 'me' : 'them') : m.sender_role);
    const senderProf = m.sender_id ? profileMap.get(m.sender_id) : null;
    msgByConv.get(m.conversation_id).push({
      id: m.id,
      from,
      fromName: m.sender_name || senderProf?.display_name || undefined,
      type: m.msg_type || 'text',
      text: m.body || '',
      name: m.file_name || undefined,
      size: m.file_size || undefined,
      mediaPath: m.media_path || undefined,
      mediaMime: m.media_mime || undefined,
      mediaEnc: Boolean(m.media_enc),
      dur: m.dur || undefined,
      ct: m.ct || undefined,
      editedAt: m.edited_at ? Number(m.edited_at) : undefined,
      reply: m.reply_preview || null,
      react: m.react || {},
      exp: m.exp_at ? Number(m.exp_at) : undefined,
      ts: m.created_ms ? Number(m.created_ms) : 0,
      t: m.time_label || ''
    });
  }

  const chats = convs.map(c => {
    let displayName = c.name;
    let status = c.status || 'Online';
    let peerPublicKey = null;
    let peerKeyFp = null;
    const isOwner = c.owner_id === user.id;
    const isGroup = Boolean(c.is_group);
    const members = isGroup ? (groupMembersByConv.get(c.id) || []) : undefined;
    let peerId = c.peer_user_id || null;
    let peerReadMs = Number(isOwner ? c.peer_read_ms : c.owner_read_ms) || 0;
    let myReadMs = Number(isOwner ? c.owner_read_ms : c.peer_read_ms) || 0;

    if (isGroup && members) {
      const meMem = members.find(m => m.id === user.id);
      if (meMem) myReadMs = meMem.readMs;
      peerReadMs = members.filter(m => m.id !== user.id).reduce((mx, m) => Math.max(mx, m.readMs || 0), 0);
      status = `${members.length || 1} members`;
    } else if (c.peer_user_id) {
      const otherId = isOwner ? c.peer_user_id : c.owner_id;
      peerId = otherId;
      const other = profileMap.get(otherId);
      if (other) {
        displayName = other.display_name;
        status = other.status || 'Online';
        peerPublicKey = other.public_key || null;
        peerKeyFp = other.key_fp || null;
      }
    }
    return {
      id: c.id,
      name: displayName,
      isGroup,
      members,
      peerUserId: isGroup ? null : peerId,
      peerPublicKey,
      peerKeyFp,
      isOwner,
      peerReadMs,
      myReadMs,
      folder: c.folder || 'personal',
      unread: c.unread || 0,
      status,
      pin: c.pin_msg_id || null,
      msgs: msgByConv.get(c.id) || []
    };
  });

  const votedSet = new Set((Array.isArray(votesRes.data) ? votesRes.data : []).map(v => v.story_id));
  const stories = (Array.isArray(storiesRes.data) ? storiesRes.data : []).map(s => ({
    id: s.id,
    name: s.author_name,
    bg: s.bg,
    q: s.question,
    mediaPath: s.media_path || undefined,
    mediaMime: s.media_mime || undefined,
    yes: s.yes_count || 0,
    no: s.no_count || 0,
    link: s.link || '',
    co: s.co_author || '',
    seen: votedSet.has(s.id),
    voted: votedSet.has(s.id)
  }));

  const prefs = Array.isArray(prefsRes.data) && prefsRes.data[0] ? prefsRes.data[0] : {};
  const extra = {};
  for (const cm of (Array.isArray(commentsRes.data) ? commentsRes.data : [])) {
    if (!extra[cm.reel_id]) extra[cm.reel_id] = [];
    extra[cm.reel_id].push({ n: cm.author_name, t: cm.body });
  }
  const customReels = (customReelsRes.ok && Array.isArray(customReelsRes.data) ? customReelsRes.data : []).map(r => ({
    id: /^\d+$/.test(String(r.id)) ? Number(r.id) : r.id,
    author: r.author_name,
    cap: r.caption,
    g: r.gradient,
    mediaPath: r.media_path || undefined,
    mediaMime: r.media_mime || undefined,
    filterIdx: r.filter_idx || 0,
    likes: r.likes_count || 0,
    com: []
  }));

  const settingsRow = Array.isArray(settingsRes.data) && settingsRes.data[0] ? settingsRes.data[0] : null;
  const auditLogs = (Array.isArray(auditRes.data) ? auditRes.data : []).map(l => ({ t: l.event_time, m: l.message }));
  const avatarUrlMap = await signUrlMap(cfg, profiles.map(p => p.avatar_path).filter(Boolean));
  const myProfile = profileMap.get(user.id);
  const myFollowRows = myFollowsRes?.ok && Array.isArray(myFollowsRes.data) ? myFollowsRes.data : [];
  const followersCount = myFollowRows.filter(f => f.following_id === user.id).length;
  const followingCount = myFollowRows.filter(f => f.follower_id === user.id).length;
  const myRecEmail = (recRes.ok && Array.isArray(recRes.data) && recRes.data[0]?.recovery_email)
    || (user.email && !String(user.email).endsWith(`@${INTERNAL_EMAIL_DOMAIN}`) ? user.email : null);
  const myUsername = myProfile?.username || user.user_metadata?.username || null;

  return {
    ok: true,
    data: {
      user: {
        id: user.id,
        username: myUsername,
        email: myRecEmail || user.email,
        recoveryEmail: myRecEmail,
        hasRecoveryEmail: Boolean(myRecEmail),
        displayName: myProfile?.display_name || user.user_metadata?.display_name || myUsername || user.email,
        publicKey: myProfile?.public_key || null,
        keyFp: myProfile?.key_fp || null,
        bio: myProfile?.bio || '',
        category: myProfile?.category || '',
        website: myProfile?.website || '',
        links: Array.isArray(myProfile?.links) ? myProfile.links : [],
        contactEmail: myProfile?.contact_email || '',
        locationText: myProfile?.location_text || '',
        avatarPath: myProfile?.avatar_path || '',
        avatarUrl: myProfile?.avatar_path ? (avatarUrlMap.get(myProfile.avatar_path) || null) : null,
        verified: Boolean(myProfile?.verified),
        threadsHandle: myProfile?.threads_handle || '',
        followersCount,
        followingCount
      },
      users: profiles.filter(p => p.id !== user.id).map(p => mapPublicProfile(p, p.avatar_path ? (avatarUrlMap.get(p.avatar_path) || null) : null)),
      chats,
      stories,
      customReels,
      reels: {
        liked: prefs.liked || [],
        saved: prefs.saved || [],
        follow: prefs.follow || ['alex.rivera'],
        filter: typeof prefs.filter_idx === 'number' ? prefs.filter_idx : 0,
        extra
      },
      cfg: settingsRow?.cfg || null,
      logs: auditLogs,
      realtime: cfg.publishableKey ? { url: cfg.url, publishableKey: cfg.publishableKey, accessToken } : null
    }
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(204).end();
  }

  const cfg = getConfig();
  const action = req.query?.action || '';

  if (req.method === 'GET' && action === 'status') {
    const missing = [];
    if (!cfg.url) missing.push('SUPABASE_URL');
    if (!cfg.secretKey) missing.push('SUPABASE_SECRET_KEY');
    return res.status(200).json({
      ok: true,
      configured: Boolean(cfg.url && cfg.secretKey),
      hasRealtime: Boolean(cfg.url && cfg.publishableKey),
      missing
    });
  }

  if (!cfg.url || !cfg.secretKey) {
    const miss = [];
    if (!cfg.url) miss.push('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)');
    if (!cfg.secretKey) miss.push('SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)');
    return res.status(503).json({ error: `${miss.join(' and ')} not configured on Vercel.`, missing: miss });
  }

  try {
    if (req.method === 'GET') {
      const session = await requireUser(cfg, req, res);
      if (action === 'session') {
        if (!session) return res.status(200).json({ authenticated: false });
        const boot = await handleBootstrap(cfg, session.user, session.accessToken);
        if (!boot.ok) return res.status(boot.status || 500).json({ error: boot.error });
        return res.status(200).json({ authenticated: true, ...boot.data });
      }
      if (!session) return res.status(401).json({ error: 'Authentication required' });
      if (action === 'bootstrap') {
        const boot = await handleBootstrap(cfg, session.user, session.accessToken);
        if (!boot.ok) return res.status(boot.status || 500).json({ error: boot.error });
        return res.status(200).json(boot.data);
      }
      if (action === 'users') {
        const r = await sbFetch(cfg, `/rest/v1/wg_profiles?id=neq.${encodeURIComponent(session.user.id)}&select=*&order=display_name.asc`);
        const list = Array.isArray(r.data) ? r.data : [];
        const uMap = await signUrlMap(cfg, list.map(p => p.avatar_path).filter(Boolean));
        return res.status(r.ok ? 200 : r.status).json({ users: list.map(p => mapPublicProfile(p, p.avatar_path ? (uMap.get(p.avatar_path) || null) : null)) });
      }
      if (action === 'profileData') {
        const result = await assembleProfilePayload(cfg, session.user.id, {
          userId: req.query?.userId || '',
          username: req.query?.username || ''
        });
        if (!result.ok) return res.status(result.status || 500).json({ error: result.error });
        return res.status(200).json(result.data);
      }
      if (action === 'postComments') {
        const postId = String(req.query?.postId || '');
        if (!postId) return res.status(400).json({ error: 'postId required' });
        const [cmRes, pRes] = await Promise.all([
          sbFetch(cfg, `/rest/v1/wg_post_comments?post_id=eq.${encodeURIComponent(postId)}&order=created_at.asc&limit=200`),
          sbFetch(cfg, '/rest/v1/wg_profiles?select=id,username,display_name,avatar_path')
        ]);
        if (!cmRes.ok) return res.status(cmRes.status || 500).json({ error: cmRes.data?.message || 'Failed to load comments' });
        const profs = Array.isArray(pRes.data) ? pRes.data : [];
        const avMap = await signUrlMap(cfg, profs.map(p => p.avatar_path).filter(Boolean));
        const pById = new Map(profs.map(p => [p.id, p]));
        const comments = (Array.isArray(cmRes.data) ? cmRes.data : []).map(cm => {
          const au = pById.get(cm.user_id);
          return {
            id: cm.id,
            postId: cm.post_id,
            userId: cm.user_id,
            authorName: cm.author_name || au?.display_name || 'User',
            authorUsername: au?.username || null,
            authorAvatarUrl: au?.avatar_path ? (avMap.get(au.avatar_path) || null) : null,
            text: cm.text,
            createdAt: cm.created_at
          };
        });
        return res.status(200).json({ ok: true, comments });
      }
      if (action === 'rtcConfig') {
        return res.status(200).json({ ok: true, iceServers: getRtcConfig() });
      }
      if (action === 'mediaUrl') {
        const convId = String(req.query?.conversationId || '');
        const msgId = String(req.query?.messageId || '');
        if (!convId || !msgId) return res.status(400).json({ error: 'conversationId and messageId required' });
        const conv = await assertConvAccess(cfg, convId, session.user.id);
        if (conv === null) return res.status(404).json({ error: 'Conversation not found' });
        if (conv === false) return res.status(403).json({ error: 'Forbidden' });
        const mr = await sbFetch(cfg, `/rest/v1/wg_messages?id=eq.${encodeURIComponent(msgId)}&conversation_id=eq.${encodeURIComponent(convId)}&select=id,media_path,media_mime,file_name&limit=1`);
        const msg = Array.isArray(mr.data) ? mr.data[0] : null;
        if (!msg || !msg.media_path) return res.status(404).json({ error: 'Media attachment not found' });
        const signed = await signDownloadUrl(cfg, msg.media_path);
        if (!signed?.ok) return res.status(signed?.status || 500).json({ error: signed?.error || 'Failed to sign download URL' });
        return res.status(200).json({ ok: true, url: signed.url, mime: msg.media_mime || null, name: msg.file_name || null });
      }
      if (action === 'storyMediaUrl' || action === 'reelMediaUrl') {
        const isStory = action === 'storyMediaUrl';
        const itemId = String(isStory ? (req.query?.storyId || '') : (req.query?.reelId || ''));
        if (!itemId) return res.status(400).json({ error: 'ID required' });
        const table = isStory ? 'wg_stories' : 'wg_reels';
        const r = await sbFetch(cfg, `/rest/v1/${table}?id=eq.${encodeURIComponent(itemId)}&select=id,media_path,media_mime&limit=1`);
        const item = Array.isArray(r.data) ? r.data[0] : null;
        if (!item?.media_path) return res.status(404).json({ error: 'Media not found' });
        const signed = await signDownloadUrl(cfg, item.media_path);
        if (!signed?.ok) return res.status(signed?.status || 500).json({ error: signed?.error || 'Failed to sign URL' });
        return res.status(200).json({ ok: true, url: signed.url, mime: item.media_mime || null });
      }
      return res.status(400).json({ error: 'Unknown GET action' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = await readBody(req);
    const act = body.action || action;

    if (act === 'signout') {
      clearSessionCookies(req, res);
      return res.status(200).json({ ok: true });
    }

    if (act === 'signup' || act === 'signin') {
      const password = String(body.password || '');
      const hasUsernameField = typeof body.username === 'string' && body.username.trim().length > 0;
      const rawRecovery = body.recoveryEmail !== undefined ? body.recoveryEmail : (hasUsernameField ? '' : body.email);
      const recoveryEmail = normalizeEmail(rawRecovery || '');

      if (act === 'signup') {
        if (password.length < 6) {
          return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }
        let username = '';
        if (hasUsernameField) {
          username = normalizeUsername(body.username);
          if (!USERNAME_RE.test(username)) {
            return res.status(400).json({ error: 'Username must be 3–24 characters using letters, numbers, dots, underscores, or hyphens.' });
          }
        } else if (EMAIL_RE.test(recoveryEmail)) {
          username = deriveUsernameFromEmail(recoveryEmail);
        } else {
          return res.status(400).json({ error: 'Enter a valid username (3–24 characters) and password.' });
        }

        if (recoveryEmail && !EMAIL_RE.test(recoveryEmail)) {
          return res.status(400).json({ error: 'Recovery email format is invalid.' });
        }

        const existingUser = await sbFetch(cfg, `/rest/v1/wg_profiles?username=eq.${encodeURIComponent(username)}&select=id&limit=1`);
        if (existingUser.ok && Array.isArray(existingUser.data) && existingUser.data.length > 0) {
          return res.status(409).json({ error: `Username "@${username}" is already taken.` });
        }
        if (recoveryEmail) {
          const existingRec = await sbFetch(cfg, `/rest/v1/wg_account_recovery?recovery_email=eq.${encodeURIComponent(recoveryEmail)}&select=user_id&limit=1`);
          if (existingRec.ok && Array.isArray(existingRec.data) && existingRec.data.length > 0) {
            return res.status(409).json({ error: 'That recovery email is already registered to another account.' });
          }
        }

        const authEmail = recoveryEmail || internalAuthEmail(username);
        const profileEmail = hasUsernameField ? internalAuthEmail(username) : authEmail;
        const displayName = String(body.displayName || username || 'User').trim().slice(0, 60);

        const created = await sbFetch(cfg, '/auth/v1/admin/users', {
          method: 'POST',
          body: { email: authEmail, password, email_confirm: true, user_metadata: { username, display_name: displayName } }
        });
        if (!created.ok) {
          const msg = created.data?.msg || created.data?.message || 'Unable to create account (username or email may already exist).';
          return res.status(created.status || 400).json({ error: msg });
        }

        const auth = await sbFetch(cfg, '/auth/v1/token?grant_type=password', {
          method: 'POST',
          body: { email: authEmail, password },
          usePub: Boolean(cfg.publishableKey)
        });
        if (!auth.ok || !auth.data?.access_token || !auth.data?.user) {
          return res.status(401).json({ error: auth.data?.error_description || auth.data?.msg || 'Unable to sign in after signup.' });
        }

        setSessionCookies(req, res, auth.data.access_token, auth.data.refresh_token || '');
        await ensureProfile(cfg, auth.data.user, { username, displayName, profileEmail });
        if (recoveryEmail) {
          const recSave = await setRecoveryRecord(cfg, auth.data.user.id, recoveryEmail);
          if (!recSave.ok && recSave.status >= 500) {
            return res.status(recSave.status).json({ error: recSave.error });
          }
        }
        const seed = await seedStarterWorkspace(cfg, auth.data.user.id);
        if (!seed.ok) {
          return res.status(500).json({ error: 'Database schema missing. Run supabase/schema.sql in Supabase SQL Editor.' });
        }
        const boot = await handleBootstrap(cfg, auth.data.user, auth.data.access_token);
        if (!boot.ok) return res.status(boot.status || 500).json({ error: boot.error });
        return res.status(200).json({ authenticated: true, ...boot.data });
      }

      // Sign in by username OR registered recovery email
      const identifier = String(body.identifier || body.username || body.email || '').trim();
      if (!identifier || password.length < 6) {
        return res.status(400).json({ error: 'Enter your username (or recovery email) and password.' });
      }
      const acct = await findAccountByIdentifier(cfg, identifier);
      if (acct?.schemaMissing) {
        return res.status(500).json({ error: 'Database schema update required. Run supabase/schema.sql in Supabase SQL Editor.' });
      }
      if (!acct?.authEmail) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      const auth = await sbFetch(cfg, '/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: { email: acct.authEmail, password },
        usePub: Boolean(cfg.publishableKey)
      });
      if (!auth.ok || !auth.data?.access_token || !auth.data?.user) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      setSessionCookies(req, res, auth.data.access_token, auth.data.refresh_token || '');
      await ensureProfile(cfg, auth.data.user, {
        username: acct.username || auth.data.user.user_metadata?.username,
        displayName: acct.displayName || undefined,
        profileEmail: acct.profileEmail || (acct.username ? internalAuthEmail(acct.username) : acct.authEmail)
      });
      const seed = await seedStarterWorkspace(cfg, auth.data.user.id);
      if (!seed.ok) {
        return res.status(500).json({ error: 'Database schema missing. Run supabase/schema.sql in Supabase SQL Editor.' });
      }
      const boot = await handleBootstrap(cfg, auth.data.user, auth.data.access_token);
      if (!boot.ok) return res.status(boot.status || 500).json({ error: boot.error });
      return res.status(200).json({ authenticated: true, ...boot.data });
    }

    if (act === 'requestPasswordReset') {
      const identifier = String(body.identifier || body.username || body.email || '').trim();
      if (!identifier) {
        return res.status(400).json({ error: 'Enter your username or registered recovery email.' });
      }
      const acct = await findAccountByIdentifier(cfg, identifier);
      if (acct?.schemaMissing) {
        return res.status(500).json({ error: 'Database schema update required. Run updated supabase/schema.sql in Supabase SQL Editor.' });
      }
      if (!acct?.userId) {
        return res.status(404).json({ error: 'No account found with that username or recovery email.' });
      }
      if (!acct.recoveryEmail) {
        return res.status(400).json({
          code: 'NO_RECOVERY_EMAIL',
          error: 'No optional recovery email is registered on this account, so a reset link cannot be sent.'
        });
      }

      const tok = await createResetTokenRecord(cfg, acct.userId, acct.recoveryEmail, req);
      if (!tok.ok) return res.status(tok.status || 500).json({ error: tok.error });

      const delivery = await dispatchResetEmail(cfg, {
        recoveryEmail: acct.recoveryEmail,
        username: acct.username,
        resetUrl: tok.resetUrl,
        appOrigin: tok.appOrigin,
        userId: acct.userId
      });
      const masked = maskEmail(acct.recoveryEmail);
      if (delivery.delivered) {
        return res.status(200).json({
          ok: true,
          delivered: true,
          provider: delivery.provider,
          maskedEmail: masked,
          expiresInMinutes: 15,
          message: `Password reset link sent to ${masked}. Check your inbox (valid for 15 minutes).`
        });
      }
      return res.status(503).json({
        ok: false,
        smtpRequired: true,
        maskedEmail: masked,
        error: `Reset token saved for ${masked}, but email delivery requires Custom SMTP in Supabase Auth or RESEND_API_KEY in Vercel environment variables (${delivery.error}).`
      });
    }

    if (act === 'confirmPasswordReset') {
      const newPassword = String(body.newPassword || body.password || '');
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
      }

      let targetUserId = null;
      let targetAuthEmail = null;

      if (body.token) {
        const tokenHash = sha256Hex(String(body.token).trim());
        const find = await sbFetch(cfg, `/rest/v1/wg_password_resets?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,user_id,recovery_email,expires_at,used_at&limit=1`);
        if (!find.ok) {
          return res.status(isMissingRelationErr(find) ? 500 : (find.status || 500)).json({
            error: isMissingRelationErr(find) ? 'Password reset table missing. Run updated supabase/schema.sql.' : 'Could not verify reset token.'
          });
        }
        const row = Array.isArray(find.data) ? find.data[0] : null;
        if (!row) return res.status(400).json({ error: 'Invalid password reset link.' });
        if (row.used_at) return res.status(400).json({ error: 'This password reset link has already been used.' });
        if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) {
          return res.status(400).json({ error: 'This password reset link has expired. Request a new one.' });
        }
        const consume = await sbFetch(cfg, `/rest/v1/wg_password_resets?id=eq.${encodeURIComponent(row.id)}&used_at=is.null`, {
          method: 'PATCH',
          prefer: 'return=representation',
          body: { used_at: new Date().toISOString() }
        });
        if (!consume.ok || !Array.isArray(consume.data) || consume.data.length !== 1) {
          return res.status(409).json({ error: 'This password reset link has already been used.' });
        }
        targetUserId = row.user_id;
        targetAuthEmail = row.recovery_email;
      } else if (body.accessToken) {
        const recUser = await getUserFromToken(cfg, String(body.accessToken).trim());
        if (!recUser?.id) return res.status(401).json({ error: 'Recovery link session is invalid or expired.' });
        targetUserId = recUser.id;
        targetAuthEmail = recUser.email;
      } else if (body.tokenHash) {
        const ver = await sbFetch(cfg, '/auth/v1/verify', {
          method: 'POST',
          body: { type: 'recovery', token_hash: String(body.tokenHash).trim() },
          usePub: Boolean(cfg.publishableKey)
        });
        if (!ver.ok || !ver.data?.user?.id) {
          return res.status(401).json({ error: ver.data?.msg || ver.data?.error_description || 'Invalid or expired recovery token.' });
        }
        targetUserId = ver.data.user.id;
        targetAuthEmail = ver.data.user.email;
      } else {
        return res.status(400).json({ error: 'Password reset token missing.' });
      }

      const upd = await sbFetch(cfg, `/auth/v1/admin/users/${encodeURIComponent(targetUserId)}`, {
        method: 'PUT',
        body: { password: newPassword }
      });
      if (!upd.ok) {
        return res.status(upd.status || 400).json({ error: upd.data?.msg || upd.data?.message || 'Failed to update password.' });
      }

      if (!targetAuthEmail) {
        const rec = await getRecoveryRecord(cfg, targetUserId);
        const pr = await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(targetUserId)}&select=email&limit=1`);
        targetAuthEmail = rec?.recovery_email || (Array.isArray(pr.data) && pr.data[0]?.email) || null;
      }

      if (targetAuthEmail) {
        const auth = await sbFetch(cfg, '/auth/v1/token?grant_type=password', {
          method: 'POST',
          body: { email: normalizeEmail(targetAuthEmail), password: newPassword },
          usePub: Boolean(cfg.publishableKey)
        });
        if (auth.ok && auth.data?.access_token && auth.data?.user) {
          setSessionCookies(req, res, auth.data.access_token, auth.data.refresh_token || '');
          const boot = await handleBootstrap(cfg, auth.data.user, auth.data.access_token);
          if (boot.ok) return res.status(200).json({ ok: true, authenticated: true, ...boot.data });
        }
      }
      return res.status(200).json({ ok: true, authenticated: false, message: 'Password updated. You can now sign in with your new password.' });
    }

    const session = await requireUser(cfg, req, res);
    if (!session) return res.status(401).json({ error: 'Authentication required' });
    const uid = session.user.id;

    if (act === 'updateRecoveryEmail') {
      const nextEmail = normalizeEmail(body.recoveryEmail || '');
      if (nextEmail && !EMAIL_RE.test(nextEmail)) {
        return res.status(400).json({ error: 'Enter a valid email address (or leave empty to remove recovery email).' });
      }
      const saveRes = await setRecoveryRecord(cfg, uid, nextEmail);
      if (!saveRes.ok) return res.status(saveRes.status || 500).json({ error: saveRes.error });

      const pr = await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(uid)}&select=username,email&limit=1`);
      const prof = Array.isArray(pr.data) && pr.data[0] ? pr.data[0] : {};
      const fallbackEmail = prof.username ? internalAuthEmail(prof.username) : (prof.email || session.user.email);
      const authTargetEmail = nextEmail || fallbackEmail;
      if (authTargetEmail) {
        await sbFetch(cfg, `/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
          method: 'PUT',
          body: { email: authTargetEmail, email_confirm: true }
        }).catch(() => null);
      }
      return res.status(200).json({
        ok: true,
        recoveryEmail: nextEmail || null,
        hasRecoveryEmail: Boolean(nextEmail),
        maskedEmail: nextEmail ? maskEmail(nextEmail) : null
      });
    }

    if (act === 'changePassword') {
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (!currentPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Provide current password and a new password of at least 6 characters.' });
      }
      const checkAuth = await sbFetch(cfg, '/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: { email: session.user.email, password: currentPassword },
        usePub: Boolean(cfg.publishableKey)
      });
      if (!checkAuth.ok) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
      const upd = await sbFetch(cfg, `/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
        method: 'PUT',
        body: { password: newPassword }
      });
      if (!upd.ok) return res.status(upd.status || 400).json({ error: upd.data?.msg || 'Failed to update password.' });
      return res.status(200).json({ ok: true });
    }

    if (act === 'createSelfResetLink') {
      const rec = await getRecoveryRecord(cfg, uid);
      const fallbackEmail = rec?.recovery_email || (!String(session.user.email || '').endsWith(`@${INTERNAL_EMAIL_DOMAIN}`) ? session.user.email : null);
      if (!fallbackEmail) {
        return res.status(400).json({ error: 'Save an optional recovery email first before generating a reset link.' });
      }
      const tok = await createResetTokenRecord(cfg, uid, fallbackEmail, req);
      if (!tok.ok) return res.status(tok.status || 500).json({ error: tok.error });

      let delivery = { delivered: false, provider: null };
      if (body.sendEmail !== false) {
        delivery = await dispatchResetEmail(cfg, {
          recoveryEmail: fallbackEmail,
          username: session.user.user_metadata?.username || null,
          resetUrl: tok.resetUrl,
          appOrigin: tok.appOrigin,
          userId: uid
        });
      }
      return res.status(200).json({
        ok: true,
        resetUrl: tok.resetUrl,
        recoveryEmail: fallbackEmail,
        maskedEmail: maskEmail(fallbackEmail),
        delivered: delivery.delivered,
        provider: delivery.provider || null,
        expiresInMinutes: 15
      });
    }

    if (act === 'createChat') {
      const memberIds = Array.isArray(body.memberIds) ? [...new Set(body.memberIds.filter(x => x && x !== uid))] : [];
      const isGroup = Boolean(body.isGroup || memberIds.length > 0);
      const peerId = isGroup ? null : (body.peerUserId || null);
      if (peerId && !isGroup) {
        const pairFilter = `or=(and(owner_id.eq.${uid},peer_user_id.eq.${peerId}),and(owner_id.eq.${peerId},peer_user_id.eq.${uid}))`;
        const existing = await sbFetch(cfg, `/rest/v1/wg_conversations?${pairFilter}&limit=1`);
        if (existing.ok && Array.isArray(existing.data) && existing.data[0]) {
          return res.status(200).json({ ok: true, id: existing.data[0].id, existing: true });
        }
      }
      const id = String(body.id || `c_${Date.now().toString(36)}`);
      const nowMs = Date.now();
      const convRow = { id, owner_id: uid, peer_user_id: peerId, name: String(body.name || 'New Contact').slice(0, 80), folder: body.folder === 'work' ? 'work' : 'personal', status: isGroup ? `${memberIds.length + 1} members` : 'Online', owner_read_ms: nowMs };
      if (isGroup) convRow.is_group = true;
      const r = await sbFetch(cfg, '/rest/v1/wg_conversations', {
        method: 'POST',
        prefer: 'return=minimal',
        body: [convRow]
      });
      if (!r.ok) return res.status(r.status).json({ error: r.data?.message || 'Failed to create conversation' });
      if (isGroup) {
        const memRows = [{ conversation_id: id, user_id: uid, role: 'owner', last_read_ms: nowMs }, ...memberIds.map(mid => ({ conversation_id: id, user_id: mid, role: 'member', last_read_ms: 0 }))];
        await sbFetch(cfg, '/rest/v1/wg_conversation_members?on_conflict=conversation_id,user_id', {
          method: 'POST',
          prefer: 'resolution=ignore-duplicates,return=minimal',
          body: memRows
        });
      }
      if (body.sysMsg) {
        await sbFetch(cfg, '/rest/v1/wg_messages', {
          method: 'POST',
          prefer: 'return=minimal',
          body: [{ id: body.sysMsg.id, conversation_id: id, sender_id: uid, sender_role: 'sys', msg_type: 'sys', body: body.sysMsg.text, created_ms: nowMs, time_label: body.sysMsg.t }]
        });
      }
      return res.status(200).json({ ok: true, id, isGroup });
    }

    if (act === 'addGroupMembers') {
      const conv = await assertConvAccess(cfg, body.conversationId, uid);
      if (!conv) return res.status(conv === false ? 403 : 404).json({ error: 'Conversation inaccessible' });
      if (!conv.is_group) return res.status(400).json({ error: 'Not a group conversation' });
      const ids = Array.isArray(body.memberIds) ? [...new Set(body.memberIds.filter(Boolean))] : [];
      if (!ids.length) return res.status(400).json({ error: 'memberIds required' });
      await sbFetch(cfg, '/rest/v1/wg_conversation_members?on_conflict=conversation_id,user_id', {
        method: 'POST',
        prefer: 'resolution=ignore-duplicates,return=minimal',
        body: ids.map(mid => ({ conversation_id: body.conversationId, user_id: mid, role: 'member', last_read_ms: 0 }))
      });
      return res.status(200).json({ ok: true });
    }

    if (act === 'leaveGroup') {
      const conv = await assertConvAccess(cfg, body.conversationId, uid);
      if (!conv) return res.status(conv === false ? 403 : 404).json({ error: 'Conversation inaccessible' });
      if (!conv.is_group) return res.status(400).json({ error: 'Not a group conversation' });
      await sbFetch(cfg, `/rest/v1/wg_conversation_members?conversation_id=eq.${encodeURIComponent(body.conversationId)}&user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }

    if (act === 'updateChat') {
      const conv = await assertConvAccess(cfg, body.id, uid);
      if (conv === null) return res.status(404).json({ error: 'Conversation not found' });
      if (conv === false) return res.status(403).json({ error: 'Forbidden' });
      const patch = {};
      if (body.folder) patch.folder = body.folder === 'work' ? 'work' : 'personal';
      if ('pin' in body) patch.pin_msg_id = body.pin || null;
      if ('unread' in body) patch.unread = Number(body.unread) || 0;
      await sbFetch(cfg, `/rest/v1/wg_conversations?id=eq.${encodeURIComponent(body.id)}`, { method: 'PATCH', body: patch });
      return res.status(200).json({ ok: true });
    }

    if (act === 'clearChat' || act === 'deleteChat') {
      const conv = await assertConvAccess(cfg, body.id, uid);
      if (conv === null) return res.status(404).json({ error: 'Conversation not found' });
      if (conv === false) return res.status(403).json({ error: 'Forbidden' });
      const mr = await sbFetch(cfg, `/rest/v1/wg_messages?conversation_id=eq.${encodeURIComponent(body.id)}&media_path=not.is.null&select=media_path`);
      const paths = Array.isArray(mr.data) ? mr.data.map(x => x.media_path).filter(Boolean) : [];
      if (paths.length) await deleteMediaObjects(cfg, paths);
      if (act === 'clearChat') {
        await sbFetch(cfg, `/rest/v1/wg_messages?conversation_id=eq.${encodeURIComponent(body.id)}`, { method: 'DELETE' });
        await sbFetch(cfg, `/rest/v1/wg_conversations?id=eq.${encodeURIComponent(body.id)}`, { method: 'PATCH', body: { pin_msg_id: null } });
      } else {
        await sbFetch(cfg, `/rest/v1/wg_conversations?id=eq.${encodeURIComponent(body.id)}`, { method: 'DELETE' });
      }
      return res.status(200).json({ ok: true });
    }

    if (act === 'sendMessage') {
      const conv = await assertConvAccess(cfg, body.conversationId, uid);
      if (!conv) return res.status(conv === false ? 403 : 404).json({ error: 'Conversation inaccessible' });
      const m = body.message || {};
      const row = {
        id: String(m.id),
        conversation_id: body.conversationId,
        sender_id: m.from === 'them' ? null : uid,
        sender_name: m.fromName ? String(m.fromName).slice(0, 60) : undefined,
        sender_role: m.from === 'sys' ? 'sys' : (m.from === 'them' ? 'them' : 'me'),
        msg_type: m.type || 'text',
        body: String(m.text || ''),
        file_name: m.name || null,
        file_size: m.size || null,
        media_path: m.mediaPath || null,
        media_mime: m.mediaMime || null,
        ...(m.mediaEnc ? { media_enc: true } : {}),
        dur: m.dur || null,
        ct: m.ct || null,
        reply_preview: m.reply || null,
        react: m.react || {},
        ...(m.editedAt ? { edited_at: Number(m.editedAt) } : {}),
        exp_at: m.exp || null,
        created_ms: Number(m.ts) || Date.now(),
        time_label: String(m.t || '')
      };
      if (row.sender_name === undefined) delete row.sender_name;
      const r = await sbFetch(cfg, '/rest/v1/wg_messages', { method: 'POST', prefer: 'return=minimal', body: [row] });
      if (!r.ok) return res.status(r.status).json({ error: r.data?.message || 'Failed to save message' });
      await sbFetch(cfg, `/rest/v1/wg_conversations?id=eq.${encodeURIComponent(body.conversationId)}`, { method: 'PATCH', body: { updated_at: new Date().toISOString() } });
      return res.status(200).json({ ok: true });
    }

    if (act === 'editMessage') {
      const conv = await assertConvAccess(cfg, body.conversationId, uid);
      if (!conv) return res.status(conv === false ? 403 : 404).json({ error: 'Conversation inaccessible' });
      const mr = await sbFetch(cfg, `/rest/v1/wg_messages?id=eq.${encodeURIComponent(body.messageId)}&conversation_id=eq.${encodeURIComponent(body.conversationId)}&select=id,sender_id&limit=1`);
      const mRow = Array.isArray(mr.data) ? mr.data[0] : null;
      if (!mRow) return res.status(404).json({ error: 'Message not found' });
      if (mRow.sender_id && mRow.sender_id !== uid) return res.status(403).json({ error: 'Cannot edit peer message' });
      const editedAt = Number(body.editedAt) || Date.now();
      const patch = { body: String(body.text || ''), ct: body.ct || null, edited_at: editedAt };
      await sbFetch(cfg, `/rest/v1/wg_messages?id=eq.${encodeURIComponent(body.messageId)}`, { method: 'PATCH', body: patch });
      return res.status(200).json({ ok: true, editedAt });
    }

    if (act === 'reactMessage') {
      const conv = await assertConvAccess(cfg, body.conversationId, uid);
      if (!conv) return res.status(403).json({ error: 'Forbidden' });
      await sbFetch(cfg, `/rest/v1/wg_messages?id=eq.${encodeURIComponent(body.messageId)}`, { method: 'PATCH', body: { react: body.react || {} } });
      return res.status(200).json({ ok: true });
    }

    if (act === 'deleteMessage') {
      const conv = await assertConvAccess(cfg, body.conversationId, uid);
      if (!conv) return res.status(403).json({ error: 'Forbidden' });
      const mr = await sbFetch(cfg, `/rest/v1/wg_messages?id=eq.${encodeURIComponent(body.messageId)}&select=media_path&limit=1`);
      const mRow = Array.isArray(mr.data) ? mr.data[0] : null;
      if (mRow?.media_path) await deleteMediaObjects(cfg, [mRow.media_path]);
      await sbFetch(cfg, `/rest/v1/wg_messages?id=eq.${encodeURIComponent(body.messageId)}`, { method: 'DELETE' });
      if (conv.pin_msg_id === body.messageId) {
        await sbFetch(cfg, `/rest/v1/wg_conversations?id=eq.${encodeURIComponent(body.conversationId)}`, { method: 'PATCH', body: { pin_msg_id: null } });
      }
      return res.status(200).json({ ok: true });
    }

    if (act === 'publishPublicKey') {
      const pk = body.publicKey;
      const keyFp = String(body.keyFp || '').trim().slice(0, 64);
      if (!pk || pk.kty !== 'EC' || pk.crv !== 'P-256' || !pk.x || !pk.y || !keyFp) {
        return res.status(400).json({ error: 'Invalid ECDH P-256 JWK public key' });
      }
      const cleanPk = { kty: 'EC', crv: 'P-256', x: String(pk.x), y: String(pk.y), ext: true };
      const r = await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        body: { public_key: cleanPk, key_fp: keyFp }
      });
      if (!r.ok) return res.status(r.status).json({ error: r.data?.message || 'Failed to publish public key' });
      return res.status(200).json({ ok: true, keyFp });
    }

    if (act === 'markRead') {
      const conv = await assertConvAccess(cfg, body.conversationId, uid);
      if (conv === null) return res.status(404).json({ error: 'Conversation not found' });
      if (conv === false) return res.status(403).json({ error: 'Forbidden' });
      const reqMs = Math.max(0, Number(body.readMs) || Date.now());
      if (conv.is_group) {
        const curMs = Number(conv._member?.last_read_ms) || 0;
        const nextMs = Math.max(curMs, reqMs);
        await sbFetch(cfg, `/rest/v1/wg_conversation_members?conversation_id=eq.${encodeURIComponent(body.conversationId)}&user_id=eq.${encodeURIComponent(uid)}`, {
          method: 'PATCH',
          body: { last_read_ms: nextMs }
        });
        return res.status(200).json({ ok: true, readMs: nextMs });
      }
      const isOwner = conv.owner_id === uid;
      const curMs = Number(isOwner ? conv.owner_read_ms : conv.peer_read_ms) || 0;
      const nextMs = Math.max(curMs, reqMs);
      const patch = isOwner ? { owner_read_ms: nextMs, unread: 0 } : { peer_read_ms: nextMs };
      await sbFetch(cfg, `/rest/v1/wg_conversations?id=eq.${encodeURIComponent(body.conversationId)}`, { method: 'PATCH', body: patch });
      return res.status(200).json({ ok: true, readMs: nextMs });
    }

    if (act === 'signUpload') {
      const isSocial = ['story', 'reel', 'post', 'avatar', 'highlight'].includes(body.scope);
      if (!isSocial) {
        const conv = await assertConvAccess(cfg, body.conversationId, uid);
        if (!conv) return res.status(conv === false ? 403 : 404).json({ error: 'Conversation inaccessible' });
      }
      await ensureMediaBucket(cfg);
      const safeFolder = isSocial ? safeSeg(body.scope, 'social') : safeSeg(body.conversationId, 'conv');
      const safeMsg = safeSeg(body.msgId || body.itemId, `m_${Date.now().toString(36)}`);
      const safeFile = safeSeg(body.fileName, 'attachment.bin');
      const objectPath = `${uid}/${safeFolder}/${safeMsg}_${safeFile}`;
      const sr = await sbStorageFetch(cfg, `/object/upload/sign/wg-media/${encodeStoragePath(objectPath)}`, {
        method: 'POST',
        headers: { 'x-upsert': 'true' },
        body: {}
      });
      const rel = sr.data?.url || sr.data?.signedUrl || '';
      if (!sr.ok || !rel) return res.status(sr.status || 500).json({ error: sr.data?.message || 'Failed to create signed upload URL' });
      const uploadUrl = rel.startsWith('http') ? rel : `${cfg.url}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`;
      return res.status(200).json({ ok: true, uploadUrl, token: sr.data?.token || null, mediaPath: objectPath, mime: String(body.mime || 'application/octet-stream') });
    }

    if (act === 'uploadMedia') {
      const isSocial = ['story', 'reel', 'post', 'avatar', 'highlight'].includes(body.scope);
      if (!isSocial) {
        const conv = await assertConvAccess(cfg, body.conversationId, uid);
        if (!conv) return res.status(conv === false ? 403 : 404).json({ error: 'Conversation inaccessible' });
      }
      if (!body.dataBase64 || typeof body.dataBase64 !== 'string') return res.status(400).json({ error: 'dataBase64 required' });
      const buf = Buffer.from(body.dataBase64, 'base64');
      if (buf.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'File too large for proxy upload; use signed upload' });
      await ensureMediaBucket(cfg);
      const safeFolder = isSocial ? safeSeg(body.scope, 'social') : safeSeg(body.conversationId, 'conv');
      const safeMsg = safeSeg(body.msgId || body.itemId, `m_${Date.now().toString(36)}`);
      const safeFile = safeSeg(body.fileName, 'attachment.bin');
      const objectPath = `${uid}/${safeFolder}/${safeMsg}_${safeFile}`;
      const mime = String(body.mime || 'application/octet-stream');
      const ur = await sbStorageFetch(cfg, `/object/wg-media/${encodeStoragePath(objectPath)}`, {
        method: 'POST',
        headers: { 'Content-Type': mime, 'x-upsert': 'true' },
        rawBody: buf
      });
      if (!ur.ok) return res.status(ur.status || 500).json({ error: ur.data?.message || 'Storage upload failed' });
      return res.status(200).json({ ok: true, mediaPath: objectPath, mime });
    }

    if (act === 'createStory') {
      const s = body.story || {};
      const row = {
        id: String(s.id),
        user_id: uid,
        author_name: String(s.name || 'You'),
        bg: String(s.bg),
        question: String(s.q),
        ...(s.mediaPath ? { media_path: s.mediaPath, media_mime: s.mediaMime || null } : {}),
        yes_count: Number(s.yes || 1),
        no_count: Number(s.no || 0),
        link: String(s.link || ''),
        co_author: String(s.co || '')
      };
      const r = await sbFetch(cfg, '/rest/v1/wg_stories', { method: 'POST', prefer: 'return=minimal', body: [row] });
      return res.status(r.ok ? 200 : r.status).json({ ok: r.ok });
    }

    if (act === 'createReel') {
      const rl = body.reel || {};
      const reelId = rl.id != null ? String(rl.id) : String(10000 + Math.floor(Math.random() * 1800000000));
      const row = {
        id: reelId,
        user_id: uid,
        author_name: String(rl.author || 'You').slice(0, 60),
        caption: String(rl.cap || '').slice(0, 300),
        gradient: String(rl.g || 'linear-gradient(160deg,#1e3a8a,#0b1020)'),
        media_path: rl.mediaPath || null,
        media_mime: rl.mediaMime || null,
        filter_idx: Number(rl.filterIdx || 0),
        likes_count: Number(rl.likes || 1)
      };
      const r = await sbFetch(cfg, '/rest/v1/wg_reels', { method: 'POST', prefer: 'return=minimal', body: [row] });
      return res.status(r.ok ? 200 : r.status).json({ ok: r.ok, id: /^\d+$/.test(reelId) ? Number(reelId) : reelId });
    }

    if (act === 'voteStory') {
      const choice = body.choice === 'no' ? 'no' : 'yes';
      const voteRes = await sbFetch(cfg, '/rest/v1/wg_story_votes', {
        method: 'POST',
        prefer: 'return=minimal',
        body: [{ story_id: String(body.storyId), user_id: uid, choice }]
      });
      if (voteRes.ok) {
        const curStory = await sbFetch(cfg, `/rest/v1/wg_stories?id=eq.${encodeURIComponent(body.storyId)}&select=yes_count,no_count`);
        const row = Array.isArray(curStory.data) ? curStory.data[0] : null;
        if (row) {
          const patch = choice === 'yes' ? { yes_count: (row.yes_count || 0) + 1 } : { no_count: (row.no_count || 0) + 1 };
          await sbFetch(cfg, `/rest/v1/wg_stories?id=eq.${encodeURIComponent(body.storyId)}`, { method: 'PATCH', body: patch });
        }
      }
      return res.status(200).json({ ok: true });
    }

    if (act === 'saveReelsPrefs') {
      const p = body.reels || {};
      await sbFetch(cfg, '/rest/v1/wg_reels_prefs?on_conflict=user_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: [{ user_id: uid, liked: p.liked || [], saved: p.saved || [], follow: p.follow || [], filter_idx: Number(p.filter || 0), updated_at: new Date().toISOString() }]
      });
      return res.status(200).json({ ok: true });
    }

    if (act === 'addReelComment') {
      const reelIdNum = Number(body.reelId);
      if (!Number.isFinite(reelIdNum)) return res.status(400).json({ error: 'Numeric reelId required' });
      await sbFetch(cfg, '/rest/v1/wg_reel_comments', {
        method: 'POST',
        prefer: 'return=minimal',
        body: [{ id: String(body.id || `rc_${Date.now().toString(36)}`), reel_id: reelIdNum, user_id: uid, author_name: String(body.authorName || 'You'), body: String(body.text || '') }]
      });
      return res.status(200).json({ ok: true });
    }

    if (act === 'saveSettings') {
      await sbFetch(cfg, '/rest/v1/wg_settings?on_conflict=user_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: [{ user_id: uid, cfg: body.cfg || {}, updated_at: new Date().toISOString() }]
      });
      return res.status(200).json({ ok: true });
    }

    if (act === 'logAudit') {
      await sbFetch(cfg, '/rest/v1/wg_audit_logs', {
        method: 'POST',
        prefer: 'return=minimal',
        body: [{ user_id: uid, event_time: String(body.t || ''), message: String(body.m || '') }]
      });
      return res.status(200).json({ ok: true });
    }

    if (act === 'updateProfile') {
      const displayName = String(body.displayName || '').trim().slice(0, 60);
      if (body.displayName !== undefined && !displayName) {
        return res.status(400).json({ error: 'Display name cannot be empty' });
      }
      const contactEmail = normalizeEmail(body.contactEmail || '');
      if (contactEmail && !EMAIL_RE.test(contactEmail)) {
        return res.status(400).json({ error: 'Invalid public contact email address' });
      }
      const patch = {};
      if (displayName) patch.display_name = displayName;
      if (body.status !== undefined) patch.status = String(body.status || 'Online').trim().slice(0, 60) || 'Online';
      if (body.bio !== undefined) patch.bio = String(body.bio || '').slice(0, 300);
      if (body.category !== undefined) patch.category = String(body.category || '').trim().slice(0, 60);
      if (body.website !== undefined) patch.website = sanitizeSafeUrl(body.website);
      if (body.links !== undefined) patch.links = normalizeLinks(body.links);
      if (body.contactEmail !== undefined) patch.contact_email = contactEmail;
      if (body.locationText !== undefined) patch.location_text = String(body.locationText || '').trim().slice(0, 120);
      if (body.threadsHandle !== undefined) patch.threads_handle = normalizeUsername(body.threadsHandle).slice(0, 32);
      if (body.avatarPath !== undefined) {
        const ap = String(body.avatarPath || '').trim();
        if (ap && (!ap.startsWith(`${uid}/`) || ap.includes('..'))) {
          return res.status(403).json({ error: 'Invalid avatar storage path' });
        }
        patch.avatar_path = ap;
      }
      const r = await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: patch
      });
      if (!r.ok) {
        const msg = isMissingRelationErr(r)
          ? 'Profile columns missing. Re-run updated supabase/schema.sql in Supabase SQL Editor.'
          : (r.data?.message || 'Failed to update profile');
        return res.status(r.status || 500).json({ error: msg });
      }
      const row = Array.isArray(r.data) ? r.data[0] : null;
      const avSigned = row?.avatar_path ? await signDownloadUrl(cfg, row.avatar_path).catch(() => null) : null;
      return res.status(200).json({ ok: true, profile: mapPublicProfile(row, avSigned?.ok ? avSigned.url : null) });
    }

    if (act === 'toggleFollow') {
      const targetId = String(body.targetUserId || '').trim();
      if (!targetId) return res.status(400).json({ error: 'targetUserId required' });
      if (targetId === uid) return res.status(400).json({ error: 'You cannot follow your own account' });
      const chk = await sbFetch(cfg, `/rest/v1/wg_follows?follower_id=eq.${encodeURIComponent(uid)}&following_id=eq.${encodeURIComponent(targetId)}&select=follower_id`);
      if (!chk.ok) {
        return res.status(chk.status || 500).json({ error: isMissingRelationErr(chk) ? 'Follows table missing. Re-run updated supabase/schema.sql in Supabase SQL Editor.' : (chk.data?.message || 'Follow lookup failed') });
      }
      const exists = Array.isArray(chk.data) && chk.data.length > 0;
      if (exists) {
        const dr = await sbFetch(cfg, `/rest/v1/wg_follows?follower_id=eq.${encodeURIComponent(uid)}&following_id=eq.${encodeURIComponent(targetId)}`, { method: 'DELETE' });
        if (!dr.ok) return res.status(dr.status || 500).json({ error: 'Unfollow failed' });
        return res.status(200).json({ ok: true, following: false });
      }
      const ir = await sbFetch(cfg, '/rest/v1/wg_follows', {
        method: 'POST',
        prefer: 'return=minimal',
        body: [{ follower_id: uid, following_id: targetId }]
      });
      if (!ir.ok) return res.status(ir.status || 500).json({ error: ir.data?.message || 'Follow failed' });
      return res.status(200).json({ ok: true, following: true });
    }

    if (act === 'createPost') {
      const p = body.post || body || {};
      const caption = String(p.caption || '').slice(0, 1200);
      const rawPaths = Array.isArray(p.mediaPaths) ? p.mediaPaths : [];
      const mediaPaths = [];
      for (const mp of rawPaths) {
        const clean = String(mp || '').trim();
        if (!clean) continue;
        if (!clean.startsWith(`${uid}/`) || clean.includes('..')) {
          return res.status(403).json({ error: 'Invalid post media path' });
        }
        mediaPaths.push(clean);
        if (mediaPaths.length >= 6) break;
      }
      if (!caption.trim() && !mediaPaths.length) {
        return res.status(400).json({ error: 'Add a caption or at least one image/video' });
      }
      const pinned = Boolean(p.pinned);
      if (pinned) {
        const pinChk = await sbFetch(cfg, `/rest/v1/wg_posts?user_id=eq.${encodeURIComponent(uid)}&pinned=eq.true&select=id`);
        if (pinChk.ok && Array.isArray(pinChk.data) && pinChk.data.length >= 3) {
          return res.status(400).json({ error: 'Maximum 3 pinned posts allowed on profile grid' });
        }
      }
      const allowedTypes = new Set(['image', 'video', 'carousel', 'card']);
      const derivedType = mediaPaths.length > 1 ? 'carousel' : (mediaPaths.length === 1 ? 'image' : 'card');
      const mediaType = allowedTypes.has(p.mediaType) ? p.mediaType : derivedType;
      const postId = String(p.id || `pt_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`);
      const row = {
        id: postId,
        user_id: uid,
        caption,
        location_text: String(p.locationText || '').trim().slice(0, 120),
        tags: normalizePostTags(p.tags, caption),
        media_type: mediaType,
        media_paths: mediaPaths,
        bg: String(p.bg || 'from-indigo-600 via-fuchsia-600 to-rose-500').slice(0, 120),
        pinned,
        pinned_at: pinned ? new Date().toISOString() : null
      };
      const ir = await sbFetch(cfg, '/rest/v1/wg_posts', { method: 'POST', prefer: 'return=representation', body: [row] });
      if (!ir.ok) {
        return res.status(ir.status || 500).json({ error: isMissingRelationErr(ir) ? 'Posts table missing. Re-run updated supabase/schema.sql in Supabase SQL Editor.' : (ir.data?.message || 'Failed to publish post') });
      }
      const created = Array.isArray(ir.data) ? ir.data[0] : row;
      return res.status(200).json({ ok: true, id: postId, post: created });
    }

    if (act === 'togglePinPost') {
      const postId = String(body.postId || '').trim();
      if (!postId) return res.status(400).json({ error: 'postId required' });
      const pr = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}&select=id,user_id,pinned&limit=1`);
      const post = Array.isArray(pr.data) ? pr.data[0] : null;
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (post.user_id !== uid) return res.status(403).json({ error: 'Only the author can pin this post' });
      const nextPinned = !post.pinned;
      if (nextPinned) {
        const pinChk = await sbFetch(cfg, `/rest/v1/wg_posts?user_id=eq.${encodeURIComponent(uid)}&pinned=eq.true&select=id`);
        if (pinChk.ok && Array.isArray(pinChk.data) && pinChk.data.length >= 3) {
          return res.status(400).json({ error: 'Maximum 3 pinned posts allowed' });
        }
      }
      const up = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}`, {
        method: 'PATCH',
        body: { pinned: nextPinned, pinned_at: nextPinned ? new Date().toISOString() : null }
      });
      if (!up.ok) return res.status(up.status || 500).json({ error: 'Failed to update pin state' });
      return res.status(200).json({ ok: true, pinned: nextPinned });
    }

    if (act === 'deletePost') {
      const postId = String(body.postId || '').trim();
      if (!postId) return res.status(400).json({ error: 'postId required' });
      const pr = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}&select=id,user_id,media_paths&limit=1`);
      const post = Array.isArray(pr.data) ? pr.data[0] : null;
      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (post.user_id !== uid) return res.status(403).json({ error: 'Only the author can delete this post' });
      if (Array.isArray(post.media_paths) && post.media_paths.length) {
        await deleteMediaObjects(cfg, post.media_paths);
      }
      const dr = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}`, { method: 'DELETE' });
      if (!dr.ok) return res.status(dr.status || 500).json({ error: 'Delete failed' });
      return res.status(200).json({ ok: true });
    }

    if (act === 'togglePostLike') {
      const postId = String(body.postId || '').trim();
      if (!postId) return res.status(400).json({ error: 'postId required' });
      const chk = await sbFetch(cfg, `/rest/v1/wg_post_likes?post_id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(uid)}&select=post_id`);
      if (!chk.ok) return res.status(chk.status || 500).json({ error: chk.data?.message || 'Like check failed' });
      const exists = Array.isArray(chk.data) && chk.data.length > 0;
      if (exists) {
        await sbFetch(cfg, `/rest/v1/wg_post_likes?post_id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' });
      } else {
        await sbFetch(cfg, '/rest/v1/wg_post_likes', { method: 'POST', prefer: 'return=minimal', body: [{ post_id: postId, user_id: uid }] });
      }
      const cntRes = await sbFetch(cfg, `/rest/v1/wg_post_likes?post_id=eq.${encodeURIComponent(postId)}&select=user_id`);
      const count = Array.isArray(cntRes.data) ? cntRes.data.length : 0;
      return res.status(200).json({ ok: true, liked: !exists, count });
    }

    if (act === 'togglePostSave') {
      const postId = String(body.postId || '').trim();
      const kind = body.kind === 'repost' ? 'repost' : 'save';
      if (!postId) return res.status(400).json({ error: 'postId required' });
      const chk = await sbFetch(cfg, `/rest/v1/wg_post_saves?post_id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(uid)}&kind=eq.${kind}&select=post_id`);
      if (!chk.ok) return res.status(chk.status || 500).json({ error: chk.data?.message || 'Action failed' });
      const exists = Array.isArray(chk.data) && chk.data.length > 0;
      if (exists) {
        await sbFetch(cfg, `/rest/v1/wg_post_saves?post_id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(uid)}&kind=eq.${kind}`, { method: 'DELETE' });
      } else {
        await sbFetch(cfg, '/rest/v1/wg_post_saves', { method: 'POST', prefer: 'return=minimal', body: [{ post_id: postId, user_id: uid, kind }] });
      }
      return res.status(200).json({ ok: true, active: !exists, kind });
    }

    if (act === 'addPostComment') {
      const postId = String(body.postId || '').trim();
      const text = String(body.text || '').trim().slice(0, 500);
      if (!postId || !text) return res.status(400).json({ error: 'postId and comment text required' });
      const pRes = await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(uid)}&select=username,display_name,avatar_path&limit=1`);
      const pRow = Array.isArray(pRes.data) ? pRes.data[0] : null;
      const authorName = String(body.authorName || pRow?.display_name || pRow?.username || 'You').slice(0, 60);
      const id = String(body.id || `pc_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`);
      const ir = await sbFetch(cfg, '/rest/v1/wg_post_comments', {
        method: 'POST',
        prefer: 'return=representation',
        body: [{ id, post_id: postId, user_id: uid, author_name: authorName, text }]
      });
      if (!ir.ok) return res.status(ir.status || 500).json({ error: ir.data?.message || 'Comment failed' });
      const row = Array.isArray(ir.data) ? ir.data[0] : { id, post_id: postId, user_id: uid, author_name: authorName, text, created_at: new Date().toISOString() };
      const avSigned = pRow?.avatar_path ? await signDownloadUrl(cfg, pRow.avatar_path).catch(() => null) : null;
      return res.status(200).json({
        ok: true,
        comment: {
          id: row.id,
          postId: row.post_id,
          userId: row.user_id,
          authorName,
          authorUsername: pRow?.username || null,
          authorAvatarUrl: avSigned?.ok ? avSigned.url : null,
          text: row.text,
          createdAt: row.created_at
        }
      });
    }

    if (act === 'deletePostComment') {
      const commentId = String(body.commentId || '').trim();
      if (!commentId) return res.status(400).json({ error: 'commentId required' });
      const cmRes = await sbFetch(cfg, `/rest/v1/wg_post_comments?id=eq.${encodeURIComponent(commentId)}&select=id,user_id&limit=1`);
      const cm = Array.isArray(cmRes.data) ? cmRes.data[0] : null;
      if (!cm) return res.status(404).json({ error: 'Comment not found' });
      if (cm.user_id !== uid) return res.status(403).json({ error: 'Only the author can delete this comment' });
      await sbFetch(cfg, `/rest/v1/wg_post_comments?id=eq.${encodeURIComponent(commentId)}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }

    if (act === 'createHighlight') {
      const h = body.highlight || body || {};
      const title = String(h.title || '').trim().slice(0, 36);
      if (!title) return res.status(400).json({ error: 'Highlight title required' });
      const coverPath = h.coverPath && String(h.coverPath).startsWith(`${uid}/`) && !String(h.coverPath).includes('..') ? String(h.coverPath) : '';
      const slides = Array.isArray(h.slides) ? h.slides.slice(0, 8).map(s => ({
        title: String(s?.title || title).slice(0, 80),
        text: String(s?.text || '').slice(0, 260),
        bg: String(s?.bg || h.coverBg || 'from-amber-400 via-rose-500 to-fuchsia-600').slice(0, 120),
        mediaPath: s?.mediaPath && String(s.mediaPath).startsWith(`${uid}/`) && !String(s.mediaPath).includes('..') ? String(s.mediaPath) : ''
      })) : [];
      const id = String(h.id || `hl_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`);
      const ir = await sbFetch(cfg, '/rest/v1/wg_highlights', {
        method: 'POST',
        prefer: 'return=representation',
        body: [{ id, user_id: uid, title, cover_bg: String(h.coverBg || 'from-amber-400 via-rose-500 to-fuchsia-600').slice(0, 120), cover_path: coverPath, slides }]
      });
      if (!ir.ok) {
        return res.status(ir.status || 500).json({ error: isMissingRelationErr(ir) ? 'Highlights table missing. Re-run updated supabase/schema.sql in Supabase SQL Editor.' : (ir.data?.message || 'Failed to create highlight') });
      }
      return res.status(200).json({ ok: true, id });
    }

    if (act === 'deleteHighlight') {
      const id = String(body.highlightId || '').trim();
      if (!id) return res.status(400).json({ error: 'highlightId required' });
      const hr = await sbFetch(cfg, `/rest/v1/wg_highlights?id=eq.${encodeURIComponent(id)}&select=id,user_id,cover_path&limit=1`);
      const hl = Array.isArray(hr.data) ? hr.data[0] : null;
      if (!hl) return res.status(404).json({ error: 'Highlight not found' });
      if (hl.user_id !== uid) return res.status(403).json({ error: 'Forbidden' });
      if (hl.cover_path) await deleteMediaObjects(cfg, [hl.cover_path]);
      await sbFetch(cfg, `/rest/v1/wg_highlights?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }

    if (act === 'clearAudit') {
      await sbFetch(cfg, `/rest/v1/wg_audit_logs?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }

    if (act === 'purgeEnclave') {
      const [mr, pr, hr] = await Promise.all([
        sbFetch(cfg, `/rest/v1/wg_messages?sender_id=eq.${encodeURIComponent(uid)}&media_path=not.is.null&select=media_path`),
        sbFetch(cfg, `/rest/v1/wg_posts?user_id=eq.${encodeURIComponent(uid)}&select=media_paths`),
        sbFetch(cfg, `/rest/v1/wg_highlights?user_id=eq.${encodeURIComponent(uid)}&select=cover_path`)
      ]);
      const msgPaths = Array.isArray(mr.data) ? mr.data.map(x => x.media_path).filter(Boolean) : [];
      const postPaths = Array.isArray(pr.data) ? pr.data.flatMap(x => Array.isArray(x.media_paths) ? x.media_paths : []).filter(Boolean) : [];
      const hlPaths = Array.isArray(hr.data) ? hr.data.map(x => x.cover_path).filter(Boolean) : [];
      const paths = [...msgPaths, ...postPaths, ...hlPaths];
      if (paths.length) await deleteMediaObjects(cfg, paths);
      await Promise.all([
        sbFetch(cfg, `/rest/v1/wg_conversations?owner_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }),
        sbFetch(cfg, `/rest/v1/wg_settings?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }),
        sbFetch(cfg, `/rest/v1/wg_reels_prefs?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }),
        sbFetch(cfg, `/rest/v1/wg_audit_logs?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }),
        sbFetch(cfg, `/rest/v1/wg_posts?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }),
        sbFetch(cfg, `/rest/v1/wg_highlights?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }),
        sbFetch(cfg, `/rest/v1/wg_follows?or=(follower_id.eq.${encodeURIComponent(uid)},following_id.eq.${encodeURIComponent(uid)})`, { method: 'DELETE' })
      ]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown POST action' });
  } catch (err) {
    return res.status(502).json({ error: err?.message || 'Supabase proxy error' });
  }
};
