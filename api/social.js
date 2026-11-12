const { createRouteHandler } = require('../lib/router');
const { handleSocialGet, handleSocialPost } = require('../lib/social');

module.exports = createRouteHandler({
  getAuthed: handleSocialGet,
  postAuthed: handleSocialPost
});
