# Guitar Tuner with React Three Fiber

## Overview

Build a full-screen guitar tuner with React Three Fiber and Three.js: closest musical note in the center, static reference circle (blue), dynamic frequency circle (red; green when in tune). Mic access gated by a button; pitch via Web Audio API and autocorrelation.

## Ensuring both circles appear

- **Orthographic camera in world units**: R3F’s default orthographic camera uses pixel dimensions for the frustum (`left/right = ±width/2`, etc.), so radius-1 rings are ~1px and invisible. Use a **manual** orthographic camera with a fixed world-unit frustum so the circles are visible:
  - Configure the Canvas with `orthographic` and `camera={{ manual: true, position: [0, 0, 5], left: -2, right: 2, top: 2, bottom: -2, near: 0.1, far: 100 }}`.
  - Do **not** use drei’s `<OrthographicCamera>` here, as it overrides left/right/top/bottom with pixel size.
- **Ring orientation**: Three.js `RingGeometry` lies in the XY plane by default. Do **not** rotate the rings (e.g. no `rotation={[-Math.PI/2, 0, 0]}`). With the camera on +Z looking at the origin, rings in the XY plane are face-on; rotating them would show them edge-on and they would disappear.

## Background

- Use a **comfortable white tone** for the tuner UI and the 3D scene (e.g. `#f5f5f5` or `#fafafa`) so the app is easy on the eyes. Set the same value for:
  - The page/wrapper (e.g. `body` / `#root` or the tuner wrapper in CSS).
  - The R3F scene background: `<color attach="background" args={['#f5f5f5']} />` (or the chosen hex).

## Musical note text

- The centered note label (e.g. “A4”, “E2”) must use a **comfortable black** so it stays readable on the white background (e.g. `#1a1a1a` or `#2d2d2d`). In the scene, set the drei `Text` color to that value: `color="#1a1a1a"` (or the chosen hex).

## Rest of the plan

- **Dependencies**: three, @react-three/fiber, @react-three/drei.
- **Full-screen**: CSS so `html`, `body`, `#root` and the canvas wrapper are 100% width/height; canvas fills the viewport.
- **Mic**: One “Allow microphone” button; on success, hide it and render the full-screen Canvas. Create AudioContext only after the user gesture.
- **Pitch**: AnalyserNode + autocorrelation on `getFloatTimeDomainData()`; map frequency to closest note and cents; expose `{ frequency, noteName, noteWithOctave, cents, inTune }`.
- **Scene**: Orthographic camera (as above), centered note label (drei `Text`, color comfortable black e.g. `#1a1a1a`), reference ring (blue; green when in tune), frequency ring radius from cents (red; green when in tune). No rotation on rings.
- **Colors**: Reference circle blue when out of tune, frequency circle red when out of tune; both green when `|cents| < threshold`.
