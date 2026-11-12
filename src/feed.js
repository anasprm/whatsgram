/**
 * Builds local Explore/Following/Trending feed data matching /api/supabase?action=feedData.
 */
export function buildLocalFeedData({ LOCAL_SOCIAL, S }) {
  const viewerId = 'self';
  const now = Date.now();
  const blockedSet = new Set(S?.user?.blockedIds || []);
  const mutedSet = new Set(S?.safety?.mutedIds || []);
  const hiddenWords = (S?.safety?.hiddenWords || []).map((w) => String(w).trim().toLowerCase()).filter(Boolean);
  const profById = new Map((LOCAL_SOCIAL.profiles || []).map((p) => [p.id, p]));
  const followingSet = new Set(
    (LOCAL_SOCIAL.follows || []).filter((f) => f[0] === viewerId).map((f) => f[1])
  );
  const tagCounts = new Map();
  const posts = (LOCAL_SOCIAL.posts || [])
    .filter((pt) => {
      if (pt.archived || blockedSet.has(pt.userId) || mutedSet.has(pt.userId)) return false;
      if (pt.scheduledAt && pt.userId !== viewerId && new Date(pt.scheduledAt).getTime() > now) return false;
      if (hiddenWords.length && pt.userId !== viewerId) {
        const cap = String(pt.caption || '').toLowerCase();
        if (hiddenWords.some((w) => cap.includes(w))) return false;
      }
      return true;
    })
    .map((pt) => {
      const author = profById.get(pt.userId) || profById.get('self') || { id: pt.userId, username: 'creator', display_name: 'Creator' };
      const likes = (LOCAL_SOCIAL.likes || []).filter((l) => l[0] === pt.id);
      const cms = (LOCAL_SOCIAL.comments || []).filter((c) => c.postId === pt.id);
      const saves = (LOCAL_SOCIAL.saves || []).filter((s) => s[0] === pt.id);
      (pt.tags || []).forEach((t) => {
        const k = String(t || '').trim().toLowerCase();
        if (k) tagCounts.set(k, (tagCounts.get(k) || 0) + 1);
      });
      return {
        ...pt,
        author,
        likesCount: likes.length,
        likedByMe: likes.some((l) => l[1] === viewerId),
        commentsCount: cms.length,
        comments: cms,
        savedByMe: saves.some((s) => s[1] === viewerId && s[2] === 'save'),
        repostedByMe: saves.some((s) => s[1] === viewerId && s[2] === 'repost'),
        fromFollowing: followingSet.has(pt.userId) || pt.userId === viewerId
      };
    });
  const creators = (LOCAL_SOCIAL.profiles || [])
    .filter((p) => p.id !== viewerId && !blockedSet.has(p.id) && !mutedSet.has(p.id))
    .map((p) => {
      const targetFollowsBack = (LOCAL_SOCIAL.follows || []).some((f) => f[0] === p.id && f[1] === viewerId);
      const mutualCount = (LOCAL_SOCIAL.follows || []).filter((f) => followingSet.has(f[0]) && f[1] === p.id).length;
      return {
        ...p,
        isFollowing: followingSet.has(p.id),
        followsBack: targetFollowsBack,
        mutualCount
      };
    });
  const trendingTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
  return { posts, creators, trendingTags, hasMore: false };
}

/**
 * Renders the interactive Explore / Feed view into #feed-root.
 */
export function renderFeedDOM(root, ctx) {
  if (!root) return;
  const {
    S, POST_BGS, VERIFIED_BADGE_SVG, esc, ic,
    renderAvatarCircle, renderBioText, fmtCompactCount, timeAgo
  } = ctx;

  const data = S.feedData || { posts: [], creators: [], trendingTags: [] };
  const tab = S.feedTab || 'explore';
  const sortMode = S.feedSort || (tab === 'trending' ? 'engaged' : 'recent');
  const q = (S.feedQ || '').trim().toLowerCase();
  const activeTag = (S.feedTag || '').trim().toLowerCase();
  const mutedSet = new Set(S.safety?.mutedIds || []);
  const followedTags = new Set((S.safety?.followedTags || []).map((t) => String(t).toLowerCase()));
  const hiddenWords = (S.safety?.hiddenWords || []).map((w) => String(w).trim().toLowerCase()).filter(Boolean);
  const meId = S.user?.id || 'self';

  let posts = [...(data.posts || [])].filter((p) => {
    const isOwn = p.userId === meId || (!S.user && p.userId === 'self');
    if (!isOwn && mutedSet.has(p.userId)) return false;
    if (!isOwn && hiddenWords.length) {
      const cap = String(p.caption || '').toLowerCase();
      if (hiddenWords.some((w) => cap.includes(w))) return false;
    }
    if (p.scheduledAt && !isOwn && new Date(p.scheduledAt).getTime() > Date.now()) return false;
    return true;
  });
  if (tab === 'following') {
    posts = posts.filter((p) => p.fromFollowing || p.userId === meId || (p.tags || []).some((t) => followedTags.has(String(t).toLowerCase())));
  }
  if (activeTag) {
    posts = posts.filter((p) =>
      (p.tags || []).some((t) => String(t).toLowerCase() === activeTag) ||
      String(p.caption || '').toLowerCase().includes('#' + activeTag)
    );
  }
  if (q) {
    posts = posts.filter((p) => {
      const au = p.author || {};
      const hay = `${au.display_name || ''} ${au.username || ''} ${p.caption || ''} ${p.locationText || ''} ${p.coauthorHandle || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if (tab === 'trending' || sortMode === 'engaged') {
    posts.sort((a, b) => ((b.likesCount || 0) + (b.commentsCount || 0) * 2) - ((a.likesCount || 0) + (a.commentsCount || 0) * 2));
  } else if (sortMode === 'mutuals') {
    posts.sort((a, b) => {
      const ma = a.fromFollowing ? 1 : 0;
      const mb = b.fromFollowing ? 1 : 0;
      if (mb !== ma) return mb - ma;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  } else {
    posts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  const tags = data.trendingTags || [];
  const restrictedSet = new Set(S.safety?.restrictedIds || []);
  const creators = (data.creators || []).filter((c) => !mutedSet.has(c.id) && !restrictedSet.has(c.id));
  const layout = S.feedLayout === 'grid' ? 'grid' : 'cards';

  if (S.feedLoading && !posts.length) {
    root.innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${[0, 1, 2, 3].map(() => `
      <div class="lux-card rounded-[22px] overflow-hidden p-4 space-y-3">
        <div class="flex items-center gap-2.5"><div class="w-8 h-8 rounded-full skel"></div><div class="space-y-1.5 flex-1"><div class="h-3 w-28 rounded skel"></div><div class="h-2.5 w-20 rounded skel"></div></div></div>
        <div class="h-48 w-full rounded-2xl skel"></div>
        <div class="h-3 w-3/4 rounded skel"></div>
      </div>`).join('')}</div>`;
    return;
  }

  const creatorHtml = creators.length
    ? `<div class="space-y-2">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-bold uppercase tracking-wider text-zinc-400">Creators to discover</h2>
          <button type="button" data-act="refreshFeed" class="text-[11px] font-semibold text-accent hover:underline inline-flex items-center gap-1">${ic('refresh-cw', 'w-3 h-3')}Refresh</button>
        </div>
        <div class="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          ${creators.map((c) => {
            const pending = c.followStatus === 'pending' || c.requested;
            const followLabel = c.isFollowing ? 'Following' : pending ? 'Requested' : 'Follow';
            const followCls = (c.isFollowing || pending)
              ? 'bg-white/[0.08] border border-white/[0.12] text-zinc-200 hover:bg-white/[0.14]'
              : 'btn-primary';
            const subTxt = c.mutualCount > 0 ? `${c.mutualCount} mutual${c.mutualCount === 1 ? '' : 's'}` : (c.followsBack ? 'Follows you' : '@' + (c.username || 'member'));
            return `
            <div class="lux-card shrink-0 w-44 rounded-2xl p-3 flex flex-col justify-between gap-2.5">
              <button type="button" data-act="openProfile" data-arg="${esc(c.username || c.id)}" class="flex items-center gap-2.5 text-left hover:opacity-90 transition">
                ${renderAvatarCircle(c, 'w-9 h-9')}
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-bold text-white inline-flex items-center gap-1 truncate max-w-full">${esc(c.display_name || c.username || 'Creator')}${c.verified ? VERIFIED_BADGE_SVG : ''}</div>
                  <div class="text-[10.5px] text-zinc-400 truncate">${esc(subTxt)}</div>
                </div>
              </button>
              <button type="button" data-act="profToggleFollowId" data-arg="${esc(c.id)}" class="h-7 rounded-xl text-[11px] font-bold transition press ${followCls}">${followLabel}</button>
            </div>`;
          }).join('')}
        </div>
      </div>`
    : '';

  const tagsHtml = (tags.length || activeTag)
    ? `<div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        <button type="button" data-act="feedSelectTag" data-arg="" class="shrink-0 h-7 px-3 rounded-full text-[11px] font-semibold transition ${!activeTag ? 'btn-primary' : 'btn-ghost text-zinc-300'}">All topics</button>
        ${activeTag ? `<button type="button" data-act="toggleFollowTag" data-arg="${esc(activeTag)}" class="shrink-0 h-7 px-3 rounded-full text-[11px] font-bold transition border ${followedTags.has(activeTag) ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-white/[0.06] border-white/[0.12] text-zinc-200 hover:text-white'} inline-flex items-center gap-1">${ic(followedTags.has(activeTag) ? 'check' : 'plus', 'w-3 h-3')}${followedTags.has(activeTag) ? 'Following #' : 'Follow #'}${esc(activeTag)}</button>` : ''}
        ${tags.map((t) => {
          const k = String(t.tag || '').toLowerCase();
          const isF = followedTags.has(k);
          return `<button type="button" data-act="feedSelectTag" data-arg="${esc(t.tag)}" class="shrink-0 h-7 px-3 rounded-full text-[11px] font-semibold transition ${activeTag === k ? 'btn-primary' : 'btn-ghost text-zinc-300'}">#${esc(t.tag)}${isF ? ' •' : ''} <span class="text-zinc-500 ml-0.5 tabular-nums">${t.count}</span></button>`;
        }).join('')}
      </div>`
    : '';

  const cardsHtml = posts.length
    ? (layout === 'grid'
      ? `<div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2.5">
          ${posts.map((p) => {
            const urls = p.mediaUrls || [];
            const au = p.author || {};
            const thumb = urls.length
              ? (p.mediaType === 'video'
                ? `<video src="${esc(urls[0])}" class="w-full h-full object-cover bg-black feed-hover-vid" muted loop playsinline></video>`
                : `<img src="${esc(urls[0])}" alt="" loading="lazy" class="w-full h-full object-cover bg-black">`)
              : `<div class="w-full h-full bg-gradient-to-br ${esc(p.bg || POST_BGS[0])} p-3 flex items-center justify-center text-center"><p class="text-[11px] sm:text-xs font-bold text-white line-clamp-4">${esc(p.caption || 'Post')}</p></div>`;
            return `<button type="button" data-act="viewPost" data-arg="${esc(p.id)}" class="group relative aspect-square rounded-2xl overflow-hidden border border-white/[0.08] bg-black text-left focus:outline-none">
              ${thumb}
              ${urls.length > 1 ? `<span class="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-black/65 text-[9.5px] font-bold text-white">${ic('layers', 'w-3 h-3 inline')}</span>` : ''}
              ${p.mediaType === 'video' ? `<span class="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-black/65 text-[9.5px] font-bold text-white">${ic('play', 'w-3 h-3 inline fill-current')}</span>` : ''}
              <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-2.5 flex flex-col justify-between">
                <div class="text-[10px] font-semibold text-white/90 truncate">@${esc(au.username || 'creator')}</div>
                <div class="flex items-center gap-3 text-[11px] font-bold text-white tabular-nums">
                  ${p.hideLikes ? '' : `<span class="inline-flex items-center gap-1">${ic('heart', 'w-3.5 h-3.5' + (p.likedByMe ? ' text-rose-400 fill-current' : ''))}${fmtCompactCount(p.likesCount || 0)}</span>`}
                  <span class="inline-flex items-center gap-1">${ic('message-circle', 'w-3.5 h-3.5')}${fmtCompactCount(p.commentsCount || 0)}</span>
                </div>
              </div>
            </button>`;
          }).join('')}
        </div>`
      : `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          ${posts.map((p) => {
            const au = p.author || {};
            const urls = p.mediaUrls || [];
            const hasMedia = urls.length > 0;
            const slideIdx = Math.min(Math.max(0, Number(S.feedSlides?.[p.id] || 0)), Math.max(0, urls.length - 1));
            const curUrl = urls[slideIdx] || urls[0];
            const arCls = p.aspectRatio === '1:1' ? 'wg-ar-1-1 max-h-[380px]' : p.aspectRatio === '4:5' ? 'wg-ar-4-5 max-h-[420px]' : p.aspectRatio === '16:9' ? 'wg-ar-16-9' : 'h-56';
            const mediaHtml = hasMedia
              ? (p.mediaType === 'video'
                ? `<video src="${esc(curUrl)}" class="w-full ${arCls} object-cover bg-black feed-hover-vid" muted loop playsinline controls></video>`
                : `<img src="${esc(curUrl)}" alt="" loading="lazy" class="w-full ${arCls} object-cover bg-black">`)
              : `<div class="w-full h-44 bg-gradient-to-br ${esc(p.bg || POST_BGS[0])} p-5 flex items-center justify-center text-center">
                  <p class="text-sm sm:text-base font-extrabold text-white drop-shadow line-clamp-4 leading-snug">${esc(p.caption || 'WhatsGram Post')}</p>
                </div>`;
            const cap = String(p.caption || '');
            const isExpanded = !!S.expandedCaps?.[p.id];
            const longCap = cap.length > 140;
            const isOwn = p.userId === meId || (!S.user && p.userId === 'self');
            const topComments = (p.comments || []).slice(-2);
            const isSched = p.scheduledAt && new Date(p.scheduledAt).getTime() > Date.now();
            return `<article class="lux-card rounded-[22px] overflow-hidden flex flex-col view-enter">
              <div class="px-4 py-3 flex items-center justify-between gap-2 border-b border-white/[0.06]">
                <div class="min-w-0 flex items-center gap-2.5">
                  <button type="button" data-act="openProfile" data-arg="${esc(au.username || p.userId)}" class="flex items-center gap-2.5 min-w-0 text-left hover:opacity-85 transition">
                    ${renderAvatarCircle(au, 'w-8 h-8')}
                    <div class="min-w-0">
                      <div class="text-xs font-bold text-white inline-flex items-center gap-1 truncate max-w-full">${esc(au.display_name || au.username || 'Creator')}${au.verified ? VERIFIED_BADGE_SVG : ''}${p.coauthorHandle ? `<span class="text-zinc-400 font-semibold">&amp; @${esc(String(p.coauthorHandle).replace(/^@/, ''))}</span>` : ''}</div>
                      <div class="text-[10.5px] text-zinc-400 truncate inline-flex items-center gap-1 max-w-full">@${esc(au.username || 'member')} · ${esc(timeAgo ? timeAgo(p.createdAt) : '')}${isSched ? ' · <span class="text-amber-300 font-semibold">Scheduled</span>' : ''}</div>
                    </div>
                  </button>
                  ${p.locationText ? `<button type="button" data-act="feedSelectLoc" data-arg="${esc(p.locationText)}" class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[10px] text-zinc-300 hover:text-white truncate max-w-[140px]" title="Filter by location">${ic('map-pin', 'w-2.5 h-2.5 shrink-0')}<span class="truncate">${esc(p.locationText)}</span></button>` : ''}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  ${isOwn ? `<button type="button" data-act="togglePostArchive" data-arg="${esc(p.id)}" class="btn-ghost h-7 px-2 rounded-lg text-[10.5px] font-semibold text-zinc-300" title="Archive post">Archive</button>` : `<button type="button" data-act="openReportModal" data-arg="post:${esc(p.id)}" class="w-7 h-7 rounded-lg hover:bg-white/[0.06] grid place-items-center text-zinc-400 hover:text-zinc-200" aria-label="Report post" title="Report">${ic('flag', 'w-3.5 h-3.5')}</button>`}
                  <button type="button" data-act="viewPost" data-arg="${esc(p.id)}" class="btn-ghost h-7 px-2.5 rounded-lg text-[11px] font-semibold text-zinc-200">Open</button>
                </div>
              </div>
              <div data-act="feedMediaTap" data-arg="${esc(p.id)}" class="relative block w-full text-left overflow-hidden cursor-pointer select-none">
                ${mediaHtml}
                ${urls.length > 1 ? `
                  <span class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/65 border border-white/15 text-[10px] font-semibold text-white tabular-nums">${slideIdx + 1}/${urls.length}</span>
                  <button type="button" data-act="feedSlide" data-arg="${esc(p.id)}:-1" class="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white grid place-items-center" aria-label="Previous slide">${ic('chevron-left', 'w-4 h-4')}</button>
                  <button type="button" data-act="feedSlide" data-arg="${esc(p.id)}:1" class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white grid place-items-center" aria-label="Next slide">${ic('chevron-right', 'w-4 h-4')}</button>
                  <div class="absolute bottom-2 inset-x-0 flex justify-center gap-1 pointer-events-none">${urls.map((_, di) => `<span class="w-1.5 h-1.5 rounded-full ${di === slideIdx ? 'bg-white' : 'bg-white/40'}"></span>`).join('')}</div>
                ` : ''}
              </div>
              <div class="p-4 flex-1 flex flex-col justify-between gap-2.5">
                <div class="space-y-1">
                  <div class="text-xs text-zinc-200 leading-relaxed break-words ${isExpanded ? '' : 'line-clamp-3'}">${renderBioText(cap)}</div>
                  ${longCap ? `<button type="button" data-act="expandPostCap" data-arg="${esc(p.id)}" class="text-[11px] font-semibold text-zinc-400 hover:text-white">${isExpanded ? 'Show less' : 'Read more'}</button>` : ''}
                </div>
                ${topComments.length ? `<div class="space-y-1 pt-1 border-t border-white/[0.04]">
                  ${topComments.map((cm) => `<div class="text-[11px] text-zinc-300 truncate"><span class="font-bold text-white mr-1">@${esc(cm.authorUsername || cm.authorName || 'member')}</span>${esc(cm.text)}</div>`).join('')}
                </div>` : ''}
                ${p.commentsDisabled ? '<div class="text-[10.5px] text-zinc-500 italic">Comments disabled by creator</div>' : `<div class="flex items-center gap-1.5">
                  <input type="text" data-post-id="${esc(p.id)}" class="feed-qc-inp flex-1 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] px-2.5 text-[11px] text-white placeholder-zinc-500 focus:outline-none focus:border-accent/50" placeholder="Add a quick comment...">
                  <button type="button" data-act="feedQuickComment" data-arg="${esc(p.id)}" class="h-7 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[10.5px] font-bold text-accent">Post</button>
                </div>`}
                <div class="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  <div class="flex items-center gap-1">
                    <button type="button" data-act="feedLikePost" data-arg="${esc(p.id)}" class="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl hover:bg-white/[0.06] text-xs font-semibold transition press ${p.likedByMe ? 'text-rose-400' : 'text-zinc-300'}">${ic('heart', 'w-4 h-4' + (p.likedByMe ? ' fill-current' : ''))}${p.hideLikes && !isOwn ? '<span class="text-[10px]">Likes</span>' : `<span class="tabular-nums">${fmtCompactCount(p.likesCount || 0)}</span>`}</button>
                    <button type="button" data-act="viewPost" data-arg="${esc(p.id)}" class="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl hover:bg-white/[0.06] text-xs font-semibold text-zinc-300 transition press">${ic('message-circle', 'w-4 h-4')}<span class="tabular-nums">${fmtCompactCount(p.commentsCount || 0)}</span></button>
                    <button type="button" data-act="openShareToChat" data-arg="${esc(p.id)}" class="inline-flex items-center justify-center w-8 h-8 rounded-xl hover:bg-white/[0.06] text-zinc-300 transition press" aria-label="Send post to chat" title="Share to chat">${ic('send', 'w-3.5 h-3.5')}</button>
                    <button type="button" data-act="sharePostLink" data-arg="${esc(p.id)}" class="inline-flex items-center justify-center w-8 h-8 rounded-xl hover:bg-white/[0.06] text-zinc-300 transition press" aria-label="Share post link" title="Share link">${ic('share-2', 'w-3.5 h-3.5')}</button>
                  </div>
                  <div class="flex items-center gap-0.5">
                    <button type="button" data-act="openCollectionPicker" data-arg="${esc(p.id)}" class="w-8 h-8 rounded-xl hover:bg-white/[0.06] grid place-items-center text-zinc-300 hover:text-white transition" aria-label="Add to collection" title="Collections">${ic('folder-plus', 'w-3.5 h-3.5')}</button>
                    <button type="button" data-act="feedSavePost" data-arg="${esc(p.id)}" class="h-8 px-2.5 rounded-xl hover:bg-white/[0.06] transition press ${p.savedByMe ? 'text-amber-400' : 'text-zinc-300'}" aria-label="Save post">${ic('bookmark', 'w-4 h-4' + (p.savedByMe ? ' fill-current' : ''))}</button>
                  </div>
                </div>
              </div>
            </article>`;
          }).join('')}
        </div>`)
    : `<div class="lux-card rounded-[24px] p-10 text-center space-y-3">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-white/[0.05] border border-white/[0.1] grid place-items-center text-accent">${ic('compass', 'w-6 h-6')}</div>
        <div class="text-sm font-bold text-white">${tab === 'following' ? 'Your Following feed is quiet' : 'No matching posts found'}</div>
        <p class="text-xs text-zinc-400 max-w-sm mx-auto">${tab === 'following' ? 'Follow creators in Explore or publish your first post.' : 'Try clearing filters or share a new post with the community.'}</p>
        <div class="flex items-center justify-center gap-2 pt-1">
          ${(tab !== 'explore' || activeTag || q) ? '<button type="button" data-act="feedResetFilter" class="btn-ghost h-9 px-4 rounded-full text-xs font-semibold text-white">Show all Explore</button>' : ''}
          <button type="button" data-act="openPostModal" class="btn-primary h-9 px-4 rounded-full text-xs font-bold">Create post</button>
        </div>
      </div>`;

  const moreHtml = data.hasMore
    ? `<div class="pt-2 flex justify-center"><button type="button" data-act="loadMoreFeed" class="btn-ghost h-9 px-5 rounded-full text-xs font-semibold text-white inline-flex items-center gap-1.5">${ic('chevrons-down', 'w-4 h-4')}Load more posts</button></div>`
    : '';

  root.innerHTML = `${creatorHtml}${tagsHtml}${cardsHtml}${moreHtml}`;
}
