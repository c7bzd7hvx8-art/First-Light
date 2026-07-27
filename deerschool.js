/* Deer School — Quiz Engine v2.1 */

// ── block ──
// ══════════════════════════════════════════════════════════════
// QUESTION BANK — 323 questions across 10 batches
// ══════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════
// APP STATE & STORAGE
// ══════════════════════════════════════════════════════════════
var STORAGE_KEY = 'fl_groundschool';
var state = loadState();
var quizQuestions = [];
var currentQIdx = 0;
var quizAnswers = [];  // {correct: bool, category: str}
var quizSelectedIdx = null;   // pre-commit selection (select-then-Check)
var quizCommitted = false;    // has the current question been checked/committed
var lastMode = 'quick';
var wrongQuestions = [];

function enhanceKeyboardClickables(root) {
  var scope = root || document;
  var nodes = scope.querySelectorAll('[onclick]');
  nodes.forEach(function(el) {
    var tag = (el.tagName || '').toLowerCase();
    var nativeInteractive = /^(button|a|input|select|textarea|summary)$/.test(tag);
    if (nativeInteractive) return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    if (el.dataset.kbBound === '1') return;
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
    el.dataset.kbBound = '1';
  });
}

function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    var parsed = JSON.parse(raw);
    // Guard against valid-but-wrong JSON (null / number / array): a bad payload
    // used to be returned as-is, then `state.qWeights` threw and the app never
    // left the disclaimer. Merge over defaults so every expected key exists.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultState();
    return Object.assign(defaultState(), parsed);
  } catch(e) { return defaultState(); }
}

function defaultState() {
  return {
    disclaimerAccepted: false,
    recentScores: [],   // rolling scores (max 8) as percentages
    catStats: {},       // { 'Biology': {correct:0, total:0}, ... }
    qWeights: {}        // { questionIdx: weight } — spaced repetition weights
  };
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
}

// ── Routing ────────────────────────────────────────────────────
function showView(id) {
  var target = document.getElementById(id);
  if (!target) return;
  document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
  target.classList.add('active');
  window.scrollTo(0,0);
}

function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 2500);
}

function bindAction(id, handler) {
  var el = document.getElementById(id);
  if (!el || el.dataset.boundClick === '1') return;
  el.addEventListener('click', handler);
  el.dataset.boundClick = '1';
}

function initStaticActions() {
  bindAction('btn-accept-disclaimer', function() { acceptDisclaimer(); });
  bindAction('btn-start-quick', function() { startQuiz('quick'); });
  bindAction('btn-start-mock', function() { startQuiz('mock'); });
  bindAction('btn-show-ref', function() { showRefView(); });
  bindAction('btn-show-drill', function() { showDrillView(); });
  bindAction('spaced-btn', function() { startQuiz('spaced'); });
  bindAction('btn-reset-progress', function() { confirmReset(); });
  bindAction('btn-view-disclaimer', function() { showDisclaimer(); });
  bindAction('btn-quit-quiz', function() { quitQuiz(); });
  bindAction('btn-quit-quiz-rail', function() { quitQuiz(); });
  bindAction('next-btn', function() { if (!quizCommitted) { commitAnswer(); } else { nextQuestion(); } });
  bindAction('btn-try-again', function() { startQuiz(lastMode); });
  bindAction('btn-results-dashboard', function() { showView('v-dashboard'); refreshDashboard(); });
  bindAction('review-btn', function() { reviewWrong(); });
  bindAction('btn-next-open-drill', function() { showDrillView(); });
  bindAction('btn-next-open-weak', function() { startQuiz('spaced'); });
  bindAction('btn-drill-dashboard', function() { showView('v-dashboard'); });
  bindAction('btn-ref-dashboard', function() { showView('v-dashboard'); refreshDashboard(); });
}

// ── Disclaimer ─────────────────────────────────────────────────
function acceptDisclaimer() {
  state.disclaimerAccepted = true;
  saveState();
  showView('v-dashboard');
  refreshDashboard();
}

// ── Dashboard ──────────────────────────────────────────────────
function refreshDashboard() {
  // Refresh spaced repetition badge
  (function() {
    var badge = document.getElementById('spaced-badge');
    if (badge && state.qWeights) {
      var hasWeak = Object.keys(state.qWeights).some(function(k){ return state.qWeights[k] >= 2; });
      badge.style.display = hasWeak ? 'block' : 'none';
    }
  }());
  renderReadiness();
  renderCatStats();
  updateSpacedBtn();
}

function updateSpacedBtn() {
  var sub = document.getElementById('spaced-btn-sub');
  var btn = document.getElementById('spaced-btn');
  if (!sub || !btn) return;

  var hasWeights = state.qWeights && Object.keys(state.qWeights).length > 0;
  var weakCount = hasWeights
    ? Object.keys(state.qWeights).filter(function(k){ return state.qWeights[k] >= 2; }).length
    : 0;

  if (!hasWeights || weakCount === 0) {
    // New user or no weak areas yet — disable
    btn.disabled = true;
    btn.style.opacity = '0.45';
    btn.style.cursor = 'not-allowed';
    sub.textContent = 'Complete some quizzes first to unlock';
  } else {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    sub.textContent = weakCount + ' weak question' + (weakCount === 1 ? '' : 's') + ' to review';
  }
}

// Readiness decays in real life; saved sessions carry a timestamp so the
// note can say how stale the figure is. Older saves have no timestamp and
// simply omit the sentence.
function relativeDay(ts) {
  var days = Math.floor((Date.now() - ts) / 86400000);
  if (!isFinite(days) || days < 0) return 'just now';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  if (days < 14) return 'last week';
  if (days < 60) return Math.round(days / 7) + ' weeks ago';
  return Math.round(days / 30) + ' months ago';
}

function readinessEntries() {
  // Old saves are bare numbers; new ones are {pct,total,mode}. Normalise + drop corrupt.
  var out = [];
  (state.recentScores || []).forEach(function(s) {
    if (typeof s === 'number' && !isNaN(s)) out.push({ pct: s, total: null });
    else if (s && typeof s.pct === 'number' && !isNaN(s.pct)) out.push({ pct: s.pct, total: (typeof s.total === 'number' ? s.total : null), mode: s.mode, at: (typeof s.at === 'number' ? s.at : null) });
  });
  state.recentScores = out; // persist normalised shape
  return out;
}

function readinessPct() {
  var e = readinessEntries();
  if (!e.length) return null;
  // Count-weighted: a 50-question mock counts more than a 10-question quiz;
  // legacy entries of unknown size fall back to a nominal 10.
  var wsum = 0, num = 0;
  e.forEach(function(x) { var w = x.total || 10; wsum += w; num += x.pct * w; });
  return wsum ? Math.round(num / wsum) : null;
}

function readinessCoverage() {
  // Cumulative per-category accuracy from catStats — count-weighted + coverage-aware.
  var cats = Object.keys(CAT_COLORS);
  var covered = 0, untested = [], weakest = null, totalQ = 0;
  cats.forEach(function(cat) {
    var s = state.catStats[cat];
    var t = s ? s.total : 0;
    totalQ += t;
    if (t > 0) {
      covered++;
      var p = Math.round(s.correct / t * 100);
      if (!weakest || p < weakest.pct) weakest = { cat: cat, pct: p };
    } else {
      untested.push(cat);
    }
  });
  return { covered: covered, totalCats: cats.length, untested: untested, weakest: weakest, totalQ: totalQ };
}

function renderReadiness() {
  var pct = readinessPct();
  var pctEl = document.getElementById('readiness-pct');
  var barEl = document.getElementById('readiness-bar');
  var noteEl = document.getElementById('readiness-note');
  var pillsEl = document.getElementById('score-pills');
  if (!pctEl || !barEl || !noteEl || !pillsEl) return;

  if (pct === null) {
    pctEl.innerHTML = '–<span>%</span>';
    barEl.style.width = '0%';
    barEl.style.background = 'var(--muted)';
    noteEl.textContent = 'Complete a session to see your readiness score. Pass mark is 80%.';
    pillsEl.innerHTML = '';
    return;
  }

  var cov = readinessCoverage();
  // A lucky 10-question quiz, or eight drills on one topic, isn't readiness — gate on volume + breadth.
  var provisional = cov.totalQ < 25 || cov.covered < 4;
  var prefix = provisional ? 'Provisional ' : pct >= 80 ? 'Strong ' : pct >= 60 ? 'Developing ' : 'Needs work ';
  pctEl.innerHTML = '<span style="font-size:0.34em;margin-right:5px;font-weight:700;letter-spacing:0.3px;color:var(--muted);text-transform:uppercase;">' + prefix + '</span>' + pct + '<span>%</span>';
  barEl.style.width = pct + '%';
  barEl.style.background = provisional ? 'var(--muted)'
    : pct >= 80 ? 'linear-gradient(90deg,#2d7a1a,#7adf7a)'
    : pct >= 60 ? 'linear-gradient(90deg,#e65100,#ff8f00)'
    : 'linear-gradient(90deg,#b71c1c,#e53935)';

  if (provisional) {
    var why = [];
    if (cov.totalQ < 25) why.push('only ' + cov.totalQ + ' question' + (cov.totalQ === 1 ? '' : 's') + ' answered');
    if (cov.covered < 4) why.push('covered ' + cov.covered + ' of ' + cov.totalCats + ' topics');
    noteEl.textContent = 'Provisional — ' + why.join(', ') + '. Sit a few Mock Exams across all topics for a reliable read. Pass mark 80%.';
  } else {
    var okNote = 'Weighted by questions answered · covered ' + cov.covered + ' of ' + cov.totalCats + ' topics.';
    if (cov.weakest) okNote += ' Weakest: ' + cov.weakest.cat + ' ' + cov.weakest.pct + '%.';
    if (cov.untested.length) okNote += ' Not yet tested: ' + cov.untested.join(', ') + '.';
    noteEl.textContent = okNote;
  }

  var lastEntry = (state.recentScores || []).slice(-1)[0];
  if (lastEntry && typeof lastEntry.at === 'number') {
    noteEl.textContent += ' Last session ' + relativeDay(lastEntry.at) + '.';
  }

  pillsEl.innerHTML = state.recentScores.map(function(s) {
    var v = (typeof s === 'number') ? s : s.pct;
    var cls = v >= 80 ? 'pass' : 'fail';
    var label = v >= 80 ? 'Pass ' : 'Needs work ';
    return '<span class="score-pill ' + cls + '">' + label + v + '%</span>';
  }).join('');
}

var CAT_COLORS = {
  'Biology': '#5a7a30',
  'Identification': '#d8b054',
  'Legislation': '#1565c0',
  'Safety': '#c62828',
  'Fieldcraft': '#f57f17',
  'Ballistics': '#6a1b9a',
  'Meat Hygiene': '#00695c',
  'Disease & Management': '#795548'
};

function renderCatStats() {
  var el = document.getElementById('cat-stats');
  if (!el) return;
  var cats = Object.keys(state.catStats);
  if (!cats.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px 0;">No sessions completed yet.</div>';
    return;
  }
  el.innerHTML = cats.map(function(cat) {
    var s = state.catStats[cat];
    var pct = s.total ? Math.round(s.correct / s.total * 100) : 0;
    var clr = CAT_COLORS[cat] || '#5a7a30';
    return '<div class="cat-row">'
      + '<div class="cat-name">' + cat + '</div>'
      + '<div class="cat-bar-wrap"><div class="cat-bar" style="width:'+pct+'%;background:'+clr+';"></div></div>'
      + '<div class="cat-pct">' + pct + '%</div>'
      + '</div>';
  }).join('');
}

// ── Confirm sheet ──────────────────────────────────────────────
// Replaces native confirm(). A native dialog freezes the whole tab
// until it is dismissed, cannot be styled, and in an installed PWA
// prefixes the bare origin to the message. This is a real modal:
// aria-modal, focus moves in, Tab is trapped, Esc cancels, focus is
// restored on close, and Cancel — never the destructive action —
// holds initial focus.
function flConfirm(opts, onConfirm) {
  var prevFocus = document.activeElement;

  var overlay = document.createElement('div');
  overlay.className = 'fl-confirm-overlay';

  var card = document.createElement('div');
  card.className = 'fl-confirm-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'fl-confirm-title');
  card.setAttribute('aria-describedby', 'fl-confirm-body');

  var h = document.createElement('h2');
  h.className = 'fl-confirm-title';
  h.id = 'fl-confirm-title';
  h.textContent = opts.title;

  var p = document.createElement('p');
  p.className = 'fl-confirm-body';
  p.id = 'fl-confirm-body';
  p.textContent = opts.body;

  var row = document.createElement('div');
  row.className = 'fl-confirm-row';

  var cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'fl-confirm-btn fl-confirm-cancel';
  cancel.textContent = opts.cancelLabel || 'Cancel';

  var ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'fl-confirm-btn fl-confirm-ok' + (opts.danger ? ' danger' : '');
  ok.textContent = opts.confirmLabel || 'Confirm';

  row.appendChild(cancel);
  row.appendChild(ok);
  card.appendChild(h);
  card.appendChild(p);
  card.appendChild(row);
  overlay.appendChild(card);

  function close() {
    document.removeEventListener('keydown', onKey, true);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.body.classList.remove('fl-confirm-open');
    if (prevFocus && document.contains(prevFocus) && typeof prevFocus.focus === 'function') {
      try { prevFocus.focus(); } catch (e) { /* element went away */ }
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    e.preventDefault();
    var items = [cancel, ok];
    var i = items.indexOf(document.activeElement);
    if (i === -1) { (e.shiftKey ? ok : cancel).focus(); return; }
    items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
  }

  cancel.addEventListener('click', close);
  ok.addEventListener('click', function() { close(); onConfirm(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

  document.body.appendChild(overlay);
  document.body.classList.add('fl-confirm-open');
  document.addEventListener('keydown', onKey, true);
  cancel.focus();
}

function confirmReset() {
  flConfirm({
    title: 'Reset all progress?',
    body: 'Your readiness score, category statistics and weak-question history will all be cleared. This cannot be undone.',
    confirmLabel: 'Reset everything',
    danger: true
  }, function() {
    state = defaultState();
    state.disclaimerAccepted = true;
    saveState();
    refreshDashboard();
    showToast('Progress reset');
  });
}

// Screen readers get the verdict from the live region, not from the
// ::before tick glyph, which is CSS generated content and unreliable.
function setAnswerVerdict(text) {
  var card = document.getElementById('explanation-card');
  if (!card) return;
  var el = document.getElementById('answer-verdict');
  if (!el) {
    el = document.createElement('span');
    el.id = 'answer-verdict';
    el.className = 'fl-sr-only';
    card.insertBefore(el, card.firstChild);
  }
  el.textContent = text;
}

// ── Fisher-Yates shuffle ───────────────────────────────────────
function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

/**
 * Randomise answer-button order for each question in a session so users cannot
 * rely on position or "longest option" heuristics from the static bank order.
 * Returns a shallow copy with remapped correctIndex; does not mutate the bank.
 */
function shuffleQuestionOptions(q) {
  var pairs = q.options.map(function(text, i) {
    return { text: text, isCorrect: i === q.correctIndex };
  });
  var shuffled = shuffle(pairs);
  return {
    category: q.category,
    question: q.question,
    options: shuffled.map(function(o) { return o.text; }),
    correctIndex: shuffled.findIndex(function(o) { return o.isCorrect; }),
    explanation: q.explanation,
    _qid: q._qid
  };
}

// ── Start quiz ─────────────────────────────────────────────────
// Timer state
var timerInterval = null;
var timerSeconds = 0;

function clearTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  var el = document.getElementById('quiz-timer');
  if (el) el.style.display = 'none';
}

function startTimer(totalSeconds) {
  clearTimer();
  timerSeconds = totalSeconds;
  var el = document.getElementById('quiz-timer');
  if (!el) return;
  el.style.display = 'block';
  el.classList.remove('warn');

  function tick() {
    var m = Math.floor(timerSeconds / 60);
    var s = timerSeconds % 60;
    el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    if (timerSeconds <= 60) el.classList.add('warn');
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      showToast('⏱ Time is up!');
      finishQuiz();
      return;
    }
    timerSeconds--;
  }
  tick();
  timerInterval = setInterval(tick, 1000);
}

function weightedSample(pool, count) {
  // Weighted sampling without replacement — high-weight Qs appear more often
  var weights = pool.map(function(q) { return (state.qWeights && state.qWeights[q._qid]) || 1; });
  var totalWeight = weights.reduce(function(a,b){ return a+b; }, 0);
  var result = [];
  var available = pool.map(function(q,i){ return { q:q, w:weights[i] }; });
  while (result.length < count && available.length > 0) {
    var r = Math.random() * available.reduce(function(a,b){ return a+b.w; }, 0);
    var cum = 0;
    for (var i = 0; i < available.length; i++) {
      cum += available[i].w;
      if (r <= cum) {
        result.push(available[i].q);
        available.splice(i, 1);
        break;
      }
    }
  }
  return result;
}

function startQuiz(mode, categoryFilter) {
  lastMode = mode;
  clearTimer();
  var pool = categoryFilter
    ? QUESTION_BANK.filter(function(q){ return q.category === categoryFilter; })
    : QUESTION_BANK;

  var count = mode === 'mock' ? 50 : 10;
  var quizQs;
  if (mode === 'spaced') {
    // Only include genuinely weak questions (weight >= 2), cap at 20, weighted by weakness
    var weakPool = pool.filter(function(q) {
      return state.qWeights && state.qWeights[q._qid] >= 2;
    });
    if (weakPool.length === 0) {
      weakPool = pool; // fallback — no weak flags yet
      quizQs = shuffle(weakPool).slice(0, Math.min(20, weakPool.length));
    } else {
      quizQs = weightedSample(weakPool, Math.min(20, weakPool.length));
    }
  } else {
    quizQs = shuffle(pool).slice(0, Math.min(count, pool.length));
  }
  quizQuestions = quizQs.map(shuffleQuestionOptions);
  if (!quizQuestions.length) {
    // No questions matched (e.g. an empty or renamed category) — don't crash
    // renderQuestion on quizQuestions[0]; return to the dashboard.
    showView('v-dashboard');
    refreshDashboard();
    return;
  }
  currentQIdx = 0;
  quizAnswers = [];
  wrongQuestions = [];
  showView('v-quiz');
  renderQuestion();

  // Timer only for mock exam
  if (mode === 'mock') {
    startTimer(45 * 60); // 45 minutes
  }
}

function renderQuestion() {
  var q = quizQuestions[currentQIdx];
  quizSelectedIdx = null;
  quizCommitted = false;
  var total = quizQuestions.length;
  var pct = Math.round(currentQIdx / total * 100);

  var badge = document.getElementById('quiz-cat-badge');
  badge.textContent = lastMode === 'spaced' ? '🧠 ' + q.category : q.category;
  document.getElementById('quiz-progress-bar').style.width = pct + '%';
  document.getElementById('quiz-count').textContent = 'Question ' + (currentQIdx+1) + ' of ' + total;
  var sessionChip = document.getElementById('quiz-session-chip');
  if (sessionChip) sessionChip.textContent = sessionModeMetaLabel(total);
  document.getElementById('q-num').textContent = 'Q' + (currentQIdx+1);
  document.getElementById('q-text').textContent = q.question;

  // Options
  var wrap = document.getElementById('options-wrap');
  wrap.innerHTML = '';
  q.options.forEach(function(opt, i) {
    var btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.textContent = opt;
    btn.onclick = function() { selectOption(i); };
    wrap.appendChild(btn);
  });

  // In review mode — pre-highlight the previously wrong answer
  if (lastMode === 'review' && q._reviewSelectedIndex !== undefined) {
    var btns = wrap.querySelectorAll('.opt-btn');
    btns.forEach(function(b) { b.classList.add('disabled'); b.disabled = true; b.onclick = null; });
    btns[q.correctIndex].classList.add('reveal-correct');
    btns[q.correctIndex].setAttribute('aria-label', 'Correct answer: ' + btns[q.correctIndex].textContent);
    if (q._reviewSelectedIndex !== q.correctIndex) {
      btns[q._reviewSelectedIndex].classList.add('selected-incorrect');
      btns[q._reviewSelectedIndex].setAttribute('aria-label',
        'The answer you gave, incorrect: ' + btns[q._reviewSelectedIndex].textContent);
    }
    setAnswerVerdict('Reviewing a question you got wrong.');
    document.getElementById('explanation-text').textContent = q.explanation;
    document.getElementById('explanation-card').style.display = 'block';
    document.getElementById('next-btn').classList.add('show');
    document.getElementById('next-btn').textContent = currentQIdx === quizQuestions.length - 1 ? 'Done' : 'Next →';
    quizCommitted = true; // review is read-only; Next just advances
    return;
  }

  // Hide explanation and next
  setAnswerVerdict('');
  document.getElementById('explanation-card').style.display = 'none';
  document.getElementById('next-btn').classList.remove('show');
}

// Select-then-Check: the first tap SELECTS (changeable); the Check button
// commits. A mis-tap on the hill no longer scores against you.
function selectOption(idx) {
  if (quizCommitted) return;              // options locked once checked
  quizSelectedIdx = idx;
  document.querySelectorAll('.opt-btn').forEach(function(btn, i) {
    btn.classList.toggle('selected', i === idx);
  });
  var nb = document.getElementById('next-btn');
  nb.classList.add('show');
  nb.textContent = 'Check answer';
}

function commitAnswer() {
  if (quizCommitted || quizSelectedIdx === null) return;
  quizCommitted = true;
  var q = quizQuestions[currentQIdx];
  var idx = quizSelectedIdx;
  var correct = idx === q.correctIndex;

  // Record answer (same shape as before)
  quizAnswers.push({ correct: correct, category: q.category, selectedIndex: idx, correctIndex: q.correctIndex, question: q.question, options: q.options, explanation: q.explanation, qid: q._qid });
  if (!correct) wrongQuestions.push(currentQIdx);

  // Reveal + lock. Native `disabled`, not just the CSS class, so the
  // answered options actually leave the tab order.
  document.querySelectorAll('.opt-btn').forEach(function(btn, i) {
    btn.classList.remove('selected');
    btn.classList.add('disabled');
    btn.disabled = true;
    btn.onclick = null;
    if (i === q.correctIndex) {
      btn.classList.add('reveal-correct');
      btn.setAttribute('aria-label', 'Correct answer: ' + btn.textContent);
    }
    if (i === idx && !correct) {
      btn.classList.add('selected-incorrect');
      btn.setAttribute('aria-label', 'Your answer, incorrect: ' + btn.textContent);
    }
    if (i === idx && correct) {
      btn.classList.add('selected-correct');
      btn.setAttribute('aria-label', 'Your answer, correct: ' + btn.textContent);
    }
  });

  setAnswerVerdict(correct ? 'Correct.' : 'Incorrect.');

  document.getElementById('explanation-text').textContent = q.explanation;
  document.getElementById('explanation-card').style.display = 'block';
  document.getElementById('next-btn').textContent = currentQIdx === quizQuestions.length - 1 ? 'See Results →' : 'Next →';
}

function nextQuestion() {
  currentQIdx++;
  if (currentQIdx >= quizQuestions.length) {
    finishQuiz();
  } else {
    renderQuestion();
    // Scroll to top of quiz
    document.querySelector('#v-quiz .quiz-scroll').scrollTop = 0;
  }
}

function quitQuiz() {
  if (currentQIdx > 0) {
    flConfirm({
      title: 'Quit this session?',
      body: 'You are on question ' + (currentQIdx + 1) + ' of ' + quizQuestions.length +
            '. Nothing from this session will be saved to your progress.',
      confirmLabel: 'Quit session',
      danger: true
    }, function() {
      clearTimer();
      showView('v-dashboard');
    });
    return;
  }
  clearTimer();
  showView('v-dashboard');
}

// ── Finish & results ───────────────────────────────────────────
function sessionModeLabel() {
  if (lastMode === 'mock') return 'Mock Exam';
  if (lastMode === 'drill') return 'Category Drill';
  if (lastMode === 'spaced') return 'Weak Areas';
  if (lastMode === 'review') return 'Review';
  return 'Quick Quiz';
}

function sessionModeMetaLabel(total) {
  if (lastMode === 'mock') return 'Mode: Mock Exam · ' + total + ' Q · Timed';
  if (lastMode === 'drill') return 'Mode: Category Drill · ' + total + ' Q';
  if (lastMode === 'spaced') return 'Mode: Weak Areas · ' + total + ' Q';
  if (lastMode === 'review') return 'Mode: Review Wrong Answers · ' + total + ' Q';
  return 'Mode: Quick Quiz · ' + total + ' Q';
}

function finishQuiz() {
  clearTimer();
  // Review mode never records answers — only navigates through explanations
  if (lastMode === 'review') {
    showView('v-dashboard');
    refreshDashboard();
    return;
  }
  var correct = quizAnswers.filter(function(a){ return a.correct; }).length;
  // A mock exam is scored out of ALL its questions — unanswered ones (e.g. when
  // the 45-min timer expires) count as incorrect, otherwise a part-finished mock
  // shows an inflated PASS and pollutes the readiness average. Other modes score
  // out of what was answered. Guard total>0 so an empty run can't render "NaN%".
  var total = (lastMode === 'mock') ? quizQuestions.length : quizAnswers.length;
  var pct = total > 0 ? Math.round(correct / total * 100) : 0;
  var pass = pct >= 80;

  // Save to state
  if (!isNaN(pct)) state.recentScores.push({ pct: pct, total: total, mode: lastMode, at: Date.now() });
  if (state.recentScores.length > 8) state.recentScores.shift();

  quizAnswers.forEach(function(a) {
    if (!state.catStats[a.category]) state.catStats[a.category] = {correct:0, total:0};
    state.catStats[a.category].total++;
    if (a.correct) state.catStats[a.category].correct++;
    // Spaced repetition: update question weight based on correctness
    if (a.qid !== undefined) {
      if (!state.qWeights) state.qWeights = {};
      var w = state.qWeights[a.qid] || 1;
      // Wrong → weight up (surfaces more); correct → weight down (surfaces less)
      state.qWeights[a.qid] = a.correct
        ? Math.max(1, Math.round(w * 0.6))
        : Math.min(20, Math.round(w * 2 + 1));
    }
  });
  saveState();

  // Render results
  document.getElementById('results-score').innerHTML = pct + '<span>%</span>';
  // Pass animation
  var passBanner = document.getElementById('pass-banner');
  if (passBanner) {
    if (pass) {
      passBanner.style.display = 'block';
      launchConfetti();
    } else {
      passBanner.style.display = 'none';
    }
  }
  var verdictEl = document.getElementById('results-verdict');
  verdictEl.textContent = pass ? '✅ PASS' : '❌ FAIL';
  verdictEl.className = 'results-verdict ' + (pass ? 'pass' : 'fail');
  document.getElementById('results-sub').textContent = correct + ' of ' + total + ' correct · ' + sessionModeLabel();

  // Category breakdown
  var catBreakdown = {};
  quizAnswers.forEach(function(a) {
    if (!catBreakdown[a.category]) catBreakdown[a.category] = {correct:0, total:0};
    catBreakdown[a.category].total++;
    if (a.correct) catBreakdown[a.category].correct++;
  });

  var html = '';
  Object.keys(catBreakdown).sort().forEach(function(cat) {
    var s = catBreakdown[cat];
    var p = Math.round(s.correct / s.total * 100);
    var cls = p >= 80 ? 'high' : p >= 60 ? 'mid' : 'low';
    html += '<div class="cat-result-row">'
      + '<div class="cat-result-name">' + cat + '</div>'
      + '<div class="cat-result-pct ' + cls + '">' + (cls==='high'?'✓ ':cls==='mid'?'~ ':'✕ ') + p + '% (' + s.correct + '/' + s.total + ')</div>'
      + '</div>';
  });
  document.getElementById('results-cat-breakdown').innerHTML = html;

  // What to revise next panel
  (function renderNextSteps() {
    var card = document.getElementById('results-next-card');
    var list = document.getElementById('results-next-list');
    if (!card || !list) return;
    var rows = Object.keys(catBreakdown).map(function(cat) {
      var s = catBreakdown[cat];
      var p = s.total ? Math.round((s.correct / s.total) * 100) : 0;
      return { cat: cat, pct: p, correct: s.correct, total: s.total };
    }).sort(function(a, b) {
      if (a.pct !== b.pct) return a.pct - b.pct;
      return b.total - a.total;
    });

    if (!rows.length) {
      card.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    var weakest = rows.slice(0, 2);
    var content = '';
    weakest.forEach(function(r) {
      var level = r.pct >= 80 ? 'Strong' : r.pct >= 60 ? 'Developing' : 'Needs focus';
      content += '<div class="results-next-row">'
        + '<div>'
        + '<div class="results-next-cat">' + r.cat + '</div>'
        + '<div class="results-next-detail">' + r.correct + '/' + r.total + ' correct · ' + level + '</div>'
        + '</div>'
        + '<div class="results-next-score">' + r.pct + '%</div>'
        + '</div>';
    });

    list.innerHTML = content;
    card.style.display = 'block';
  })();

  // Review button
  var reviewBtn = document.getElementById('review-btn');
  reviewBtn.style.display = wrongQuestions.length > 0 ? 'block' : 'none';

  showView('v-results');
}

function reviewWrong() {
  // Build review list from stored answer data
  var wrongs = quizAnswers.filter(function(a){ return !a.correct; });
  quizQuestions = wrongs.map(function(a){ return {
    category: a.category,
    question: a.question,
    options: a.options,
    correctIndex: a.correctIndex,
    explanation: a.explanation,
    _reviewSelectedIndex: a.selectedIndex
  }; });
  currentQIdx = 0;
  quizAnswers = [];
  wrongQuestions = [];
  lastMode = 'review';
  showView('v-quiz');
  renderQuestion();
}

// ── Init ───────────────────────────────────────────────────────
// ── Category Drill ────────────────────────────────────────────
var CAT_COLORS_DRILL = {
  'Biology': '#5a7a30', 'Identification': '#d8b054', 'Legislation': '#1565c0',
  'Safety': '#c62828', 'Fieldcraft': '#f57f17', 'Ballistics': '#6a1b9a',
  'Meat Hygiene': '#00695c', 'Disease & Management': '#795548'
};

function showRefView() {
  showView('v-ref');
}

function showDrillView() {
  // Build category list with question counts
  var catCounts = {};
  QUESTION_BANK.forEach(function(q) {
    catCounts[q.category] = (catCounts[q.category] || 0) + 1;
  });
  var grid = document.getElementById('drill-grid');
  // Build buttons using DOM, not innerHTML, to avoid & encoding issues in onclick
  grid.innerHTML = '';
  Object.keys(CAT_COLORS_DRILL).forEach(function(cat) {
    var count = catCounts[cat] || 0;
    var clr = CAT_COLORS_DRILL[cat];
    var stats = state.catStats[cat];
    var pct = stats && stats.total ? Math.round(stats.correct / stats.total * 100) : null;

    var btn = document.createElement('button');
    btn.className = 'drill-cat-btn';
    btn.setAttribute('data-cat', cat);

    var dot = document.createElement('div');
    dot.className = 'drill-cat-dot';
    dot.style.background = clr;

    var info = document.createElement('div');
    info.className = 'drill-cat-info';
    info.innerHTML = '<div class="drill-cat-name">' + cat + '</div>'
      + '<div class="drill-cat-sub">' + count + ' questions available</div>';

    var pctEl = document.createElement('div');
    pctEl.className = 'drill-cat-pct';
    if (pct !== null) {
      pctEl.textContent = (pct >= 80 ? '✓ ' : pct >= 60 ? '~ ' : '✕ ') + pct + '%';
      pctEl.style.color = pct >= 80 ? '#2e7d32' : pct >= 60 ? '#f57f17' : '#c62828';
    } else {
      pctEl.textContent = '–';
      pctEl.style.color = 'var(--muted)';
    }

    btn.appendChild(dot);
    btn.appendChild(info);
    btn.appendChild(pctEl);

    btn.addEventListener('click', function() {
      startDrill(this.getAttribute('data-cat'));
    });

    grid.appendChild(btn);
  });
  showView('v-drill');
}

function startDrill(category) {
  startQuiz('drill', category);
}

// ── Pass Confetti ─────────────────────────────────────────────
function launchConfetti() {
  var container = document.getElementById('pass-banner');
  if (!container) return;
  var colors = ['#d8b054','#5a7a30','#7adf7a','#f0cc74','#1565c0','#c62828'];
  for (var i = 0; i < 18; i++) {
    (function(i) {
      setTimeout(function() {
        var el = document.createElement('div');
        el.className = 'confetti-piece';
        el.style.left = (10 + Math.random() * 80) + '%';
        el.style.top = (Math.random() * 20) + 'px';
        el.style.background = colors[Math.floor(Math.random() * colors.length)];
        el.style.animationDelay = (Math.random() * 0.4) + 's';
        el.style.animationDuration = (0.9 + Math.random() * 0.6) + 's';
        el.style.transform = 'rotate(' + (Math.random()*360) + 'deg)';
        container.appendChild(el);
        setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 2000);
      }, i * 60);
    })(i);
  }
}

// ── Quick Reference tab switching ─────────────────────────────
// Roving tabindex: only the selected tab is in the tab order, and the
// arrow keys move between tabs (WAI-ARIA tabs pattern). Hidden panels
// are display:none, so they drop out of the accessibility tree too.
function switchRefTab(section, moveFocus) {
  document.querySelectorAll('.ref-section-block').forEach(function(el){ el.style.display = 'none'; });
  var target = document.getElementById('ref-' + section);
  if (target) target.style.display = 'block';
  document.querySelectorAll('.ref-tab[data-section]').forEach(function(el) {
    var on = el.dataset.section === section;
    el.classList.toggle('active', on);
    el.setAttribute('aria-selected', on ? 'true' : 'false');
    el.tabIndex = on ? 0 : -1;
    if (on) {
      if (moveFocus) el.focus();
      // The strip is overflow-x:auto with the scrollbar hidden; without this
      // the End key (or a tap on a half-visible pill) selects a tab that
      // stays 10px on-screen. block:'nearest' avoids any vertical jump.
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) {}
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  enhanceKeyboardClickables(document);
  initStaticActions();
  // Wire ref tabs
  document.querySelectorAll('.ref-tab[data-section]').forEach(function(btn) {
    btn.addEventListener('click', function() { switchRefTab(this.dataset.section); });
  });
  var refTabs = document.getElementById('ref-tabs');
  if (refTabs) {
    refTabs.addEventListener('keydown', function(e) {
      var step = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' }[e.key];
      if (step === undefined) return;
      var tabs = Array.prototype.slice.call(refTabs.querySelectorAll('.ref-tab[data-section]'));
      var i = tabs.indexOf(document.activeElement);
      if (i === -1 || !tabs.length) return;
      e.preventDefault();
      var next = step === 'first' ? 0
               : step === 'last'  ? tabs.length - 1
               : (i + step + tabs.length) % tabs.length;
      switchRefTab(tabs[next].dataset.section, true);
    });
  }
  // Show spaced badge if any question has weight >= 2
  (function() {
    var badge = document.getElementById('spaced-badge');
    if (badge && state.qWeights) {
      var hasWeak = Object.values(state.qWeights).some(function(w){ return w >= 2; });
      if (hasWeak) badge.style.display = 'block';
    }
  }());
  if (state.disclaimerAccepted) {
    showView('v-dashboard');
    refreshDashboard();
  }
  // else disclaimer view is already active
});

// ── Stable question identity ───────────────────────────────────
// Spaced-repetition weights used to be keyed by a question's raw
// QUESTION_BANK index, so inserting, deleting or reordering a single
// question silently re-pointed every saved weight at a different
// question. Key on a hash of the question text instead: stable across
// bank edits, and only a question whose wording actually changed
// loses its history.
function questionId(text) {
  var h = 5381;
  for (var i = 0; i < text.length; i++) {
    h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;   // djb2-xor
  }
  return 'q' + h.toString(36);
}

// Bank indices are still handy for debugging; _qid is what persists.
// The seen[] guard means a hash collision can never make two
// questions share one weight.
(function assignQuestionIds() {
  var seen = {};
  QUESTION_BANK.forEach(function(q, i) {
    q._bankIdx = i;
    var id = questionId(q.question);
    if (seen[id]) { var n = 2; while (seen[id + '_' + n]) n++; id = id + '_' + n; }
    seen[id] = true;
    q._qid = id;
  });
}());

// One-time migration of saves written before _qid existed. Legacy keys
// are bare integers; they are resolved against the bank as shipped,
// which is the same ordering those indices were written under.
(function migrateQWeights() {
  if (!state.qWeights || typeof state.qWeights !== 'object') { state.qWeights = {}; return; }
  var legacy = Object.keys(state.qWeights).filter(function(k) { return /^\d+$/.test(k); });
  if (!legacy.length) return;
  legacy.forEach(function(k) {
    var w = state.qWeights[k];
    var q = QUESTION_BANK[Number(k)];
    delete state.qWeights[k];
    if (q && q._qid && typeof w === 'number' && isFinite(w)) {
      state.qWeights[q._qid] = Math.max(state.qWeights[q._qid] || 0, w);
    }
  });
  saveState();
}());

function showDisclaimer() {
  showView('v-disclaimer');
}
