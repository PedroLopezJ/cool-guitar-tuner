import { describe, it, expect } from 'vitest'
import {
	DEFAULT_A4_HZ,
	IN_TUNE_ENTER_CENTS,
	IN_TUNE_EXIT_CENTS,
	MAX_A4_HZ,
	MIN_A4_HZ,
	cannotComputeCents,
	clampA4Hz,
	frequencyToSemitone,
	getCents,
	isInTune,
	isInvalidFrequency,
	noteFromSemitone,
} from './noteUtils'

describe('isInvalidFrequency', () => {
	it('returns true for NaN', () => {
		expect(isInvalidFrequency(Number.NaN)).toBe(true)
	})
	it('returns true for zero', () => {
		expect(isInvalidFrequency(0)).toBe(true)
	})
	it('returns true for negative', () => {
		expect(isInvalidFrequency(-100)).toBe(true)
	})
	it('returns false for valid frequency', () => {
		expect(isInvalidFrequency(440)).toBe(false)
		expect(isInvalidFrequency(82.41)).toBe(false)
	})
})

describe('noteFromSemitone', () => {
	it('maps 0 to A4', () => {
		expect(noteFromSemitone(0)).toEqual({ name: 'A', octave: 4, referenceHz: 440 })
	})
	it('maps -29 to E2 (low E string)', () => {
		const result = noteFromSemitone(-29)
		expect(result.name).toBe('E')
		expect(result.octave).toBe(2)
	})
	it('distinguishes octaves of the same pitch class', () => {
		expect(noteFromSemitone(-29).octave).toBe(2) // E2
		expect(noteFromSemitone(-17).octave).toBe(3) // E3
		expect(noteFromSemitone(-5).octave).toBe(4) // E4
	})
	it('round-trips with frequencyToSemitone on the reference frequency', () => {
		const semitone = frequencyToSemitone(196)!
		const { name, octave, referenceHz } = noteFromSemitone(semitone)
		expect(`${name}${octave}`).toBe('G3')
		expect(referenceHz).toBeCloseTo(196, 0)
	})
	it('scales the reference frequency with a calibrated A4', () => {
		expect(noteFromSemitone(0, 432).referenceHz).toBe(432)
		expect(noteFromSemitone(-29, 432).referenceHz).toBeCloseTo(
			noteFromSemitone(-29).referenceHz * (432 / 440),
			6,
		)
	})
})

describe('frequencyToSemitone', () => {
	it('returns 0 for A4', () => {
		expect(frequencyToSemitone(440)).toBe(0)
	})
	it('returns -29 for low E (~82.41 Hz)', () => {
		expect(frequencyToSemitone(82.41)).toBe(-29)
	})
	it('returns null for invalid input', () => {
		expect(frequencyToSemitone(0)).toBeNull()
		expect(frequencyToSemitone(Number.NaN)).toBeNull()
		expect(frequencyToSemitone(440, 0)).toBeNull()
	})
	it('reads 432 Hz as A4 at 0 cents when calibrated to A4 = 432', () => {
		const semitone = frequencyToSemitone(432, 432)!
		expect(semitone).toBe(0)
		const { name, octave, referenceHz } = noteFromSemitone(semitone, 432)
		expect(`${name}${octave}`).toBe('A4')
		expect(getCents(432, referenceHz)).toBeCloseTo(0, 6)
		// …whereas at the default 440 the same 432 Hz is a flat A4.
		expect(getCents(432, noteFromSemitone(frequencyToSemitone(432)!).referenceHz)).toBeLessThan(-30)
	})
})

describe('cannotComputeCents', () => {
	it('returns true when freq or referenceHz is invalid', () => {
		expect(cannotComputeCents(0, 440)).toBe(true)
		expect(cannotComputeCents(440, 0)).toBe(true)
		expect(cannotComputeCents(Number.NaN, 440)).toBe(true)
		expect(cannotComputeCents(440, Number.NaN)).toBe(true)
	})
	it('returns false for valid pair', () => {
		expect(cannotComputeCents(440, 440)).toBe(false)
	})
})

describe('getCents', () => {
	it('returns 0 when frequencies match', () => {
		expect(getCents(440, 440)).toBe(0)
	})
	it('returns positive cents when freq is higher than reference', () => {
		expect(getCents(466.16, 440)).toBeGreaterThan(0)
	})
	it('returns negative cents when freq is lower than reference', () => {
		expect(getCents(415.3, 440)).toBeLessThan(0)
	})
	it('returns 0 for invalid inputs', () => {
		expect(getCents(0, 440)).toBe(0)
		expect(getCents(440, 0)).toBe(0)
	})
	it('returns about 100 cents for one semitone sharp', () => {
		const cents = getCents(440 * Math.pow(2, 1 / 12), 440)
		expect(Math.abs(cents - 100)).toBeLessThan(1)
	})
})

describe('isInTune (hysteresis)', () => {
	it('uses a tighter band to enter than to stay', () => {
		expect(IN_TUNE_ENTER_CENTS).toBeLessThan(IN_TUNE_EXIT_CENTS)
	})
	it('enters only inside the enter band', () => {
		expect(isInTune(0, false)).toBe(true)
		expect(isInTune(-4.9, false)).toBe(true)
		expect(isInTune(6, false)).toBe(false)
		expect(isInTune(-7.5, false)).toBe(false)
	})
	it('stays in tune until the exit band is crossed', () => {
		expect(isInTune(6, true)).toBe(true)
		expect(isInTune(-7.9, true)).toBe(true)
		expect(isInTune(8, true)).toBe(false)
		expect(isInTune(-12, true)).toBe(false)
	})
	it('does not flicker for a note hovering on the old 8-cent boundary', () => {
		let inTune = false
		const readings = [3, 7.5, 8.2, 7.8, 8.1, 7.6, 8.3]
		const verdicts = readings.map((cents) => (inTune = isInTune(cents, inTune)))
		// Once in, it drops out at 8.2 and then needs to get back under 5 cents.
		expect(verdicts).toEqual([true, true, false, false, false, false, false])
	})
	it('is never in tune for non-finite cents', () => {
		expect(isInTune(Number.NaN, true)).toBe(false)
	})
})

describe('A4 calibration range', () => {
	it('defaults to 440 within a sane range', () => {
		expect(DEFAULT_A4_HZ).toBe(440)
		expect(MIN_A4_HZ).toBeLessThan(432)
		expect(MAX_A4_HZ).toBeGreaterThan(446)
	})
	it('clamps out-of-range and invalid values', () => {
		expect(clampA4Hz(432)).toBe(432)
		expect(clampA4Hz(100)).toBe(MIN_A4_HZ)
		expect(clampA4Hz(1000)).toBe(MAX_A4_HZ)
		expect(clampA4Hz(Number.NaN)).toBe(DEFAULT_A4_HZ)
	})
})
