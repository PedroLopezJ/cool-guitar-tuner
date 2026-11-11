import { describe, expect, it } from 'vitest'
import { describeOffset, describeString, speakNote } from './speech'
import { formatCents } from './components/CentsReadout'

describe('speakNote', () => {
	it('spells accidentals as words', () => {
		expect(speakNote('Eb2')).toBe('E flat 2')
		expect(speakNote('C#')).toBe('C sharp')
		expect(speakNote('A4')).toBe('A 4')
		expect(speakNote('B0')).toBe('B 0')
	})

	it('leaves anything that is not a note alone', () => {
		expect(speakNote('—')).toBe('—')
	})
})

describe('describeOffset', () => {
	it('phrases the offset as an instruction, rounded to whole cents', () => {
		expect(describeOffset(-12.4, false)).toBe('12 cents flat, tune up.')
		expect(describeOffset(7.6, false)).toBe('8 cents sharp, tune down.')
		expect(describeOffset(-1.2, false)).toBe('1 cent flat, tune up.')
		expect(describeOffset(3, true)).toBe('In tune.')
	})
})

describe('describeString', () => {
	it('names numbered and unnumbered strings', () => {
		expect(describeString(6, 'Eb2')).toBe('String 6, E flat 2.')
		expect(describeString(null, 'C3')).toBe('C 3 string.')
	})
})

describe('formatCents', () => {
	it('signs whole cents with a true minus and never shows −0', () => {
		expect(formatCents(12.4)).toBe('+12')
		expect(formatCents(-7.5)).toBe('−7')
		expect(formatCents(-0.4)).toBe('0')
		expect(formatCents(0)).toBe('0')
	})
})
