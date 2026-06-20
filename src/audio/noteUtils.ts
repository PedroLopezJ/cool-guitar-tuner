const A4_HZ = 440
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const A4_INDEX = 9

export const isInvalidFrequency = (freq: number) => !Number.isFinite(freq) || freq <= 0

/**
 * Resolve a semitone offset from A4 into a concrete note (name, octave and the
 * exact reference frequency for that note). Keeping this in one place means the
 * displayed note, its octave and the cents reference can never disagree.
 */
export function noteFromSemitone(semitonesFromA4: number): {
	name: string
	octave: number
	referenceHz: number
} {
	const noteIndex = (((A4_INDEX + semitonesFromA4) % 12) + 12) % 12
	const octave = 4 + Math.floor((A4_INDEX + semitonesFromA4) / 12)
	const referenceHz = A4_HZ * Math.pow(2, semitonesFromA4 / 12)
	return { name: NOTE_NAMES[noteIndex], octave, referenceHz }
}

/** Nearest semitone (relative to A4) for a frequency, or null when invalid. */
export function frequencyToSemitone(freq: number): number | null {
	if (isInvalidFrequency(freq)) return null
	return Math.round(12 * Math.log2(freq / A4_HZ))
}

export function frequencyToNote(freq: number): {
	name: string
	octave: number
	referenceHz: number
	semitonesFromA4: number
} {
	if (isInvalidFrequency(freq)) {
		return {
			name: '—',
			octave: 4,
			referenceHz: A4_HZ,
			semitonesFromA4: 0,
		}
	}
	const rounded = Math.round(12 * Math.log2(freq / A4_HZ))
	const { name, octave, referenceHz } = noteFromSemitone(rounded)
	return {
		name,
		octave,
		referenceHz,
		semitonesFromA4: rounded,
	}
}

export const cannotComputeCents = (freq: number, referenceHz: number) =>
	!Number.isFinite(freq) || !Number.isFinite(referenceHz) || referenceHz <= 0 || freq <= 0

export function getCents(freq: number, referenceHz: number): number {
	if (cannotComputeCents(freq, referenceHz)) return 0
	return 1200 * Math.log2(freq / referenceHz)
}

export const IN_TUNE_CENTS_THRESHOLD = 8
