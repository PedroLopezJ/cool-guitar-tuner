// Wording for screen readers. Note names are spelled out ("E flat 2") because
// readers announce "Eb2" as "E B 2" and often skip '#' entirely, and offsets are
// phrased as an instruction so the player knows which way to turn the peg.

const ACCIDENTAL_WORDS: Record<string, string> = { '#': 'sharp', b: 'flat' }

/** 'Eb2' → 'E flat 2', 'C#' → 'C sharp', 'A4' → 'A 4'. Anything else is returned as-is. */
export function speakNote(note: string): string {
	const match = /^([A-G])([#b]?)(-?\d*)$/.exec(note)
	if (!match) return note
	const [, letter, accidental, octave] = match
	return [letter, ACCIDENTAL_WORDS[accidental], octave].filter(Boolean).join(' ')
}

/** "12 cents flat, tune up." / "1 cent sharp, tune down." / "In tune." */
export function describeOffset(cents: number, inTune: boolean): string {
	if (inTune) return 'In tune.'
	const amount = Math.round(Math.abs(cents))
	const unit = amount === 1 ? 'cent' : 'cents'
	return cents < 0 ? `${amount} ${unit} flat, tune up.` : `${amount} ${unit} sharp, tune down.`
}

/**
 * Spoken name of an open string: "String 6, E flat 2." — or, for a string above
 * the standard set that has no conventional number (6-string bass high C),
 * "C 3 string."
 */
export function describeString(number: number | null, note: string): string {
	return number === null ? `${speakNote(note)} string.` : `String ${number}, ${speakNote(note)}.`
}
