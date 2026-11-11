function getConfig() {
  const rawUrl = (process.env.SUPABASE_URL || '').trim();
  const url = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const secretKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
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

async function ensureProfile(cfg, user, displayName) {
  const name = (displayName || user.user_metadata?.display_name || user.email?.split('@')[0] || 'User').trim().slice(0, 60);
  await sbFetch(cfg, '/rest/v1/wg_profiles?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{ id: user.id, email: user.email, display_name: name, status: 'Online' }]
  });
  return { id: user.id, email: user.email, display_name: name };
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

async function handleBootstrap(cfg, user, accessToken) {
  const uid = encodeURIComponent(user.id);
  const nowMs = Date.now();

  const [profilesRes, convRes, myMemRes, storiesRes, votesRes, customReelsRes, prefsRes, commentsRes, settingsRes, auditRes] = await Promise.all([
    sbFetch(cfg, '/rest/v1/wg_profiles?select=id,email,display_name,status,public_key,key_fp&order=display_name.asc'),
    sbFetch(cfg, `/rest/v1/wg_conversations?or=(owner_id.eq.${uid},peer_user_id.eq.${uid})&order=updated_at.desc`),
    sbFetch(cfg, `/rest/v1/wg_conversation_members?user_id=eq.${uid}&select=conversation_id,role,last_read_ms`),
    sbFetch(cfg, '/rest/v1/wg_stories?order=created_at.asc&limit=30'),
    sbFetch(cfg, `/rest/v1/wg_story_votes?user_id=eq.${uid}&select=story_id`),
    sbFetch(cfg, '/rest/v1/wg_reels?order=created_at.desc&limit=30'),
    sbFetch(cfg, `/rest/v1/wg_reels_prefs?user_id=eq.${uid}&limit=1`),
    sbFetch(cfg, '/rest/v1/wg_reel_comments?order=created_at.asc&limit=200'),
    sbFetch(cfg, `/rest/v1/wg_settings?user_id=eq.${uid}&limit=1`),
    sbFetch(cfg, `/rest/v1/wg_audit_logs?user_id=eq.${uid}&order=id.desc&limit=40`)
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

  return {
    ok: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        displayName: profileMap.get(user.id)?.display_name || user.user_metadata?.display_name || user.email,
        publicKey: profileMap.get(user.id)?.public_key || null,
        keyFp: profileMap.get(user.id)?.key_fp || null
      },
      users: profiles.filter(p => p.id !== user.id),
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
    return res.status(200).json({
      ok: true,
      configured: Boolean(cfg.url && cfg.secretKey),
      hasRealtime: Boolean(cfg.url && cfg.publishableKey)
    });
  }

  if (!cfg.url || !cfg.secretKey) {
    return res.status(503).json({ error: 'SUPABASE_URL and SUPABASE_SECRET_KEY are not configured.' });
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
        const r = await sbFetch(cfg, `/rest/v1/wg_profiles?id=neq.${encodeURIComponent(session.user.id)}&select=id,email,display_name,status,public_key,key_fp&order=display_name.asc`);
        return res.status(r.ok ? 200 : r.status).json({ users: Array.isArray(r.data) ? r.data : [] });
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
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const displayName = String(body.displayName || email.split('@')[0] || 'User').trim().slice(0, 60);
      if (!email || password.length < 6) {
        return res.status(400).json({ error: 'Provide a valid email and a password of at least 6 characters.' });
      }

      if (act === 'signup') {
        const created = await sbFetch(cfg, '/auth/v1/admin/users', {
          method: 'POST',
          body: { email, password, email_confirm: true, user_metadata: { display_name: displayName } }
        });
        if (!created.ok) {
          const msg = created.data?.msg || created.data?.message || 'Unable to create account (email may already exist).';
          return res.status(created.status || 400).json({ error: msg });
        }
      }

      const auth = await sbFetch(cfg, '/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: { email, password },
        usePub: Boolean(cfg.publishableKey)
      });
      if (!auth.ok || !auth.data?.access_token || !auth.data?.user) {
        return res.status(401).json({ error: auth.data?.error_description || auth.data?.msg || 'Invalid email or password.' });
      }

      setSessionCookies(req, res, auth.data.access_token, auth.data.refresh_token || '');
      await ensureProfile(cfg, auth.data.user, act === 'signup' ? displayName : undefined);
      const seed = await seedStarterWorkspace(cfg, auth.data.user.id);
      if (!seed.ok) {
        return res.status(500).json({ error: 'Database schema missing. Run supabase/schema.sql in Supabase SQL Editor.' });
      }
      const boot = await handleBootstrap(cfg, auth.data.user, auth.data.access_token);
      if (!boot.ok) return res.status(boot.status || 500).json({ error: boot.error });
      return res.status(200).json({ authenticated: true, ...boot.data });
    }

    const session = await requireUser(cfg, req, res);
    if (!session) return res.status(401).json({ error: 'Authentication required' });
    const uid = session.user.id;

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
      const isSocial = body.scope === 'story' || body.scope === 'reel';
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
      const isSocial = body.scope === 'story' || body.scope === 'reel';
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

    if (act === 'clearAudit') {
      await sbFetch(cfg, `/rest/v1/wg_audit_logs?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }

    if (act === 'purgeEnclave') {
      const mr = await sbFetch(cfg, `/rest/v1/wg_messages?sender_id=eq.${encodeURIComponent(uid)}&media_path=not.is.null&select=media_path`);
      const paths = Array.isArray(mr.data) ? mr.data.map(x => x.media_path).filter(Boolean) : [];
      if (paths.length) await deleteMediaObjects(cfg, paths);
      await Promise.all([
        sbFetch(cfg, `/rest/v1/wg_conversations?owner_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }),
        sbFetch(cfg, `/rest/v1/wg_settings?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }),
        sbFetch(cfg, `/rest/v1/wg_reels_prefs?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }),
        sbFetch(cfg, `/rest/v1/wg_audit_logs?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' })
      ]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown POST action' });
  } catch (err) {
    return res.status(502).json({ error: err?.message || 'Supabase proxy error' });
  }
};
