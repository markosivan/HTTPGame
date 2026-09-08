'use strict';

const { getLevelById } = require('./levels');

/**
 * Decides whether the request the player just sent solves the level.
 *
 * The comparison runs in the order a person would debug a request — method, then where
 * it was aimed, then what rode along with it, then what came back — and stops at the
 * first mismatch, so the feedback always points at the earliest thing that is wrong.
 *
 * Feedback names the PART of the request that is off and never the value it should
 * have had. Telling the player "the path should be /api/albums/7" would be handing over
 * the answer, which is exactly what this file exists to avoid.
 */
function checkLevel(levelId, req, statusCode, responseBody) { // eslint-disable-line no-unused-vars
  const level = getLevelById(levelId);
  if (!level) {
    return { correct: false, message: 'Unknown level' };
  }

  const solution = level.solution;

  // 1. Method ---------------------------------------------------------------
  if (String(req.method).toUpperCase() !== solution.method) {
    return incorrect(
      'That is not the HTTP method this task calls for. Ask yourself what the action really does to the resource: read it, create it, replace it, change part of it, or remove it.'
    );
  }

  // 2. Route path -----------------------------------------------------------
  // Taken from the route that actually matched, not from the URL text, so that
  // /api/albums/7 and /api/albums/999 both resolve to the same pattern and only the
  // route params tell them apart.
  const actualRoutePath = resolveRoutePath(req);
  if (actualRoutePath !== solution.routePath) {
    return incorrect(
      'The method is right, but the path does not point at the resource this task needs. Look again at which resource the scenario is really about, and whether it belongs underneath another one.'
    );
  }

  // 3. Route params ---------------------------------------------------------
  for (const [key, expected] of Object.entries(solution.params || {})) {
    const actual = req.params ? req.params[key] : undefined;
    if (actual === undefined || String(actual).trim() !== String(expected).trim()) {
      return incorrect(
        'You are addressing the right kind of resource, but not the specific one the scenario is about. Check the identifier in the path.'
      );
    }
  }

  // 4. Query params ---------------------------------------------------------
  const expectedQuery = solution.query || {};
  const actualQuery = req.query || {};

  for (const [key, expected] of Object.entries(expectedQuery)) {
    const actual = actualQuery[key];
    if (typeof actual !== 'string') {
      return incorrect(
        'The path is right, but the query string does not yet describe what the scenario asked for. Something the task requires is missing from it.'
      );
    }
    if (normalise(actual) !== normalise(expected)) {
      return incorrect(
        'You are sending the right kind of query parameter, but at least one of its values does not match what the scenario asked for.'
      );
    }
  }

  if (!solution.allowExtraQuery) {
    const extra = Object.keys(actualQuery).filter((key) => !(key in expectedQuery));
    if (extra.length > 0) {
      return incorrect('You sent a query parameter that this task does not need.');
    }
  }

  // 5. Request body ---------------------------------------------------------
  if (solution.requiresBody) {
    const body = isPlainObject(req.body) ? req.body : null;

    if (!body || Object.keys(body).length === 0) {
      return incorrect('This action cannot work without data in the request body, and yours is empty.');
    }

    const problem = checkBody(body, solution);
    if (problem) return incorrect(problem);
  }

  // 6. Status code ----------------------------------------------------------
  if (statusCode !== solution.expectedStatus) {
    return incorrect(
      'The request is aimed correctly, but the server did not answer the way this task expects. Read the status code and the response body — the server is telling you what it could not accept.'
    );
  }

  return { correct: true, message: level.successMessage || 'Correct.' };
}

/* -------------------------------------------------------------------------- */

function checkBody(body, solution) {
  const mustInclude = solution.bodyMustInclude;

  if (Array.isArray(mustInclude)) {
    const missing = mustInclude.filter((key) => body[key] === undefined);
    if (missing.length > 0) {
      return 'The body is missing at least one field that this resource cannot do without. Look at the scenario again and count the things it names.';
    }
  } else if (isPlainObject(mustInclude)) {
    for (const [key, expected] of Object.entries(mustInclude)) {
      if (body[key] === undefined) {
        return 'The body does not contain the field this task is actually about.';
      }
      if (expected !== null && normalise(body[key]) !== normalise(expected)) {
        return 'The right field is in the body, but its value is not the one the scenario asked for.';
      }
    }
  }

  if (Array.isArray(solution.bodyMustNotInclude)) {
    const extra = solution.bodyMustNotInclude.filter((key) => body[key] !== undefined);
    if (extra.length > 0) {
      return 'This task changes one thing only, and your body carries more than that. Send just the part that actually changes.';
    }
  }

  return null;
}

/**
 * The pattern of the route that matched, e.g. /api/albums/:id — the router's own path
 * joined onto the prefix it was mounted at. Returns null when no route matched at all
 * (a wrong path caught by the /api catch-all), which can never equal a real solution.
 */
function resolveRoutePath(req) {
  const routePath = req.route && typeof req.route.path === 'string' ? req.route.path : null;
  if (routePath === null) return null;

  const combined = (req.baseUrl || '') + routePath;
  // '/api/albums' + '/' would otherwise come out as '/api/albums/'.
  return combined.length > 1 ? combined.replace(/\/+$/, '') : combined;
}

function normalise(value) {
  return String(value).trim().toLowerCase();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function incorrect(message) {
  return { correct: false, message };
}

module.exports = { checkLevel };
