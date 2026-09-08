# HTTP Quest — a game for learning HTTP and REST

HTTP Quest is a browser game that teaches HTTP and REST by making you do the real thing.
Each level describes something a record shop needs — list the catalog, put an album on
sale, take a review down — and you assemble the actual HTTP request that achieves it:
method, path, query parameters and JSON body. The request is sent to this project's own
Express API with `fetch`, and a real response comes back with a real status code. Nothing
is simulated. The server alone decides whether your request was right, so the answers are
never in the page you are looking at.

## Requirements

- **Node.js 18 or newer** (developed and tested on Node.js 24.19.0 LTS). Node 18+ is
  required because the client and the server both rely on the built-in `fetch`.
- No database, and no build step.

## Setup

```bash
npm install
npm start
```

Then open:

- **http://localhost:3000** — the game
- **http://localhost:3000/schemas** — the resource schemas page

`npm run dev` starts the same server with `node --watch` for auto-restart.

The server listens on `PORT` if it is set, otherwise on 3000. All data lives in server
memory and is seeded from the JSON files in `data/` at startup, so restarting the server
resets the catalog to its original state.

## The ten levels

Each level tests a different operation or a different combination of ideas — never the
same request with a different id. Solutions are not listed here, and they are not in the
client code either.

| # | Level | Concepts exercised |
|---|-------|--------------------|
| 1 | The whole catalog | Reading a collection, JSON responses |
| 2 | A single album | Route parameter |
| 3 | Browse by genre, cheapest first | Several query parameters in one request: filtering plus ordering (the sort direction may be stated or left to the server default) |
| 4 | What people said about it | Relation between resources + route parameter |
| 5 | Something that is not there | Error handling, reading a 404 as information |
| 6 | A new record arrives | Creating a resource with a request body |
| 7 | A customer writes in | Route parameter + request body, on a nested collection |
| 8 | On sale | Route parameter + deliberately partial body |
| 9 | Rewritten from scratch | Route parameter + full replacement body |
| 10 | Taking it down | Deleting a resource |

Levels 3, 4, 7, 8 and 9 each combine more than one concept.

## API reference

Every endpoint answers with JSON, including every error. All API routes live under `/api`.

### Albums

| Method | Path | Parameters | Status codes |
|--------|------|------------|--------------|
| `GET` | `/api/albums` | Query (all optional, combinable): `genre` (exact, case-insensitive), `artist` (substring, case-insensitive), `minPrice`, `maxPrice`, `inStock` (`true`/`false`), `sort` (`price`, `year`, `title`), `order` (`asc`/`desc`), `limit` | `200`, `400` on an unknown `sort` or a non-numeric bound |
| `GET` | `/api/albums/:id` | Route: `id` | `200`, `404` |
| `POST` | `/api/albums` | Body: `title`, `artist`, `genre`, `price` required | `201` + `Location` header, `400` |
| `PUT` | `/api/albums/:id` | Route: `id`. Body: all required fields | `200`, `400`, `404` |
| `PATCH` | `/api/albums/:id` | Route: `id`. Body: any subset of fields; `id` cannot be changed | `200`, `400` on an empty or unknown body, `404` |
| `DELETE` | `/api/albums/:id` | Route: `id` | `200` with the deleted album and its cascade-deleted review count, `404` |
| `GET` | `/api/albums/:id/reviews` | Route: `id` | `200` (an empty array is valid), `404` if the album does not exist |
| `POST` | `/api/albums/:id/reviews` | Route: `id`. Body: `author`, `rating` (1–5), `text`. `albumId` comes from the route, not the body | `201`, `400`, `404` |

### Reviews

| Method | Path | Parameters | Status codes |
|--------|------|------------|--------------|
| `GET` | `/api/reviews` | Query (all optional): `albumId`, `minRating`, `maxRating`, `author` (substring, case-insensitive), `sort` (`rating`, `date`), `order`, `limit` | `200`, `400` |
| `GET` | `/api/reviews/:id` | Route: `id` | `200`, `404` |
| `PUT` | `/api/reviews/:id` | Route: `id`. Body: `author`, `rating`, `text`, `albumId`, all required | `200`, `400`, `404` |
| `PATCH` | `/api/reviews/:id` | Route: `id`. Body: any subset of fields | `200`, `400`, `404` |
| `DELETE` | `/api/reviews/:id` | Route: `id` | `200` with the deleted review, `404` |

Any other path under `/api` answers `404` with a JSON body, so a wrong guess still gets a
proper response rather than an HTML error page.

`DELETE` returns `200` with a JSON body rather than `204`, so that there is always
something to show the player and the verdict headers always have a response to travel on.

### Pages

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | The game, server-rendered with EJS |
| `GET` | `/schemas` | Both resource schemas, server-rendered with EJS |

## How the server checks your answer

The correct answer for every level is defined in `src/game/levels.js`, on the server, and
never leaves it. Only `id`, `title`, `scenario` and `hint` are sent to the browser.

1. The client sends the request the player built to the **real API route**, adding one
   header: `X-Level-Id: <number>`.
2. `src/game/middleware.js` runs on `/api` before the routers. It wraps `res.json`, so
   whichever route ends up answering — including the catch-all for a completely wrong
   path — the request is graded just before the body goes out.
3. `src/game/checker.js` compares the request against the level's stored solution in a
   fixed order — method, route path, route params, query params, body, status — and stops
   at the first mismatch. The route path is read from Express's own `req.route.path`, not
   by parsing the URL, so `/api/albums/7` and `/api/albums/999` both resolve to
   `/api/albums/:id` and only the params tell them apart.
4. The verdict travels back in response headers, never in the body:
   - `X-Game-Result: correct | incorrect`
   - `X-Game-Feedback: <message, URI-encoded>`
   - `Access-Control-Expose-Headers: X-Game-Result, X-Game-Feedback`
5. The client enables "Next level" **only** when `X-Game-Result` says `correct`. It never
   infers success from the status code or the response body — which matters, because one
   level is solved correctly by triggering a `404`.

Feedback messages say *which part* of the request is wrong without ever revealing the
right value.

Because the level id is just a header, the API is a perfectly ordinary REST API without
it: `curl http://localhost:3000/api/albums` works on its own and returns no verdict
headers at all.

## Features beyond the minimum

- Ten levels, five of which combine more than one concept.
- Scoring: 100 points a level, reduced by wrong attempts and by revealing a hint, with a
  floor of 20. Re-solving a level never changes a score already earned.
- Attempt counting per level, and a completion screen with the final score and total
  attempts.
- Progress, score and even the last request typed for each level persist in
  `localStorage`, so a reload picks up where you left off. A "Reset progress" control
  clears it.
- Free navigation back to any solved level, which restores the request you built there.
- A live preview of the exact URL that will be sent.
- Error handling on both sides: invalid JSON in the body is caught in the browser before
  anything is sent, malformed JSON reaching the server answers `400` as JSON, and a
  network failure is reported instead of failing silently.
- Accessibility: `aria-live` on the verdict, labels on icon-only buttons, visible focus
  rings, a skip link, and level states distinguished by shape and glyph rather than
  colour alone.
- Responsive from phone to desktop, with a reduced-motion preference respected.

## Project structure

```
server.js                 Express app: view engine, static files, routers, error handlers
package.json
README.md
data/
  albums.json             12 seed albums
  reviews.json            15 seed reviews
src/
  store.js                In-memory data store and all read/write operations
  schemas.js              Resource descriptions rendered by the schemas page
  game/
    levels.js             The ten levels, public halves and secret solutions
    checker.js            Compares a request against a level's solution
    middleware.js         Attaches the verdict headers to /api responses
  routes/
    albums.js             /api/albums, including nested reviews
    reviews.js            /api/reviews
    pages.js              / and /schemas
views/
  game.ejs                The game page
  schemas.ejs             The schemas page
  partials/
    head.ejs              Shared <head>
public/
  css/style.css           All client styling
  js/game.js              All client behaviour, vanilla JavaScript
```

## Notes on the constraints

- Client-side JavaScript is vanilla only — no framework, no library, nothing loaded from
  a CDN. Client CSS and JS are external files under `public/`.
- Both pages are server-rendered with EJS. The schemas page builds its tables by looping
  over server data at render time, so the field names are in the HTML the browser
  receives.
- The API is RESTful: resource nouns and HTTP methods, never a path like
  `/api/deleteAlbum`.
- Data is held in server memory, seeded from JSON. There is no database. `POST`, `PUT`,
  `PATCH` and `DELETE` really do change it, and later requests see the change.
- Moving between levels never reloads the page or navigates anywhere.
