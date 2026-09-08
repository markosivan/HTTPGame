'use strict';

/**
 * The shape of the API, described as data.
 *
 * The /schemas page renders this on the server with EJS, so every field name and type
 * is present in the HTML the browser receives — no client-side fetching involved.
 *
 * This describes the API, not the game. Which request solves which level stays in
 * src/game/levels.js and never leaves the server.
 */

const SCHEMAS = [
  {
    name: 'albums',
    title: 'Album',
    description:
      'A record in the shop catalog. Albums are the main resource: everything else in the store hangs off one of them.',
    fields: [
      {
        name: 'id',
        type: 'number',
        required: false,
        description: 'Unique identifier. The server assigns it on creation, so you never send it yourself.'
      },
      {
        name: 'title',
        type: 'string',
        required: true,
        description: 'The name of the album.'
      },
      {
        name: 'artist',
        type: 'string',
        required: true,
        description: 'Who recorded it.'
      },
      {
        name: 'genre',
        type: 'string',
        required: true,
        description: 'Musical genre, for example Rock, Jazz, Pop, Hip-Hop, Electronic or Classical.'
      },
      {
        name: 'year',
        type: 'number',
        required: false,
        description: 'Year of release. Optional; stored as null when it is left out.'
      },
      {
        name: 'price',
        type: 'number',
        required: true,
        description: 'Shelf price in shekels.'
      },
      {
        name: 'inStock',
        type: 'boolean',
        required: false,
        description: 'Whether a copy is on the shelf right now. Defaults to true.'
      }
    ],
    queryParams: [
      { name: 'genre', type: 'string', description: 'Keep only albums of this genre. Case-insensitive, exact match.' },
      { name: 'artist', type: 'string', description: 'Keep albums whose artist contains this text. Case-insensitive.' },
      { name: 'minPrice', type: 'number', description: 'Keep albums priced at or above this value.' },
      { name: 'maxPrice', type: 'number', description: 'Keep albums priced at or below this value.' },
      { name: 'inStock', type: 'true | false', description: 'Keep only albums that are, or are not, in stock.' },
      { name: 'sort', type: 'price | year | title', description: 'Order the results by this field. Anything else is rejected with 400.' },
      { name: 'order', type: 'asc | desc', description: 'Direction of the sort. Defaults to asc.' },
      { name: 'limit', type: 'number', description: 'Return at most this many albums.' }
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/api/albums',
        description: 'The whole catalog. Every query parameter below is optional and they combine freely.',
        statuses: '200, 400'
      },
      {
        method: 'GET',
        path: '/api/albums/:id',
        description: 'One album by its identifier.',
        statuses: '200, 404'
      },
      {
        method: 'POST',
        path: '/api/albums',
        description: 'Create an album from the JSON body. Answers with a Location header pointing at the new album.',
        statuses: '201, 400'
      },
      {
        method: 'PUT',
        path: '/api/albums/:id',
        description: 'Replace an album completely. Every required field must be present.',
        statuses: '200, 400, 404'
      },
      {
        method: 'PATCH',
        path: '/api/albums/:id',
        description: 'Change only the fields present in the body. The id itself can never be changed.',
        statuses: '200, 400, 404'
      },
      {
        method: 'DELETE',
        path: '/api/albums/:id',
        description: 'Remove an album, and with it every review that belongs to it. Answers 200 with the deleted album, not 204.',
        statuses: '200, 404'
      },
      {
        method: 'GET',
        path: '/api/albums/:id/reviews',
        description: 'Every review written about this album. An album with no reviews answers 200 with an empty array.',
        statuses: '200, 404'
      },
      {
        method: 'POST',
        path: '/api/albums/:id/reviews',
        description: 'Create a review under this album. The albumId is taken from the path, never from the body.',
        statuses: '201, 400, 404'
      }
    ]
  },
  {
    name: 'reviews',
    title: 'Review',
    description:
      'What a customer wrote about one album. A review always belongs to exactly one album, and cannot outlive it: deleting an album deletes its reviews too.',
    fields: [
      {
        name: 'id',
        type: 'number',
        required: false,
        description: 'Unique identifier. Assigned by the server.'
      },
      {
        name: 'albumId',
        type: 'number',
        required: true,
        description: 'The album this review is about. Must be the id of an album that exists.'
      },
      {
        name: 'author',
        type: 'string',
        required: true,
        description: 'Name of the person who wrote the review.'
      },
      {
        name: 'rating',
        type: 'number (1-5)',
        required: true,
        description: 'Score out of five. Anything outside that range is rejected with 400.'
      },
      {
        name: 'text',
        type: 'string',
        required: true,
        description: 'The review itself.'
      },
      {
        name: 'date',
        type: 'string (YYYY-MM-DD)',
        required: false,
        description: 'When the review was written. Defaults to today when it is left out.'
      }
    ],
    queryParams: [
      { name: 'albumId', type: 'number', description: 'Keep only reviews of this album.' },
      { name: 'minRating', type: 'number', description: 'Keep reviews rated at or above this value.' },
      { name: 'maxRating', type: 'number', description: 'Keep reviews rated at or below this value.' },
      { name: 'author', type: 'string', description: 'Keep reviews whose author contains this text. Case-insensitive.' },
      { name: 'sort', type: 'rating | date', description: 'Order the results by this field. Anything else is rejected with 400.' },
      { name: 'order', type: 'asc | desc', description: 'Direction of the sort. Defaults to asc.' },
      { name: 'limit', type: 'number', description: 'Return at most this many reviews.' }
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/api/reviews',
        description: 'Every review in the system, filtered and ordered by the optional query parameters below.',
        statuses: '200, 400'
      },
      {
        method: 'GET',
        path: '/api/reviews/:id',
        description: 'One review by its identifier.',
        statuses: '200, 404'
      },
      {
        method: 'PUT',
        path: '/api/reviews/:id',
        description: 'Replace a review completely. The album it points at has to exist.',
        statuses: '200, 400, 404'
      },
      {
        method: 'PATCH',
        path: '/api/reviews/:id',
        description: 'Change only the fields present in the body.',
        statuses: '200, 400, 404'
      },
      {
        method: 'DELETE',
        path: '/api/reviews/:id',
        description: 'Remove a review. Answers 200 with the deleted review.',
        statuses: '200, 404'
      }
    ]
  }
];

function getSchemas() {
  return SCHEMAS;
}

module.exports = { SCHEMAS, getSchemas };
