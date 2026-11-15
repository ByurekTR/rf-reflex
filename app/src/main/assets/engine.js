/* RF Reflex question engine. Pure logic, no DOM: runs in the WebView and under Node for tests. */
(function (root) {
  'use strict';

  var rnd = Math.random;
  var log10 = Math.log10, PI = Math.PI;
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- formatting ---------- */
  function trimZ(s) { return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }
  function fmt(x, sig) {
    sig = sig || 3;
    if (!isFinite(x)) return '?';
    var ax = Math.abs(x), s;
    if (ax < 1e-12) return '0';
    if (ax >= 1e7 || ax < 1e-4) {
      var e = Math.floor(log10(ax));
      s = trimZ((ax / Math.pow(10, e)).toFixed(sig - 1)) + '×10^' + e;
    } else {
      var d = sig - 1 - Math.floor(log10(ax));
      if (d < 0) d = 0; if (d > 8) d = 8;
      s = trimZ(ax.toFixed(d));
    }
    if (s === '0') return '0';
    return (x < 0 ? '−' : '') + s;
  }
  function fixed(x, d) {
    var s = trimZ(Math.abs(x).toFixed(d));
    if (s === '0') return '0';
    return (x < 0 ? '−' : '') + s;
  }
  function f1(x) { return fixed(x, 1); }
  function f2(x) { return fixed(x, 2); }
  function sg(x) { return x === 0 ? '0' : (x > 0 ? '+' : '−') + fmt(Math.abs(x), 4); }

  var PRE = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  function si(v, base) {
    var ax = Math.abs(v);
    if (ax === 0) return { v: 0, u: base };
    for (var i = 0; i < PRE.length; i++) if (ax >= PRE[i][0] * 0.9995) return { v: v / PRE[i][0], u: PRE[i][1] + base };
    return { v: v / 1e-12, u: 'p' + base };
  }
  function qty(v, base) { var s = si(v, base); return fmt(s.v, 4) + ' ' + s.u; }
  function lenU(l) {
    if (l >= 1000) return { v: l / 1000, u: 'km' };
    if (l >= 1) return { v: l, u: 'm' };
    if (l >= 0.01) return { v: l * 100, u: 'cm' };
    return { v: l * 1000, u: 'mm' };
  }
  function lenStr(l) { var u = lenU(l); return fmt(u.v) + ' ' + u.u; }
  function cx(i, q) {
    var a = Math.abs(q), im = 'j' + (a === 1 ? '' : fmt(a));
    if (q === 0) return fmt(i);
    if (i === 0) return (q < 0 ? '−' : '') + im;
    return fmt(i) + (q < 0 ? ' − ' : ' + ') + im;
  }

  /* ---------- formulas (tested directly) ---------- */
  var calc = {
    db10: function (r) { return 10 * log10(r); },
    db20: function (r) { return 20 * log10(r); },
    lin10: function (d) { return Math.pow(10, d / 10); },
    lin20: function (d) { return Math.pow(10, d / 20); },
    dbm: function (w) { return 10 * log10(w / 1e-3); },
    watts: function (d) { return 1e-3 * Math.pow(10, d / 10); },
    vrms: function (dbm, z) { return Math.sqrt(calc.watts(dbm) * (z || 50)); },
    lambda: function (f) { return 3e8 / f; },
    gamma: function (s) { return (s - 1) / (s + 1); },
    rl: function (s) { return -20 * log10(calc.gamma(s)); },
    vswr: function (g) { return (1 + g) / (1 - g); },
    mismatch: function (s) { return -10 * log10(1 - Math.pow(calc.gamma(s), 2)); },
    ktb: function (b) { return -174 + 10 * log10(b); },
    friis: function (nf1, g1, nf2) { return 10 * log10(calc.lin10(nf1) + (calc.lin10(nf2) - 1) / calc.lin10(g1)); },
    fspl: function (fMHz, dkm) { return 32.45 + 20 * log10(fMHz) + 20 * log10(dkm); },
    xl: function (f, l) { return 2 * PI * f * l; },
    xc: function (f, c) { return 1 / (2 * PI * f * c); },
    f0: function (l, c) { return 1 / (2 * PI * Math.sqrt(l * c)); },
    alias: function (f, fs) { return Math.abs(f - Math.round(f / fs) * fs); },
    zone: function (f, fs) { return Math.floor(f / (fs / 2)) + 1; },
    adcSnr: function (n) { return 6.02 * n + 1.76; },
    shannon: function (b, snrDb) { return b * Math.log2(1 + calc.lin10(snrDb)); },
    dishGain: function (d, lam, eta) { return 10 * log10((eta || 0.6) * Math.pow(PI * d / lam, 2)); },
    beam: function (d, lam) { return 70 * lam / d; },
    farField: function (d, lam) { return 2 * d * d / lam; },
    aeff: function (gdbi, lam) { return calc.lin10(gdbi) * lam * lam / (4 * PI); },
    doppler: function (v, f) { return v * f / 3e8; },
    e12: function (t) {
      var base = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82], all = [];
      for (var d = -1; d <= 6; d++) base.forEach(function (b) { all.push(b * Math.pow(10, d)); });
      var best = 0;
      for (var i = 1; i < all.length; i++) if (Math.abs(Math.log(t / all[i])) < Math.abs(Math.log(t / all[best]))) best = i;
      return { value: all[best], near: [all[best - 2], all[best - 1], all[best + 1], all[best + 2]] };
    }
  };

  /* ---------- question constructors ---------- */
  var DB = { abs: 0.5 }, R5 = { rel: 0.05 }, R8 = { rel: 0.08 }, R10 = { rel: 0.1 }, INT = { abs: 0.4 };
  function num(prompt, answer, unit, tol, explain, wrong, extra) {
    var q = { kind: 'num', prompt: prompt, answer: answer, unit: unit || '', tol: tol, explain: explain || '', wrong: wrong || null };
    if (tol === INT) q.int = true;
    if (extra) for (var k in extra) q[k] = extra[k];
    return q;
  }
  function mc(prompt, answer, others, explain) {
    var seen = {}; seen[answer] = 1;
    var o = shuffle(others).filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }).slice(0, 3);
    return { kind: 'mc', prompt: prompt, answer: answer, options: shuffle([answer].concat(o)), explain: explain || '' };
  }
  function lv(min, fn) { fn.min = min; return fn; }

  /* ---------- answer handling ---------- */
  function within(a, x, tol, k) {
    k = k || 1;
    var d = Math.abs(x - a);
    if (tol.wrap) { d = ((x - a) % tol.wrap + tol.wrap) % tol.wrap; d = Math.min(d, tol.wrap - d); }
    return (tol.abs != null && d <= tol.abs * k + 1e-9) || (tol.rel != null && d <= tol.rel * k * Math.abs(a) + 1e-12);
  }
  function check(q, x) { return within(q.answer, x, q.tol); }
  function ansNum(q, v) {
    if (Math.abs(v) < 1e-9) v = 0;
    if (q.int) return fixed(Math.round(v), 0);
    if (q.tol.rel == null) return fixed(v, q.tol.abs >= 0.2 ? 1 : q.tol.abs >= 0.04 ? 2 : 3);
    return fmt(v, 3);
  }
  function ansStr(q, v) {
    if (q.kind === 'mc') return q.answer;
    if (v === undefined) v = q.answer;
    var n = ansNum(q, v);
    if (q.unit === '×') return '×' + n;
    if (q.unit === '°' || q.unit === 'π') return n + q.unit;
    return q.unit ? n + ' ' + q.unit : n;
  }
  function distract(q) {
    var a = q.answer, out = [], seen = {};
    seen[ansStr(q, a)] = 1;
    function add(v) {
      if (out.length >= 3 || !isFinite(v)) return;
      if (q.int) { v = Math.round(v); if (!q.neg && a > 0 && v <= 0) return; }
      if (q.pos && v <= 0) return;
      if (q.unit === '%' && v > 100) return;
      if (within(a, v, q.tol, 1.5)) return;
      var s = ansStr(q, v);
      if (seen[s]) return;
      seen[s] = 1; out.push(v);
    }
    if (q.wrong) shuffle(q.wrong).forEach(add);
    var gen;
    if (q.int) gen = shuffle([a + 1, a - 1, a + 2, a - 2]).concat(shuffle([a * 2, a + 10, a - 10, a + 5]));
    else if (q.tol.rel != null && Math.abs(a) > 1e-9) gen = shuffle([0.5, 2, 0.1, 10, 0.25, 4, 0.2, 5]).map(function (k) { return a * k; });
    else {
      var o = q.tol.abs >= 0.5 ? [3, 6, 10, 20] : q.tol.abs >= 0.2 ? [1, 2, 3, 5] : [6, 12, 20, 40].map(function (k) { return k * q.tol.abs; });
      gen = shuffle([o[0], -o[0], o[1], -o[1]]).concat(shuffle([o[2], -o[2], o[3], -o[3]])).map(function (k) { return a + k; });
    }
    gen.forEach(add);
    for (var k = 3; out.length < 3 && k < 60; k++) add(q.int ? a + 3 * k : (Math.abs(a) < 1e-9 ? k : a * (1 + k)));
    return out;
  }
  function choices(q) {
    if (q.kind === 'mc') return q.options.map(function (o) { return { label: o, correct: o === q.answer }; });
    var vals = [q.answer].concat(distract(q));
    return shuffle(vals.map(function (v, i) { return { label: ansStr(q, v), correct: i === 0 }; }));
  }
  function hilo(q) {
    var a = q.answer, ref, tries = 0;
    do {
      if (q.int && Math.abs(a) <= 20) ref = a + pick([-3, -2, -1, 1, 2, 3]);
      else if ((q.tol.rel != null || q.int) && Math.abs(a) > 1e-9) { ref = a * pick([0.5, 0.65, 1.5, 2]); if (q.int) ref = Math.round(ref); }
      else ref = a + pick([-2, -1, 1, 2]) * Math.max(q.tol.abs * 6, 1e-6);
      tries++;
    } while (ansStr(q, ref) === ansStr(q, a) && tries < 20);
    return { ref: ref, refStr: ansStr(q, ref), answer: a > ref ? 'higher' : 'lower' };
  }

  /* ---------- shared tables ---------- */
  var FREQS = [1.8, 3.5, 7, 14, 21, 28, 50, 100, 144, 145, 300, 433, 435, 900, 1090, 1200, 1575, 2400, 3000, 5800, 10000, 12000, 24000];
  function qf(fMHz) { return qty(fMHz * 1e6, 'Hz'); }
  var BWS = [100, 500, 1e3, 3e3, 1e4, 1e5, 2e5, 1e6, 2e6, 5e6, 1e7, 2e7, 1e8];
  var MODS = [[2, 'BPSK'], [4, 'QPSK'], [8, '8-PSK'], [16, '16-QAM'], [64, '64-QAM'], [256, '256-QAM'], [1024, '1024-QAM'], [4096, '4096-QAM']];
  var STAGES = [['cable', [-1, -2, -3, -4, -6]], ['LNA', [15, 18, 20, 25]], ['filter', [-1, -2, -3]], ['mixer', [-6, -7, -8]],
    ['amp', [10, 13, 20, 30]], ['attenuator', [-3, -6, -10, -20]], ['splitter', [-3, -6]]];
  function mkChain(n) { var st = []; for (var i = 0; i < n; i++) { var s = pick(STAGES); st.push([s[0], pick(s[1])]); } return st; }
  function chainTxt(st) { return st.map(function (s) { return s[0] + ' ' + sg(s[1]) + ' dB'; }).join(' → '); }
  function chainSum(st) { return st.reduce(function (a, s) { return a + s[1]; }, 0); }
  function chainMath(st) { return st.map(function (s) { return (s[1] >= 0 ? '+ ' : '− ') + Math.abs(s[1]); }).join(' '); }
  function item(list) { var it = pick(list); return mc(it[0], it[1], it[2], it[3]); }
  var WIN = {
    'Rectangular': { sl: '−13 dB', ml: '2 bins', enbw: '1.00 bins' },
    'Hann': { sl: '−31 dB', ml: '4 bins', enbw: '1.50 bins' },
    'Hamming': { sl: '−43 dB', ml: '4 bins', enbw: '1.36 bins' },
    'Blackman': { sl: '−58 dB', ml: '6 bins', enbw: '1.73 bins' }
  };
  var WN = Object.keys(WIN);
  var WINX = 'Highest sidelobes: rectangular −13 dB, Hann −31 dB, Hamming −43 dB, Blackman −58 dB. Lower sidelobes cost a wider main lobe.';

  /* ---------- modules ---------- */
  var MODULES = [
    {
      id: 'db', name: 'Decibels', group: 'RF', blurb: 'Ratios to dB and back, in your head.',
      anchors: ['×2 power ≈ 3 dB, ×10 = 10 dB', '×5 ≈ 7 dB, ×4 ≈ 6 dB, ×8 ≈ 9 dB', '1 dB ≈ ×1.26, −3 dB = half power', 'Voltage ratios use 20·log: ×2 = 6 dB, ×10 = 20 dB'],
      types: {
        p2db: function () {
          var r = pick([2, 4, 5, 8, 10, 20, 25, 40, 50, 100, 200, 400, 500, 1000, 0.5, 0.25, 0.2, 0.1, 0.05, 0.01]), a = calc.db10(r);
          return num('Power ratio ×' + fmt(r) + ' in dB?', a, 'dB', DB, '10·log(' + fmt(r) + ') = ' + f1(a) + ' dB. Build it from ×2 = 3 dB, ×5 = 7 dB, ×10 = 10 dB; dividing subtracts.', [calc.db20(r), -a]);
        },
        db2p: function () {
          var d = pick([3, 6, 7, 9, 10, 13, 16, 17, 20, 23, 26, 27, 30, -3, -6, -7, -10, -13, -20]), a = calc.lin10(d);
          return num(sg(d) + ' dB as a power ratio?', a, '×', R8, 'Split it into 10s and 3s: every 10 dB is ×10, every 3 dB is ×2. ' + sg(d) + ' dB = ×' + fmt(a) + '.', [calc.lin20(d)]);
        },
        v2db: function () {
          var r = pick([2, 4, 5, 10, 20, 100, 1000, 0.5, 0.25, 0.1]), a = calc.db20(r);
          return num('Voltage ratio ×' + fmt(r) + ' in dB?', a, 'dB', DB, 'Voltage uses 20·log: ×2 = 6 dB, ×10 = 20 dB. Here ' + f1(a) + ' dB.', [calc.db10(r), -a]);
        },
        db2v: function () {
          var d = pick([6, 12, 14, 20, 26, 40, 60, -6, -12, -20]), a = calc.lin20(d);
          return num(sg(d) + ' dB as a voltage ratio?', a, '×', R8, 'For voltage every 20 dB is ×10 and every 6 dB is ×2. ' + sg(d) + ' dB = ×' + fmt(a) + '.', [calc.lin10(d)]);
        }
      }
    },
    {
      id: 'dbm', name: 'Absolute power', group: 'RF', blurb: 'dBm, dBW, watts and volts into 50 Ω.',
      anchors: ['0 dBm = 1 mW, 30 dBm = 1 W', 'dBW = dBm − 30', '+10 dBm = 10 mW, +20 dBm = 100 mW, +37 dBm ≈ 5 W', '0 dBm into 50 Ω ≈ 224 mV RMS; +13 dBm ≈ 1 V RMS'],
      types: {
        w2dbm: function () {
          var w = pick([1e-9, 1e-6, 1e-5, 1e-4, 1e-3, 2e-3, 4e-3, 5e-3, 0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 4, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 1500]), a = calc.dbm(w);
          return num(qty(w, 'W') + ' in dBm?', a, 'dBm', DB, 'Start from 1 mW = 0 dBm or 1 W = 30 dBm, then ×2 = +3 and ×10 = +10. ' + qty(w, 'W') + ' = ' + f1(a) + ' dBm.', [a - 30, a + 30]);
        },
        dbm2w: function () {
          var d = pick([-30, -20, -13, -10, -7, -3, 0, 3, 7, 10, 13, 17, 20, 23, 27, 30, 33, 37, 40, 43, 47, 50, 60]), s = si(calc.watts(d), 'W');
          return num(sg(d) + ' dBm in ' + s.u + '?', s.v, s.u, R8, '0 dBm = 1 mW and 30 dBm = 1 W; each 10 dB is ×10, each 3 dB is ×2. ' + sg(d) + ' dBm = ' + fmt(s.v) + ' ' + s.u + '.');
        },
        dbw: function () {
          var d = pick([-30, -10, 0, 10, 20, 30, 37, 40, 47, 50, 60]);
          if (rnd() < 0.5) return num(sg(d) + ' dBm in dBW?', d - 30, 'dBW', DB, 'dBW = dBm − 30, because 1 W = 30 dBm.', [d + 30]);
          var x = d - 30;
          return num(sg(x) + ' dBW in dBm?', x + 30, 'dBm', DB, 'dBm = dBW + 30, because 1 W = 30 dBm.', [x - 30]);
        },
        dbm2v: function () {
          var d = pick([-30, -20, -10, 0, 7, 10, 13, 20, 30]), s = si(calc.vrms(d), 'V');
          return num(sg(d) + ' dBm into 50 Ω: RMS voltage in ' + s.u + '?', s.v, s.u, R8, '0 dBm into 50 Ω ≈ 224 mV RMS. Every 20 dB is ×10 in voltage, every 6 dB is ×2. Here ' + fmt(s.v) + ' ' + s.u + '.');
        }
      }
    },
    {
      id: 'chain', name: 'Gain chains', group: 'RF', blurb: 'Add gains and losses down a signal path.',
      anchors: ['In dB, a chain is just a sum', 'Passive mixer ≈ −7 dB, 2-way splitter ≈ −3 dB', 'Keep a running total stage by stage'],
      types: {
        out: function (L) {
          var st = mkChain(1 + L + ri(0, 1)), pin = pick([-110, -100, -90, -80, -70, -60, -50, -40, -30, -20, -10, 0]), a = pin + chainSum(st);
          return num(sg(pin) + ' dBm → ' + chainTxt(st) + '. Output level?', a, 'dBm', DB, 'Add the dB: ' + sg(pin) + ' ' + chainMath(st) + ' = ' + f1(a) + ' dBm.');
        },
        net: function (L) {
          var st = mkChain(1 + L + ri(0, 1)), a = chainSum(st);
          return num(chainTxt(st) + '. Net gain?', a, 'dB', DB, 'Sum the stages: ' + chainMath(st).replace(/^\+ /, '') + ' = ' + f1(a) + ' dB.', [-a]);
        },
        need: function (L) {
          var st = mkChain(L + ri(0, 1)), pin = pick([-100, -90, -80, -70, -60, -50]), g = pick([10, 15, 20, 25, 30, 35, 40]), target = pin + chainSum(st) + g;
          return num(sg(pin) + ' dBm in, then ' + chainTxt(st) + ' and one amplifier. Amplifier gain needed for ' + sg(target) + ' dBm out?', g, 'dB', DB,
            'Without the amplifier the output is ' + sg(pin + chainSum(st)) + ' dBm. The gap to ' + sg(target) + ' dBm is ' + g + ' dB.');
        }
      }
    },
    {
      id: 'wave', name: 'Frequency & wavelength', group: 'RF', blurb: 'λ = 300 / f, fractions of a wave, band names.',
      anchors: ['λ (m) = 300 / f (MHz)', '145 MHz → 2 m, 435 MHz → 70 cm, 1090 MHz → 27.5 cm', '2.4 GHz → 12.5 cm, 10 GHz → 3 cm', 'HF 3–30 MHz, VHF 30–300 MHz, UHF 0.3–3 GHz, SHF 3–30 GHz', 'Radar bands: L 1–2, S 2–4, C 4–8, X 8–12, Ku 12–18, K 18–27, Ka 27–40 GHz'],
      types: {
        lam: function () {
          var f = pick(FREQS), l = 300 / f, u = lenU(l);
          return num('Wavelength at ' + qf(f) + '?', u.v, u.u, R5, 'λ(m) = 300 / f(MHz) = 300 / ' + fmt(f, 4) + ' = ' + lenStr(l) + '.');
        },
        frac: function (L) {
          var f = pick(FREQS), k = pick([[2, 'λ/2'], [4, 'λ/4']]), vf = (L >= 2 && rnd() < 0.5) ? pick([0.66, 0.8, 0.95]) : 1, u = lenU(300 / f / k[0] * vf);
          return num(k[1] + ' at ' + qf(f) + (vf < 1 ? ' in a line with velocity factor ' + vf : '') + '?', u.v, u.u, R5,
            'λ = 300 / ' + fmt(f, 4) + ' = ' + lenStr(300 / f) + '. Divide by ' + k[0] + (vf < 1 ? ' and multiply by ' + vf : '') + ': ' + fmt(u.v) + ' ' + u.u + '.');
        },
        l2f: function () {
          var it = pick([[160, '160 m'], [80, '80 m'], [40, '40 m'], [20, '20 m'], [10, '10 m'], [6, '6 m'], [2, '2 m'], [1, '1 m'], [0.7, '70 cm'], [0.23, '23 cm'], [0.21, '21 cm'], [0.13, '13 cm'], [0.03, '3 cm']]);
          var s = si(300e6 / it[0], 'Hz');
          return num('A wavelength of ' + it[1] + ' is what frequency?', s.v, s.u, R8, 'f(MHz) = 300 / λ(m) = ' + fmt(300 / it[0]) + ' MHz.');
        },
        band: function () {
          if (rnd() < 0.5) {
            var a = pick([[0.5, 'MF'], [1.8, 'MF'], [7, 'HF'], [14, 'HF'], [28, 'HF'], [50, 'VHF'], [100, 'VHF'], [145, 'VHF'], [435, 'UHF'], [1090, 'UHF'], [2400, 'UHF'], [5800, 'SHF'], [10000, 'SHF'], [24000, 'SHF'], [60000, 'EHF']]);
            return mc(qf(a[0]) + ' is in which ITU band?', a[1], ['MF', 'HF', 'VHF', 'UHF', 'SHF', 'EHF'], 'MF 0.3–3 MHz, HF 3–30 MHz, VHF 30–300 MHz, UHF 300 MHz–3 GHz, SHF 3–30 GHz, EHF 30–300 GHz.');
          }
          var b = pick([[1.09, 'L'], [1.2, 'L'], [1.575, 'L'], [2.4, 'S'], [3.3, 'S'], [5.8, 'C'], [6, 'C'], [9.4, 'X'], [10, 'X'], [12.5, 'Ku'], [14, 'Ku'], [20, 'K'], [24, 'K'], [30, 'Ka'], [35, 'Ka']]);
          return mc(fmt(b[0], 4) + ' GHz is in which IEEE radar band?', b[1], ['L', 'S', 'C', 'X', 'Ku', 'K', 'Ka'], 'L 1–2, S 2–4, C 4–8, X 8–12, Ku 12–18, K 18–27, Ka 27–40 GHz.');
        }
      }
    },
    {
      id: 'match', name: 'Matching', group: 'RF', blurb: 'VSWR, return loss, reflection, mismatch loss.',
      anchors: ['|Γ| = (VSWR − 1)/(VSWR + 1)', 'VSWR 1.5 ↔ 14 dB return loss ↔ 4 % reflected', 'VSWR 2 ↔ 9.5 dB ↔ 11 %', 'VSWR 3 ↔ 6 dB ↔ 25 %', 'Resistive load: VSWR = R/Z₀ or Z₀/R'],
      types: {
        v2rl: function () {
          var s = pick([1.1, 1.2, 1.5, 2, 3, 5]), a = calc.rl(s);
          return num('VSWR ' + s + ':1 → return loss?', a, 'dB', { abs: 0.7 }, '|Γ| = (S−1)/(S+1) = ' + fmt(calc.gamma(s)) + ', and RL = −20·log|Γ| = ' + f1(a) + ' dB. Anchors: 1.5 → 14 dB, 2 → 9.5 dB, 3 → 6 dB.', null, { pos: true });
        },
        v2ref: function () {
          var s = pick([1.2, 1.5, 2, 3, 5]), g = calc.gamma(s);
          return num('VSWR ' + s + ':1 → reflected power?', 100 * g * g, '%', { rel: 0.12, abs: 0.3 }, '|Γ| = ' + fmt(g) + ', reflected power = |Γ|² = ' + fmt(100 * g * g) + ' %.');
        },
        rl2ref: function () {
          var rl = pick([3, 6, 10, 13, 20, 30]);
          return num('Return loss ' + rl + ' dB → reflected power?', 100 * calc.lin10(-rl), '%', R10, 'Reflected fraction = 10^(−RL/10): 3 dB → 50 %, 10 dB → 10 %, 20 dB → 1 %.');
        },
        g2v: function () {
          var g = pick([0.1, 0.2, 0.25, 0.333, 0.5, 0.6]);
          return num('|Γ| = ' + g + ' → VSWR?', calc.vswr(g), '', { rel: 0.06 }, 'VSWR = (1 + |Γ|)/(1 − |Γ|) = ' + fmt(calc.vswr(g)) + '.');
        },
        r2v: function () {
          var r = pick([10, 12.5, 25, 33, 75, 100, 150, 200, 300, 450]);
          return num('A ' + r + ' Ω resistive load on a 50 Ω line: VSWR?', Math.max(r / 50, 50 / r), '', R5, 'For a purely resistive load, VSWR = R/Z₀ or Z₀/R, whichever is above 1.');
        },
        ml: lv(2, function () {
          var s = pick([2, 3, 4, 5, 6]), g = calc.gamma(s), a = calc.mismatch(s);
          return num('VSWR ' + s + ':1 → mismatch loss?', a, 'dB', { abs: 0.25 }, 'Loss = −10·log(1 − |Γ|²). |Γ|² = ' + fmt(g * g) + ' → ' + f2(a) + ' dB. Anchors: 2:1 ≈ 0.5 dB, 3:1 ≈ 1.25 dB.', null, { pos: true });
        })
      }
    },
    {
      id: 'noise', name: 'Noise', group: 'RF', blurb: 'kTB noise floor, noise figure, sensitivity.',
      anchors: ['Thermal noise: −174 dBm/Hz at 290 K', 'Add 10·log(B): 1 kHz → −144, 1 MHz → −114, 20 MHz → −101 dBm', 'Receiver floor = kTB + noise figure', 'Sensitivity = floor + required SNR'],
      types: {
        floor: function () {
          var b = pick(BWS), a = calc.ktb(b);
          return num('Thermal noise floor in a ' + qty(b, 'Hz') + ' bandwidth (290 K)?', a, 'dBm', { abs: 0.6 }, '−174 dBm/Hz + 10·log(B) = −174 + ' + f1(10 * log10(b)) + ' = ' + f1(a) + ' dBm.');
        },
        nf: function () {
          var b = pick(BWS), nf = pick([1, 2, 3, 5, 6, 8, 10]), a = calc.ktb(b) + nf;
          return num('Receiver noise floor: bandwidth ' + qty(b, 'Hz') + ', noise figure ' + nf + ' dB?', a, 'dBm', { abs: 0.6 }, 'kTB = ' + f1(calc.ktb(b)) + ' dBm; add the ' + nf + ' dB noise figure: ' + f1(a) + ' dBm.');
        },
        sens: function () {
          var b = pick(BWS), nf = pick([2, 3, 5, 6, 8]), snr = pick([3, 6, 10, 12, 15, 20]), a = calc.ktb(b) + nf + snr;
          return num('Sensitivity: B = ' + qty(b, 'Hz') + ', NF = ' + nf + ' dB, required SNR = ' + snr + ' dB?', a, 'dBm', { abs: 0.6 }, '−174 + ' + f1(10 * log10(b)) + ' + ' + nf + ' + ' + snr + ' = ' + f1(a) + ' dBm.');
        },
        snr: function () {
          var b = pick(BWS), nf = pick([2, 3, 4, 5, 6]), fl = calc.ktb(b) + nf, s = Math.round(fl) + pick([5, 10, 15, 20, 30, 40]);
          return num('Signal ' + sg(s) + ' dBm, B = ' + qty(b, 'Hz') + ', NF = ' + nf + ' dB. SNR?', s - fl, 'dB', { abs: 0.6 }, 'Noise floor = −174 + ' + f1(10 * log10(b)) + ' + ' + nf + ' = ' + f1(fl) + ' dBm. SNR = ' + sg(s) + ' − (' + f1(fl) + ') = ' + f1(s - fl) + ' dB.');
        },
        friis: lv(3, function () {
          var nf1 = pick([0.5, 1, 2]), g1 = pick([10, 13, 20]), nf2 = pick([6, 10, 13]), a = calc.friis(nf1, g1, nf2);
          return num('LNA (NF ' + nf1 + ' dB, gain ' + g1 + ' dB) followed by a stage with NF ' + nf2 + ' dB. Cascaded noise figure?', a, 'dB', { abs: 0.3 },
            'F = F₁ + (F₂ − 1)/G₁ = ' + fmt(calc.lin10(nf1)) + ' + (' + fmt(calc.lin10(nf2)) + ' − 1)/' + fmt(calc.lin10(g1)) + ' → ' + f2(a) + ' dB. The first stage dominates when its gain is high.', null, { pos: true });
        })
      }
    },
    {
      id: 'link', name: 'Link budget', group: 'RF', blurb: 'Path loss, EIRP, received power, margin.',
      anchors: ['FSPL = 32.45 + 20·log f(MHz) + 20·log d(km)', 'Double the distance: +6 dB. Ten times: +20 dB', 'EIRP = Tx power − feedline loss + antenna gain', 'Received = EIRP − path loss + Rx antenna gain', 'dBi = dBd + 2.15'],
      types: {
        fspl: function () {
          var f = pick([145, 435, 1090, 1575, 2400, 5800, 10000, 12000]), d = pick([1, 2, 5, 10, 20, 50, 100, 200, 400, 550, 1000, 36000]), a = calc.fspl(f, d);
          return num('Free-space path loss at ' + qf(f) + ' over ' + fmt(d, 5) + ' km?', a, 'dB', { abs: 1 }, '32.45 + 20·log f(MHz) + 20·log d(km) = 32.45 + ' + f1(20 * log10(f)) + ' + ' + f1(20 * log10(d)) + ' = ' + f1(a) + ' dB.');
        },
        dist: function () {
          var k = pick([2, 3, 4, 5, 10]), a = calc.db20(k);
          return num('Distance ×' + k + '. Extra free-space path loss?', a, 'dB', DB, 'Path loss goes with distance squared: 20·log(' + k + ') = ' + f1(a) + ' dB. ×2 = 6 dB, ×10 = 20 dB.', [calc.db10(k)]);
        },
        eirp: function () {
          var w = pick([0.1, 0.5, 1, 2, 5, 10, 20, 50, 100]), loss = pick([0, 1, 2, 3]), g = pick([0, 2, 3, 6, 9, 10, 12, 15, 20, 30]), a = calc.dbm(w) - loss + g, dbw = rnd() < 0.3;
          return num('Tx ' + qty(w, 'W') + ', feedline loss ' + loss + ' dB, antenna ' + g + ' dBi. EIRP in ' + (dbw ? 'dBW' : 'dBm') + '?', dbw ? a - 30 : a, dbw ? 'dBW' : 'dBm', DB,
            qty(w, 'W') + ' = ' + f1(calc.dbm(w)) + ' dBm; − ' + loss + ' + ' + g + ' = ' + f1(a) + ' dBm' + (dbw ? ' = ' + f1(a - 30) + ' dBW' : '') + '.');
        },
        prx: function () {
          var e = pick([30, 36, 40, 43, 50, 60]), pl = pick([90, 100, 110, 120, 130, 140, 150, 160]), gr = pick([0, 2, 5, 10, 15, 30]);
          return num('EIRP ' + e + ' dBm, path loss ' + pl + ' dB, Rx antenna ' + gr + ' dBi. Received power?', e - pl + gr, 'dBm', DB, e + ' − ' + pl + ' + ' + gr + ' = ' + sg(e - pl + gr) + ' dBm.');
        },
        margin: function () {
          var p = pick([-60, -65, -70, -75, -80, -85, -90, -95, -100]), m = pick([3, 6, 10, 15, 20, 25]);
          return num('Received ' + sg(p) + ' dBm, sensitivity ' + sg(p - m) + ' dBm. Link margin?', m, 'dB', DB, 'Margin = received power − sensitivity = ' + m + ' dB.', [-m]);
        },
        dbd: function () {
          if (rnd() < 0.5) { var x = pick([0, 3, 6, 7, 10, 12]); return num(x + ' dBd in dBi?', x + 2.15, 'dBi', { abs: 0.3 }, 'dBi = dBd + 2.15, because a half-wave dipole has 2.15 dBi.', [x - 2.15]); }
          var y = pick([2.15, 5, 8, 10, 14]);
          return num(y + ' dBi in dBd?', y - 2.15, 'dBd', { abs: 0.3 }, 'dBd = dBi − 2.15, because a half-wave dipole has 2.15 dBi.', [y + 2.15]);
        },
        range: function () {
          var x = pick([3, 6, 10, 12, 20]), a = calc.lin20(x);
          return num(x + ' dB more link budget multiplies free-space range by?', a, '×', R8, 'Range scales as 10^(dB/20): 6 dB doubles it, 20 dB is ×10. Here ×' + fmt(a) + '.', [calc.lin10(x)]);
        }
      }
    },
    {
      id: 'time', name: 'Time, distance & Doppler', group: 'RF', blurb: 'Light-speed rules of thumb.',
      anchors: ['Light: 30 cm per ns, 300 m per µs, 300 km per ms', 'Coax is slower: divide speed by the velocity factor', 'Radar range: 150 m per µs of round trip', 'Doppler f_d = v/λ (one-way); radar sees twice that', 'Unambiguous range = c / (2·PRF)'],
      types: {
        delay: function () {
          var len = pick([1, 2, 3, 5, 10, 20, 30, 50, 100]), vf = pick([1, 1, 0.66, 0.8]), s = si(len / (3e8 * vf), 's');
          return num('Delay through ' + len + ' m of ' + (vf === 1 ? 'free space' : 'cable (velocity factor ' + vf + ')') + '?', s.v, s.u, R8,
            'Light takes 3.33 ns per metre' + (vf < 1 ? '; divide by ' + vf + ' for the cable' : '') + ': ' + fmt(s.v) + ' ' + s.u + '.');
        },
        echo: function () {
          var t = pick([1e-6, 2e-6, 10e-6, 20e-6, 100e-6, 200e-6, 1e-3, 2e-3]), u = lenU(1.5e8 * t);
          return num('A radar echo returns after ' + qty(t, 's') + '. Target range?', u.v, u.u, R5, 'Range = c·t/2: 150 m per µs of round-trip time.', [u.v * 2]);
        },
        prop: function () {
          var d = pick([150, 300, 550, 1000, 3000, 36000, 384000]), s = si(d * 1e3 / 3e8, 's');
          return num('One-way propagation delay over ' + fmt(d, 6) + ' km?', s.v, s.u, R5, 'Light covers 300 km per ms: ' + fmt(d, 6) + ' / 300 = ' + fmt(d / 300) + ' ms.');
        },
        dop: function () {
          var it = pick([[250, 1090e6, 'an airliner closing at 250 m/s'], [7500, 12e9, 'a LEO satellite closing at 7.5 km/s'], [7500, 435e6, 'a LEO satellite closing at 7.5 km/s'], [7500, 145e6, 'a LEO satellite closing at 7.5 km/s'],
            [30, 2.4e9, 'a car closing at 30 m/s'], [100, 10e9, 'a target closing at 100 m/s'], [5000, 1.5e9, 'a satellite closing at 5 km/s']]);
          var two = rnd() < 0.25, s = si(calc.doppler(it[0], it[1]) * (two ? 2 : 1), 'Hz');
          return num('Doppler shift ' + (two ? 'seen by a radar (two-way)' : '(one-way)') + ' for ' + it[2] + ' at ' + qty(it[1], 'Hz') + '?', s.v, s.u, R8,
            'f_d = v/λ' + (two ? ' × 2' : '') + '. λ = ' + lenStr(3e8 / it[1]) + ', so ' + fmt(it[0], 4) + ' m/s ÷ λ' + (two ? ' × 2' : '') + ' = ' + fmt(s.v) + ' ' + s.u + '.');
        },
        prf: function () {
          var p = pick([500, 1e3, 2e3, 5e3, 10e3]), u = lenU(3e8 / (2 * p));
          return num('PRF of ' + qty(p, 'Hz') + ': maximum unambiguous range?', u.v, u.u, R5, 'R = c/(2·PRF): 1 kHz → 150 km.', [u.v * 2]);
        }
      }
    },
    {
      id: 'ant', name: 'Antennas', group: 'RF', blurb: 'Beamwidth, dish gain, far field, dipoles.',
      anchors: ['Dish beamwidth ≈ 70·λ/D degrees', 'Dish gain ≈ 20·log(D/λ) + 7.7 dB at 60 % efficiency', 'Far field starts at 2D²/λ', 'Half-wave dipole ≈ 143 / f(MHz) metres, 2.15 dBi', 'Linear ↔ circular polarisation: 3 dB loss'],
      types: {
        beam: function () {
          var f = pick([1.42e9, 2.4e9, 5.8e9, 10e9, 12e9, 24e9]), D = pick([0.3, 0.6, 1, 1.2, 2.4, 3, 10]), lam = 3e8 / f, a = calc.beam(D, lam);
          return num('−3 dB beamwidth of a ' + D + ' m dish at ' + qty(f, 'Hz') + '?', a, '°', { rel: 0.12 }, 'θ ≈ 70·λ/D = 70 × ' + lenStr(lam) + ' / ' + D + ' m = ' + fmt(a) + '°.');
        },
        gain: function () {
          var f = pick([1.42e9, 2.4e9, 5.8e9, 10e9, 12e9, 24e9]), D = pick([0.3, 0.6, 1, 1.2, 2.4, 3]), lam = 3e8 / f, a = calc.dishGain(D, lam, 0.6);
          return num('Gain of a ' + D + ' m dish at ' + qty(f, 'Hz') + ' (60 % efficiency)?', a, 'dBi', { abs: 1 }, 'G = η(πD/λ)², or 20·log(D/λ) + 7.7 dB. D/λ = ' + fmt(D / lam) + ' → ' + f1(a) + ' dBi.', null, { pos: true });
        },
        ff: function () {
          var D = pick([0.1, 0.3, 0.6, 1, 2, 3]), f = pick([1e9, 2.4e9, 5.8e9, 10e9, 24e9]), lam = 3e8 / f, u = lenU(calc.farField(D, lam));
          return num('Far-field distance for a ' + D + ' m aperture at ' + qty(f, 'Hz') + '?', u.v, u.u, R8, 'Far field starts at 2D²/λ = 2 × ' + fmt(D * D) + ' m² / ' + lenStr(lam) + ' = ' + fmt(u.v) + ' ' + u.u + '.');
        },
        dip: function () {
          var f = pick([3.6, 7.1, 14.2, 21.2, 28.5, 50.2, 145, 433, 1090]), u = lenU(143 / f);
          return num('Length of a half-wave dipole for ' + fmt(f, 4) + ' MHz?', u.v, u.u, { rel: 0.06 }, 'λ/2 = 150/f, shortened about 5 % for end effect: 143 / ' + fmt(f, 4) + ' = ' + fmt(u.v) + ' ' + u.u + '.');
        },
        ae: lv(2, function () {
          var g = pick([0, 2.15, 6, 10, 20, 30]), f = pick([145e6, 435e6, 1090e6, 2.4e9, 10e9]), lam = 3e8 / f, a = calc.aeff(g, lam), big = a >= 0.1;
          return num('Effective aperture of a ' + g + ' dBi antenna at ' + qty(f, 'Hz') + '?', big ? a : a * 1e4, big ? 'm²' : 'cm²', { rel: 0.12 },
            'A_e = G·λ²/(4π). λ = ' + lenStr(lam) + ', G = ×' + fmt(calc.lin10(g)) + ' → ' + fmt(big ? a : a * 1e4) + (big ? ' m²' : ' cm²') + '.');
        }),
        pol: function () {
          return item([
            ['A linear antenna receiving a circularly polarised signal loses about', '3 dB', ['0 dB', '6 dB', '20 dB or more'], 'A circular wave is two equal linear components, so a linear antenna collects half the power: 3 dB.'],
            ['A vertical antenna receiving a horizontally polarised signal (ideal case) loses', '20 dB or more', ['0 dB', '3 dB', '6 dB'], 'Crossed linear polarisations are isolated in theory; 20 to 30 dB is typical in practice.'],
            ['An RHCP antenna receiving an LHCP signal (ideal case) loses', '20 dB or more', ['0 dB', '3 dB', '6 dB'], 'Opposite circular senses are isolated in theory; 20 dB or more in practice.'],
            ['A circularly polarised wave reflects off a flat conductor. Its handedness', 'reverses', ['stays the same', 'becomes linear', 'is lost'], 'One reflection turns RHCP into LHCP.']
          ]);
        }
      }
    },
    {
      id: 'react', name: 'Reactance & resonance', group: 'Circuits', blurb: 'X_L, X_C, resonance, time constants, Q.',
      anchors: ['X_L = 2πfL, X_C = 1/(2πfC), with 2π ≈ 6.28', 'f₀ = 1/(2π√(LC)); 1 µH with 100 pF ≈ 15.9 MHz', 'τ = RC; settled to 1 % after 5τ', 'Bandwidth = f₀ / Q'],
      types: {
        xl: function () {
          var f, l, x;
          do { f = pick([1, 2, 5]) * Math.pow(10, ri(3, 9)); l = pick([1, 2.2, 4.7]) * Math.pow(10, ri(-8, -3)); x = calc.xl(f, l); } while (x < 1 || x > 1e6);
          var s = si(x, 'Ω');
          return num('Reactance of ' + qty(l, 'H') + ' at ' + qty(f, 'Hz') + '?', s.v, s.u, R8, 'X_L = 2πfL ≈ 6.28 × ' + qty(f, 'Hz') + ' × ' + qty(l, 'H') + ' = ' + fmt(s.v) + ' ' + s.u + '.');
        },
        xc: function () {
          var f, c, x;
          do { f = pick([1, 2, 5]) * Math.pow(10, ri(3, 9)); c = pick([1, 2.2, 4.7]) * Math.pow(10, ri(-12, -6)); x = calc.xc(f, c); } while (x < 1 || x > 1e6);
          var s = si(x, 'Ω');
          return num('Reactance of ' + qty(c, 'F') + ' at ' + qty(f, 'Hz') + '?', s.v, s.u, R8, 'X_C = 1/(2πfC) ≈ 0.159 / (' + qty(f, 'Hz') + ' × ' + qty(c, 'F') + ') = ' + fmt(s.v) + ' ' + s.u + '.');
        },
        res: function () {
          var p = pick([[1e-6, 100e-12], [10e-6, 100e-12], [100e-9, 10e-12], [1e-3, 1e-9], [1e-6, 1e-9], [10e-9, 1e-12], [100e-6, 100e-12], [1e-3, 1e-6], [10e-6, 1e-9]]), s = si(calc.f0(p[0], p[1]), 'Hz');
          return num('Resonant frequency of ' + qty(p[0], 'H') + ' with ' + qty(p[1], 'F') + '?', s.v, s.u, R8, 'f₀ = 1/(2π√(LC)) = ' + fmt(s.v) + ' ' + s.u + '. Anchor: 1 µH with 100 pF ≈ 15.9 MHz; ×100 in L·C divides f by 10.');
        },
        tau: function () {
          var r = pick([1e3, 4.7e3, 10e3, 47e3, 100e3, 1e6]), c = pick([1e-9, 10e-9, 100e-9, 1e-6, 10e-6, 100e-6]), five = rnd() < 0.4, t = r * c, s = si(five ? 5 * t : t, 's');
          return num(five ? qty(r, 'Ω') + ' with ' + qty(c, 'F') + ': time to settle (5τ)?' : 'Time constant of ' + qty(r, 'Ω') + ' with ' + qty(c, 'F') + '?', s.v, s.u, R5,
            'τ = RC = ' + qty(t, 's') + (five ? '; 5τ = ' + qty(5 * t, 's') + ', which is within 1 % of final value' : '') + '.');
        },
        bw: function () {
          var f = pick([455e3, 1e6, 7e6, 10e6, 14e6, 100e6, 433e6]), Q = pick([10, 20, 50, 100, 200]), s = si(f / Q, 'Hz');
          return num('Tuned circuit at ' + qty(f, 'Hz') + ' with Q = ' + Q + '. −3 dB bandwidth?', s.v, s.u, R5, 'Bandwidth = f₀ / Q = ' + fmt(s.v) + ' ' + s.u + '.');
        }
      }
    },
    {
      id: 'ckt', name: 'Circuit quick-math', group: 'Circuits', blurb: 'Parallel parts, dividers, cutoffs, prefixes.',
      anchors: ['Parallel resistors: product over sum; equal values halve', 'Divider: V_out = V_in · R₂/(R₁ + R₂)', 'RC cutoff: f_c ≈ 0.159 / (RC)', 'Capacitor code 104 = 10 + four zeros pF = 100 nF', 'E12: 10 12 15 18 22 27 33 39 47 56 68 82'],
      types: {
        par: function () {
          var p = pick([[10e3, 10e3], [1e3, 1e3], [100, 100], [50, 50], [3, 6], [12, 6], [75, 150], [1e3, 9e3], [2e3, 3e3], [10e3, 2.2e3], [1e3, 4.7e3], [100, 25], [300, 600], [4.7e3, 4.7e3]]);
          var r = p[0] * p[1] / (p[0] + p[1]), s = si(r, 'Ω'), k = r / s.v;
          return num(qty(p[0], 'Ω') + ' in parallel with ' + qty(p[1], 'Ω') + '?', s.v, s.u, R5, 'Product over sum: R₁R₂/(R₁ + R₂) = ' + fmt(s.v) + ' ' + s.u + '. The result is always below the smaller resistor.', [(p[0] + p[1]) / k, Math.min(p[0], p[1]) / k]);
        },
        div: function () {
          var vin = pick([3.3, 5, 9, 10, 12, 24]), p = pick([[1e3, 1e3], [2e3, 1e3], [9e3, 1e3], [3e3, 1e3], [1e3, 3e3], [4.7e3, 10e3], [10e3, 4.7e3], [10e3, 3.3e3], [1e3, 2e3]]), v = vin * p[1] / (p[0] + p[1]);
          return num(vin + ' V across ' + qty(p[0], 'Ω') + ' (top) and ' + qty(p[1], 'Ω') + ' (bottom). Output voltage?', v, 'V', R5, 'V_out = V_in · R₂/(R₁ + R₂) = ' + fmt(v) + ' V.', [vin * p[0] / (p[0] + p[1])]);
        },
        fc: function () {
          var r = pick([1e3, 1.6e3, 4.7e3, 10e3, 16e3, 100e3]), c = pick([1e-9, 10e-9, 100e-9, 1e-6]), s = si(1 / (2 * PI * r * c), 'Hz');
          return num('RC low-pass with ' + qty(r, 'Ω') + ' and ' + qty(c, 'F') + ': cutoff frequency?', s.v, s.u, R8, 'f_c = 1/(2πRC) ≈ 0.159/(RC). RC = ' + qty(r * c, 's') + ' → ' + fmt(s.v) + ' ' + s.u + '.');
        },
        pre: function () {
          var it = pick([['4700 pF in nF', 4.7, 'nF', 0], ['0.1 µF in nF', 100, 'nF', 0], ['2.2 nF in pF', 2200, 'pF', 0], ['0.047 µF in nF', 47, 'nF', 0], ['1500 kHz in MHz', 1.5, 'MHz', 0], ['0.5 mA in µA', 500, 'µA', 0],
            ['10 000 µH in mH', 10, 'mH', 0], ['0.33 µF in nF', 330, 'nF', 0], ['2.4 GHz in MHz', 2400, 'MHz', 0], ['0.25 W in mW', 250, 'mW', 0], ['33 000 Ω in kΩ', 33, 'kΩ', 0],
            ['Capacitor marked 104, in nF', 100, 'nF', 1], ['Capacitor marked 472, in nF', 4.7, 'nF', 1], ['Capacitor marked 103, in nF', 10, 'nF', 1], ['Capacitor marked 221, in pF', 220, 'pF', 1], ['Capacitor marked 105, in µF', 1, 'µF', 1]]);
          return num(it[0] + '?', it[1], it[2], { rel: 0.001 }, it[3] ? 'Three-digit code: two digits, then the number of zeros, in pF. 104 = 10 and four zeros = 100 000 pF = 100 nF.' : 'Each prefix step (p → n → µ → m → unit → k → M → G) is ×1000.',
            [it[1] * 1000, it[1] / 1000, it[1] * 10, it[1] / 10, it[1] * 100]);
        },
        e12: function () {
          var t = pick([130, 500, 6000, 250, 40, 700, 9000, 1600, 50, 3500, 14000, 160]), e = calc.e12(t);
          return mc('Nearest E12 value to ' + qty(t, 'Ω') + '?', qty(e.value, 'Ω'), e.near.map(function (v) { return qty(v, 'Ω'); }), 'E12 per decade: 10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82.');
        },
        pwr: function () {
          var p = pick([[5, 50], [12, 100], [3.3, 330], [1, 50], [10, 50], [24, 1e3], [5, 1e3], [12, 10]]), s = si(p[0] * p[0] / p[1], 'W');
          return num(p[0] + ' V across ' + qty(p[1], 'Ω') + ': power dissipated?', s.v, s.u, R5, 'P = V²/R = ' + fmt(p[0] * p[0]) + ' / ' + fmt(p[1], 4) + ' = ' + fmt(s.v) + ' ' + s.u + '.');
        },
        led: function () {
          var p = pick([[5, 2, 10e-3], [3.3, 2, 5e-3], [12, 2, 20e-3], [9, 3, 15e-3], [5, 3, 20e-3], [24, 2, 10e-3]]), r = (p[0] - p[1]) / p[2];
          return num(p[0] + ' V supply, LED drops ' + p[1] + ' V, target ' + qty(p[2], 'A') + '. Series resistor?', r, 'Ω', R5, 'R = (V_supply − V_LED)/I = ' + fmt(p[0] - p[1]) + ' V / ' + qty(p[2], 'A') + ' = ' + fmt(r, 4) + ' Ω.');
        },
        caps: function () {
          var p = pick([[10e-9, 10e-9], [100e-12, 100e-12], [1e-6, 1e-6], [22e-12, 22e-12], [10e-9, 40e-9], [3e-6, 6e-6]]), ser = rnd() < 0.5, c = ser ? p[0] * p[1] / (p[0] + p[1]) : p[0] + p[1], s = si(c, 'F'), k = c / s.v;
          return num(qty(p[0], 'F') + ' and ' + qty(p[1], 'F') + ' in ' + (ser ? 'series' : 'parallel') + '?', s.v, s.u, R5, 'Capacitors are the mirror image of resistors: parallel adds, series is product over sum.',
            [(ser ? p[0] + p[1] : p[0] * p[1] / (p[0] + p[1])) / k]);
        }
      }
    },
    {
      id: 'sdr', name: 'Sampling & SDR', group: 'DSP', blurb: 'Nyquist, IQ bandwidth, ADC range, file sizes.',
      anchors: ['Real sampling sees 0 to fs/2', 'IQ (complex) sampling sees a full fs of bandwidth', 'Ideal ADC SNR ≈ 6.02·N + 1.76 dB', 'File size = rate × bytes per sample × seconds (8-bit IQ = 2 bytes)'],
      types: {
        nyq: function () {
          var v = ri(0, 2), s;
          if (v === 0) { var b = pick([4e3, 20e3, 100e3, 1e6, 5e6]); s = si(2 * b, 'S/s'); return num('Real signal with content up to ' + qty(b, 'Hz') + ': minimum sample rate?', s.v, s.u, R5, 'Nyquist: sample at more than twice the highest frequency.', [s.v / 2]); }
          var fs = pick([250e3, 1e6, 2.4e6, 10e6, 20e6, 56e6]);
          if (v === 1) { s = si(fs, 'Hz'); return num('IQ sampling at ' + qty(fs, 'S/s') + ': how much bandwidth can you see?', s.v, s.u, R5, 'Complex samples cover −fs/2 to +fs/2, a full fs. Real samples would give only fs/2.', [s.v / 2, s.v * 2]); }
          s = si(fs / 2, 'Hz'); return num('Real sampling at ' + qty(fs, 'S/s') + ': highest frequency without aliasing?', s.v, s.u, R5, 'Real samples cover 0 to fs/2.', [s.v * 2]);
        },
        adc: function () {
          var n = pick([8, 10, 12, 14, 16, 24]);
          return num('Ideal SNR of an ADC with ' + n + ' bits (full-scale sine)?', calc.adcSnr(n), 'dB', { abs: 1 }, 'SNR ≈ 6.02·N + 1.76 dB = ' + f1(calc.adcSnr(n)) + ' dB. About 6 dB per bit.');
        },
        size: function () {
          var fs = pick([1e6, 2e6, 2.4e6, 10e6, 20e6]), fm = pick([[2, '8-bit IQ'], [4, '16-bit IQ'], [8, 'float32 IQ']]), t = pick([1, 10, 30, 60]), B = fs * fm[0] * t, gb = B >= 1e9, v = gb ? B / 1e9 : B / 1e6;
          return num('Recording ' + qty(fs, 'S/s') + ' as ' + fm[1] + ' for ' + t + ' s: file size?', v, gb ? 'GB' : 'MB', R5, fm[1] + ' is ' + fm[0] + ' bytes per sample. ' + qty(fs, 'S/s') + ' × ' + fm[0] + ' × ' + t + ' s = ' + fmt(v) + (gb ? ' GB' : ' MB') + '.');
        },
        count: function () {
          var fs = pick([48e3, 1e6, 2e6, 2.4e6, 10e6]), t = pick([1e-3, 5e-3, 10e-3, 0.1, 0.5, 2]), s = si(fs * t, 'S');
          return num(qty(fs, 'S/s') + ' for ' + qty(t, 's') + ': how many samples?', s.v, s.u, R5, 'Samples = rate × time = ' + fmt(s.v) + ' ' + s.u + '.');
        }
      }
    },
    {
      id: 'alias', name: 'Aliasing', group: 'DSP', blurb: 'Where signals land, Nyquist zones, decimation.',
      anchors: ['Alias frequency = distance to the nearest multiple of fs', 'Nyquist zones are fs/2 wide; even zones are mirrored', 'Decimate by M: rate and bandwidth both divide by M', 'Bandpass sampling needs at least 2 × bandwidth'],
      types: {
        tone: function () {
          var fs = pick([8e3, 48e3, 10e6, 20e6, 40e6, 50e6, 100e6]), k = ri(1, 3), off = pick([0.1, 0.2, 0.25, 0.3, 0.4]) * fs * pick([1, -1]), f = k * fs + off, a = calc.alias(f, fs), s = si(a, 'Hz');
          return num('A ' + qty(f, 'Hz') + ' tone sampled at ' + qty(fs, 'S/s') + ' (real). Where does it appear?', s.v, s.u, { rel: 0.03 },
            'Subtract the nearest multiple of fs: |' + qty(f, 'Hz') + ' − ' + k + ' × ' + qty(fs, 'Hz') + '| = ' + qty(a, 'Hz') + '.', [(fs / 2 - a) / (a / s.v), (fs - a) / (a / s.v)]);
        },
        zone: function () {
          var fs = pick([10e6, 20e6, 50e6, 100e6]), z = ri(1, 5), f = (z - 1) * fs / 2 + pick([0.2, 0.4, 0.5, 0.6, 0.8]) * fs / 2;
          if (rnd() < 0.5) return num(qty(f, 'Hz') + ' sampled at ' + qty(fs, 'S/s') + ': which Nyquist zone?', z, '', INT, 'Each zone is fs/2 = ' + qty(fs / 2, 'Hz') + ' wide. ' + qty(f, 'Hz') + ' / ' + qty(fs / 2, 'Hz') + ' = ' + fmt(f / (fs / 2)) + ' → zone ' + z + '.');
          return mc(qty(f, 'Hz') + ' sampled at ' + qty(fs, 'S/s') + ': does the spectrum come out inverted?', z % 2 === 0 ? 'Yes, inverted' : 'No, upright', ['Yes, inverted', 'No, upright'], 'It falls in Nyquist zone ' + z + '. Even zones come out mirrored, odd zones upright.');
        },
        dec: function () {
          var p = pick([[2.4e6, 10], [48e3, 4], [20e6, 8], [1e6, 25], [10e6, 5], [2.4e6, 50], [96e3, 2]]), s = si(p[0] / p[1], 'S/s');
          return num(qty(p[0], 'S/s') + ' decimated by ' + p[1] + ': output rate?', s.v, s.u, { rel: 0.02 }, 'Divide the rate by M. The usable bandwidth shrinks by the same factor, so filter before you drop samples.');
        },
        bp: function () {
          var B = pick([2e6, 5e6, 10e6, 20e6]), k = ri(2, 7), lo = k * B, s = si(2 * B, 'S/s');
          return num('A band from ' + qty(lo, 'Hz') + ' to ' + qty(lo + B, 'Hz') + ': minimum real sample rate with bandpass sampling?', s.v, s.u, R5,
            'Bandpass sampling needs 2 × the bandwidth, not 2 × the top frequency. This band sits on a multiple of its own width, so exactly 2B works.', [2 * (lo + B) / (2 * B / s.v), s.v / 2]);
        }
      }
    },
    {
      id: 'fft', name: 'FFT numbers', group: 'DSP', blurb: 'Bin width, bin index, resolution, capture time.',
      anchors: ['Bin width = fs / N', 'Resolution = 1 / capture time: 1 Hz needs 1 s', 'Tone at f lands in bin k = f·N / fs', 'Without fftshift, negative frequencies sit in the top half: bin N − k'],
      types: {
        binw: function () {
          var p = pick([[48e3, 1024], [1.024e6, 1024], [1e6, 1000], [2.4e6, 1024], [2.048e6, 2048], [10e6, 4096], [20e6, 1024], [8e3, 256], [1e6, 65536], [48e3, 4800]]), s = si(p[0] / p[1], 'Hz');
          return num('FFT of ' + p[1] + ' points at ' + qty(p[0], 'S/s') + ': bin width?', s.v, s.u, R5, 'Bin width = fs / N = ' + fmt(s.v) + ' ' + s.u + '.');
        },
        bin: function () {
          var p = pick([[48e3, 1024], [1e6, 1024], [2.4e6, 4096], [8e3, 256], [10e6, 2048]]), fr = pick([1 / 16, 1 / 8, 1 / 4, 3 / 8, 3 / 16]), k = p[1] * fr;
          return num('N = ' + p[1] + ', fs = ' + qty(p[0], 'S/s') + '. Which bin holds a ' + qty(p[0] * fr, 'Hz') + ' tone?', k, '', INT, 'k = f·N/fs = ' + fmt(fr, 4) + ' × ' + p[1] + ' = ' + k + '.', [k * 2, k / 2, p[1] - k]);
        },
        nres: function () {
          var p = pick([[48e3, 10], [1e6, 100], [2.4e6, 1e3], [10e6, 1e3], [8e3, 1], [1e6, 10]]);
          return num('fs = ' + qty(p[0], 'S/s') + ' and you want ' + qty(p[1], 'Hz') + ' bins. FFT length needed?', p[0] / p[1], 'points', R5, 'N = fs / Δf = ' + fmt(p[0] / p[1], 6) + '.');
        },
        tres: function () {
          var d = pick([0.1, 1, 10, 50, 100, 1e3, 25e3]), s = si(1 / d, 's');
          return num('Capture length needed for ' + qty(d, 'Hz') + ' frequency resolution?', s.v, s.u, R5, 'Resolution = 1/T, so T = ' + fmt(s.v) + ' ' + s.u + '. Zero-padding does not beat the capture time.');
        },
        neg: function () {
          var n = pick([256, 1024, 4096]), fs = pick([1e6, 2e6, 48e3]), fr = pick([1 / 16, 1 / 8, 1 / 4, 3 / 8]), k = n * fr;
          return num('IQ FFT with N = ' + n + ', fs = ' + qty(fs, 'S/s') + ', no fftshift. Which bin holds a tone at −' + qty(fs * fr, 'Hz') + '?', n - k, '', INT,
            'Negative frequencies wrap into the top half: bin N − k = ' + n + ' − ' + k + ' = ' + (n - k) + '.', [k, n / 2 - k, n / 2 + k]);
        }
      }
    },
    {
      id: 'win', name: 'Windows', group: 'DSP', blurb: 'Sidelobes, main-lobe width, which one to use.',
      anchors: ['Rectangular: −13 dB sidelobes, 2-bin main lobe', 'Hann: −31 dB, 4 bins, ENBW 1.5 bins', 'Hamming: −43 dB, 4 bins. Blackman: −58 dB, 6 bins', 'Flat-top for amplitude accuracy, Blackman–Harris for dynamic range', 'Lower sidelobes always cost a wider main lobe'],
      types: {
        sl: function () {
          var w = pick(WN);
          if (rnd() < 0.5) return mc('Highest sidelobe of the ' + w + ' window?', WIN[w].sl, WN.map(function (n) { return WIN[n].sl; }), WINX);
          return mc('Which window has its highest sidelobe near ' + WIN[w].sl + '?', w, WN, WINX);
        },
        ml: function () {
          var w = pick(['Rectangular', 'Hann', 'Blackman']);
          return mc('Main-lobe width (null to null) of the ' + w + ' window?', WIN[w].ml, ['2 bins', '4 bins', '6 bins', '8 bins'], 'Rectangular 2 bins, Hann and Hamming 4 bins, Blackman 6 bins.');
        },
        enbw: function () {
          var w = pick(WN);
          return mc('Equivalent noise bandwidth of the ' + w + ' window?', WIN[w].enbw, WN.map(function (n) { return WIN[n].enbw; }), 'ENBW: rectangular 1.00, Hamming 1.36, Hann 1.50, Blackman 1.73 bins. A wider ENBW lets in more noise per bin.');
        },
        use: function () {
          var o = ['Rectangular', 'Hann', 'Flat-top', 'Blackman–Harris'];
          return item([
            ['You need sidelobes below −90 dB to see a very weak signal near a strong one. Which window?', 'Blackman–Harris', o, 'The 4-term Blackman–Harris reaches about −92 dB sidelobes, at the cost of an 8-bin main lobe.'],
            ['Two equal-strength tones are very close together. Which window separates them best?', 'Rectangular', o, 'Rectangular has the narrowest main lobe (2 bins), so the best raw resolution. Its poor sidelobes do not matter for equal tones.'],
            ['You want the amplitude of a tone that may fall between bins. Which window?', 'Flat-top', o, 'Flat-top windows have almost no scalloping loss, so the peak reads true wherever the tone falls.'],
            ['The capture holds an exact whole number of cycles. Which window gives no leakage?', 'Rectangular', o, 'With a whole number of cycles the tone sits exactly on a bin and the rectangular window leaks nothing.'],
            ['General-purpose spectrum viewing with a good balance of resolution and leakage. Which window?', 'Hann', o, 'Hann is the usual default: −31 dB first sidelobe, fast roll-off, 4-bin main lobe.']
          ]);
        },
        misc: function () {
          return item([
            ['Worst-case scalloping loss of a rectangular window', '3.9 dB', ['0.1 dB', '1.4 dB', '6 dB'], 'A tone halfway between bins reads 3.9 dB low with a rectangular window, 1.4 dB low with Hann.'],
            ['Worst-case scalloping loss of a Hann window', '1.4 dB', ['0.1 dB', '3.9 dB', '6 dB'], 'A tone halfway between bins reads 3.9 dB low with a rectangular window, 1.4 dB low with Hann.'],
            ['Coherent gain of a Hann window (amplitude of an on-bin tone)', '0.5 (−6 dB)', ['1.0 (0 dB)', '0.71 (−3 dB)', '0.25 (−12 dB)'], 'The Hann window averages to 0.5, so tone amplitudes read 6 dB low unless you correct for it.'],
            ['Sidelobes of a Hann window fall off at', '18 dB per octave', ['6 dB per octave', '12 dB per octave', 'They stay flat'], 'Hann sidelobes roll off at 18 dB per octave; rectangular and Hamming at only 6 dB per octave.'],
            ['Sidelobes of a rectangular window fall off at', '6 dB per octave', ['18 dB per octave', '12 dB per octave', 'They stay flat'], 'Hann sidelobes roll off at 18 dB per octave; rectangular and Hamming at only 6 dB per octave.']
          ]);
        }
      }
    },
    {
      id: 'xform', name: 'Transform pairs', group: 'DSP', blurb: 'Fourier pairs and properties at a glance.',
      anchors: ['Rectangle ↔ sinc; Gaussian ↔ Gaussian', 'Impulse ↔ flat; constant ↔ impulse at 0', 'Delay ↔ phase ramp; frequency shift ↔ multiply by e^(j2πf₀t)', 'Convolution ↔ multiplication', 'Narrow in time ↔ wide in frequency; first null of a pulse of width T is at 1/T'],
      types: {
        pair: function () {
          var P = [['a rectangular pulse', 'A sinc'], ['a sinc', 'A rectangle (brick-wall band)'], ['an impulse δ(t)', 'A flat, constant spectrum'], ['a constant (DC)', 'An impulse at f = 0'],
            ['cos(2πf₀t)', 'Two impulses at ±f₀'], ['e^(j2πf₀t)', 'One impulse at +f₀'], ['a Gaussian pulse', 'A Gaussian'], ['an impulse train with period T', 'An impulse train with spacing 1/T'], ['a triangular pulse', 'A sinc²']];
          var p = pick(P);
          return mc('The Fourier transform of ' + p[0] + ' is', p[1], P.map(function (x) { return x[1]; }), 'Worth knowing cold: rectangle ↔ sinc, impulse ↔ flat, cosine ↔ a pair of impulses, Gaussian ↔ Gaussian, triangle ↔ sinc².');
        },
        prop: function () {
          var P = [['Delaying a signal in time does what to its spectrum?', 'Adds a linear phase ramp; magnitude unchanged'], ['Multiplying a signal by e^(j2πf₀t) does what to its spectrum?', 'Shifts it by f₀'],
            ['Convolving two signals in time does what in frequency?', 'Multiplies their spectra'], ['Multiplying two signals in time does what in frequency?', 'Convolves their spectra'],
            ['Compressing a signal in time does what to its spectrum?', 'Stretches it wider'], ['Differentiating a signal does what to its spectrum?', 'Multiplies it by j2πf'],
            ['Sampling a signal every T seconds does what to its spectrum?', 'Repeats it every 1/T'], ['The spectrum of a real-valued signal is always', 'Conjugate-symmetric about f = 0'],
            ['Conjugating a signal does what to its spectrum?', 'Mirrors it about f = 0']];
          var p = pick(P);
          return mc(p[0], p[1], P.map(function (x) { return x[1]; }), 'Each operation in one domain has a partner in the other: delay ↔ phase ramp, shift ↔ modulation, convolution ↔ multiplication, sampling ↔ periodic repetition.');
        },
        shorter: function () {
          var k = pick([2, 4, 5, 10, 100]);
          return num('A pulse is made ' + k + ' times shorter. Its bandwidth multiplies by?', k, '×', R5, 'Time and bandwidth trade one for one: ' + k + '× shorter means ' + k + '× wider.', [1 / k, k * k, Math.sqrt(k)]);
        },
        nul: function () {
          var t = pick([0.5e-6, 1e-6, 10e-6, 100e-6, 1e-3, 20e-3]), s = si(1 / t, 'Hz');
          return num('A rectangular pulse ' + qty(t, 's') + ' wide: first spectral null at?', s.v, s.u, R5, 'The sinc spectrum of a pulse of width T has its first null at 1/T = ' + fmt(s.v) + ' ' + s.u + '.', [s.v / 2, s.v * 2]);
        },
        phase: function () {
          var p = pick([[1e-3, 250, 90], [1e-6, 500e3, 180], [10e-9, 25e6, 90], [1e-3, 100, 36], [2e-6, 125e3, 90], [1e-6, 250e3, 90], [1e-9, 100e6, 36], [5e-9, 100e6, 180]]);
          return num('A delay of ' + qty(p[0], 's') + ' shifts a ' + qty(p[1], 'Hz') + ' component by how many degrees?', p[2], '°', { abs: 2 }, 'Phase = 360° × f × τ = 360 × ' + fmt(p[0] * p[1]) + ' = ' + p[2] + '° (lagging).', [p[2] * 2, p[2] / 2, 360 - p[2]]);
        }
      }
    },
    {
      id: 'iq', name: 'Complex & IQ', group: 'DSP', blurb: 'Magnitude, phase, rotation, frequency offset.',
      anchors: ['|I + jQ| = √(I² + Q²); phase = atan2(Q, I)', 'cos 60° = 0.5, cos 45° = 0.707, cos 30° = 0.866', 'Multiplying by j rotates 90° counter-clockwise: (I, Q) → (−Q, I)', 'Positive frequency offset rotates the constellation counter-clockwise', 'Offset = (phase step per sample / 360°) × fs'],
      types: {
        mag: function () {
          var p = pick([[3, 4], [4, 3], [1, 1], [6, 8], [5, 12], [1, -1], [0, 2], [-3, 4], [2, 2], [8, 15], [1, 2]]), a = Math.hypot(p[0], p[1]);
          return num('Magnitude of ' + cx(p[0], p[1]) + '?', a, '', R5, '|z| = √(I² + Q²) = ' + fmt(a) + '. Keep 3-4-5 and 5-12-13 in mind; 1 + j is √2 ≈ 1.41.', [Math.abs(p[0]) + Math.abs(p[1]), p[0] * p[0] + p[1] * p[1]]);
        },
        ph: function () {
          var p = pick([[1, 1, 45], [0, 2, 90], [-1, 0, 180], [1, -1, -45], [1, 1.732, 60], [1.732, 1, 30], [-1, 1, 135], [-1, -1, -135], [0, -1, -90], [-1, 1.732, 120]]);
          return num('Phase of ' + cx(p[0], p[1]) + ' in degrees?', p[2], '°', { abs: 2, wrap: 360 }, 'Angle = atan2(Q, I). Find the quadrant first, then the 30/45/60° triangle: ' + p[2] + '°.', [-p[2], 180 - p[2], p[2] + 90, p[2] - 90, p[2] + 180]);
        },
        p2r: function () {
          var p = pick([[2, 60], [1, 45], [2, 30], [4, 90], [1, 180], [2, -90], [1, 120], [2, 135], [10, 60], [2, -45]]), I = Math.round(p[0] * Math.cos(p[1] * PI / 180) * 1e6) / 1e6, Qv = Math.round(p[0] * Math.sin(p[1] * PI / 180) * 1e6) / 1e6, isI = rnd() < 0.5;
          return num(p[0] + '∠' + sg(p[1]) + '°: the ' + (isI ? 'real (I)' : 'imaginary (Q)') + ' part?', isI ? I : Qv, '', { abs: 0.06, rel: 0.02 },
            'I = r·cos θ = ' + f2(I) + ', Q = r·sin θ = ' + f2(Qv) + '. cos 60° = 0.5, cos 45° = 0.707, cos 30° = 0.866.', [isI ? Qv : I, isI ? -I : -Qv, p[0], -p[0]]);
        },
        mulj: function () {
          var p = pick([[3, 4], [1, 2], [2, -1], [-1, 1], [5, 0], [0, 3], [2, 5]]), k = pick([1, 1, 2, 3]), re = p[0], im = p[1], t;
          for (var i = 0; i < k; i++) { t = re; re = -im; im = t; }
          var isRe = rnd() < 0.5, v = isRe ? re : im;
          return num('(' + cx(p[0], p[1]) + ') × ' + ['', 'j', 'j²', 'j³'][k] + ': the ' + (isRe ? 'real' : 'imaginary') + ' part?', v, '', INT,
            'Each multiplication by j rotates 90° counter-clockwise: (I, Q) → (−Q, I).' + (k > 1 ? ' Do it ' + k + ' times.' : '') + ' Result: ' + cx(re, im) + '.', [isRe ? im : re, -v, p[0], p[1], -p[0], -p[1]], { neg: true });
        },
        rot: function () {
          var deg = pick([1.8, 3.6, 18, 36, 45, 90, -36, -90]), fs = pick([10e3, 48e3, 250e3, 1e6, 2.4e6]), f = deg / 360 * fs, s = si(Math.abs(f), 'Hz'), v = f < 0 ? -s.v : s.v;
          return num('Phase advances ' + sg(deg) + '° per sample at ' + qty(fs, 'S/s') + '. Frequency offset?', v, s.u, R5, 'f = (Δφ / 360°) × fs = ' + fmt(deg / 360, 3) + ' × ' + qty(fs, 'Hz') + ' = ' + fmt(v) + ' ' + s.u + '.', [-v]);
        },
        magdb: function () {
          var p = pick([[1, 1], [3, 4], [10, 0], [0.5, 0], [0.1, 0], [6, 8], [2, 0], [0, 100]]), a = calc.db20(Math.hypot(p[0], p[1]));
          return num('Magnitude of ' + cx(p[0], p[1]) + ' in dB (20·log)?', a, 'dB', DB, '|z| = ' + fmt(Math.hypot(p[0], p[1])) + ' → 20·log = ' + f1(a) + ' dB.');
        },
        facts: function () {
          return item([
            ['A positive frequency offset makes the IQ constellation rotate', 'counter-clockwise', ['clockwise', 'not at all', 'back and forth'], 'e^(j2πft) with f > 0 advances the phase, which is counter-clockwise on the IQ plane.'],
            ['Swapping I and Q does what to the spectrum?', 'Mirrors it about the centre', ['Nothing', 'Shifts it by fs/4', 'Doubles its width'], 'Swapping I and Q flips the sign of every frequency, so the spectrum mirrors left to right.'],
            ['Conjugating IQ samples does what to the spectrum?', 'Mirrors it about the centre', ['Nothing', 'Shifts it by fs/2', 'Removes the negative half'], 'Conjugation negates the phase rotation, so positive frequencies become negative.'],
            ['e^(jπ) =', '−1', ['1', 'j', '−j'], 'Half a turn around the unit circle lands on −1.'],
            ['e^(jπ/2) =', 'j', ['−1', '1', '−j'], 'A quarter turn counter-clockwise lands on j.'],
            ['e^(−jπ/2) =', '−j', ['j', '−1', '1'], 'A quarter turn clockwise lands on −j.'],
            ['Multiplying samples by (−1)ⁿ shifts the spectrum by', 'fs/2', ['fs/4', 'fs/8', 'nothing'], '(−1)ⁿ = e^(jπn), a rotation of half a turn per sample, which is fs/2.'],
            ['Multiplying samples by jⁿ shifts the spectrum by', 'fs/4', ['fs/2', 'fs/8', 'nothing'], 'jⁿ = e^(jπn/2), a quarter turn per sample, which is fs/4.']
          ]);
        }
      }
    },
    {
      id: 'dfreq', name: 'Digital frequency', group: 'DSP', blurb: 'Hz, radians per sample, samples per cycle.',
      anchors: ['ω = 2π·f/fs radians per sample', 'fs/2 ↔ π, fs/4 ↔ π/2', 'Samples per cycle = fs / f'],
      types: {
        w: function () {
          var p = pick([[12e3, 48e3], [6e3, 48e3], [24e3, 48e3], [4.8e3, 48e3], [100e3, 1e6], [250e3, 1e6], [125e3, 1e6], [1e3, 8e3], [2e3, 8e3], [800, 8e3]]), x = 2 * p[0] / p[1];
          return num(qty(p[0], 'Hz') + ' at fs = ' + qty(p[1], 'S/s') + ': ω is how many π rad/sample?', x, 'π', { abs: 0.02 }, 'ω = 2π·f/fs = 2 × ' + fmt(p[0] / p[1]) + ' × π = ' + fmt(x) + 'π. Nyquist (fs/2) is π.', [x / 2, x * 2, x * 4, x / 4, 1 - x], { pos: true });
        },
        w2f: function () {
          var x = pick([0.1, 0.2, 0.25, 0.5, 0.75, 1]), fs = pick([8e3, 48e3, 1e6, 2.4e6]), s = si(x * fs / 2, 'Hz');
          return num('ω = ' + x + 'π rad/sample at fs = ' + qty(fs, 'S/s') + ': frequency?', s.v, s.u, R5, 'π rad/sample is fs/2, so f = ' + x + ' × ' + qty(fs / 2, 'Hz') + ' = ' + fmt(s.v) + ' ' + s.u + '.', [s.v * 2]);
        },
        spc: function () {
          var p = pick([[1e3, 48e3], [2.4e3, 48e3], [100e3, 1e6], [1e3, 8e3], [50e3, 2e6], [60, 48e3], [250e3, 1e6]]);
          return num('Samples per cycle of a ' + qty(p[0], 'Hz') + ' tone at ' + qty(p[1], 'S/s') + '?', p[1] / p[0], 'samples', R5, 'Samples per cycle = fs / f = ' + fmt(p[1] / p[0], 4) + '.');
        },
        per: function () {
          var n = pick([4, 8, 10, 20, 48, 100]), fs = pick([8e3, 48e3, 1e6]), s = si(fs / n, 'Hz');
          return num('A tone repeats every ' + n + ' samples at ' + qty(fs, 'S/s') + '. Its frequency?', s.v, s.u, R5, 'f = fs / (samples per cycle) = ' + fmt(s.v) + ' ' + s.u + '.');
        }
      }
    },
    {
      id: 'filt', name: 'Filters', group: 'DSP', blurb: 'FIR delay, moving averages, taps, poles and zeros.',
      anchors: ['Linear-phase FIR delay = (N − 1)/2 samples', 'N-point moving average: nulls at multiples of fs/N', 'Taps ≈ (fs/Δf) × (attenuation dB / 22)', 'Convolution output length = N + M − 1', 'Unit circle angle is frequency: 0° = DC, 180° = fs/2; poles outside are unstable'],
      types: {
        gd: function () {
          var n = pick([11, 21, 31, 51, 63, 101, 127, 201]), d = (n - 1) / 2;
          if (rnd() < 0.5) return num('Group delay of a linear-phase FIR with ' + n + ' taps, in samples?', d, 'samples', INT, 'Delay = (N − 1)/2 = ' + d + ' samples, the same at every frequency.', [n, n - 1, (n + 1) / 2]);
          var fs = pick([1e3, 10e3, 48e3, 100e3, 1e6]), s = si(d / fs, 's');
          return num('Linear-phase FIR with ' + n + ' taps at ' + qty(fs, 'S/s') + ': delay?', s.v, s.u, R5, '(N − 1)/2 = ' + d + ' samples, each ' + qty(1 / fs, 's') + ' long: ' + fmt(s.v) + ' ' + s.u + '.', [s.v * 2]);
        },
        manull: function () {
          var fs = pick([1e3, 8e3, 48e3, 100e3, 1e6]), n = pick([4, 5, 8, 10, 16, 20, 50, 100]), s = si(fs / n, 'Hz');
          return num(n + '-point moving average at ' + qty(fs, 'S/s') + ': first null at?', s.v, s.u, R5, 'Nulls sit at multiples of fs/N: any tone with a whole number of cycles in the window averages to zero.', [s.v / 2, s.v * 2]);
        },
        taps: function () {
          var ratio = pick([10, 20, 25, 50, 100]), A = pick([44, 60, 66, 80, 88]), fs = pick([48e3, 1e6]), n = ratio * A / 22;
          return num('FIR low-pass at fs = ' + qty(fs, 'S/s') + ', transition width ' + qty(fs / ratio, 'Hz') + ', ' + A + ' dB stopband. Rough tap count?', n, 'taps', { rel: 0.15 },
            'Rule of thumb: N ≈ (fs/Δf) × (A/22) = ' + ratio + ' × ' + fmt(A / 22) + ' ≈ ' + Math.round(n) + '.');
        },
        conv: function () {
          var n = pick([8, 16, 64, 100, 256, 1024]), m = pick([3, 5, 11, 32, 51, 101]);
          return num('Convolving ' + n + ' samples with a ' + m + '-tap filter gives how many output samples?', n + m - 1, 'samples', INT, 'Full convolution length = N + M − 1 = ' + (n + m - 1) + '.', [n + m, n - m + 1, n * m]);
        },
        pz: function () {
          var P = [['A single pole at z = 0.9 gives', 'A low-pass'], ['A single pole at z = −0.9 gives', 'A high-pass'], ['Poles at z = ±0.95j give', 'A band-pass centred on fs/4'], ['A pole at z = 1.1 gives', 'An unstable filter'],
            ['A zero at z = 1 gives', 'A null at DC'], ['A zero at z = −1 gives', 'A null at fs/2'], ['Zeros on the unit circle at ±60° give', 'A notch at fs/6'], ['All poles at the origin means', 'An FIR filter, always stable']];
          var p = pick(P);
          return mc(p[0], p[1], P.map(function (x) { return x[1]; }), 'Angle on the unit circle is frequency: 0° is DC, 180° is fs/2. Poles boost nearby frequencies, zeros cut them, and any pole outside the circle is unstable.');
        },
        ang: function () {
          var th = pick([18, 30, 45, 60, 90, 120]), fs = pick([8e3, 10e3, 48e3, 1e6]), s = si(th / 360 * fs, 'Hz');
          return num('A pole pair at ±' + th + '° with fs = ' + qty(fs, 'S/s') + ': which frequency does it boost?', s.v, s.u, R5, 'f = (θ / 360°) × fs = ' + fmt(s.v) + ' ' + s.u + '.', [s.v * 2]);
        },
        tc: function () {
          var a = pick([0.9, 0.95, 0.98, 0.99, 0.999]);
          return num('y[n] = (1 − a)·x[n] + a·y[n−1] with a = ' + a + ': time constant in samples?', 1 / (1 - a), 'samples', R10, 'Time constant ≈ 1/(1 − a) = ' + fmt(1 / (1 - a), 4) + ' samples.');
        }
      }
    },
    {
      id: 'mod', name: 'Modulation & capacity', group: 'DSP', blurb: 'Bits per symbol, bandwidth, Eb/N0, Shannon, OFDM.',
      anchors: ['Bits per symbol = log₂(M): QPSK 2, 16-QAM 4, 64-QAM 6, 256-QAM 8', 'Occupied bandwidth = Rs·(1 + α)', 'Es/N0 = Eb/N0 + 10·log(bits per symbol)', 'Shannon: C = B·log₂(1 + SNR) ≈ B × SNR(dB)/3 at high SNR', 'OFDM: spacing = fs/N, useful symbol = N/fs'],
      types: {
        bps: function () {
          var m = pick(MODS);
          return num('Bits per symbol for ' + m[1] + '?', Math.log2(m[0]), 'bits', INT, 'Bits per symbol = log₂(' + m[0] + ') = ' + Math.log2(m[0]) + '.');
        },
        rate: function (L) {
          var rs = pick([2.4e3, 9.6e3, 250e3, 1e6, 5e6, 27.5e6, 30e6]), m = pick(MODS), k = Math.log2(m[0]), cr = (L >= 2 && rnd() < 0.5) ? pick([[1 / 2, '1/2'], [2 / 3, '2/3'], [3 / 4, '3/4']]) : null, s = si(rs * k * (cr ? cr[0] : 1), 'b/s');
          return num(qty(rs, 'Bd') + ' ' + m[1] + (cr ? ', code rate ' + cr[1] : '') + ': ' + (cr ? 'net ' : '') + 'bit rate?', s.v, s.u, R5,
            'Symbol rate × bits per symbol' + (cr ? ' × code rate' : '') + ' = ' + qty(rs, 'Bd') + ' × ' + k + (cr ? ' × ' + cr[1] : '') + ' = ' + fmt(s.v) + ' ' + s.u + '.');
        },
        obw: function () {
          var rs = pick([250e3, 1e6, 2e6, 5e6, 10e6, 27.5e6, 30e6]), a = pick([0.05, 0.2, 0.25, 0.35, 0.5, 1]), s = si(rs * (1 + a), 'Hz');
          return num(qty(rs, 'Bd') + ' with roll-off α = ' + a + ': occupied bandwidth?', s.v, s.u, R5, 'B = Rs·(1 + α) = ' + fmt(s.v) + ' ' + s.u + '.');
        },
        rsmax: function () {
          var p = pick([[36e6, 0.2], [1.25e6, 0.25], [6e6, 0.2], [200e3, 0.25], [54e6, 0.35], [27e6, 0.35]]), s = si(p[0] / (1 + p[1]), 'Bd');
          return num('Channel ' + qty(p[0], 'Hz') + ' wide, roll-off α = ' + p[1] + ': maximum symbol rate?', s.v, s.u, R5, 'Rs = B / (1 + α) = ' + fmt(s.v) + ' ' + s.u + '.');
        },
        esn0: function () {
          var m = pick(MODS.slice(0, 6)), eb = pick([4, 6, 8, 10, 12]), k = Math.log2(m[0]), a = eb + calc.db10(k);
          return num('Eb/N0 = ' + eb + ' dB with uncoded ' + m[1] + ': Es/N0?', a, 'dB', DB, 'Es/N0 = Eb/N0 + 10·log(bits per symbol) = ' + eb + ' + ' + f1(calc.db10(k)) + ' = ' + f1(a) + ' dB. That is also the SNR in a bandwidth equal to the symbol rate.');
        },
        shan: function () {
          var b = pick([3e3, 200e3, 1e6, 20e6, 240e6]), snr = pick([0, 3, 10, 15, 20, 30]), c = calc.shannon(b, snr), s = si(c, 'b/s');
          return num('Shannon capacity of ' + qty(b, 'Hz') + ' at ' + snr + ' dB SNR?', s.v, s.u, R8, 'C = B·log₂(1 + SNR) = ' + qty(b, 'Hz') + ' × ' + fmt(c / b) + ' b/s/Hz. At high SNR the efficiency is about SNR(dB)/3.');
        },
        ofdm: function () {
          var p = pick([[20e6, 64], [30.72e6, 2048], [10e6, 1024], [1.92e6, 128], [240e6, 1024], [40e6, 128]]), kind = ri(0, 2), s, X = ' Spacing = fs/N; useful symbol time = N/fs; a cyclic prefix adds its fraction on top.';
          if (kind === 0) { s = si(p[0] / p[1], 'Hz'); return num('OFDM at ' + qty(p[0], 'S/s') + ' with a ' + p[1] + '-point FFT: subcarrier spacing?', s.v, s.u, R5, 'fs/N = ' + fmt(s.v) + ' ' + s.u + '.' + X); }
          if (kind === 1) { s = si(p[1] / p[0], 's'); return num('OFDM at ' + qty(p[0], 'S/s') + ' with a ' + p[1] + '-point FFT: useful symbol duration?', s.v, s.u, R5, 'N/fs = ' + fmt(s.v) + ' ' + s.u + '.' + X); }
          var cp = pick([[1 / 4, '1/4'], [1 / 8, '1/8'], [1 / 16, '1/16']]); s = si(p[1] / p[0] * (1 + cp[0]), 's');
          return num('OFDM at ' + qty(p[0], 'S/s') + ', ' + p[1] + '-point FFT, cyclic prefix ' + cp[1] + ': total symbol duration?', s.v, s.u, R5, 'N/fs = ' + qty(p[1] / p[0], 's') + ', times (1 + ' + cp[1] + ') = ' + fmt(s.v) + ' ' + s.u + '.' + X);
        }
      }
    },
    {
      id: 'pg', name: 'Processing gain', group: 'DSP', blurb: 'Averaging, pulse compression, range resolution.',
      anchors: ['Averaging N: SNR gain 10·log(N), noise std ÷ √N', 'FFT of N points lifts a tone 10·log(N) above per-bin noise', 'Range resolution = c/(2B): 150 m per MHz', 'Pulse compression gain = time × bandwidth', 'Spreading gain = chip rate / bit rate'],
      types: {
        avg: function () {
          var n = pick([2, 4, 8, 10, 16, 64, 100, 1000, 1024]), a = calc.db10(n);
          return num('Coherently averaging ' + n + ' captures improves SNR by?', a, 'dB', DB, 'Gain = 10·log(' + n + ') = ' + f1(a) + ' dB. ×2 = 3 dB, ×10 = 10 dB.', [calc.db20(n)]);
        },
        navg: function () {
          var g = pick([3, 6, 10, 13, 20, 30]);
          return num('How many averages for ' + g + ' dB of SNR gain?', calc.lin10(g), 'averages', R8, 'N = 10^(dB/10) = ' + fmt(calc.lin10(g)) + '.', [calc.lin20(g)]);
        },
        std: function () {
          var n = pick([4, 16, 25, 100, 400, 10000]);
          return num('Averaging ' + n + ' measurements cuts the noise standard deviation by what factor?', Math.sqrt(n), '×', R5, 'Standard deviation falls as √N = ' + Math.sqrt(n) + '. Noise power falls as N.', [n]);
        },
        rres: function () {
          var b = pick([1e6, 5e6, 10e6, 20e6, 100e6, 150e6, 500e6, 1e9]), u = lenU(1.5e8 / b);
          return num('Radar bandwidth ' + qty(b, 'Hz') + ': range resolution?', u.v, u.u, R5, 'ΔR = c/(2B): 150 m for 1 MHz, 1.5 m for 100 MHz.', [u.v * 2]);
        },
        pc: function () {
          var p = pick([[10e-6, 10e6], [100e-6, 1e6], [1e-3, 1e6], [20e-6, 5e6], [1e-6, 100e6], [100e-6, 10e6], [50e-6, 2e6], [10e-6, 1e6]]), a = calc.db10(p[0] * p[1]);
          return num('A chirp ' + qty(p[0], 's') + ' long sweeping ' + qty(p[1], 'Hz') + ': pulse-compression gain?', a, 'dB', DB, 'Gain = time × bandwidth = ' + fmt(p[0] * p[1]) + ' → ' + f1(a) + ' dB.');
        },
        fftg: function () {
          var n = pick([256, 1024, 4096, 16384, 65536]), a = calc.db10(n);
          return num('A tone in white noise: how far does a ' + n + '-point FFT lift it above the per-bin noise?', a, 'dB', { abs: 0.7 }, 'Processing gain = 10·log(N) = ' + f1(a) + ' dB. 1024 points is about 30 dB.');
        },
        ss: function () {
          var p = pick([[1.023e6, 50, 'GPS C/A code: 1.023 Mchip/s carrying 50 b/s'], [1e6, 1e3, '1 Mchip/s carrying 1 kb/s'], [11e6, 1e6, '11 Mchip/s carrying 1 Mb/s'], [10e6, 10e3, '10 Mchip/s carrying 10 kb/s']]), a = calc.db10(p[0] / p[1]);
          return num(p[2] + '. Spreading gain?', a, 'dB', DB, 'Gain = 10·log(chip rate / bit rate) = 10·log(' + fmt(p[0] / p[1], 5) + ') = ' + f1(a) + ' dB.');
        }
      }
    },
    {
      id: 'quant', name: 'Quantisation', group: 'DSP', blurb: 'Bits, dBFS, LSB size, fixed point.',
      anchors: ['About 6 dB of dynamic range per bit', 'dBFS = 20·log(amplitude / full scale); half scale = −6 dBFS', 'LSB = full scale / 2^N; 2¹⁰ = 1024, 2¹⁶ = 65536', 'ENOB = (SINAD − 1.76)/6.02', 'Summing K values adds log₂(K) bits; multiplying adds the widths'],
      types: {
        lev: function () {
          var n = pick([8, 10, 12, 14, 16]);
          return num('Number of levels in ' + n + '-bit quantisation?', Math.pow(2, n), '', { rel: 0.03 }, '2^' + n + ' = ' + Math.pow(2, n) + '. Start from 2¹⁰ = 1024 and double.', [Math.pow(2, n - 1), Math.pow(2, n + 1), Math.pow(2, n) / 4]);
        },
        bits: function () {
          var dr = pick([48, 60, 72, 84, 96, 120]);
          return num('Bits needed for ' + dr + ' dB of dynamic range?', dr / 6.02, 'bits', { abs: 0.5 }, 'About 6 dB per bit: ' + dr + ' / 6 ≈ ' + Math.round(dr / 6.02) + ' bits.', null, { pos: true });
        },
        dbfs: function () {
          if (rnd() < 0.5) {
            var p = pick([[0.5, 'half'], [0.25, 'a quarter'], [0.1, 'a tenth'], [0.707, '0.707'], [0.01, 'one hundredth'], [0.125, 'an eighth']]), a = calc.db20(p[0]);
            return num('A signal at ' + p[1] + ' of full scale is at?', a, 'dBFS', DB, 'dBFS = 20·log(amplitude / full scale) = ' + f1(a) + '. Each halving is −6 dB, each ÷10 is −20 dB.', [calc.db10(p[0]), -a]);
          }
          var pk = pick([16384, 8192, 3277, 1024, 328]), b = calc.db20(pk / 32768);
          return num('Peak sample value ' + pk + ' in signed 16-bit data: level?', b, 'dBFS', DB, 'Full scale is 32768. ' + pk + ' / 32768 = ' + fmt(pk / 32768) + ' → ' + f1(b) + ' dBFS.', [-b]);
        },
        lsb: function () {
          var p = pick([[1, 10], [3.3, 12], [2, 8], [5, 10], [2, 16], [3.3, 10], [1, 12]]), s = si(p[0] / Math.pow(2, p[1]), 'V');
          return num(p[0] + ' V full scale, ' + p[1] + ' bits: size of one LSB?', s.v, s.u, R8, 'LSB = V_FS / 2^N = ' + p[0] + ' V / ' + Math.pow(2, p[1]) + ' = ' + fmt(s.v) + ' ' + s.u + '.');
        },
        enob: function () {
          var sd = pick([50, 56, 62, 68, 74, 86]), a = (sd - 1.76) / 6.02;
          return num('Measured SINAD of ' + sd + ' dB: effective number of bits?', a, 'bits', { abs: 0.3 }, 'ENOB = (SINAD − 1.76)/6.02 = ' + f1(a) + ' bits.', null, { pos: true });
        },
        grow: function () {
          if (rnd() < 0.5) { var p = pick([[64, 12], [16, 8], [256, 16], [4, 10], [1024, 12]]); return num('Summing ' + p[0] + ' samples of ' + p[1] + '-bit data: bits needed for the result?', p[1] + Math.log2(p[0]), 'bits', INT, 'Each doubling of the count adds one bit: ' + p[1] + ' + log₂(' + p[0] + ') = ' + (p[1] + Math.log2(p[0])) + '.', [2 * p[1], p[1] + 1]); }
          var n = pick([8, 12, 16, 24]);
          return num('Width of the product of two ' + n + '-bit numbers?', 2 * n, 'bits', INT, 'Multiplying adds the widths: ' + n + ' + ' + n + ' = ' + (2 * n) + ' bits.', [n + 1, n, n * n]);
        },
        qfmt: function () {
          return item([
            ['Step size of Q1.15 fixed point', '2⁻¹⁵', ['2⁻¹⁶', '2⁻⁷', '2⁻³¹'], 'Q1.15 has 15 fractional bits, so one step is 2⁻¹⁵, about 0.00003.'],
            ['Range of Q1.15 fixed point', '−1 to just under +1', ['0 to 1', '−0.5 to +0.5', '−2 to +2'], 'One sign bit and 15 fractional bits: −1 up to 1 − 2⁻¹⁵.'],
            ['Largest value of a signed 16-bit integer', '32767', ['32768', '65535', '65536'], 'Signed 16-bit runs from −32768 to +32767.'],
            ['Range of a signed 8-bit integer', '−128 to 127', ['−127 to 127', '0 to 255', '−256 to 255'], 'Two\'s complement has one more negative value than positive.'],
            ['Largest value of an unsigned 12-bit number', '4095', ['4096', '2047', '1023'], '2¹² − 1 = 4095.'],
            ['Fractional bits in Q4.12', '12', ['4', '16', '8'], 'Qm.n has m integer bits (including sign) and n fractional bits.']
          ]);
        }
      }
    }
  ];

  var GROUPS = ['RF', 'DSP', 'Circuits'];
  var BY_ID = {};
  MODULES.forEach(function (m) { BY_ID[m.id] = m; });

  /* ---------- selection ---------- */
  function typeIds(mod, L) { return Object.keys(mod.types).filter(function (id) { return (mod.types[id].min || 1) <= L; }); }
  function generate(modId, typeId, L) {
    var mod = BY_ID[modId], q = mod.types[typeId](L || 1);
    q.mod = modId; q.key = modId + '.' + typeId;
    return q;
  }
  function moduleLevel(mod, stats) {
    var c = 0;
    Object.keys(mod.types).forEach(function (id) { var s = stats[mod.id + '.' + id]; if (s) c += s.c; });
    return c < 12 ? 1 : c < 35 ? 2 : 3;
  }
  function mastery(mod, stats) {
    var ids = Object.keys(mod.types), t = 0;
    ids.forEach(function (id) { var s = stats[mod.id + '.' + id]; if (s) t += Math.min(s.c, 5) / 5 * (s.c / Math.max(s.n, 1)); });
    return t / ids.length;
  }
  function pickType(mod, stats, last) {
    var L = moduleLevel(mod, stats), ids = typeIds(mod, L), w = ids.map(function (id) {
      var key = mod.id + '.' + id, s = stats[key];
      if (key === last && ids.length > 1) return 0;
      if (!s || !s.n) return 3;
      return 1 + 3 * (1 - (s.c + 1) / (s.n + 2));
    });
    var tot = w.reduce(function (a, b) { return a + b; }, 0), r = rnd() * tot;
    for (var i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) return generate(mod.id, ids[i], L); }
    return generate(mod.id, ids[ids.length - 1], L);
  }
  function pickAny(stats, last, modIds) {
    var mods = modIds && modIds.length ? modIds.map(function (id) { return BY_ID[id]; }) : MODULES;
    var w = mods.map(function (m) { return 1.5 - mastery(m, stats); }), tot = w.reduce(function (a, b) { return a + b; }, 0), r = rnd() * tot;
    for (var i = 0; i < mods.length; i++) { r -= w[i]; if (r <= 0) return pickType(mods[i], stats, last); }
    return pickType(mods[mods.length - 1], stats, last);
  }

  /* ---------- scenarios: one real case, several chained steps ---------- */
  function step(mod, q) { q.mod = mod; q.key = 'scenario'; return q; }
  var SCENARIOS = [
    function () {
      var w = pick([125, 250, 500]), d = pick([50, 100, 200, 300, 400]), g = pick([2, 5, 8]), loss = pick([1, 2, 3]), nf = pick([4, 5, 6]);
      var P = Math.round(calc.dbm(w)), PL = Math.round(calc.fspl(1090, d)), prx = P - PL + g - loss, fl = Math.round(calc.ktb(2e6) + nf);
      return {
        title: 'ADS-B link', intro: 'An aircraft ' + d + ' km away transmits ' + w + ' W at 1090 MHz. You listen in a 2 MHz bandwidth.',
        steps: [
          step('dbm', num('Transponder power: ' + w + ' W in dBm?', calc.dbm(w), 'dBm', DB, '1 W = 30 dBm; ' + w + ' W = ' + f1(calc.dbm(w)) + ' dBm.')),
          step('link', num('Free-space path loss at 1090 MHz over ' + d + ' km?', calc.fspl(1090, d), 'dB', { abs: 1 }, '32.45 + 20·log(1090) + 20·log(' + d + ') = 32.45 + 60.7 + ' + f1(20 * log10(d)) + ' = ' + f1(calc.fspl(1090, d)) + ' dB.')),
          step('link', num('Tx ' + P + ' dBm, path loss ' + PL + ' dB, your antenna ' + g + ' dBi, cable loss ' + loss + ' dB. Received power?', prx, 'dBm', DB, P + ' − ' + PL + ' + ' + g + ' − ' + loss + ' = ' + sg(prx) + ' dBm.')),
          step('noise', num('Noise floor in 2 MHz with a ' + nf + ' dB noise figure?', calc.ktb(2e6) + nf, 'dBm', { abs: 0.6 }, '−174 + 63 + ' + nf + ' = ' + f1(calc.ktb(2e6) + nf) + ' dBm.')),
          step('noise', num('Received ' + sg(prx) + ' dBm against a ' + sg(fl) + ' dBm floor. SNR?', prx - fl, 'dB', DB, sg(prx) + ' − (' + sg(fl) + ') = ' + (prx - fl) + ' dB.'))
        ]
      };
    },
    function () {
      var alt = pick([340, 550, 1200]), v = pick([5000, 6000, 7000]), f = pick([12e9, 435e6]), fd = si(calc.doppler(v, f), 'Hz'), t = si(alt * 1e3 / 3e8, 's'), lam = lenU(3e8 / f);
      return {
        title: 'LEO satellite pass', intro: 'A satellite at ' + alt + ' km altitude passes overhead, transmitting at ' + qty(f, 'Hz') + '.',
        steps: [
          step('time', num('One-way delay when it is directly overhead (' + alt + ' km)?', t.v, t.u, R5, 'Light covers 300 km per ms: ' + alt + ' / 300 = ' + fmt(alt / 300) + ' ms.')),
          step('wave', num('Wavelength at ' + qty(f, 'Hz') + '?', lam.v, lam.u, R5, 'λ(m) = 300 / f(MHz) = ' + lenStr(3e8 / f) + '.')),
          step('time', num('Near the horizon it closes at ' + fmt(v / 1000) + ' km/s. Doppler shift?', fd.v, fd.u, R8, 'f_d = v/λ = ' + fmt(v, 4) + ' m/s ÷ ' + lenStr(3e8 / f) + ' = ' + fmt(fd.v) + ' ' + fd.u + '.')),
          step('link', num('Free-space path loss overhead (' + alt + ' km at ' + qty(f, 'Hz') + ')?', calc.fspl(f / 1e6, alt), 'dB', { abs: 1 }, '32.45 + ' + f1(20 * log10(f / 1e6)) + ' + ' + f1(20 * log10(alt)) + ' = ' + f1(calc.fspl(f / 1e6, alt)) + ' dB.'))
        ]
      };
    },
    function () {
      var fs = pick([2e6, 2.4e6]), t = pick([10, 30, 60]), n = pick([1024, 4096]), m = pick([4, 8, 10]), B = fs * 2 * t, gb = B >= 1e9, bw = si(fs / n, 'Hz'), out = si(fs / m, 'S/s');
      return {
        title: 'Planning an SDR capture', intro: 'You record ' + qty(fs, 'S/s') + ' of 8-bit IQ for ' + t + ' s and look at it with a ' + n + '-point FFT.',
        steps: [
          step('sdr', num('File size of the recording?', gb ? B / 1e9 : B / 1e6, gb ? 'GB' : 'MB', R5, '8-bit IQ is 2 bytes per sample: ' + qty(fs, 'S/s') + ' × 2 × ' + t + ' s = ' + fmt(B / 1e6) + ' MB.')),
          step('fft', num('Bin width of the ' + n + '-point FFT?', bw.v, bw.u, R5, 'fs / N = ' + fmt(bw.v) + ' ' + bw.u + '.')),
          step('fft', num('A signal sits ' + qty(fs / 8, 'Hz') + ' above centre. How many bins from centre?', n / 8, 'bins', INT, 'k = f·N/fs = N/8 = ' + (n / 8) + '.')),
          step('alias', num('You decimate by ' + m + '. New sample rate?', out.v, out.u, { rel: 0.02 }, qty(fs, 'S/s') + ' / ' + m + ' = ' + fmt(out.v) + ' ' + out.u + '. With IQ data that is also the bandwidth you keep.'))
        ]
      };
    },
    function () {
      var b = pick([10e6, 50e6, 150e6]), prf = pick([1e3, 2e3]), te = pick([20e-6, 100e-6, 200e-6]), v = pick([30, 100, 300]), rr = lenU(1.5e8 / b), ur = lenU(1.5e8 / prf), er = lenU(1.5e8 * te), fd = si(2 * v / 0.03, 'Hz');
      return {
        title: 'X-band radar', intro: 'A 10 GHz pulsed radar uses ' + qty(b, 'Hz') + ' of bandwidth and a PRF of ' + qty(prf, 'Hz') + '.',
        steps: [
          step('pg', num('Range resolution with ' + qty(b, 'Hz') + '?', rr.v, rr.u, R5, 'ΔR = c/(2B) = ' + fmt(rr.v) + ' ' + rr.u + '.')),
          step('time', num('Maximum unambiguous range at ' + qty(prf, 'Hz') + ' PRF?', ur.v, ur.u, R5, 'c/(2·PRF) = ' + fmt(ur.v) + ' ' + ur.u + '.')),
          step('time', num('An echo arrives ' + qty(te, 's') + ' after the pulse. Range?', er.v, er.u, R5, '150 m per µs of round trip: ' + fmt(er.v) + ' ' + er.u + '.')),
          step('time', num('The target closes at ' + v + ' m/s. Doppler shift the radar sees?', fd.v, fd.u, R8, 'Two-way: 2v/λ = 2 × ' + v + ' / 3 cm = ' + fmt(fd.v) + ' ' + fd.u + '.'))
        ]
      };
    },
    function () {
      var b = pick([10e3, 200e3, 1e6]), nf = pick([3, 5, 7]), snr = pick([10, 12]), e = pick([30, 40, 50]), g = pick([0, 3, 6]), x = pick([6, 12, 20]), S = Math.round(calc.ktb(b) + nf + snr);
      return {
        title: 'Receiver budget', intro: 'A receiver has ' + qty(b, 'Hz') + ' bandwidth, a ' + nf + ' dB noise figure and needs ' + snr + ' dB SNR.',
        steps: [
          step('noise', num('Thermal noise floor in ' + qty(b, 'Hz') + ' (before noise figure)?', calc.ktb(b), 'dBm', { abs: 0.6 }, '−174 + ' + f1(10 * log10(b)) + ' = ' + f1(calc.ktb(b)) + ' dBm.')),
          step('noise', num('Sensitivity with NF ' + nf + ' dB and ' + snr + ' dB required SNR?', calc.ktb(b) + nf + snr, 'dBm', { abs: 0.6 }, f1(calc.ktb(b)) + ' + ' + nf + ' + ' + snr + ' = ' + f1(calc.ktb(b) + nf + snr) + ' dBm.')),
          step('link', num('EIRP ' + e + ' dBm, Rx antenna ' + g + ' dBi, sensitivity ' + sg(S) + ' dBm. Maximum path loss?', e + g - S, 'dB', DB, e + ' + ' + g + ' − (' + sg(S) + ') = ' + (e + g - S) + ' dB.')),
          step('link', num('You gain ' + x + ' dB of link budget. Free-space range multiplies by?', calc.lin20(x), '×', R8, 'Range scales as 10^(dB/20) = ×' + fmt(calc.lin20(x)) + '.', [calc.lin10(x)]))
        ]
      };
    }
  ];
  function scenarioIndex(dateStr) { var h = 0; for (var i = 0; i < dateStr.length; i++) h = (h * 31 + dateStr.charCodeAt(i)) % 9973; return h % SCENARIOS.length; }
  var SCENARIO_TITLES = ['ADS-B link', 'LEO satellite pass', 'Planning an SDR capture', 'X-band radar', 'Receiver budget'];

  var api = {
    MODULES: MODULES, GROUPS: GROUPS, BY_ID: BY_ID, calc: calc, fmt: fmt, ansStr: ansStr, check: check, choices: choices, hilo: hilo,
    generate: generate, typeIds: typeIds, moduleLevel: moduleLevel, mastery: mastery, pickType: pickType, pickAny: pickAny,
    SCENARIOS: SCENARIOS, SCENARIO_TITLES: SCENARIO_TITLES, scenarioIndex: scenarioIndex,
    setRng: function (f) { rnd = f || Math.random; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : this);
