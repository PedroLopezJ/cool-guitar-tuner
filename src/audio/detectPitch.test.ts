import { describe, it, expect } from 'vitest'
import { detectPitch } from './detectPitch'

const BUFFER = 4096
// Desktop audio often runs at 44.1 kHz, but most phones (and many interfaces)
// run at 48 kHz — the lag grid differs, so the key cases run at both.
const SAMPLE_RATES = [44100, 48000] as const

/** Deterministic PRNG (mulberry32) so noise tests can't flake. */
function makeRandom(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** Standard-normal samples via Box–Muller, from a seeded uniform source. */
function makeGaussian(seed: number): () => number {
	const random = makeRandom(seed)
	return () => {
		const u = Math.max(random(), Number.EPSILON)
		const v = random()
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
	}
}

/**
 * Build a harmonic-rich tone (fundamental + decaying overtones) the way a real
 * plucked string looks. This is the case where naive autocorrelation latches
 * onto a harmonic and reports the wrong octave.
 */
function makeStringTone(
	freq: number,
	sampleRate: number = SAMPLE_RATES[0],
	length = BUFFER,
	harmonics = 6,
): Float32Array {
	const buf = new Float32Array(length)
	for (let i = 0; i < length; i++) {
		let s = 0
		for (let h = 1; h <= harmonics; h++) {
			s += (1 / h) * Math.sin((2 * Math.PI * freq * h * i) / sampleRate)
		}
		buf[i] = 0.5 * s
	}
	return buf
}

function rms(buf: Float32Array): number {
	let sum = 0
	for (const v of buf) sum += v * v
	return Math.sqrt(sum / buf.length)
}

/** Add white Gaussian noise at the given signal-to-noise ratio (dB). */
function addNoise(buf: Float32Array, snrDb: number, seed: number): Float32Array {
	const gaussian = makeGaussian(seed)
	const noiseRms = rms(buf) / Math.pow(10, snrDb / 20)
	return buf.map((v) => v + gaussian() * noiseRms)
}

function centsError(detected: number, expected: number): number {
	return Math.abs(1200 * Math.log2(detected / expected))
}

const strings: Array<[string, number]> = [
	['E2', 82.41],
	['A2', 110.0],
	['D3', 146.83],
	['G3', 196.0],
	['B3', 246.94],
	['E4', 329.63],
]

describe.each(SAMPLE_RATES)('detectPitch at %i Hz', (sampleRate) => {
	it('detects a pure 440 Hz sine within a few cents', () => {
		const buf = new Float32Array(BUFFER)
		for (let i = 0; i < BUFFER; i++) buf[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate)
		const { freq, clarity } = detectPitch(buf, sampleRate)
		expect(freq).not.toBeNull()
		expect(centsError(freq!, 440)).toBeLessThan(5)
		expect(clarity).toBeGreaterThan(0.9)
	})

	for (const [name, freq] of strings) {
		it(`detects open ${name} (${freq} Hz) on a harmonic-rich tone without octave error`, () => {
			const buf = makeStringTone(freq, sampleRate)
			const { freq: detected } = detectPitch(buf, sampleRate)
			expect(detected).not.toBeNull()
			// The crux: not an octave (or fifth) out.
			expect(centsError(detected!, freq)).toBeLessThan(15)
		})
	}

	it('stays accurate at the top of the range (E5, 659.25 Hz)', () => {
		// Above the open strings: the decimated correlation has fewer samples per
		// period here, so this guards that parabolic interpolation still nails it.
		const buf = makeStringTone(659.25, sampleRate)
		const { freq: detected } = detectPitch(buf, sampleRate)
		expect(detected).not.toBeNull()
		expect(centsError(detected!, 659.25)).toBeLessThan(5)
	})

	it('reports a detuned note with cent-level precision', () => {
		// A4 sharpened by 30 cents — a tuner must resolve the offset, not just the
		// nearest note, so the reading has to land very close to the real pitch.
		const target = 440 * Math.pow(2, 30 / 1200)
		const buf = makeStringTone(target, sampleRate)
		const { freq: detected } = detectPitch(buf, sampleRate)
		expect(detected).not.toBeNull()
		expect(centsError(detected!, target)).toBeLessThan(3)
	})

	it('detects a low bass E1 (41.2 Hz) once the floor is dropped', () => {
		const buf = makeStringTone(41.2, sampleRate)
		const { freq } = detectPitch(buf, sampleRate, 30, 1200)
		expect(freq).not.toBeNull()
		expect(centsError(freq!, 41.2)).toBeLessThan(15)
	})

	it('detects a 5-string bass low B0 (30.87 Hz) with the floor dropped', () => {
		const buf = makeStringTone(30.87, sampleRate)
		const { freq } = detectPitch(buf, sampleRate, 26, 1200)
		expect(freq).not.toBeNull()
		expect(centsError(freq!, 30.87)).toBeLessThan(25)
	})

	it('pins the low B0 much tighter with the long (8192-sample) window', () => {
		const buf = makeStringTone(30.87, sampleRate, 8192)
		const { freq, clarity } = detectPitch(buf, sampleRate, 26, 1200)
		expect(freq).not.toBeNull()
		expect(centsError(freq!, 30.87)).toBeLessThan(5)
		expect(clarity).toBeGreaterThan(0.9)
	})

	it('stays within a few cents on a noisy string (20 dB SNR)', () => {
		for (const [index, [, freq]] of strings.entries()) {
			const buf = addNoise(makeStringTone(freq, sampleRate), 20, 1234 + index)
			const { freq: detected, clarity } = detectPitch(buf, sampleRate)
			expect(detected).not.toBeNull()
			expect(centsError(detected!, freq)).toBeLessThan(5)
			expect(clarity).toBeGreaterThan(0.7)
		}
	})

	it('does not report a confident pitch for pure white noise', () => {
		const gaussian = makeGaussian(42)
		const buf = new Float32Array(BUFFER).map(() => gaussian() * 0.05)
		const { freq, clarity } = detectPitch(buf, sampleRate)
		expect(freq === null || clarity < 0.7).toBe(true)
	})
})

describe('detectPitch range and octave guards', () => {
	const sampleRate = SAMPLE_RATES[0]

	it('returns no pitch for silence', () => {
		expect(detectPitch(new Float32Array(BUFFER), sampleRate)).toEqual({ freq: null, clarity: 0 })
	})

	it('cannot reach that low B0 at the default guitar floor (adaptive floor unlocks bass)', () => {
		const buf = makeStringTone(30.87, sampleRate)
		const { freq } = detectPitch(buf, sampleRate)
		// 30 Hz is below the default 60 Hz floor, so its period is out of lag range
		// and the fundamental can't be reported here.
		if (freq !== null) expect(freq).toBeGreaterThan(50)
	})

	it('does not collapse to the sub-octave when the 2nd harmonic is strong', () => {
		// Fundamental plus an unusually loud octave partial — the classic trap.
		const f0 = 110
		const buf = new Float32Array(BUFFER)
		for (let i = 0; i < BUFFER; i++) {
			buf[i] =
				0.4 * Math.sin((2 * Math.PI * f0 * i) / sampleRate) +
				0.6 * Math.sin((2 * Math.PI * 2 * f0 * i) / sampleRate)
		}
		const { freq } = detectPitch(buf, sampleRate)
		expect(freq).not.toBeNull()
		// Must stay near 110, not drop to 55.
		expect(centsError(freq!, f0)).toBeLessThan(20)
	})

	it('gives the same answer when the window size changes between calls', () => {
		// Scratch buffers are resized on demand; switching window sizes back and
		// forth must not leave stale data behind.
		const short = makeStringTone(110, sampleRate, 4096)
		const long = makeStringTone(110, sampleRate, 8192)
		const first = detectPitch(short, sampleRate).freq!
		detectPitch(long, sampleRate, 26, 1200)
		const again = detectPitch(short, sampleRate).freq!
		expect(again).toBeCloseTo(first, 10)
	})
})
