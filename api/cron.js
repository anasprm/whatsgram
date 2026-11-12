const { getConfig } = require('../lib/sb');
const { runScheduledMaintenance } = require('../lib/safety');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const authHdr = String(req.headers?.authorization || '');
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  if (cronSecret && authHdr !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized cron call' });
  }
  const cfg = getConfig();
  if (!cfg.url || !cfg.secretKey) {
    return res.status(200).json({ ok: true, skipped: 'unconfigured' });
  }
  const report = await runScheduledMaintenance(cfg);
  return res.status(200).json({ ok: true, ...report, ranAt: new Date().toISOString() });
};
