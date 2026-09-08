'use strict';

/**
 * In-memory data store.
 *
 * The JSON files under data/ are the seed only. They are deep-copied once on load and
 * never written back, so restarting the server resets the game world.
 *
 * Every getter hands out copies, so a caller that sorts or edits the result cannot
 * corrupt the store. All mutations go through the functions below.
 */

const albumsSeed = require('../data/albums.json');
const reviewsSeed = require('../data/reviews.json');

const albums = deepCopy(albumsSeed);
const reviews = deepCopy(reviewsSeed);

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

// Route params arrive as strings; ids are always compared as numbers.
function toId(value) {
  const id = Number(value);
  return Number.isFinite(id) ? id : NaN;
}

function nextId(collection) {
  return collection.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

function findIndexById(collection, id) {
  const wanted = toId(id);
  return collection.findIndex((item) => item.id === wanted);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ albums */

function getAlbums() {
  return deepCopy(albums);
}

function getAlbumById(id) {
  const index = findIndexById(albums, id);
  return index === -1 ? null : deepCopy(albums[index]);
}

function addAlbum(data) {
  const album = {
    id: nextId(albums),
    title: data.title,
    artist: data.artist,
    genre: data.genre,
    year: data.year === undefined ? null : Number(data.year),
    price: Number(data.price),
    inStock: data.inStock === undefined ? true : Boolean(data.inStock)
  };
  albums.push(album);
  return deepCopy(album);
}

function patchAlbum(id, patch) {
  const index = findIndexById(albums, id);
  if (index === -1) return null;

  const { id: ignoredId, ...fields } = patch; // the id is never patchable
  Object.assign(albums[index], fields);
  return deepCopy(albums[index]);
}

function replaceAlbum(id, data) {
  const index = findIndexById(albums, id);
  if (index === -1) return null;

  albums[index] = {
    id: albums[index].id,
    title: data.title,
    artist: data.artist,
    genre: data.genre,
    year: data.year === undefined ? null : Number(data.year),
    price: Number(data.price),
    inStock: data.inStock === undefined ? true : Boolean(data.inStock)
  };
  return deepCopy(albums[index]);
}

function deleteAlbum(id) {
  const index = findIndexById(albums, id);
  if (index === -1) return null;

  const [removed] = albums.splice(index, 1);
  return removed;
}

/* ----------------------------------------------------------------- reviews */

function getReviews() {
  return deepCopy(reviews);
}

function getReviewById(id) {
  const index = findIndexById(reviews, id);
  return index === -1 ? null : deepCopy(reviews[index]);
}

function getReviewsByAlbumId(albumId) {
  const wanted = toId(albumId);
  return deepCopy(reviews.filter((review) => review.albumId === wanted));
}

function addReview(data) {
  const review = {
    id: nextId(reviews),
    albumId: toId(data.albumId),
    author: data.author,
    rating: Number(data.rating),
    text: data.text,
    date: data.date === undefined ? todayISO() : data.date
  };
  reviews.push(review);
  return deepCopy(review);
}

function patchReview(id, patch) {
  const index = findIndexById(reviews, id);
  if (index === -1) return null;

  const { id: ignoredId, ...fields } = patch; // the id is never patchable
  if (fields.albumId !== undefined) fields.albumId = toId(fields.albumId);
  Object.assign(reviews[index], fields);
  return deepCopy(reviews[index]);
}

function replaceReview(id, data) {
  const index = findIndexById(reviews, id);
  if (index === -1) return null;

  reviews[index] = {
    id: reviews[index].id,
    albumId: toId(data.albumId),
    author: data.author,
    rating: Number(data.rating),
    text: data.text,
    date: data.date === undefined ? todayISO() : data.date
  };
  return deepCopy(reviews[index]);
}

function deleteReview(id) {
  const index = findIndexById(reviews, id);
  if (index === -1) return null;

  const [removed] = reviews.splice(index, 1);
  return removed;
}

// Used when an album is deleted: its reviews must not outlive it.
function deleteReviewsByAlbumId(albumId) {
  const wanted = toId(albumId);
  const removed = reviews.filter((review) => review.albumId === wanted);
  for (const review of removed) {
    reviews.splice(reviews.indexOf(review), 1);
  }
  return removed;
}

module.exports = {
  getAlbums,
  getAlbumById,
  addAlbum,
  patchAlbum,
  replaceAlbum,
  deleteAlbum,
  getReviews,
  getReviewById,
  addReview,
  patchReview,
  replaceReview,
  deleteReview,
  getReviewsByAlbumId,
  deleteReviewsByAlbumId
};
