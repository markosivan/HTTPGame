'use strict';

const express = require('express');

const { getPublicLevels } = require('../game/levels');
const { getSchemas } = require('../schemas');

const router = express.Router();

// Game page — server-rendered with EJS.
// Only the public half of each level is handed to the view: no method, path, params
// or expected status ever reaches the browser.
router.get('/', (req, res) => {
  const levels = getPublicLevels();
  res.render('game', { levels, totalLevels: levels.length });
});

// Schemas page — also server-rendered. The tables are built from this data by EJS at
// render time, so the field names are in the HTML the browser receives.
router.get('/schemas', (req, res) => {
  res.render('schemas', { schemas: getSchemas() });
});

module.exports = router;
