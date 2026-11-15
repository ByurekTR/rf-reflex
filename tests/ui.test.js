// Run: NODE_PATH=/opt/node22/lib/node_modules node tests/ui.test.js
const { chromium } = require('playwright');
const path = require('path');
const out = process.env.SHOTS || '/home/claude/shots';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'index.html'));
  const shot = n => p.screenshot({ path: path.join(out, n + '.png') });
  const act = sel => p.click(sel);
  const playRight = async n => { for (let i = 0; i < n; i++) { const k = await p.evaluate(() => window.rfCorrectIndex()); await p.click('.opt >> nth=' + k); await p.click('[data-act="next"]'); } };
  await shot('01-home');
  await p.screenshot({ path: path.join(out, '01b-home-full.png'), fullPage: true });
  await act('[data-id="noise"]'); await shot('02-module');
  // practice: 10 questions in choice mode, always picking the correct option
  await act('[data-mode="practice"]'); await shot('03-question');
  for (let i = 0; i < 10; i++) {
    const idx = await p.evaluate(() => 0);
    await act('.opt >> nth=' + idx);
    if (i === 0) await shot('04-feedback');
    await act('[data-act="next"]');
  }
  await shot('05-result');
  let txt = await p.textContent('.res');
  if (!/\/ 10/.test(txt)) errs.push('practice result: ' + txt);
  // typed mode
  await act('[data-act="home"]'); await act('[data-act="settings"]'); await act('[data-v="typed"]'); await shot('06-settings');
  await act('[data-act="home"]'); await act('[data-id="dbm"]'); await act('[data-mode="practice"]');
  for (const k of ['±', '1', '2', '.', '5']) await act('[data-k="' + k + '"]');
  await shot('07-typed');
  if ((await p.textContent('#entry')).indexOf('−12.5') < 0) errs.push('entry text: ' + await p.textContent('#entry'));
  await act('[data-k="del"]'); await act('#go'); await shot('08-typed-feedback');
  await act('[data-act="quit"]');
  // higher/lower sprint: answer for 3 seconds then let it run out is slow, so shorten the clock
  await act('[data-act="home"]'); await act('[data-act="settings"]'); await act('[data-v="hilo"]');
  await act('[data-act="home"]'); await act('[data-id="fft"]'); await act('[data-dur="60"]');
  await shot('09-hilo-sprint');
  for (let i = 0; i < 6; i++) { await p.click('[data-act="hl"]:not([disabled]), [data-act="opt"]:not([disabled])'); await p.waitForTimeout(450); const nx = await p.$('[data-act="next"]'); if (nx) await nx.click(); }
  await p.waitForTimeout(2600); // the clock only runs while a question is waiting for an answer
  const clock = await p.textContent('#clock');
  if (!/^0:5[5-8]$/.test(clock)) errs.push('sprint clock: ' + clock);
  await act('[data-act="quit"]');
  // scenario and daily mix, in auto mode
  await act('[data-act="home"]'); await act('[data-act="settings"]'); await act('[data-v="auto"]'); await act('[data-act="home"]');
  await act('[data-act="scenario"]'); await shot('10-scenario');
  for (let i = 0; i < 12; i++) { const o = await p.$('.opt:not([disabled])'); if (!o) break; await o.click(); await act('[data-act="next"]'); }
  await shot('11-scenario-result');
  await act('[data-act="home"]');
  if (!(await p.textContent('[data-act="scenario"]')).includes('DONE')) errs.push('scenario not marked done');
  await act('[data-act="mix"]');
  for (let i = 0; i < 20; i++) { await act('.opt:not([disabled]) >> nth=0'); await act('[data-act="next"]'); }
  txt = await p.textContent('.res'); if (!/\/ 20/.test(txt)) errs.push('mix result: ' + txt);
  await shot('12-mix-result');
  // back handling and persistence
  const handled = await p.evaluate(() => window.onAndroidBack());
  const atHome = await p.evaluate(() => window.onAndroidBack());
  if (handled !== true || atHome !== false) errs.push('back handling ' + handled + ' ' + atHome);
  await p.reload();
  const answered = await p.textContent('.today .stat:nth-child(2) b');
  if (+answered < 30) errs.push('progress not persisted: ' + answered);
  await p.screenshot({ path: path.join(out, '13-home-after.png'), fullPage: true });
  // levelling: 12 correct in Decibels unlocks level 2 and says so; a mastered chapter moves to Completed
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('rfreflex.v1')); s.types = {}; ['p2db', 'db2p', 'v2db'].forEach(k => s.types['db.' + k] = { n: 4, c: 4, s: 0 }); s.settings.input = 'choice'; localStorage.setItem('rfreflex.v1', JSON.stringify(s)); });
  await p.reload(); await act('[data-id="db"]');
  if (!/In progress: 12 of 12|LEVEL 2/.test(await p.textContent('#app'))) errs.push('level card: ' + (await p.textContent('.card')));
  await shot('16-levels');
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('rfreflex.v1')); s.types['db.p2db'].c = 3; s.types['db.p2db'].n = 3; localStorage.setItem('rfreflex.v1', JSON.stringify(s)); });
  await p.reload(); await act('[data-id="db"]'); await act('[data-mode="practice"]');
  await playRight(10);
  if (!/Decibels: level [23] unlocked/.test(await p.textContent('#app'))) errs.push('no level-up banner');
  await shot('17-levelup');
  await p.evaluate(() => { const E = window.Engine, s = JSON.parse(localStorage.getItem('rfreflex.v1')); Object.keys(E.BY_ID.db.types).forEach(k => s.types['db.' + k] = { n: 6, c: 6, s: 6 }); localStorage.setItem('rfreflex.v1', JSON.stringify(s)); });
  await p.reload();
  const groups = await p.$$eval('.group h2', els => els.map(e => e.textContent));
  const last = await p.$$eval('.group:last-of-type .mod b', els => els.map(e => e.textContent));
  if (!/Completed/.test(groups[groups.length - 1]) || last.join() !== 'Decibels') errs.push('completed section: ' + groups.join('|') + ' / ' + last.join());
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await shot('18-completed');
  // hidden chapters: nothing hidden is on the home screen until its parent is complete; finishing Decibels reveals one
  const names = await p.$$eval('.mod b', els => els.map(e => e.textContent));
  if (names.length !== 23 || !names.includes('Signal-to-noise maths') || names.includes('Dynamic range')) errs.push('visible chapters: ' + names.length + ' ' + names.join(','));
  if (!/13 hidden chapters left/.test(await p.textContent('.foot'))) errs.push('foot: ' + await p.textContent('.foot'));
  await act('[data-id="db"]'); if (!/Revealed by this chapter/.test(await p.textContent('#app'))) errs.push('no reveal card on finished chapter'); await shot('19-revealed');
  await act('[data-act="home"]'); await act('[data-id="chain"]'); if (!/Hidden chapter/.test(await p.textContent('#app')) || /Dynamic range/.test(await p.textContent('#app'))) errs.push('hidden chapter leaked or missing hint');
  await act('[data-act="home"]');
  // finishing the last needed question of a chapter announces the reveal on the result screen
  await p.evaluate(() => { const E = window.Engine, s = JSON.parse(localStorage.getItem('rfreflex.v1')); Object.keys(E.BY_ID.chain.types).forEach(k => s.types['chain.' + k] = { n: 6, c: 6, s: 0 }); s.types['chain.out'] = { n: 4, c: 4, s: 0 }; localStorage.setItem('rfreflex.v1', JSON.stringify(s)); });
  await p.reload();
  if ((await p.$$eval('.mod b', els => els.map(e => e.textContent))).includes('Dynamic range')) errs.push('Dynamic range visible too early');
  await act('[data-id="chain"]');
  if (!/4 of 5 mastered · 1 left to complete the chapter/.test(await p.textContent('#app')) || !/1 more correct/.test(await p.textContent('#app'))) errs.push('types-left card: ' + (await p.textContent('.tsum')));
  await shot('22-types-left');
  await act('[data-mode="practice"]'); await playRight(10);
  const rtxt = await p.textContent('#app');
  if (!/Gain chains complete/.test(rtxt) || !/New chapter revealed: Dynamic range/.test(rtxt)) errs.push('no reveal banner: ' + rtxt.slice(0, 200));
  await shot('20-reveal-banner');
  await act('.news >> nth=1'); if (!/Dynamic range/.test(await p.textContent('.head h1'))) errs.push('reveal banner does not open the chapter');
  await act('[data-act="home"]'); await shot('21-home-new');
  // dashboard
  await act('[data-act="dash"]');
  const dtxt = await p.textContent('#app');
  if (!/of 263 question types mastered/.test(dtxt) || !/2 \/ 36chapters complete/.test(dtxt) || !/2 \/ 14hidden revealed/.test(dtxt) || !/12 hidden chapters/.test(dtxt)) errs.push('dashboard: ' + dtxt.slice(0, 400));
  await p.screenshot({ path: path.join(out, '23-dashboard.png'), fullPage: true });
  await act('.crow >> nth=0'); if (!(await p.$('.head h1'))) errs.push('dashboard row does not open a chapter');
  await act('[data-act="home"]');
  // progress saved by 1.2 (no "done" list) keeps its completed chapters after the update
  await p.evaluate(() => { const E = window.Engine, s = JSON.parse(localStorage.getItem('rfreflex.v1')); delete s.done; s.types = {}; Object.keys(E.BY_ID.noise.types).forEach((k, i) => s.types['noise.' + k] = i === 0 ? { n: 4, c: 4, s: 0 } : { n: 6, c: 6, s: 0 }); localStorage.setItem('rfreflex.v1', JSON.stringify(s)); });
  await p.reload();
  const kept = await p.$$eval('.group:last-of-type .mod b', els => els.map(e => e.textContent));
  if (kept.join() !== 'Noise' || !(await p.$$eval('.mod b', els => els.map(e => e.textContent))).includes('System noise & G/T')) errs.push('1.2 progress not carried over: ' + kept.join());
  // small phone: nothing may overflow sideways on any screen
  await p.setViewportSize({ width: 320, height: 568 });
  await act('[data-id="mod"]'); await act('[data-mode="practice"]');
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (over) errs.push('horizontal overflow at 320px');
  await shot('14-small');
  // sprint runs out on its own and lands on the result screen with a rate
  await p.setViewportSize({ width: 390, height: 800 });
  await p.evaluate(() => window.onAndroidBack()); await p.evaluate(() => window.onAndroidBack());
  await p.clock.install();
  await act('[data-id="db"]'); await act('[data-dur="60"]');
  await act('.opt:not([disabled]) >> nth=0'); await p.clock.runFor(500);
  const nx = await p.$('[data-act="next"]'); if (nx) await nx.click();
  await p.clock.runFor(61000);
  const rt = await p.textContent('.res').catch(() => 'no result screen');
  if (!/correct per minute/.test(rt)) errs.push('sprint did not finish: ' + rt);
  await shot('15-sprint-result');
  await b.close();
  console.log(errs.length ? errs.join('\n') : 'UI OK');
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
