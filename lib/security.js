const crypto = require('node:crypto');
const { sbFetch, assertConvAccess, isMissingRelationErr } = require('./sb');

const BASE32_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHA[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHA[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHA.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateTotpCode(secretBase32, timeStep) {
  const key = base32Decode(secretBase32);
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(timeStep / 0x100000000), 0);
  counter.writeUInt32BE(timeStep >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(bin % 1000000).padStart(6, '0');
}

function verifyTotpToken(secretBase32, code, windowSteps = 1) {
  const clean = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean) || !secretBase32) return false;
  const step = Math.floor(Date.now() / 30000);
  for (let delta = -windowSteps; delta <= windowSteps; delta++) {
    if (generateTotpCode(secretBase32, step + delta) === clean) return true;
  }
  return false;
}

async function handleSecurityGet(action, cfg, req, res, session) {
  const uid = session.user.id;
  const euid = encodeURIComponent(uid);

  if (action === 'sessionsList') {
    const r = await sbFetch(cfg, `/rest/v1/wg_sessions?user_id=eq.${euid}&revoked=eq.false&order=last_seen_at.desc&limit=20`).catch(() => ({ ok: false }));
    return res.status(200).json({ ok: true, sessions: r?.ok && Array.isArray(r.data) ? r.data : [] });
  }

  if (action === 'keyHistory') {
    const targetId = encodeURIComponent(String(req.query?.userId || uid));
    const [hist, devs] = await Promise.all([
      sbFetch(cfg, `/rest/v1/wg_key_history?user_id=eq.${targetId}&order=created_at.desc&limit=20`).catch(() => ({ ok: false })),
      sbFetch(cfg, `/rest/v1/wg_user_devices?user_id=eq.${targetId}&order=last_active_at.desc&limit=10`).catch(() => ({ ok: false }))
    ]);
    return res.status(200).json({
      ok: true,
      history: hist?.ok && Array.isArray(hist.data) ? hist.data : [],
      devices: devs?.ok && Array.isArray(devs.data) ? devs.data : []
    });
  }

  if (action === 'callHistory') {
    const r = await sbFetch(cfg, `/rest/v1/wg_calls?or=(caller_id.eq.${euid},callee_id.eq.${euid})&order=created_at.desc&limit=40`).catch(() => ({ ok: false }));
    return res.status(200).json({ ok: true, calls: r?.ok && Array.isArray(r.data) ? r.data : [] });
  }

  if (action === 'aiThreads') {
    const r = await sbFetch(cfg, `/rest/v1/wg_ai_threads?user_id=eq.${euid}&order=pinned.desc,updated_at.desc&limit=30`).catch(() => ({ ok: false }));
    return res.status(200).json({ ok: true, threads: r?.ok && Array.isArray(r.data) ? r.data : [] });
  }

  return null;
}

async function handleSecurityPost(act, cfg, req, res, session, body) {
  const uid = session.user.id;
  const euid = encodeURIComponent(uid);

  if (act === 'setupTotp') {
    const secret = base32Encode(crypto.randomBytes(20));
    const label = encodeURIComponent(`WhatsGram:${session.user.user_metadata?.username || session.user.email || uid}`);
    const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=WhatsGramOS`;
    await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${euid}`, { method: 'PATCH', body: { totp_secret: secret, totp_enabled: false } }).catch(() => null);
    return res.status(200).json({ ok: true, secret, otpauthUrl });
  }

  if (act === 'enableTotp') {
    const pr = await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${euid}&select=totp_secret&limit=1`);
    const secret = (Array.isArray(pr.data) && pr.data[0]?.totp_secret) || body.secret || '';
    if (!verifyTotpToken(secret, body.code)) {
      return res.status(400).json({ error: 'Invalid 6-digit authenticator code' });
    }
    await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${euid}`, { method: 'PATCH', body: { totp_secret: secret, totp_enabled: true } });
    return res.status(200).json({ ok: true, totpEnabled: true });
  }

  if (act === 'disableTotp') {
    await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${euid}`, { method: 'PATCH', body: { totp_enabled: false, totp_secret: null } });
    return res.status(200).json({ ok: true, totpEnabled: false });
  }

  if (act === 'revokeSession') {
    const sid = String(body.sessionId || '').trim();
    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    await sbFetch(cfg, `/rest/v1/wg_sessions?id=eq.${encodeURIComponent(sid)}&user_id=eq.${euid}`, { method: 'PATCH', body: { revoked: true } }).catch(() => null);
    return res.status(200).json({ ok: true });
  }

  if (act === 'registerDeviceKey') {
    const pk = body.publicKey;
    const keyFp = String(body.keyFp || '').trim().slice(0, 64);
    const deviceId = String(body.deviceId || `dev_${crypto.randomBytes(4).toString('hex')}`).slice(0, 64);
    const deviceName = String(body.deviceName || 'Web Browser').slice(0, 60);
    if (!pk || !keyFp) return res.status(400).json({ error: 'publicKey and keyFp required' });
    await Promise.all([
      sbFetch(cfg, '/rest/v1/wg_user_devices?on_conflict=id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: [{ id: deviceId, user_id: uid, device_name: deviceName, public_key: pk, key_fp: keyFp, last_active_at: new Date().toISOString() }]
      }).catch(() => null),
      sbFetch(cfg, '/rest/v1/wg_key_history', {
        method: 'POST',
        prefer: 'return=minimal',
        body: [{ user_id: uid, key_fp: keyFp, public_key: pk, reason: String(body.reason || 'rotation').slice(0, 40) }]
      }).catch(() => null)
    ]);
    return res.status(200).json({ ok: true, deviceId, keyFp });
  }

  if (act === 'scheduleAccountDeletion') {
    const cancel = Boolean(body.cancel);
    const deletedAt = cancel ? null : new Date().toISOString();
    const r = await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${euid}`, { method: 'PATCH', body: { deleted_at: deletedAt } });
    if (!r.ok && !isMissingRelationErr(r)) return res.status(r.status || 500).json({ error: 'Failed to update deletion status' });
    return res.status(200).json({ ok: true, deletedAt, graceDays: 30 });
  }

  if (act === 'savePrivacyPrefs') {
    const patch = {};
    if (typeof body.showOnline === 'boolean') patch.show_online = body.showOnline;
    if (typeof body.showTyping === 'boolean') patch.show_typing = body.showTyping;
    if (body.pushPrefs && typeof body.pushPrefs === 'object') patch.push_prefs = body.pushPrefs;
    if (Array.isArray(body.hiddenWords)) patch.hidden_words = body.hiddenWords.map(w => String(w || '').trim().toLowerCase()).filter(Boolean).slice(0, 60);
    await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${euid}`, { method: 'PATCH', body: patch }).catch(() => null);
    return res.status(200).json({ ok: true, ...patch });
  }

  if (act === 'logCallEvent') {
    const convId = String(body.conversationId || '').trim();
    if (!convId) return res.status(400).json({ error: 'conversationId required' });
    const id = `call_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    const row = {
      id,
      conversation_id: convId,
      caller_id: uid,
      callee_id: body.calleeId || null,
      kind: ['voice', 'video', 'group'].includes(body.kind) ? body.kind : 'voice',
      status: ['ringing', 'connected', 'missed', 'declined', 'ended'].includes(body.status) ? body.status : 'ended',
      duration_sec: Math.max(0, Math.floor(Number(body.durationSec) || 0))
    };
    await sbFetch(cfg, '/rest/v1/wg_calls', { method: 'POST', prefer: 'return=minimal', body: [row] }).catch(() => null);
    return res.status(200).json({ ok: true, call: row });
  }

  if (act === 'reactMessageRow') {
    const conv = await assertConvAccess(cfg, body.conversationId, uid);
    if (!conv) return res.status(403).json({ error: 'Forbidden' });
    const messageId = String(body.messageId || '').trim();
    const emoji = String(body.emoji || '').trim().slice(0, 12);
    if (!messageId || !emoji) return res.status(400).json({ error: 'messageId and emoji required' });
    const chk = await sbFetch(cfg, `/rest/v1/wg_message_reactions?message_id=eq.${encodeURIComponent(messageId)}&user_id=eq.${euid}&emoji=eq.${encodeURIComponent(emoji)}&select=emoji`).catch(() => ({ ok: false }));
    const exists = chk.ok && Array.isArray(chk.data) && chk.data.length > 0;
    if (exists) {
      await sbFetch(cfg, `/rest/v1/wg_message_reactions?message_id=eq.${encodeURIComponent(messageId)}&user_id=eq.${euid}&emoji=eq.${encodeURIComponent(emoji)}`, { method: 'DELETE' }).catch(() => null);
    } else {
      await sbFetch(cfg, '/rest/v1/wg_message_reactions', { method: 'POST', prefer: 'return=minimal', body: [{ message_id: messageId, user_id: uid, emoji }] }).catch(() => null);
    }
    const allR = await sbFetch(cfg, `/rest/v1/wg_message_reactions?message_id=eq.${encodeURIComponent(messageId)}&select=emoji`).catch(() => ({ ok: false }));
    const react = {};
    if (allR.ok && Array.isArray(allR.data)) {
      for (const row of allR.data) react[row.emoji] = (react[row.emoji] || 0) + 1;
    } else if (body.react && typeof body.react === 'object') {
      Object.assign(react, body.react);
    }
    await sbFetch(cfg, `/rest/v1/wg_messages?id=eq.${encodeURIComponent(messageId)}`, { method: 'PATCH', body: { react } }).catch(() => null);
    return res.status(200).json({ ok: true, react, active: !exists });
  }

  if (act === 'groupAdminAction') {
    const conv = await assertConvAccess(cfg, body.conversationId, uid);
    if (!conv || !conv.is_group) return res.status(403).json({ error: 'Group inaccessible' });
    if (body.op === 'rotateInvite') {
      const token = crypto.randomBytes(9).toString('base64url');
      await sbFetch(cfg, `/rest/v1/wg_conversations?id=eq.${encodeURIComponent(body.conversationId)}`, { method: 'PATCH', body: { invite_token: token } });
      return res.status(200).json({ ok: true, inviteToken: token });
    }
    if ((body.op === 'promote' || body.op === 'demote') && body.targetUserId) {
      const nextRole = body.op === 'promote' ? 'owner' : 'member';
      await sbFetch(cfg, `/rest/v1/wg_conversation_members?conversation_id=eq.${encodeURIComponent(body.conversationId)}&user_id=eq.${encodeURIComponent(body.targetUserId)}`, { method: 'PATCH', body: { role: nextRole } });
      return res.status(200).json({ ok: true, role: nextRole });
    }
    return res.status(400).json({ error: 'Unknown groupAdminAction' });
  }

  if (act === 'joinGroupByToken') {
    const token = String(body.token || '').trim();
    if (!token) return res.status(400).json({ error: 'token required' });
    const gr = await sbFetch(cfg, `/rest/v1/wg_conversations?invite_token=eq.${encodeURIComponent(token)}&is_group=eq.true&select=id,name&limit=1`);
    const conv = Array.isArray(gr.data) ? gr.data[0] : null;
    if (!conv) return res.status(404).json({ error: 'Invalid or expired invite link' });
    await sbFetch(cfg, '/rest/v1/wg_conversation_members?on_conflict=conversation_id,user_id', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=minimal',
      body: [{ conversation_id: conv.id, user_id: uid, role: 'member', last_read_ms: Date.now() }]
    });
    return res.status(200).json({ ok: true, conversationId: conv.id, name: conv.name });
  }

  if (act === 'setConversationVanish') {
    const conv = await assertConvAccess(cfg, body.conversationId, uid);
    if (!conv) return res.status(403).json({ error: 'Forbidden' });
    const vanishSec = Math.max(0, Math.min(604800, Math.floor(Number(body.vanishSec) || 0)));
    const bubbleTheme = ['default', 'ocean', 'sunset', 'emerald', 'mono'].includes(body.bubbleTheme) ? body.bubbleTheme : undefined;
    const patch = { vanish_sec: vanishSec, ...(bubbleTheme ? { bubble_theme: bubbleTheme } : {}) };
    await sbFetch(cfg, `/rest/v1/wg_conversations?id=eq.${encodeURIComponent(body.conversationId)}`, { method: 'PATCH', body: patch });
    return res.status(200).json({ ok: true, vanishSec, ...(bubbleTheme ? { bubbleTheme } : {}) });
  }

  if (act === 'acceptMessageRequest') {
    const conv = await assertConvAccess(cfg, body.conversationId, uid);
    if (!conv) return res.status(403).json({ error: 'Forbidden' });
    await sbFetch(cfg, `/rest/v1/wg_conversations?id=eq.${encodeURIComponent(body.conversationId)}`, { method: 'PATCH', body: { is_request: false } });
    return res.status(200).json({ ok: true });
  }

  if (act === 'batchMarkAllRead') {
    const nowMs = Date.now();
    await Promise.all([
      sbFetch(cfg, `/rest/v1/wg_conversations?owner_id=eq.${euid}`, { method: 'PATCH', body: { unread: 0, owner_read_ms: nowMs } }),
      sbFetch(cfg, `/rest/v1/wg_conversation_members?user_id=eq.${euid}`, { method: 'PATCH', body: { last_read_ms: nowMs } }),
      sbFetch(cfg, `/rest/v1/wg_notifications?user_id=eq.${euid}&read_at=is.null`, { method: 'PATCH', body: { read_at: new Date(nowMs).toISOString() } }).catch(() => null)
    ]);
    return res.status(200).json({ ok: true, readMs: nowMs });
  }

  if (act === 'markViewOnceOpened') {
    const msgId = String(body.messageId || '').trim();
    const conv = await assertConvAccess(cfg, body.conversationId, uid);
    if (!conv || !msgId) return res.status(403).json({ error: 'Forbidden' });
    const openedAt = new Date().toISOString();
    await sbFetch(cfg, `/rest/v1/wg_messages?id=eq.${encodeURIComponent(msgId)}`, { method: 'PATCH', body: { opened_at: openedAt } });
    return res.status(200).json({ ok: true, openedAt });
  }

  if (act === 'toggleStarMessage') {
    const conv = await assertConvAccess(cfg, body.conversationId, uid);
    if (!conv) return res.status(403).json({ error: 'Forbidden' });
    const msgId = String(body.messageId || '').trim();
    const mr = await sbFetch(cfg, `/rest/v1/wg_messages?id=eq.${encodeURIComponent(msgId)}&select=id,starred_by&limit=1`);
    const row = Array.isArray(mr.data) ? mr.data[0] : null;
    if (!row) return res.status(404).json({ error: 'Message not found' });
    const set = new Set(Array.isArray(row.starred_by) ? row.starred_by : []);
    if (set.has(uid)) set.delete(uid); else set.add(uid);
    const next = [...set];
    await sbFetch(cfg, `/rest/v1/wg_messages?id=eq.${encodeURIComponent(msgId)}`, { method: 'PATCH', body: { starred_by: next } });
    return res.status(200).json({ ok: true, starred: set.has(uid) });
  }

  if (act === 'saveAiThread') {
    const id = String(body.id || `ait_${Date.now().toString(36)}`).slice(0, 64);
    const title = String(body.title || 'AI Chat').slice(0, 80);
    const messages = Array.isArray(body.messages) ? body.messages.slice(-40) : [];
    const pinned = Boolean(body.pinned);
    await sbFetch(cfg, '/rest/v1/wg_ai_threads?on_conflict=id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: [{ id, user_id: uid, title, pinned, messages, updated_at: new Date().toISOString() }]
    }).catch(() => null);
    return res.status(200).json({ ok: true, id, title, pinned });
  }

  if (act === 'deleteAiThread') {
    const id = String(body.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id required' });
    await sbFetch(cfg, `/rest/v1/wg_ai_threads?id=eq.${encodeURIComponent(id)}&user_id=eq.${euid}`, { method: 'DELETE' }).catch(() => null);
    return res.status(200).json({ ok: true });
  }

  if (act === 'logTelemetry') {
    const event = String(body.event || 'ping').slice(0, 50);
    const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
    await sbFetch(cfg, '/rest/v1/wg_telemetry', { method: 'POST', prefer: 'return=minimal', body: [{ user_id: uid, event, meta }] }).catch(() => null);
    return res.status(200).json({ ok: true });
  }

  return null;
}

module.exports = {
  verifyTotpToken,
  handleSecurityGet,
  handleSecurityPost
};
