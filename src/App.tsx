import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react'
import './App.css'
import { usePitchDetection } from './audio/usePitchDetection'
import {
	DEFAULT_TUNING_BY_INSTRUMENT,
	lowestFrequency,
	type Instrument,
	type Tuning,
} from './audio/tunings'
import { useWakeLock } from './hooks/useWakeLock'
import { loadSettings, saveSettings, settingsTuning } from './settings'

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

const MIC_DISCONNECTED_MESSAGE = 'The microphone was disconnected. Reconnect it and try again.'

// How long the start screen stays blank waiting on the Permissions API before
// falling back to the "Allow microphone" button.
const PERMISSION_CHECK_TIMEOUT_MS = 300

/**
 * Start-screen state while there's no stream: 'checking' asks the Permissions
 * API whether the mic is already granted (shown as a neutral screen so the
 * button doesn't flash for returning users), 'starting' auto-requests a mic that
 * was granted before, and 'idle' shows the button.
 */
type StartPhase = 'checking' | 'starting' | 'idle'

const canQueryPermissions = () =>
	typeof navigator !== 'undefined' && typeof navigator.permissions?.query === 'function'

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
	const [startPhase, setStartPhase] = useState<StartPhase>(() =>
		canQueryPermissions() ? 'checking' : 'idle',
	)
	// Restore the last instrument/tuning; loadSettings() validates whatever it finds.
	const [initialSettings] = useState(loadSettings)
	const [instrument, setInstrument] = useState<Instrument>(initialSettings.instrument)
	const [tuning, setTuning] = useState<Tuning>(() => settingsTuning(initialSettings))

	useEffect(() => {
		saveSettings({ instrument, tuningId: tuning.id })
	}, [instrument, tuning.id])

	// Follow the selected tuning: search a little below its lowest string (so a
	// flat string still registers) and slide the high-pass down to match. Bass
	// drops the floor far lower than guitar; guitar only pays for it when a low
	// tuning is picked.
	const detectionOptions = useMemo(() => {
		const lowest = lowestFrequency(tuning)
		return { minFreq: lowest * 0.85, hpf: Math.max(20, lowest * 0.6) }
	}, [tuning])
	const pitchState = usePitchDetection(stream, detectionOptions)

	// Keep the screen on while tuning — nobody wants to tap the phone awake
	// between strings.
	useWakeLock(stream !== null)

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

	// Returning users who already granted the mic go straight to the tuner. Where
	// the Permissions API is missing (or doesn't know 'microphone', as in older
	// Firefox) we just show the button.
	useEffect(() => {
		if (!canQueryPermissions()) return
		let cancelled = false
		const timer = window.setTimeout(() => {
			setStartPhase((phase) => (phase === 'checking' ? 'idle' : phase))
		}, PERMISSION_CHECK_TIMEOUT_MS)
		navigator.permissions
			.query({ name: 'microphone' as PermissionName })
			.then(async (status) => {
				if (cancelled) return
				if (status.state !== 'granted') {
					setStartPhase('idle')
					return
				}
				setStartPhase('starting')
				void importTunerView()
				await requestMic()
				if (!cancelled) setStartPhase('idle')
			})
			.catch(() => {
				if (!cancelled) setStartPhase('idle')
			})
		return () => {
			cancelled = true
			window.clearTimeout(timer)
		}
	}, [requestMic])

	// Release the microphone (and clear the browser's "recording" indicator) when
	// the stream is replaced or the app unmounts.
	useEffect(() => {
		if (!stream) return
		return () => {
			stream.getTracks().forEach((track) => track.stop())
		}
	}, [stream])

	// A track ends on its own when the mic is unplugged, its permission is revoked
	// or the OS hands it to another app. Without this the tuner would sit on a
	// dead stream forever, so go back to the start screen and say why.
	useEffect(() => {
		if (!stream) return
		const tracks = stream.getAudioTracks()
		function onEnded() {
			setStream(null)
			setError(MIC_DISCONNECTED_MESSAGE)
		}
		tracks.forEach((track) => track.addEventListener('ended', onEnded))
		return () => {
			tracks.forEach((track) => track.removeEventListener('ended', onEnded))
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

	if (startPhase !== 'idle') {
		return (
			<>
				<div className="mic-button">
					{startPhase === 'starting' && (
						<div className="mic-panel" role="status" aria-live="polite">
							<p className="mic-hint">Starting microphone…</p>
						</div>
					)}
				</div>
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
