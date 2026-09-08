'use strict';

const express = require('express');

const router = express.Router();

// Game page — server-rendered with EJS.
router.get('/', (req, res) => {
  res.render('game');
});

module.exports = router;
