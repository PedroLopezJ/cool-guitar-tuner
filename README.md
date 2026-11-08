# Coolest Guitar & Bass Tuner

A browser tuner for guitar and bass. It listens to your microphone, finds the pitch in real time and shows how far you are from the target string in a 3D scene. It runs entirely in the browser (no backend) and installs as an offline PWA.

## Features

- **Accurate pitch detection.** Uses the McLeod Pitch Method (MPM) with FFT-accelerated autocorrelation. The analysis window grows automatically for the low B of a 5-string bass.
- **Guitar and bass tunings.** Standard, drop and open tunings, including extended range: 7/8-string guitar and 5/6-string bass.
- **String-relative tuning.** The target string of the selected tuning decides when you're in tune. An optional chromatic mode tunes to the nearest note instead.
- **Cents readout** with a flat/sharp hint, so tuning doesn't rely on color alone.
- **A4 calibration** from 430 to 450 Hz.
- **Tap a string to lock it** as the target, useful when a string is far enough off to jump to its neighbor.
- **Settings are remembered** between visits.
- **Auto-start** when the microphone permission is already granted.
- **Screen wake lock** keeps the display on while you tune.
- **Offline PWA.** The app is precached and the 3D text font is self-hosted.
- **Accessibility.** Screen-reader announcements and a keyboard-operable tuning selector.

## How it works

1. Captures the microphone with `getUserMedia`. Echo cancellation, noise suppression and auto gain are disabled because they distort pitch.
2. A Web Audio graph band-limits the signal with a high-pass that follows the tuning's lowest string and a 2 kHz low-pass, then feeds an `AnalyserNode`.
3. Each frame is decimated and analyzed with MPM's normalized square difference function. Picking the first strong peak avoids octave errors.
4. Readings are smoothed with a median filter and an EMA, and stabilized with note hysteresis. They are then matched to the target string to get the cents offset.
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

- `src/App.tsx`: app shell, microphone gate and settings.
- `src/TunerView.tsx`: the live tuner (3D scene and controls), lazy-loaded.
- `src/audio/`: pitch detection hook, note/frequency math, tunings and target-string logic, each with unit tests.
- `src/components/`: 3D scene, tuning selector, instrument toggle and string strip.
- `src/hooks/`: browser integrations such as the screen wake lock.
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
