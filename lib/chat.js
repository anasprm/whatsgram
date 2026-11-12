const { sbFetch, assertConvAccess, deleteMediaObjects, createNotification, getBlockSets } = require('./sb');
const { mapMessageRow } = require('./auth');

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

async function handleChatGet(action, cfg, req, res, session) {
  const uid = session.user.id;
  if (action === 'rtcConfig') {
    return res.status(200).json({ ok: true, iceServers: getRtcConfig() });
  }
  if (action === 'messages') {
    const convId = String(req.query?.conversationId || '').trim();
    if (!convId) return res.status(400).json({ error: 'conversationId required' });
    const conv = await assertConvAccess(cfg, convId, uid);
    if (conv === null) return res.status(404).json({ error: 'Conversation not found' });
    if (conv === false) return res.status(403).json({ error: 'Forbidden' });

    const limit = Math.min(100, Math.max(10, Number(req.query?.limit) || 40));
    const beforeMs = req.query?.beforeMs ? Number(req.query.beforeMs) : null;
    const beforeFilter = Number.isFinite(beforeMs) && beforeMs > 0 ? `&created_ms=lt.${Math.floor(beforeMs)}` : '';
    const [mr, pr] = await Promise.all([
      sbFetch(cfg, `/rest/v1/wg_messages?conversation_id=eq.${encodeURIComponent(convId)}${beforeFilter}&order=created_ms.desc,created_at.desc&limit=${limit + 1}`),
      sbFetch(cfg, '/rest/v1/wg_profiles?select=id,display_name,username')
    ]);
    if (!mr.ok) return res.status(mr.status || 500).json({ error: mr.data?.message || 'Failed to load messages' });
    const pMap = new Map((Array.isArray(pr.data) ? pr.data : []).map(p => [p.id, p]));
    const nowMs = Date.now();
    const raw = (Array.isArray(mr.data) ? mr.data : []).filter(m => !m.exp_at || Number(m.exp_at) > nowMs);
    const hasMore = raw.length > limit;
    const sliced = hasMore ? raw.slice(0, limit) : raw;
    const messages = sliced
      .filter(m => !m.send_at || Date.parse(m.send_at) <= nowMs)
      .map(m => mapMessageRow(m, uid, pMap))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
    return res.status(200).json({ ok: true, conversationId: convId, messages, hasMore });
  }
  return null;
}

async function handleChatPost(act, cfg, req, res, session, body) {
  const uid = session.user.id;

  if (act === 'createChat') {
    const memberIds = Array.isArray(body.memberIds) ? [...new Set(body.memberIds.filter(x => x && x !== uid))] : [];
    const isGroup = Boolean(body.isGroup || memberIds.length > 0);
    const peerId = isGroup ? null : (body.peerUserId || null);
    if (peerId && !isGroup) {
      const blocks = await getBlockSets(cfg, uid);
      if (blocks.all.has(peerId)) {
        return res.status(403).json({ error: 'Conversation unavailable due to block settings' });
      }
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
    if (!conv.is_group) {
      const peerId = conv.owner_id === uid ? conv.peer_user_id : conv.owner_id;
      if (peerId) {
        const blocks = await getBlockSets(cfg, uid);
        if (blocks.all.has(peerId)) {
          return res.status(403).json({ error: 'Cannot message a blocked user' });
        }
      }
    }
    const m = body.message || {};
    const validType = ['text', 'voice', 'file', 'sys'].includes(m.type) ? m.type : 'text';
    const row = {
      id: String(m.id),
      conversation_id: body.conversationId,
      sender_id: m.from === 'them' ? null : uid,
      sender_name: m.fromName ? String(m.fromName).slice(0, 60) : undefined,
      sender_role: m.from === 'sys' ? 'sys' : (m.from === 'them' ? 'them' : 'me'),
      msg_type: validType,
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
      ...(m.silent ? { silent: true } : {}),
      ...(m.sendAt ? { send_at: m.sendAt } : {}),
      ...(m.clientMsgId ? { client_msg_id: String(m.clientMsgId).slice(0, 64) } : {}),
      exp_at: m.exp || null,
      created_ms: Number(m.ts) || Date.now(),
      time_label: String(m.t || '')
    };
    if (row.sender_name === undefined) delete row.sender_name;
    if (row.client_msg_id) {
      const dupChk = await sbFetch(cfg, `/rest/v1/wg_messages?conversation_id=eq.${encodeURIComponent(body.conversationId)}&client_msg_id=eq.${encodeURIComponent(row.client_msg_id)}&select=id&limit=1`).catch(() => ({ ok: false }));
      if (dupChk.ok && Array.isArray(dupChk.data) && dupChk.data[0]) {
        return res.status(200).json({ ok: true, deduplicated: true, id: dupChk.data[0].id });
      }
    }
    const r = await sbFetch(cfg, '/rest/v1/wg_messages', { method: 'POST', prefer: 'return=minimal', body: [row] });
    if (!r.ok) return res.status(r.status).json({ error: r.data?.message || 'Failed to save message' });
    await sbFetch(cfg, `/rest/v1/wg_conversations?id=eq.${encodeURIComponent(body.conversationId)}`, { method: 'PATCH', body: { updated_at: new Date().toISOString() } });
    if (!m.silent && m.from !== 'sys' && m.from !== 'them' && !conv.is_group) {
      const peerId = conv.owner_id === uid ? conv.peer_user_id : conv.owner_id;
      if (peerId && peerId !== uid) {
        const preview = m.ct ? 'Encrypted message' : String(m.text || m.name || 'Sent an attachment').slice(0, 120);
        createNotification(cfg, { userId: peerId, actorId: uid, actorName: m.fromName || '', kind: 'message', entityId: body.conversationId, preview }).catch(() => null);
      }
    }
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

  if (act === 'voteChatPoll') {
    const conv = await assertConvAccess(cfg, body.conversationId, uid);
    if (!conv) return res.status(conv === false ? 403 : 404).json({ error: 'Conversation inaccessible' });
    const mr = await sbFetch(cfg, `/rest/v1/wg_messages?id=eq.${encodeURIComponent(body.messageId)}&conversation_id=eq.${encodeURIComponent(body.conversationId)}&select=id,reply_preview&limit=1`);
    const mRow = Array.isArray(mr.data) ? mr.data[0] : null;
    if (!mRow || !mRow.reply_preview?._poll) return res.status(404).json({ error: 'Poll not found' });
    const poll = mRow.reply_preview._poll;
    const optIdx = Number(body.optionIndex);
    if (!Number.isInteger(optIdx) || optIdx < 0 || optIdx >= (poll.options?.length || 0)) {
      return res.status(400).json({ error: 'Invalid poll option' });
    }
    const nextVotes = { ...(poll.votes || {}), [uid]: optIdx };
    const nextReply = { ...mRow.reply_preview, _poll: { ...poll, votes: nextVotes } };
    await sbFetch(cfg, `/rest/v1/wg_messages?id=eq.${encodeURIComponent(body.messageId)}`, {
      method: 'PATCH',
      body: { reply_preview: nextReply }
    });
    return res.status(200).json({ ok: true, poll: nextReply._poll });
  }

  return null;
}

module.exports = {
  getRtcConfig,
  handleChatGet,
  handleChatPost
};
