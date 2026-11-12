const { createRouteHandler } = require('../lib/router');
const { handlePublicAuthGet, handlePublicAuthPost, handleAuthedAuthGet, handleAuthedAuthPost } = require('../lib/auth');
const { handleChatGet, handleChatPost } = require('../lib/chat');
const { handleSocialGet, handleSocialPost } = require('../lib/social');
const { handleMediaGet, handleMediaPost } = require('../lib/media');
const { handlePushGet, handlePushPost } = require('../lib/push');
const { handleSafetyGet, handleSafetyPost } = require('../lib/safety');
const { handleSecurityGet, handleSecurityPost } = require('../lib/security');

async function dispatch(handlers, ...args) {
  for (const fn of handlers) {
    const out = await fn(...args);
    if (out !== null && out !== undefined) return out;
  }
  return null;
}

module.exports = createRouteHandler({
  getPublic: (action, cfg, req, res) => dispatch([handlePushGet, handlePublicAuthGet], action, cfg, req, res),
  getAuthed: (action, cfg, req, res, session) => dispatch([handleAuthedAuthGet, handleChatGet, handleSocialGet, handleMediaGet, handleSafetyGet, handleSecurityGet], action, cfg, req, res, session),
  postPublic: (act, cfg, req, res, body) => dispatch([handlePublicAuthPost], act, cfg, req, res, body),
  postAuthed: (act, cfg, req, res, session, body) => dispatch([handleAuthedAuthPost, handleChatPost, handleSocialPost, handleMediaPost, handlePushPost, handleSafetyPost, handleSecurityPost], act, cfg, req, res, session, body)
});
