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

  /* ---------- hidden chapters: each is revealed when one of its parent chapters is completed ---------- */
  MODULES.push(
    {
      id: 'snr', name: 'Signal-to-noise maths', group: 'RF', blurb: 'SNR from levels and voltages, adding noise, bandwidth.', parents: ['db', 'dbm'],
      anchors: ['SNR(dB) = signal dBm − noise dBm; from voltages use 20·log', 'Two equal noise sources add 3 dB', 'An interferer at the floor costs 3 dB; 6 dB below costs 1 dB; 10 dB below costs 0.4 dB', 'Narrowing the bandwidth by ×10 gains 10 dB of SNR'],
      levels: ['SNR from power levels and voltages', 'Adding noise sources and interferers', 'SNR against bandwidth and noise figure'],
      types: {
        lvl: function () { var sgl = pick([-30, -50, -70, -90]), d = pick([6, 10, 15, 25, 40]); return num('Signal ' + sg(sgl) + ' dBm, noise ' + sg(sgl - d) + ' dBm. SNR?', d, 'dB', DB, 'Subtract the levels: ' + sg(sgl) + ' − (' + sg(sgl - d) + ') = ' + d + ' dB.', [-d]); },
        volt: function () { var p = pick([[1, 0.01], [0.5, 0.05], [1, 0.1], [3.16, 0.1], [0.1, 0.001], [1, 0.001], [2, 1]]), a = calc.db20(p[0] / p[1]); return num('Signal ' + qty(p[0], 'V') + ' RMS, noise ' + qty(p[1], 'V') + ' RMS. SNR?', a, 'dB', DB, 'Voltage ratio ×' + fmt(p[0] / p[1]) + ' → 20·log = ' + f1(a) + ' dB.', [a / 2]); },
        nsum: lv(2, function () { var k = pick([2, 3, 4, 10]); return num('Combining ' + k + ' equal, uncorrelated noise sources raises the noise by?', calc.db10(k), 'dB', DB, 'Noise powers add: 10·log(' + k + ') = ' + f1(calc.db10(k)) + ' dB.', [calc.db20(k)]); }),
        desense: lv(2, function () { var d = pick([0, 3, 6, 10]), a = calc.db10(1 + calc.lin10(-d)); return num('An interferer ' + (d ? d + ' dB below' : 'exactly at') + ' the noise floor raises the floor by?', a, 'dB', { abs: 0.25 }, 'Add the powers: 10·log(1 + 10^(−' + d + '/10)) = ' + f1(a) + ' dB. At the floor 3 dB, 6 dB below 1 dB, 10 dB below 0.4 dB.', null, { pos: true }); }),
        snrb: lv(3, function () { var s0 = pick([10, 20, 30]), p = pick([[1e6, 1e4], [1e6, 1e5], [1e5, 1e3], [1e4, 1e6], [2e6, 2e5], [1e3, 1e6]]), a = s0 + calc.db10(p[0] / p[1]); return num('A signal has ' + s0 + ' dB SNR in ' + qty(p[0], 'Hz') + '. Its SNR in ' + qty(p[1], 'Hz') + ' (signal fits either way)?', a, 'dB', DB, 'Noise scales with bandwidth: ' + s0 + ' + 10·log(' + qty(p[0], 'Hz') + ' / ' + qty(p[1], 'Hz') + ') = ' + f1(a) + ' dB.'); }),
        nfdeg: lv(3, function () { var s0 = pick([20, 30, 40]), nf = pick([1, 2, 3, 6]); return num('A source at the thermal noise floor has ' + s0 + ' dB SNR. After a stage with NF ' + nf + ' dB?', s0 - nf, 'dB', DB, 'Noise figure is exactly the SNR lost for a source at 290 K: ' + s0 + ' − ' + nf + ' = ' + (s0 - nf) + ' dB.', [s0 + nf]); })
      }
    },
    {
      id: 'dr', name: 'Dynamic range', group: 'RF', blurb: 'Compression point, intercept point, spur-free range.', parents: ['chain'],
      anchors: ['Output P1dB = input P1dB + gain − 1', 'OIP3 = IIP3 + gain', 'IP3 sits roughly 10 dB above P1dB', 'Third-order products rise 3 dB per 1 dB of input', 'SFDR = ⅔ × (IIP3 − noise floor)'],
      levels: ['Compression and intercept points across a gain stage', 'How intermod grows with drive level', 'Spur-free dynamic range and stages referred to the input'],
      types: {
        p1: function () { var ip = pick([-30, -20, -10, 0]), g = pick([10, 15, 20, 30]); return rnd() < 0.5 ? num('Input P1dB ' + sg(ip) + ' dBm, gain ' + g + ' dB. Output P1dB?', ip + g - 1, 'dBm', DB, 'At compression the gain is down 1 dB: ' + sg(ip) + ' + ' + g + ' − 1 = ' + sg(ip + g - 1) + ' dBm.', [ip + g, ip + g + 1]) : num('Output P1dB ' + sg(ip + g - 1) + ' dBm, gain ' + g + ' dB. Input P1dB?', ip, 'dBm', DB, 'Input P1dB = output P1dB − (gain − 1) = ' + sg(ip) + ' dBm.', [ip - 1, ip + 1]); },
        oip: function () { var ii = pick([-10, 0, 5, 10, 20]), g = pick([10, 13, 20, 25]); return rnd() < 0.5 ? num('IIP3 ' + sg(ii) + ' dBm, gain ' + g + ' dB. OIP3?', ii + g, 'dBm', DB, 'OIP3 = IIP3 + gain = ' + sg(ii + g) + ' dBm.', [ii - g]) : num('OIP3 ' + sg(ii + g) + ' dBm, gain ' + g + ' dB. IIP3?', ii, 'dBm', DB, 'IIP3 = OIP3 − gain = ' + sg(ii) + ' dBm.', [ii + 2 * g]); },
        slope: lv(2, function () { var x = pick([1, 2, 3, 5, 10]); return rnd() < 0.5 ? num('The input tones rise by ' + x + ' dB. The third-order products rise by?', 3 * x, 'dB', DB, 'Third-order products have a 3:1 slope: ' + (3 * x) + ' dB.', [x, 2 * x]) : num('The input tones rise by ' + x + ' dB. The gap between tones and third-order products shrinks by?', 2 * x, 'dB', DB, 'Products rise 3 dB per dB, tones 1 dB per dB, so the gap closes by 2 dB per dB: ' + (2 * x) + ' dB.', [x, 3 * x]); }),
        rule: lv(2, function () { var p1 = pick([0, 10, 17, 20, 30]); return num('An amplifier has output P1dB = ' + sg(p1) + ' dBm. Estimate its OIP3 (rule of thumb)?', p1 + 10, 'dBm', { abs: 1 }, 'IP3 is typically about 10 dB above P1dB: roughly ' + sg(p1 + 10) + ' dBm.', [p1 - 10, p1 + 3]); }),
        sfdr: lv(3, function () { var ii = pick([-10, 0, 10, 20]), fl = pick([-120, -110, -100, -90]), a = 2 / 3 * (ii - fl); return num('IIP3 ' + sg(ii) + ' dBm, noise floor ' + sg(fl) + ' dBm. Spur-free dynamic range?', a, 'dB', { abs: 0.7 }, 'SFDR = ⅔ × (IIP3 − floor) = ⅔ × ' + (ii - fl) + ' = ' + f1(a) + ' dB.', [ii - fl, (ii - fl) / 2], { pos: true }); }),
        refin: lv(3, function () { var g = pick([10, 15, 20, 25]), ii = pick([5, 10, 15, 20]); return num('A ' + g + ' dB preamp sits ahead of a mixer with IIP3 ' + sg(ii) + ' dBm. The mixer\'s IIP3 referred to the antenna?', ii - g, 'dBm', DB, 'Gain in front lowers the intercept seen at the input: ' + sg(ii) + ' − ' + g + ' = ' + sg(ii - g) + ' dBm. More preamp gain means less strong-signal headroom.', [ii + g]); })
      }
    },
    {
      id: 'tl', name: 'Transmission lines', group: 'RF', blurb: 'Stubs, quarter-wave inversion, cable loss.', parents: ['wave', 'match'],
      anchors: ['A λ/4 line inverts: Z_in = Z₀² / Z_L', 'A λ/2 line repeats the load', 'Shorted λ/4 stub looks open; open λ/4 stub looks shorted', 'Cable loss in dB scales with length and roughly with √frequency', 'Return loss seen through a lossy line improves by twice the loss'],
      levels: ['Stub behaviour and loss against length', 'Quarter-wave inversion and loss against frequency', 'Return loss through cable, and voltage on the line'],
      types: {
        stub: function () { var o = ['An open circuit', 'A short circuit', 'An inductor', 'A capacitor'];
          return item([['A shorted stub exactly λ/4 long looks like', 'An open circuit', o, 'A quarter wave inverts the impedance: a short becomes an open.'], ['An open stub exactly λ/4 long looks like', 'A short circuit', o, 'A quarter wave inverts the impedance: an open becomes a short.'],
            ['A shorted stub exactly λ/2 long looks like', 'A short circuit', o, 'A half wave repeats whatever is at the far end.'], ['A shorted stub shorter than λ/4 looks like', 'An inductor', o, 'Below a quarter wave a shorted stub is inductive; an open stub is capacitive.'],
            ['An open stub shorter than λ/4 looks like', 'A capacitor', o, 'Below a quarter wave an open stub is capacitive; a shorted stub is inductive.']]); },
        lossl: function () { var p = pick([[6, 25], [10, 30], [20, 15], [4, 50], [12, 10], [3, 200]]), a = p[0] * p[1] / 100; return num('A cable loses ' + p[0] + ' dB per 100 m. Loss of a ' + p[1] + ' m run?', a, 'dB', { abs: 0.2 }, 'Loss in dB is proportional to length: ' + p[0] + ' × ' + p[1] + '/100 = ' + f1(a) + ' dB.', null, { pos: true }); },
        inv: lv(2, function () { var p = pick([[50, 100], [50, 25], [50, 200], [75, 50], [50, 10], [100, 50]]), z = p[0] * p[0] / p[1]; return num('A λ/4 section of ' + p[0] + ' Ω line ends in ' + p[1] + ' Ω. Input impedance?', z, 'Ω', R5, 'Z_in = Z₀² / Z_L = ' + (p[0] * p[0]) + ' / ' + p[1] + ' = ' + fmt(z, 4) + ' Ω.', [p[1], Math.sqrt(p[0] * p[1])]); }),
        lossf: lv(2, function () { var l = pick([1, 2, 3, 5]), p = pick([[100, 400], [50, 450], [145, 2320], [10, 1000], [435, 1740]]), a = l * Math.sqrt(p[1] / p[0]); return num('A cable run loses ' + l + ' dB at ' + p[0] + ' MHz. Estimated loss at ' + p[1] + ' MHz (skin-effect scaling)?', a, 'dB', { abs: 0.3 }, 'Loss in dB grows with √frequency: ' + l + ' × √(' + p[1] + '/' + p[0] + ') = ' + l + ' × ' + fmt(Math.sqrt(p[1] / p[0])) + ' = ' + f1(a) + ' dB.', [l * p[1] / p[0]], { pos: true }); }),
        rlin: lv(3, function () { var rl = pick([6, 10, 14]), l = pick([1, 2, 3]); return num('An antenna has ' + rl + ' dB return loss, behind a cable with ' + l + ' dB loss. Return loss measured at the transmitter?', rl + 2 * l, 'dB', DB, 'The reflection crosses the cable twice: ' + rl + ' + 2 × ' + l + ' = ' + (rl + 2 * l) + ' dB. Lossy cable makes a bad antenna look good.', [rl + l, rl - 2 * l]); }),
        vline: lv(3, function () { var p = pick([[1, 50], [5, 50], [50, 50], [100, 50], [1000, 50], [100, 75]]), v = Math.sqrt(p[0] * p[1]); return num('RMS voltage on a matched ' + p[1] + ' Ω line carrying ' + qty(p[0], 'W') + '?', v, 'V', R5, 'V = √(P·Z₀) = √(' + (p[0] * p[1]) + ') = ' + fmt(v) + ' V.'); })
      }
    },
    {
      id: 'sys', name: 'System noise & G/T', group: 'RF', blurb: 'System temperature, G/T, and C/N₀ over a path.', parents: ['noise', 'link'],
      anchors: ['T_sys = antenna temperature + receiver temperature', 'Noise density = −198.6 dBm/Hz + 10·log(T)', 'G/T (dB/K) = antenna gain − 10·log(T_sys)', 'C/N₀ = EIRP(dBW) − path loss + G/T + 228.6', 'C/N = C/N₀ − 10·log(bandwidth)'],
      levels: ['System temperature and noise density', 'G/T and what cooling buys', 'C/N₀ and C/N over a whole link'],
      types: {
        tsys: function () { var ta = pick([20, 50, 100, 150, 290]), tr = pick([35, 75, 170, 290]); return num('Antenna temperature ' + ta + ' K, receiver noise temperature ' + tr + ' K. System temperature?', ta + tr, 'K', R5, 'They add: ' + ta + ' + ' + tr + ' = ' + (ta + tr) + ' K.'); },
        n0t: function () { var t = pick([29, 100, 290, 580, 1000, 2900]), a = -198.6 + calc.db10(t); return num('Noise density for a system temperature of ' + t + ' K?', a, 'dBm/Hz', DB, '−198.6 + 10·log(' + t + ') = ' + f1(a) + ' dBm/Hz. At 290 K that is the familiar −174.'); },
        gt: lv(2, function () { var g = pick([20, 30, 35, 40, 50]), t = pick([50, 100, 200, 400, 1000]), a = g - calc.db10(t); return num('Antenna gain ' + g + ' dBi, system temperature ' + t + ' K. G/T?', a, 'dB/K', DB, 'G/T = ' + g + ' − 10·log(' + t + ') = ' + g + ' − ' + f1(calc.db10(t)) + ' = ' + f1(a) + ' dB/K.', [g + calc.db10(t)]); }),
        cool: lv(2, function () { var p = pick([[300, 150], [300, 100], [200, 50], [1000, 100], [290, 145], [150, 75]]), a = calc.db10(p[0] / p[1]); return num('System temperature drops from ' + p[0] + ' K to ' + p[1] + ' K. SNR improves by?', a, 'dB', DB, '10·log(' + p[0] + '/' + p[1] + ') = ' + f1(a) + ' dB. Halving T_sys is worth 3 dB, the same as doubling the dish area.'); }),
        cn0: lv(3, function () { var e = pick([30, 40, 50]), pl = pick([160, 180, 190, 200, 205]), gt = pick([0, 10, 20, 30]), a = e - pl + gt + 228.6; return num('EIRP ' + e + ' dBW, path loss ' + pl + ' dB, receive G/T ' + gt + ' dB/K. C/N₀?', a, 'dB-Hz', DB, e + ' − ' + pl + ' + ' + gt + ' + 228.6 = ' + f1(a) + ' dB-Hz. The 228.6 is Boltzmann\'s constant in dBW/K/Hz.'); }),
        cn: lv(3, function () { var c = pick([50, 60, 70, 80]), b = pick([1e3, 1e4, 1e5, 1e6]); return num('C/N₀ of ' + c + ' dB-Hz in a ' + qty(b, 'Hz') + ' bandwidth: C/N?', c - calc.db10(b), 'dB', DB, 'C/N = C/N₀ − 10·log(B) = ' + c + ' − ' + f1(calc.db10(b)) + ' = ' + f1(c - calc.db10(b)) + ' dB.', [c + calc.db10(b)]); })
      }
    },
    {
      id: 'radar', name: 'Radar range equation', group: 'RF', blurb: 'The fourth-power law, duty cycle, pulse energy.', parents: ['time', 'pg'],
      anchors: ['Echo power falls as 1/R⁴: 12 dB per doubling of range', 'Range scales as the fourth root of power, RCS or integration', '12 dB more budget doubles the range; 40 dB gives ×10', 'Average power = peak power × duty cycle', 'Pulse energy = peak power × pulse width'],
      levels: ['The R⁴ law and average power', 'How range scales with power and target size', 'Pulse energy and integrating pulses'],
      types: {
        r4: function () { var k = pick([1.5, 2, 3, 4, 10]), a = 40 * log10(k); return num('A target moves ' + k + ' times further away. The echo drops by?', a, 'dB', DB, 'Echo power goes as 1/R⁴: 40·log(' + k + ') = ' + f1(a) + ' dB.', [a / 2, a / 4]); },
        duty: function () { var p = pick([1e3, 10e3, 100e3, 1e6]), d = pick([[0.001, '0.1 %'], [0.01, '1 %'], [0.02, '2 %'], [0.1, '10 %']]), s = si(p * d[0], 'W'); return num('Peak power ' + qty(p, 'W') + ' at ' + d[1] + ' duty cycle. Average power?', s.v, s.u, R5, 'Average = peak × duty = ' + fmt(s.v) + ' ' + s.u + '.'); },
        rng: lv(2, function () { var x = pick([3, 6, 12, 20, 40]), a = Math.pow(10, x / 40); return num(x + ' dB more transmit power multiplies detection range by?', a, '×', R8, 'Range goes as the fourth root: 10^(' + x + '/40) = ×' + fmt(a) + '. It takes 12 dB to double the range.', [calc.lin20(x), calc.lin10(x)]); }),
        rcs: lv(2, function () { var x = pick([3, 6, 10, 20]), a = Math.pow(10, -x / 40); return num('A target\'s radar cross-section is ' + x + ' dB smaller. Detection range multiplies by?', a, '×', R5, '10^(−' + x + '/40) = ×' + fmt(a) + '. A 10 dB smaller target is still seen at 56 % of the range.', [calc.lin20(-x), calc.lin10(-x)]); }),
        energy: lv(3, function () { var p = pick([[1e6, 1e-6], [100e3, 10e-6], [1e3, 100e-6], [10e3, 1e-6], [1e6, 100e-6], [50e3, 20e-6]]), s = si(p[0] * p[1], 'J'); return num('A ' + qty(p[0], 'W') + ' pulse lasting ' + qty(p[1], 's') + ': energy?', s.v, s.u, R5, 'E = P × τ = ' + fmt(s.v) + ' ' + s.u + '. Detection depends on energy, which is why long coded pulses work.'); }),
        nint: lv(3, function () { var n = pick([4, 16, 100, 10000]), a = Math.pow(n, 0.25); return num('Coherently integrating ' + n + ' pulses multiplies detection range by?', a, '×', R8, 'SNR improves ×' + n + ', range by its fourth root: ×' + fmt(a) + '.', [Math.sqrt(n), n]); })
      }
    },
    {
      id: 'pa', name: 'Phased arrays', group: 'RF', blurb: 'Steering phase, grating lobes, scan loss.', parents: ['ant'],
      anchors: ['Phase step per element = 360° × (d/λ) × sin θ', 'λ/2 spacing steered to 30° needs 90° per element', 'No grating lobes if d ≤ λ / (1 + sin θ_max)', 'Off broadside the beam widens by 1/cos θ and gain drops by cos θ', 'An n-bit phase shifter steps 360°/2ⁿ'],
      levels: ['Steering phase and phase-shifter steps', 'Grating-lobe spacing and beam broadening', 'Scan loss and array size for a beamwidth'],
      types: {
        step: function () { var p = pick([[0.5, 30], [0.5, 90], [0.5, 45], [0.5, 60], [0.25, 30], [0.25, 90]]), a = 360 * p[0] * Math.sin(p[1] * PI / 180); return num('Element spacing ' + p[0] + ' λ, beam steered ' + p[1] + '° off broadside. Phase step between elements?', a, '°', { abs: 2 }, '360° × ' + p[0] + ' × sin ' + p[1] + '° = ' + f1(a) + '°.', [a * 2, a / 2, 360 * p[0]]); },
        bits: function () { var n = pick([3, 4, 5, 6]); return num('Smallest phase step of a ' + n + '-bit phase shifter?', 360 / Math.pow(2, n), '°', { rel: 0.03 }, '360° / 2^' + n + ' = ' + fmt(360 / Math.pow(2, n), 4) + '°.'); },
        grate: lv(2, function () { var t = pick([30, 45, 60, 90]), a = 1 / (1 + Math.sin(t * PI / 180)); return num('Largest element spacing with no grating lobes when scanning to ±' + t + '°?', a, 'λ', { abs: 0.02 }, 'd ≤ λ / (1 + sin θ_max) = 1 / ' + f2(1 + Math.sin(t * PI / 180)) + ' = ' + f2(a) + ' λ. Scanning to the horizon needs λ/2.', null, { pos: true }); }),
        broad: lv(2, function () { var t = pick([30, 45, 60]), a = 1 / Math.cos(t * PI / 180); return num('Steering ' + t + '° off broadside widens the beam by what factor?', a, '×', R5, '1 / cos ' + t + '° = ×' + fmt(a) + '. The array looks shorter from the side.'); }),
        scan: lv(3, function () { var t = pick([30, 45, 60]), a = -calc.db10(Math.cos(t * PI / 180)); return num('Scan loss at ' + t + '° off broadside (cos θ law)?', a, 'dB', { abs: 0.25 }, '−10·log(cos ' + t + '°) = ' + f1(a) + ' dB.', null, { pos: true }); }),
        elems: lv(3, function () { var b = pick([1, 2, 5, 10]); return num('About how many λ/2-spaced elements for a ' + b + '° broadside beam?', Math.round(101.6 / b), 'elements', R10, 'θ ≈ 102° / N, so N ≈ 102 / ' + b + ' ≈ ' + Math.round(101.6 / b) + '.'); })
      }
    },
    {
      id: 'lc', name: 'LC parts at 50 Ω', group: 'Circuits', blurb: 'Component values for a given reactance, filter order, ring-down.', parents: ['react', 'ckt'],
      anchors: ['For 50 Ω of reactance: L = 7.96 µH / f(MHz), C = 3183 pF / f(MHz)', 'At 100 MHz that is 79.6 nH and 31.8 pF', 'Each filter order gives 6 dB per octave, 20 dB per decade', 'Loaded Q = centre frequency / bandwidth', 'Ring-down time constant τ = Q / (π·f₀)'],
      levels: ['L and C for 50 Ω of reactance', 'Other impedances and filter order', 'Loaded Q and ring-down time'],
      types: {
        l50: function () { var f = pick([1, 2, 5]) * Math.pow(10, ri(6, 9)), s = si(50 / (2 * PI * f), 'H'); return num('Inductance with 50 Ω of reactance at ' + qty(f, 'Hz') + '?', s.v, s.u, R8, 'L = X/(2πf) = 7.96 µH / f(MHz) = ' + fmt(s.v) + ' ' + s.u + '.'); },
        c50: function () { var f = pick([1, 2, 5]) * Math.pow(10, ri(6, 9)), s = si(1 / (2 * PI * f * 50), 'F'); return num('Capacitance with 50 Ω of reactance at ' + qty(f, 'Hz') + '?', s.v, s.u, R8, 'C = 1/(2πfX) = 3183 pF / f(MHz) = ' + fmt(s.v) + ' ' + s.u + '.'); },
        lz: lv(2, function () { var z = pick([25, 75, 100, 200]), f = pick([1e6, 10e6, 100e6, 1e9]), isL = rnd() < 0.5, s = isL ? si(z / (2 * PI * f), 'H') : si(1 / (2 * PI * f * z), 'F'); return num((isL ? 'Inductance' : 'Capacitance') + ' with ' + z + ' Ω of reactance at ' + qty(f, 'Hz') + '?', s.v, s.u, R8, 'Scale the 50 Ω value: ' + (isL ? 'L goes up with X' : 'C goes down as X goes up') + '. Result ' + fmt(s.v) + ' ' + s.u + '.'); }),
        ord: lv(2, function () { if (rnd() < 0.5) { var a = pick([18, 24, 30, 40, 60]); return num('You need ' + a + ' dB of rejection one octave above cutoff. Minimum filter order (6 dB per octave per order)?', Math.ceil(a / 6), '', INT, a + ' / 6 = ' + fmt(a / 6) + ', so order ' + Math.ceil(a / 6) + '.'); } var d = pick([40, 60, 80, 100]); return num('You need ' + d + ' dB of rejection one decade above cutoff. Minimum filter order?', d / 20, '', INT, 'Each order gives 20 dB per decade: ' + d + ' / 20 = ' + (d / 20) + '.'); }),
        qbw: lv(3, function () { var p = pick([[10.7e6, 200e3], [455e3, 10e3], [1090e6, 20e6], [145e6, 1e6], [7e6, 3e3]]); return num('A filter centred on ' + qty(p[0], 'Hz') + ' with ' + qty(p[1], 'Hz') + ' bandwidth: loaded Q?', p[0] / p[1], '', R5, 'Q = f₀ / BW = ' + fmt(p[0] / p[1], 4) + '.'); }),
        ring: lv(3, function () { var p = pick([[100, 10e6], [10000, 10e6], [50, 455e3], [1000, 1e9], [200, 100e6]]), s = si(p[0] / (PI * p[1]), 's'); return num('A resonator at ' + qty(p[1], 'Hz') + ' with Q = ' + p[0] + ': ring-down time constant?', s.v, s.u, R8, 'τ = Q / (π·f₀) = ' + fmt(s.v) + ' ' + s.u + '. High Q means narrow and slow.'); })
      }
    },
    {
      id: 'plan', name: 'Frequency planning', group: 'DSP', blurb: 'LO, IF, image frequencies and ADC spurs.', parents: ['sdr', 'alias'],
      anchors: ['A mixer gives the sum and the difference of RF and LO', 'High-side LO = RF + IF; low-side LO = RF − IF', 'The image sits 2 × IF from the wanted signal, on the far side of the LO', 'A higher IF pushes the image further away', 'ADC harmonics alias like any other tone'],
      levels: ['LO frequency and mixer products', 'Image frequency and choosing an IF', 'Aliased harmonics and the half-IF spur'],
      types: {
        lo: function () { var rf = pick([100, 145, 435, 1090]), f = pick([10.7, 21.4, 45, 70]), hi = rnd() < 0.5; return num('RF ' + rf + ' MHz, IF ' + f + ' MHz, ' + (hi ? 'high' : 'low') + '-side injection. LO frequency?', hi ? rf + f : rf - f, 'MHz', { abs: 0.05 }, (hi ? 'High-side: LO = RF + IF' : 'Low-side: LO = RF − IF') + ' = ' + fmt(hi ? rf + f : rf - f, 6) + ' MHz.', [hi ? rf - f : rf + f, rf, hi ? rf + 2 * f : rf - 2 * f]); },
        mix: function () { var p = pick([[1090, 1020], [435, 390], [145, 134.3], [2400, 2330], [100, 110.7]]), sum = rnd() < 0.5; return num('Mixing ' + p[0] + ' MHz with ' + p[1] + ' MHz: the ' + (sum ? 'sum' : 'difference') + ' product?', sum ? p[0] + p[1] : Math.abs(p[0] - p[1]), 'MHz', { abs: 0.05 }, 'Sum ' + fmt(p[0] + p[1], 6) + ' MHz, difference ' + fmt(Math.abs(p[0] - p[1]), 6) + ' MHz.', [sum ? Math.abs(p[0] - p[1]) : p[0] + p[1], p[0], p[1]]); },
        img: lv(2, function () { var rf = pick([100, 145, 435, 1090]), f = pick([10.7, 21.4, 45, 70]), hi = rnd() < 0.5, a = hi ? rf + 2 * f : rf - 2 * f; return num('RF ' + rf + ' MHz, IF ' + f + ' MHz, ' + (hi ? 'high' : 'low') + '-side LO. Image frequency?', a, 'MHz', { abs: 0.05 }, 'The image is 2 × IF away on the LO side: ' + rf + (hi ? ' + ' : ' − ') + fmt(2 * f, 4) + ' = ' + fmt(a, 6) + ' MHz.', [hi ? rf - 2 * f : rf + 2 * f, hi ? rf + f : rf - f, rf]); }),
        ifsel: lv(2, function () { var x = pick([20, 42.8, 90, 140]); return num('The preselector only rejects signals at least ' + x + ' MHz away. Minimum IF to protect against the image?', x / 2, 'MHz', { rel: 0.03 }, 'The image is 2 × IF away, so IF ≥ ' + x + ' / 2 = ' + fmt(x / 2, 4) + ' MHz.', [x, x * 2]); }),
        harm: lv(3, function () { var p = pick([[30, 100, 3], [30, 100, 2], [70, 250, 3], [40, 100, 2], [45, 100, 3], [12, 50, 3], [20, 65, 3]]), a = calc.alias(p[0] * p[2], p[1]); return num('A ' + p[0] + ' MHz input sampled at ' + p[1] + ' MS/s. Where does its ' + (p[2] === 2 ? '2nd' : '3rd') + ' harmonic land?', a, 'MHz', { rel: 0.03 }, 'The harmonic is at ' + (p[0] * p[2]) + ' MHz. Fold it against ' + p[1] + ' MS/s: ' + fmt(a) + ' MHz.', [p[0] * p[2], p[1] / 2 - a]); }),
        halfif: lv(3, function () { var rf = pick([145, 435, 1090]), f = pick([21.4, 45, 70]); return num('RF ' + rf + ' MHz, IF ' + f + ' MHz, high-side LO. Frequency of the half-IF spur?', rf + f / 2, 'MHz', { abs: 0.05 }, 'It sits halfway between RF and LO: ' + rf + ' + ' + fmt(f / 2, 4) + ' = ' + fmt(rf + f / 2, 6) + ' MHz.', [rf - f / 2, rf + f, rf + 2 * f]); })
      }
    },
    {
      id: 'stft', name: 'Spectrograms', group: 'DSP', blurb: 'Window length, hop, frames, time against frequency.', parents: ['fft', 'win'],
      anchors: ['Time resolution = window length / fs', 'Frequency resolution = fs / window length; the two multiply to 1', 'Hop = window × (1 − overlap)', 'Frames = (samples − window) / hop + 1', 'Frame rate = fs / hop'],
      levels: ['Time resolution and hop size', 'Frame counts and the time-frequency trade', 'Frame rate and how much time a display covers'],
      types: {
        tr: function () { var p = pick([[1024, 1.024e6], [256, 2.4e6], [4096, 48e3], [1024, 48e3], [64, 2e6], [2048, 2.048e6]]), s = si(p[0] / p[1], 's'); return num('A ' + p[0] + '-sample window at ' + qty(p[1], 'S/s') + ': time resolution?', s.v, s.u, R5, 'Window length / fs = ' + fmt(s.v) + ' ' + s.u + '. Anything shorter is smeared across the frame.'); },
        hop: function () { var n = pick([256, 512, 1024, 4096]), o = pick([[0.5, '50 %'], [0.75, '75 %'], [0.25, '25 %']]); return num('Window of ' + n + ' samples with ' + o[1] + ' overlap: hop size?', n * (1 - o[0]), 'samples', INT, 'Hop = window × (1 − overlap) = ' + (n * (1 - o[0])) + ' samples.', [n * o[0], n]); },
        frames: lv(2, function () { var n = pick([512, 1024]), hop = n / pick([1, 2, 4]), k = pick([10, 59, 100, 1000]), tot = n + hop * (k - 1); return num(tot + ' samples, window ' + n + ', hop ' + hop + ': how many full frames?', k, 'frames', INT, '(samples − window) / hop + 1 = (' + tot + ' − ' + n + ') / ' + hop + ' + 1 = ' + k + '.', [Math.round(tot / n), Math.round(tot / hop), k - 1]); }),
        trade: lv(2, function () { var p = pick([[0.5e-6, 'a 0.5 µs pulse'], [120e-6, 'a 120 µs burst'], [1e-3, 'a 1 ms burst'], [10e-3, 'a 10 ms chirp segment']]), s = si(1 / p[0], 'Hz'); return num('To isolate ' + p[1] + ' the window can be no longer than it. Best frequency resolution you can then have?', s.v, s.u, R5, 'Resolution = 1 / window duration = ' + fmt(s.v) + ' ' + s.u + '. Sharper in time always means blurrier in frequency.'); }),
        rate: lv(3, function () { var p = pick([[2.4e6, 1024], [48e3, 512], [1e6, 500], [2e6, 2048], [2.4e6, 2400]]); return num(qty(p[0], 'S/s') + ' with a hop of ' + p[1] + ' samples: frames per second?', p[0] / p[1], 'frames/s', R5, 'fs / hop = ' + fmt(p[0] / p[1], 4) + ' frames per second.'); }),
        span: lv(3, function () { var p = pick([[1000, 1024, 2.048e6], [800, 512, 48e3], [500, 2400, 2.4e6], [1920, 1000, 1e6]]), s = si(p[0] * p[1] / p[2], 's'); return num('A waterfall ' + p[0] + ' columns wide, hop ' + p[1] + ' samples, at ' + qty(p[2], 'S/s') + ': how much time does it show?', s.v, s.u, R5, 'Columns × hop / fs = ' + fmt(s.v) + ' ' + s.u + '.'); })
      }
    },
    {
      id: 'corr', name: 'Correlation', group: 'DSP', blurb: 'Lags as delay and distance, correlation gain, code sidelobes.', parents: ['xform'],
      anchors: ['Autocorrelation peaks at zero lag; the peak is the signal energy', 'A cross-correlation peak at lag k means a delay of k / fs', 'One sample at 2.4 MS/s is 125 m of path', 'Correlating N samples gives 10·log(N) of gain', 'Delay resolution ≈ 1 / bandwidth'],
      levels: ['Lag as time, and what correlation shows', 'Lag as distance, and correlation gain', 'Code sidelobes and delay resolution'],
      types: {
        lag: function () { var p = pick([[48, 48e3], [100, 1e6], [24, 2.4e6], [5, 10e6], [960, 48e3]]), s = si(p[0] / p[1], 's'); return num('Cross-correlation peaks at lag ' + p[0] + ' with data at ' + qty(p[1], 'S/s') + '. Delay between the signals?', s.v, s.u, R5, 'Delay = lag / fs = ' + fmt(s.v) + ' ' + s.u + '.'); },
        facts: function () { return item([
          ['The autocorrelation of any signal is largest at', 'Zero lag', ['Half its length', 'Its last sample', 'It depends on the signal'], 'A signal matches itself best with no shift; the peak value is its energy.'],
          ['The autocorrelation of white noise is', 'A single spike at zero lag', ['Flat at all lags', 'A sine wave', 'A slow decay'], 'White noise is unrelated to any shifted copy of itself.'],
          ['The Fourier transform of an autocorrelation is the', 'Power spectrum', ['Phase spectrum', 'Impulse response', 'Signal itself'], 'Wiener–Khinchin: autocorrelation and power spectral density are a transform pair.'],
          ['Correlation is the same as convolution with', 'A time-reversed, conjugated copy', ['The same signal', 'A delayed copy', 'A window'], 'That is exactly what a matched filter does.'],
          ['The autocorrelation of a periodic signal is', 'Periodic with the same period', ['A single spike', 'Zero', 'A ramp'], 'It matches itself again every whole period, which is how pitch and symbol rates are found.']]); },
        dist: lv(2, function () { var p = pick([[10, 10e6], [1, 2.4e6], [24, 2.4e6], [5, 20e6], [100, 1e6]]), u = lenU(3e8 * p[0] / p[1]); return num('Two receivers see the same radio signal ' + p[0] + ' sample' + (p[0] > 1 ? 's' : '') + ' apart at ' + qty(p[1], 'S/s') + '. Path difference?', u.v, u.u, R5, 'c × lag / fs = 300 m per µs × ' + qty(p[0] / p[1], 's') + ' = ' + fmt(u.v) + ' ' + u.u + '.'); }),
        gain: lv(2, function () { var n = pick([13, 100, 1000, 1023, 8192]); return num('Correlating against a known ' + n + '-sample sequence: gain over the noise?', calc.db10(n), 'dB', DB, '10·log(' + n + ') = ' + f1(calc.db10(n)) + ' dB.', [calc.db20(n)]); }),
        psl: lv(3, function () { var n = pick([7, 11, 13]); return num('Barker-' + n + ' code: peak sidelobe relative to the main peak?', -calc.db20(n), 'dB', DB, 'Peak ' + n + ', sidelobes 1: −20·log(' + n + ') = ' + f1(-calc.db20(n)) + ' dB.', [-calc.db10(n)]); }),
        res: lv(3, function () { var b = pick([1e6, 2e6, 10e6, 20e6, 240e6]), u = lenU(3e8 / b); return num('A signal ' + qty(b, 'Hz') + ' wide: delay resolution, expressed as one-way distance?', u.v, u.u, R5, 'Delay resolution ≈ 1/B = ' + qty(1 / b, 's') + ', which light covers in ' + fmt(u.v) + ' ' + u.u + '.', [u.v / 2]); })
      }
    },
    {
      id: 'imp', name: 'IQ impairments', group: 'DSP', blurb: 'DC offset, imbalance, image rejection, phase noise.', parents: ['iq'],
      anchors: ['DC offset and LO leakage: a spike at the centre', 'IQ imbalance: a mirror image at −f', 'Image rejection ≈ 20·log(2/ε): 1 % gain error → 46 dB, 10 % → 26 dB', 'Phase error in radians works the same way: 1° → 41 dB', 'RMS phase noise of φ radians gives EVM ≈ φ: 1° → 1.75 %'],
      levels: ['Recognising each impairment', 'Image rejection from gain and phase error', 'Image level and EVM from phase noise'],
      types: {
        where: function () { var o = ['A spike at the centre frequency', 'A mirror image on the other side of centre', 'A slowly spinning constellation', 'Constellation points smeared along arcs', 'Outer constellation points pulled inward'];
          return item([['A DC offset on I or Q shows up as', o[0], o, 'A constant added to the samples is energy at 0 Hz, the centre of the IQ spectrum.'], ['Gain mismatch between I and Q shows up as', o[1], o, 'Imbalance leaks some of +f into −f.'],
            ['A small frequency offset shows up as', o[2], o, 'A constant phase advance per sample rotates everything steadily.'], ['Phase noise shows up as', o[3], o, 'Random phase jitter moves points around the circle, not in and out.'],
            ['Amplifier compression shows up as', o[4], o, 'The largest amplitudes get less gain than the small ones.']]); },
        irrg: lv(2, function () { var e = pick([1, 2, 5, 10]), a = calc.db20(200 / e); return num('I/Q gain mismatch of ' + e + ' %: image rejection?', a, 'dB', DB, '20·log(2 / ' + (e / 100) + ') = ' + f1(a) + ' dB.', [calc.db20(100 / e), calc.db10(200 / e)]); }),
        irrp: lv(2, function () { var d = pick([0.5, 1, 2, 5]), a = calc.db20(2 / (d * PI / 180)); return num('I/Q phase error of ' + d + '°: image rejection?', a, 'dB', DB, d + '° = ' + fmt(d * PI / 180) + ' rad; 20·log(2 / that) = ' + f1(a) + ' dB. Anchor: 1° gives 41 dB.'); }),
        imgl: lv(3, function () { var t = pick([-10, -20, -30]), r = pick([25, 30, 40, 46]); return num('A tone at ' + sg(t) + ' dBm with ' + r + ' dB of image rejection. Level of its image?', t - r, 'dBm', DB, 'The image is the tone minus the rejection: ' + sg(t) + ' − ' + r + ' = ' + sg(t - r) + ' dBm, at the mirror frequency.', [t + r]); }),
        pn: lv(3, function () { var d = pick([0.5, 1, 2, 3]); return num('RMS phase noise of ' + d + '°: the EVM it causes?', 100 * d * PI / 180, '%', R8, 'EVM ≈ phase error in radians = ' + fmt(d * PI / 180) + ' → ' + fmt(100 * d * PI / 180) + ' %.'); })
      }
    },
    {
      id: 'rs', name: 'Resampling', group: 'DSP', blurb: 'Interpolation images, rational rate changes, filter cutoffs.', parents: ['filt', 'dfreq'],
      anchors: ['Interpolate by L: insert zeros, then low-pass at the old Nyquist', 'Decimate by M: low-pass at the new Nyquist, then drop samples', 'Rational change: new rate = fs × L / M', '48 kHz → 44.1 kHz is 147/160', 'The filter cutoff is the lower of the two Nyquist frequencies'],
      levels: ['Interpolated rates and where images appear', 'Rational rate changes and the cutoff to use', 'Polyphase taps and staged decimation'],
      types: {
        up: function () { var p = pick([[48e3, 4], [1e6, 8], [2.4e6, 5], [8e3, 6], [44.1e3, 2]]), s = si(p[0] * p[1], 'S/s'); return num(qty(p[0], 'S/s') + ' interpolated by ' + p[1] + ': new rate?', s.v, s.u, { rel: 0.02 }, 'Multiply the rate by L: ' + fmt(s.v, 4) + ' ' + s.u + '.'); },
        img: function () { var p = pick([[48e3, 1e3], [8e3, 1e3], [1e6, 100e3], [48e3, 10e3]]), s = si(p[0] - p[1], 'Hz'); return num('Zero-stuffing data that was at ' + qty(p[0], 'S/s') + '. Where is the first image of a ' + qty(p[1], 'Hz') + ' tone?', s.v, s.u, { rel: 0.02 }, 'Images sit around multiples of the old rate: ' + qty(p[0], 'Hz') + ' − ' + qty(p[1], 'Hz') + ' = ' + fmt(s.v) + ' ' + s.u + '. The interpolation filter removes them.', [(p[0] + p[1]) / ((p[0] - p[1]) / s.v), p[0] / ((p[0] - p[1]) / s.v)]); },
        rat: lv(2, function () { var p = pick([[48e3, 147, 160], [44.1e3, 160, 147], [2.4e6, 5, 12], [1e6, 3, 2], [10e6, 1, 4], [2.4e6, 1, 50]]), s = si(p[0] * p[1] / p[2], 'S/s'); return num(qty(p[0], 'S/s') + ' resampled by ' + p[1] + '/' + p[2] + ': new rate?', s.v, s.u, { rel: 0.01 }, 'fs × L / M = ' + fmt(s.v, 4) + ' ' + s.u + '.'); }),
        cut: lv(2, function () { var p = pick([[48e3, 44.1e3], [2.4e6, 1e6], [1e6, 1.5e6], [8e3, 48e3], [48e3, 8e3]]), s = si(Math.min(p[0], p[1]) / 2, 'Hz'); return num('Resampling ' + qty(p[0], 'S/s') + ' to ' + qty(p[1], 'S/s') + ': highest safe filter cutoff?', s.v, s.u, { rel: 0.02 }, 'Use the lower of the two Nyquist frequencies: ' + fmt(s.v, 4) + ' ' + s.u + '.', [Math.max(p[0], p[1]) / 2 / (Math.min(p[0], p[1]) / 2 / s.v)]); }),
        poly: lv(3, function () { var p = pick([[96, 4], [240, 5], [1024, 8], [480, 160], [64, 2]]); return num('A ' + p[0] + '-tap interpolation filter split into ' + p[1] + ' polyphase branches: taps per branch?', p[0] / p[1], 'taps', INT, 'Taps / L = ' + (p[0] / p[1]) + '. Each output sample only needs one branch.', [p[0], p[0] * p[1]]); }),
        stage: lv(3, function () { var p = pick([[2.4e6, 25, 4], [2.4e6, 10, 5], [10e6, 5, 8], [1e6, 4, 5], [20e6, 8, 5]]), s = si(p[0] / p[1], 'S/s'); return num('Decimating ' + qty(p[0], 'S/s') + ' by ' + (p[1] * p[2]) + ' in two stages, ' + p[1] + ' then ' + p[2] + '. Rate between the stages?', s.v, s.u, { rel: 0.02 }, qty(p[0], 'S/s') + ' / ' + p[1] + ' = ' + fmt(s.v, 4) + ' ' + s.u + '. The sharp filter then runs at the low rate, which is why staging is cheaper.', [p[0] / p[2] / (p[0] / p[1] / s.v), p[0] / (p[1] * p[2]) / (p[0] / p[1] / s.v)]); })
      }
    },
    {
      id: 'ber', name: 'Coding & error rates', group: 'DSP', blurb: 'Error counts, code rate, correction power, coding gain.', parents: ['mod'],
      anchors: ['Errors per second = BER × bit rate', 'Code rate = k / n; bandwidth grows by 1 / rate', 'Distance d corrects ⌊(d − 1)/2⌋ errors and detects d − 1', 'Hamming codes: n = 2^m − 1, k = n − m', 'Uncoded BPSK or QPSK needs Eb/N0 ≈ 9.6 dB for BER 10⁻⁵; the Shannon limit is −1.6 dB'],
      levels: ['Error counts and code rate', 'Correction power, Hamming codes, bandwidth cost', 'Eb/N0 anchors and coding gain'],
      types: {
        errs: function () { var p = pick([[1e-6, 1e6, '10⁻⁶'], [1e-5, 100e3, '10⁻⁵'], [1e-9, 1e9, '10⁻⁹'], [1e-6, 10e6, '10⁻⁶'], [1e-3, 9600, '10⁻³'], [1e-5, 1e6, '10⁻⁵']]); return num('BER ' + p[2] + ' at ' + qty(p[1], 'b/s') + ': errors per second?', p[0] * p[1], 'errors/s', R5, 'BER × bit rate = ' + fmt(p[0] * p[1]) + ' per second.'); },
        cr: function () { var p = pick([[7, 4], [255, 223], [15, 11], [24, 12], [31, 26]]); return num('Code rate of an (' + p[0] + ', ' + p[1] + ') block code?', p[1] / p[0], '', { abs: 0.01 }, 'Rate = k / n = ' + p[1] + ' / ' + p[0] + ' = ' + fmt(p[1] / p[0]) + '.', [p[0] / p[1] - 1, 1 - p[1] / p[0]], { pos: true }); },
        tcor: lv(2, function () { var d = pick([3, 5, 7, 9, 17, 33]); return rnd() < 0.5 ? num('A code with minimum distance ' + d + ' can correct how many errors?', Math.floor((d - 1) / 2), '', INT, '⌊(d − 1)/2⌋ = ' + Math.floor((d - 1) / 2) + '.', [d - 1, d]) : num('A code with minimum distance ' + d + ' can detect how many errors?', d - 1, '', INT, 'd − 1 = ' + (d - 1) + '.', [Math.floor((d - 1) / 2), d]); }),
        ham: lv(2, function () { var m = pick([3, 4, 5, 6]), n = Math.pow(2, m) - 1; return rnd() < 0.5 ? num('Hamming code with ' + m + ' parity bits: block length n?', n, 'bits', INT, 'n = 2^' + m + ' − 1 = ' + n + '.', [n + 1, n - m]) : num('Hamming code with ' + m + ' parity bits: data bits k?', n - m, 'bits', INT, 'n = ' + n + ', k = n − m = ' + (n - m) + '.', [n, n + 1]); }),
        bwx: lv(2, function () { var p = pick([[1 / 2, '1/2'], [2 / 3, '2/3'], [3 / 4, '3/4'], [7 / 8, '7/8']]); return num('For the same information rate, a rate-' + p[1] + ' code multiplies the occupied bandwidth by?', 1 / p[0], '×', R5, '1 / rate = ×' + fmt(1 / p[0]) + '.', [p[0]]); }),
        ebno: lv(3, function () { var o = ['−1.6 dB', '6.8 dB', '9.6 dB', '10.5 dB', '12.6 dB'];
          return item([['Eb/N0 for uncoded BPSK at BER 10⁻⁵', '9.6 dB', o, 'Anchors for uncoded BPSK and QPSK: 6.8 dB for 10⁻³, 9.6 dB for 10⁻⁵, 10.5 dB for 10⁻⁶.'], ['Eb/N0 for uncoded BPSK at BER 10⁻³', '6.8 dB', o, 'Anchors for uncoded BPSK and QPSK: 6.8 dB for 10⁻³, 9.6 dB for 10⁻⁵, 10.5 dB for 10⁻⁶.'],
            ['Eb/N0 for uncoded QPSK at BER 10⁻⁶', '10.5 dB', o, 'QPSK needs the same Eb/N0 as BPSK: 10.5 dB for 10⁻⁶.'], ['The lowest Eb/N0 at which any code can work (Shannon limit)', '−1.6 dB', o, 'As the code rate goes to zero the limit is ln 2, which is −1.59 dB.'],
            ['Compared with BPSK at the same Eb/N0, the BER of QPSK is', 'The same', ['Twice as bad', '3 dB worse', 'Half'], 'QPSK is two BPSK signals in quadrature, so it carries twice the bits for the same Eb/N0.']]); }),
        cg: lv(3, function () { var x = pick([1, 2, 4.5, 6.5]); return num('A code reaches BER 10⁻⁵ at Eb/N0 = ' + x + ' dB. Coding gain over uncoded BPSK?', 9.6 - x, 'dB', DB, 'Uncoded BPSK needs 9.6 dB, so the gain is 9.6 − ' + x + ' = ' + f1(9.6 - x) + ' dB.', [9.6 + x], { pos: true }); })
      }
    },
    {
      id: 'fx', name: 'Fixed-point arithmetic', group: 'DSP', blurb: 'Formats after multiplying, shifts, overflow, guard bits.', parents: ['quant'],
      anchors: ['Multiplying adds the fractional bits: Q1.15 × Q1.15 = Q2.30', 'Shift right by 15 to return to Q1.15', 'Shifts are powers of two: >> 3 divides by 8', 'Wrap-around flips the sign; saturate instead', 'Summing K values needs log₂(K) guard bits'],
      levels: ['Product formats and shifts', 'Overflow, saturation and guard bits', 'Q1.15 products and coefficient word length'],
      types: {
        mulf: function () { var p = pick([['Q1.15', 'Q1.15', 30], ['Q1.7', 'Q1.7', 14], ['Q1.15', 'Q1.31', 46], ['Q8.8', 'Q8.8', 16], ['Q4.12', 'Q1.15', 27]]); return num(p[0] + ' × ' + p[1] + ': fractional bits in the full product?', p[2], 'bits', INT, 'Fractional bits add: ' + p[2] + '. So do the integer bits.', [p[2] / 2, p[2] + 1]); },
        shift: function () { var p = pick([['Shifting right by 3 divides by', 8], ['Shifting left by 5 multiplies by', 32], ['Dividing by 16 is a right shift by how many bits', 4], ['Multiplying by 1024 is a left shift by how many bits', 10], ['Shifting right by 8 divides by', 256]]); return num(p[0] + '?', p[1], '', INT, 'Each bit of shift is a factor of two: ' + p[1] + '.', [p[1] * 2, p[1] / 2]); },
        wrap: lv(2, function () { var p = pick([[30000, 10000], [20000, 20000], [32767, 1], [-30000, -10000]]), sum = p[0] + p[1], sat = rnd() < 0.5, a = sat ? Math.max(-32768, Math.min(32767, sum)) : ((sum + 32768) % 65536 + 65536) % 65536 - 32768; return num('16-bit signed: ' + fixed(p[0], 0) + ' + ' + fixed(p[1], 0) + ' with ' + (sat ? 'saturation' : 'wrap-around') + ' gives?', a, '', INT, 'The true sum ' + fixed(sum, 0) + ' does not fit in −32768…32767. ' + (sat ? 'Saturation clamps it to ' : 'Wrap-around subtracts or adds 65536: ') + fixed(a, 0) + '.', [sum, -a, sat ? sum - 65536 : 32767], { neg: true }); }),
        guard: lv(2, function () { var k = pick([8, 100, 256, 1024, 5]); return num('Accumulating ' + k + ' full-scale values without overflow: guard bits needed?', Math.ceil(Math.log2(k)), 'bits', INT, '⌈log₂(' + k + ')⌉ = ' + Math.ceil(Math.log2(k)) + ' bits.', [k, Math.ceil(Math.log2(k)) * 2]); }),
        q15m: lv(3, function () { var p = pick([[0.5, 0.5], [0.5, 0.25], [-0.5, 0.5], [0.25, 0.25], [0.5, -0.125]]), a = p[0] * p[1] * 32768; return num('Q1.15: ' + fmt(p[0]) + ' × ' + fmt(p[1]) + ', after shifting the product right by 15. Stored integer?', a, '', INT, 'The value is ' + fmt(p[0] * p[1], 5) + '; times 32768 = ' + fixed(a, 0) + '.', [a * 2, -a, a / 2], { neg: true }); }),
        coef: lv(3, function () { var a = pick([48, 60, 72, 96]); return num('Filter coefficients for about ' + a + ' dB of stopband: roughly how many bits (6 dB per bit)?', Math.round(a / 6.02), 'bits', INT, 'About 6 dB per bit: ' + a + ' / 6 ≈ ' + Math.round(a / 6.02) + ' bits, plus a couple to be safe.', null, { pos: true }); })
      }
    }
  );

  /* ---------- level 2 and 3 content: harder question types that unlock as a chapter levels up ---------- */
  var EXTRA = {
    db: {
      sum: lv(2, function () {
        var t, a, b, c;
        do { a = pick([3, 6, 10, 13, 20, -3, -6, -10, 7, -7]); b = pick([3, 6, 10, -3, -6, -10, 7]); c = pick([3, 6, 10, -3, -6, 20, -20]); t = a + b + c; } while (t < -20 || t > 30);
        return num(sg(a) + ' dB, then ' + sg(b) + ' dB, then ' + sg(c) + ' dB. Overall power ratio?', calc.lin10(t), '×', R8, 'Add the dB first: ' + sg(t) + ' dB. Then convert: ×' + fmt(calc.lin10(t)) + '.', [calc.lin20(t)]);
      }),
      odd: lv(2, function () {
        if (rnd() < 0.5) { var r = pick([3, 6, 7, 15, 30, 60, 300, 1.5, 0.3]), a = calc.db10(r); return num('Power ratio ×' + fmt(r) + ' in dB?', a, 'dB', DB, '×3 ≈ 4.8 dB and ×7 ≈ 8.5 dB are worth knowing; the rest build from them. ×' + fmt(r) + ' = ' + f1(a) + ' dB.', [calc.db20(r)]); }
        var d = pick([1, 2, 4, 5, 8, 11, 15, -1, -2, -5]);
        return num(sg(d) + ' dB as a power ratio?', calc.lin10(d), '×', R8, '1 dB ≈ ×1.26, 2 dB ≈ ×1.6, 4 dB ≈ ×2.5, 5 dB ≈ ×3.16, 8 dB ≈ ×6.3. ' + sg(d) + ' dB = ×' + fmt(calc.lin10(d)) + '.', [calc.lin20(d)]);
      }),
      addp: lv(3, function () {
        var a = pick([-30, -20, -10, 0, 10]), b = a - pick([0, 0, 3, 6, 10]), t = calc.db10(calc.lin10(a) + calc.lin10(b));
        return num('Two uncorrelated signals, ' + sg(a) + ' dBm and ' + sg(b) + ' dBm, add together. Total power?', t, 'dBm', DB, 'Add the watts, not the dB. Equal powers give +3 dB; a signal 3 dB lower adds 1.8 dB, 6 dB lower about 1 dB, 10 dB lower about 0.4 dB. Total: ' + f1(t) + ' dBm.', [a + b, a + 6, a + 10]);
      }),
      pct: lv(3, function () {
        var x = pick([0.1, 0.5, 1, 2, 3, 6, 10, 20]);
        return num('A loss of ' + x + ' dB leaves what percentage of the power?', 100 * calc.lin10(-x), '%', R5, '10^(−' + x + '/10) = ' + fmt(calc.lin10(-x)) + ', so ' + fmt(100 * calc.lin10(-x)) + ' % gets through. 1 dB costs about 20 %, 0.5 dB about 11 %.');
      })
    },
    dbm: {
      v2dbm: lv(2, function () {
        var p = pick([[1, '1 V'], [0.1, '100 mV'], [0.01, '10 mV'], [1e-3, '1 mV'], [1e-6, '1 µV'], [0.5e-6, '0.5 µV'], [10e-6, '10 µV'], [2, '2 V'], [0.224, '224 mV']]), a = calc.dbm(p[0] * p[0] / 50);
        return num(p[1] + ' RMS across 50 Ω in dBm?', a, 'dBm', DB, '1 V RMS is +13 dBm and 1 µV is −107 dBm. Every ×10 in voltage is 20 dB. ' + p[1] + ' = ' + f1(a) + ' dBm.', [a + 10, a - 10]);
      }),
      dbuv: lv(3, function () {
        if (rnd() < 0.5) { var x = pick([0, 20, 30, 40, 60, 87, 107]); return num(x + ' dBµV in a 50 Ω system, in dBm?', x - 107, 'dBm', DB, '0 dBµV is 1 µV, which into 50 Ω is −107 dBm. So dBm = dBµV − 107.', [x + 107, x - 90]); }
        var d = pick([-107, -100, -87, -47, -7, 0]);
        return num(sg(d) + ' dBm in a 50 Ω system, in dBµV?', d + 107, 'dBµV', DB, 'dBµV = dBm + 107, because 1 µV into 50 Ω is −107 dBm.', [d - 107, d + 90]);
      }),
      psd: lv(3, function () {
        var p = pick([-30, -10, 0, 10, 20, 30]), b = pick([1e3, 1e4, 1e5, 1e6, 1e7, 2e7]), a = p - calc.db10(b);
        return num(sg(p) + ' dBm spread evenly over ' + qty(b, 'Hz') + ': power density?', a, 'dBm/Hz', DB, 'Subtract 10·log(bandwidth): ' + sg(p) + ' − ' + f1(calc.db10(b)) + ' = ' + f1(a) + ' dBm/Hz.', [p + calc.db10(b)]);
      })
    },
    chain: {
      split: lv(2, function () {
        var n = pick([2, 3, 4, 8, 16]);
        return num('Ideal ' + n + '-way power splitter: loss to each output?', calc.db10(n), 'dB', DB, 'Each output gets 1/' + n + ' of the power: 10·log(' + n + ') = ' + f1(calc.db10(n)) + ' dB.', [calc.db20(n)]);
      }),
      ip3: lv(3, function () {
        var po = pick([-20, -10, 0, 10]), d = pick([20, 25, 30, 40]), oip3 = po + d;
        if (rnd() < 0.5) return num('Two tones at ' + sg(po) + ' dBm each leave an amplifier with OIP3 = ' + sg(oip3) + ' dBm. Level of the third-order products?', po - 2 * d, 'dBm', DB,
          'They sit 2 × (OIP3 − P_out) = ' + (2 * d) + ' dB below the tones: ' + sg(po - 2 * d) + ' dBm. Each 1 dB of back-off buys 2 dB.', [po - d, po - 3 * d]);
        return num('Two tones at ' + sg(po) + ' dBm each, OIP3 = ' + sg(oip3) + ' dBm. How far below the tones are the third-order products?', 2 * d, 'dBc', DB, 'Distance = 2 × (OIP3 − P_out) = 2 × ' + d + ' = ' + (2 * d) + ' dB.', [d, 3 * d]);
      })
    },
    wave: {
      eps: lv(2, function () {
        var f = pick([145, 435, 1090, 2400, 5800, 10000]), e = pick([[2.1, 'PTFE (εr 2.1)'], [2.25, 'polyethylene (εr 2.25)'], [4, 'a dielectric with εr = 4'], [4.4, 'FR-4 (εr 4.4)'], [9, 'a dielectric with εr = 9']]), u = lenU(300 / f / Math.sqrt(e[0]));
        return num('Wavelength at ' + qf(f) + ' inside ' + e[1] + '?', u.v, u.u, R5, 'Divide the free-space wavelength by √εr: ' + lenStr(300 / f) + ' / ' + fmt(Math.sqrt(e[0])) + ' = ' + fmt(u.v) + ' ' + u.u + '.', [u.v * Math.sqrt(e[0]), u.v / Math.sqrt(e[0])]);
      }),
      elen: lv(3, function () {
        var l, f, vf, deg;
        do { l = pick([0.05, 0.1, 0.25, 0.5, 1]); f = pick([75, 150, 300, 600]); vf = pick([1, 0.66]); deg = 360 * l / (300 / f * vf); } while (deg > 720 || deg < 5);
        return num(lenStr(l) + ' of ' + (vf === 1 ? 'air line' : 'coax (velocity factor ' + vf + ')') + ' at ' + qf(f) + ': electrical length in degrees?', deg, '°', R5,
          'Wavelength in the line is ' + lenStr(300 / f * vf) + '. ' + lenStr(l) + ' is ' + fmt(l / (300 / f * vf)) + ' wavelengths × 360° = ' + fmt(deg) + '°.');
      })
    },
    match: {
      z2g: lv(2, function () {
        var r = pick([0, 10, 25, 75, 100, 150, 200, 450]), g = Math.abs(r - 50) / (r + 50);
        return num('|Γ| for ' + (r === 0 ? 'a short circuit' : 'a ' + r + ' Ω load') + ' on a 50 Ω line?', g, '', { abs: 0.03 }, '|Γ| = |Z_L − Z₀| / (Z_L + Z₀) = ' + Math.abs(r - 50) + ' / ' + (r + 50) + ' = ' + f2(g) + '.', [1 - g, g / 2], { pos: true });
      }),
      qw: lv(3, function () {
        var p = pick([[50, 100], [50, 200], [50, 75], [50, 12.5], [75, 300], [50, 450]]), z = Math.sqrt(p[0] * p[1]);
        return num('Quarter-wave transformer between ' + p[0] + ' Ω and ' + p[1] + ' Ω: line impedance needed?', z, 'Ω', R5, 'Z = √(Z₁·Z₂) = √(' + fmt(p[0] * p[1], 5) + ') = ' + fmt(z) + ' Ω.', [(p[0] + p[1]) / 2]);
      }),
      lq: lv(3, function () {
        var p = pick([[50, 100], [50, 250], [50, 500], [10, 50], [50, 1300]]), q = Math.sqrt(p[1] / p[0] - 1);
        return num('L-match between ' + p[0] + ' Ω and ' + p[1] + ' Ω: loaded Q?', q, '', { rel: 0.06 }, 'Q = √(R_high/R_low − 1) = √(' + fmt(p[1] / p[0] - 1) + ') = ' + fmt(q) + '. A bigger impedance ratio means a narrower match.');
      })
    },
    noise: {
      nt: lv(2, function () {
        if (rnd() < 0.5) { var nf = pick([0.5, 1, 2, 3, 6, 10]); return num('Noise figure ' + nf + ' dB as a noise temperature?', 290 * (calc.lin10(nf) - 1), 'K', R8, 'T = 290·(F − 1) = 290 × ' + fmt(calc.lin10(nf) - 1) + ' = ' + fmt(290 * (calc.lin10(nf) - 1)) + ' K. 1 dB ≈ 75 K, 3 dB ≈ 290 K.'); }
        var t = pick([35, 75, 170, 290, 870]);
        return num('Noise temperature ' + t + ' K as a noise figure?', calc.db10(1 + t / 290), 'dB', { abs: 0.3 }, 'F = 1 + T/290 = ' + fmt(1 + t / 290) + ' → ' + f1(calc.db10(1 + t / 290)) + ' dB.', null, { pos: true });
      }),
      att: lv(2, function () {
        var loss = pick([1, 2, 3, 6, 10]), nf = pick([1, 2, 3, 5]);
        return num(loss + ' dB of cable loss ahead of a receiver with NF ' + nf + ' dB. System noise figure?', loss + nf, 'dB', DB, 'Loss before the first amplifier adds dB for dB: ' + loss + ' + ' + nf + ' = ' + (loss + nf) + ' dB. That is why the LNA goes at the antenna.', [nf, loss], { pos: true });
      }),
      cn0: lv(3, function () {
        var p = pick([-130, -125, -120, -110, -100]), nf = pick([1, 2, 3, 5]);
        return num('Carrier ' + sg(p) + ' dBm, receiver NF ' + nf + ' dB. C/N₀?', p + 174 - nf, 'dB-Hz', DB, 'N₀ = −174 + ' + nf + ' = ' + sg(-174 + nf) + ' dBm/Hz. C/N₀ = ' + sg(p) + ' − (' + sg(-174 + nf) + ') = ' + (p + 174 - nf) + ' dB-Hz.', [p + 174 + nf]);
      })
    },
    link: {
      hor: lv(2, function () {
        var h = pick([1, 2, 10, 30, 100, 1000, 10000]);
        return num('Radio horizon for an antenna ' + fmt(h, 5) + ' m above flat ground?', 4.12 * Math.sqrt(h), 'km', R8, 'd(km) ≈ 4.12·√h(m) with standard refraction = 4.12 × ' + fmt(Math.sqrt(h)) + ' = ' + fmt(4.12 * Math.sqrt(h)) + ' km.');
      }),
      los: lv(3, function () {
        var h1 = pick([2, 10, 30]), h2 = pick([1000, 3000, 10000]), d = 4.12 * (Math.sqrt(h1) + Math.sqrt(h2));
        return num('Line-of-sight range between an antenna at ' + h1 + ' m and an aircraft at ' + h2 + ' m?', d, 'km', R8, 'Add the two horizons: 4.12 × (√' + h1 + ' + √' + h2 + ') = 4.12 × ' + fmt(Math.sqrt(h1) + Math.sqrt(h2)) + ' = ' + fmt(d) + ' km.');
      }),
      frz: lv(3, function () {
        var p = pick([[10, 2.4], [1, 5.8], [50, 0.435], [20, 10], [5, 2.4], [100, 1.09]]), r = 8.66 * Math.sqrt(p[0] / p[1]);
        return num('First Fresnel zone radius at mid-path: ' + p[0] + ' km link at ' + p[1] + ' GHz?', r, 'm', R8, 'r(m) ≈ 8.66·√(d(km)/f(GHz)) = 8.66 × ' + fmt(Math.sqrt(p[0] / p[1])) + ' = ' + fmt(r) + ' m. Keep about 60 % of it clear.');
      }),
      maxd: lv(3, function () {
        var f = pick([145, 435, 1090, 2400]), PL = Math.round(calc.fspl(f, pick([5, 10, 20, 50, 100, 200, 400]))), x = PL - 32.45 - 20 * log10(f), d = Math.pow(10, x / 20);
        return num('You can tolerate ' + PL + ' dB of path loss at ' + qf(f) + '. Maximum free-space distance?', d, 'km', { rel: 0.12 }, '20·log d = ' + PL + ' − 32.45 − ' + f1(20 * log10(f)) + ' = ' + f1(x) + ' dB → d ≈ ' + fmt(d) + ' km.');
      })
    },
    time: {
      v: lv(2, function () {
        var v = pick([30, 100, 250, 1000, 7500]), f = pick([435e6, 1090e6, 2.4e9, 10e9]), fd = calc.doppler(v, f);
        return num('A one-way Doppler shift of ' + qty(fd, 'Hz') + ' at ' + qty(f, 'Hz') + ': closing speed?', v, 'm/s', R8, 'v = f_d × λ = ' + qty(fd, 'Hz') + ' × ' + lenStr(3e8 / f) + ' = ' + fmt(v, 4) + ' m/s.');
      }),
      blind: lv(3, function () {
        var b = pick([[0.03, '10 GHz'], [0.1, '3 GHz'], [0.23, '1.3 GHz']]), prf = pick([500, 1000, 2000, 10000]), v = b[0] * prf / 2;
        return num('Radar at ' + b[1] + ' with a PRF of ' + qty(prf, 'Hz') + ': first blind speed?', v, 'm/s', R8, 'v = λ·PRF/2 = ' + lenStr(b[0]) + ' × ' + qty(prf, 'Hz') + ' / 2 = ' + fmt(v) + ' m/s. It is also the span of unambiguous velocity.', [v * 2]);
      }),
      vres: lv(3, function () {
        var b = pick([[0.03, '10 GHz'], [0.1, '3 GHz'], [0.23, '1.3 GHz']]), T = pick([1e-3, 10e-3, 50e-3, 0.1]), v = b[0] / (2 * T);
        return num('Radar at ' + b[1] + ' with a coherent dwell of ' + qty(T, 's') + ': velocity resolution?', v, 'm/s', R8, 'Δv = λ/(2T) = ' + lenStr(b[0]) + ' / (2 × ' + qty(T, 's') + ') = ' + fmt(v) + ' m/s. Longer dwell, finer Doppler.', [v * 2]);
      })
    },
    ant: {
      arr: lv(3, function () {
        var n = pick([2, 4, 8, 16, 64, 256]);
        return num('An array of ' + n + ' identical elements: gain over a single element?', calc.db10(n), 'dB', DB, 'Array gain = 10·log(N) = ' + f1(calc.db10(n)) + ' dB. Doubling the elements adds 3 dB.', [calc.db20(n)]);
      }),
      arrbw: lv(3, function () {
        var n = pick([4, 8, 16, 32, 64]);
        return num('Broadside beamwidth of a line array of ' + n + ' elements at λ/2 spacing?', 101.6 / n, '°', R10, 'θ ≈ 102° / N for half-wavelength spacing = ' + fmt(101.6 / n) + '°.');
      })
    },
    react: {
      cres: lv(2, function () {
        var p = pick([[1e-6, 15.92e6], [10e-6, 5.03e6], [100e-9, 159.2e6], [1e-3, 159.2e3], [1e-6, 5.03e6], [10e-6, 1.592e6]]), s = si(1 / (Math.pow(2 * PI * p[1], 2) * p[0]), 'F');
        return num('Capacitance to resonate ' + qty(p[0], 'H') + ' at ' + qty(p[1], 'Hz') + '?', s.v, s.u, R10, 'C = 1/((2πf)²·L) = ' + fmt(s.v) + ' ' + s.u + '. Anchor: 1 µH with 100 pF is 15.9 MHz; ÷10 in frequency needs ×100 in C.');
      }),
      qx: lv(2, function () {
        var p = pick([[500, 5], [100, 2], [50, 0.5], [1000, 10], [200, 4], [300, 2]]);
        return num('Inductor with ' + p[0] + ' Ω reactance and ' + p[1] + ' Ω series resistance: Q?', p[0] / p[1], '', R5, 'Q = X / R = ' + fmt(p[0] / p[1]) + '.');
      }),
      zmag: lv(3, function () {
        var p = pick([[3, 4], [30, 40], [50, 50], [100, 100], [5, 12], [8, 6], [600, 800]]), z = Math.hypot(p[0], p[1]);
        return num('Series ' + p[0] + ' Ω resistance and ' + p[1] + ' Ω reactance: impedance magnitude?', z, 'Ω', R5, '|Z| = √(R² + X²) = ' + fmt(z) + ' Ω. They add at right angles, not directly.', [p[0] + p[1]]);
      }),
      rp: lv(3, function () {
        var Q = pick([50, 100, 200]), X = pick([50, 100, 500]), s = si(Q * X, 'Ω');
        return num('Parallel-resonant tank with Q = ' + Q + ' and ' + X + ' Ω reactance: impedance at resonance?', s.v, s.u, R5, 'R_p = Q·X = ' + fmt(s.v) + ' ' + s.u + '.', [X / Q / (Q * X / s.v)]);
      })
    },
    ckt: {
      rise: lv(2, function () {
        var bw = pick([3.5e6, 20e6, 70e6, 100e6, 350e6, 1e9]), s = si(0.35 / bw, 's');
        return num('Rise time of a ' + qty(bw, 'Hz') + ' scope or amplifier?', s.v, s.u, R8, 't_r ≈ 0.35 / bandwidth = ' + fmt(s.v) + ' ' + s.u + '.');
      }),
      load: lv(3, function () {
        var p = pick([[5, 10e3, 10e3, 10e3], [12, 1e3, 1e3, 1e3], [10, 10e3, 10e3, 100e3], [3.3, 1e3, 2e3, 2e3], [9, 2e3, 1e3, 1e3]]), rb = p[2] * p[3] / (p[2] + p[3]), v = p[0] * rb / (p[1] + rb);
        return num(p[0] + ' V divider, ' + qty(p[1], 'Ω') + ' over ' + qty(p[2], 'Ω') + ', loaded with ' + qty(p[3], 'Ω') + '. Output voltage?', v, 'V', R5,
          'The load sits in parallel with the bottom resistor: ' + qty(rb, 'Ω') + '. V_out = ' + p[0] + ' × ' + fmt(rb / (p[1] + rb)) + ' = ' + fmt(v) + ' V.', [p[0] * p[2] / (p[1] + p[2])]);
      }),
      opamp: lv(3, function () {
        var p;
        if (rnd() < 0.5) { p = pick([[10e3, 1e3], [9e3, 1e3], [100e3, 1e3], [1e3, 1e3], [47e3, 4.7e3]]); return num('Non-inverting amplifier with R_f = ' + qty(p[0], 'Ω') + ' and R_g = ' + qty(p[1], 'Ω') + ': gain?', 1 + p[0] / p[1], '', R5, 'Gain = 1 + R_f/R_g = ' + fmt(1 + p[0] / p[1]) + '.', [p[0] / p[1], -p[0] / p[1]]); }
        p = pick([[10e3, 1e3], [100e3, 10e3], [22e3, 2.2e3], [1e3, 2e3], [100e3, 1e3]]);
        return num('Inverting amplifier with R_f = ' + qty(p[0], 'Ω') + ' and R_in = ' + qty(p[1], 'Ω') + ': gain?', -p[0] / p[1], '', R5, 'Gain = −R_f/R_in = ' + fmt(-p[0] / p[1]) + '.', [p[0] / p[1], -(1 + p[0] / p[1]), 1 + p[0] / p[1]]);
      })
    },
    sdr: {
      edge: lv(2, function () {
        var fc = pick([100, 145, 435, 1090, 1575, 2400]), fs = pick([1e6, 2e6, 2.4e6, 10e6, 20e6]), hi = rnd() < 0.5, h = fs / 2e6;
        return num('IQ capture centred on ' + fc + ' MHz at ' + qty(fs, 'S/s') + ': ' + (hi ? 'highest' : 'lowest') + ' frequency in view?', hi ? fc + h : fc - h, 'MHz', { abs: 0.05 },
          'IQ sampling shows fs/2 on each side of centre: ' + fc + (hi ? ' + ' : ' − ') + fmt(h) + ' = ' + fmt(hi ? fc + h : fc - h, 6) + ' MHz.', [hi ? fc + 2 * h : fc - 2 * h, hi ? fc - h : fc + h, fc]);
      }),
      ovs: lv(3, function () {
        var k = pick([4, 16, 64, 256]);
        if (rnd() < 0.5) return num('Oversampling by ' + k + ' and filtering: extra bits of resolution?', Math.log2(k) / 2, 'bits', INT, 'Each ×4 of oversampling spreads the quantisation noise for 6 dB, which is one extra bit: ' + (Math.log2(k) / 2) + ' bits.', [Math.log2(k)]);
        return num('Oversampling by ' + k + ' and filtering: SNR improvement?', calc.db10(k), 'dB', DB, 'Gain = 10·log(' + k + ') = ' + f1(calc.db10(k)) + ' dB. Each ×4 is 6 dB.', [calc.db20(k)]);
      }),
      jit: lv(3, function () {
        var p = pick([[100e6, 1e-12], [10e6, 1e-12], [1e9, 100e-15], [100e6, 10e-12], [1e9, 1e-12], [10e6, 10e-12]]), a = -20 * log10(2 * PI * p[0] * p[1]);
        return num('Sampling a ' + qty(p[0], 'Hz') + ' input with ' + qty(p[1], 's') + ' RMS clock jitter: SNR limit?', a, 'dB', { abs: 1 }, 'SNR = −20·log(2π·f·t_j) = ' + f1(a) + ' dB. Anchor: 100 MHz with 1 ps gives 64 dB; ×10 in either costs 20 dB.', null, { pos: true });
      })
    },
    alias: {
      iqfold: lv(3, function () {
        var fs = pick([1e6, 2e6, 2.4e6, 10e6]), off = pick([0.6, 0.7, 0.8, 0.9]) * fs * pick([1, -1]), a = ((off + fs / 2) % fs + fs) % fs - fs / 2, s = si(Math.abs(a), 'Hz'), v = a < 0 ? -s.v : s.v;
        return num('IQ sampling at ' + qty(fs, 'S/s') + '. A signal ' + qty(Math.abs(off), 'Hz') + (off > 0 ? ' above' : ' below') + ' centre appears at what offset (signed)?', v, s.u, { rel: 0.03 },
          'IQ data only holds ±fs/2. The signal wraps by one fs: ' + (off > 0 ? '+' : '−') + qty(Math.abs(off), 'Hz') + (off > 0 ? ' − ' : ' + ') + qty(fs, 'Hz') + ' = ' + fmt(v) + ' ' + s.u + '.', [-v, off / (Math.abs(a) / s.v)]);
      }),
      decal: lv(3, function () {
        var p = pick([[48e3, 4, 10e3], [48e3, 4, 7e3], [2.4e6, 10, 150e3], [1e6, 4, 200e3], [96e3, 2, 30e3]]), out = p[0] / p[1], s = si(calc.alias(p[2], out), 'Hz');
        return num(qty(p[0], 'S/s') + ' decimated by ' + p[1] + ' with no filter. A ' + qty(p[2], 'Hz') + ' tone ends up at?', s.v, s.u, { rel: 0.03 },
          'The new rate is ' + qty(out, 'S/s') + ', so anything above ' + qty(out / 2, 'Hz') + ' folds: |' + qty(p[2], 'Hz') + ' − ' + qty(out, 'Hz') + '| = ' + fmt(s.v) + ' ' + s.u + '.');
      })
    },
    fft: {
      zp: lv(2, function () {
        var p = pick([[1000, 1e3, 4096], [1024, 1.024e6, 8192], [100, 10e3, 1024], [4800, 48e3, 65536], [500, 1e6, 4096]]), s = si(p[1] / p[0], 'Hz'), k = p[1] / p[0] / s.v;
        return num(p[0] + ' samples at ' + qty(p[1], 'S/s') + ', zero-padded to ' + p[2] + ' points. True frequency resolution?', s.v, s.u, R5, 'Zero-padding only interpolates the spectrum. Resolution is still fs/N of the real data: ' + fmt(s.v) + ' ' + s.u + '.', [p[1] / p[2] / k]);
      }),
      rbw: lv(3, function () {
        var p = pick([[48e3, 4800], [1e6, 1000], [2.4e6, 2400], [10e6, 10000], [8e3, 800]]), s = si(1.5 * p[0] / p[1], 'Hz');
        return num('Hann-windowed FFT of ' + p[1] + ' points at ' + qty(p[0], 'S/s') + ': noise bandwidth of one bin?', s.v, s.u, R5, 'Bin width ' + qty(p[0] / p[1], 'Hz') + ' × 1.5 (the ENBW of Hann) = ' + fmt(s.v) + ' ' + s.u + '.', [s.v / 1.5]);
      }),
      nfloor: lv(3, function () {
        var k = pick([2, 4, 10, 16, 100]);
        return num('Making the FFT ' + k + ' times longer lowers the per-bin noise floor by?', calc.db10(k), 'dB', DB, 'Each bin gets ' + k + ' times narrower, so it holds 10·log(' + k + ') = ' + f1(calc.db10(k)) + ' dB less noise. A tone stays where it was.', [calc.db20(k)]);
      })
    },
    win: {
      loss: lv(3, function () {
        var L = { 'Hann': '1.76 dB', 'Hamming': '1.34 dB', 'Blackman': '2.37 dB' }, w = pick(Object.keys(L));
        return mc('SNR lost to a ' + w + ' window compared with rectangular?', L[w], ['0 dB', '1.34 dB', '1.76 dB', '2.37 dB', '3.9 dB'], 'Processing loss = 10·log(ENBW in bins): Hamming 1.36 bins → 1.34 dB, Hann 1.5 → 1.76 dB, Blackman 1.73 → 2.37 dB.');
      }),
      corr: lv(3, function () {
        return item([
          ['To read a tone\'s true amplitude through a Hann window, multiply the peak by', '2', ['1.5', '1.41', '4'], 'The Hann coherent gain is 0.5, so amplitudes need ×2.'],
          ['To read noise density through a Hann window, divide bin power by a bandwidth of', '1.5 bins', ['1 bin', '2 bins', '4 bins'], 'Noise fills the window\'s equivalent noise bandwidth, 1.5 bins for Hann.'],
          ['Which window choice changes how far apart two tones must be to resolve?', 'Main-lobe width', ['Sidelobe roll-off rate', 'Coherent gain', 'Scalloping loss'], 'Resolution is set by main-lobe width; sidelobes set how weak a neighbour you can still see.'],
          ['A weak tone 5 bins from one 50 dB stronger: which window shows it?', 'Blackman', ['Rectangular', 'Hann at −31 dB', 'None can'], 'You need sidelobes well below −50 dB that close in. Blackman reaches −58 dB.']
        ]);
      })
    },
    xform: {
      am: lv(3, function () {
        var fm = pick([1, 5, 10, 20]), fc = pick([100, 455, 1000]), up = rnd() < 0.5;
        return num('A ' + fm + ' kHz tone multiplied by a ' + fc + ' kHz carrier: frequency of the ' + (up ? 'upper' : 'lower') + ' product?', up ? fc + fm : fc - fm, 'kHz', { abs: 0.4 },
          'Multiplying by a cosine puts copies at carrier ± tone: ' + (fc - fm) + ' kHz and ' + (fc + fm) + ' kHz.', [fc, up ? fc - fm : fc + fm, fm]);
      }),
      sym: lv(3, function () {
        return item([
          ['The transform of a real, even signal is', 'Real and even', ['Imaginary and odd', 'Real and odd', 'Imaginary and even'], 'Real and even stays real and even; real and odd becomes imaginary and odd.'],
          ['The transform of a real, odd signal is', 'Imaginary and odd', ['Real and even', 'Real and odd', 'Imaginary and even'], 'Real and even stays real and even; real and odd becomes imaginary and odd.'],
          ['The value of a spectrum at f = 0 equals', 'The area under the signal', ['The signal\'s peak value', 'The signal\'s energy', 'Zero'], 'X(0) is the integral of x(t): the DC bin is the total area.'],
          ['Multiplying a signal by cos(2πf₀t) gives', 'Half-size copies at +f₀ and −f₀', ['One full-size copy at +f₀', 'A copy at 2f₀ only', 'The same spectrum, phase-shifted'], 'A cosine is two complex exponentials of half amplitude, so the spectrum splits into two half-size copies.'],
          ['Parseval: energy summed in time equals', 'Energy summed in frequency', ['Twice the energy in frequency', 'The DC value squared', 'The peak of the spectrum'], 'Energy is the same in both domains.'],
          ['Doubling a signal\'s amplitude does what to its power spectrum?', 'Multiplies it by 4', ['Multiplies it by 2', 'Shifts it up in frequency', 'Leaves it unchanged'], 'Power goes with amplitude squared: ×2 in amplitude is ×4 (6 dB) in power.']
        ]);
      })
    },
    iq: {
      ppm: lv(2, function () {
        var p = pick([[1, 1090e6], [20, 2.4e9], [0.5, 12e9], [2, 435e6], [10, 100e6], [1, 10e9], [25, 145e6]]), s = si(p[0] * p[1] * 1e-6, 'Hz');
        return num(p[0] + ' ppm of oscillator error at ' + qty(p[1], 'Hz') + ': frequency error?', s.v, s.u, R5, '1 ppm is 1 Hz per MHz: ' + p[0] + ' × ' + fmt(p[1] / 1e6, 5) + ' Hz = ' + fmt(s.v) + ' ' + s.u + '.');
      }),
      evm: lv(3, function () {
        if (rnd() < 0.5) { var e = pick([1, 3.16, 5, 10, 31.6]); return num('An EVM of ' + e + ' % in dB?', calc.db20(e / 100), 'dB', DB, 'EVM(dB) = 20·log(EVM/100) = ' + f1(calc.db20(e / 100)) + ' dB. 10 % is −20 dB, 1 % is −40 dB.', [calc.db10(e / 100)]); }
        var d = pick([-40, -30, -26, -20]);
        return num('An EVM of ' + sg(d) + ' dB as a percentage?', 100 * calc.lin20(d), '%', R8, '100 × 10^(dB/20) = ' + fmt(100 * calc.lin20(d)) + ' %.');
      }),
      drift: lv(3, function () {
        var p = pick([[100, 1e-3, 36], [10, 10e-3, 36], [1000, 0.25e-3, 90], [50, 10e-3, 180], [25, 10e-3, 90], [500, 1e-3, 180]]);
        return num('A ' + qty(p[0], 'Hz') + ' frequency offset left uncorrected for ' + qty(p[1], 's') + ': phase drift in degrees?', p[2], '°', { abs: 2 }, 'Phase = 360° × f × t = 360 × ' + fmt(p[0] * p[1]) + ' = ' + p[2] + '°.', [p[2] * 2, p[2] / 2, 360 - p[2]]);
      })
    },
    dfreq: {
      cps: lv(2, function () {
        var x = pick([0.05, 0.1, 0.125, 0.2, 0.25, 0.4]), fs = pick([8e3, 48e3, 1e6, 2.4e6]), s = si(x * fs, 'Hz');
        return num(x + ' cycles per sample at ' + qty(fs, 'S/s') + ': frequency?', s.v, s.u, R5, 'f = (cycles per sample) × fs = ' + fmt(s.v) + ' ' + s.u + '. 0.5 cycles per sample is Nyquist.', [s.v * 2, s.v / 2]);
      }),
      ncores: lv(3, function () {
        var p = pick([[48e3, 16], [1.024e6, 10], [1e6, 20], [100e6, 32], [4.096e6, 12], [1e6, 16]]), s = si(p[0] / Math.pow(2, p[1]), 'Hz');
        return num('NCO with a ' + p[1] + '-bit phase accumulator at ' + qty(p[0], 'S/s') + ': frequency step?', s.v, s.u, R8, 'Step = fs / 2^N = ' + qty(p[0], 'Hz') + ' / 2^' + p[1] + ' = ' + fmt(s.v) + ' ' + s.u + '.');
      }),
      ncoword: lv(3, function () {
        var p = pick([[16, 4], [16, 8], [10, 4], [12, 16], [8, 4], [16, 16]]), w = Math.pow(2, p[0]) / p[1];
        return num(p[0] + '-bit NCO: tuning word for an output of fs/' + p[1] + '?', w, '', INT, 'Word = 2^N × f/fs = ' + Math.pow(2, p[0]) + ' / ' + p[1] + ' = ' + w + '.', [w * 2, w / 2, Math.pow(2, p[0])]);
      })
    },
    filt: {
      roll: lv(3, function () {
        var n = pick([1, 2, 3, 4, 6]), dec = rnd() < 0.5, a = dec ? 20 * n : 6.02 * n;
        return num('Order-' + n + ' low-pass, one ' + (dec ? 'decade' : 'octave') + ' above cutoff: attenuation (asymptote)?', a, 'dB', DB, 'Each order gives 20 dB per decade, or 6 dB per octave: ' + f1(a) + ' dB.', [dec ? 6 * n : 20 * n], { pos: true });
      }),
      cic: lv(3, function () {
        var p = pick([[3, 16], [4, 64], [5, 8], [3, 32], [2, 256]]), b = p[0] * Math.log2(p[1]);
        return num('CIC decimator with ' + p[0] + ' stages, decimating by ' + p[1] + ': bit growth?', b, 'bits', INT, 'Growth = N·log₂(R) = ' + p[0] + ' × ' + Math.log2(p[1]) + ' = ' + b + ' bits.', [Math.log2(p[1]), p[0] + Math.log2(p[1])]);
      })
    },
    mod: {
      eff: lv(3, function () {
        var p = pick([[2, 'QPSK', 1 / 2, '1/2', 0.2], [4, '16-QAM', 3 / 4, '3/4', 0.2], [6, '64-QAM', 2 / 3, '2/3', 0.25], [2, 'QPSK', 3 / 4, '3/4', 0.35], [8, '256-QAM', 3 / 4, '3/4', 0.2], [3, '8-PSK', 2 / 3, '2/3', 0.25]]), e = p[0] * p[2] / (1 + p[4]);
        return num(p[1] + ', code rate ' + p[3] + ', roll-off ' + p[4] + ': spectral efficiency?', e, 'b/s/Hz', R5, 'Bits per symbol × code rate / (1 + α) = ' + p[0] + ' × ' + p[3] + ' / ' + (1 + p[4]) + ' = ' + fmt(e) + ' b/s/Hz.', [p[0], p[0] * p[2]]);
      }),
      need: lv(3, function () {
        var e = pick([1, 2, 4, 6, 8, 10]), a = calc.db10(Math.pow(2, e) - 1);
        return num('Minimum SNR (Shannon limit) for ' + e + ' b/s/Hz?', a, 'dB', { abs: 0.7 }, 'SNR = 2^η − 1 = ' + (Math.pow(2, e) - 1) + ' → ' + f1(a) + ' dB. For large η that is about 3·η dB.');
      })
    },
    pg: {
      cw: lv(3, function () {
        var b = pick([1e6, 5e6, 10e6, 50e6, 100e6]), s = si(1 / b, 's');
        return num('A chirp with ' + qty(b, 'Hz') + ' of bandwidth, after pulse compression: pulse width?', s.v, s.u, R5, 'Compressed width ≈ 1/B = ' + fmt(s.v) + ' ' + s.u + ', whatever the transmitted length.');
      }),
      nci: lv(3, function () {
        var n = pick([4, 16, 100, 10000]);
        return num('Non-coherently averaging ' + n + ' spectra: approximate detection gain (√N rule)?', calc.db10(Math.sqrt(n)), 'dB', DB, 'Without phase, gain grows only as √N: 10·log(√' + n + ') = ' + f1(calc.db10(Math.sqrt(n))) + ' dB. Coherent averaging would give ' + f1(calc.db10(n)) + ' dB.', [calc.db10(n)]);
      })
    },
    quant: {
      qn: lv(3, function () {
        var l = pick([1e-3, 10e-3, 244e-6, 1, 0.1]), s = si(l / Math.sqrt(12), 'V');
        return num('Quantisation noise (RMS) for an LSB of ' + qty(l, 'V') + '?', s.v, s.u, R8, 'RMS = LSB/√12 ≈ 0.289 × LSB = ' + fmt(s.v) + ' ' + s.u + '.');
      }),
      q15: lv(3, function () {
        var p = pick([[0.5, 16384], [0.25, 8192], [-0.5, -16384], [0.125, 4096], [0.75, 24576], [-1, -32768]]);
        if (rnd() < 0.5) return num('Integer stored for ' + fmt(p[0]) + ' in Q1.15?', p[1], '', INT, 'Multiply by 2¹⁵ = 32768: ' + fmt(p[0]) + ' × 32768 = ' + fixed(p[1], 0) + '.', [p[1] * 2, p[1] / 2, -p[1]], { neg: true });
        return num('A Q1.15 word holding ' + fixed(p[1], 0) + ': its value?', p[0], '', { abs: 0.005 }, 'Divide by 2¹⁵ = 32768: ' + fmt(p[0]) + '.', [p[0] * 2, p[0] / 2, -p[0]]);
      }),
      trunc: lv(3, function () {
        var k = pick([1, 2, 4, 8]);
        return num('Dropping the ' + k + ' lowest bit' + (k > 1 ? 's' : '') + ' of a signal raises its quantisation noise by about?', 6.02 * k, 'dB', DB, 'About 6 dB per bit: ' + f1(6.02 * k) + ' dB.', null, { pos: true });
      })
    }
  };
  /* existing types that belong to level 2 */
  var GATE = { dbm: ['dbm2v'], chain: ['need'], link: ['dbd', 'range'], time: ['prf'], ant: ['ff'], react: ['bw'], ckt: ['led', 'caps'], sdr: ['adc'], alias: ['bp', 'zone'], fft: ['neg', 'nres'],
    win: ['enbw', 'misc'], xform: ['phase', 'nul'], iq: ['rot', 'magdb'], dfreq: ['w2f'], filt: ['taps', 'tc', 'pz'], mod: ['esn0', 'shan', 'ofdm'], pg: ['pc', 'ss', 'fftg'], quant: ['enob', 'grow', 'lsb'] };
  /* what each level of a chapter covers, shown on the chapter page */
  var LEVELS = {
    db: ['Anchor ratios to dB and back', 'In-between values and chained ratios', 'Adding powers, and dB as a percentage'],
    dbm: ['dBm, dBW and watts', 'Volts into 50 Ω, both ways', 'dBµV and power density in dBm/Hz'],
    chain: ['Short chains: output level and net gain', 'Longer chains, missing gain, splitters', 'Third-order intercept and intermod levels'],
    wave: ['Wavelength, fractions, band names', 'Velocity factor and dielectrics', 'Electrical length in degrees'],
    match: ['VSWR, return loss, reflected power', 'Reflection coefficient and mismatch loss', 'Quarter-wave transformers and L-match Q'],
    noise: ['kTB floor, noise figure, sensitivity', 'Noise temperature and loss ahead of the LNA', 'Cascaded noise figure and C/N₀'],
    link: ['Path loss, EIRP, received power, margin', 'dBd, range scaling, radio horizon', 'Line of sight, Fresnel zone, maximum distance'],
    time: ['Delay, echo range, Doppler shift', 'Unambiguous range and speed from Doppler', 'Blind speed and velocity resolution'],
    ant: ['Beamwidth, dish gain, dipoles, polarisation', 'Far field and effective aperture', 'Array gain and array beamwidth'],
    react: ['Reactance, resonance, time constants', 'Bandwidth, Q, and choosing C for resonance', 'Impedance magnitude and tank impedance'],
    ckt: ['Parallel parts, dividers, cutoffs, prefixes', 'LED resistors, capacitors, rise time', 'Loaded dividers and op-amp gains'],
    sdr: ['Nyquist, IQ bandwidth, file sizes', 'ADC range and band edges of a capture', 'Oversampling gain and clock jitter'],
    alias: ['Alias frequency and decimation', 'Nyquist zones and bandpass sampling', 'IQ wrap-around and unfiltered decimation'],
    fft: ['Bin width, bin index, capture time', 'FFT length, negative bins, zero-padding', 'Noise bandwidth and noise floor per bin'],
    win: ['Sidelobes, main lobes, choosing a window', 'ENBW, scalloping, roll-off', 'Processing loss and corrections'],
    xform: ['Fourier pairs and properties', 'Pulse nulls and delay as phase', 'Symmetry, modulation products, Parseval'],
    iq: ['Magnitude, phase, rotation by j', 'Frequency offset, dB, ppm errors', 'EVM and phase drift'],
    dfreq: ['Radians per sample, samples per cycle', 'Converting back to Hz', 'NCO step size and tuning words'],
    filt: ['FIR delay, moving average, convolution length', 'Tap count, poles and zeros, time constants', 'Roll-off per order and CIC bit growth'],
    mod: ['Bits per symbol, bit rate, bandwidth', 'Coding, Eb/N0, Shannon capacity, OFDM', 'Spectral efficiency and the SNR it needs'],
    pg: ['Averaging gain and range resolution', 'FFT, pulse-compression and spreading gain', 'Compressed pulse width and non-coherent gain'],
    quant: ['Levels, bits, dBFS, fixed-point basics', 'LSB size, ENOB, bit growth', 'Quantisation noise, Q1.15 values, truncation']
  };
  MODULES.forEach(function (m) {
    var x = EXTRA[m.id] || {};
    Object.keys(x).forEach(function (id) { m.types[id] = x[id]; });
    (GATE[m.id] || []).forEach(function (id) { m.types[id].min = 2; });
    m.levels = m.levels || LEVELS[m.id];
  });

  var GROUPS = ['RF', 'DSP', 'Circuits'];
  var BY_ID = {};
  MODULES.forEach(function (m) { BY_ID[m.id] = m; });

  /* ---------- hidden chapters ---------- */
  function visible(mod, stats) { return !mod.parents || mod.parents.some(function (p) { return levelInfo(BY_ID[p], stats).complete; }); }
  function reveals(id) { return MODULES.filter(function (m) { return m.parents && m.parents.indexOf(id) >= 0; }); }

  /* ---------- selection ---------- */
  function typeIds(mod, L) { return Object.keys(mod.types).filter(function (id) { return (mod.types[id].min || 1) <= L; }); }
  function generate(modId, typeId, L) {
    var mod = BY_ID[modId], q = mod.types[typeId](L || 1);
    q.mod = modId; q.key = modId + '.' + typeId;
    return q;
  }
  function moduleLevel(mod, stats) { return levelInfo(mod, stats).level; }
  // A question type is mastered after NEED correct answers with at least 60 % accuracy.
  var NEED = 5, DONE = {};
  function typeState(mod, id, stats) {
    var t = stats[mod.id + '.' + id] || { n: 0, c: 0 }, min = mod.types[id].min || 1;
    return { id: id, min: min, n: t.n, c: t.c, mastered: t.c >= NEED && t.c / t.n >= 0.6, need: Math.max(0, NEED - t.c) };
  }
  // Level 2 opens after about three correct answers per level-1 type, level 3 after the same for levels 1 and 2.
  // A chapter is complete when every question type is mastered; once complete it stays complete (DONE is set by the app).
  function levelInfo(mod, stats) {
    var c = 0, n1 = 0, n2 = 0, total = 0, got = 0;
    Object.keys(mod.types).forEach(function (id) {
      var t = typeState(mod, id, stats);
      c += t.c; total++; if (t.mastered) got++;
      if (t.min === 1) n1++; else if (t.min === 2) n2++;
    });
    var at2 = Math.max(8, 3 * n1), at3 = Math.max(20, 3 * (n1 + n2)), L = c < at2 ? 1 : c < at3 ? 2 : 3;
    return { level: L, correct: c, at: [0, at2, at3], next: L === 1 ? at2 : L === 2 ? at3 : null, types: total, mastered: got, left: total - got, complete: !!DONE[mod.id] || got === total };
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
      return (1 + 3 * (1 - (s.c + 1) / (s.n + 2))) * (typeState(mod, id, stats).mastered ? 0.35 : 1);
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
    generate: generate, typeIds: typeIds, moduleLevel: moduleLevel, levelInfo: levelInfo, typeState: typeState, NEED: NEED, setDone: function (d) { DONE = d || {}; }, visible: visible, reveals: reveals, mastery: mastery, pickType: pickType, pickAny: pickAny,
    SCENARIOS: SCENARIOS, SCENARIO_TITLES: SCENARIO_TITLES, scenarioIndex: scenarioIndex,
    setRng: function (f) { rnd = f || Math.random; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : this);
