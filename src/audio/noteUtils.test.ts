import { describe, it, expect } from 'vitest'
import {
	frequencyToNote,
	getCents,
	isInvalidFrequency,
	cannotComputeCents,
	IN_TUNE_CENTS_THRESHOLD,
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

describe('frequencyToNote', () => {
	it('returns fallback for invalid frequency', () => {
		expect(frequencyToNote(0)).toEqual({
			name: '—',
			octave: 4,
			referenceHz: 440,
			semitonesFromA4: 0,
		})
		expect(frequencyToNote(Number.NaN)).toEqual({
			name: '—',
			octave: 4,
			referenceHz: 440,
			semitonesFromA4: 0,
		})
	})
	it('returns A4 for 440 Hz', () => {
		const result = frequencyToNote(440)
		expect(result.name).toBe('A')
		expect(result.octave).toBe(4)
		expect(result.referenceHz).toBe(440)
		expect(result.semitonesFromA4).toBe(0)
	})
	it('returns E2 for low E string (~82.41 Hz)', () => {
		const result = frequencyToNote(82.41)
		expect(result.name).toBe('E')
		expect(result.octave).toBe(2)
	})
	it('returns A#4 for slightly above 440 Hz', () => {
		const result = frequencyToNote(466.16)
		expect(result.name).toBe('A#')
		expect(result.octave).toBe(4)
	})
	it('returns G3 for ~196 Hz', () => {
		const result = frequencyToNote(196)
		expect(result.name).toBe('G')
		expect(result.octave).toBe(3)
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

describe('IN_TUNE_CENTS_THRESHOLD', () => {
	it('is a positive number', () => {
		expect(IN_TUNE_CENTS_THRESHOLD).toBeGreaterThan(0)
		expect(typeof IN_TUNE_CENTS_THRESHOLD).toBe('number')
	})
})
