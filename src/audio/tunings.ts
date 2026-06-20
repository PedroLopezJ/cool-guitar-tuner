// Instrument tunings, each described low string → high string in scientific
// pitch notation. Standard tunings collapse their string-count variants into a
// single entry (e.g. guitar E standard covers 6-/7-/8-string by adding low F#/B,
// bass E standard covers 4-/5-/6-string by adding a low B and a high C); the
// extra strings surface tinted instead of as separate rows.

export type Instrument = 'guitar' | 'bass'
export type TuningCategory = 'Standard' | 'Drop' | 'Open'

export interface Tuning {
	id: string
	name: string
	instrument: Instrument
	category: TuningCategory
	/** Open-string notes, lowest first. */
	strings: string[]
	/**
	 * Index where the instrument's standard core begins. Defaults to the lowest
	 * strings being the extended ones; set explicitly when a layout also adds a
	 * high string (e.g. the 6-string bass adds a low B *and* a high C).
	 */
	coreStart?: number
}

export const INSTRUMENTS: { id: Instrument; label: string }[] = [
	{ id: 'guitar', label: 'Guitar' },
	{ id: 'bass', label: 'Bass' },
]

/** Strings on the "standard" instrument; anything beyond is extended range. */
export const STANDARD_STRING_COUNTS: Record<Instrument, number> = { guitar: 6, bass: 4 }
/** Denominator for the extended-tint scale (deepest layout adds this many). */
export const MAX_EXTENDED_STRINGS = 2

export const TUNING_CATEGORY_ORDER: TuningCategory[] = ['Standard', 'Drop', 'Open']

export const TUNINGS: Tuning[] = [
	// === Guitar ============================================================
	// --- Standard / lowered ---
	{
		id: 'e-standard',
		name: 'E Standard',
		instrument: 'guitar',
		category: 'Standard',
		strings: ['F#1', 'B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
	},
	{
		id: 'eb-standard',
		name: 'Eb Standard',
		instrument: 'guitar',
		category: 'Standard',
		strings: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'],
	},
	{
		id: 'd-standard',
		name: 'D Standard',
		instrument: 'guitar',
		category: 'Standard',
		strings: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'],
	},
	{
		id: 'csharp-standard',
		name: 'C# Standard',
		instrument: 'guitar',
		category: 'Standard',
		strings: ['C#2', 'F#2', 'B2', 'E3', 'G#3', 'C#4'],
	},
	{
		id: 'c-standard',
		name: 'C Standard',
		instrument: 'guitar',
		category: 'Standard',
		strings: ['C2', 'F2', 'A#2', 'D#3', 'G3', 'C4'],
	},
	// --- Drop ---
	{
		id: 'drop-d',
		name: 'Drop D',
		instrument: 'guitar',
		category: 'Drop',
		strings: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
	},
	{
		id: 'drop-csharp',
		name: 'Drop C#',
		instrument: 'guitar',
		category: 'Drop',
		strings: ['C#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'],
	},
	{
		id: 'drop-c',
		name: 'Drop C',
		instrument: 'guitar',
		category: 'Drop',
		strings: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'],
	},
	{
		id: 'drop-b',
		name: 'Drop B',
		instrument: 'guitar',
		category: 'Drop',
		strings: ['B1', 'F#2', 'B2', 'E3', 'G#3', 'C#4'],
	},
	{
		id: 'drop-a',
		name: 'Drop A',
		instrument: 'guitar',
		category: 'Drop',
		strings: ['A1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
	},
	{
		id: 'drop-e',
		name: 'Drop E',
		instrument: 'guitar',
		category: 'Drop',
		strings: ['E1', 'B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
	},
	// --- Open ---
	{
		id: 'open-d',
		name: 'Open D',
		instrument: 'guitar',
		category: 'Open',
		strings: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'],
	},
	{
		id: 'open-g',
		name: 'Open G',
		instrument: 'guitar',
		category: 'Open',
		strings: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'],
	},
	{
		id: 'open-e',
		name: 'Open E',
		instrument: 'guitar',
		category: 'Open',
		strings: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'],
	},
	{
		id: 'open-c',
		name: 'Open C',
		instrument: 'guitar',
		category: 'Open',
		strings: ['C2', 'G2', 'C3', 'G3', 'C4', 'E4'],
	},
	{
		id: 'dadgad',
		name: 'DADGAD',
		instrument: 'guitar',
		category: 'Open',
		strings: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'],
	},

	// === Bass ==============================================================
	// E standard covers 4-/5-/6-string: 5-string adds the low B, 6-string also
	// adds the high C. coreStart=1 marks E1..G2 as the standard four, so the low
	// B reads as extended-low and the high C as extended-high.
	{
		id: 'bass-e-standard',
		name: 'E Standard',
		instrument: 'bass',
		category: 'Standard',
		strings: ['B0', 'E1', 'A1', 'D2', 'G2', 'C3'],
		coreStart: 1,
	},
	{
		id: 'bass-eb-standard',
		name: 'Eb Standard',
		instrument: 'bass',
		category: 'Standard',
		strings: ['Eb1', 'Ab1', 'Db2', 'Gb2'],
	},
	{
		id: 'bass-d-standard',
		name: 'D Standard',
		instrument: 'bass',
		category: 'Standard',
		strings: ['D1', 'G1', 'C2', 'F2'],
	},
	{
		id: 'bass-drop-d',
		name: 'Drop D',
		instrument: 'bass',
		category: 'Drop',
		strings: ['D1', 'A1', 'D2', 'G2'],
	},
	{
		id: 'bass-drop-c',
		name: 'Drop C',
		instrument: 'bass',
		category: 'Drop',
		strings: ['C1', 'G1', 'C2', 'F2'],
	},
]

export function tuningsForInstrument(instrument: Instrument): Tuning[] {
	return TUNINGS.filter((tuning) => tuning.instrument === instrument)
}

export const DEFAULT_TUNING_BY_INSTRUMENT: Record<Instrument, Tuning> = {
	guitar: TUNINGS.find((t) => t.id === 'e-standard')!,
	bass: TUNINGS.find((t) => t.id === 'bass-e-standard')!,
}

export const DEFAULT_TUNING = DEFAULT_TUNING_BY_INSTRUMENT.guitar

const LETTER_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const A4_HZ = 440

/** Semitone distance from A4 for a note like "E2", "C#3" or "Bb1". */
export function noteToSemitonesFromA4(note: string): number {
	const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note.trim())
	if (!match) throw new Error(`Invalid note: ${note}`)
	const letter = match[1].toUpperCase()
	const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0
	const octave = Number.parseInt(match[3], 10)
	return LETTER_SEMITONES[letter] + accidental - 9 + (octave - 4) * 12
}

export function noteToFrequency(note: string): number {
	return A4_HZ * Math.pow(2, noteToSemitonesFromA4(note) / 12)
}

/** Frequency of the lowest open string — drives the adaptive detection floor. */
export function lowestFrequency(tuning: Tuning): number {
	let lowest = Infinity
	for (const note of tuning.strings) lowest = Math.min(lowest, noteToFrequency(note))
	return lowest
}

/** Strip the octave digit so "C#3" → "C#" for compact labels. */
export function stringLetter(note: string): string {
	return note.replace(/-?\d+$/, '')
}

function coreStartIndex(tuning: Tuning): number {
	if (tuning.coreStart !== undefined) return tuning.coreStart
	return Math.max(0, tuning.strings.length - STANDARD_STRING_COUNTS[tuning.instrument])
}

/**
 * How far past the standard set a string sits, for the violet tint: 0 for a
 * standard string; for extended-low strings the value grows the lower they go
 * (so the deepest reads strongest); extended-high strings get a light tint.
 */
export function extendedLevel(tuning: Tuning, index: number): number {
	const start = coreStartIndex(tuning)
	const end = start + STANDARD_STRING_COUNTS[tuning.instrument] - 1
	if (index < start) return start - index
	if (index > end) return 1
	return 0
}

/**
 * Conventional string number (1 = highest standard string), counted from the
 * standard core so it stays correct no matter how many strings the player's
 * instrument actually has. Extended-low strings extend the count downward; a
 * string above the core (the 6-string bass high C) returns ≤ 0 — no fixed number.
 */
export function stringNumber(tuning: Tuning, index: number): number {
	const coreEnd = coreStartIndex(tuning) + STANDARD_STRING_COUNTS[tuning.instrument] - 1
	return coreEnd - index + 1
}

export interface ActiveString {
	index: number
	note: string
	cents: number
}

/**
 * Which open string of `tuning` the incoming pitch is closest to (by cents).
 * Strings sit several semitones apart, so the nearest match is unambiguous well
 * before the note is in tune.
 */
export function nearestString(frequency: number, tuning: Tuning): ActiveString | null {
	if (!Number.isFinite(frequency) || frequency <= 0) return null
	let bestIndex = -1
	let bestAbsCents = Infinity
	let bestCents = 0
	for (let i = 0; i < tuning.strings.length; i++) {
		const cents = 1200 * Math.log2(frequency / noteToFrequency(tuning.strings[i]))
		const abs = Math.abs(cents)
		if (abs < bestAbsCents) {
			bestAbsCents = abs
			bestIndex = i
			bestCents = cents
		}
	}
	if (bestIndex < 0) return null
	return { index: bestIndex, note: tuning.strings[bestIndex], cents: bestCents }
}
