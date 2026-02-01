import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePitchDetection } from './usePitchDetection'

const SAMPLE_RATE = 44100
const FFT_SIZE = 4096

function makeSineBuffer(freq: number, sampleRate: number, length: number): Float32Array {
	const buf = new Float32Array(length)
	for (let i = 0; i < length; i++) {
		buf[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate)
	}
	return buf
}

function createMockAnalyser(sampleRate: number, injectFreq: number | null) {
	const bufferLength = FFT_SIZE
	const mockGetFloatTimeDomainData = vi.fn((buf: Float32Array) => {
		if (injectFreq !== null) {
			const samples = makeSineBuffer(injectFreq, sampleRate, bufferLength)
			buf.set(samples)
		}
	})
	return {
		fftSize: bufferLength,
		connect: vi.fn(),
		disconnect: vi.fn(),
		getFloatTimeDomainData: mockGetFloatTimeDomainData,
	}
}

function createMockAudioContext(sampleRate: number, injectFreq: number | null) {
	const analyser = createMockAnalyser(sampleRate, injectFreq)
	const source = { connect: vi.fn() }
	return {
		sampleRate,
		createAnalyser: vi.fn(() => analyser),
		createMediaStreamSource: vi.fn(() => source),
		close: vi.fn().mockResolvedValue(undefined),
		state: 'running',
		get analyser() {
			return analyser
		},
	}
}

describe('usePitchDetection', () => {
	let rafCallbacks: Array<() => void>
	let rafId: number

	beforeEach(() => {
		rafCallbacks = []
		rafId = 0
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn((cb: () => void) => {
				rafCallbacks.push(cb)
				return ++rafId
			}),
		)
		vi.stubGlobal('cancelAnimationFrame', vi.fn())
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('returns initial state when stream is null', () => {
		const { result } = renderHook(() => usePitchDetection(null))
		expect(result.current).toEqual({
			frequency: null,
			noteName: '—',
			noteWithOctave: '—',
			cents: 0,
			inTune: false,
		})
	})

	it('returns initial state and does not create AudioContext when stream is null', () => {
		const AudioContextMock = vi.fn()
		vi.stubGlobal('AudioContext', AudioContextMock)
		const { result } = renderHook(() => usePitchDetection(null))
		expect(result.current.noteWithOctave).toBe('—')
		expect(AudioContextMock).not.toHaveBeenCalled()
		vi.unstubAllGlobals()
	})

	it('creates AudioContext and updates state when stream is provided and mock injects tone', async () => {
		const injectFreq = 440
		const mockCtx = createMockAudioContext(SAMPLE_RATE, injectFreq)
		vi.stubGlobal('AudioContext', function MockAudioContext(this: unknown) {
			return mockCtx
		})

		const stopTrack = vi.fn()
		const stream = {
			getTracks: () => [{ stop: stopTrack }],
		} as unknown as MediaStream

		const { result } = renderHook(() => usePitchDetection(stream))

		expect(mockCtx.createAnalyser).toHaveBeenCalled()
		expect(mockCtx.createMediaStreamSource).toHaveBeenCalledWith(stream)

		await act(async () => {
			for (let i = 0; i < 5; i++) rafCallbacks.forEach((cb) => cb())
		})

		await waitFor(
			() => {
				expect(result.current.frequency).not.toBeNull()
				expect(typeof result.current.noteName).toBe('string')
				expect(result.current.noteName.length).toBeGreaterThan(0)
				expect(result.current.noteName).not.toBe('—')
				expect(result.current.noteWithOctave).toMatch(/^[A-G]#?[0-9]$/)
				expect(typeof result.current.cents).toBe('number')
				expect(typeof result.current.inTune).toBe('boolean')
			},
			{ timeout: 500 },
		)

		vi.unstubAllGlobals()
	})

	it('stops stream tracks and cleans up on unmount', async () => {
		const mockCtx = createMockAudioContext(SAMPLE_RATE, 440)
		vi.stubGlobal('AudioContext', function MockAudioContext(this: unknown) {
			return mockCtx
		})

		const stopTrack = vi.fn()
		const stream = {
			getTracks: () => [{ stop: stopTrack }],
		} as unknown as MediaStream

		const { unmount } = renderHook(() => usePitchDetection(stream))

		await act(async () => {
			rafCallbacks.forEach((cb) => cb())
		})

		unmount()

		expect(stopTrack).toHaveBeenCalled()
		expect(mockCtx.close).toHaveBeenCalled()

		vi.unstubAllGlobals()
	})
})
