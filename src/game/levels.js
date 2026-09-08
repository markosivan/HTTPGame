'use strict';

/**
 * The ten levels of the game.
 *
 * Each level has a public half (id, title, scenario, hint) that is safe to render into
 * the page, and a secret `solution` that never leaves the server. The scenario always
 * describes the GOAL — what the shop needs to happen — and never the method, the path
 * or the parameters that achieve it. Working those out is the whole game.
 *
 * solution fields:
 *   method            required HTTP method
 *   routePath         Express route pattern, as baseUrl + router path (e.g. /api/albums/:id)
 *   params            route params that must match, compared as strings
 *   query             query params that must all be present with these values
 *   optionalQuery     query params that may be left out, mapped to the values accepted
 *                     if they ARE sent (the API already defaults to those)
 *   allowExtraQuery   when false, any query param outside `query` is a mismatch
 *   requiresBody      the request must carry a non-empty JSON body
 *   bodyMustInclude   array of required body keys, or an object of key -> pinned value
 *   bodyMustNotInclude fields that must NOT appear (used to make a PATCH stay partial)
 *   expectedStatus    the status the server must end up returning
 */

const LEVELS = [
  {
    id: 1,
    title: 'The whole catalog',
    scenario:
      'The shop front page has to list every record the store carries. Ask the server for the complete catalog of albums.',
    hint: 'This is the simplest read there is: a whole collection, with nothing narrowing it down.',
    successMessage: 'Correct. Reading a collection hands you every item as JSON, with status 200.',
    solution: {
      method: 'GET',
      routePath: '/api/albums',
      params: {},
      query: {},
      allowExtraQuery: false,
      requiresBody: false,
      bodyMustInclude: null,
      bodyMustNotInclude: null,
      expectedStatus: 200
    }
  },
  {
    id: 2,
    title: 'A single album',
    scenario:
      'A customer clicked through to the album with id 7. Ask the server for that one album on its own — not the catalog it sits in.',
    hint: 'One item out of a collection has its own address, and the identifier is part of that address.',
    successMessage: 'Correct. The identifier travelled in the address itself — that is a route parameter.',
    solution: {
      method: 'GET',
      routePath: '/api/albums/:id',
      params: { id: 7 },
      query: {},
      allowExtraQuery: false,
      requiresBody: false,
      bodyMustInclude: null,
      bodyMustNotInclude: null,
      expectedStatus: 200
    }
  },
  {
    id: 3,
    title: 'Browse by genre, cheapest first',
    scenario:
      'A visitor only cares about Rock albums, and wants to see the cheapest ones at the top of the list. Ask the server for exactly that view of the catalog.',
    hint: 'You are still reading the whole collection, but two separate instructions have to ride along with the question: what to keep, and what to order by. Naming the direction as well is allowed, as long as it matches what the scenario asked for.',
    successMessage: 'Correct. Query parameters narrowed and reordered the collection without changing its address.',
    solution: {
      method: 'GET',
      routePath: '/api/albums',
      params: {},
      query: { genre: 'Rock', sort: 'price' },
      // The API already sorts ascending unless told otherwise, so stating the direction
      // is optional — but saying "desc" asks for the opposite of the scenario.
      optionalQuery: { order: ['asc', ''] },
      allowExtraQuery: false,
      requiresBody: false,
      bodyMustInclude: null,
      bodyMustNotInclude: null,
      expectedStatus: 200
    }
  },
  {
    id: 4,
    title: 'What people said about it',
    scenario:
      'The page for album 7 also shows the reviews written about that album. Ask the server for the reviews that belong to it.',
    hint: 'A review belongs to an album, so the list of them lives underneath that album, and the album is still named by its identifier.',
    successMessage: 'Correct. Nesting one resource under another is how REST expresses "belongs to".',
    solution: {
      method: 'GET',
      routePath: '/api/albums/:id/reviews',
      params: { id: 7 },
      query: {},
      allowExtraQuery: false,
      requiresBody: false,
      bodyMustInclude: null,
      bodyMustNotInclude: null,
      expectedStatus: 200
    }
  },
  {
    id: 5,
    title: 'Something that is not there',
    scenario:
      'Album 999 has never existed in this store. Find out how the server answers a request for a resource that is not there. Getting the error back IS the goal of this level — read the status code the server chose.',
    hint: 'Ask for it exactly the way you would ask for a real album, then look at the status code rather than the data.',
    successMessage: 'Correct. A missing resource is not a broken request: the server says so with 404 and a JSON explanation.',
    solution: {
      method: 'GET',
      routePath: '/api/albums/:id',
      params: { id: 999 },
      query: {},
      allowExtraQuery: false,
      requiresBody: false,
      bodyMustInclude: null,
      bodyMustNotInclude: null,
      expectedStatus: 404
    }
  },
  {
    id: 6,
    title: 'A new record arrives',
    scenario:
      'The store has taken delivery of a record that is not in the catalog yet. Add it. A new album needs at least a title, an artist, a genre and a price — pick whatever values you like.',
    hint: 'Creating something new means sending its data to the collection it should join. The data itself does not fit in the address.',
    successMessage: 'Correct. Creating a resource answers 201 and points at the new item with a Location header.',
    solution: {
      method: 'POST',
      routePath: '/api/albums',
      params: {},
      query: {},
      allowExtraQuery: false,
      requiresBody: true,
      bodyMustInclude: ['title', 'artist', 'genre', 'price'],
      bodyMustNotInclude: null,
      expectedStatus: 201
    }
  },
  {
    id: 7,
    title: 'A customer writes in',
    scenario:
      'A customer wants to publish a review of album 3. Create it with an author, a rating from 1 to 5 and the text of the review. Which album the review belongs to must come from where you send it, not from the data you send.',
    hint: 'Same shape as adding an album, except the collection you are adding to is the one that hangs underneath a single album.',
    successMessage: 'Correct. The route parameter said which album, and the body said what the review contains.',
    solution: {
      method: 'POST',
      routePath: '/api/albums/:id/reviews',
      params: { id: 3 },
      query: {},
      allowExtraQuery: false,
      requiresBody: true,
      bodyMustInclude: ['author', 'rating', 'text'],
      bodyMustNotInclude: null,
      expectedStatus: 201
    }
  },
  {
    id: 8,
    title: 'On sale',
    scenario:
      'Album 5 goes on sale and its price becomes 89. Change that single field. Everything else about the album has to stay exactly as it is, so send only what actually changes.',
    hint: 'One method exists for changing part of a resource and another for replacing all of it. This level wants the first one, and the body should be as small as the change.',
    successMessage: 'Correct. A partial update carries only the field that changes, and leaves the rest of the resource untouched.',
    solution: {
      method: 'PATCH',
      routePath: '/api/albums/:id',
      params: { id: 5 },
      query: {},
      allowExtraQuery: false,
      requiresBody: true,
      bodyMustInclude: { price: 89 },
      bodyMustNotInclude: ['title', 'artist', 'genre', 'year', 'inStock'],
      expectedStatus: 200
    }
  },
  {
    id: 9,
    title: 'Rewritten from scratch',
    scenario:
      'Review 4 has been rewritten completely: a different author, a different rating, different text, and it still has to record which album it is about. Replace the stored review with that new content in full.',
    hint: 'Replacing is not the same as adjusting one field — the server will expect the entire resource, including which album it belongs to.',
    successMessage: 'Correct. A full replacement sends the whole resource, which is what separates it from a partial update.',
    solution: {
      method: 'PUT',
      routePath: '/api/reviews/:id',
      params: { id: 4 },
      query: {},
      allowExtraQuery: false,
      requiresBody: true,
      bodyMustInclude: ['albumId', 'author', 'rating', 'text'],
      bodyMustNotInclude: null,
      expectedStatus: 200
    }
  },
  {
    id: 10,
    title: 'Taking it down',
    scenario:
      'Review 12 breaks the store rules and has to be taken off the site for good. Remove it.',
    hint: 'Exactly one method exists for removal, and what is being removed is named in the address rather than in any data you send.',
    successMessage: 'Correct. The removal is real: ask for that review again and the server no longer finds it.',
    solution: {
      method: 'DELETE',
      routePath: '/api/reviews/:id',
      params: { id: 12 },
      query: {},
      allowExtraQuery: false,
      requiresBody: false,
      bodyMustInclude: null,
      bodyMustNotInclude: null,
      expectedStatus: 200
    }
  }
];

/**
 * The only level data that may reach the browser. Everything the player would need to
 * guess the answer — method, path, params, body, status — is deliberately left behind.
 */
function getPublicLevels() {
  return LEVELS.map((level) => ({
    id: level.id,
    title: level.title,
    scenario: level.scenario,
    hint: level.hint
  }));
}

function getLevelById(id) {
  return LEVELS.find((level) => level.id === Number(id)) || null;
}

module.exports = { LEVELS, getPublicLevels, getLevelById };
