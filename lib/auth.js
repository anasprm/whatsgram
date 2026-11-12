const crypto = require('node:crypto');
const {
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
  setSessionCookies,
  clearSessionCookies,
  sbFetch,
  getUserFromToken,
  ensureProfile,
  deleteMediaObjects,
  signUrlMap,
  mapPublicProfile,
  checkRateLimit,
  getBlockSets
} = require('./sb');
const { verifyTotpToken } = require('./security');

function mapMessageRow(m, currentUserId, profileMap) {
  const from = m.sender_role === 'sys'
    ? 'sys'
    : (m.sender_id ? (m.sender_id === currentUserId ? 'me' : 'them') : m.sender_role);
  const senderProf = m.sender_id ? profileMap.get(m.sender_id) : null;
  return {
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
    openedAt: m.opened_at || undefined,
    sendAt: m.send_at || undefined,
    silent: Boolean(m.silent),
    starredBy: Array.isArray(m.starred_by) ? m.starred_by : [],
    reply: m.reply_preview || null,
    react: m.react || {},
    exp: m.exp_at ? Number(m.exp_at) : undefined,
    ts: m.created_ms ? Number(m.created_ms) : 0,
    t: m.time_label || ''
  };
}

async function getRecoveryRecord(cfg, userId) {
  const r = await sbFetch(cfg, `/rest/v1/wg_account_recovery?user_id=eq.${encodeURIComponent(userId)}&select=user_id,recovery_email&limit=1`);
  if (!r.ok) return null;
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

async function seedStarterWorkspace(cfg, userId) {
  const existing = await sbFetch(cfg, `/rest/v1/wg_conversations?select=id&owner_id=eq.${encodeURIComponent(userId)}&limit=1`);
  if (!existing.ok) return existing;
  if (Array.isArray(existing.data) && existing.data.length > 0) return { ok: true };

  const uidPrefix = userId.replace(/-/g, '').slice(0, 8);
  const c1 = `c_${uidPrefix}_1`, c2 = `c_${uidPrefix}_2`, c3 = `c_${uidPrefix}_3`;
  const m1 = `m_${uidPrefix}_1`, m2 = `m_${uidPrefix}_2`, m3 = `m_${uidPrefix}_3`, m4 = `m_${uidPrefix}_4`, m5 = `m_${uidPrefix}_5`;
  const now = Date.now();

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
      { id: m1, conversation_id: c1, sender_id: null, sender_role: 'them', msg_type: 'text', body: 'Confirmed receipt of the Q3 project documents.', created_ms: now - 500000, time_label: '19:40', react: { '❤️': 1 } },
      { id: m2, conversation_id: c1, sender_id: userId, sender_role: 'me', msg_type: 'text', body: 'Thanks. Let me know if any architectural revisions are required.', created_ms: now - 400000, time_label: '19:42', react: {} },
      { id: m3, conversation_id: c2, sender_id: null, sender_role: 'them', msg_type: 'text', body: 'Analytics export is ready for review at https://example.com/reports', created_ms: now - 300000, time_label: '14:10', react: {} },
      { id: m4, conversation_id: c3, sender_id: null, sender_role: 'them', msg_type: 'text', body: 'Can you review the deployment checklist before Friday?', created_ms: now - 200000, time_label: '09:12', react: {} },
      { id: m5, conversation_id: c3, sender_id: null, sender_role: 'them', msg_type: 'text', body: 'Please send the updated files when ready.', created_ms: now - 100000, time_label: '09:13', react: {} }
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

async function handleBootstrap(cfg, user, accessToken) {
  const uid = encodeURIComponent(user.id);
  const nowMs = Date.now();

  const [
    profilesRes, convRes, myMemRes, storiesRes, votesRes,
    customReelsRes, prefsRes, commentsRes, settingsRes, auditRes,
    recRes, myFollowsRes, notifRes, backupRes, notesRes, storyViewsRes, blockSets
  ] = await Promise.all([
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
    sbFetch(cfg, `/rest/v1/wg_follows?select=follower_id,following_id,status&or=(follower_id.eq.${uid},following_id.eq.${uid})`),
    sbFetch(cfg, `/rest/v1/wg_notifications?user_id=eq.${uid}&order=created_at.desc&limit=30`).catch(() => ({ ok: false })),
    sbFetch(cfg, `/rest/v1/wg_key_backups?user_id=eq.${uid}&select=user_id,key_fp,updated_at&limit=1`).catch(() => ({ ok: false })),
    sbFetch(cfg, '/rest/v1/wg_notes?select=user_id,text,expires_at,created_at&limit=60').catch(() => ({ ok: false })),
    sbFetch(cfg, `/rest/v1/wg_story_views?select=story_id,user_id`).catch(() => ({ ok: false })),
    getBlockSets(cfg, user.id)
  ]);

  if (!convRes.ok) {
    const msg = convRes.data?.message || 'Database tables not initialized. Run supabase/schema.sql in Supabase SQL Editor.';
    return { ok: false, status: convRes.status, error: msg };
  }

  const profiles = Array.isArray(profilesRes.data) ? profilesRes.data : [];
  const profileMap = new Map(profiles.map(p => [p.id, p]));
  let convs = Array.isArray(convRes.data) ? [...convRes.data] : [];

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
    const msgRes = await sbFetch(cfg, `/rest/v1/wg_messages?conversation_id=in.(${encodeURIComponent(ids)})&order=created_ms.desc,created_at.desc&limit=300`);
    if (msgRes.ok && Array.isArray(msgRes.data)) {
      const expired = msgRes.data.filter(m => m.exp_at && Number(m.exp_at) <= nowMs);
      if (expired.length) {
        const expMedia = expired.map(m => m.media_path).filter(Boolean);
        if (expMedia.length) deleteMediaObjects(cfg, expMedia).catch(() => null);
        const expIds = expired.map(m => `"${String(m.id).replace(/"/g, '')}"`).join(',');
        sbFetch(cfg, `/rest/v1/wg_messages?id=in.(${encodeURIComponent(expIds)})`, { method: 'DELETE' }).catch(() => null);
      }
      msgs = msgRes.data.filter(m => (!m.exp_at || Number(m.exp_at) > nowMs) && (!m.send_at || Date.parse(m.send_at) <= nowMs));
    }
  }

  const msgByConv = new Map();
  for (const m of msgs) {
    if (!msgByConv.has(m.conversation_id)) msgByConv.set(m.conversation_id, []);
    msgByConv.get(m.conversation_id).push(mapMessageRow(m, user.id, profileMap));
  }
  for (const [cid, list] of msgByConv) {
    list.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (list.length > 50) {
      msgByConv.set(cid, list.slice(-50));
      msgByConv.set(`${cid}:more`, true);
    }
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
      vanishSec: Number(c.vanish_sec || 0),
      bubbleTheme: c.bubble_theme || 'default',
      isRequest: Boolean(c.is_request),
      isBroadcast: Boolean(c.is_broadcast),
      inviteToken: c.invite_token || '',
      hasMore: Boolean(msgByConv.get(`${c.id}:more`)),
      msgs: msgByConv.get(c.id) || []
    };
  });

  const rawStories = Array.isArray(storiesRes.data) ? storiesRes.data : [];
  const expiredStories = rawStories.filter(s => s.expires_at && Date.parse(s.expires_at) <= nowMs);
  if (expiredStories.length) {
    const expStoryMedia = expiredStories.map(s => s.media_path).filter(Boolean);
    if (expStoryMedia.length) deleteMediaObjects(cfg, expStoryMedia).catch(() => null);
    const expStoryIds = expiredStories.map(s => `"${String(s.id).replace(/"/g, '')}"`).join(',');
    sbFetch(cfg, `/rest/v1/wg_stories?id=in.(${encodeURIComponent(expStoryIds)})`, { method: 'DELETE' }).catch(() => null);
  }
  const hasCfStories = rawStories.some(s => s.audience === 'close_friends' && s.user_id && s.user_id !== user.id);
  let cfOwners = new Set();
  if (hasCfStories) {
    const cfRes = await sbFetch(cfg, `/rest/v1/wg_close_friends?friend_id=eq.${uid}&select=user_id`).catch(() => ({ ok: false }));
    if (cfRes?.ok && Array.isArray(cfRes.data)) cfOwners = new Set(cfRes.data.map(r => r.user_id));
  }
  const viewedByStory = new Map();
  const myViewedStories = new Set();
  for (const sv of (storyViewsRes?.ok && Array.isArray(storyViewsRes.data) ? storyViewsRes.data : [])) {
    if (!viewedByStory.has(sv.story_id)) viewedByStory.set(sv.story_id, []);
    viewedByStory.get(sv.story_id).push(sv.user_id);
    if (sv.user_id === user.id) myViewedStories.add(sv.story_id);
  }
  const votedSet = new Set((Array.isArray(votesRes.data) ? votesRes.data : []).map(v => v.story_id));
  const stories = rawStories
    .filter(s => (!s.expires_at || Date.parse(s.expires_at) > nowMs)
      && (!s.user_id || !blockSets.all.has(s.user_id))
      && (!s.archived)
      && (!s.publish_at || Date.parse(s.publish_at) <= nowMs)
      && (s.audience !== 'close_friends' || !s.user_id || s.user_id === user.id || cfOwners.has(s.user_id)))
    .map(s => ({
      id: s.id,
      userId: s.user_id || undefined,
      name: s.author_name,
      bg: s.bg,
      q: s.question,
      mediaPath: s.media_path || undefined,
      mediaMime: s.media_mime || undefined,
      audience: s.audience || 'everyone',
      stickers: Array.isArray(s.stickers) ? s.stickers : [],
      yes: s.yes_count || 0,
      no: s.no_count || 0,
      link: s.link || '',
      co: s.co_author || '',
      viewsCount: (viewedByStory.get(s.id) || []).length,
      seen: votedSet.has(s.id) || myViewedStories.has(s.id),
      voted: votedSet.has(s.id)
    }));

  const prefs = Array.isArray(prefsRes.data) && prefsRes.data[0] ? prefsRes.data[0] : {};
  const extra = {};
  for (const cm of (Array.isArray(commentsRes.data) ? commentsRes.data : [])) {
    if (!extra[cm.reel_id]) extra[cm.reel_id] = [];
    extra[cm.reel_id].push({ n: cm.author_name, t: cm.body });
  }
  const customReels = (customReelsRes.ok && Array.isArray(customReelsRes.data) ? customReelsRes.data : [])
    .filter(r => !r.user_id || !blockSets.all.has(r.user_id))
    .map(r => ({
      id: /^\d+$/.test(String(r.id)) ? Number(r.id) : r.id,
      userId: r.user_id || undefined,
      author: r.author_name,
      cap: r.caption,
      g: r.gradient,
      mediaPath: r.media_path || undefined,
      mediaMime: r.media_mime || undefined,
      filterIdx: r.filter_idx || 0,
      audioId: r.audio_id || '',
      remixOf: r.remix_of || '',
      viewsCount: Number(r.views_count || 0),
      likes: r.likes_count || 0,
      com: []
    }));

  const settingsRow = Array.isArray(settingsRes.data) && settingsRes.data[0] ? settingsRes.data[0] : null;
  const auditLogs = (Array.isArray(auditRes.data) ? auditRes.data : []).map(l => ({ t: l.event_time, m: l.message }));
  const avatarUrlMap = await signUrlMap(cfg, profiles.map(p => p.avatar_path).filter(Boolean));
  const myProfile = profileMap.get(user.id);
  const myFollowRows = myFollowsRes?.ok && Array.isArray(myFollowsRes.data) ? myFollowsRes.data : [];
  const followersCount = myFollowRows.filter(f => f.following_id === user.id && (f.status || 'accepted') === 'accepted').length;
  const followingCount = myFollowRows.filter(f => f.follower_id === user.id && (f.status || 'accepted') === 'accepted').length;
  const pendingFollowRequests = myFollowRows
    .filter(f => f.following_id === user.id && f.status === 'pending')
    .map(f => {
      const p = profileMap.get(f.follower_id);
      return p ? mapPublicProfile(p, p.avatar_path ? (avatarUrlMap.get(p.avatar_path) || null) : null) : { id: f.follower_id, display_name: 'Member' };
    });
  const notes = (notesRes?.ok && Array.isArray(notesRes.data) ? notesRes.data : [])
    .filter(n => n.text && (!n.expires_at || Date.parse(n.expires_at) > nowMs) && !blockSets.all.has(n.user_id))
    .map(n => {
      const p = profileMap.get(n.user_id);
      return {
        userId: n.user_id,
        name: p?.display_name || p?.username || 'Member',
        username: p?.username || null,
        avatarUrl: p?.avatar_path ? (avatarUrlMap.get(p.avatar_path) || null) : null,
        text: n.text,
        createdAt: n.created_at,
        expiresAt: n.expires_at
      };
    });
  const myRecEmail = (recRes.ok && Array.isArray(recRes.data) && recRes.data[0]?.recovery_email)
    || (user.email && !String(user.email).endsWith(`@${INTERNAL_EMAIL_DOMAIN}`) ? user.email : null);
  const myUsername = myProfile?.username || user.user_metadata?.username || null;
  const notifications = notifRes?.ok && Array.isArray(notifRes.data) ? notifRes.data.map(n => ({
    id: n.id,
    kind: n.kind,
    actorId: n.actor_id,
    actorName: n.actor_name,
    entityId: n.entity_id,
    preview: n.preview,
    read: Boolean(n.read_at),
    createdAt: n.created_at
  })) : [];
  const keyBackupRow = backupRes?.ok && Array.isArray(backupRes.data) && backupRes.data[0] ? backupRes.data[0] : null;

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
        hasKeyBackup: Boolean(keyBackupRow),
        keyBackupUpdatedAt: keyBackupRow?.updated_at || null,
        bio: myProfile?.bio || '',
        category: myProfile?.category || '',
        website: myProfile?.website || '',
        links: Array.isArray(myProfile?.links) ? myProfile.links : [],
        contactEmail: myProfile?.contact_email || '',
        locationText: myProfile?.location_text || '',
        avatarPath: myProfile?.avatar_path || '',
        avatarUrl: myProfile?.avatar_path ? (avatarUrlMap.get(myProfile.avatar_path) || null) : null,
        verified: Boolean(myProfile?.verified),
        isPrivate: Boolean(myProfile?.is_private),
        totpEnabled: Boolean(myProfile?.totp_enabled),
        deletedAt: myProfile?.deleted_at || null,
        showOnline: myProfile?.show_online !== false,
        showTyping: myProfile?.show_typing !== false,
        pushPrefs: myProfile?.push_prefs || { dms: true, calls: true, likes: true, follows: true, ai: true },
        hiddenWords: Array.isArray(myProfile?.hidden_words) ? myProfile.hidden_words : [],
        storageBytes: Number(myProfile?.storage_bytes || 0),
        threadsHandle: myProfile?.threads_handle || '',
        followersCount,
        followingCount
      },
      users: profiles.filter(p => p.id !== user.id && !blockSets.all.has(p.id)).map(p => mapPublicProfile(p, p.avatar_path ? (avatarUrlMap.get(p.avatar_path) || null) : null)),
      blockedIds: [...blockSets.myBlocked],
      followRequests: pendingFollowRequests,
      notes,
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
      notifications,
      cfg: settingsRow?.cfg || null,
      logs: auditLogs,
      realtime: cfg.publishableKey ? { url: cfg.url, publishableKey: cfg.publishableKey, accessToken } : null
    }
  };
}

async function handlePublicAuthGet(action, cfg, req, res) {
  if (action !== 'usernameAvailable') return null;
  const raw = normalizeUsername(req.query?.username || '');
  if (!USERNAME_RE.test(raw)) {
    return res.status(200).json({ ok: true, available: false, valid: false, suggestions: [] });
  }
  const chk = await sbFetch(cfg, `/rest/v1/wg_profiles?username=eq.${encodeURIComponent(raw)}&select=id&limit=1`).catch(() => ({ ok: false }));
  const taken = chk.ok && Array.isArray(chk.data) && chk.data.length > 0;
  const suggestions = taken ? [`${raw}_dev`, `its.${raw}`.slice(0, 24), `${raw}_${Math.floor(10 + Math.random() * 89)}`.slice(0, 24)] : [];
  return res.status(200).json({ ok: true, available: !taken, valid: true, username: raw, suggestions });
}

async function handlePublicAuthPost(act, cfg, req, res, body) {
  if (act === 'signout') {
    clearSessionCookies(req, res);
    return res.status(200).json({ ok: true });
  }

  if (act === 'signup' || act === 'signin') {
    const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
    const rl = checkRateLimit(`auth:${act}:${ip}`, 80, 60000);
    if (!rl.ok) {
      return res.status(429).json({ error: 'Too many authentication attempts. Wait a minute and try again.' });
    }
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
    const secProfRes = await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(auth.data.user.id)}&select=totp_enabled,totp_secret,deleted_at&limit=1`).catch(() => ({ ok: false }));
    const secProf = Array.isArray(secProfRes?.data) && secProfRes.data[0] ? secProfRes.data[0] : {};
    if (secProf.totp_enabled && secProf.totp_secret) {
      if (!verifyTotpToken(secProf.totp_secret, body.totpCode)) {
        return res.status(401).json({ error: 'Enter the 6-digit code from your authenticator app.', requireTotp: true });
      }
    }
    if (secProf.deleted_at) {
      await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(auth.data.user.id)}`, { method: 'PATCH', body: { deleted_at: null } }).catch(() => null);
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
    const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
    const rl = checkRateLimit(`auth:reset:${ip}`, 25, 60000);
    if (!rl.ok) {
      return res.status(429).json({ error: 'Too many password reset requests. Wait a minute before trying again.' });
    }
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

  return null;
}

async function handleAuthedAuthGet(action, cfg, req, res, session) {
  if (action === 'session') {
    const boot = await handleBootstrap(cfg, session.user, session.accessToken);
    if (!boot.ok) return res.status(boot.status || 500).json({ error: boot.error });
    return res.status(200).json({ authenticated: true, ...boot.data });
  }
  if (action === 'bootstrap') {
    const boot = await handleBootstrap(cfg, session.user, session.accessToken);
    if (!boot.ok) return res.status(boot.status || 500).json({ error: boot.error });
    return res.status(200).json(boot.data);
  }
  if (action === 'getKeyBackup') {
    const r = await sbFetch(cfg, `/rest/v1/wg_key_backups?user_id=eq.${encodeURIComponent(session.user.id)}&select=key_fp,payload,updated_at&limit=1`);
    if (!r.ok) {
      return res.status(isMissingRelationErr(r) ? 404 : (r.status || 500)).json({
        error: isMissingRelationErr(r) ? 'Key backup table missing. Run updated supabase/schema.sql.' : (r.data?.message || 'Failed to read key backup')
      });
    }
    const row = Array.isArray(r.data) ? r.data[0] : null;
    if (!row) return res.status(404).json({ error: 'No encrypted key backup stored yet.' });
    return res.status(200).json({ ok: true, keyFp: row.key_fp || null, payload: row.payload, updatedAt: row.updated_at });
  }
  if (action === 'exportAccountData') {
    const uid = session.user.id;
    const euid = encodeURIComponent(uid);
    const [pRes, postsRes, notesRes, auditRes, settingsRes] = await Promise.all([
      sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${euid}&limit=1`),
      sbFetch(cfg, `/rest/v1/wg_posts?user_id=eq.${euid}&order=created_at.desc&limit=200`),
      sbFetch(cfg, `/rest/v1/wg_notes?user_id=eq.${euid}&limit=1`).catch(() => ({ ok: false })),
      sbFetch(cfg, `/rest/v1/wg_audit_logs?user_id=eq.${euid}&order=id.desc&limit=100`),
      sbFetch(cfg, `/rest/v1/wg_settings?user_id=eq.${euid}&limit=1`)
    ]);
    return res.status(200).json({
      ok: true,
      exportedAt: new Date().toISOString(),
      account: { id: uid, email: session.user.email || null },
      profile: Array.isArray(pRes.data) ? pRes.data[0] || null : null,
      posts: Array.isArray(postsRes.data) ? postsRes.data : [],
      note: notesRes?.ok && Array.isArray(notesRes.data) ? notesRes.data[0] || null : null,
      settings: Array.isArray(settingsRes.data) ? settingsRes.data[0]?.cfg || null : null,
      auditLogs: Array.isArray(auditRes.data) ? auditRes.data : []
    });
  }
  return null;
}

async function handleAuthedAuthPost(act, cfg, req, res, session, body) {
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

  if (act === 'saveKeyBackup') {
    const p = body.payload;
    const keyFp = String(body.keyFp || p?.fp || '').trim().slice(0, 64);
    if (!p || typeof p !== 'object' || !p.ct || !p.iv || !p.salt) {
      return res.status(400).json({ error: 'Encrypted key backup payload requires ct, iv, and salt.' });
    }
    const up = await sbFetch(cfg, '/rest/v1/wg_key_backups?on_conflict=user_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: [{ user_id: uid, key_fp: keyFp, payload: p, updated_at: new Date().toISOString() }]
    });
    if (!up.ok) {
      return res.status(isMissingRelationErr(up) ? 500 : (up.status || 500)).json({
        error: isMissingRelationErr(up) ? 'Key backup table missing. Run updated supabase/schema.sql.' : (up.data?.message || 'Failed to save key backup')
      });
    }
    const row = Array.isArray(up.data) ? up.data[0] : null;
    return res.status(200).json({ ok: true, keyFp, updatedAt: row?.updated_at || new Date().toISOString() });
  }

  if (act === 'deleteKeyBackup') {
    await sbFetch(cfg, `/rest/v1/wg_key_backups?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' });
    return res.status(200).json({ ok: true });
  }

  if (act === 'saveNote') {
    const text = String(body.text || '').trim().slice(0, 60);
    if (!text) {
      await sbFetch(cfg, `/rest/v1/wg_notes?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }).catch(() => null);
      return res.status(200).json({ ok: true, cleared: true });
    }
    const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
    const r = await sbFetch(cfg, '/rest/v1/wg_notes?on_conflict=user_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: [{ user_id: uid, text, expires_at: expiresAt, created_at: new Date().toISOString() }]
    });
    if (!r.ok && isMissingRelationErr(r)) {
      return res.status(200).json({ ok: true, localOnly: true, text, expiresAt });
    }
    if (!r.ok) return res.status(r.status || 500).json({ error: r.data?.message || 'Failed to save note' });
    return res.status(200).json({ ok: true, text, expiresAt });
  }

  return null;
}

module.exports = {
  mapMessageRow,
  getRecoveryRecord,
  setRecoveryRecord,
  findAccountByIdentifier,
  createResetTokenRecord,
  dispatchResetEmail,
  seedStarterWorkspace,
  handleBootstrap,
  handlePublicAuthGet,
  handlePublicAuthPost,
  handleAuthedAuthGet,
  handleAuthedAuthPost
};
