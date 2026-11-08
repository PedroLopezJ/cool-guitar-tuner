import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { analysisWindowSize, usePitchDetection } from './usePitchDetection'

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
	// Fills however many samples the hook asks for, so the adaptive window
	// (fftSize 4096 ↔ 8192) works against the mock too.
	const mockGetFloatTimeDomainData = vi.fn((buf: Float32Array) => {
		if (injectFreq !== null) buf.set(makeSineBuffer(injectFreq, sampleRate, buf.length))
	})
	return {
		fftSize: 2048,
		connect: vi.fn(),
		disconnect: vi.fn(),
		getFloatTimeDomainData: mockGetFloatTimeDomainData,
	}
}

function createMockAudioContext(
	sampleRate: number,
	injectFreq: number | null,
	state: string = 'running',
) {
	const analyser = createMockAnalyser(sampleRate, injectFreq)
	const source = { connect: vi.fn() }
	const createBiquadFilter = vi.fn(() => ({
		type: 'lowpass',
		frequency: { value: 0 },
		connect: vi.fn(),
	}))
	const listeners = new Map<string, Set<() => void>>()
	return {
		sampleRate,
		state,
		createBiquadFilter,
		createAnalyser: vi.fn(() => analyser),
		createMediaStreamSource: vi.fn(() => source),
		close: vi.fn().mockResolvedValue(undefined),
		resume: vi.fn().mockResolvedValue(undefined),
		addEventListener: vi.fn((type: string, cb: () => void) => {
			if (!listeners.has(type)) listeners.set(type, new Set())
			listeners.get(type)!.add(cb)
		}),
		removeEventListener: vi.fn((type: string, cb: () => void) => {
			listeners.get(type)?.delete(cb)
		}),
		dispatch(type: string) {
			listeners.get(type)?.forEach((cb) => cb())
		},
		get analyser() {
			return analyser
		},
	}
}

type MockAudioContext = ReturnType<typeof createMockAudioContext>

function installAudioContext(mockCtx: MockAudioContext) {
	vi.stubGlobal('AudioContext', function MockAudioContext(this: unknown) {
		return mockCtx
	})
}

const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream

describe('usePitchDetection', () => {
	let rafCallbacks: Array<() => void>
	let rafId: number

	/** Run a few rAF frames (each advances the mocked clock past the detect gate). */
	async function runFrames(count: number) {
		await act(async () => {
			for (let i = 0; i < count; i++) {
				const callbacks = [...rafCallbacks]
				rafCallbacks = []
				callbacks.forEach((cb) => cb())
			}
		})
	}

	beforeEach(() => {
		rafCallbacks = []
		rafId = 0
		let now = 0
		vi.spyOn(performance, 'now').mockImplementation(() => {
			now += 50
			return now
		})
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
		vi.restoreAllMocks()
	})

	it('returns initial state when stream is null', () => {
		const { result } = renderHook(() => usePitchDetection(null))
		expect(result.current).toEqual({
			frequency: null,
			noteName: '—',
			noteWithOctave: '—',
			cents: 0,
			inTune: false,
			suspended: false,
		})
	})

	it('returns initial state and does not create AudioContext when stream is null', () => {
		const AudioContextMock = vi.fn()
		vi.stubGlobal('AudioContext', AudioContextMock)
		const { result } = renderHook(() => usePitchDetection(null))
		expect(result.current.noteWithOctave).toBe('—')
		expect(AudioContextMock).not.toHaveBeenCalled()
	})

	it('creates AudioContext and updates state when stream is provided and mock injects tone', async () => {
		const mockCtx = createMockAudioContext(SAMPLE_RATE, 440)
		installAudioContext(mockCtx)

		const { result } = renderHook(() => usePitchDetection(fakeStream))

		expect(mockCtx.createAnalyser).toHaveBeenCalled()
		expect(mockCtx.createMediaStreamSource).toHaveBeenCalledWith(fakeStream)

		await runFrames(8)

		await waitFor(
			() => {
				expect(result.current.frequency).not.toBeNull()
				expect(result.current.noteName).toBe('A')
				expect(result.current.noteWithOctave).toBe('A4')
				expect(Math.abs(result.current.cents)).toBeLessThan(5)
				expect(result.current.inTune).toBe(true)
			},
			{ timeout: 500 },
		)
	})

	it('stops stream tracks and cleans up on unmount', async () => {
		const mockCtx = createMockAudioContext(SAMPLE_RATE, 440)
		installAudioContext(mockCtx)

		const { unmount } = renderHook(() => usePitchDetection(fakeStream))
		await runFrames(1)
		unmount()

		expect(mockCtx.close).toHaveBeenCalled()
	})

	describe('A4 calibration', () => {
		it('reads 432 Hz as an in-tune A4 when calibrated to 432', async () => {
			const mockCtx = createMockAudioContext(SAMPLE_RATE, 432)
			installAudioContext(mockCtx)

			const { result } = renderHook(() => usePitchDetection(fakeStream, { a4Hz: 432 }))
			await runFrames(8)

			await waitFor(() => {
				expect(result.current.noteWithOctave).toBe('A4')
				expect(Math.abs(result.current.cents)).toBeLessThan(3)
				expect(result.current.inTune).toBe(true)
			})
		})

		it('reads the same 432 Hz as a flat, out-of-tune A4 at the default 440', async () => {
			const mockCtx = createMockAudioContext(SAMPLE_RATE, 432)
			installAudioContext(mockCtx)

			const { result } = renderHook(() => usePitchDetection(fakeStream))
			await runFrames(8)

			await waitFor(() => {
				expect(result.current.noteWithOctave).toBe('A4')
				expect(result.current.cents).toBeLessThan(-25)
				expect(result.current.inTune).toBe(false)
			})
		})
	})

	describe('adaptive analysis window', () => {
		it('uses the long window only below the low-bass threshold', () => {
			expect(analysisWindowSize(26)).toBe(8192) // 5-string bass low B floor
			expect(analysisWindowSize(39.3)).toBe(FFT_SIZE) // 8-string guitar F#1 floor
			expect(analysisWindowSize(60)).toBe(FFT_SIZE)
		})

		it('resizes the analyser live when the floor changes, without rebuilding the graph', async () => {
			const mockCtx = createMockAudioContext(SAMPLE_RATE, 110)
			installAudioContext(mockCtx)

			const { result, rerender } = renderHook(
				({ minFreq }) => usePitchDetection(fakeStream, { minFreq }),
				{ initialProps: { minFreq: 26 } },
			)
			expect(mockCtx.analyser.fftSize).toBe(8192)
			await runFrames(8)
			await waitFor(() => expect(result.current.noteWithOctave).toBe('A2'))
			expect(mockCtx.analyser.getFloatTimeDomainData.mock.lastCall![0]).toHaveLength(8192)

			rerender({ minFreq: 60 })
			expect(mockCtx.analyser.fftSize).toBe(FFT_SIZE)
			await runFrames(2)
			expect(mockCtx.analyser.getFloatTimeDomainData.mock.lastCall![0]).toHaveLength(FFT_SIZE)
			expect(result.current.noteWithOctave).toBe('A2')

			expect(mockCtx.createAnalyser).toHaveBeenCalledTimes(1)
		})
	})

	describe('suspended AudioContext', () => {
		beforeEach(() => {
			vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
		})

		it('stays silent while suspended instead of reading a frozen buffer', async () => {
			const mockCtx = createMockAudioContext(SAMPLE_RATE, 440, 'suspended')
			installAudioContext(mockCtx)

			const { result } = renderHook(() => usePitchDetection(fakeStream))
			await runFrames(8)

			expect(mockCtx.analyser.getFloatTimeDomainData).not.toHaveBeenCalled()
			expect(result.current.frequency).toBeNull()
		})

		it('flags a context that stays suspended, and clears the flag once it runs', async () => {
			const mockCtx = createMockAudioContext(SAMPLE_RATE, 440, 'suspended')
			installAudioContext(mockCtx)

			const { result } = renderHook(() => usePitchDetection(fakeStream))
			// The mocked clock advances 50 ms per read: a couple of frames stay inside
			// the grace period (no "tap to start" flash for a context about to resume)…
			await runFrames(2)
			expect(result.current.suspended).toBe(false)
			// …but a context still suspended well past it is reported.
			await runFrames(12)
			expect(result.current.suspended).toBe(true)
			expect(result.current.frequency).toBeNull()

			mockCtx.state = 'running'
			await runFrames(8)
			await waitFor(() => expect(result.current.noteWithOctave).toBe('A4'))
			expect(result.current.suspended).toBe(false)
		})

		it('blanks a live reading when the context gets interrupted (iOS)', async () => {
			const mockCtx = createMockAudioContext(SAMPLE_RATE, 440)
			installAudioContext(mockCtx)

			const { result } = renderHook(() => usePitchDetection(fakeStream))
			await runFrames(8)
			await waitFor(() => expect(result.current.noteWithOctave).toBe('A4'))

			mockCtx.state = 'interrupted'
			await runFrames(2)
			expect(result.current.noteWithOctave).toBe('—')
		})

		it('tries to resume on statechange, on return to the page and on a user gesture', () => {
			const mockCtx = createMockAudioContext(SAMPLE_RATE, 440, 'suspended')
			installAudioContext(mockCtx)
			renderHook(() => usePitchDetection(fakeStream))
			mockCtx.resume.mockClear()

			mockCtx.dispatch('statechange')
			expect(mockCtx.resume).toHaveBeenCalledTimes(1)

			document.dispatchEvent(new Event('visibilitychange'))
			expect(mockCtx.resume).toHaveBeenCalledTimes(2)

			document.dispatchEvent(new Event('pointerup'))
			expect(mockCtx.resume).toHaveBeenCalledTimes(3)
		})

		it('does not resume while the page is hidden or once the context runs', () => {
			const mockCtx = createMockAudioContext(SAMPLE_RATE, 440, 'suspended')
			installAudioContext(mockCtx)
			renderHook(() => usePitchDetection(fakeStream))
			mockCtx.resume.mockClear()

			vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
			mockCtx.dispatch('statechange')
			expect(mockCtx.resume).not.toHaveBeenCalled()

			vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
			mockCtx.state = 'running'
			document.dispatchEvent(new Event('pointerdown'))
			expect(mockCtx.resume).not.toHaveBeenCalled()
		})

		it('removes its listeners on unmount', () => {
			const mockCtx = createMockAudioContext(SAMPLE_RATE, 440, 'suspended')
			installAudioContext(mockCtx)
			const addSpy = vi.spyOn(document, 'addEventListener')
			const removeSpy = vi.spyOn(document, 'removeEventListener')
			const { unmount } = renderHook(() => usePitchDetection(fakeStream))
			unmount()

			for (const type of ['visibilitychange', 'pointerdown', 'pointerup', 'keydown']) {
				const added = addSpy.mock.calls.find(([t]) => t === type)
				expect(added, type).toBeDefined()
				expect(removeSpy).toHaveBeenCalledWith(type, added![1])
			}
			const [, onStateChange] = mockCtx.addEventListener.mock.calls[0]
			expect(mockCtx.removeEventListener).toHaveBeenCalledWith('statechange', onStateChange)
		})
	})
})
