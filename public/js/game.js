'use strict';

/**
 * HTTP Quest — client logic.
 *
 * The client knows nothing about what a level expects. It builds whatever request
 * the player assembles, sends it with the level id in a header, and reads the
 * verdict back out of the response headers. Correctness is never decided here.
 */
(function () {
  var STORAGE_KEY = 'http-game:v1';

  var BASE_POINTS = 100;
  var WRONG_ATTEMPT_PENALTY = 20;
  var HINT_PENALTY = 25;
  var MIN_POINTS = 20;

  var DEFAULT_PATH = '/api/';
  var BODYLESS_METHODS = ['GET', 'DELETE'];

  // ---------------------------------------------------------------- level data

  var levels = [];
  try {
    levels = JSON.parse(document.getElementById('levels-data').textContent) || [];
  } catch (err) {
    levels = [];
  }

  var levelById = {};
  levels.forEach(function (level) {
    levelById[level.id] = level;
  });

  function indexOfLevel(id) {
    return levels.findIndex(function (level) {
      return level.id === id;
    });
  }

  // -------------------------------------------------------------------- state

  var state = {
    currentLevel: levels.length ? levels[0].id : null,
    solved: [],
    attempts: {},
    hints: [],
    earned: {},
    requests: {}
  };

  // ----------------------------------------------------------------- elements

  var el = {
    progressCurrent: document.getElementById('progress-current'),
    progressTotal: document.getElementById('progress-total'),
    score: document.getElementById('score'),
    resetProgress: document.getElementById('reset-progress'),

    levelList: document.getElementById('level-list'),
    levelEyebrow: document.getElementById('level-eyebrow'),
    levelTitle: document.getElementById('level-title'),
    levelScenario: document.getElementById('level-scenario'),

    hintBtn: document.getElementById('hint-btn'),
    hintText: document.getElementById('hint-text'),

    form: document.getElementById('request-form'),
    method: document.getElementById('method'),
    path: document.getElementById('path'),
    queryRows: document.getElementById('query-rows'),
    addParam: document.getElementById('add-param'),
    body: document.getElementById('body'),
    bodyNote: document.getElementById('body-note'),
    previewMethod: document.getElementById('url-preview-method'),
    previewUrl: document.getElementById('url-preview-url'),
    send: document.getElementById('send'),
    resetBuilder: document.getElementById('reset-builder'),

    sentMethod: document.getElementById('sent-method'),
    sentUrl: document.getElementById('sent-url'),
    statusChip: document.getElementById('status-chip'),
    verdict: document.getElementById('verdict'),
    verdictText: document.getElementById('verdict-text'),
    responseBody: document.getElementById('response-body'),
    nextLevel: document.getElementById('next-level')
  };

  // ------------------------------------------------------------------ helpers

  function isSolved(id) {
    return state.solved.indexOf(id) !== -1;
  }

  function usedHint(id) {
    return state.hints.indexOf(id) !== -1;
  }

  function isUnlocked(id) {
    if (!levels.length) return false;
    if (id === levels[0].id) return true;
    if (isSolved(id)) return true;
    // A level opens up once the level before it has been solved.
    var index = indexOfLevel(id);
    return index > 0 && isSolved(levels[index - 1].id);
  }

  function totalScore() {
    return Object.keys(state.earned).reduce(function (sum, key) {
      return sum + state.earned[key];
    }, 0);
  }

  function totalAttempts() {
    return Object.keys(state.attempts).reduce(function (sum, key) {
      return sum + state.attempts[key];
    }, 0);
  }

  function carriesBody(method) {
    return BODYLESS_METHODS.indexOf(method) === -1;
  }

  // ------------------------------------------------------------------ storage

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // Storage being full or blocked must never interrupt play.
    }
  }

  function load() {
    var stored = null;
    try {
      stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    } catch (err) {
      stored = null;
    }
    if (!stored || typeof stored !== 'object') return;

    state.solved = Array.isArray(stored.solved) ? stored.solved : [];
    state.hints = Array.isArray(stored.hints) ? stored.hints : [];
    state.attempts = stored.attempts && typeof stored.attempts === 'object' ? stored.attempts : {};
    state.earned = stored.earned && typeof stored.earned === 'object' ? stored.earned : {};
    state.requests = stored.requests && typeof stored.requests === 'object' ? stored.requests : {};

    if (levelById[stored.currentLevel]) {
      state.currentLevel = stored.currentLevel;
    }
  }

  // ------------------------------------------------------------ query-param UI

  function makeQueryRow(key, value) {
    var row = document.createElement('div');
    row.className = 'query-row';

    var keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'query-key';
    keyInput.placeholder = 'name';
    keyInput.autocomplete = 'off';
    keyInput.spellcheck = false;
    keyInput.setAttribute('aria-label', 'Query parameter name');
    keyInput.value = key || '';

    var valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'query-value';
    valueInput.placeholder = 'value';
    valueInput.autocomplete = 'off';
    valueInput.spellcheck = false;
    valueInput.setAttribute('aria-label', 'Query parameter value');
    valueInput.value = value || '';

    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn remove-param';
    remove.setAttribute('aria-label', 'Remove this query parameter');
    remove.innerHTML = '&times;';

    row.appendChild(keyInput);
    row.appendChild(valueInput);
    row.appendChild(remove);
    return row;
  }

  function setQueryRows(params) {
    el.queryRows.innerHTML = '';
    var rows = params && params.length ? params : [{ key: '', value: '' }];
    rows.forEach(function (param) {
      el.queryRows.appendChild(makeQueryRow(param.key, param.value));
    });
  }

  // ---------------------------------------------------------- builder <-> data

  /** Reads the builder exactly as the player left it. Nothing is interpreted. */
  function readBuilder() {
    var params = [];
    Array.prototype.forEach.call(el.queryRows.querySelectorAll('.query-row'), function (row) {
      params.push({
        key: row.querySelector('.query-key').value,
        value: row.querySelector('.query-value').value
      });
    });

    return {
      method: el.method.value,
      path: el.path.value,
      params: params,
      body: el.body.value
    };
  }

  function writeBuilder(request) {
    el.method.value = request.method || 'GET';
    el.path.value = typeof request.path === 'string' ? request.path : DEFAULT_PATH;
    el.body.value = request.body || '';
    setQueryRows(request.params);
    updatePreview();
  }

  /** Builds the URL that will actually be fetched. Rows with a blank name are dropped. */
  function buildUrl(request) {
    var path = (request.path || '').trim();
    if (path && path.charAt(0) !== '/') path = '/' + path;

    var search = new URLSearchParams();
    request.params.forEach(function (param) {
      var key = param.key.trim();
      if (!key) return;
      search.append(key, param.value.trim());
    });

    var qs = search.toString();
    return qs ? path + '?' + qs : path;
  }

  function updatePreview() {
    var request = readBuilder();
    el.previewMethod.textContent = request.method;
    el.previewUrl.textContent = buildUrl(request) || '/';

    // The body field is shown on every level; only the note changes.
    var takesBody = carriesBody(request.method);
    el.bodyNote.textContent = takesBody
      ? 'Sent as the JSON request body.'
      : 'This method carries no request body, so anything typed here is ignored.';
    el.bodyNote.classList.toggle('is-ignored', !takesBody);
  }

  function rememberRequest() {
    if (state.currentLevel === null) return;
    state.requests[state.currentLevel] = readBuilder();
    save();
  }

  // ------------------------------------------------------------------ renders

  function renderNav() {
    Array.prototype.forEach.call(el.levelList.querySelectorAll('.level-chip'), function (chip) {
      var id = Number(chip.getAttribute('data-level-id'));
      var unlocked = isUnlocked(id);
      var current = id === state.currentLevel;

      chip.classList.toggle('is-solved', isSolved(id));
      chip.classList.toggle('is-current', current);
      chip.classList.toggle('is-locked', !unlocked);
      chip.disabled = !unlocked;

      if (current) {
        chip.setAttribute('aria-current', 'step');
      } else {
        chip.removeAttribute('aria-current');
      }
    });
  }

  function renderProgress() {
    var index = indexOfLevel(state.currentLevel);
    el.progressCurrent.textContent = index >= 0 ? String(index + 1) : '0';
    el.progressTotal.textContent = String(levels.length);
    el.score.textContent = String(totalScore());
  }

  function renderLevel() {
    var level = levelById[state.currentLevel];

    if (!level) {
      el.levelEyebrow.textContent = '';
      el.levelTitle.textContent = 'No levels loaded';
      el.levelScenario.textContent = 'The server has not sent any level data for this page yet.';
      el.hintBtn.hidden = true;
      el.send.disabled = true;
      renderProgress();
      return;
    }

    el.levelEyebrow.textContent = 'Level ' + (indexOfLevel(level.id) + 1);
    el.levelTitle.textContent = level.title;
    el.levelScenario.textContent = level.scenario;
    el.send.disabled = false;

    // A hint stays revealed once bought, and costs nothing on a solved level.
    if (usedHint(level.id)) {
      el.hintText.textContent = level.hint;
      el.hintText.hidden = false;
      el.hintBtn.hidden = true;
    } else {
      el.hintText.textContent = '';
      el.hintText.hidden = true;
      el.hintBtn.hidden = false;
      el.hintBtn.textContent = isSolved(level.id)
        ? 'Reveal the hint'
        : 'Reveal a hint (costs points)';
    }

    renderNav();
    renderProgress();
  }

  function clearResponse() {
    el.sentMethod.textContent = '—';
    el.sentUrl.textContent = 'Nothing sent yet.';
    el.statusChip.textContent = '—';
    el.statusChip.className = 'status-chip';
    el.verdict.hidden = true;
    el.verdict.className = 'verdict';
    el.verdictText.textContent = '';
    el.responseBody.textContent = 'Send a request to see what the server answers.';
    el.nextLevel.disabled = true;
  }

  function statusClass(status) {
    if (status >= 200 && status < 300) return 'is-2xx';
    if (status >= 400 && status < 500) return 'is-4xx';
    if (status >= 500) return 'is-5xx';
    return 'is-other';
  }

  /** A problem the browser caught before anything was sent. */
  function showClientError(message) {
    el.statusChip.textContent = 'not sent';
    el.statusChip.className = 'status-chip is-client-error';
    el.verdict.hidden = false;
    el.verdict.className = 'verdict is-incorrect';
    el.verdictText.textContent = message;
    el.responseBody.textContent = 'The request never left the browser, so there is no server response.';
    el.nextLevel.disabled = true;
  }

  // ------------------------------------------------------------------- levels

  function goToLevel(id) {
    if (!levelById[id]) return;

    state.currentLevel = id;
    writeBuilder(state.requests[id] || { method: 'GET', path: DEFAULT_PATH, params: [], body: '' });

    clearResponse();
    renderLevel();
    save();
  }

  function awardPoints(id) {
    if (isSolved(id)) return; // Solving again never changes a level's score.

    var wrong = Math.max(0, (state.attempts[id] || 1) - 1);
    var points = BASE_POINTS - wrong * WRONG_ATTEMPT_PENALTY;
    if (usedHint(id)) points -= HINT_PENALTY;

    state.earned[id] = Math.max(MIN_POINTS, points);
    state.solved.push(id);
  }

  // ------------------------------------------------------------------ sending

  function sendRequest() {
    var level = levelById[state.currentLevel];
    if (!level) return;

    var request = readBuilder();
    var url = buildUrl(request);

    if (!url) {
      showClientError('Enter a path before sending.');
      return;
    }

    var options = {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Level-Id': String(level.id)
      }
    };

    // Only methods that carry a body get one, and it has to be valid JSON.
    if (carriesBody(request.method) && request.body.trim()) {
      try {
        JSON.parse(request.body);
      } catch (err) {
        showClientError('That request body is not valid JSON: ' + err.message);
        return;
      }
      options.body = request.body;
    }

    state.attempts[level.id] = (state.attempts[level.id] || 0) + 1;
    rememberRequest();

    el.sentMethod.textContent = request.method;
    el.sentUrl.textContent = url;

    fetch(url, options)
      .then(function (response) {
        return response.text().then(function (text) {
          return { response: response, text: text };
        });
      })
      .then(function (result) {
        renderResponse(level.id, result.response, result.text);
      })
      .catch(function (err) {
        el.statusChip.textContent = 'no response';
        el.statusChip.className = 'status-chip is-5xx';
        el.verdict.hidden = false;
        el.verdict.className = 'verdict is-incorrect';
        el.verdictText.textContent = 'The request could not reach the server.';
        el.responseBody.textContent = String(err && err.message ? err.message : err);
        el.nextLevel.disabled = true;
      });
  }

  function renderResponse(levelId, response, text) {
    el.statusChip.textContent = (response.status + ' ' + (response.statusText || '')).trim();
    el.statusChip.className = 'status-chip ' + statusClass(response.status);

    // Pretty-print JSON, and fall back to the raw text for anything else.
    try {
      el.responseBody.textContent = JSON.stringify(JSON.parse(text), null, 2);
    } catch (err) {
      el.responseBody.textContent = text || '(empty response body)';
    }

    // The verdict comes from the server headers and nowhere else. The status code
    // is never used to decide this: a level can be correct and still answer 404.
    var result = response.headers.get('X-Game-Result');
    var feedback = response.headers.get('X-Game-Feedback');

    if (feedback) {
      try {
        feedback = decodeURIComponent(feedback);
      } catch (err) {
        // Keep the raw value if it was not encoded the way we expect.
      }
    }

    var correct = result === 'correct';

    el.verdict.hidden = false;
    el.verdict.className = 'verdict ' + (correct ? 'is-correct' : 'is-incorrect');
    el.verdictText.textContent = feedback ||
      (result ? (correct ? 'Correct.' : 'Not quite.') : 'The server sent no verdict for this request.');

    if (correct) {
      awardPoints(levelId);
      var index = indexOfLevel(levelId);
      el.nextLevel.disabled = index < 0 || index >= levels.length - 1;
    } else {
      el.nextLevel.disabled = true;
    }

    renderNav();
    renderProgress();
    save();
  }

  // ------------------------------------------------------------------- events

  el.form.addEventListener('submit', function (event) {
    event.preventDefault();
    sendRequest();
  });

  el.form.addEventListener('input', function () {
    updatePreview();
    rememberRequest();
  });

  el.method.addEventListener('change', function () {
    updatePreview();
    rememberRequest();
  });

  el.addParam.addEventListener('click', function () {
    el.queryRows.appendChild(makeQueryRow('', ''));
    rememberRequest();
  });

  el.queryRows.addEventListener('click', function (event) {
    var button = event.target.closest('.remove-param');
    if (!button) return;

    var rows = el.queryRows.querySelectorAll('.query-row');
    if (rows.length === 1) {
      // Keep one row on screen so the control never disappears entirely.
      rows[0].querySelector('.query-key').value = '';
      rows[0].querySelector('.query-value').value = '';
    } else {
      button.closest('.query-row').remove();
    }

    updatePreview();
    rememberRequest();
  });

  el.hintBtn.addEventListener('click', function () {
    var level = levelById[state.currentLevel];
    if (!level || usedHint(level.id)) return;

    state.hints.push(level.id);
    renderLevel();
    save();
  });

  el.resetBuilder.addEventListener('click', function () {
    writeBuilder({ method: 'GET', path: DEFAULT_PATH, params: [], body: '' });
    rememberRequest();
  });

  el.nextLevel.addEventListener('click', function () {
    var index = indexOfLevel(state.currentLevel);
    if (index >= 0 && index < levels.length - 1) {
      goToLevel(levels[index + 1].id);
    }
  });

  el.levelList.addEventListener('click', function (event) {
    var chip = event.target.closest('.level-chip');
    if (!chip) return;

    var id = Number(chip.getAttribute('data-level-id'));
    if (!isUnlocked(id)) return; // Locked levels do nothing at all.
    goToLevel(id);
  });

  el.resetProgress.addEventListener('click', function () {
    if (!window.confirm('Reset all progress and start again from the first level?')) return;

    state.solved = [];
    state.attempts = {};
    state.hints = [];
    state.earned = {};
    state.requests = {};
    state.currentLevel = levels.length ? levels[0].id : null;

    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      // Nothing to clear if storage is unavailable.
    }

    if (state.currentLevel === null) {
      renderLevel();
    } else {
      goToLevel(state.currentLevel);
    }
  });

  // --------------------------------------------------------------------- boot

  load();
  clearResponse();

  if (levels.length) {
    goToLevel(state.currentLevel);
  } else {
    renderLevel();
  }
})();
