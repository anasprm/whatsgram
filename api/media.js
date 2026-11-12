const { createRouteHandler } = require('../lib/router');
const { handleMediaGet, handleMediaPost } = require('../lib/media');

module.exports = createRouteHandler({
  getAuthed: handleMediaGet,
  postAuthed: handleMediaPost
});
