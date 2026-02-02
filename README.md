# Guitar Tuner

A browser-based guitar tuner that listens to your microphone, detects the closest musical note, and visualizes tuning accuracy in a 3D scene.

## Features

- Microphone-gated start with an explicit "Allow microphone" action
- Real-time pitch detection using Web Audio + autocorrelation
- Note + cents display logic with stability smoothing
- React Three Fiber scene with pulsing reference and offset rings
- Works entirely in the browser (no backend)

## How it works

- Requests a `MediaStream` from `navigator.mediaDevices.getUserMedia`.
- Creates an `AudioContext` + `AnalyserNode` and runs autocorrelation over time-domain data.
- Maps the detected frequency to the nearest note and computes cents offset.
- Smooths and stabilizes readings before updating the UI.
- Visualizes the current note in the center and offsets the ring radius by cents.

## Tech stack

- React 19 + TypeScript
- Vite
- Three.js + @react-three/fiber + @react-three/drei
- Vitest + Testing Library

## Getting started

```bash
pnpm install
pnpm dev
```

Then open the local URL shown by Vite and allow microphone access.

## Scripts

- `pnpm dev` - Start the dev server
- `pnpm build` - Typecheck and build
- `pnpm preview` - Preview the production build
- `pnpm test` - Run tests in watch mode
- `pnpm test:run` - Run tests once
- `pnpm lint` - Run Oxlint
- `pnpm format` - Run Oxfmt
- `pnpm check` - Lint + format check

## Project structure

- `src/App.tsx` - App shell and microphone gate
- `src/audio/usePitchDetection.ts` - Pitch detection + smoothing pipeline
- `src/audio/noteUtils.ts` - Note/frequency math helpers
- `src/components/TunerSceneThree.tsx` - R3F scene and visualizer

## Notes

- Requires a modern browser with Web Audio API and microphone access.
- Best results come from playing a single, clean note at a time.
