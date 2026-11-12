const { createRouteHandler } = require('../lib/router');
const { handlePushGet, handlePushPost } = require('../lib/push');

module.exports = createRouteHandler({
  getPublic: handlePushGet,
  postAuthed: handlePushPost
});
