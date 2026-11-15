# RF Reflex

Offline Android trainer for the mental math an RF and DSP engineer uses all day: decibels, dBm,
gain chains, wavelength, matching, noise, link budgets, Doppler, antennas, reactance, sampling,
aliasing, FFT numbers, windows, transform pairs, IQ, filters, modulation, processing gain and
quantisation. 22 chapters with three levels each, plus 14 hidden chapters that appear when the
chapter they build on is completed. 263 question types, all generated from formulas.

- **Practice** (10 questions), **Sprint** (60 or 120 s), **Daily mix** (20 questions weighted to
  weak spots) and a **Scenario** of the day (one real case worked in steps).
- Answer by multiple choice, by typing the number (small tolerance, because the skill is
  estimating), or by higher/lower.
- No permissions, no network. Progress is stored on the phone.

## Getting the APK

Every push to `main` builds a signed APK with GitHub Actions. Download `RF-Reflex.apk` from the
repository's **Releases** page (or from the run's artifacts) and install it. Builds share one
signing key, so updates install over the old version and keep your progress.

## How it is put together

The app is a small web page in `app/src/main/assets/` shown in a full-screen WebView:

| File | Role |
| --- | --- |
| `engine.js` | Formulas, question generators, answer checking. No DOM, runs under Node for tests. |
| `app.js` | Screens, sessions, progress storage. |
| `style.css`, `index.html` | Layout and theme. |
| `MainActivity.java` | Hosts the page, blocks network loads, forwards the back button. |

You can open `index.html` in a desktop browser to try changes without building.

## Tests

```
node tests/engine.test.js                                   # formulas + 150 samples of every question type per level
NODE_PATH=$(npm root -g) node tests/ui.test.js              # optional: drives the UI with Playwright
```

## Adding a question type

In `engine.js`, add a function to a module's `types`. Return `num(prompt, answer, unit, tolerance,
explanation, [commonWrongAnswers])` for a numeric question or `mc(prompt, answer, otherOptions,
explanation)` for a choice question. The tests pick it up automatically.
