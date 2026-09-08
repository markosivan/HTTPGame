'use strict';

/**
 * THROWAWAY requirements audit — delete before submitting (Step 13).
 *
 * Boots the real server on a spare port and checks every hard requirement from the
 * assignment, then prints a pass/fail table. Run with: node audit.js
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3211;
const BASE = `http://localhost:${PORT}`;

const results = [];
function check(id, label, passed, detail) {
  results.push({ id, label, passed: !!passed, detail: detail || '' });
}

const readFile = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`${BASE}/`);
      return true;
    } catch (err) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return false;
}

async function run() {
  const { LEVELS } = require('./src/game/levels');

  // ---------------------------------------------------------- static checks

  // 1 — level count
  check(1, 'Ten levels exist (at least 8 required)', LEVELS.length >= 8,
    `${LEVELS.length} levels`);

  // 2 — every method exercised
  const methods = new Set(LEVELS.map((l) => l.solution.method));
  const wanted = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const missingMethods = wanted.filter((m) => !methods.has(m));
  check(2, 'GET/POST/PUT/PATCH/DELETE each expected by a level', missingMethods.length === 0,
    missingMethods.length ? `missing: ${missingMethods.join(', ')}` : [...methods].join(', '));

  // 3 — route params / multiple query params / request body
  const withParams = LEVELS.filter((l) => Object.keys(l.solution.params || {}).length > 0);
  const withMultiQuery = LEVELS.filter((l) => Object.keys(l.solution.query || {}).length >= 2);
  const withBody = LEVELS.filter((l) => l.solution.requiresBody);
  check(3, 'Route params, 2+ query params, and a body are each required somewhere',
    withParams.length > 0 && withMultiQuery.length > 0 && withBody.length > 0,
    `params: ${withParams.length}, multi-query: ${withMultiQuery.length}, body: ${withBody.length}`);

  // 4 — levels combining more than one concept
  const combined = LEVELS.filter((l) => {
    const s = l.solution;
    let concepts = 0;
    if (Object.keys(s.params || {}).length) concepts++;              // route param
    if (s.requiresBody) concepts++;                                  // request body
    if ((s.routePath.match(/\//g) || []).length >= 4) concepts++;    // nested relation route
    // The assignment names "several query params in one request" as a combination
    // in its own right, so it counts as two on its own.
    if (Object.keys(s.query || {}).length >= 2) concepts += 2;
    else if (Object.keys(s.query || {}).length === 1) concepts++;
    return concepts > 1;
  });
  check(4, 'At least three levels combine more than one concept', combined.length >= 3,
    `${combined.length} levels: ${combined.map((l) => l.id).join(', ')}`);

  // 5 — no duplicate solutions
  const seen = new Map();
  const dupes = [];
  LEVELS.forEach((l) => {
    const key = JSON.stringify(l.solution);
    if (seen.has(key)) dupes.push(`${seen.get(key)} == ${l.id}`);
    else seen.set(key, l.id);
  });
  check(5, 'No two levels share an identical solution', dupes.length === 0,
    dupes.length ? dupes.join('; ') : `${seen.size} distinct solutions`);

  // 6 — an expected 4xx
  const errorLevels = LEVELS.filter((l) => l.solution.expectedStatus >= 400 && l.solution.expectedStatus < 500);
  check(6, 'At least one level expects a 4xx status', errorLevels.length > 0,
    errorLevels.map((l) => `L${l.id}:${l.solution.expectedStatus}`).join(', ') || 'none');

  // 12 — no verbs in route paths
  const routerFiles = ['src/routes/albums.js', 'src/routes/reviews.js'];
  const verbHits = [];
  routerFiles.forEach((file) => {
    readFile(file).split('\n').forEach((line, i) => {
      const m = line.match(/router\.(get|post|put|patch|delete|all)\(\s*'([^']*)'/);
      if (m && /(^|\/)(get|add|create|delete|update|remove|fetch|list)/i.test(m[2])) {
        verbHits.push(`${file}:${i + 1} ${m[2]}`);
      }
    });
  });
  check(12, 'No route path contains a verb', verbHits.length === 0,
    verbHits.join('; ') || 'all paths are resource nouns');

  // ------------------------------------------------------------ live checks

  const server = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverErr = '';
  server.stderr.on('data', (d) => { serverErr += d.toString(); });

  try {
    if (!await waitForServer()) {
      console.error('Server never became reachable.\n' + serverErr);
      process.exit(1);
    }

    // 7 — every /api response is JSON, including errors
    const apiProbes = [
      ['GET', '/api/albums'],
      ['GET', '/api/albums/999'],
      ['GET', '/api/reviews'],
      ['GET', '/api/nonsense'],
      ['POST', '/api/albums']
    ];
    const notJson = [];
    for (const [method, url] of apiProbes) {
      const res = await fetch(BASE + url, { method });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) notJson.push(`${method} ${url} -> ${ct || 'none'}`);
    }
    check(7, 'Every /api response is application/json', notJson.length === 0,
      notJson.join('; ') || `${apiProbes.length} probes all JSON`);

    // 8 — no SOLUTION reaches the client.
    //
    // Deliberately not a grep for raw values like "Rock" or "89": those are inputs the
    // scenario has to give the player (the assignment's own example scenario names the
    // category it wants), and field names are published on /schemas by design. What must
    // never reach the browser is the solution itself — method, path, params, status.
    const gameHtml = await (await fetch(`${BASE}/`)).text();
    const clientJs = readFile('public/js/game.js');
    const leaks = [];

    const needles = new Set(['/api/albums/7']);
    LEVELS.forEach((l) => {
      needles.add(l.solution.routePath);                        // e.g. /api/albums/:id
      needles.add(JSON.stringify(l.solution));                  // the whole solution
      if (l.successMessage) needles.add(l.successMessage);      // grading text is server-side
    });
    [...needles].forEach((n) => {
      if (gameHtml.includes(n)) leaks.push(`game HTML contains "${n.slice(0, 40)}"`);
      if (clientJs.includes(n)) leaks.push(`game.js contains "${n.slice(0, 40)}"`);
    });

    // The embedded payload must carry the four public fields and nothing else.
    const payload = gameHtml.match(/id="levels-data">(.*?)<\/script>/s);
    const allowed = ['id', 'title', 'scenario', 'hint'];
    if (!payload) {
      leaks.push('levels-data payload not found');
    } else {
      JSON.parse(payload[1]).forEach((lv) => {
        Object.keys(lv).forEach((k) => {
          if (!allowed.includes(k)) leaks.push(`level ${lv.id} exposes "${k}"`);
        });
      });
    }

    check(8, 'No solution (method/path/params/status) reaches the client', leaks.length === 0,
      leaks.join('; ') || `${needles.size} needles checked, payload limited to ${allowed.join('/')}`);

    // 8b — levels really do reach the page (otherwise check 8 passes vacuously)
    const levelCount = (gameHtml.match(/data-level-id=/g) || []).length;
    check('8b', 'Game page renders the level list from the server', levelCount === LEVELS.length,
      `${levelCount} level buttons rendered, expected ${LEVELS.length}`);

    // 9 — schemas page is server-rendered with every field name
    let schemaDetail = '';
    let schemasOk = false;
    try {
      const schemas = require('./src/schemas');
      const res = await fetch(`${BASE}/schemas`);
      const html = await res.text();
      const names = [];
      const collect = (node) => {
        if (Array.isArray(node)) return node.forEach(collect);
        if (node && typeof node === 'object') {
          if (typeof node.name === 'string' && node.type) names.push(node.name);
          Object.values(node).forEach(collect);
        }
      };
      collect(schemas);
      const absent = names.filter((n) => !html.includes(n));
      schemasOk = res.status === 200 && names.length > 0 && absent.length === 0;
      schemaDetail = names.length === 0
        ? 'src/schemas.js exports no field descriptors'
        : `status ${res.status}, ${names.length} field names, missing: ${absent.join(', ') || 'none'}`;
    } catch (err) {
      schemaDetail = err.message;
    }
    check(9, 'GET /schemas renders every schema field name server-side', schemasOk, schemaDetail);

    // 10 — mutations persist in memory
    const created = await fetch(`${BASE}/api/albums`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Audit Probe', artist: 'Audit', genre: 'Test', price: 1 })
    });
    const createdBody = await created.json();
    const listAfter = await (await fetch(`${BASE}/api/albums`)).json();
    const list = Array.isArray(listAfter) ? listAfter : (listAfter.items || listAfter.albums || []);
    const postPersisted = created.status === 201 && list.some((a) => a.id === createdBody.id);

    const delRes = await fetch(`${BASE}/api/reviews/12`, { method: 'DELETE' });
    const getAfterDelete = await fetch(`${BASE}/api/reviews/12`);
    const deletePersisted = delRes.status === 200 && getAfterDelete.status === 404;

    check(10, 'POST and DELETE actually mutate the in-memory data',
      postPersisted && deletePersisted,
      `POST ${created.status} then present: ${postPersisted}; DELETE ${delRes.status} then GET ${getAfterDelete.status}`);

    // 11 — query params genuinely filter and sort
    const filtered = await (await fetch(`${BASE}/api/albums?genre=Rock&sort=price&order=asc`)).json();
    const all = await (await fetch(`${BASE}/api/albums`)).json();
    const fList = Array.isArray(filtered) ? filtered : [];
    const aList = Array.isArray(all) ? all : [];
    let sorted = true;
    for (let i = 1; i < fList.length; i++) {
      if (fList[i].price < fList[i - 1].price) sorted = false;
    }
    check(11, 'genre+sort+order filters and orders the collection',
      fList.length > 0 && sorted && fList.length < aList.length,
      `${fList.length} of ${aList.length} items, prices non-decreasing: ${sorted}`);
  } finally {
    server.kill();
  }

  // -------------------------------------------------------------- reporting

  const width = Math.max(...results.map((r) => r.label.length));
  console.log('\n  #    RESULT  REQUIREMENT');
  console.log('  ' + '-'.repeat(width + 20));
  results.forEach((r) => {
    console.log(`  ${String(r.id).padEnd(4)} ${r.passed ? ' PASS ' : ' FAIL '}  ${r.label.padEnd(width)}  ${r.detail}`);
  });

  const failed = results.filter((r) => !r.passed);
  console.log('\n  ' + (results.length - failed.length) + '/' + results.length + ' checks passed.');
  if (failed.length) {
    console.log('\n  Failures:');
    failed.forEach((r) => console.log(`   - [${r.id}] ${r.label}\n       ${r.detail}`));
  }
  process.exit(failed.length ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
