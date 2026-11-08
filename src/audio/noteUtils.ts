// Concert pitch. Every note frequency in the app derives from this one
// reference, so calibrating it (orchestras tune anywhere from ~432 to ~446 Hz)
// shifts note names, cents and string targets together.
export const DEFAULT_A4_HZ = 440
export const MIN_A4_HZ = 430
export const MAX_A4_HZ = 450

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const A4_INDEX = 9

export const isInvalidFrequency = (freq: number) => !Number.isFinite(freq) || freq <= 0

/** Bring an arbitrary (e.g. persisted or user-typed) A4 into the supported range. */
export function clampA4Hz(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_A4_HZ
	return Math.min(MAX_A4_HZ, Math.max(MIN_A4_HZ, value))
}

/**
 * Resolve a semitone offset from A4 into a concrete note (name, octave and the
 * exact reference frequency for that note). Keeping this in one place means the
 * displayed note, its octave and the cents reference can never disagree.
 */
export function noteFromSemitone(
	semitonesFromA4: number,
	a4Hz: number = DEFAULT_A4_HZ,
): {
	name: string
	octave: number
	referenceHz: number
} {
	const noteIndex = (((A4_INDEX + semitonesFromA4) % 12) + 12) % 12
	const octave = 4 + Math.floor((A4_INDEX + semitonesFromA4) / 12)
	const referenceHz = a4Hz * Math.pow(2, semitonesFromA4 / 12)
	return { name: NOTE_NAMES[noteIndex], octave, referenceHz }
}

/** Nearest semitone (relative to A4) for a frequency, or null when invalid. */
export function frequencyToSemitone(freq: number, a4Hz: number = DEFAULT_A4_HZ): number | null {
	if (isInvalidFrequency(freq) || isInvalidFrequency(a4Hz)) return null
	return Math.round(12 * Math.log2(freq / a4Hz))
}

export const cannotComputeCents = (freq: number, referenceHz: number) =>
	!Number.isFinite(freq) || !Number.isFinite(referenceHz) || referenceHz <= 0 || freq <= 0

export function getCents(freq: number, referenceHz: number): number {
	if (cannotComputeCents(freq, referenceHz)) return 0
	return 1200 * Math.log2(freq / referenceHz)
}

// In-tune band with hysteresis: a reading has to get within ENTER cents to turn
// green, but then only drops out past EXIT. A single threshold made the display
// flicker whenever a held note hovered right on the boundary.
export const IN_TUNE_ENTER_CENTS = 5
export const IN_TUNE_EXIT_CENTS = 8

/** In-tune decision for `cents`, given whether the previous reading was in tune. */
export function isInTune(cents: number, wasInTune: boolean): boolean {
	if (!Number.isFinite(cents)) return false
	return Math.abs(cents) < (wasInTune ? IN_TUNE_EXIT_CENTS : IN_TUNE_ENTER_CENTS)
}
