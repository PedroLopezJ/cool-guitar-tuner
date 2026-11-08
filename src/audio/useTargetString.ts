import { useMemo, useState } from 'react'
import { DEFAULT_A4_HZ, getCents, isInTune, isInvalidFrequency } from './noteUtils'
import { nearestString, noteToFrequency, stringNumber, type Tuning } from './tunings'

/**
 * The open string the player is tuning, and how far the current pitch is from
 * it. This — not the nearest chromatic note — is what "in tune" has to mean once
 * a tuning is picked: in Eb Standard an untouched E2 string is a perfect E, but
 * it is still a semitone sharp of the Eb it should be.
 */
export interface TargetString {
	/** Index into `tuning.strings` (lowest string first). */
	index: number
	/** The string's note as written in the tuning, e.g. 'Eb2'. */
	note: string
	/** Conventional string number (1 = highest standard string), or null above the core. */
	number: number | null
	/** Offset of the current pitch from this string's open pitch (can exceed ±50). */
	cents: number
	/** In-tune verdict with hysteresis on `cents`. */
	inTune: boolean
	/** True when the target was forced via `lockedIndex` rather than picked as the nearest. */
	locked: boolean
}

function isValidIndex(index: number | null | undefined, tuning: Tuning): index is number {
	return (
		index !== null &&
		index !== undefined &&
		Number.isInteger(index) &&
		index >= 0 &&
		index < tuning.strings.length
	)
}

/**
 * Pick the target string for `frequency` (pure, no hysteresis): the locked
 * string when `lockedIndex` is valid, otherwise the nearest open string.
 */
export function resolveTargetString(
	frequency: number | null,
	tuning: Tuning,
	lockedIndex: number | null = null,
	a4Hz: number = DEFAULT_A4_HZ,
): Omit<TargetString, 'inTune'> | null {
	if (frequency === null || isInvalidFrequency(frequency)) return null

	let index: number
	let cents: number
	const locked = isValidIndex(lockedIndex, tuning)
	if (locked) {
		index = lockedIndex
		cents = getCents(frequency, noteToFrequency(tuning.strings[index], a4Hz))
	} else {
		const nearest = nearestString(frequency, tuning, a4Hz)
		if (!nearest) return null
		index = nearest.index
		cents = nearest.cents
	}

	const number = stringNumber(tuning, index)
	return { index, note: tuning.strings[index], number: number > 0 ? number : null, cents, locked }
}

interface TrackedVerdict {
	/** Identifies the tuning + string the verdict belongs to; null when idle. */
	key: string | null
	inTune: boolean
}

const IDLE: TrackedVerdict = { key: null, inTune: false }

/**
 * Target string for the live pitch, with in-tune hysteresis that carries only
 * while the player stays on the same string of the same tuning (it resets on a
 * string/tuning change or when the signal drops).
 */
export function useTargetString(
	frequency: number | null,
	tuning: Tuning,
	options: { lockedIndex?: number | null; a4Hz?: number } = {},
): TargetString | null {
	const { lockedIndex = null, a4Hz = DEFAULT_A4_HZ } = options
	const resolved = resolveTargetString(frequency, tuning, lockedIndex, a4Hz)
	const key = resolved ? `${tuning.id}:${resolved.index}` : null

	// The previous verdict lives in state and is adjusted during render (React's
	// "storing information from previous renders" pattern): deterministic, so it
	// is StrictMode-safe, and it never needs an effect or a ref read in render.
	const [tracked, setTracked] = useState<TrackedVerdict>(IDLE)
	const wasInTune = key !== null && tracked.key === key && tracked.inTune
	const inTune = resolved !== null && isInTune(resolved.cents, wasInTune)
	if (tracked.key !== key || tracked.inTune !== inTune) setTracked({ key, inTune })

	const index = resolved?.index
	const note = resolved?.note
	const number = resolved?.number
	const cents = resolved?.cents
	const locked = resolved?.locked
	return useMemo(
		() =>
			index === undefined
				? null
				: { index, note: note!, number: number ?? null, cents: cents!, inTune, locked: locked! },
		[index, note, number, cents, inTune, locked],
	)
}
