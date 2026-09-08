'use strict';

const express = require('express');
const store = require('../store');

const router = express.Router();

/* --------------------------------------------------------------- validation */
/* Same predicates and error shapes as src/routes/albums.js, so both resources  */
/* answer in one consistent language.                                           */

const SORT_FIELDS = ['rating', 'date'];

const REVIEW_REQUIRED_FIELDS = ['albumId', 'author', 'rating', 'text'];

const REVIEW_FIELD_VALIDATORS = {
  albumId: isFiniteNumber,
  author: isNonEmptyString,
  rating: isRating,
  text: isNonEmptyString,
  date: isDateString
};

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRating(value) {
  return isFiniteNumber(value) && value >= 1 && value <= 5;
}

function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function idForResponse(rawId) {
  const asNumber = Number(rawId);
  return Number.isFinite(asNumber) ? asNumber : rawId;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectBodyProblems(body, validators, requiredFields) {
  const problems = [];

  for (const field of requiredFields) {
    if (body[field] === undefined) problems.push(field);
  }

  for (const [field, isValid] of Object.entries(validators)) {
    if (body[field] !== undefined && !isValid(body[field])) problems.push(field);
  }

  return problems;
}

function knownFieldsIn(body, validators) {
  return Object.keys(body).filter((key) => key in validators);
}

const INVALID_REVIEW_MESSAGE =
  'Invalid review: albumId must be the number of an existing album, author and text must be non-empty strings, rating must be a number between 1 and 5, date must look like YYYY-MM-DD';

/* --------------------------------------------------------- GET /api/reviews */

router.get('/', (req, res) => {
  const { albumId, minRating, maxRating, author, sort, order, limit } = req.query;

  let result = store.getReviews();

  if (albumId !== undefined) {
    const wanted = Number(albumId);
    if (!Number.isFinite(wanted)) {
      return res.status(400).json({ error: 'albumId must be a number', albumId });
    }
    result = result.filter((review) => review.albumId === wanted);
  }

  if (minRating !== undefined) {
    const min = Number(minRating);
    if (!Number.isFinite(min)) {
      return res.status(400).json({ error: 'minRating must be a number', minRating });
    }
    result = result.filter((review) => review.rating >= min);
  }

  if (maxRating !== undefined) {
    const max = Number(maxRating);
    if (!Number.isFinite(max)) {
      return res.status(400).json({ error: 'maxRating must be a number', maxRating });
    }
    result = result.filter((review) => review.rating <= max);
  }

  if (author !== undefined) {
    const wanted = String(author).trim().toLowerCase();
    result = result.filter((review) => review.author.toLowerCase().includes(wanted));
  }

  if (sort !== undefined) {
    const field = String(sort).trim();
    if (!SORT_FIELDS.includes(field)) {
      return res.status(400).json({ error: 'Unknown sort field', sort, allowed: SORT_FIELDS });
    }

    const wantedOrder = String(order === undefined ? 'asc' : order).trim().toLowerCase();
    const direction = wantedOrder === 'desc' ? -1 : 1;

    result.sort((a, b) => {
      // Dates are stored as YYYY-MM-DD, so a plain string compare is chronological.
      if (field === 'date') return a.date.localeCompare(b.date) * direction;
      return (a.rating - b.rating) * direction;
    });
  }

  if (limit !== undefined) {
    const max = Number(limit);
    if (!Number.isInteger(max) || max < 0) {
      return res.status(400).json({ error: 'limit must be a non-negative integer', limit });
    }
    result = result.slice(0, max);
  }

  return res.json(result);
});

/* ----------------------------------------------------- GET /api/reviews/:id */

router.get('/:id', (req, res) => {
  const review = store.getReviewById(req.params.id);
  if (!review) {
    return res.status(404).json({ error: 'Review not found', id: idForResponse(req.params.id) });
  }
  return res.json(review);
});

/* ----------------------------------------------------- PUT /api/reviews/:id */

router.put('/:id', (req, res) => {
  const body = isPlainObject(req.body) ? req.body : {};
  const problems = collectBodyProblems(body, REVIEW_FIELD_VALIDATORS, REVIEW_REQUIRED_FIELDS);

  if (problems.length > 0) {
    return res.status(400).json({
      error: 'A PUT replaces the whole review, so albumId, author, rating and text are all required. ' + INVALID_REVIEW_MESSAGE,
      missing: problems
    });
  }

  // A review can only ever point at an album that exists.
  if (!store.getAlbumById(body.albumId)) {
    return res.status(400).json({ error: 'Album not found', missing: ['albumId'], albumId: body.albumId });
  }

  const replaced = store.replaceReview(req.params.id, body);
  if (!replaced) {
    return res.status(404).json({ error: 'Review not found', id: idForResponse(req.params.id) });
  }
  return res.json(replaced);
});

/* --------------------------------------------------- PATCH /api/reviews/:id */

router.patch('/:id', (req, res) => {
  const body = isPlainObject(req.body) ? req.body : {};

  if (Object.keys(body).length === 0) {
    return res.status(400).json({
      error: 'A PATCH request needs a body with at least one field to change'
    });
  }

  const fields = knownFieldsIn(body, REVIEW_FIELD_VALIDATORS);
  if (fields.length === 0) {
    return res.status(400).json({
      error: 'No known review field to update',
      allowed: Object.keys(REVIEW_FIELD_VALIDATORS)
    });
  }

  const problems = collectBodyProblems(body, REVIEW_FIELD_VALIDATORS, []);
  if (problems.length > 0) {
    return res.status(400).json({ error: INVALID_REVIEW_MESSAGE, missing: problems });
  }

  if (body.albumId !== undefined && !store.getAlbumById(body.albumId)) {
    return res.status(400).json({ error: 'Album not found', missing: ['albumId'], albumId: body.albumId });
  }

  const patch = {};
  for (const field of fields) patch[field] = body[field];

  const updated = store.patchReview(req.params.id, patch);
  if (!updated) {
    return res.status(404).json({ error: 'Review not found', id: idForResponse(req.params.id) });
  }
  return res.json(updated);
});

/* -------------------------------------------------- DELETE /api/reviews/:id */

router.delete('/:id', (req, res) => {
  const deleted = store.deleteReview(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Review not found', id: idForResponse(req.params.id) });
  }

  return res.json({
    deleted,
    message: 'Review ' + deleted.id + ' deleted'
  });
});

module.exports = router;
