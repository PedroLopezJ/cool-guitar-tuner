import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_FREQ, MIN_FREQ, detectPitch } from './detectPitch'
import {
	DEFAULT_A4_HZ,
	clampA4Hz,
	frequencyToSemitone,
	getCents,
	isInTune,
	noteFromSemitone,
} from './noteUtils'

// The DSP lives in ./detectPitch; re-exported so existing imports keep working.
export { detectPitch, MAX_FREQ, MIN_FREQ } from './detectPitch'

const MIN_RMS = 0.008
// Minimum NSDF clarity (0..1) for a reading to be trusted.
const MIN_CLARITY = 0.7

const HOLD_MS = 220
const DETECT_HZ = 30
// Push to React state at most this often. Detection still runs at DETECT_HZ, but
// a sustained note only needs an occasional cents refresh — the rings ease
// smoothly between updates in the render loop. A real note/in-tune change is
// always emitted immediately (see tick()), regardless of this gate.
const EMIT_HZ = 15
const MEDIAN_WINDOW = 5
// Relative jump (≈ half a semitone) that we treat as a real note change and
// snap to instead of slowly easing toward with the EMA.
const SNAP_RATIO = 0.03
const EMA_ALPHA = 0.2
const NOTE_STABLE_FRAMES = 3
// Cents past the displayed note before we immediately accept a new one. Must be
// > 50 so that staying within a note never forces a relabel.
const NOTE_HYSTERESIS_CENTS = 60

const ENABLE_FILTERS = true
const HPF_HZ = 60
const LPF_HZ = 2000

// Analysis window. NSDF needs a few periods of the lowest note in the window to
// lock on: 4096 samples (~85 ms at 48 kHz) holds 3+ periods of anything above
// ~35 Hz, but only ~2.6 of a 5-string bass low B (≈ 31 Hz), which reads
// jittery. Doubling the window down there steadies it at the cost of latency,
// so guitar tunings (even the 8-string F#1 floor at ~39 Hz) keep the short one.
const WINDOW_SAMPLES = 4096
const LONG_WINDOW_SAMPLES = 8192
const LONG_WINDOW_BELOW_HZ = 35

/** Analyser window (fftSize) for a given detection floor. */
export function analysisWindowSize(minFreq: number): number {
	return minFreq < LONG_WINDOW_BELOW_HZ ? LONG_WINDOW_SAMPLES : WINDOW_SAMPLES
}

// The gesture events that grant user activation (pointerdown only counts for a
// mouse; touch activates on pointerup) — needed to resume a context the browser
// suspended under its autoplay policy.
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'keydown'] as const

/** 'interrupted' is iOS Safari's state during a phone call or Siri. */
function isSuspended(ctx: AudioContext): boolean {
	const state = ctx.state as AudioContextState | 'interrupted'
	return state === 'suspended' || state === 'interrupted'
}

/** resume() may be missing (old WebKit) or reject (no user activation yet). */
function safeResume(ctx: AudioContext): void {
	try {
		ctx.resume?.()?.catch(() => {
			// Not allowed yet (no user activation); a later gesture retries.
		})
	} catch {
		// Synchronous throw from a non-conforming implementation; same as above.
	}
}

function median(values: number[]): number {
	const sorted = values.toSorted((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export interface PitchState {
	frequency: number | null
	noteName: string
	noteWithOctave: string
	cents: number
	inTune: boolean
}

const initialPitchState: PitchState = {
	frequency: null,
	noteName: '—',
	noteWithOctave: '—',
	cents: 0,
	inTune: false,
}

function clampFrequency(freq: number, minFreq: number, maxFreq: number): number | null {
	if (!Number.isFinite(freq)) return null
	if (freq < minFreq || freq > maxFreq) return null
	return freq
}

export interface PitchDetectionOptions {
	/** Lowest frequency to search for; the HPF cutoff, NSDF lag range and analysis window follow it. */
	minFreq?: number
	/** High-pass cutoff (Hz) applied to the mic signal before detection. */
	hpf?: number
	/** Concert pitch for note names and cents (clamped to MIN_A4_HZ..MAX_A4_HZ). */
	a4Hz?: number
}

export function usePitchDetection(
	stream: MediaStream | null,
	options: PitchDetectionOptions = {},
): PitchState {
	const { minFreq = MIN_FREQ, hpf = HPF_HZ, a4Hz = DEFAULT_A4_HZ } = options
	const [state, setState] = useState<PitchState>(initialPitchState)
	const contextRef = useRef<AudioContext | null>(null)
	const analyserRef = useRef<AnalyserNode | null>(null)
	const highPassRef = useRef<BiquadFilterNode | null>(null)
	const bufferRef = useRef<Float32Array | null>(null)
	const rafRef = useRef<number>(0)
	// Read inside the rAF loop / graph so a tuning or calibration change adapts
	// live, without tearing down and rebuilding the audio graph.
	const minFreqRef = useRef(minFreq)
	const hpfRef = useRef(hpf)
	const a4Ref = useRef(clampA4Hz(a4Hz))
	const smoothedFreqRef = useRef<number | null>(null)
	const freqHistoryRef = useRef<number[]>([])
	const lastStableTimeRef = useRef(0)
	const lastDetectTimeRef = useRef(0)
	const lastEmitTimeRef = useRef(0)
	const stableSemitoneRef = useRef<number | null>(null)
	const pendingSemitoneRef = useRef<number | null>(null)
	const pendingCountRef = useRef(0)
	const inTuneRef = useRef(false)
	const lastStateRef = useRef(initialPitchState)

	const resetTracking = useCallback(() => {
		smoothedFreqRef.current = null
		freqHistoryRef.current = []
		stableSemitoneRef.current = null
		pendingSemitoneRef.current = null
		pendingCountRef.current = 0
		inTuneRef.current = false
	}, [])

	const cleanup = useCallback(() => {
		if (rafRef.current) cancelAnimationFrame(rafRef.current)
		rafRef.current = 0
		if (analyserRef.current && contextRef.current) {
			try {
				analyserRef.current.disconnect()
			} catch {
				// Already disconnected (e.g. the context closed first) — nothing to undo.
			}
		}
		if (contextRef.current?.state !== 'closed') {
			contextRef.current?.close()
		}
		contextRef.current = null
		analyserRef.current = null
		highPassRef.current = null
		bufferRef.current = null
		resetTracking()
		setState(initialPitchState)
		lastStateRef.current = initialPitchState
	}, [resetTracking])

	useEffect(() => {
		minFreqRef.current = minFreq
		// Grow/shrink the analysis window in place when the floor crosses the
		// long-window threshold (e.g. switching guitar ↔ 5-string bass).
		const analyser = analyserRef.current
		const size = analysisWindowSize(minFreq)
		if (analyser && analyser.fftSize !== size) {
			analyser.fftSize = size
			bufferRef.current = new Float32Array(size)
		}
	}, [minFreq])

	useEffect(() => {
		hpfRef.current = hpf
		if (highPassRef.current) highPassRef.current.frequency.value = hpf
	}, [hpf])

	useEffect(() => {
		a4Ref.current = clampA4Hz(a4Hz)
	}, [a4Hz])

	useEffect(() => {
		// No stream, nothing to run: the previous stream's effect cleanup already
		// tore the graph down and reset the state to idle.
		if (!stream) return

		const ctx = new (
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
		)()
		contextRef.current = ctx
		// Browsers can hand back a suspended context even after the mic gesture.
		safeResume(ctx)
		const analyser = ctx.createAnalyser()
		analyser.fftSize = analysisWindowSize(minFreqRef.current)
		analyserRef.current = analyser

		const source = ctx.createMediaStreamSource(stream)
		if (ENABLE_FILTERS) {
			const highPass = ctx.createBiquadFilter()
			highPass.type = 'highpass'
			highPass.frequency.value = hpfRef.current
			highPassRef.current = highPass
			const lowPass = ctx.createBiquadFilter()
			lowPass.type = 'lowpass'
			lowPass.frequency.value = LPF_HZ
			source.connect(highPass)
			highPass.connect(lowPass)
			lowPass.connect(analyser)
		} else {
			source.connect(analyser)
		}

		bufferRef.current = new Float32Array(analyser.fftSize)

		// Browsers suspend the context on their own: autoplay policy, a tab in the
		// background, an iOS phone call ('interrupted'). Try to get it running again
		// whenever that could now succeed — on a state change while visible, when the
		// page comes back, and on the next user gesture.
		const resumeIfSuspended = () => {
			if (contextRef.current !== ctx || !isSuspended(ctx)) return
			if (document.visibilityState === 'hidden') return
			safeResume(ctx)
		}
		const onVisibilityChange = () => {
			if (document.visibilityState === 'visible') resumeIfSuspended()
		}
		ctx.addEventListener?.('statechange', resumeIfSuspended)
		document.addEventListener('visibilitychange', onVisibilityChange)
		for (const type of GESTURE_EVENTS) document.addEventListener(type, resumeIfSuspended)

		const pitchRefsReady = () =>
			analyserRef.current !== null && contextRef.current !== null && bufferRef.current !== null

		/** Drop to the idle "—" state (once) and forget the note being tracked. */
		function emitSilence(now: number) {
			resetTracking()
			if (lastStateRef.current.noteName !== initialPitchState.noteName) {
				setState(initialPitchState)
				lastStateRef.current = initialPitchState
				lastEmitTimeRef.current = now
			}
		}

		function tick() {
			if (!pitchRefsReady()) return
			const now = performance.now()
			if (now - lastDetectTimeRef.current < 1000 / DETECT_HZ) {
				rafRef.current = requestAnimationFrame(tick)
				return
			}
			lastDetectTimeRef.current = now

			const liveAnalyser = analyserRef.current!
			const liveCtx = contextRef.current!
			const buf = bufferRef.current!

			// A suspended context hands back a frozen (or zeroed) buffer; don't keep
			// showing the last note as if it were live.
			if (isSuspended(liveCtx)) {
				emitSilence(now)
				rafRef.current = requestAnimationFrame(tick)
				return
			}

			liveAnalyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>)
			let rms = 0
			for (let i = 0; i < buf.length; i++) {
				const v = buf[i]
				rms += v * v
			}
			rms = Math.sqrt(rms / buf.length)
			const minF = minFreqRef.current
			const a4 = a4Ref.current
			const { freq, clarity } = detectPitch(buf, liveCtx.sampleRate, minF, MAX_FREQ)
			const clamped = freq === null ? null : clampFrequency(freq, minF, MAX_FREQ)
			const hasSignal = rms >= MIN_RMS && clamped !== null && clarity >= MIN_CLARITY

			if (!hasSignal) {
				// Briefly hold the last reading so a momentary dip (e.g. a pick
				// attack decaying) doesn't blank the display.
				if (now - lastStableTimeRef.current <= HOLD_MS && smoothedFreqRef.current !== null) {
					rafRef.current = requestAnimationFrame(tick)
					return
				}
				emitSilence(now)
				rafRef.current = requestAnimationFrame(tick)
				return
			}

			const history = freqHistoryRef.current
			history.push(clamped!)
			if (history.length > MEDIAN_WINDOW) history.shift()
			const medianFreq = median(history)
			const previous = smoothedFreqRef.current

			let smoothed: number
			if (previous === null) {
				smoothed = medianFreq
			} else {
				const ratio = Math.abs(medianFreq - previous) / previous
				// Snap on a real note change; ease within a note for a steady read.
				smoothed = ratio > SNAP_RATIO ? medianFreq : previous + (medianFreq - previous) * EMA_ALPHA
			}
			smoothedFreqRef.current = smoothed
			lastStableTimeRef.current = now

			// --- Note stabilization on a single semitone index -------------------
			const previousStable = stableSemitoneRef.current
			const instSemitone = frequencyToSemitone(smoothed, a4)!
			if (stableSemitoneRef.current === null) {
				stableSemitoneRef.current = instSemitone
				pendingSemitoneRef.current = null
				pendingCountRef.current = 0
			} else if (instSemitone !== stableSemitoneRef.current) {
				const stableRef = noteFromSemitone(stableSemitoneRef.current, a4).referenceHz
				const centsFromStable = getCents(smoothed, stableRef)
				if (pendingSemitoneRef.current === instSemitone) {
					pendingCountRef.current += 1
				} else {
					pendingSemitoneRef.current = instSemitone
					pendingCountRef.current = 1
				}
				if (
					pendingCountRef.current >= NOTE_STABLE_FRAMES ||
					Math.abs(centsFromStable) > NOTE_HYSTERESIS_CENTS
				) {
					stableSemitoneRef.current = instSemitone
					pendingSemitoneRef.current = null
					pendingCountRef.current = 0
				}
			} else {
				pendingSemitoneRef.current = null
				pendingCountRef.current = 0
			}
			// A new note starts out of tune: hysteresis only carries within a note.
			if (stableSemitoneRef.current !== previousStable) inTuneRef.current = false

			// Name, octave and cents all derive from the SAME stable semitone, so
			// they can never disagree with each other.
			const { name, octave, referenceHz } = noteFromSemitone(stableSemitoneRef.current, a4)
			const cents = getCents(smoothed, referenceHz)
			const inTune = isInTune(cents, inTuneRef.current)
			inTuneRef.current = inTune

			const nextState = {
				frequency: smoothed,
				noteName: name,
				noteWithOctave: `${name}${octave}`,
				cents,
				inTune,
			}

			// Emit a note/octave/in-tune change at once; rate-limit the within-note
			// cents drift to EMIT_HZ so we don't re-render React on every detect.
			const prevState = lastStateRef.current
			const structuralChange =
				prevState.noteName !== nextState.noteName ||
				prevState.noteWithOctave !== nextState.noteWithOctave ||
				prevState.inTune !== nextState.inTune
			const drifted =
				Math.abs((prevState.frequency ?? 0) - (nextState.frequency ?? 0)) > 0.2 ||
				Math.abs(prevState.cents - nextState.cents) > 0.5
			const throttleElapsed = now - lastEmitTimeRef.current >= 1000 / EMIT_HZ

			if (structuralChange || (drifted && throttleElapsed)) {
				setState(nextState)
				lastStateRef.current = nextState
				lastEmitTimeRef.current = now
			}
			rafRef.current = requestAnimationFrame(tick)
		}
		rafRef.current = requestAnimationFrame(tick)

		return () => {
			ctx.removeEventListener?.('statechange', resumeIfSuspended)
			document.removeEventListener('visibilitychange', onVisibilityChange)
			for (const type of GESTURE_EVENTS) document.removeEventListener(type, resumeIfSuspended)
			cleanup()
		}
	}, [stream, cleanup, resetTracking])

	return state
}
