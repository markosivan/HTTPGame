'use strict';

const { checkLevel } = require('./checker');

/**
 * Turns any /api request into a graded move in the game — without changing the response.
 *
 * The client sends the level it is trying to solve in an `X-Level-Id` header. This
 * middleware hooks `res.json`, so whatever route ends up answering (including the
 * catch-all for a completely wrong path, and the error handlers), the verdict is
 * attached to the response headers just before the body goes out.
 *
 * The body itself stays a clean REST response: the game never leaks into it.
 *
 * Without the header the API behaves like an ordinary REST API, so it can be explored
 * with curl or the browser on its own.
 */
function gameVerdict(req, res, next) {
  const rawLevelId = req.get('X-Level-Id');
  if (rawLevelId === undefined) return next();

  const levelId = Number(rawLevelId);
  if (!Number.isInteger(levelId) || levelId <= 0) return next();

  const sendJson = res.json.bind(res);

  res.json = function taggedJson(body) {
    // Headers have to be set before the original res.json runs: once it sends, the
    // headers are already on the wire and anything added afterwards is lost.
    if (!res.headersSent) {
      let verdict;
      try {
        verdict = checkLevel(levelId, req, res.statusCode, body);
      } catch (error) {
        // A bug in the checker must never take the API down with it.
        console.error('Level check failed:', error);
        verdict = { correct: false, message: 'The server could not grade this request.' };
      }

      res.set('X-Game-Result', verdict.correct ? 'correct' : 'incorrect');
      res.set('X-Game-Feedback', encodeURIComponent(verdict.message));
      res.set('Access-Control-Expose-Headers', 'X-Game-Result, X-Game-Feedback');
    }

    return sendJson(body);
  };

  return next();
}

module.exports = { gameVerdict };
