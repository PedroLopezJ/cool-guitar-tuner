import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react'
import './App.css'
import { usePitchDetection } from './audio/usePitchDetection'
import { DEFAULT_TUNING_BY_INSTRUMENT, lowestFrequency, type Instrument } from './audio/tunings'

// The 3D tuner pulls in three / @react-three-fiber / drei (~1 MB) — none of which
// the initial mic-permission screen needs. Loading it lazily keeps that weight in
// a separate chunk; importTunerView() is reused to warm the chunk on intent
// (hover/focus) so it's usually ready by the time the mic is granted.
const importTunerView = () => import('./TunerView')
const TunerView = lazy(importTunerView)

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

	const versionBadge = <span className="app-version">v{__APP_VERSION__}</span>

	if (stream) {
		return (
			<>
				<Suspense
					fallback={
						<div className="tuner-canvas-wrapper">
							<div className="tuner-overlay" role="status" aria-live="polite">
								<p>Loading tuner…</p>
							</div>
						</div>
					}
				>
					<TunerView
						pitchState={pitchState}
						instrument={instrument}
						tuning={tuning}
						hasDetected={hasDetected}
						onChangeInstrument={changeInstrument}
						onChangeTuning={setTuning}
					/>
				</Suspense>
				{versionBadge}
			</>
		)
	}

	return (
		<>
			<div className="mic-button">
				<div className="mic-panel">
					<p className="mic-hint">
						We need your microphone to listen to your instrument and detect the pitch.
					</p>
					<button
						type="button"
						onClick={requestMic}
						onPointerEnter={() => void importTunerView()}
						onFocus={() => void importTunerView()}
					>
						Allow microphone
					</button>
					{error && (
						<p className="error" role="alert">
							{error}
						</p>
					)}
				</div>
			</div>
			{versionBadge}
		</>
	)
}

export default App
