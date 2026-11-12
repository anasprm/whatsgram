const { isMissingRelationErr, sha256Hex, sbFetch } = require('./sb');

function getVapidConfig() {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || 'mailto:security@whatsgram.app').trim();
  return {
    enabled: Boolean(publicKey && privateKey),
    publicKey: publicKey || null,
    privateKey: privateKey || null,
    subject
  };
}

async function sendWebPushToUser(cfg, userId, payloadObj) {
  const vapid = getVapidConfig();
  if (!vapid.enabled) return { sent: 0, reason: 'VAPID not configured' };

  let webpush = null;
  try { webpush = require('web-push'); } catch { return { sent: 0, reason: 'web-push unavailable' }; }

  const subsRes = await sbFetch(cfg, `/rest/v1/wg_push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,endpoint,p256dh,auth`);
  if (!subsRes.ok || !Array.isArray(subsRes.data) || !subsRes.data.length) return { sent: 0 };

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const richPayload = {
    title: payloadObj?.title || 'WhatsGram OS',
    body: payloadObj?.body || '',
    tag: payloadObj?.tag || 'whatsgram-push',
    url: payloadObj?.url || '/',
    data: payloadObj?.data || { url: payloadObj?.url || '/' },
    actions: Array.isArray(payloadObj?.actions) ? payloadObj.actions : [{ action: 'open', title: 'Open' }, { action: 'markRead', title: 'Mark read' }]
  };
  const body = JSON.stringify(richPayload);
  let sent = 0;
  await Promise.all(subsRes.data.map(async row => {
    try {
      await webpush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth }
      }, body);
      sent++;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await sbFetch(cfg, `/rest/v1/wg_push_subscriptions?id=eq.${encodeURIComponent(row.id)}`, { method: 'DELETE' }).catch(() => null);
      }
    }
  }));
  return { sent };
}

async function handlePushGet(action, cfg, req, res) {
  if (action === 'pushKey') {
    const v = getVapidConfig();
    return res.status(200).json({ ok: true, enabled: v.enabled, publicKey: v.publicKey });
  }
  return null;
}

async function handlePushPost(act, cfg, req, res, session, body) {
  const uid = session.user.id;

  if (act === 'savePushSub') {
    const sub = body.subscription || body;
    const endpoint = String(sub?.endpoint || '').trim();
    const p256dh = String(sub?.keys?.p256dh || '').trim();
    const auth = String(sub?.keys?.auth || '').trim();
    if (!/^https:\/\//i.test(endpoint) || !p256dh || !auth) {
      return res.status(400).json({ error: 'Valid Web Push subscription with HTTPS endpoint and keys required' });
    }
    const id = `ps_${sha256Hex(`${uid}:${endpoint}`).slice(0, 24)}`;
    const r = await sbFetch(cfg, '/rest/v1/wg_push_subscriptions?on_conflict=id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: [{
        id,
        user_id: uid,
        endpoint,
        p256dh,
        auth,
        user_agent: String(req.headers?.['user-agent'] || '').slice(0, 180)
      }]
    });
    if (!r.ok) {
      return res.status(isMissingRelationErr(r) ? 500 : (r.status || 500)).json({
        error: isMissingRelationErr(r) ? 'Push subscriptions table missing. Run updated supabase/schema.sql.' : (r.data?.message || 'Failed to save push subscription')
      });
    }
    return res.status(200).json({ ok: true, id });
  }

  if (act === 'deletePushSub') {
    const endpoint = String(body.endpoint || '').trim();
    const filter = endpoint
      ? `user_id=eq.${encodeURIComponent(uid)}&endpoint=eq.${encodeURIComponent(endpoint)}`
      : `user_id=eq.${encodeURIComponent(uid)}`;
    await sbFetch(cfg, `/rest/v1/wg_push_subscriptions?${filter}`, { method: 'DELETE' });
    return res.status(200).json({ ok: true });
  }

  if (act === 'sendTestPush') {
    const v = getVapidConfig();
    if (!v.enabled) {
      return res.status(200).json({ ok: false, enabled: false, message: 'VAPID keys are not configured on the server yet.' });
    }
    const out = await sendWebPushToUser(cfg, uid, {
      title: 'WhatsGram OS',
      body: 'Encrypted Web Push notifications are active on this device.',
      url: '/'
    });
    return res.status(200).json({ ok: true, enabled: true, ...out });
  }

  return null;
}

module.exports = {
  getVapidConfig,
  sendWebPushToUser,
  handlePushGet,
  handlePushPost
};
