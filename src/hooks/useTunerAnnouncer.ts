import { useEffect, useRef } from 'react'
import { describeOffset } from '../speech'

/** Floor between "what you're tuning" announcements; in-tune flips skip it. */
export const ANNOUNCE_MIN_INTERVAL_MS = 1500

export interface TunerAnnouncement {
	/**
	 * Identifies what is being tuned (a string of a tuning, or a chromatic note);
	 * null while nothing is sounding. A change of key is what gets announced.
	 */
	subjectKey: string | null
	/** Spoken name of that subject, e.g. "String 6, E flat 2." */
	subject: string
	cents: number
	inTune: boolean
}

/**
 * Feeds a polite live region with what a sighted player reads off the rings:
 * which string/note they're on (on change, throttled to one message every
 * ANNOUNCE_MIN_INTERVAL_MS) and when it enters or leaves "in tune" (at once).
 * Cents drift on its own is never announced — at 15 updates a second it would
 * drown the screen reader.
 *
 * The region's text is written directly rather than through React state: these
 * messages are side effects of timing, and re-rendering the whole tuner to
 * change one invisible string would be wasted work.
 */
export function useTunerAnnouncer({ subjectKey, subject, cents, inTune }: TunerAnnouncement) {
	const regionRef = useRef<HTMLDivElement>(null)
	// The latest reading, for a throttled announcement that fires later.
	const latestRef = useRef({ subject, cents, inTune })
	const previousRef = useRef<{ subjectKey: string | null; inTune: boolean }>({
		subjectKey: null,
		inTune: false,
	})
	const lastSpokenAtRef = useRef(-Infinity)
	const timerRef = useRef<number | undefined>(undefined)
	const toggleRef = useRef(false)

	useEffect(() => {
		latestRef.current = { subject, cents, inTune }
	})

	useEffect(() => {
		const previous = previousRef.current
		previousRef.current = { subjectKey, inTune }

		const cancelPending = () => {
			window.clearTimeout(timerRef.current)
			timerRef.current = undefined
		}
		const say = (text: string) => {
			const region = regionRef.current
			if (!region) return
			// Screen readers skip a live region whose text didn't change, so a
			// repeated message ("In tune." twice) alternates a trailing NBSP.
			toggleRef.current = !toggleRef.current
			region.textContent = toggleRef.current ? text : `${text} `
			lastSpokenAtRef.current = Date.now()
		}
		const sayTarget = () => {
			cancelPending()
			const latest = latestRef.current
			say(`${latest.subject} ${describeOffset(latest.cents, latest.inTune)}`)
		}

		if (subjectKey === null) {
			// Nothing sounding: a queued message would describe a note that's gone.
			cancelPending()
			return
		}
		if (subjectKey !== previous.subjectKey) {
			const wait = lastSpokenAtRef.current + ANNOUNCE_MIN_INTERVAL_MS - Date.now()
			if (wait <= 0) sayTarget()
			else if (timerRef.current === undefined) timerRef.current = window.setTimeout(sayTarget, wait)
			return
		}
		if (inTune !== previous.inTune) {
			// The verdict is what the player is waiting for, so it never waits. A
			// queued subject announcement goes out now instead: it carries the
			// verdict too.
			if (timerRef.current !== undefined) sayTarget()
			else say(describeOffset(latestRef.current.cents, inTune))
		}
	}, [subjectKey, inTune])

	useEffect(() => () => window.clearTimeout(timerRef.current), [])

	return regionRef
}
