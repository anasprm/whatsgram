const { getConfig, normalizeUsername, sbFetch, signDownloadUrl } = require('../lib/sb');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');

  const cfg = getConfig();
  const handle = normalizeUsername(req.query?.user || '');
  const postId = String(req.query?.post || '').trim();

  let title = 'WhatsGram OS · Encrypted Messaging & Social Platform';
  let desc = 'End-to-end encrypted DMs, WebRTC calls, Explore Feed, Reels, Stories, and Gemini AI.';
  let image = '/icon-512.png';
  let redirect = '/';

  if (handle) {
    redirect = `/u/${encodeURIComponent(handle)}`;
    title = `@${handle} on WhatsGram OS`;
    if (cfg.url && cfg.secretKey) {
      try {
        const pr = await sbFetch(cfg, `/rest/v1/wg_profiles?username=ilike.${encodeURIComponent(handle)}&select=display_name,bio,avatar_path,is_private&limit=1`);
        const prof = Array.isArray(pr.data) ? pr.data[0] : null;
        if (prof) {
          title = `${prof.display_name || '@' + handle} (@${handle}) · WhatsGram OS`;
          if (!prof.is_private && prof.bio) desc = String(prof.bio).slice(0, 200);
          if (prof.avatar_path) {
            const signed = await signDownloadUrl(cfg, prof.avatar_path).catch(() => null);
            if (signed?.ok && signed.url) image = signed.url;
          }
        }
      } catch {}
    }
  } else if (postId) {
    redirect = `/feed`;
    title = 'Post on WhatsGram OS';
    if (cfg.url && cfg.secretKey) {
      try {
        const pr = await sbFetch(cfg, `/rest/v1/wg_posts?id=eq.${encodeURIComponent(postId)}&select=caption,media_paths,archived&limit=1`);
        const post = Array.isArray(pr.data) ? pr.data[0] : null;
        if (post && !post.archived) {
          if (post.caption) desc = String(post.caption).slice(0, 200);
          if (Array.isArray(post.media_paths) && post.media_paths[0]) {
            const signed = await signDownloadUrl(cfg, post.media_paths[0]).catch(() => null);
            if (signed?.ok && signed.url) image = signed.url;
          }
        }
      } catch {}
    }
  }

  return res.status(200).send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta http-equiv="refresh" content="0;url=${esc(redirect)}">
</head><body style="background:#05060b;color:#fff;font-family:system-ui;display:grid;place-items:center;min-height:100vh">
<a href="${esc(redirect)}" style="color:#0095f6;font-weight:600">Open in WhatsGram OS →</a>
</body></html>`);
};
