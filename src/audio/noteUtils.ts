const A4_HZ = 440
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const A4_INDEX = 9

export const isInvalidFrequency = (freq: number) => !Number.isFinite(freq) || freq <= 0

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
	const semitonesFromA4 = 12 * Math.log2(freq / A4_HZ)
	const rounded = Math.round(semitonesFromA4)
	const noteIndex = (A4_INDEX + (rounded % 12) + 12) % 12
	const octave = 4 + Math.floor((A4_INDEX + rounded) / 12)
	const referenceHz = A4_HZ * Math.pow(2, rounded / 12)
	return {
		name: NOTE_NAMES[noteIndex],
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
