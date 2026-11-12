const crypto = require('node:crypto');
const { getConfig, readBody, requireUser } = require('./sb');

/**
 * Shared Vercel request handler factory used by domain endpoints (`api/auth`, `api/chat`, etc.)
 * and the unified `/api/supabase` router.
 */
function createRouteHandler({ getPublic, getAuthed, postPublic, postAuthed }) {
  return async function routeHandler(req, res) {
    const reqId = (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex'));
    res.setHeader('X-Request-Id', reqId);
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(204).end();
    }

    const cfg = getConfig();
    const action = req.query?.action || '';

    if (req.method === 'GET' && action === 'status') {
      const missing = [];
      if (!cfg.url) missing.push('SUPABASE_URL');
      if (!cfg.secretKey) missing.push('SUPABASE_SECRET_KEY');
      return res.status(200).json({
        ok: true,
        configured: Boolean(cfg.url && cfg.secretKey),
        hasRealtime: Boolean(cfg.url && cfg.publishableKey),
        missing
      });
    }

    if (req.method === 'GET' && getPublic) {
      const pubRes = await getPublic(action, cfg, req, res);
      if (pubRes !== null && pubRes !== undefined) return pubRes;
    }

    if (!cfg.url || !cfg.secretKey) {
      const miss = [];
      if (!cfg.url) miss.push('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)');
      if (!cfg.secretKey) miss.push('SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)');
      return res.status(503).json({ error: `${miss.join(' and ')} not configured on Vercel.`, missing: miss });
    }

    try {
      if (req.method === 'GET') {
        const session = await requireUser(cfg, req, res);
        if (action === 'session' && !session) {
          return res.status(200).json({ authenticated: false });
        }
        if (!session) return res.status(401).json({ error: 'Authentication required' });
        if (getAuthed) {
          const out = await getAuthed(action, cfg, req, res, session);
          if (out !== null && out !== undefined) return out;
        }
        return res.status(400).json({ error: 'Unknown GET action' });
      }

      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const body = await readBody(req);
      const act = body.action || action;

      if (postPublic) {
        const out = await postPublic(act, cfg, req, res, body);
        if (out !== null && out !== undefined) return out;
      }

      const session = await requireUser(cfg, req, res);
      if (!session) return res.status(401).json({ error: 'Authentication required' });

      if (postAuthed) {
        const out = await postAuthed(act, cfg, req, res, session, body);
        if (out !== null && out !== undefined) return out;
      }

      return res.status(400).json({ error: 'Unknown POST action', requestId: reqId });
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', requestId: reqId, action, msg: err?.message || 'Proxy error' }));
      return res.status(502).json({ error: err?.message || 'Supabase proxy error', requestId: reqId });
    }
  };
}

module.exports = { createRouteHandler };
