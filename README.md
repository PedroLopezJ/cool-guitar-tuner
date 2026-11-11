# Coolest Guitar & Bass Tuner

A browser tuner for guitar and bass. It listens to your microphone, finds the pitch in real time and shows how far you are from the target string in a 3D scene. It runs entirely in the browser (no backend) and installs as an offline PWA.

**Live:** [guitar-tuner.droplj.dev](https://guitar-tuner.droplj.dev/)

## Features

- **Accurate pitch detection.** Uses the McLeod Pitch Method (MPM) with FFT-accelerated autocorrelation. The analysis window grows automatically for the low B of a 5-string bass.
- **Guitar and bass tunings.** Standard, drop and open tunings, including extended range: 7/8-string guitar and 5/6-string bass.
- **String-relative tuning.** In string mode the target string of the selected tuning decides the ring offset and when you're in tune: an untouched E string in Eb Standard reads a semitone sharp, not green. Chromatic mode tunes to the nearest semitone instead.
- **Steady verdict.** "In tune" turns on within 5 cents and holds until you drift past 8, so it doesn't flicker at the edge.
- **Cents readout.** Signed whole cents ("−12", no unit symbol) with a "♭ Tune up", "♯ Tune down" or "✓ In tune" hint, so tuning doesn't rely on color alone.
- **Tuning-aware spelling.** Notes follow the tuning's accidentals: Eb Standard shows Eb, not D#.
- **A4 calibration** from 430 to 450 Hz in 1 Hz steps, with a one-tap reset to 440 Hz.
- **Lock a string.** In string mode, tap a string in the strip to make it the target, useful when a string is far enough off to read as its neighbor. Tap it again to go back to automatic. The lock resets when the tuning changes.
- **Settings are remembered** between visits: instrument, tuning, mode and A4.
- **Auto-start** when the microphone permission is already granted. If the browser keeps audio suspended until a gesture, the tuner asks for a tap.
- **Recovers from a lost microphone.** Unplugging it or revoking the permission returns to the start screen with an explanation.
- **Screen wake lock** keeps the display on while you tune.
- **Battery-friendly rendering.** About 30 fps while a note sounds, and about 10 fps once it's quiet.
- **Offline PWA.** The app is precached and the 3D text font is self-hosted.
- **Accessibility.**
  - Screen-reader announcements of the string or note and of in-tune changes, with note names spelled out ("E flat 2") and throttled so they don't flood.
  - A keyboard-operable tuning selector, string lock toggles and a mode radio group.
  - Reduced-motion support.

## How it works

1. Captures the microphone with `getUserMedia`. Echo cancellation, noise suppression and auto gain are disabled because they distort pitch.
2. A Web Audio graph band-limits the signal with a high-pass that follows the tuning's lowest string and a 2 kHz low-pass, then feeds an `AnalyserNode`.
3. Each frame is decimated and analyzed with MPM's normalized square difference function. Picking the first strong peak avoids octave errors.
4. Readings are smoothed with a median filter and an EMA, and stabilized with note hysteresis. They are then matched to the target string (nearest or locked; the nearest semitone in chromatic mode) to get the cents offset, relative to the calibrated A4.
5. A React Three Fiber scene draws the reference and offset rings, with a lazily loaded 3D bundle and a frame limiter.

## Tech stack

- React 19 + TypeScript
- Vite 7 + `vite-plugin-pwa`
- Three.js, `@react-three/fiber`, `@react-three/drei`
- Vitest + Testing Library
- Oxlint + Oxfmt

## Getting started

Requires Node `>=20.19` (see `.nvmrc`) and pnpm (version pinned in `packageManager`).

```bash
pnpm install
pnpm dev
```

Open the local URL Vite prints and allow microphone access. Microphone access needs a secure context (`https` or `localhost`).

## Scripts

| Script           | Description                        |
| ---------------- | ---------------------------------- |
| `pnpm dev`       | Start the dev server               |
| `pnpm build`     | Typecheck and build for production |
| `pnpm preview`   | Preview the production build       |
| `pnpm typecheck` | Run the TypeScript project build   |
| `pnpm test`      | Run tests in watch mode            |
| `pnpm test:run`  | Run tests once                     |
| `pnpm lint`      | Lint with Oxlint                   |
| `pnpm format`    | Format with Oxfmt                  |
| `pnpm check`     | Lint + format check                |
| `pnpm check:fix` | Auto-fix lint issues and format    |

## Project structure

- `src/App.tsx`: app shell, microphone gate, auto-start and settings state.
- `src/TunerView.tsx`: the live tuner (3D scene and controls), lazy-loaded. It resolves the target string, string lock and mode.
- `src/settings.ts`: persisted settings, validated on load.
- `src/speech.ts`: screen-reader wording (spelled-out notes and offsets).
- `src/audio/`: pitch detection (MPM), the detection hook, note/frequency math, tunings and target-string logic, each with unit tests.
- `src/components/`: 3D scene, tuning selector, instrument toggle, string strip, cents readout, and mode/A4 settings.
- `src/hooks/`: the screen wake lock and the screen-reader announcer.
- `public/`: favicon; PWA icons are generated from it via `pwa-assets.config.ts`.

## CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

1. `pnpm check`
2. `pnpm typecheck`
3. `pnpm test:run`
4. `pnpm build`

## Notes

- Works best with one clean note at a time, close to the microphone.
- Requires a modern browser with the Web Audio API.
