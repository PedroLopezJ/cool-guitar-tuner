import { useCallback, useEffect, useRef, useState } from 'react'
import {
	getCents,
	noteFromSemitone,
	frequencyToSemitone,
	IN_TUNE_CENTS_THRESHOLD,
} from './noteUtils'

// Frequency search range. Low end covers drop-tunings (drop-D ≈ 73 Hz, drop-C
// ≈ 65 Hz); high end leaves headroom above the open high-E harmonics.
const MIN_FREQ = 60
const MAX_FREQ = 1200

const MIN_RMS = 0.008
// Minimum NSDF clarity (0..1) for a reading to be trusted.
const MIN_CLARITY = 0.7
// McLeod peak-picking threshold: pick the first key maximum within this factor
// of the strongest one. Picking the *first* (lowest lag) such peak is what
// makes the method robust against octave errors.
const MPM_THRESHOLD = 0.9

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

// The audio graph already low-passes at LPF_HZ, so the signal is band-limited
// well below the original Nyquist. Decimating by this factor before the O(N·lag)
// NSDF keeps everything we search for (≤ MAX_FREQ) safely below the decimated
// Nyquist while cutting correlation cost ~DECIMATION×. A box-average over each
// group doubles as a cheap anti-alias filter.
const DECIMATION = 2

type PitchCandidate = {
	freq: number | null
	clarity: number
}

// Reused across detections so the hot path allocates nothing (no per-frame GC).
// detectPitch runs sequentially, so sharing module scratch is safe.
let decimateScratch: Float32Array | null = null
let xScratch: Float32Array | null = null
let nsdfScratch: Float32Array | null = null

/**
 * Box-average groups of `factor` samples down to a shorter buffer. The averaging
 * is a (cheap) low-pass that suppresses aliasing as we drop the sample rate.
 */
function decimate(buffer: ArrayLike<number>, factor: number): Float32Array {
	const outLen = Math.floor(buffer.length / factor)
	if (!decimateScratch || decimateScratch.length !== outLen) {
		decimateScratch = new Float32Array(outLen)
	}
	const out = decimateScratch
	const inv = 1 / factor
	for (let i = 0; i < outLen; i++) {
		let s = 0
		const base = i * factor
		for (let j = 0; j < factor; j++) s += buffer[base + j]
		out[i] = s * inv
	}
	return out
}

/**
 * McLeod Pitch Method (MPM): build the Normalized Square Difference Function
 * and return its key maxima. The NSDF is self-normalizing (no window needed)
 * and bounded to [-1, 1], so its peak value doubles as a clarity measure.
 */
function normalizedSquareDifference(
	buffer: Float32Array,
	sampleRate: number,
	minFreq: number,
	maxFreq: number,
): { nsdf: Float32Array; minLag: number; maxLag: number } {
	const size = buffer.length
	const maxLag = Math.min(size - 1, Math.floor(sampleRate / minFreq))
	const minLag = Math.max(2, Math.ceil(sampleRate / maxFreq))
	if (!nsdfScratch || nsdfScratch.length !== maxLag + 1) nsdfScratch = new Float32Array(maxLag + 1)
	const nsdf = nsdfScratch

	// Remove DC so a mic offset can't bias the correlation.
	let mean = 0
	for (let i = 0; i < size; i++) mean += buffer[i]
	mean /= size

	if (!xScratch || xScratch.length !== size) xScratch = new Float32Array(size)
	const x = xScratch
	for (let i = 0; i < size; i++) x[i] = buffer[i] - mean

	for (let lag = 0; lag <= maxLag; lag++) {
		let acf = 0
		let m = 0
		const limit = size - lag
		for (let i = 0; i < limit; i++) {
			const a = x[i]
			const b = x[i + lag]
			acf += a * b
			m += a * a + b * b
		}
		nsdf[lag] = m > 0 ? (2 * acf) / m : 0
	}

	return { nsdf, minLag, maxLag }
}

/**
 * Collect the "key maxima" of the NSDF: the single highest point inside each
 * positive lobe (the region between an upward and the following downward zero
 * crossing). The lobe containing lag 0 is intentionally skipped.
 */
function keyMaxima(
	nsdf: Float32Array,
	minLag: number,
	maxLag: number,
): Array<{ lag: number; value: number }> {
	const peaks: Array<{ lag: number; value: number }> = []
	let inLobe = false
	let bestLag = -1
	let bestVal = -Infinity

	for (let lag = 1; lag <= maxLag; lag++) {
		const prev = nsdf[lag - 1]
		const cur = nsdf[lag]
		if (prev <= 0 && cur > 0) {
			// Entering a positive lobe.
			inLobe = true
			bestLag = lag
			bestVal = cur
		} else if (inLobe && cur > 0) {
			if (cur > bestVal) {
				bestVal = cur
				bestLag = lag
			}
		} else if (inLobe && cur <= 0) {
			// Leaving the lobe — commit its peak.
			if (bestLag >= minLag) peaks.push({ lag: bestLag, value: bestVal })
			inLobe = false
		}
	}
	if (inLobe && bestLag >= minLag) peaks.push({ lag: bestLag, value: bestVal })
	return peaks
}

/** Sub-sample peak location via parabolic interpolation around an integer lag. */
function refineLag(nsdf: Float32Array, lag: number): { lag: number; value: number } {
	if (lag <= 0 || lag >= nsdf.length - 1) return { lag, value: nsdf[lag] }
	const y1 = nsdf[lag - 1]
	const y2 = nsdf[lag]
	const y3 = nsdf[lag + 1]
	const denom = y1 - 2 * y2 + y3
	if (denom === 0) return { lag, value: y2 }
	const delta = (0.5 * (y1 - y3)) / denom
	const value = y2 - 0.25 * (y1 - y3) * delta
	return { lag: lag + delta, value }
}

function median(values: number[]): number {
	const sorted = [...values].toSorted((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function detectPitch(
	buffer: ArrayLike<number>,
	sampleRate: number,
	minFreq: number = MIN_FREQ,
	maxFreq: number = MAX_FREQ,
): PitchCandidate {
	const decimated = decimate(buffer, DECIMATION)
	const ds = sampleRate / DECIMATION
	const { nsdf, minLag, maxLag } = normalizedSquareDifference(decimated, ds, minFreq, maxFreq)
	const peaks = keyMaxima(nsdf, minLag, maxLag)
	if (peaks.length === 0) return { freq: null, clarity: 0 }

	// Threshold relative to the strongest lobe, then take the first (lowest-lag,
	// i.e. highest-frequency / fundamental) lobe that clears it.
	let maxValue = 0
	for (const p of peaks) if (p.value > maxValue) maxValue = p.value
	const threshold = maxValue * MPM_THRESHOLD
	const chosen = peaks.find((p) => p.value >= threshold) ?? peaks[0]

	const refined = refineLag(nsdf, chosen.lag)
	if (refined.lag <= 0) return { freq: null, clarity: 0 }
	const freq = ds / refined.lag
	const clarity = Math.max(0, Math.min(1, refined.value))
	return { freq, clarity }
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
	/** Lowest frequency to search for; the HPF cutoff and NSDF lag range follow it. */
	minFreq?: number
	/** High-pass cutoff (Hz) applied to the mic signal before detection. */
	hpf?: number
}

export function usePitchDetection(
	stream: MediaStream | null,
	options: PitchDetectionOptions = {},
): PitchState {
	const { minFreq = MIN_FREQ, hpf = HPF_HZ } = options
	const [state, setState] = useState<PitchState>(initialPitchState)
	const contextRef = useRef<AudioContext | null>(null)
	const analyserRef = useRef<AnalyserNode | null>(null)
	const highPassRef = useRef<BiquadFilterNode | null>(null)
	const bufferRef = useRef<Float32Array | null>(null)
	const rafRef = useRef<number>(0)
	// Read inside the rAF loop / graph so a tuning change adapts the range and
	// filter live, without tearing down and rebuilding the audio graph.
	const minFreqRef = useRef(minFreq)
	const hpfRef = useRef(hpf)
	const smoothedFreqRef = useRef<number | null>(null)
	const freqHistoryRef = useRef<number[]>([])
	const lastStableTimeRef = useRef(0)
	const lastDetectTimeRef = useRef(0)
	const lastEmitTimeRef = useRef(0)
	const stableSemitoneRef = useRef<number | null>(null)
	const pendingSemitoneRef = useRef<number | null>(null)
	const pendingCountRef = useRef(0)
	const lastStateRef = useRef(initialPitchState)

	const resetTracking = useCallback(() => {
		smoothedFreqRef.current = null
		freqHistoryRef.current = []
		stableSemitoneRef.current = null
		pendingSemitoneRef.current = null
		pendingCountRef.current = 0
	}, [])

	const cleanup = useCallback(() => {
		if (rafRef.current) cancelAnimationFrame(rafRef.current)
		rafRef.current = 0
		if (analyserRef.current && contextRef.current) {
			try {
				analyserRef.current.disconnect()
			} catch {}
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
	}, [minFreq])

	useEffect(() => {
		hpfRef.current = hpf
		if (highPassRef.current) highPassRef.current.frequency.value = hpf
	}, [hpf])

	useEffect(() => {
		if (!stream) {
			cleanup()
			return
		}

		const ctx = new (
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
		)()
		contextRef.current = ctx
		// Browsers can hand back a suspended context even after the mic gesture.
		void ctx.resume?.()
		const analyser = ctx.createAnalyser()
		analyser.fftSize = 4096
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

		const bufferLength = analyser.fftSize
		const dataArray = new Float32Array(bufferLength)
		bufferRef.current = dataArray

		const pitchRefsReady = () =>
			analyserRef.current !== null && contextRef.current !== null && bufferRef.current !== null

		function tick() {
			if (!pitchRefsReady()) return
			const now = performance.now()
			if (now - lastDetectTimeRef.current < 1000 / DETECT_HZ) {
				rafRef.current = requestAnimationFrame(tick)
				return
			}
			lastDetectTimeRef.current = now

			const analyser = analyserRef.current!
			const ctx = contextRef.current!
			const buf = bufferRef.current!
			analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>)
			let rms = 0
			for (let i = 0; i < buf.length; i++) {
				const v = buf[i]
				rms += v * v
			}
			rms = Math.sqrt(rms / buf.length)
			const minF = minFreqRef.current
			const { freq, clarity } = detectPitch(buf, ctx.sampleRate, minF, MAX_FREQ)
			const clamped = freq === null ? null : clampFrequency(freq, minF, MAX_FREQ)
			const hasSignal = rms >= MIN_RMS && clamped !== null && clarity >= MIN_CLARITY

			if (!hasSignal) {
				// Briefly hold the last reading so a momentary dip (e.g. a pick
				// attack decaying) doesn't blank the display.
				if (now - lastStableTimeRef.current <= HOLD_MS && smoothedFreqRef.current !== null) {
					rafRef.current = requestAnimationFrame(tick)
					return
				}
				resetTracking()
				if (lastStateRef.current.noteName !== initialPitchState.noteName) {
					setState(initialPitchState)
					lastStateRef.current = initialPitchState
					lastEmitTimeRef.current = now
				}
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
			const instSemitone = frequencyToSemitone(smoothed)!
			if (stableSemitoneRef.current === null) {
				stableSemitoneRef.current = instSemitone
				pendingSemitoneRef.current = null
				pendingCountRef.current = 0
			} else if (instSemitone !== stableSemitoneRef.current) {
				const stableRef = noteFromSemitone(stableSemitoneRef.current).referenceHz
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

			// Name, octave and cents all derive from the SAME stable semitone, so
			// they can never disagree with each other.
			const { name, octave, referenceHz } = noteFromSemitone(stableSemitoneRef.current)
			const cents = getCents(smoothed, referenceHz)

			const nextState = {
				frequency: smoothed,
				noteName: name,
				noteWithOctave: `${name}${octave}`,
				cents,
				inTune: Math.abs(cents) < IN_TUNE_CENTS_THRESHOLD,
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
			cleanup()
		}
	}, [stream, cleanup, resetTracking])

	return state
}
