import { describe, it, expect } from 'vitest'
import {
	DEFAULT_TUNING,
	DEFAULT_TUNING_BY_INSTRUMENT,
	TUNINGS,
	extendedLevel,
	lowestFrequency,
	nearestString,
	noteToFrequency,
	spellNoteName,
	stringNumber,
	tuningsForInstrument,
	usesFlats,
} from './tunings'

const byId = (id: string) => TUNINGS.find((t) => t.id === id)!

describe('tunings', () => {
	it('converts scientific pitch notation to the right frequency', () => {
		expect(noteToFrequency('A4')).toBeCloseTo(440, 5)
		expect(noteToFrequency('E2')).toBeCloseTo(82.41, 1)
		expect(noteToFrequency('B1')).toBeCloseTo(61.74, 1) // low 7-string
		expect(noteToFrequency('Eb2')).toBeCloseTo(77.78, 1) // flats parse too
	})

	it('maps a pitch to the closest open string', () => {
		// Slightly flat low E should still resolve to the E2 string (index 2 in the
		// unified standard tuning: F#1 B1 E2 ...).
		const active = nearestString(81.5, DEFAULT_TUNING)
		expect(active).not.toBeNull()
		expect(active!.index).toBe(2)
		expect(active!.note).toBe('E2')
		expect(active!.cents).toBeLessThan(0)
	})

	it('disambiguates the two E strings in standard tuning by octave', () => {
		const high = nearestString(noteToFrequency('E4'), DEFAULT_TUNING)
		expect(high!.index).toBe(7)
		expect(high!.note).toBe('E4')
	})

	it('every tuning has a unique id and valid, parseable strings', () => {
		const ids = new Set<string>()
		for (const tuning of TUNINGS) {
			expect(ids.has(tuning.id)).toBe(false)
			ids.add(tuning.id)
			for (const note of tuning.strings) {
				expect(Number.isFinite(noteToFrequency(note))).toBe(true)
			}
		}
	})
})

describe('instruments & extended strings', () => {
	const bass = DEFAULT_TUNING_BY_INSTRUMENT.bass // B0 E1 A1 D2 G2 C3
	const guitar = DEFAULT_TUNING_BY_INSTRUMENT.guitar // F#1 B1 E2 A2 D3 G3 B3 E4

	it('lists only bass tunings for the bass instrument', () => {
		const list = tuningsForInstrument('bass')
		expect(list.length).toBeGreaterThan(0)
		expect(list.every((t) => t.instrument === 'bass')).toBe(true)
	})

	it('numbers strings from the standard core, correct at any string count', () => {
		expect(stringNumber(guitar, 2)).toBe(6) // E2 → 6th
		expect(stringNumber(guitar, 7)).toBe(1) // high E4 → 1st
		expect(stringNumber(bass, 1)).toBe(4) // E1 → 4th (right for a 4-string)
		expect(stringNumber(bass, 0)).toBe(5) // low B0 → 5th
		expect(stringNumber(bass, 4)).toBe(1) // G2 → 1st
		expect(stringNumber(bass, 5)).toBeLessThanOrEqual(0) // high C: no fixed number
	})

	it('tints the bass low B and high C as extended, core strings as standard', () => {
		expect(extendedLevel(bass, 0)).toBeGreaterThan(0) // B0 (low)
		expect(extendedLevel(bass, 5)).toBeGreaterThan(0) // C3 (high)
		expect(extendedLevel(bass, 1)).toBe(0) // E1 (core)
		expect(extendedLevel(bass, 4)).toBe(0) // G2 (core)
		// Guitar 8th (F#1) reads deeper than the 7th (B1).
		expect(extendedLevel(guitar, 0)).toBeGreaterThan(extendedLevel(guitar, 1))
	})

	it('reports the lowest string frequency for the adaptive floor', () => {
		expect(lowestFrequency(bass)).toBeCloseTo(noteToFrequency('B0'), 5)
		expect(noteToFrequency('B0')).toBeCloseTo(30.87, 1)
	})
})

describe('A4 calibration', () => {
	it('scales every open-string frequency with A4', () => {
		expect(noteToFrequency('A4', 432)).toBeCloseTo(432, 6)
		expect(noteToFrequency('E2', 432)).toBeCloseTo(noteToFrequency('E2') * (432 / 440), 6)
		const bass = DEFAULT_TUNING_BY_INSTRUMENT.bass
		expect(lowestFrequency(bass, 432)).toBeCloseTo(lowestFrequency(bass) * (432 / 440), 6)
	})

	it('measures string cents against the calibrated reference', () => {
		// A string tuned to E2 at A4 = 432 is ~-31.8 cents at 440, but dead on at 432.
		const e2At432 = noteToFrequency('E2', 432)
		expect(nearestString(e2At432, DEFAULT_TUNING)!.cents).toBeCloseTo(-31.77, 1)
		expect(nearestString(e2At432, DEFAULT_TUNING, 432)!.cents).toBeCloseTo(0, 6)
	})
})

describe('enharmonic spelling', () => {
	it('detects tunings written with flats', () => {
		expect(usesFlats(byId('eb-standard'))).toBe(true)
		expect(usesFlats(byId('bass-eb-standard'))).toBe(true)
		// B1 / B3 are naturals, not flats; sharps-only tunings stay sharp.
		expect(usesFlats(byId('e-standard'))).toBe(false)
		expect(usesFlats(byId('drop-csharp'))).toBe(false)
		expect(usesFlats(byId('open-d'))).toBe(false)
	})

	it('respells sharps as flats, with or without an octave', () => {
		expect(spellNoteName('C#', true)).toBe('Db')
		expect(spellNoteName('D#', true)).toBe('Eb')
		expect(spellNoteName('F#', true)).toBe('Gb')
		expect(spellNoteName('G#', true)).toBe('Ab')
		expect(spellNoteName('A#', true)).toBe('Bb')
		expect(spellNoteName('D#2', true)).toBe('Eb2')
		expect(spellNoteName('A#-1', true)).toBe('Bb-1')
	})

	it('leaves naturals, placeholders and sharp-mode names untouched', () => {
		expect(spellNoteName('E', true)).toBe('E')
		expect(spellNoteName('B3', true)).toBe('B3')
		expect(spellNoteName('—', true)).toBe('—')
		expect(spellNoteName('D#', false)).toBe('D#')
		expect(spellNoteName('D#2', false)).toBe('D#2')
	})

	it('matches the tuning spelling for the Eb Standard low string', () => {
		const tuning = byId('eb-standard')
		expect(spellNoteName('D#2', usesFlats(tuning))).toBe(tuning.strings[0])
	})
})
