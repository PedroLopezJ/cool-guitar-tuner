import { useState, useCallback, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import './App.css'
import { TunerSceneThree } from './components/TunerSceneThree'
import { TuningSelector } from './components/TuningSelector'
import { InstrumentToggle } from './components/InstrumentToggle'
import { StringStrip } from './components/StringStrip'
import { usePitchDetection } from './audio/usePitchDetection'
import {
	DEFAULT_TUNING_BY_INSTRUMENT,
	lowestFrequency,
	nearestString,
	stringNumber,
	type Instrument,
} from './audio/tunings'

// A tuner needs the raw signal: echo cancellation, noise suppression and auto
// gain (all on by default, especially in Firefox) distort pitch and amplitude.
const MIC_CONSTRAINTS: MediaStreamConstraints = {
	audio: {
		echoCancellation: false,
		noiseSuppression: false,
		autoGainControl: false,
	},
}

function describeMicError(err: unknown): string {
	const name =
		err && typeof err === 'object' && 'name' in err ? (err as { name?: string }).name : undefined
	switch (name) {
		case 'NotAllowedError':
		case 'SecurityError':
			return 'Microphone access was blocked. Allow the mic for this site in your browser settings, then reload.'
		case 'NotFoundError':
		case 'OverconstrainedError':
			return 'No microphone was found. Connect one and try again.'
		case 'NotReadableError':
			return 'The microphone is in use by another app. Close it and try again.'
		case 'AbortError':
			return 'Microphone start was interrupted. Please try again.'
		default:
			return err instanceof Error ? err.message : 'Could not access the microphone.'
	}
}

function App() {
	const [stream, setStream] = useState<MediaStream | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [instrument, setInstrument] = useState<Instrument>('guitar')
	const [tuning, setTuning] = useState(DEFAULT_TUNING_BY_INSTRUMENT.guitar)

	// Follow the selected tuning: search a little below its lowest string (so a
	// flat string still registers) and slide the high-pass down to match. Bass
	// drops the floor far lower than guitar; guitar only pays for it when a low
	// tuning is picked.
	const detectionOptions = useMemo(() => {
		const lowest = lowestFrequency(tuning)
		return { minFreq: lowest * 0.85, hpf: Math.max(20, lowest * 0.6) }
	}, [tuning])
	const pitchState = usePitchDetection(stream, detectionOptions)

	// Once the first note is heard we drop the "Listening…" prompt for good (for
	// this session); it shouldn't flash back every time the player pauses.
	const [hasDetected, setHasDetected] = useState(false)

	const changeInstrument = useCallback((next: Instrument) => {
		setInstrument(next)
		setTuning(DEFAULT_TUNING_BY_INSTRUMENT[next])
	}, [])

	// Which open string of the selected tuning the current pitch is closest to.
	const active = pitchState.frequency === null ? null : nearestString(pitchState.frequency, tuning)
	let stringInfo: { number: number | null; target: string } | null = null
	if (active) {
		const number = stringNumber(tuning, active.index)
		stringInfo = { number: number > 0 ? number : null, target: active.note }
	}

	const requestMic = useCallback(async () => {
		setError(null)
		if (!navigator.mediaDevices?.getUserMedia) {
			setError(
				'Microphone access needs a secure (https) page and a browser that supports the Web Audio API.',
			)
			return
		}
		try {
			const mediaStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
			setStream(mediaStream)
		} catch (err) {
			setError(describeMicError(err))
		}
	}, [])

	// Release the microphone (and clear the browser's "recording" indicator) when
	// the stream is replaced or the app unmounts.
	useEffect(() => {
		if (!stream) return
		return () => {
			stream.getTracks().forEach((track) => track.stop())
		}
	}, [stream])

	// Fresh session starts listening again; latch once a note comes through.
	useEffect(() => {
		setHasDetected(false)
	}, [stream])
	useEffect(() => {
		if (pitchState.frequency !== null) setHasDetected(true)
	}, [pitchState.frequency])

	if (stream) {
		return (
			<div className={`tuner-canvas-wrapper${pitchState.inTune ? ' in-tune' : ''}`}>
				{/* Cap the pixel ratio (Retina default 2–3× shades 4–9× the pixels for no
				    visible gain) and render on demand — a FrameLimiter in the scene drives
				    a steady ~30 fps instead of pinning the GPU at the display's full
				    refresh (120 Hz on ProMotion). */}
				<Canvas
					dpr={[1, 1.5]}
					flat
					orthographic
					frameloop="demand"
					camera={{ position: [0, 0, 5], zoom: 120 }}
				>
					<TunerSceneThree pitchState={pitchState} stringInfo={stringInfo} />
				</Canvas>
				<div className="electric-overlay" aria-hidden="true" />
				<InstrumentToggle value={instrument} onChange={changeInstrument} />
				<TuningSelector instrument={instrument} value={tuning} onChange={setTuning} />
				<StringStrip
					tuning={tuning}
					activeIndex={active ? active.index : null}
					inTune={pitchState.inTune}
				/>
				{!hasDetected && (
					<div className="tuner-overlay" role="status" aria-live="polite">
						<p>Listening… play a single note to start tuning.</p>
					</div>
				)}
			</div>
		)
	}

	return (
		<div className="mic-button">
			<div>
				<button type="button" onClick={requestMic}>
					Allow microphone
				</button>
				{error && (
					<p className="error" role="alert">
						{error}
					</p>
				)}
			</div>
		</div>
	)
}

export default App
