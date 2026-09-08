'use strict';

const path = require('path');
const express = require('express');

const pagesRouter = require('./src/routes/pages');

const app = express();
const PORT = process.env.PORT || 3000;

// --- View engine (SSR with EJS) ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Static client assets (external CSS / JS files) ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Body parsing ---
app.use(express.json());

// A malformed JSON body must still answer with JSON, never with Express' HTML error page.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  return next(err);
});

// --- Pages (SSR) ---
app.use('/', pagesRouter);

app.listen(PORT, () => {
  console.log(`HTTP/REST game running at http://localhost:${PORT}`);
});

module.exports = app;
