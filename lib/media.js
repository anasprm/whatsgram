const {
  sbFetch,
  safeSeg,
  encodeStoragePath,
  validateUploadMime,
  sbStorageFetch,
  ensureMediaBucket,
  signDownloadUrl,
  assertConvAccess
} = require('./sb');

/** Detect dangerous disguised payloads (PE/ELF executables, scripts, HTML, inline SVG) inside uploaded buffers. */
function verifySafeUploadBuffer(buf, declaredMime) {
  if (!buf || !buf.length) return { ok: true };
  const head = buf.subarray(0, 64);
  if ((head[0] === 0x4d && head[1] === 0x5a) || (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46)) {
    return { ok: false, error: 'Executable binaries are blocked from upload.' };
  }
  const textHead = head.toString('utf8').trimStart().toLowerCase();
  if (declaredMime !== 'text/plain' && (textHead.startsWith('<!doctype') || textHead.startsWith('<html') || textHead.startsWith('<script') || textHead.startsWith('<svg'))) {
    return { ok: false, error: 'HTML or SVG payload does not match declared media type.' };
  }
  return { ok: true };
}

async function handleMediaGet(action, cfg, req, res, session) {
  const uid = session.user.id;
  if (action === 'mediaUrl') {
    const convId = String(req.query?.conversationId || '');
    const msgId = String(req.query?.messageId || '');
    if (!convId || !msgId) return res.status(400).json({ error: 'conversationId and messageId required' });
    const conv = await assertConvAccess(cfg, convId, uid);
    if (conv === null) return res.status(404).json({ error: 'Conversation not found' });
    if (conv === false) return res.status(403).json({ error: 'Forbidden' });
    const mr = await sbFetch(cfg, `/rest/v1/wg_messages?id=eq.${encodeURIComponent(msgId)}&conversation_id=eq.${encodeURIComponent(convId)}&select=id,media_path,media_mime,file_name&limit=1`);
    const msg = Array.isArray(mr.data) ? mr.data[0] : null;
    if (!msg || !msg.media_path) return res.status(404).json({ error: 'Media attachment not found' });
    const signed = await signDownloadUrl(cfg, msg.media_path, 900);
    if (!signed?.ok) return res.status(signed?.status || 500).json({ error: signed?.error || 'Failed to sign download URL' });
    return res.status(200).json({ ok: true, url: signed.url, mime: msg.media_mime || null, name: msg.file_name || null });
  }
  if (action === 'storyMediaUrl' || action === 'reelMediaUrl') {
    const isStory = action === 'storyMediaUrl';
    const itemId = String(isStory ? (req.query?.storyId || '') : (req.query?.reelId || ''));
    if (!itemId) return res.status(400).json({ error: 'ID required' });
    const table = isStory ? 'wg_stories' : 'wg_reels';
    const r = await sbFetch(cfg, `/rest/v1/${table}?id=eq.${encodeURIComponent(itemId)}&select=id,user_id,media_path,media_mime${isStory ? ',audience' : ''}&limit=1`);
    const item = Array.isArray(r.data) ? r.data[0] : null;
    if (!item?.media_path) return res.status(404).json({ error: 'Media not found' });
    if (isStory && item.audience === 'close_friends' && item.user_id && item.user_id !== uid) {
      const cf = await sbFetch(cfg, `/rest/v1/wg_close_friends?user_id=eq.${encodeURIComponent(item.user_id)}&friend_id=eq.${encodeURIComponent(uid)}&select=friend_id&limit=1`).catch(() => ({ ok: false }));
      if (!cf?.ok || !Array.isArray(cf.data) || !cf.data.length) {
        return res.status(403).json({ error: 'Close Friends story access denied' });
      }
    }
    const signed = await signDownloadUrl(cfg, item.media_path, 900);
    if (!signed?.ok) return res.status(signed?.status || 500).json({ error: signed?.error || 'Failed to sign URL' });
    return res.status(200).json({ ok: true, url: signed.url, mime: item.media_mime || null });
  }
  return null;
}

async function handleMediaPost(act, cfg, req, res, session, body) {
  const uid = session.user.id;
  if (act === 'initResumableUpload') {
    const mimeCheck = validateUploadMime(body.mime);
    if (!mimeCheck.ok) return res.status(400).json({ error: mimeCheck.error });
    const safeFolder = safeSeg(body.scope, 'misc');
    const safeFile = safeSeg(body.fileName, 'media.bin');
    const objectPath = `${uid}/${safeFolder}/${Date.now().toString(36)}_${safeFile}`;
    await ensureMediaBucket(cfg);
    return res.status(200).json({
      ok: true,
      tusEndpoint: `${cfg.url}/storage/v1/upload/resumable`,
      bucketName: 'wg-media',
      mediaPath: objectPath,
      mime: mimeCheck.mime,
      maxBytes: 100 * 1024 * 1024
    });
  }
  if (act !== 'signUpload' && act !== 'uploadMedia') return null;

  const mimeCheck = validateUploadMime(body.mime);
  if (!mimeCheck.ok) return res.status(400).json({ error: mimeCheck.error });

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

  if (act === 'signUpload') {
    const sr = await sbStorageFetch(cfg, `/object/upload/sign/wg-media/${encodeStoragePath(objectPath)}`, {
      method: 'POST',
      headers: { 'x-upsert': 'true' },
      body: {}
    });
    const rel = sr.data?.url || sr.data?.signedUrl || '';
    if (!sr.ok || !rel) return res.status(sr.status || 500).json({ error: sr.data?.message || 'Failed to create signed upload URL' });
    const uploadUrl = rel.startsWith('http') ? rel : `${cfg.url}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`;
    const sizeInc = Math.max(0, Number(body.sizeBytes) || 0);
    if (sizeInc > 0) {
      const pr = await sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(uid)}&select=storage_bytes&limit=1`).catch(() => ({ ok: false }));
      const prev = Number(pr?.data?.[0]?.storage_bytes || 0);
      sbFetch(cfg, `/rest/v1/wg_profiles?id=eq.${encodeURIComponent(uid)}`, { method: 'PATCH', body: { storage_bytes: prev + sizeInc } }).catch(() => null);
    }
    return res.status(200).json({ ok: true, uploadUrl, token: sr.data?.token || null, mediaPath: objectPath, mime: mimeCheck.mime });
  }

  if (!body.dataBase64 || typeof body.dataBase64 !== 'string') return res.status(400).json({ error: 'dataBase64 required' });
  const buf = Buffer.from(body.dataBase64, 'base64');
  if (buf.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'File too large for proxy upload; use signed upload' });
  const magicChk = verifySafeUploadBuffer(buf, mimeCheck.mime);
  if (!magicChk.ok) return res.status(400).json({ error: magicChk.error });
  const ur = await sbStorageFetch(cfg, `/object/wg-media/${encodeStoragePath(objectPath)}`, {
    method: 'POST',
    headers: { 'Content-Type': mimeCheck.mime, 'x-upsert': 'true' },
    rawBody: buf
  });
  if (!ur.ok) return res.status(ur.status || 500).json({ error: ur.data?.message || 'Storage upload failed' });
  return res.status(200).json({ ok: true, mediaPath: objectPath, mime: mimeCheck.mime, sizeBytes: buf.length });
}

module.exports = {
  verifySafeUploadBuffer,
  handleMediaGet,
  handleMediaPost
};
