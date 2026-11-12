const crypto = require('node:crypto');
const {
  sbFetch,
  isMissingRelationErr,
  normalizeUsername,
  deleteMediaObjects,
  createNotification
} = require('./sb');

/** Cleanup expired stories, scheduled messages/posts, and orphaned wg-media paths. */
async function runScheduledMaintenance(cfg) {
  const nowIso = new Date().toISOString();
  const report = { expiredStories: 0, purgedAccounts: 0 };
  try {
    const expSt = await sbFetch(cfg, `/rest/v1/wg_stories?expires_at=lte.${encodeURIComponent(nowIso)}&select=id,media_path`);
    if (expSt.ok && Array.isArray(expSt.data) && expSt.data.length) {
      report.expiredStories = expSt.data.length;
      const paths = expSt.data.map(s => s.media_path).filter(Boolean);
      if (paths.length) await deleteMediaObjects(cfg, paths);
      const idList = expSt.data.map(s => `"${String(s.id).replace(/"/g, '')}"`).join(',');
      await sbFetch(cfg, `/rest/v1/wg_stories?id=in.(${encodeURIComponent(idList)})`, { method: 'DELETE' });
    }
    const cutoff30d = new Date(Date.now() - 30 * 86400000).toISOString();
    const delProfs = await sbFetch(cfg, `/rest/v1/wg_profiles?deleted_at=lte.${encodeURIComponent(cutoff30d)}&select=id`).catch(() => ({ ok: false }));
    if (delProfs.ok && Array.isArray(delProfs.data) && delProfs.data.length) {
      report.purgedAccounts = delProfs.data.length;
      for (const p of delProfs.data) {
        await sbFetch(cfg, `/auth/v1/admin/users/${encodeURIComponent(p.id)}`, { method: 'DELETE' }).catch(() => null);
      }
    }
  } catch {}
  return report;
}

async function handleSafetyGet(action, cfg, req, res, session) {
  const uid = session.user.id;
  const euid = encodeURIComponent(uid);

  if (action === 'safetyLists') {
    const [mutesRes, restRes, cfRes, tagsRes, colRes, profRes] = await Promise.all([
      sbFetch(cfg, `/rest/v1/wg_mutes?user_id=eq.${euid}&select=muted_user_id`).catch(() => ({ ok: false })),
      sbFetch(cfg, `/rest/v1/wg_restricted?user_id=eq.${euid}&select=restricted_user_id`).catch(() => ({ ok: false })),
      sbFetch(cfg, `/rest/v1/wg_close_friends?user_id=eq.${euid}&select=friend_id`).catch(() => ({ ok: false })),
      sbFetch(cfg, `/rest/v1/wg_followed_tags?user_id=eq.${euid}&select=tag`).catch(() => ({ ok: false })),
      sbFetch(cfg, `/rest/v1/wg_saved_collections?user_id=eq.${euid}&order=created_at.desc`).catch(() => ({ ok: false })),
      sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${euid}&select=hidden_words,show_online,show_typing,push_prefs,storage_bytes,totp_enabled,deleted_at&limit=1`).catch(() => ({ ok: false }))
    ]);
    const myProf = Array.isArray(profRes?.data) && profRes.data[0] ? profRes.data[0] : {};
    return res.status(200).json({
      ok: true,
      mutedIds: (mutesRes?.ok && Array.isArray(mutesRes.data) ? mutesRes.data : []).map(r => r.muted_user_id),
      restrictedIds: (restRes?.ok && Array.isArray(restRes.data) ? restRes.data : []).map(r => r.restricted_user_id),
      closeFriendIds: (cfRes?.ok && Array.isArray(cfRes.data) ? cfRes.data : []).map(r => r.friend_id),
      followedTags: (tagsRes?.ok && Array.isArray(tagsRes.data) ? tagsRes.data : []).map(r => r.tag),
      collections: colRes?.ok && Array.isArray(colRes.data) ? colRes.data : [],
      hiddenWords: Array.isArray(myProf.hidden_words) ? myProf.hidden_words : [],
      showOnline: myProf.show_online !== false,
      showTyping: myProf.show_typing !== false,
      pushPrefs: myProf.push_prefs || { dms: true, calls: true, likes: true, follows: true, ai: true },
      storageBytes: Number(myProf.storage_bytes || 0),
      totpEnabled: Boolean(myProf.totp_enabled),
      deletedAt: myProf.deleted_at || null
    });
  }

  if (action === 'creatorInsights') {
    const [postsRes, followersRes, reelsRes] = await Promise.all([
      sbFetch(cfg, `/rest/v1/wg_posts?user_id=eq.${euid}&order=created_at.desc&limit=100`),
      sbFetch(cfg, `/rest/v1/wg_follows?following_id=eq.${euid}&select=follower_id,status,created_at`),
      sbFetch(cfg, `/rest/v1/wg_reels?user_id=eq.${euid}&select=id,caption,likes_count,views_count,created_at`).catch(() => ({ ok: false }))
    ]);
    const posts = Array.isArray(postsRes.data) ? postsRes.data : [];
    const followers = (followersRes.ok && Array.isArray(followersRes.data) ? followersRes.data : []).filter(f => (f.status || 'accepted') === 'accepted');
    const reels = reelsRes?.ok && Array.isArray(reelsRes.data) ? reelsRes.data : [];
    const cut7d = Date.now() - 7 * 86400000;
    const recentFollowers = followers.filter(f => f.created_at && Date.parse(f.created_at) >= cut7d).length;
    const totals = posts.reduce((acc, p) => {
      acc.views += Number(p.views_count || 0);
      acc.likes += Number(p.likes_count || 0);
      acc.comments += Number(p.comments_count || 0);
      acc.saves += Number(p.saves_count || 0);
      return acc;
    }, { views: 0, likes: 0, comments: 0, saves: 0 });
    reels.forEach(r => { totals.views += Number(r.views_count || 0); totals.likes += Number(r.likes_count || 0); });
    const topPosts = [...posts]
      .sort((a, b) => ((Number(b.likes_count || 0) * 2 + Number(b.comments_count || 0) * 3 + Number(b.saves_count || 0) * 4) - (Number(a.likes_count || 0) * 2 + Number(a.comments_count || 0) * 3 + Number(a.saves_count || 0) * 4)))
      .slice(0, 5)
      .map(p => ({ id: p.id, caption: String(p.caption || '').slice(0, 80), likes: p.likes_count || 0, comments: p.comments_count || 0, saves: p.saves_count || 0, views: p.views_count || 0 }));
    return res.status(200).json({
      ok: true,
      followersTotal: followers.length,
      followers7d: recentFollowers,
      postsCount: posts.length,
      reelsCount: reels.length,
      totals,
      topPosts
    });
  }

  return null;
}

async function togglePairTable(cfg, table, keyCol, valCol, uid, targetId) {
  if (!targetId || targetId === uid) return { ok: false, status: 400, error: 'Valid target user required' };
  const chk = await sbFetch(cfg, `/rest/v1/${table}?${keyCol}=eq.${encodeURIComponent(uid)}&${valCol}=eq.${encodeURIComponent(targetId)}&select=${valCol}`);
  if (!chk.ok && isMissingRelationErr(chk)) return { ok: true, active: true, localOnly: true };
  const exists = Array.isArray(chk.data) && chk.data.length > 0;
  if (exists) {
    await sbFetch(cfg, `/rest/v1/${table}?${keyCol}=eq.${encodeURIComponent(uid)}&${valCol}=eq.${encodeURIComponent(targetId)}`, { method: 'DELETE' });
    return { ok: true, active: false };
  }
  await sbFetch(cfg, `/rest/v1/${table}`, { method: 'POST', prefer: 'return=minimal', body: [{ [keyCol]: uid, [valCol]: targetId }] });
  return { ok: true, active: true };
}

async function handleSafetyPost(act, cfg, req, res, session, body) {
  const uid = session.user.id;

  if (act === 'toggleMute') {
    const r = await togglePairTable(cfg, 'wg_mutes', 'user_id', 'muted_user_id', uid, String(body.targetUserId || '').trim());
    return res.status(r.status || 200).json(r.ok ? { ok: true, muted: r.active } : { error: r.error });
  }

  if (act === 'toggleRestrict') {
    const r = await togglePairTable(cfg, 'wg_restricted', 'user_id', 'restricted_user_id', uid, String(body.targetUserId || '').trim());
    return res.status(r.status || 200).json(r.ok ? { ok: true, restricted: r.active } : { error: r.error });
  }

  if (act === 'toggleCloseFriend') {
    const r = await togglePairTable(cfg, 'wg_close_friends', 'user_id', 'friend_id', uid, String(body.targetUserId || '').trim());
    return res.status(r.status || 200).json(r.ok ? { ok: true, closeFriend: r.active } : { error: r.error });
  }

  if (act === 'toggleFollowTag') {
    const tag = normalizeUsername(body.tag).replace(/^#/, '');
    if (!tag) return res.status(400).json({ error: 'tag required' });
    const chk = await sbFetch(cfg, `/rest/v1/wg_followed_tags?user_id=eq.${encodeURIComponent(uid)}&tag=eq.${encodeURIComponent(tag)}&select=tag`);
    if (!chk.ok && isMissingRelationErr(chk)) return res.status(200).json({ ok: true, following: true, tag, localOnly: true });
    const exists = Array.isArray(chk.data) && chk.data.length > 0;
    if (exists) {
      await sbFetch(cfg, `/rest/v1/wg_followed_tags?user_id=eq.${encodeURIComponent(uid)}&tag=eq.${encodeURIComponent(tag)}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true, following: false, tag });
    }
    await sbFetch(cfg, '/rest/v1/wg_followed_tags', { method: 'POST', prefer: 'return=minimal', body: [{ user_id: uid, tag }] });
    return res.status(200).json({ ok: true, following: true, tag });
  }

  if (act === 'createCollection') {
    const name = String(body.name || '').trim().slice(0, 50);
    if (!name) return res.status(400).json({ error: 'Collection name required' });
    const id = `col_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    const postIds = Array.isArray(body.postIds) ? body.postIds.filter(Boolean).slice(0, 100) : [];
    const r = await sbFetch(cfg, '/rest/v1/wg_saved_collections', {
      method: 'POST',
      prefer: 'return=representation',
      body: [{ id, user_id: uid, name, post_ids: postIds }]
    }).catch(() => ({ ok: false }));
    return res.status(200).json({ ok: true, collection: Array.isArray(r.data) && r.data[0] ? r.data[0] : { id, user_id: uid, name, post_ids: postIds } });
  }

  if (act === 'addPostToCollection') {
    const colId = String(body.collectionId || '').trim();
    const postId = String(body.postId || '').trim();
    if (!colId || !postId) return res.status(400).json({ error: 'collectionId and postId required' });
    const gr = await sbFetch(cfg, `/rest/v1/wg_saved_collections?id=eq.${encodeURIComponent(colId)}&user_id=eq.${encodeURIComponent(uid)}&select=id,post_ids&limit=1`);
    const row = Array.isArray(gr.data) ? gr.data[0] : null;
    if (!row) return res.status(404).json({ error: 'Collection not found' });
    const set = new Set(Array.isArray(row.post_ids) ? row.post_ids : []);
    if (set.has(postId)) set.delete(postId); else set.add(postId);
    const nextIds = [...set];
    await sbFetch(cfg, `/rest/v1/wg_saved_collections?id=eq.${encodeURIComponent(colId)}`, { method: 'PATCH', body: { post_ids: nextIds } });
    return res.status(200).json({ ok: true, collectionId: colId, postIds: nextIds, added: set.has(postId) });
  }

  if (act === 'toggleCommentLike') {
    const commentId = String(body.commentId || '').trim();
    if (!commentId) return res.status(400).json({ error: 'commentId required' });
    const chk = await sbFetch(cfg, `/rest/v1/wg_comment_likes?comment_id=eq.${encodeURIComponent(commentId)}&user_id=eq.${encodeURIComponent(uid)}&select=comment_id`);
    const exists = chk.ok && Array.isArray(chk.data) && chk.data.length > 0;
    if (exists) {
      await sbFetch(cfg, `/rest/v1/wg_comment_likes?comment_id=eq.${encodeURIComponent(commentId)}&user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }).catch(() => null);
    } else {
      await sbFetch(cfg, '/rest/v1/wg_comment_likes', { method: 'POST', prefer: 'return=minimal', body: [{ comment_id: commentId, user_id: uid }] }).catch(() => null);
    }
    const cnt = await sbFetch(cfg, `/rest/v1/wg_comment_likes?comment_id=eq.${encodeURIComponent(commentId)}&select=user_id`).catch(() => ({ ok: false }));
    const likesCount = Array.isArray(cnt.data) ? cnt.data.length : (exists ? 0 : 1);
    await sbFetch(cfg, `/rest/v1/wg_post_comments?id=eq.${encodeURIComponent(commentId)}`, { method: 'PATCH', body: { likes_count: likesCount } }).catch(() => null);
    return res.status(200).json({ ok: true, liked: !exists, likesCount });
  }

  if (act === 'pinPostComment') {
    const commentId = String(body.commentId || '').trim();
    const postId = String(body.postId || '').trim();
    if (!commentId || !postId) return res.status(400).json({ error: 'postId and commentId required' });
    const pr = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}&select=id,user_id&limit=1`);
    const post = Array.isArray(pr.data) ? pr.data[0] : null;
    if (!post || post.user_id !== uid) return res.status(403).json({ error: 'Only the post author can pin comments' });
    const cm = await sbFetch(cfg, `/rest/v1/wg_post_comments?id=eq.${encodeURIComponent(commentId)}&select=id,pinned&limit=1`);
    const cur = Array.isArray(cm.data) ? cm.data[0] : null;
    if (!cur) return res.status(404).json({ error: 'Comment not found' });
    const nextPinned = !cur.pinned;
    await sbFetch(cfg, `/rest/v1/wg_post_comments?id=eq.${encodeURIComponent(commentId)}`, { method: 'PATCH', body: { pinned: nextPinned } });
    return res.status(200).json({ ok: true, pinned: nextPinned });
  }

  if (act === 'updatePostControls') {
    const postId = String(body.postId || '').trim();
    if (!postId) return res.status(400).json({ error: 'postId required' });
    const pr = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}&select=id,user_id&limit=1`);
    const post = Array.isArray(pr.data) ? pr.data[0] : null;
    if (!post || post.user_id !== uid) return res.status(403).json({ error: 'Forbidden' });
    const patch = {};
    if (['everyone', 'followers', 'off'].includes(body.commentsMode)) patch.comments_mode = body.commentsMode;
    if (typeof body.hideLikes === 'boolean') patch.hide_likes = body.hideLikes;
    if (Array.isArray(body.photoTags)) patch.photo_tags = body.photoTags.slice(0, 20);
    if (Array.isArray(body.coAuthorIds)) patch.co_author_ids = body.coAuthorIds.filter(Boolean).slice(0, 5);
    await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}`, { method: 'PATCH', body: patch });
    return res.status(200).json({ ok: true, ...patch });
  }

  if (act === 'trackReelView') {
    const reelId = String(body.reelId || '').trim();
    if (!reelId) return res.status(400).json({ error: 'reelId required' });
    await sbFetch(cfg, '/rest/v1/wg_reel_views?on_conflict=reel_id,user_id,viewed_day', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=minimal',
      body: [{ reel_id: reelId, user_id: uid }]
    }).catch(() => null);
    const vr = await sbFetch(cfg, `/rest/v1/wg_reel_views?reel_id=eq.${encodeURIComponent(reelId)}&select=user_id`).catch(() => ({ ok: false }));
    const viewsCount = Array.isArray(vr.data) ? vr.data.length : 1;
    await sbFetch(cfg, `/rest/v1/wg_reels?id=eq.${encodeURIComponent(reelId)}`, { method: 'PATCH', body: { views_count: viewsCount } }).catch(() => null);
    return res.status(200).json({ ok: true, viewsCount });
  }

  if (act === 'createBroadcastChannel') {
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: 'Channel name required' });
    const id = `bc_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    const r = await sbFetch(cfg, '/rest/v1/wg_conversations', {
      method: 'POST',
      prefer: 'return=minimal',
      body: [{ id, owner_id: uid, is_group: true, is_broadcast: true, name, folder: 'personal', status: 'Broadcast Channel', owner_read_ms: Date.now() }]
    });
    if (!r.ok) return res.status(r.status || 500).json({ error: r.data?.message || 'Failed to create broadcast channel' });
    await sbFetch(cfg, '/rest/v1/wg_conversation_members', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=minimal',
      body: [{ conversation_id: id, user_id: uid, role: 'owner', last_read_ms: Date.now() }]
    });
    return res.status(200).json({ ok: true, id, isBroadcast: true, name });
  }

  return null;
}

module.exports = {
  runScheduledMaintenance,
  handleSafetyGet,
  handleSafetyPost
};
