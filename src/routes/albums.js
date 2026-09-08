'use strict';

const express = require('express');
const store = require('../store');

const router = express.Router();

/* --------------------------------------------------------------- validation */

const SORT_FIELDS = ['price', 'year', 'title'];

const ALBUM_REQUIRED_FIELDS = ['title', 'artist', 'genre', 'price'];

const ALBUM_FIELD_VALIDATORS = {
  title: isNonEmptyString,
  artist: isNonEmptyString,
  genre: isNonEmptyString,
  year: isFiniteNumber,
  price: isFiniteNumber,
  inStock: (value) => typeof value === 'boolean'
};

const REVIEW_REQUIRED_FIELDS = ['author', 'rating', 'text'];

const REVIEW_FIELD_VALIDATORS = {
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

/**
 * The id echoed back in a 404 body: a number when the route param was numeric,
 * otherwise the raw string, so /api/albums/abc does not report "id": null.
 */
function idForResponse(rawId) {
  const asNumber = Number(rawId);
  return Number.isFinite(asNumber) ? asNumber : rawId;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Collects the fields a body is missing (required but absent) and the ones that are
 * present with the wrong type. Both end up in the "missing" array of the 400 response,
 * so the player always sees exactly which field to fix.
 */
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

/* ---------------------------------------------------------- GET /api/albums */

router.get('/', (req, res) => {
  const { genre, artist, minPrice, maxPrice, inStock, sort, order, limit } = req.query;

  let result = store.getAlbums();

  if (genre !== undefined) {
    const wanted = String(genre).trim().toLowerCase();
    result = result.filter((album) => album.genre.toLowerCase() === wanted);
  }

  if (artist !== undefined) {
    const wanted = String(artist).trim().toLowerCase();
    result = result.filter((album) => album.artist.toLowerCase().includes(wanted));
  }

  if (minPrice !== undefined) {
    const min = Number(minPrice);
    if (!Number.isFinite(min)) {
      return res.status(400).json({ error: 'minPrice must be a number', minPrice });
    }
    result = result.filter((album) => album.price >= min);
  }

  if (maxPrice !== undefined) {
    const max = Number(maxPrice);
    if (!Number.isFinite(max)) {
      return res.status(400).json({ error: 'maxPrice must be a number', maxPrice });
    }
    result = result.filter((album) => album.price <= max);
  }

  if (inStock !== undefined) {
    const wanted = String(inStock).trim().toLowerCase();
    if (wanted !== 'true' && wanted !== 'false') {
      return res.status(400).json({ error: 'inStock must be true or false', inStock });
    }
    result = result.filter((album) => album.inStock === (wanted === 'true'));
  }

  if (sort !== undefined) {
    const field = String(sort).trim();
    if (!SORT_FIELDS.includes(field)) {
      return res.status(400).json({ error: 'Unknown sort field', sort, allowed: SORT_FIELDS });
    }

    const wantedOrder = String(order === undefined ? 'asc' : order).trim().toLowerCase();
    const direction = wantedOrder === 'desc' ? -1 : 1;

    result.sort((a, b) => {
      if (field === 'title') return a.title.localeCompare(b.title) * direction;
      return (a[field] - b[field]) * direction;
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

/* ------------------------------------------------------ GET /api/albums/:id */

router.get('/:id', (req, res) => {
  const album = store.getAlbumById(req.params.id);
  if (!album) {
    return res.status(404).json({ error: 'Album not found', id: idForResponse(req.params.id) });
  }
  return res.json(album);
});

/* --------------------------------------------------------- POST /api/albums */

router.post('/', (req, res) => {
  const body = isPlainObject(req.body) ? req.body : {};
  const problems = collectBodyProblems(body, ALBUM_FIELD_VALIDATORS, ALBUM_REQUIRED_FIELDS);

  if (problems.length > 0) {
    return res.status(400).json({
      error: 'Invalid album: title, artist and genre must be non-empty strings, price and year must be numbers, inStock must be a boolean',
      missing: problems
    });
  }

  const created = store.addAlbum(body);
  return res.status(201).location('/api/albums/' + created.id).json(created);
});

/* ---------------------------------------------------- PATCH /api/albums/:id */

router.patch('/:id', (req, res) => {
  const body = isPlainObject(req.body) ? req.body : {};

  if (Object.keys(body).length === 0) {
    return res.status(400).json({
      error: 'A PATCH request needs a body with at least one field to change'
    });
  }

  const fields = knownFieldsIn(body, ALBUM_FIELD_VALIDATORS);
  if (fields.length === 0) {
    return res.status(400).json({
      error: 'No known album field to update',
      allowed: Object.keys(ALBUM_FIELD_VALIDATORS)
    });
  }

  const problems = collectBodyProblems(body, ALBUM_FIELD_VALIDATORS, []);
  if (problems.length > 0) {
    return res.status(400).json({ error: 'Invalid album field types', missing: problems });
  }

  const patch = {};
  for (const field of fields) patch[field] = body[field];

  const updated = store.patchAlbum(req.params.id, patch);
  if (!updated) {
    return res.status(404).json({ error: 'Album not found', id: idForResponse(req.params.id) });
  }
  return res.json(updated);
});

/* ------------------------------------------------------ PUT /api/albums/:id */

router.put('/:id', (req, res) => {
  const body = isPlainObject(req.body) ? req.body : {};
  const problems = collectBodyProblems(body, ALBUM_FIELD_VALIDATORS, ALBUM_REQUIRED_FIELDS);

  if (problems.length > 0) {
    return res.status(400).json({
      error: 'Invalid album: a PUT replaces the whole album, so title, artist, genre and price are all required',
      missing: problems
    });
  }

  const replaced = store.replaceAlbum(req.params.id, body);
  if (!replaced) {
    return res.status(404).json({ error: 'Album not found', id: idForResponse(req.params.id) });
  }
  return res.json(replaced);
});

/* --------------------------------------------------- DELETE /api/albums/:id */

router.delete('/:id', (req, res) => {
  const deleted = store.deleteAlbum(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Album not found', id: idForResponse(req.params.id) });
  }

  // A review cannot outlive the album it belongs to.
  const removedReviews = store.deleteReviewsByAlbumId(deleted.id);

  return res.json({
    deleted,
    deletedReviews: removedReviews.length,
    message: 'Album ' + deleted.id + ' deleted, along with ' + removedReviews.length + ' of its reviews'
  });
});

/* ---------------------------------------------- GET /api/albums/:id/reviews */

router.get('/:id/reviews', (req, res) => {
  const album = store.getAlbumById(req.params.id);
  if (!album) {
    return res.status(404).json({ error: 'Album not found', id: idForResponse(req.params.id) });
  }

  // An album with no reviews is a perfectly valid 200 with an empty array.
  return res.json(store.getReviewsByAlbumId(album.id));
});

/* --------------------------------------------- POST /api/albums/:id/reviews */

router.post('/:id/reviews', (req, res) => {
  const album = store.getAlbumById(req.params.id);
  if (!album) {
    return res.status(404).json({ error: 'Album not found', id: idForResponse(req.params.id) });
  }

  const body = isPlainObject(req.body) ? req.body : {};
  const problems = collectBodyProblems(body, REVIEW_FIELD_VALIDATORS, REVIEW_REQUIRED_FIELDS);

  if (problems.length > 0) {
    return res.status(400).json({
      error: 'Invalid review: author and text must be non-empty strings, rating must be a number between 1 and 5, date must look like YYYY-MM-DD',
      missing: problems
    });
  }

  // The album a review belongs to comes from the route, never from the body.
  const created = store.addReview({
    albumId: album.id,
    author: body.author,
    rating: body.rating,
    text: body.text,
    date: body.date
  });

  return res.status(201).location('/api/reviews/' + created.id).json(created);
});

module.exports = router;
