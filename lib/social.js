const crypto = require('node:crypto');
const {
  isMissingRelationErr,
  normalizeUsername,
  normalizeEmail,
  EMAIL_RE,
  sbFetch,
  signDownloadUrl,
  deleteMediaObjects,
  signUrlMap,
  mapPublicProfile,
  sanitizeSafeUrl,
  normalizeLinks,
  normalizePostTags,
  getBlockSets,
  createNotification
} = require('./sb');

function mapPostsAndInteractions({ viewerId, profiles, postsRaw, likesRaw, commentsRaw, savesRaw, urlMap }) {
  const pMap = new Map(profiles.map(p => [p.id, mapPublicProfile(p, p.avatar_path ? (urlMap.get(p.avatar_path) || null) : null)]));

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
      parentId: cm.parent_id || null,
      pinned: Boolean(cm.pinned),
      likesCount: Number(cm.likes_count || 0),
      authorName: cm.author_name || au?.display_name || 'User',
      authorUsername: au?.username || null,
      authorAvatarUrl: au?.avatarUrl || null,
      text: cm.text,
      createdAt: cm.created_at
    });
  }

  const viewerSaved = new Set();
  const viewerReposted = new Set();
  for (const sv of savesRaw) {
    if (sv.user_id === viewerId) {
      if (sv.kind === 'repost') viewerReposted.add(sv.post_id);
      else viewerSaved.add(sv.post_id);
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
      archived: Boolean(pt.archived),
      pinnedAt: pt.pinned_at || null,
      photoTags: Array.isArray(pt.photo_tags) ? pt.photo_tags : [],
      coAuthorIds: Array.isArray(pt.co_author_ids) ? pt.co_author_ids : [],
      commentsMode: pt.comments_mode || 'everyone',
      hideLikes: Boolean(pt.hide_likes),
      aspectRatio: pt.aspect_ratio || '1:1',
      audioTrack: pt.audio_track || '',
      viewsCount: Number(pt.views_count || 0),
      publishAt: pt.publish_at || null,
      createdAt: pt.created_at,
      likesCount: likesByPost.get(pt.id) ?? Number(pt.likes_count || 0),
      commentsCount: cmList.length || Number(pt.comments_count || 0),
      likedByMe: likedByMe.has(pt.id),
      savedByMe: viewerSaved.has(pt.id),
      repostedByMe: viewerReposted.has(pt.id),
      comments: cmList
    };
  };

  return { pMap, mappedPosts: postsRaw.map(mapPost) };
}

async function fetchPostInteractions(cfg, postIds) {
  const cleanIds = [...new Set((postIds || []).filter(Boolean))];
  if (!cleanIds.length) return { likesRaw: [], commentsRaw: [], savesRaw: [] };
  const inList = encodeURIComponent(cleanIds.map(id => `"${String(id).replace(/"/g, '')}"`).join(','));
  const [likesRes, comRes, savesRes] = await Promise.all([
    sbFetch(cfg, `/rest/v1/wg_post_likes?post_id=in.(${inList})&select=post_id,user_id`),
    sbFetch(cfg, `/rest/v1/wg_post_comments?post_id=in.(${inList})&order=created_at.asc&limit=400`),
    sbFetch(cfg, `/rest/v1/wg_post_saves?post_id=in.(${inList})&select=post_id,user_id,kind,created_at`)
  ]);
  return {
    likesRaw: likesRes.ok && Array.isArray(likesRes.data) ? likesRes.data : [],
    commentsRaw: comRes.ok && Array.isArray(comRes.data) ? comRes.data : [],
    savesRaw: savesRes.ok && Array.isArray(savesRes.data) ? savesRes.data : []
  };
}

async function assembleProfilePayload(cfg, viewerId, { userId, username }) {
  const [profilesRes, blocks] = await Promise.all([
    sbFetch(cfg, '/rest/v1/wg_profiles?select=*&order=display_name.asc'),
    getBlockSets(cfg, viewerId)
  ]);
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
  if (target.id !== viewerId && blocks.all.has(target.id)) {
    return { ok: false, status: 403, error: 'Profile is unavailable' };
  }

  const tid = encodeURIComponent(target.id);
  const uid = encodeURIComponent(viewerId);
  const [followsRes, hlRes, postsRes, reelsRes, statsRes] = await Promise.all([
    sbFetch(cfg, `/rest/v1/wg_follows?select=follower_id,following_id,status,created_at&or=(follower_id.eq.${tid},following_id.eq.${tid},follower_id.eq.${uid})`),
    sbFetch(cfg, `/rest/v1/wg_highlights?user_id=eq.${tid}&order=sort_order.asc,created_at.desc`),
    sbFetch(cfg, '/rest/v1/wg_posts?order=pinned.desc,pinned_at.desc.nullslast,created_at.desc&limit=150'),
    sbFetch(cfg, `/rest/v1/wg_reels?user_id=eq.${tid}&order=created_at.desc&limit=60`),
    sbFetch(cfg, '/rest/v1/rpc/wg_profile_stats', { method: 'POST', body: { p_target_id: target.id } }).catch(() => ({ ok: false }))
  ]);

  const schemaReady = !(isMissingRelationErr(followsRes) || isMissingRelationErr(postsRes));
  const follows = followsRes.ok && Array.isArray(followsRes.data) ? followsRes.data : [];
  const highlightsRaw = hlRes.ok && Array.isArray(hlRes.data) ? hlRes.data : [];
  const allPostsRaw = (postsRes.ok && Array.isArray(postsRes.data) ? postsRes.data : [])
    .filter(pt => !blocks.all.has(pt.user_id) && (!pt.archived || pt.user_id === viewerId));
  const reelsRaw = reelsRes.ok && Array.isArray(reelsRes.data) ? reelsRes.data : [];

  const myFollowRow = follows.find(f => f.follower_id === viewerId && f.following_id === target.id);
  const followStatus = myFollowRow ? (myFollowRow.status === 'pending' ? 'pending' : 'accepted') : 'none';
  const isLocked = Boolean(target.is_private && target.id !== viewerId && followStatus !== 'accepted');

  const visiblePostsRaw = isLocked ? [] : allPostsRaw;
  const { likesRaw, commentsRaw, savesRaw } = await fetchPostInteractions(cfg, visiblePostsRaw.map(p => p.id));

  const pathsToSign = [];
  for (const p of profiles) if (p.avatar_path) pathsToSign.push(p.avatar_path);
  if (!isLocked) {
    for (const h of highlightsRaw) {
      if (h.cover_path) pathsToSign.push(h.cover_path);
      if (Array.isArray(h.slides)) for (const s of h.slides) if (s?.mediaPath) pathsToSign.push(s.mediaPath);
    }
    for (const pt of visiblePostsRaw) {
      if (Array.isArray(pt.media_paths)) for (const mp of pt.media_paths) if (typeof mp === 'string' && mp) pathsToSign.push(mp);
    }
    for (const rl of reelsRaw) if (rl.media_path) pathsToSign.push(rl.media_path);
  }

  const urlMap = await signUrlMap(cfg, pathsToSign);
  const { pMap, mappedPosts: allMappedPosts } = mapPostsAndInteractions({ viewerId, profiles, postsRaw: visiblePostsRaw, likesRaw, commentsRaw, savesRaw, urlMap });

  const acceptedFollows = follows.filter(f => (f.status || 'accepted') === 'accepted' && !blocks.all.has(f.follower_id) && !blocks.all.has(f.following_id));
  const followerIds = acceptedFollows.filter(f => f.following_id === target.id).map(f => f.follower_id);
  const followingIds = acceptedFollows.filter(f => f.follower_id === target.id).map(f => f.following_id);
  const viewerFollowingSet = new Set(acceptedFollows.filter(f => f.follower_id === viewerId).map(f => f.following_id));
  const targetFollowersSet = new Set(followerIds);
  const targetFollowingSet = new Set(followingIds);

  const followers = isLocked ? [] : followerIds.map(id => pMap.get(id)).filter(Boolean);
  const following = isLocked ? [] : followingIds.map(id => pMap.get(id)).filter(Boolean);
  const mutuals = isLocked ? [] : followers.filter(u => u.id !== viewerId && viewerFollowingSet.has(u.id));
  const suggested = [...pMap.values()]
    .filter(u => u.id !== viewerId && u.id !== target.id && !blocks.all.has(u.id) && !viewerFollowingSet.has(u.id))
    .slice(0, 12);

  const targetRepostIds = [];
  const targetSavedIds = [];
  for (const sv of savesRaw) {
    if (sv.user_id === target.id) {
      if (sv.kind === 'repost') targetRepostIds.push(sv.post_id);
      else if (target.id === viewerId) targetSavedIds.push(sv.post_id);
    }
  }

  const postById = new Map(allMappedPosts.map(p => [p.id, p]));
  const ownPosts = allMappedPosts.filter(p => p.userId === target.id && !p.archived)
    .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const archivedPosts = target.id === viewerId ? allMappedPosts.filter(p => p.userId === viewerId && p.archived) : [];

  const targetHandle = normalizeUsername(target.username);
  const taggedPosts = (!isLocked && targetHandle)
    ? allMappedPosts.filter(p => !p.archived && p.userId !== target.id && (p.tags.includes(targetHandle) || new RegExp(`@${targetHandle}\\b`, 'i').test(p.caption)))
    : [];
  const reposts = isLocked ? [] : [...new Set([...targetRepostIds, ...(target.id === viewerId ? targetSavedIds : [])])]
    .map(pid => postById.get(pid))
    .filter(p => p && !p.archived);

  const highlights = isLocked ? [] : highlightsRaw.map(h => ({
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

  const reels = isLocked ? [] : reelsRaw.map(r => ({
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

  const rpcStats = statsRes?.ok && statsRes.data && typeof statsRes.data === 'object' ? statsRes.data : null;
  const targetMapped = pMap.get(target.id);
  const ownerOwnTotal = allPostsRaw.filter(p => p.user_id === target.id && !p.archived).length;
  return {
    ok: true,
    data: {
      ok: true,
      schemaReady,
      profile: {
        ...targetMapped,
        isOwn: target.id === viewerId,
        isFollowing: viewerFollowingSet.has(target.id),
        followStatus,
        lockedByPrivacy: isLocked,
        blockedByMe: blocks.myBlocked.has(target.id),
        followsMe: targetFollowingSet.has(viewerId),
        postsCount: (rpcStats?.postsCount ?? ownerOwnTotal) + reelsRaw.length,
        followersCount: rpcStats?.followersCount ?? targetFollowersSet.size,
        followingCount: rpcStats?.followingCount ?? targetFollowingSet.size
      },
      followers,
      following,
      mutuals,
      highlights,
      posts: ownPosts,
      archivedPosts,
      reels,
      reposts,
      taggedPosts,
      suggested
    }
  };
}

async function getFeedPayload(cfg, viewerId, { mode = 'explore', tag = '', q = '', sort = 'recent', limit = 30, offset = 0, before = '' }) {
  const uid = encodeURIComponent(viewerId);
  const beforeFilter = before ? `&created_at=lt.${encodeURIComponent(before)}` : '';
  const [profilesRes, followsRes, postsRes, blocks, mutesRes, tagsRes] = await Promise.all([
    sbFetch(cfg, '/rest/v1/wg_profiles?select=*&order=display_name.asc'),
    sbFetch(cfg, `/rest/v1/wg_follows?follower_id=eq.${uid}&select=following_id,status`),
    sbFetch(cfg, `/rest/v1/wg_posts?order=created_at.desc${beforeFilter}&limit=120`),
    getBlockSets(cfg, viewerId),
    sbFetch(cfg, `/rest/v1/wg_mutes?user_id=eq.${uid}&select=muted_user_id`).catch(() => ({ ok: false })),
    sbFetch(cfg, `/rest/v1/wg_followed_tags?user_id=eq.${uid}&select=tag`).catch(() => ({ ok: false }))
  ]);
  if (!postsRes.ok && !isMissingRelationErr(postsRes)) {
    return { ok: false, status: postsRes.status || 500, error: postsRes.data?.message || 'Failed to load feed' };
  }

  const profiles = Array.isArray(profilesRes.data) ? profilesRes.data : [];
  const viewerProf = profiles.find(p => p.id === viewerId);
  const hiddenWords = Array.isArray(viewerProf?.hidden_words) ? viewerProf.hidden_words.map(w => String(w || '').toLowerCase()).filter(Boolean) : [];
  const mutedSet = new Set((mutesRes?.ok && Array.isArray(mutesRes.data) ? mutesRes.data : []).map(m => m.muted_user_id));
  const followedTags = new Set((tagsRes?.ok && Array.isArray(tagsRes.data) ? tagsRes.data : []).map(t => String(t.tag || '').toLowerCase()));
  const profilePrivacyMap = new Map(profiles.map(p => [p.id, Boolean(p.is_private)]));
  const follows = followsRes.ok && Array.isArray(followsRes.data) ? followsRes.data : [];
  const followingSet = new Set(follows.filter(f => (f.status || 'accepted') === 'accepted').map(f => f.following_id));
  followingSet.add(viewerId);

  const nowMs = Date.now();
  const hasHidden = text => hiddenWords.length > 0 && hiddenWords.some(w => String(text || '').toLowerCase().includes(w));
  const postsRaw = (postsRes.ok && Array.isArray(postsRes.data) ? postsRes.data : [])
    .filter(pt => !pt.archived
      && (!pt.publish_at || Date.parse(pt.publish_at) <= nowMs)
      && !blocks.all.has(pt.user_id)
      && !mutedSet.has(pt.user_id)
      && !hasHidden(pt.caption)
      && (!profilePrivacyMap.get(pt.user_id) || followingSet.has(pt.user_id)));

  const { likesRaw, commentsRaw, savesRaw } = await fetchPostInteractions(cfg, postsRaw.map(p => p.id));
  const cleanCommentsRaw = hiddenWords.length ? commentsRaw.filter(cm => !hasHidden(cm.text)) : commentsRaw;

  const paths = [];
  for (const p of profiles) if (p.avatar_path) paths.push(p.avatar_path);
  for (const pt of postsRaw) {
    if (Array.isArray(pt.media_paths)) for (const mp of pt.media_paths) if (mp) paths.push(mp);
  }
  const urlMap = await signUrlMap(cfg, paths);
  const { pMap, mappedPosts } = mapPostsAndInteractions({ viewerId, profiles, postsRaw, likesRaw, commentsRaw: cleanCommentsRaw, savesRaw, urlMap });

  const tagCounts = new Map();
  for (const p of mappedPosts) {
    for (const t of p.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const trendingTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ tag: name, count }));

  const cleanTag = normalizeUsername(tag).replace(/^#/, '');
  const cleanQ = String(q || '').trim().toLowerCase();

  let list = mappedPosts;
  if (mode === 'following') {
    list = list.filter(p => followingSet.has(p.userId)
      || (Array.isArray(p.coAuthorIds) && p.coAuthorIds.some(id => followingSet.has(id)))
      || (p.tags || []).some(t => followedTags.has(t)));
  } else if (mode === 'trending' || sort === 'engaged') {
    list = [...list].sort((a, b) => ((b.likesCount * 2 + b.commentsCount * 3) - (a.likesCount * 2 + a.commentsCount * 3)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  } else if (sort === 'mutuals') {
    list = [...list].sort((a, b) => (Number(followingSet.has(b.userId)) - Number(followingSet.has(a.userId))) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  if (cleanTag) {
    list = list.filter(p => (p.tags || []).includes(cleanTag));
  }
  if (cleanQ) {
    list = list.filter(p =>
      p.caption.toLowerCase().includes(cleanQ)
      || (p.locationText || '').toLowerCase().includes(cleanQ)
      || (p.author?.display_name || '').toLowerCase().includes(cleanQ)
      || (p.author?.username || '').toLowerCase().includes(cleanQ)
      || (p.tags || []).some(t => t.includes(cleanQ.replace(/^#/, '')))
    );
  }

  const safeLimit = Math.min(60, Math.max(1, Number(limit) || 30));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const paged = list.slice(safeOffset, safeOffset + safeLimit);
  const creators = [...pMap.values()]
    .filter(u => u.id !== viewerId && !blocks.all.has(u.id))
    .filter(u => !cleanQ || (u.display_name || '').toLowerCase().includes(cleanQ) || (u.username || '').toLowerCase().includes(cleanQ))
    .map(u => ({ ...u, isFollowing: followingSet.has(u.id) }))
    .slice(0, 20);
  const nextCursor = paged.length ? paged[paged.length - 1].createdAt : null;

  return {
    ok: true,
    data: {
      ok: true,
      mode,
      posts: paged,
      creators,
      trendingTags,
      nextCursor,
      hasMore: safeOffset + safeLimit < list.length
    }
  };
}

async function handleSocialGet(action, cfg, req, res, session) {
  const uid = session.user.id;
  if (action === 'users') {
    const r = await sbFetch(cfg, `/rest/v1/wg_profiles?id=neq.${encodeURIComponent(uid)}&select=*&order=display_name.asc`);
    const list = Array.isArray(r.data) ? r.data : [];
    const uMap = await signUrlMap(cfg, list.map(p => p.avatar_path).filter(Boolean));
    return res.status(r.ok ? 200 : r.status).json({ users: list.map(p => mapPublicProfile(p, p.avatar_path ? (uMap.get(p.avatar_path) || null) : null)) });
  }
  if (action === 'profileData') {
    const result = await assembleProfilePayload(cfg, uid, {
      userId: req.query?.userId || '',
      username: req.query?.username || ''
    });
    if (!result.ok) return res.status(result.status || 500).json({ error: result.error });
    return res.status(200).json(result.data);
  }
  if (action === 'feedData') {
    const result = await getFeedPayload(cfg, uid, {
      mode: req.query?.mode || 'explore',
      tag: req.query?.tag || '',
      q: req.query?.q || '',
      sort: req.query?.sort || 'recent',
      limit: req.query?.limit,
      offset: req.query?.offset,
      before: req.query?.before || ''
    });
    if (!result.ok) return res.status(result.status || 500).json({ error: result.error });
    return res.status(200).json(result.data);
  }
  if (action === 'blockedUsers') {
    const blocks = await getBlockSets(cfg, uid);
    if (!blocks.myBlocked.size) return res.status(200).json({ ok: true, users: [] });
    const pRes = await sbFetch(cfg, '/rest/v1/wg_profiles?select=id,username,display_name,avatar_path');
    const profs = Array.isArray(pRes.data) ? pRes.data.filter(p => blocks.myBlocked.has(p.id)) : [];
    const avMap = await signUrlMap(cfg, profs.map(p => p.avatar_path).filter(Boolean));
    return res.status(200).json({ ok: true, users: profs.map(p => mapPublicProfile(p, p.avatar_path ? (avMap.get(p.avatar_path) || null) : null)) });
  }
  if (action === 'followRequests') {
    const fr = await sbFetch(cfg, `/rest/v1/wg_follows?following_id=eq.${encodeURIComponent(uid)}&status=eq.pending&select=follower_id,created_at`);
    if (!fr.ok || !Array.isArray(fr.data) || !fr.data.length) return res.status(200).json({ ok: true, requests: [] });
    const pRes = await sbFetch(cfg, '/rest/v1/wg_profiles?select=id,username,display_name,avatar_path,verified');
    const pMap = new Map((Array.isArray(pRes.data) ? pRes.data : []).map(p => [p.id, p]));
    const avMap = await signUrlMap(cfg, [...pMap.values()].map(p => p.avatar_path).filter(Boolean));
    const requests = fr.data.map(r => {
      const p = pMap.get(r.follower_id);
      return p ? mapPublicProfile(p, p.avatar_path ? (avMap.get(p.avatar_path) || null) : null) : { id: r.follower_id, display_name: 'Member' };
    });
    return res.status(200).json({ ok: true, requests });
  }
  if (action === 'storyViewers') {
    const storyId = String(req.query?.storyId || '').trim();
    if (!storyId) return res.status(400).json({ error: 'storyId required' });
    const sr = await sbFetch(cfg, `/rest/v1/wg_stories?id=eq.${encodeURIComponent(storyId)}&select=id,user_id&limit=1`);
    const st = Array.isArray(sr.data) ? sr.data[0] : null;
    if (!st) return res.status(404).json({ error: 'Story not found' });
    if (st.user_id && st.user_id !== uid) return res.status(403).json({ error: 'Only story author can view list' });
    const vr = await sbFetch(cfg, `/rest/v1/wg_story_views?story_id=eq.${encodeURIComponent(storyId)}&select=user_id,viewed_at`).catch(() => ({ ok: false }));
    const rows = vr.ok && Array.isArray(vr.data) ? vr.data : [];
    const pRes = await sbFetch(cfg, '/rest/v1/wg_profiles?select=id,username,display_name,avatar_path,verified');
    const pMap = new Map((Array.isArray(pRes.data) ? pRes.data : []).map(p => [p.id, p]));
    const avMap = await signUrlMap(cfg, [...pMap.values()].map(p => p.avatar_path).filter(Boolean));
    const viewers = rows.map(r => {
      const p = pMap.get(r.user_id);
      return { ...(p ? mapPublicProfile(p, p.avatar_path ? (avMap.get(p.avatar_path) || null) : null) : { id: r.user_id, display_name: 'Member' }), viewedAt: r.viewed_at };
    });
    return res.status(200).json({ ok: true, viewers, count: viewers.length });
  }
  if (action === 'notifications') {
    const r = await sbFetch(cfg, `/rest/v1/wg_notifications?user_id=eq.${encodeURIComponent(uid)}&order=created_at.desc&limit=50`);
    if (!r.ok && isMissingRelationErr(r)) {
      return res.status(200).json({ ok: true, notifications: [], schemaReady: false });
    }
    if (!r.ok) return res.status(r.status || 500).json({ error: r.data?.message || 'Failed to load notifications' });
    const list = (Array.isArray(r.data) ? r.data : []).map(n => ({
      id: n.id,
      kind: n.kind,
      actorId: n.actor_id,
      actorName: n.actor_name,
      entityId: n.entity_id,
      preview: n.preview,
      read: Boolean(n.read_at),
      createdAt: n.created_at
    }));
    const unreadCount = list.filter(n => !n.read).length;
    return res.status(200).json({ ok: true, notifications: list, unreadCount });
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
  return null;
}

async function handleSocialPost(act, cfg, req, res, session, body) {
  const uid = session.user.id;

  if (act === 'createStory') {
    const s = body.story || {};
    const row = {
      id: String(s.id),
      user_id: uid,
      author_name: String(s.name || 'You'),
      bg: String(s.bg),
      question: String(s.q),
      ...(s.mediaPath ? { media_path: s.mediaPath, media_mime: s.mediaMime || null } : {}),
      ...(s.audience === 'close_friends' ? { audience: 'close_friends' } : {}),
      ...(Array.isArray(s.stickers) && s.stickers.length ? { stickers: s.stickers.slice(0, 10) } : {}),
      ...(s.publishAt ? { publish_at: s.publishAt } : {}),
      yes_count: Number(s.yes || 1),
      no_count: Number(s.no || 0),
      link: String(s.link || ''),
      co_author: String(s.co || '')
    };
    const r = await sbFetch(cfg, '/rest/v1/wg_stories', { method: 'POST', prefer: 'return=minimal', body: [row] });
    return res.status(r.ok ? 200 : r.status).json({ ok: r.ok });
  }

  if (act === 'deleteStory') {
    const storyId = String(body.storyId || '').trim();
    if (!storyId) return res.status(400).json({ error: 'storyId required' });
    const sr = await sbFetch(cfg, `/rest/v1/wg_stories?id=eq.${encodeURIComponent(storyId)}&select=id,user_id,media_path&limit=1`);
    const st = Array.isArray(sr.data) ? sr.data[0] : null;
    if (!st) return res.status(404).json({ error: 'Story not found' });
    if (st.user_id && st.user_id !== uid) return res.status(403).json({ error: 'Only the author can delete this story' });
    if (st.media_path) await deleteMediaObjects(cfg, [st.media_path]);
    const dr = await sbFetch(cfg, `/rest/v1/wg_stories?id=eq.${encodeURIComponent(storyId)}`, { method: 'DELETE' });
    if (!dr.ok) return res.status(dr.status || 500).json({ error: 'Failed to delete story' });
    return res.status(200).json({ ok: true });
  }

  if (act === 'voteStory') {
    const storyId = String(body.storyId || '').trim();
    const choice = body.choice === 'no' ? 'no' : 'yes';
    if (!storyId) return res.status(400).json({ error: 'storyId required' });

    // Prefer atomic Postgres RPC (wg_vote_story); fall back cleanly for older DBs or test mocks without RPC
    const rpc = await sbFetch(cfg, '/rest/v1/rpc/wg_vote_story', {
      method: 'POST',
      userJwt: session.accessToken,
      body: { p_story_id: storyId, p_choice: choice }
    }).catch(() => ({ ok: false, status: 404 }));

    if (rpc.ok && rpc.data && typeof rpc.data === 'object') {
      return res.status(200).json({
        ok: true,
        yes: rpc.data.yes_count,
        no: rpc.data.no_count,
        choice: rpc.data.choice || choice,
        alreadyVoted: Boolean(rpc.data.already_voted)
      });
    }

    const voteRes = await sbFetch(cfg, '/rest/v1/wg_story_votes', {
      method: 'POST',
      prefer: 'return=minimal',
      body: [{ story_id: storyId, user_id: uid, choice }]
    });
    if (voteRes.ok) {
      const curStory = await sbFetch(cfg, `/rest/v1/wg_stories?id=eq.${encodeURIComponent(storyId)}&select=yes_count,no_count`);
      const row = Array.isArray(curStory.data) ? curStory.data[0] : null;
      if (row) {
        const nextYes = choice === 'yes' ? (row.yes_count || 0) + 1 : (row.yes_count || 0);
        const nextNo = choice === 'no' ? (row.no_count || 0) + 1 : (row.no_count || 0);
        const patch = choice === 'yes' ? { yes_count: nextYes } : { no_count: nextNo };
        await sbFetch(cfg, `/rest/v1/wg_stories?id=eq.${encodeURIComponent(storyId)}`, { method: 'PATCH', body: patch });
        return res.status(200).json({ ok: true, yes: nextYes, no: nextNo, choice, alreadyVoted: false });
      }
    }
    return res.status(200).json({ ok: true });
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
      ...(rl.audioId ? { audio_id: String(rl.audioId).slice(0, 60) } : {}),
      ...(rl.remixOf ? { remix_of: String(rl.remixOf).slice(0, 60) } : {}),
      likes_count: Number(rl.likes || 1)
    };
    const r = await sbFetch(cfg, '/rest/v1/wg_reels', { method: 'POST', prefer: 'return=minimal', body: [row] });
    return res.status(r.ok ? 200 : r.status).json({ ok: r.ok, id: /^\d+$/.test(reelId) ? Number(reelId) : reelId });
  }

  if (act === 'deleteReel') {
    const reelId = body.reelId != null ? String(body.reelId).trim() : '';
    if (!reelId) return res.status(400).json({ error: 'reelId required' });
    const rr = await sbFetch(cfg, `/rest/v1/wg_reels?id=eq.${encodeURIComponent(reelId)}&select=id,user_id,media_path&limit=1`);
    const reel = Array.isArray(rr.data) ? rr.data[0] : null;
    if (!reel) return res.status(404).json({ error: 'Reel not found' });
    if (reel.user_id !== uid) return res.status(403).json({ error: 'Only the creator can delete this reel' });
    if (reel.media_path) await deleteMediaObjects(cfg, [reel.media_path]);
    await sbFetch(cfg, `/rest/v1/wg_reel_comments?reel_id=eq.${encodeURIComponent(reelId)}`, { method: 'DELETE' }).catch(() => null);
    const dr = await sbFetch(cfg, `/rest/v1/wg_reels?id=eq.${encodeURIComponent(reelId)}`, { method: 'DELETE' });
    if (!dr.ok) return res.status(dr.status || 500).json({ error: 'Failed to delete reel' });
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
    const rawId = body.reelId != null ? String(body.reelId).trim() : '';
    if (!/^(\d+|rl_[a-zA-Z0-9_-]{2,40})$/.test(rawId)) {
      return res.status(400).json({ error: 'Valid reelId required' });
    }
    const storedReelId = /^\d+$/.test(rawId) ? Number(rawId) : rawId;
    await sbFetch(cfg, '/rest/v1/wg_reel_comments', {
      method: 'POST',
      prefer: 'return=minimal',
      body: [{ id: String(body.id || `rc_${Date.now().toString(36)}`), reel_id: storedReelId, user_id: uid, author_name: String(body.authorName || 'You'), body: String(body.text || '') }]
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
    if (body.isPrivate !== undefined) patch.is_private = Boolean(body.isPrivate);
    if (body.avatarPath !== undefined) {
      const ap = String(body.avatarPath || '').trim();
      if (ap && (!ap.startsWith(`${uid}/`) || ap.includes('..'))) {
        return res.status(403).json({ error: 'Invalid avatar storage path' });
      }
      patch.avatar_path = ap;
    }
    let r = await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(uid)}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: patch
    });
    if (!r.ok && 'is_private' in patch && /is_private/i.test(String(r.data?.message || ''))) {
      const fallbackPatch = { ...patch };
      delete fallbackPatch.is_private;
      r = await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: fallbackPatch
      });
    }
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
    const [blocks, tpRes, chk] = await Promise.all([
      getBlockSets(cfg, uid),
      sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(targetId)}&select=id,is_private&limit=1`),
      sbFetch(cfg, `/rest/v1/wg_follows?follower_id=eq.${encodeURIComponent(uid)}&following_id=eq.${encodeURIComponent(targetId)}&select=follower_id,status`)
    ]);
    if (blocks.all.has(targetId)) return res.status(403).json({ error: 'Cannot follow this user due to block settings' });
    if (!chk.ok) {
      return res.status(chk.status || 500).json({ error: isMissingRelationErr(chk) ? 'Follows table missing. Re-run updated supabase/schema.sql in Supabase SQL Editor.' : (chk.data?.message || 'Follow lookup failed') });
    }
    const existingRow = Array.isArray(chk.data) ? chk.data[0] : null;
    if (existingRow) {
      const dr = await sbFetch(cfg, `/rest/v1/wg_follows?follower_id=eq.${encodeURIComponent(uid)}&following_id=eq.${encodeURIComponent(targetId)}`, { method: 'DELETE' });
      if (!dr.ok) return res.status(dr.status || 500).json({ error: 'Unfollow failed' });
      return res.status(200).json({ ok: true, following: false, requested: false, status: 'none' });
    }
    const targetProf = Array.isArray(tpRes.data) ? tpRes.data[0] : null;
    const isPrivateTarget = Boolean(targetProf?.is_private);
    const nextStatus = isPrivateTarget ? 'pending' : 'accepted';
    let ir = await sbFetch(cfg, '/rest/v1/wg_follows', {
      method: 'POST',
      prefer: 'return=minimal',
      body: [{ follower_id: uid, following_id: targetId, status: nextStatus }]
    });
    if (!ir.ok && /status/i.test(String(ir.data?.message || ''))) {
      ir = await sbFetch(cfg, '/rest/v1/wg_follows', {
        method: 'POST',
        prefer: 'return=minimal',
        body: [{ follower_id: uid, following_id: targetId }]
      });
    }
    if (!ir.ok) return res.status(ir.status || 500).json({ error: ir.data?.message || 'Follow failed' });
    createNotification(cfg, {
      userId: targetId,
      actorId: uid,
      actorName: session.user.user_metadata?.display_name || session.user.user_metadata?.username || '',
      kind: isPrivateTarget ? 'follow_request' : 'follow',
      entityId: uid,
      preview: isPrivateTarget ? 'requested to follow you' : 'started following you'
    }).catch(() => null);
    return res.status(200).json({
      ok: true,
      following: nextStatus === 'accepted',
      requested: nextStatus === 'pending',
      status: nextStatus
    });
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
      pinned_at: pinned ? new Date().toISOString() : null,
      ...(p.aspectRatio && ['1:1', '4:5', '16:9'].includes(p.aspectRatio) ? { aspect_ratio: p.aspectRatio } : {}),
      ...(p.audioTrack ? { audio_track: String(p.audioTrack).slice(0, 80) } : {}),
      ...(p.commentsMode && ['everyone', 'followers', 'off'].includes(p.commentsMode) ? { comments_mode: p.commentsMode } : {}),
      ...(typeof p.hideLikes === 'boolean' ? { hide_likes: p.hideLikes } : {}),
      ...(p.publishAt ? { publish_at: p.publishAt } : {}),
      ...(Array.isArray(p.photoTags) && p.photoTags.length ? { photo_tags: p.photoTags.slice(0, 20) } : {}),
      ...(Array.isArray(p.coAuthorIds) && p.coAuthorIds.length ? { co_author_ids: p.coAuthorIds.filter(Boolean).slice(0, 5) } : {})
    };
    const ir = await sbFetch(cfg, '/rest/v1/wg_posts', { method: 'POST', prefer: 'return=representation', body: [row] });
    if (!ir.ok) {
      return res.status(ir.status || 500).json({ error: isMissingRelationErr(ir) ? 'Posts table missing. Re-run updated supabase/schema.sql in Supabase SQL Editor.' : (ir.data?.message || 'Failed to publish post') });
    }
    const created = Array.isArray(ir.data) ? ir.data[0] : row;
    return res.status(200).json({ ok: true, id: postId, post: created });
  }

  if (act === 'editPost') {
    const postId = String(body.postId || '').trim();
    if (!postId) return res.status(400).json({ error: 'postId required' });
    const pr = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}&select=id,user_id,caption,media_paths&limit=1`);
    const post = Array.isArray(pr.data) ? pr.data[0] : null;
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.user_id !== uid) return res.status(403).json({ error: 'Only the author can edit this post' });
    const caption = body.caption !== undefined ? String(body.caption || '').slice(0, 1200) : post.caption;
    const hasMedia = Array.isArray(post.media_paths) && post.media_paths.length > 0;
    if (!String(caption || '').trim() && !hasMedia) {
      return res.status(400).json({ error: 'Post must have a caption or media' });
    }
    const patch = {
      caption,
      tags: normalizePostTags(body.tags, caption)
    };
    if (body.locationText !== undefined) patch.location_text = String(body.locationText || '').trim().slice(0, 120);
    if (body.bg !== undefined) patch.bg = String(body.bg || 'from-indigo-600 via-fuchsia-600 to-rose-500').slice(0, 120);
    const up = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: patch
    });
    if (!up.ok) return res.status(up.status || 500).json({ error: up.data?.message || 'Failed to update post' });
    const updated = Array.isArray(up.data) ? up.data[0] : { ...post, ...patch };
    return res.status(200).json({ ok: true, post: updated });
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
      const pr = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}&select=user_id,caption&limit=1`).catch(() => ({ ok: false }));
      const ownerId = Array.isArray(pr.data) && pr.data[0]?.user_id;
      if (ownerId && ownerId !== uid) {
        createNotification(cfg, {
          userId: ownerId,
          actorId: uid,
          actorName: session.user.user_metadata?.display_name || session.user.user_metadata?.username || '',
          kind: 'like',
          entityId: postId,
          preview: `liked your post: "${String(pr.data[0].caption || '').slice(0, 60)}"`
        }).catch(() => null);
      }
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
      if (kind === 'repost') {
        const pr = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}&select=user_id,caption&limit=1`).catch(() => ({ ok: false }));
        const ownerId = Array.isArray(pr.data) && pr.data[0]?.user_id;
        if (ownerId && ownerId !== uid) {
          createNotification(cfg, {
            userId: ownerId,
            actorId: uid,
            actorName: session.user.user_metadata?.display_name || session.user.user_metadata?.username || '',
            kind: 'repost',
            entityId: postId,
            preview: 'reposted your post'
          }).catch(() => null);
        }
      }
    }
    return res.status(200).json({ ok: true, active: !exists, kind });
  }

  if (act === 'addPostComment') {
    const postId = String(body.postId || '').trim();
    const text = String(body.text || '').trim().slice(0, 500);
    if (!postId || !text) return res.status(400).json({ error: 'postId and comment text required' });
    const postMetaRes = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}&select=user_id,comments_mode&limit=1`).catch(() => ({ ok: false }));
    const postMeta = Array.isArray(postMetaRes?.data) && postMetaRes.data[0] ? postMetaRes.data[0] : {};
    if (postMeta.comments_mode === 'off' && postMeta.user_id !== uid) {
      return res.status(403).json({ error: 'Comments are turned off for this post' });
    }
    const pRes = await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(uid)}&select=username,display_name,avatar_path&limit=1`);
    const pRow = Array.isArray(pRes.data) ? pRes.data[0] : null;
    const authorName = String(body.authorName || pRow?.display_name || pRow?.username || 'You').slice(0, 60);
    const id = String(body.id || `pc_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`);
    const parentId = body.parentId ? String(body.parentId).trim().slice(0, 80) : null;
    const ir = await sbFetch(cfg, '/rest/v1/wg_post_comments', {
      method: 'POST',
      prefer: 'return=representation',
      body: [{ id, post_id: postId, user_id: uid, author_name: authorName, text, ...(parentId ? { parent_id: parentId } : {}) }]
    });
    if (!ir.ok) return res.status(ir.status || 500).json({ error: ir.data?.message || 'Comment failed' });
    const row = Array.isArray(ir.data) ? ir.data[0] : { id, post_id: postId, user_id: uid, author_name: authorName, text, parent_id: parentId, created_at: new Date().toISOString() };
    const avSigned = pRow?.avatar_path ? await signDownloadUrl(cfg, pRow.avatar_path).catch(() => null) : null;
    const ownerId = postMeta.user_id || null;
    if (ownerId && ownerId !== uid) {
      createNotification(cfg, {
        userId: ownerId,
        actorId: uid,
        actorName: authorName,
        kind: 'comment',
        entityId: postId,
        preview: `commented: "${text.slice(0, 80)}"`
      }).catch(() => null);
    }
    return res.status(200).json({
      ok: true,
      comment: {
        id: row.id,
        postId: row.post_id,
        userId: row.user_id,
        parentId: row.parent_id || parentId || null,
        pinned: Boolean(row.pinned),
        likesCount: Number(row.likes_count || 0),
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
    const hr = await sbFetch(cfg, `/rest/v1/wg_highlights?id=eq.${encodeURIComponent(id)}&select=id,user_id,cover_path,slides&limit=1`);
    const hl = Array.isArray(hr.data) ? hr.data[0] : null;
    if (!hl) return res.status(404).json({ error: 'Highlight not found' });
    if (hl.user_id !== uid) return res.status(403).json({ error: 'Forbidden' });
    const mediaPaths = [];
    if (hl.cover_path) mediaPaths.push(hl.cover_path);
    if (Array.isArray(hl.slides)) {
      for (const s of hl.slides) if (s?.mediaPath) mediaPaths.push(s.mediaPath);
    }
    if (mediaPaths.length) await deleteMediaObjects(cfg, mediaPaths);
    await sbFetch(cfg, `/rest/v1/wg_highlights?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    return res.status(200).json({ ok: true });
  }

  if (act === 'markNotificationsRead') {
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    const nowIso = new Date().toISOString();
    const filter = ids.length
      ? `&id=in.(${encodeURIComponent(ids.map(x => `"${String(x).replace(/"/g, '')}"`).join(','))})`
      : '&read_at=is.null';
    await sbFetch(cfg, `/rest/v1/wg_notifications?user_id=eq.${encodeURIComponent(uid)}${filter}`, {
      method: 'PATCH',
      body: { read_at: nowIso }
    }).catch(() => null);
    return res.status(200).json({ ok: true });
  }

  if (act === 'clearAudit') {
    await sbFetch(cfg, `/rest/v1/wg_audit_logs?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' });
    return res.status(200).json({ ok: true });
  }

  if (act === 'purgeEnclave') {
    const euid = encodeURIComponent(uid);
    const [mr, pr, hr, sr, rr, profRes] = await Promise.all([
      sbFetch(cfg, `/rest/v1/wg_messages?sender_id=eq.${euid}&media_path=not.is.null&select=media_path`),
      sbFetch(cfg, `/rest/v1/wg_posts?user_id=eq.${euid}&select=media_paths`),
      sbFetch(cfg, `/rest/v1/wg_highlights?user_id=eq.${euid}&select=cover_path,slides`),
      sbFetch(cfg, `/rest/v1/wg_stories?user_id=eq.${euid}&media_path=not.is.null&select=media_path`).catch(() => ({ ok: false })),
      sbFetch(cfg, `/rest/v1/wg_reels?user_id=eq.${euid}&media_path=not.is.null&select=media_path`).catch(() => ({ ok: false })),
      sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${euid}&select=avatar_path&limit=1`).catch(() => ({ ok: false }))
    ]);
    const msgPaths = Array.isArray(mr.data) ? mr.data.map(x => x.media_path).filter(Boolean) : [];
    const postPaths = Array.isArray(pr.data) ? pr.data.flatMap(x => Array.isArray(x.media_paths) ? x.media_paths : []).filter(Boolean) : [];
    const hlPaths = Array.isArray(hr.data) ? hr.data.flatMap(x => [
      x.cover_path,
      ...(Array.isArray(x.slides) ? x.slides.map(s => s?.mediaPath) : [])
    ]).filter(Boolean) : [];
    const storyPaths = Array.isArray(sr.data) ? sr.data.map(x => x.media_path).filter(Boolean) : [];
    const reelPaths = Array.isArray(rr.data) ? rr.data.map(x => x.media_path).filter(Boolean) : [];
    const avatarPaths = Array.isArray(profRes.data) && profRes.data[0]?.avatar_path ? [profRes.data[0].avatar_path] : [];
    const paths = [...msgPaths, ...postPaths, ...hlPaths, ...storyPaths, ...reelPaths, ...avatarPaths];
    if (paths.length) await deleteMediaObjects(cfg, paths);

    await Promise.all([
      sbFetch(cfg, `/rest/v1/wg_conversations?owner_id=eq.${euid}`, { method: 'DELETE' }),
      sbFetch(cfg, `/rest/v1/wg_settings?user_id=eq.${euid}`, { method: 'DELETE' }),
      sbFetch(cfg, `/rest/v1/wg_reels_prefs?user_id=eq.${euid}`, { method: 'DELETE' }),
      sbFetch(cfg, `/rest/v1/wg_audit_logs?user_id=eq.${euid}`, { method: 'DELETE' }),
      sbFetch(cfg, `/rest/v1/wg_posts?user_id=eq.${euid}`, { method: 'DELETE' }),
      sbFetch(cfg, `/rest/v1/wg_highlights?user_id=eq.${euid}`, { method: 'DELETE' }),
      sbFetch(cfg, `/rest/v1/wg_stories?user_id=eq.${euid}`, { method: 'DELETE' }).catch(() => null),
      sbFetch(cfg, `/rest/v1/wg_reels?user_id=eq.${euid}`, { method: 'DELETE' }).catch(() => null),
      sbFetch(cfg, `/rest/v1/wg_follows?or=(follower_id.eq.${euid},following_id.eq.${euid})`, { method: 'DELETE' }),
      sbFetch(cfg, `/rest/v1/wg_notifications?user_id=eq.${euid}`, { method: 'DELETE' }).catch(() => null),
      sbFetch(cfg, `/rest/v1/wg_push_subscriptions?user_id=eq.${euid}`, { method: 'DELETE' }).catch(() => null),
      sbFetch(cfg, `/rest/v1/wg_key_backups?user_id=eq.${euid}`, { method: 'DELETE' }).catch(() => null),
      sbFetch(cfg, `/rest/v1/wg_blocks?or=(blocker_id.eq.${euid},blocked_id.eq.${euid})`, { method: 'DELETE' }).catch(() => null),
      sbFetch(cfg, `/rest/v1/wg_notes?user_id=eq.${euid}`, { method: 'DELETE' }).catch(() => null),
      sbFetch(cfg, `/rest/v1/wg_story_views?user_id=eq.${euid}`, { method: 'DELETE' }).catch(() => null),
      sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${euid}`, { method: 'PATCH', body: { avatar_path: '', public_key: null, key_fp: null } }).catch(() => null)
    ]);
    return res.status(200).json({ ok: true, purgedMediaCount: paths.length });
  }

  if (act === 'markStoryViewed') {
    const storyId = String(body.storyId || '').trim();
    if (!storyId) return res.status(400).json({ error: 'storyId required' });
    await sbFetch(cfg, '/rest/v1/wg_story_views?on_conflict=story_id,user_id', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=minimal',
      body: [{ story_id: storyId, user_id: uid }]
    }).catch(() => null);
    return res.status(200).json({ ok: true });
  }

  if (act === 'togglePostArchive') {
    const postId = String(body.postId || '').trim();
    if (!postId) return res.status(400).json({ error: 'postId required' });
    const pr = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}&select=id,user_id,archived&limit=1`);
    const post = Array.isArray(pr.data) ? pr.data[0] : null;
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.user_id !== uid) return res.status(403).json({ error: 'Only author can archive' });
    const next = !post.archived;
    const up = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}`, {
      method: 'PATCH',
      body: { archived: next }
    });
    if (!up.ok) return res.status(up.status || 500).json({ error: 'Failed to update archive state' });
    return res.status(200).json({ ok: true, archived: next });
  }

  if (act === 'toggleBlock') {
    const targetId = String(body.targetUserId || '').trim();
    if (!targetId) return res.status(400).json({ error: 'targetUserId required' });
    if (targetId === uid) return res.status(400).json({ error: 'Cannot block yourself' });
    const chk = await sbFetch(cfg, `/rest/v1/wg_blocks?blocker_id=eq.${encodeURIComponent(uid)}&blocked_id=eq.${encodeURIComponent(targetId)}&select=blocked_id`);
    if (!chk.ok && isMissingRelationErr(chk)) {
      return res.status(200).json({ ok: true, blocked: true, localOnly: true });
    }
    const exists = Array.isArray(chk.data) && chk.data.length > 0;
    if (exists) {
      await sbFetch(cfg, `/rest/v1/wg_blocks?blocker_id=eq.${encodeURIComponent(uid)}&blocked_id=eq.${encodeURIComponent(targetId)}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true, blocked: false });
    }
    await sbFetch(cfg, '/rest/v1/wg_blocks', { method: 'POST', prefer: 'return=minimal', body: [{ blocker_id: uid, blocked_id: targetId }] });
    await Promise.all([
      sbFetch(cfg, `/rest/v1/wg_follows?follower_id=eq.${encodeURIComponent(uid)}&following_id=eq.${encodeURIComponent(targetId)}`, { method: 'DELETE' }).catch(() => null),
      sbFetch(cfg, `/rest/v1/wg_follows?follower_id=eq.${encodeURIComponent(targetId)}&following_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }).catch(() => null)
    ]);
    return res.status(200).json({ ok: true, blocked: true });
  }

  if (act === 'reportContent') {
    const targetType = ['user', 'post', 'reel', 'story', 'comment', 'message'].includes(body.targetType) ? body.targetType : 'post';
    const targetId = String(body.targetId || '').trim();
    if (!targetId) return res.status(400).json({ error: 'targetId required' });
    const reason = String(body.reason || 'spam').slice(0, 60);
    const details = String(body.details || '').slice(0, 500);
    const id = `rp_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    const r = await sbFetch(cfg, '/rest/v1/wg_reports', {
      method: 'POST',
      prefer: 'return=minimal',
      body: [{ id, reporter_id: uid, target_type: targetType, target_id: targetId, reason, details }]
    }).catch(() => ({ ok: false }));
    return res.status(200).json({ ok: true, id, saved: Boolean(r?.ok) });
  }

  if (act === 'approveFollow' || act === 'declineFollow') {
    const followerId = String(body.followerId || '').trim();
    if (!followerId) return res.status(400).json({ error: 'followerId required' });
    if (act === 'declineFollow') {
      await sbFetch(cfg, `/rest/v1/wg_follows?follower_id=eq.${encodeURIComponent(followerId)}&following_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true, approved: false });
    }
    await sbFetch(cfg, `/rest/v1/wg_follows?follower_id=eq.${encodeURIComponent(followerId)}&following_id=eq.${encodeURIComponent(uid)}`, {
      method: 'PATCH',
      body: { status: 'accepted' }
    });
    createNotification(cfg, {
      userId: followerId,
      actorId: uid,
      actorName: session.user.user_metadata?.display_name || session.user.user_metadata?.username || '',
      kind: 'follow',
      entityId: uid,
      preview: 'accepted your follow request'
    }).catch(() => null);
    return res.status(200).json({ ok: true, approved: true });
  }

  return null;
}

module.exports = {
  assembleProfilePayload,
  getFeedPayload,
  handleSocialGet,
  handleSocialPost
};
