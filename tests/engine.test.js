// Run: node tests/engine.test.js
const path = require('path');
const E = require(path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'engine.js'));
let fails = 0, checks = 0;
function near(name, got, want, tol) { checks++; if (!(Math.abs(got - want) <= tol)) { fails++; console.log('FAIL', name, 'got', got, 'want', want); } }
function ok(name, cond, info) { checks++; if (!cond) { fails++; console.log('FAIL', name, info || ''); } }
const c = E.calc;

// 1. Formulas against independently known values
near('db10(40)', c.db10(40), 16.02, 0.01);
near('db20(2)', c.db20(2), 6.02, 0.01);
near('lin10(7)', c.lin10(7), 5.012, 0.001);
near('lin20(-6)', c.lin20(-6), 0.5012, 0.001);
near('dbm(5 W)', c.dbm(5), 36.99, 0.01);
near('dbm(1 mW)', c.dbm(1e-3), 0, 1e-9);
near('watts(30 dBm)', c.watts(30), 1, 1e-9);
near('vrms(0 dBm)', c.vrms(0), 0.2236, 0.0001);
near('vrms(13 dBm)', c.vrms(13), 0.9988, 0.0005);
near('lambda(1090 MHz)', c.lambda(1090e6), 0.2752, 0.0001);
near('rl(1.5)', c.rl(1.5), 13.98, 0.01);
near('rl(2)', c.rl(2), 9.542, 0.001);
near('rl(3)', c.rl(3), 6.021, 0.001);
near('refl(2)', 100 * c.gamma(2) ** 2, 11.11, 0.01);
near('vswr(0.5)', c.vswr(0.5), 3, 1e-9);
near('mismatch(2)', c.mismatch(2), 0.5115, 0.001);
near('mismatch(3)', c.mismatch(3), 1.249, 0.001);
near('ktb(1 Hz)', c.ktb(1), -174, 1e-9);
near('ktb(1 MHz)', c.ktb(1e6), -114, 1e-9);
near('ktb(20 MHz)', c.ktb(20e6), -100.99, 0.01);
near('friis(1,20,10)', c.friis(1, 20, 10), 1.300, 0.002);
near('fspl(1090,200)', c.fspl(1090, 200), 139.22, 0.01);
near('fspl(12000,36000)', c.fspl(12000, 36000), 205.16, 0.01);
near('fspl(2400,1)', c.fspl(2400, 1), 100.05, 0.01);
near('xl(1 MHz,1 uH)', c.xl(1e6, 1e-6), 6.283, 0.001);
near('xc(1 MHz,1 nF)', c.xc(1e6, 1e-9), 159.15, 0.01);
near('f0(1 uH,100 pF)', c.f0(1e-6, 100e-12), 15.915e6, 1e3);
near('alias(70M,50M)', c.alias(70e6, 50e6), 20e6, 1);
near('alias(30k,48k)', c.alias(30e3, 48e3), 18e3, 1e-6);
near('alias(5k,8k)', c.alias(5e3, 8e3), 3e3, 1e-6);
near('zone(70M,50M)', c.zone(70e6, 50e6), 3, 0);
near('zone(10M,50M)', c.zone(10e6, 50e6), 1, 0);
near('adcSnr(12)', c.adcSnr(12), 74.0, 0.01);
near('shannon(1M,20dB)', c.shannon(1e6, 20), 6.658e6, 1e3);
near('shannon(1M,0dB)', c.shannon(1e6, 0), 1e6, 1);
near('dishGain(0.6m,12GHz)', c.dishGain(0.6, 0.025, 0.6), 35.33, 0.02);
near('beam(1m,10GHz)', c.beam(1, 0.03), 2.1, 1e-9);
near('farField(1m,10GHz)', c.farField(1, 0.03), 66.67, 0.01);
near('aeff(0dBi,1090MHz)', c.aeff(0, 0.27523), 60.28e-4, 0.05e-4);
near('doppler(250,1090M)', c.doppler(250, 1090e6), 908.3, 0.1);
near('doppler(7500,12G)', c.doppler(7500, 12e9), 300e3, 1);
[[130, 120], [500, 470], [6000, 5600], [250, 270], [40, 39], [700, 680], [9000, 8200], [1600, 1500], [50, 47], [3500, 3300], [14000, 15000], [160, 150]].forEach(([t, w]) => {
  const e = c.e12(t); near('e12(' + t + ')', e.value, w, 1e-6);
  // the answer must be clearly nearest on a linear scale too, so the question is unambiguous
  e.near.forEach(n => ok('e12 unambiguous ' + t, Math.abs(n - t) > Math.abs(e.value - t) * 1.15, n));
});

// 2. Formatting
ok('fmt 65536', E.fmt(65536) === '65536', E.fmt(65536));
ok('fmt 0.0153', E.fmt(0.0153) === '0.0153', E.fmt(0.0153));
ok('fmt -3', E.fmt(-3) === '−3', E.fmt(-3));
ok('fmt 2343.75', E.fmt(2343.75) === '2344', E.fmt(2343.75));
ok('fmt 1e-13', E.fmt(1e-13) === '0');

// 3. Every question type, many samples
let types = 0;
const bad = /NaN|undefined|Infinity|\?\?|×10\^/;
E.MODULES.forEach(mod => {
  ok(mod.id + ' anchors', mod.anchors.length >= 3);
  Object.keys(mod.types).forEach(id => {
    types++;
    for (let L = 1; L <= 3; L++) for (let i = 0; i < 150; i++) {
      const q = E.generate(mod.id, id, L), tag = q.key + ' L' + L + ' "' + q.prompt + '"';
      ok('prompt ' + tag, q.prompt && !bad.test(q.prompt));
      ok('explain ' + tag, q.explain && !bad.test(q.explain), q.explain);
      const ch = E.choices(q), labels = ch.map(x => x.label);
      ok('one correct ' + tag, ch.filter(x => x.correct).length === 1, labels.join(' | '));
      ok('distinct ' + tag, new Set(labels).size === labels.length, labels.join(' | '));
      ok('labels clean ' + tag, labels.every(l => l && !bad.test(l)), labels.join(' | '));
      if (q.kind === 'num') {
        ok('finite ' + tag, isFinite(q.answer));
        ok('self-check ' + tag, E.check(q, q.answer));
        ok('4 options ' + tag, ch.length === 4, labels.join(' | '));
        // the displayed answer, typed back in, must be accepted
        const shown = parseFloat(E.ansStr(q).replace('−', '-').replace('×', '').replace(/[^0-9.\-]+.*$/, ''));
        ok('shown answer accepted ' + tag, E.check(q, shown), E.ansStr(q) + ' vs ' + q.answer);
        // rejects something clearly wrong
        ok('rejects wrong ' + tag, !E.check(q, q.answer === 0 ? 50 : q.answer * 3 + 7));
        const h = E.hilo(q);
        ok('hilo ' + tag, h.refStr !== E.ansStr(q) && (h.answer === 'higher') === (q.answer > h.ref), h.refStr);
        ok('answer magnitude typeable ' + tag, Math.abs(q.answer) < 1e6 && (q.answer === 0 || Math.abs(q.answer) >= 0.001), q.answer);
      } else {
        ok('mc has answer ' + tag, q.options.indexOf(q.answer) >= 0);
        ok('mc 2+ options ' + tag, q.options.length >= 2);
      }
    }
  });
});

// 3b. Every chapter has something new at each level
E.MODULES.forEach(mod => {
  ok(mod.id + ' level text', mod.levels && mod.levels.length === 3);
  [1, 2, 3].forEach(L => ok(mod.id + ' has types at level ' + L, Object.keys(mod.types).some(id => (mod.types[id].min || 1) === L)));
  ok(mod.id + ' starts incomplete', !E.levelInfo(mod, {}).complete && E.levelInfo(mod, {}).level === 1);
  const full = {}; Object.keys(mod.types).forEach(id => full[mod.id + '.' + id] = { n: 6, c: 6, s: 6 });
  ok(mod.id + ' completes', E.levelInfo(mod, full).complete && E.levelInfo(mod, full).level === 3);
});

// 3bb. Per-type mastery, what is left, and sticky completion
{
  const m = E.BY_ID.db, st = {};
  ok('nothing mastered at start', E.levelInfo(m, st).mastered === 0 && E.levelInfo(m, st).left === Object.keys(m.types).length);
  st['db.p2db'] = { n: 5, c: 5, s: 5 };
  ok('one mastered', E.levelInfo(m, st).mastered === 1 && E.typeState(m, 'p2db', st).mastered && E.typeState(m, 'db2p', st).need === 5);
  st['db.db2p'] = { n: 20, c: 5, s: 0 };
  ok('low accuracy is not mastery', !E.typeState(m, 'db2p', st).mastered);
  st['db.v2db'] = { n: 4, c: 3, s: 0 };
  ok('need counts down', E.typeState(m, 'v2db', st).need === 2);
  E.setDone({ db: 1 });
  ok('sticky completion', E.levelInfo(m, st).complete && E.visible(E.BY_ID.snr, st));
  E.setDone({});
  ok('not complete without it', !E.levelInfo(m, st).complete && !E.visible(E.BY_ID.snr, st));
}

// 3c. Hidden chapters: every base chapter reveals one, and only once it is complete
const base = E.MODULES.filter(m => !m.parents), hidden = E.MODULES.filter(m => m.parents);
ok('14 hidden chapters', hidden.length === 14, hidden.length);
base.forEach(m => ok(m.id + ' reveals a chapter', E.reveals(m.id).length >= 1));
hidden.forEach(hm => {
  ok(hm.id + ' hidden at start', !E.visible(hm, {}));
  hm.parents.forEach(pid => {
    const full = {}; Object.keys(E.BY_ID[pid].types).forEach(id => full[pid + '.' + id] = { n: 6, c: 6, s: 6 });
    ok(hm.id + ' revealed by ' + pid, E.visible(hm, full));
    const part = {}; Object.keys(E.BY_ID[pid].types).forEach(id => part[pid + '.' + id] = { n: 3, c: 3, s: 3 });
    ok(hm.id + ' still hidden when ' + pid + ' is only part done', !E.visible(hm, part));
  });
});
base.forEach(m => ok(m.id + ' visible', E.visible(m, {})));

// 4. Scenarios and selection
E.SCENARIOS.forEach((f, i) => {
  for (let k = 0; k < 100; k++) {
    const s = f();
    ok('scenario title ' + i, s.title === E.SCENARIO_TITLES[i]);
    s.steps.forEach(q => {
      ok('scenario step ' + s.title + ' "' + q.prompt + '"', isFinite(q.answer) && !bad.test(q.prompt) && !bad.test(q.explain) && E.check(q, q.answer) && E.choices(q).length === 4 && E.BY_ID[q.mod]);
    });
  }
});
const stats = {};
for (let i = 0; i < 3000; i++) {
  const q = E.pickAny(stats, null);
  const s = stats[q.key] || (stats[q.key] = { n: 0, c: 0 });
  s.n++; if (Math.random() < 0.8) s.c++;
}
ok('pickAny reaches every module', E.MODULES.every(m => Object.keys(stats).some(k => k.startsWith(m.id + '.'))));
ok('levels rise', E.MODULES.some(m => E.moduleLevel(m, stats) === 3));
ok('gated types appear at level 3', !!stats['noise.friis'] || E.moduleLevel(E.BY_ID.noise, stats) < 3);

console.log(`${E.MODULES.length} modules, ${types} question types, ${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
