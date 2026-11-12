const { createRouteHandler } = require('../lib/router');
const { handlePublicAuthPost, handleAuthedAuthGet, handleAuthedAuthPost } = require('../lib/auth');

module.exports = createRouteHandler({
  getAuthed: handleAuthedAuthGet,
  postPublic: handlePublicAuthPost,
  postAuthed: handleAuthedAuthPost
});
