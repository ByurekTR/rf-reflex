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
