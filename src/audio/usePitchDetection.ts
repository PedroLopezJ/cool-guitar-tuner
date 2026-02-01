import { useCallback, useEffect, useRef, useState } from 'react'
import { getCents, frequencyToNote, IN_TUNE_CENTS_THRESHOLD } from './noteUtils'

const MIN_FREQ = 70
const MAX_FREQ = 1000
const MIN_RMS = 0.01
const MIN_CONFIDENCE = 0.7
const HIGH_CONFIDENCE = 0.85
const HOLD_MS = 220
const DETECT_HZ = 25
const OUTLIER_RATIO = 0.05
const MEDIAN_WINDOW = 7
const EMA_ALPHA = 0.25
const NOTE_STABLE_FRAMES = 6
const NOTE_CENTS_HYSTERESIS = 40
const ENABLE_FILTERS = true
const HPF_HZ = 65
const LPF_HZ = 1800

type PitchCandidate = {
	freq: number | null
	confidence: number
}

function hannWindow(size: number, i: number): number {
	return 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
}

function normalizedAutocorrelation(
	buffer: ArrayLike<number>,
	sampleRate: number,
): { corr: Float32Array; minLag: number; maxLag: number } {
	const size = buffer.length
	const maxLag = Math.min(size - 1, Math.floor(sampleRate / MIN_FREQ))
	const minLag = Math.max(2, Math.ceil(sampleRate / MAX_FREQ))
	const corr = new Float32Array(maxLag + 1)

	let mean = 0
	for (let i = 0; i < size; i++) mean += buffer[i]
	mean /= size

	const windowed = new Float32Array(size)
	for (let i = 0; i < size; i++) {
		const v = buffer[i] - mean
		windowed[i] = v * hannWindow(size, i)
	}

	for (let lag = minLag; lag <= maxLag; lag++) {
		let sum = 0
		let e1 = 0
		let e2 = 0
		const limit = size - lag
		for (let i = 0; i < limit; i++) {
			const a = windowed[i]
			const b = windowed[i + lag]
			sum += a * b
			e1 += a * a
			e2 += b * b
		}
		const denom = Math.sqrt(e1 * e2)
		corr[lag] = denom > 0 ? sum / denom : 0
	}

	return { corr, minLag, maxLag }
}

function pickPeak(
	corr: Float32Array,
	minLag: number,
	maxLag: number,
): { lag: number; confidence: number } | null {
	const peaks: Array<{ lag: number; value: number }> = []
	for (let lag = minLag + 1; lag < maxLag - 1; lag++) {
		const v = corr[lag]
		if (v > corr[lag - 1] && v >= corr[lag + 1]) {
			peaks.push({ lag, value: v })
		}
	}
	if (peaks.length === 0) return null

	peaks.sort((a, b) => b.value - a.value)
	const best = peaks[0]

	// Prefer larger lag (lower freq) when a harmonic peak is similarly strong.
	const harmonic = peaks.find(
		(p) => Math.abs(p.lag - best.lag * 2) < 3 && p.value >= best.value * 0.9,
	)
	const chosen = harmonic ?? best

	return { lag: chosen.lag, confidence: chosen.value }
}

function refineLag(corr: Float32Array, lag: number): number {
	if (lag <= 0 || lag >= corr.length - 1) return lag
	const y1 = corr[lag - 1]
	const y2 = corr[lag]
	const y3 = corr[lag + 1]
	const denom = y1 - 2 * y2 + y3
	if (denom === 0) return lag
	const delta = (0.5 * (y1 - y3)) / denom
	return lag + delta
}

function median(values: number[]): number {
	const sorted = [...values].toSorted((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function detectPitch(buffer: ArrayLike<number>, sampleRate: number): PitchCandidate {
	const { corr, minLag, maxLag } = normalizedAutocorrelation(buffer, sampleRate)
	const peak = pickPeak(corr, minLag, maxLag)
	if (!peak) return { freq: null, confidence: 0 }
	const refinedLag = refineLag(corr, peak.lag)
	const freq = sampleRate / refinedLag
	return { freq, confidence: peak.confidence }
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

function clampFrequency(freq: number): number | null {
	if (!Number.isFinite(freq)) return null
	if (freq < MIN_FREQ || freq > MAX_FREQ) return null
	return freq
}

export function usePitchDetection(stream: MediaStream | null): PitchState {
	const [state, setState] = useState<PitchState>(initialPitchState)
	const contextRef = useRef<AudioContext | null>(null)
	const analyserRef = useRef<AnalyserNode | null>(null)
	const bufferRef = useRef<Float32Array | null>(null)
	const rafRef = useRef<number>(0)
	const smoothedFreqRef = useRef<number | null>(null)
	const freqHistoryRef = useRef<number[]>([])
	const lastStableRef = useRef<number | null>(null)
	const lastStableTimeRef = useRef(0)
	const lastDetectTimeRef = useRef(0)
	const pendingNoteRef = useRef<string | null>(null)
	const pendingCountRef = useRef(0)
	const lastNoteRef = useRef(initialPitchState.noteName)
	const lastOctaveRef = useRef(4)
	const lastStateRef = useRef(initialPitchState)

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
		bufferRef.current = null
		setState(initialPitchState)
		lastStateRef.current = initialPitchState
	}, [])

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
		const analyser = ctx.createAnalyser()
		analyser.fftSize = 4096
		analyser.smoothingTimeConstant = 0.4
		analyserRef.current = analyser

		const source = ctx.createMediaStreamSource(stream)
		if (ENABLE_FILTERS) {
			const highPass = ctx.createBiquadFilter()
			highPass.type = 'highpass'
			highPass.frequency.value = HPF_HZ
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
			const { freq, confidence } = detectPitch(buf, ctx.sampleRate)
			const clamped = freq === null ? null : clampFrequency(freq)
			const hasSignal = rms >= MIN_RMS && clamped !== null && confidence >= MIN_CONFIDENCE

			if (!hasSignal) {
				if (now - lastStableTimeRef.current <= HOLD_MS && lastStableRef.current !== null) {
					rafRef.current = requestAnimationFrame(tick)
					return
				}
				smoothedFreqRef.current = null
				freqHistoryRef.current = []
				pendingNoteRef.current = null
				pendingCountRef.current = 0
				lastNoteRef.current = initialPitchState.noteName
				lastOctaveRef.current = 4
				if (lastStateRef.current.noteName !== initialPitchState.noteName) {
					setState(initialPitchState)
					lastStateRef.current = initialPitchState
				}
				rafRef.current = requestAnimationFrame(tick)
				return
			}

			const history = freqHistoryRef.current
			history.push(clamped!)
			if (history.length > MEDIAN_WINDOW) history.shift()
			const medianFreq = median(history)
			const previous = smoothedFreqRef.current ?? medianFreq

			const ratio = previous > 0 ? Math.abs(medianFreq - previous) / previous : 0
			if (ratio > OUTLIER_RATIO && confidence < HIGH_CONFIDENCE) {
				rafRef.current = requestAnimationFrame(tick)
				return
			}

			const smoothed = previous + (medianFreq - previous) * EMA_ALPHA
			smoothedFreqRef.current = smoothed
			lastStableRef.current = smoothed
			lastStableTimeRef.current = now

			const { name, octave, referenceHz } = frequencyToNote(smoothed)
			const cents = getCents(smoothed, referenceHz)

			if (name !== lastNoteRef.current) {
				if (pendingNoteRef.current === name) {
					pendingCountRef.current += 1
				} else {
					pendingNoteRef.current = name
					pendingCountRef.current = 1
				}
				if (pendingCountRef.current >= NOTE_STABLE_FRAMES || Math.abs(cents) > NOTE_CENTS_HYSTERESIS) {
					lastNoteRef.current = name
					lastOctaveRef.current = octave
					pendingNoteRef.current = null
					pendingCountRef.current = 0
				}
			}

			const nextState = {
				frequency: smoothed,
				noteName: lastNoteRef.current,
				noteWithOctave: `${lastNoteRef.current}${lastOctaveRef.current}`,
				cents,
				inTune: Math.abs(cents) < IN_TUNE_CENTS_THRESHOLD,
			}

			const prevState = lastStateRef.current
			const shouldUpdate =
				prevState.noteName !== nextState.noteName ||
				Math.abs((prevState.frequency ?? 0) - (nextState.frequency ?? 0)) > 0.2 ||
				Math.abs(prevState.cents - nextState.cents) > 0.5 ||
				prevState.inTune !== nextState.inTune

			if (shouldUpdate) {
				setState(nextState)
				lastStateRef.current = nextState
			}
			rafRef.current = requestAnimationFrame(tick)
		}
		rafRef.current = requestAnimationFrame(tick)

		return () => {
			cleanup()
		}
	}, [stream, cleanup])

	return state
}
