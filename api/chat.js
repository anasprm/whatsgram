const { createRouteHandler } = require('../lib/router');
const { handleChatGet, handleChatPost } = require('../lib/chat');

module.exports = createRouteHandler({
  getAuthed: handleChatGet,
  postAuthed: handleChatPost
});
