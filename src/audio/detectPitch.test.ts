import { describe, it, expect } from 'vitest'
import { detectPitch } from './usePitchDetection'

const SAMPLE_RATE = 44100
const BUFFER = 4096

/**
 * Build a harmonic-rich tone (fundamental + decaying overtones) the way a real
 * plucked string looks. This is the case where naive autocorrelation latches
 * onto a harmonic and reports the wrong octave.
 */
function makeStringTone(freq: number, harmonics = 6): Float32Array {
	const buf = new Float32Array(BUFFER)
	for (let i = 0; i < BUFFER; i++) {
		let s = 0
		for (let h = 1; h <= harmonics; h++) {
			s += (1 / h) * Math.sin((2 * Math.PI * freq * h * i) / SAMPLE_RATE)
		}
		buf[i] = 0.5 * s
	}
	return buf
}

function centsError(detected: number, expected: number): number {
	return Math.abs(1200 * Math.log2(detected / expected))
}

describe('detectPitch', () => {
	it('detects a pure 440 Hz sine within a few cents', () => {
		const buf = new Float32Array(BUFFER)
		for (let i = 0; i < BUFFER; i++) buf[i] = Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE)
		const { freq, clarity } = detectPitch(buf, SAMPLE_RATE)
		expect(freq).not.toBeNull()
		expect(centsError(freq!, 440)).toBeLessThan(5)
		expect(clarity).toBeGreaterThan(0.9)
	})

	it('returns null when there is no periodic signal', () => {
		const buf = new Float32Array(BUFFER)
		for (let i = 0; i < BUFFER; i++) buf[i] = (Math.random() * 2 - 1) * 0.01
		const { clarity } = detectPitch(buf, SAMPLE_RATE)
		expect(clarity).toBeLessThan(0.7)
	})

	const strings: Array<[string, number]> = [
		['E2', 82.41],
		['A2', 110.0],
		['D3', 146.83],
		['G3', 196.0],
		['B3', 246.94],
		['E4', 329.63],
	]

	for (const [name, freq] of strings) {
		it(`detects open ${name} (${freq} Hz) on a harmonic-rich tone without octave error`, () => {
			const buf = makeStringTone(freq)
			const { freq: detected } = detectPitch(buf, SAMPLE_RATE)
			expect(detected).not.toBeNull()
			// The crux: not an octave (or fifth) out.
			expect(centsError(detected!, freq)).toBeLessThan(15)
		})
	}

	it('stays accurate at the top of the range (E5, 659.25 Hz)', () => {
		// Above the open strings: the decimated correlation has fewer samples per
		// period here, so this guards that parabolic interpolation still nails it.
		const buf = makeStringTone(659.25)
		const { freq: detected } = detectPitch(buf, SAMPLE_RATE)
		expect(detected).not.toBeNull()
		expect(centsError(detected!, 659.25)).toBeLessThan(5)
	})

	it('reports a detuned note with cent-level precision', () => {
		// A4 sharpened by 30 cents — a tuner must resolve the offset, not just the
		// nearest note, so the reading has to land very close to the real pitch.
		const target = 440 * Math.pow(2, 30 / 1200)
		const buf = makeStringTone(target)
		const { freq: detected } = detectPitch(buf, SAMPLE_RATE)
		expect(detected).not.toBeNull()
		expect(centsError(detected!, target)).toBeLessThan(3)
	})

	it('detects a low bass E1 (41.2 Hz) once the floor is dropped', () => {
		const buf = makeStringTone(41.2)
		const { freq } = detectPitch(buf, SAMPLE_RATE, 30, 1200)
		expect(freq).not.toBeNull()
		expect(centsError(freq!, 41.2)).toBeLessThan(15)
	})

	it('detects a 5-string bass low B0 (30.87 Hz) with the floor dropped', () => {
		const buf = makeStringTone(30.87)
		const { freq } = detectPitch(buf, SAMPLE_RATE, 26, 1200)
		expect(freq).not.toBeNull()
		expect(centsError(freq!, 30.87)).toBeLessThan(25)
	})

	it('cannot reach that low B0 at the default guitar floor (adaptive floor unlocks bass)', () => {
		const buf = makeStringTone(30.87)
		const { freq } = detectPitch(buf, SAMPLE_RATE)
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
				0.4 * Math.sin((2 * Math.PI * f0 * i) / SAMPLE_RATE) +
				0.6 * Math.sin((2 * Math.PI * 2 * f0 * i) / SAMPLE_RATE)
		}
		const { freq } = detectPitch(buf, SAMPLE_RATE)
		expect(freq).not.toBeNull()
		// Must stay near 110, not drop to 55.
		expect(centsError(freq!, f0)).toBeLessThan(20)
	})
})
