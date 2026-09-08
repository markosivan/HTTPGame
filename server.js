'use strict';

const path = require('path');
const express = require('express');

const pagesRouter = require('./src/routes/pages');
const albumsRouter = require('./src/routes/albums');
const reviewsRouter = require('./src/routes/reviews');
const { gameVerdict } = require('./src/game/middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// --- View engine (SSR with EJS) ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Static client assets (external CSS / JS files) ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Game verdict ---
// Mounted ahead of body parsing on purpose: it only reads a header here and hooks
// res.json, and the hook runs later, by which time the body is parsed. Sitting this
// early means even a malformed JSON body still comes back with a verdict.
app.use('/api', gameVerdict);

// --- Body parsing ---
app.use(express.json());

// A malformed JSON body must still answer with JSON, never with Express' HTML error page.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    // Nothing matched a route, so the checker would otherwise blame the path.
    req.jsonParseFailed = true;
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  return next(err);
});

// --- API ---
app.use('/api/albums', albumsRouter);
app.use('/api/reviews', reviewsRouter);

// Anything else under /api is a wrong path, and must still answer in JSON: without this,
// Express replies with an HTML 404 and the player never gets a verdict for the level.
// (Express 5 spells the wildcard '*splat'; in Express 4 the same route reads '/api/*'.)
app.all(['/api', '/api/*splat'], (req, res) => {
  res.status(404).json({
    error: 'No such API endpoint',
    path: req.originalUrl,
    method: req.method
  });
});

// --- Pages (SSR) ---
app.use('/', pagesRouter);

// Last line of defence: an unexpected server error still leaves /api answering JSON.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`HTTP/REST game running at http://localhost:${PORT}`);
});

module.exports = app;
