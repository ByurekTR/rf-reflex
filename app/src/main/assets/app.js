/* RF Reflex UI. Everything is local: no network calls, progress lives in localStorage. */
(function () {
  'use strict';
  var E = window.Engine, $app = document.getElementById('app');
  var KEY = 'rfreflex.v1', VERSION = '1.0';
  var st = load(), view = { name: 'home' }, sess = null, resetArmed = false;

  function blank() { return { types: {}, best: {}, days: {}, scen: {}, settings: { input: 'auto' } }; }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.types) { var b = blank(); for (var k in b) if (!s[k]) s[k] = b[k]; return s; }
    } catch (e) { }
    return blank();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dayStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dayStr(new Date()); }
  function streak() {
    var d = new Date(), n = 0;
    if (!st.days[dayStr(d)]) d.setDate(d.getDate() - 1);
    while (st.days[dayStr(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function totals(mod) {
    var n = 0, c = 0;
    Object.keys(st.types).forEach(function (k) { if (!mod || k.indexOf(mod + '.') === 0) { n += st.types[k].n; c += st.types[k].c; } });
    return { n: n, c: c, acc: n ? Math.round(100 * c / n) : null };
  }
  function h(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var IC = {
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
    del: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:auto"><path d="M9 6h11v12H9l-5-6z"/><path d="M12 10l4 4M16 10l-4 4"/></svg>'
  };

  /* ---------- screens ---------- */
  function home() {
    var t = totals(), idx = E.scenarioIndex(today()), html = '';
    html += '<header class="top"><div class="logo">dB</div><div class="grow"><h1>RF Reflex</h1><p>Mental math for RF, DSP and circuits</p></div>' +
      '<button class="icon" data-act="settings" aria-label="Settings">' + IC.gear + '</button></header>';
    html += '<section class="today"><div class="stat"><b>' + streak() + '</b><span>day streak</span></div><div class="stat"><b>' + (st.days[today()] || 0) +
      '</b><span>answered today</span></div><div class="stat"><b>' + (t.acc == null ? '–' : t.acc + '%') + '</b><span>accuracy</span></div></section>';
    html += '<section class="cta"><button class="big primary" data-act="mix"><div class="grow"><b>Daily mix</b><span>20 questions, weighted to your weak spots</span></div></button>' +
      '<button class="big" data-act="scenario"><div class="grow"><b>Scenario: ' + h(E.SCENARIO_TITLES[idx]) + '</b><span>One real case, worked in steps</span></div>' +
      (st.scen[today()] ? '<span class="done">DONE</span>' : '') + '</button></section>';
    E.GROUPS.forEach(function (g) {
      html += '<section class="group"><h2>' + g + '</h2><div class="mods">';
      E.MODULES.filter(function (m) { return m.group === g; }).forEach(function (m) {
        html += '<button class="mod" data-act="mod" data-id="' + m.id + '"><div class="mod-h"><b>' + h(m.name) + '</b><span class="lvl">L' + E.moduleLevel(m, st.types) + '</span></div><p>' + h(m.blurb) +
          '</p><div class="bar"><i style="width:' + Math.round(100 * E.mastery(m, st.types)) + '%"></i></div></button>';
      });
      html += '</div></section>';
    });
    html += '<div class="foot">Works offline. Progress stays on this phone.</div>';
    return html;
  }
  function modulePage(id) {
    var m = E.BY_ID[id], t = totals(id), b = st.best[id + ':60'];
    return '<header class="head"><button class="icon" data-act="home" aria-label="Back">' + IC.back + '</button><h1>' + h(m.name) + '</h1><span class="lvl">LEVEL ' + E.moduleLevel(m, st.types) + '</span></header>' +
      '<p class="blurb">' + h(m.blurb) + '</p>' +
      '<section class="card"><h3>Anchors</h3><ul class="anchors">' + m.anchors.map(function (a) { return '<li>' + h(a) + '</li>'; }).join('') + '</ul></section>' +
      '<section class="kv"><div class="stat"><b>' + t.n + '</b><span>answered</span></div><div class="stat"><b>' + (t.acc == null ? '–' : t.acc + '%') + '</b><span>accuracy</span></div><div class="stat"><b>' + (b == null ? '–' : b) + '</b><span>best 60 s</span></div></section>' +
      '<div class="actions"><button class="btn primary" data-act="start" data-mode="practice">Practice<small>10 questions, no clock</small></button>' +
      '<button class="btn" data-act="start" data-mode="sprint" data-dur="60">Sprint 60 s<small>As many as you can</small></button>' +
      '<button class="btn" data-act="start" data-mode="sprint" data-dur="120">Sprint 120 s</button></div>';
  }
  function clock() { var s = Math.ceil(sess.left / 1000); return Math.floor(s / 60) + ':' + pad(s % 60); }
  function progLabel() { return sess.mode === 'sprint' ? clock() : (sess.idx + 1) + ' / ' + sess.total; }
  function progFrac() { return sess.mode === 'sprint' ? sess.left / (sess.dur * 1000) : (sess.idx + (sess.phase === 'fb' ? 1 : 0)) / sess.total; }
  function sessionPage() {
    var q = sess.q, fb = sess.phase === 'fb', html = '<div class="session' + (fb && sess.ok && sess.mode === 'sprint' ? ' flash' : '') + '">';
    html += '<header class="sbar"><button class="icon" data-act="quit" aria-label="Quit">' + IC.close + '</button><div class="prog" id="clock">' + progLabel() + '</div><div class="score">' + sess.correct + ' ✓</div></header>';
    html += '<div class="track bar"><i id="trk" style="width:' + Math.round(100 * progFrac()) + '%"></i></div>';
    html += '<main class="qa"><div class="tag">' + h(E.BY_ID[q.mod].name) + '</div>' + (sess.intro ? '<div class="intro">' + h(sess.intro) + '</div>' : '') + '<div class="prompt">' + h(q.prompt) + '</div>';
    if (sess.inp === 'hilo') html += '<div class="sub">Higher or lower than <b>' + h(sess.hl.refStr) + '</b>?</div>';
    if (fb && !(sess.ok && sess.mode === 'sprint')) {
      html += '<div class="fb ' + (sess.ok ? 'good' : 'bad') + '"><b>' + (sess.ok ? 'Correct' : 'Not quite') + '</b><div class="ans">' + h(E.ansStr(q)) + '</div>' +
        (!sess.ok && sess.inp === 'typed' ? '<div class="you">You entered ' + h(sess.given) + '</div>' : '') + '<p>' + h(q.explain) + '</p></div>';
    }
    html += '</main><footer class="inp">';
    if (sess.inp === 'choice') {
      var long = sess.opts.some(function (o) { return o.label.length > 13; });
      html += '<div class="opts' + (long ? ' stack' : '') + '">' + sess.opts.map(function (o, i) {
        var cls = fb ? (o.correct ? ' ok' : i === sess.chosen ? ' no' : ' dim') : '';
        return '<button class="opt' + cls + '" data-act="opt" data-i="' + i + '"' + (fb ? ' disabled' : '') + '>' + h(o.label) + '</button>';
      }).join('') + '</div>';
    } else if (sess.inp === 'hilo') {
      html += '<div class="opts">' + ['lower', 'higher'].map(function (v) {
        var cls = fb ? (v === sess.hl.answer ? ' ok' : v === sess.chosen ? ' no' : ' dim') : '';
        return '<button class="opt' + cls + '" data-act="hl" data-v="' + v + '"' + (fb ? ' disabled' : '') + '>' + (v === 'lower' ? 'Lower' : 'Higher') + '</button>';
      }).join('') + '</div>';
    } else {
      html += '<div class="entry' + (fb ? (sess.ok ? ' ok' : ' no') : '') + '" id="entry">' + entryInner() + '</div>';
      if (!fb) html += '<div class="keys">' + ['7', '8', '9', 'del', '4', '5', '6', '±', '1', '2', '3', '.'].map(function (k) {
        return '<button class="key" data-act="key" data-k="' + k + '">' + (k === 'del' ? IC.del : k) + '</button>';
      }).join('') + '<button class="key w2" data-act="key" data-k="0">0</button><button class="key w2 go" data-act="enter" id="go"' + (sess.entry ? '' : ' disabled') + '>Enter</button></div>';
    }
    if (fb && !(sess.ok && sess.mode === 'sprint')) html += '<button class="btn primary" data-act="next">' + (isLast() ? 'Finish' : 'Next') + '</button>';
    return html + '</footer></div>';
  }
  function entryInner() {
    var q = sess.q, pre = q.unit === '×' ? '<span class="u">×</span>' : '', u = q.unit && q.unit !== '×' ? '<span class="u">' + h(q.unit) + '</span>' : '';
    return pre + (sess.entry ? '<span>' + h(sess.entry.replace('-', '−')) + '</span>' : '<span class="ph">0</span>') + u;
  }
  function resultPage() {
    var r = view.result, html = '<header class="head"><button class="icon" data-act="home" aria-label="Home">' + IC.back + '</button><h1>' + h(r.title) + '</h1></header>';
    html += '<section class="res"><div class="n">' + r.correct + '<small> / ' + r.answered + '</small></div><p>' + (r.answered ? Math.round(100 * r.correct / r.answered) + '% correct' : 'No answers this round') + '</p>';
    if (r.rate != null) html += '<div class="rate">' + r.rate + ' correct per minute' + (r.newBest ? ' · new best' : r.best != null ? ' · best ' + r.best : '') + '</div>';
    html += '</section>';
    if (r.misses.length) {
      html += '<section class="review"><h3>Review</h3>' + r.misses.map(function (m) {
        return '<div class="miss"><div class="p">' + h(m.prompt) + '</div><div class="a"><s>' + h(m.given) + '</s> → <i>' + h(m.answer) + '</i></div><div class="x">' + h(m.explain) + '</div></div>';
      }).join('') + '</section>';
    }
    return html + '<div class="actions two"><button class="btn primary" data-act="again">Go again</button><button class="btn" data-act="home">Home</button></div>';
  }
  function settingsPage() {
    var modes = [['auto', 'Auto', 'Multiple choice while a question type is new, typed once you get it right three times in a row.'],
      ['choice', 'Multiple choice', 'Always pick from four answers.'], ['typed', 'Typed', 'Always enter the number yourself.'], ['hilo', 'Higher or lower', 'Fastest: judge the answer against a reference value.']];
    return '<header class="head"><button class="icon" data-act="home" aria-label="Back">' + IC.back + '</button><h1>Settings</h1></header><section class="set"><h3>Answer style</h3>' +
      modes.map(function (m) {
        return '<button class="choice' + (st.settings.input === m[0] ? ' on' : '') + '" data-act="input" data-v="' + m[0] + '"><span class="dot"></span><div><b>' + m[1] + '</b><span>' + m[2] + '</span></div></button>';
      }).join('') + '<h3>Progress</h3><button class="btn danger" data-act="reset">' + (resetArmed ? 'Tap again to erase all progress' : 'Reset progress') + '</button></section>' +
      '<p class="note">RF Reflex ' + VERSION + '. Typed answers accept a small tolerance (about ±0.5 dB or ±5 %), because the skill is estimating. The app never uses the network.</p>';
  }
  function render() {
    var n = view.name;
    $app.innerHTML = n === 'home' ? home() : n === 'mod' ? modulePage(view.id) : n === 'session' ? sessionPage() : n === 'result' ? resultPage() : settingsPage();
    if (n !== 'session') window.scrollTo(0, 0);
  }
  function go(name, extra) { view = { name: name }; if (extra) for (var k in extra) view[k] = extra[k]; resetArmed = false; render(); }

  /* ---------- session ---------- */
  function inputFor(q) {
    if (q.kind === 'mc') return 'choice';
    var m = st.settings.input;
    if (m === 'auto') { var s = st.types[q.key]; return s && s.s >= 3 ? 'typed' : 'choice'; }
    return m;
  }
  function isLast() { return sess.mode !== 'sprint' && sess.idx + 1 >= sess.total; }
  function newQuestion() {
    var q = sess.mode === 'scenario' ? sess.steps[sess.idx] : sess.modId ? E.pickType(E.BY_ID[sess.modId], st.types, sess.lastKey) : E.pickAny(st.types, sess.lastKey);
    sess.q = q; sess.lastKey = q.key; sess.phase = 'ask'; sess.entry = ''; sess.chosen = null; sess.given = '';
    sess.inp = inputFor(q);
    if (sess.inp === 'choice') sess.opts = E.choices(q);
    if (sess.inp === 'hilo') sess.hl = E.hilo(q);
  }
  function start(cfg) {
    stopTimer();
    sess = { mode: cfg.mode, modId: cfg.modId || null, dur: cfg.dur || 0, total: cfg.total || 0, idx: 0, correct: 0, answered: 0, misses: [], cfg: cfg, lastKey: null, intro: '' };
    if (cfg.mode === 'scenario') { var sc = E.SCENARIOS[E.scenarioIndex(today())](); sess.steps = sc.steps; sess.total = sc.steps.length; sess.intro = sc.intro; sess.title = sc.title; }
    newQuestion();
    if (cfg.mode === 'sprint') { sess.left = cfg.dur * 1000; startTimer(); }
    go('session');
  }
  function startTimer() {
    sess.tick = Date.now();
    sess.timer = setInterval(function () {
      if (!sess) return;
      var now = Date.now(), dt = Math.min(now - sess.tick, 250); sess.tick = now;
      if (sess.phase !== 'ask') return;
      sess.left -= dt;
      if (sess.left <= 0) { sess.left = 0; finish(); return; }
      var c = document.getElementById('clock'), t = document.getElementById('trk');
      if (c) c.textContent = clock();
      if (t) t.style.width = Math.round(100 * progFrac()) + '%';
    }, 100);
  }
  function stopTimer() { if (sess && sess.timer) { clearInterval(sess.timer); sess.timer = null; } }
  function record(q, ok) {
    if (q.key !== 'scenario') { var t = st.types[q.key] || (st.types[q.key] = { n: 0, c: 0, s: 0 }); t.n++; if (ok) { t.c++; t.s++; } else t.s = 0; }
    st.days[today()] = (st.days[today()] || 0) + 1;
    save();
  }
  function answer(kind, val) {
    if (!sess || sess.phase !== 'ask') return;
    var q = sess.q, ok, given;
    if (kind === 'choice') { var o = sess.opts[val]; if (!o) return; ok = o.correct; given = o.label; sess.chosen = val; }
    else if (kind === 'hilo') { ok = val === sess.hl.answer; given = val + ' than ' + sess.hl.refStr; sess.chosen = val; }
    else {
      var x = parseFloat(sess.entry); if (isNaN(x)) return;
      ok = E.check(q, x); given = (q.unit === '×' ? '×' : '') + sess.entry.replace('-', '−').replace(/\.$/, '') + (q.unit && q.unit !== '×' ? ' ' + q.unit : '');
    }
    record(q, ok); sess.answered++; sess.ok = ok; sess.given = given; sess.phase = 'fb';
    if (ok) sess.correct++; else sess.misses.push({ prompt: q.prompt, given: given, answer: E.ansStr(q), explain: q.explain });
    render();
    if (ok && sess.mode === 'sprint') setTimeout(function () { if (sess && sess.phase === 'fb' && view.name === 'session') next(); }, 380);
  }
  function next() {
    if (!sess || sess.phase !== 'fb') return;
    if (isLast()) return finish();
    sess.idx++; newQuestion(); render();
    var qa = document.querySelector('.qa'); if (qa) qa.scrollTop = 0;
  }
  function finish() {
    stopTimer();
    var r = { title: sess.mode === 'scenario' ? sess.title : sess.modId ? E.BY_ID[sess.modId].name : 'Daily mix', correct: sess.correct, answered: sess.answered, misses: sess.misses, cfg: sess.cfg, rate: null, best: null, newBest: false };
    if (sess.mode === 'sprint') {
      var k = sess.modId + ':' + sess.dur, prev = st.best[k];
      r.rate = Math.round(sess.correct / sess.dur * 60 * 10) / 10;
      if (prev == null || sess.correct > prev) { st.best[k] = sess.correct; r.newBest = sess.correct > 0; } else r.best = Math.round(prev / sess.dur * 60 * 10) / 10;
    }
    if (sess.mode === 'scenario') st.scen[today()] = 1;
    save(); sess = null;
    go('result', { result: r });
  }
  function quit() { stopTimer(); var id = sess && sess.modId; sess = null; if (id) go('mod', { id: id }); else go('home'); }
  function key(k) {
    if (!sess || sess.phase !== 'ask' || sess.inp !== 'typed') return;
    var e = sess.entry;
    if (k === 'del') e = e.slice(0, -1);
    else if (k === '±') e = e.charAt(0) === '-' ? e.slice(1) : '-' + e;
    else if (k === '.') { if (e.indexOf('.') < 0) e = (e === '' || e === '-' ? e + '0' : e) + '.'; }
    else if (e.replace('-', '').length < 9) e += k;
    sess.entry = e;
    var el = document.getElementById('entry'), g = document.getElementById('go');
    if (el) el.innerHTML = entryInner();
    if (g) g.disabled = isNaN(parseFloat(e));
  }

  /* ---------- events ---------- */
  $app.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]'); if (!el) return;
    var a = el.getAttribute('data-act');
    if (a === 'home') go('home');
    else if (a === 'settings') go('settings');
    else if (a === 'mod') go('mod', { id: el.getAttribute('data-id') });
    else if (a === 'start') { var m = el.getAttribute('data-mode'); start(m === 'sprint' ? { mode: 'sprint', modId: view.id, dur: +el.getAttribute('data-dur') } : { mode: 'practice', modId: view.id, total: 10 }); }
    else if (a === 'mix') start({ mode: 'mix', total: 20 });
    else if (a === 'scenario') start({ mode: 'scenario' });
    else if (a === 'again') start(view.result.cfg);
    else if (a === 'opt') answer('choice', +el.getAttribute('data-i'));
    else if (a === 'hl') answer('hilo', el.getAttribute('data-v'));
    else if (a === 'key') key(el.getAttribute('data-k'));
    else if (a === 'enter') answer('typed');
    else if (a === 'next') next();
    else if (a === 'quit') quit();
    else if (a === 'input') { st.settings.input = el.getAttribute('data-v'); save(); render(); }
    else if (a === 'reset') { if (resetArmed) { var keep = st.settings; st = blank(); st.settings = keep; save(); resetArmed = false; } else resetArmed = true; render(); }
  });
  document.addEventListener('keydown', function (ev) {
    if (view.name !== 'session' || !sess) return;
    var k = ev.key;
    if (sess.phase === 'fb') { if (k === 'Enter' || k === ' ') next(); return; }
    if (sess.inp === 'typed') {
      if (/^[0-9]$/.test(k) || k === '.') key(k); else if (k === '-') key('±'); else if (k === 'Backspace') key('del'); else if (k === 'Enter') answer('typed');
    } else if (sess.inp === 'choice' && /^[1-4]$/.test(k)) answer('choice', +k - 1);
  });
  // Called by the Android activity when the system back button is pressed. Returns false to let the app close.
  window.onAndroidBack = function () {
    if (view.name === 'home') return false;
    if (view.name === 'session') quit(); else go('home');
    return true;
  };
  render();
})();
