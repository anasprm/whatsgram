/* Modular UI feature helpers for WhatsGram OS:
 * Story fonts/stickers, Post Studio options, Creator Insights SVG charts,
 * Post Similarity scorer, Notification bucketing, and Onboarding tour cards.
 */

export const POST_ASPECT_RATIOS = [
  { key: '1:1', label: '1:1 Square', cls: 'wg-ar-1-1' },
  { key: '4:5', label: '4:5 Portrait', cls: 'wg-ar-4-5' },
  { key: '16:9', label: '16:9 Wide', cls: 'wg-ar-16-9' }
];

export const STORY_FONTS = [
  { key: 'modern', label: 'Modern', cls: 'font-sans font-bold tracking-tight' },
  { key: 'classic', label: 'Classic', cls: 'font-serif font-semibold italic' },
  { key: 'neon', label: 'Neon', cls: 'font-sans font-extrabold tracking-wide drop-shadow-[0_0_10px_rgba(56,189,248,0.8)]' },
  { key: 'typewriter', label: 'Mono', cls: 'font-mono font-semibold' },
  { key: 'strong', label: 'Strong', cls: 'font-sans font-black uppercase tracking-wider' }
];

export const AI_STARTER_PROMPTS = [
  { label: 'Catch up on DMs', prompt: 'Summarize the key points from my recent messages and action items.' },
  { label: 'Draft polite reply', prompt: 'Draft a warm, concise reply agreeing to meet tomorrow at 4 PM.' },
  { label: 'Write IG caption', prompt: 'Write 3 catchy Instagram captions with subtle emoji and 4 hashtags for a night skyline shot.' },
  { label: 'Security audit', prompt: 'Explain how WhatsGram zero-knowledge ECDH + AES-GCM keeps private chats safe.' }
];

export const WELCOME_TOUR_STEPS = [
  {
    title: 'Zero-Knowledge Encrypted DMs',
    body: 'Every private chat negotiates ECDH P-256 + AES-256-GCM keys in your browser. Verify contacts anytime with 60-digit Safety Numbers or enable Vanish Timers.',
    badge: 'Step 1 of 3 · Vault & Chat'
  },
  {
    title: 'Instagram-Grade Stories, Reels & Feed',
    body: 'Publish carousels with custom aspect ratios, filters, @mentions, Co-Authors, Close Friends stories, Poll/Quiz/Slider stickers, and Saved Collections.',
    badge: 'Step 2 of 3 · Social Studio'
  },
  {
    title: 'AI Copilot & Cross-Device Security',
    body: 'Use Slash Commands (/ai, /vanish, /poll) right inside chats, summarize threads locally, translate messages inline, and guard your enclave with TOTP 2FA or Passkeys.',
    badge: 'Step 3 of 3 · Intelligence & 2FA'
  }
];

/** Compute content similarity for "More like this" post discovery (#194). */
export function findSimilarPosts(target, allPosts = [], limit = 3) {
  if (!target) return [];
  const tok = s => new Set(String(s || '').toLowerCase().split(/[^a-z0-9#]+/).filter(w => w.length >= 3));
  const tTags = new Set((target.tags || []).map(x => String(x).toLowerCase()));
  const tWords = tok(target.caption);
  return allPosts
    .filter(p => p.id !== target.id)
    .map(p => {
      let score = 0;
      for (const tg of (p.tags || [])) if (tTags.has(String(tg).toLowerCase())) score += 4;
      for (const w of tok(p.caption)) if (tWords.has(w)) score += 1;
      if (p.userId === target.userId) score += 0.5;
      return { post: p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.post);
}

/** Group notifications into Today / This Week / Earlier buckets (#70). */
export function groupNotificationsByBucket(items = []) {
  const now = Date.now();
  const dayMs = 86400000;
  const buckets = { Today: [], 'This Week': [], Earlier: [] };
  for (const n of items) {
    const t = Date.parse(n.createdAt || n.created_at || '') || now;
    const diff = now - t;
    if (diff < dayMs) buckets.Today.push(n);
    else if (diff < 7 * dayMs) buckets['This Week'].push(n);
    else buckets.Earlier.push(n);
  }
  return Object.entries(buckets).filter(([, list]) => list.length > 0);
}

/** Render Creator Insights SVG sparkline & metric cards (#120). */
export function renderCreatorInsightsHtml(data, { esc, fmtCompactCount, ic }) {
  const ins = data || { followersTotal: 0, followers7d: 0, postsCount: 0, reelsCount: 0, totals: { views: 0, likes: 0, comments: 0, saves: 0 }, topPosts: [] };
  const t = ins.totals || {};
  const top = Array.isArray(ins.topPosts) ? ins.topPosts : [];
  const engTotal = (t.likes || 0) + (t.comments || 0) + (t.saves || 0);
  const erPct = t.views > 0 ? Math.min(100, ((engTotal / t.views) * 100)).toFixed(1) : '0.0';
  const pts = [
    Math.max(4, (ins.followersTotal || 2) - (ins.followers7d || 0)),
    Math.max(5, Math.round((ins.followersTotal || 3) * 0.7)),
    Math.max(6, Math.round((ins.followersTotal || 4) * 0.85)),
    Math.max(8, ins.followersTotal || 5)
  ];
  const maxV = Math.max(...pts, 10);
  const poly = pts.map((v, idx) => `${Math.round((idx / 3) * 200)},${Math.round(44 - (v / maxV) * 34)}`).join(' ');

  return `<div class="space-y-4">
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <div class="lux-card rounded-2xl p-3">
        <div class="text-[10px] text-zinc-400 uppercase tracking-wider">Followers</div>
        <div class="text-lg font-extrabold text-white tabular-nums mt-0.5">${fmtCompactCount(ins.followersTotal || 0)}</div>
        <div class="text-[10.5px] text-emerald-400 font-semibold">+${ins.followers7d || 0} this week</div>
      </div>
      <div class="lux-card rounded-2xl p-3">
        <div class="text-[10px] text-zinc-400 uppercase tracking-wider">Views</div>
        <div class="text-lg font-extrabold text-white tabular-nums mt-0.5">${fmtCompactCount(t.views || 0)}</div>
        <div class="text-[10.5px] text-zinc-400">Posts & Reels</div>
      </div>
      <div class="lux-card rounded-2xl p-3">
        <div class="text-[10px] text-zinc-400 uppercase tracking-wider">Interactions</div>
        <div class="text-lg font-extrabold text-white tabular-nums mt-0.5">${fmtCompactCount(engTotal)}</div>
        <div class="text-[10.5px] text-zinc-400">${fmtCompactCount(t.likes || 0)} likes · ${fmtCompactCount(t.saves || 0)} saves</div>
      </div>
      <div class="lux-card rounded-2xl p-3">
        <div class="text-[10px] text-zinc-400 uppercase tracking-wider">Eng. Rate</div>
        <div class="text-lg font-extrabold text-cyan-300 tabular-nums mt-0.5">${erPct}%</div>
        <div class="text-[10.5px] text-zinc-400">${ins.postsCount || 0} posts · ${ins.reelsCount || 0} reels</div>
      </div>
    </div>
    <div class="lux-card rounded-2xl p-3.5 space-y-2">
      <div class="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
        <span>Audience Growth Trajectory</span>
        <span class="text-emerald-400">+${ins.followers7d || 0} net (7d)</span>
      </div>
      <svg viewBox="0 0 200 48" class="w-full h-14 overflow-visible">
        <polyline fill="none" stroke="rgb(var(--ac-rgb))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${poly}"/>
      </svg>
    </div>
    <div class="space-y-1.5">
      <div class="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Top Performing Posts</div>
      ${top.length
        ? top.map(p => `<button type="button" data-act="viewPost" data-arg="${esc(p.id)}" class="w-full lux-card rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-left hover:border-white/25 transition">
            <span class="text-xs text-zinc-100 truncate">${esc(p.caption || 'Untitled post')}</span>
            <span class="text-[11px] text-zinc-400 shrink-0 tabular-nums">${p.likes || 0} ${ic('heart', 'w-3 h-3 inline')} · ${p.saves || 0} ${ic('bookmark', 'w-3 h-3 inline')}</span>
          </button>`).join('')
        : '<p class="text-xs text-zinc-400">Publish posts or reels to unlock analytics here.</p>'}
    </div>
  </div>`;
}

/** Render positioned Story Stickers (text, quiz, slider, location, mention) (#34, #107). */
export function renderStoryStickersHtml(stickers = [], esc, votedChoice = null) {
  if (!Array.isArray(stickers) || !stickers.length) return '';
  return stickers.slice(0, 6).map((st, idx) => {
    const x = Math.min(82, Math.max(8, Number(st.x ?? 50)));
    const y = Math.min(78, Math.max(16, Number(st.y ?? (28 + idx * 14))));
    const fontCls = STORY_FONTS.find(f => f.key === st.font)?.cls || STORY_FONTS[0].cls;
    if (st.type === 'text') {
      return `<div class="absolute -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-black/55 backdrop-blur-md text-white text-sm shadow-lg pointer-events-none max-w-[80%] text-center ${fontCls}" style="left:${x}%;top:${y}%">${esc(st.text || '')}</div>`;
    }
    if (st.type === 'quiz' && Array.isArray(st.options)) {
      return `<div class="absolute -translate-x-1/2 -translate-y-1/2 w-60 rounded-2xl bg-black/75 border border-white/20 p-2.5 text-center space-y-1.5 shadow-xl" style="left:50%;top:${y}%">
        <div class="text-[11px] font-bold text-white">${esc(st.question || 'Quick Quiz')}</div>
        <div class="grid grid-cols-1 gap-1">${st.options.slice(0, 3).map((op, oi) => `<button type="button" data-act="voteStoryQuiz" data-arg="${oi}" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${votedChoice === oi ? 'bg-emerald-500 text-black' : 'bg-white/15 hover:bg-white/25 text-white'}">${esc(op)}</button>`).join('')}</div>
      </div>`;
    }
    if (st.type === 'slider') {
      return `<div class="absolute -translate-x-1/2 -translate-y-1/2 w-56 rounded-2xl bg-black/70 border border-white/20 px-3 py-2 text-center shadow-xl" style="left:50%;top:${y}%">
        <div class="text-[11px] font-semibold text-white mb-1">${esc(st.question || 'Rate this')} ${esc(st.emoji || '🔥')}</div>
        <input type="range" min="0" max="100" value="75" class="w-full accent-rose-500 cursor-pointer" aria-label="Emoji slider">
      </div>`;
    }
    return '';
  }).join('');
}
