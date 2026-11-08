import { memo, type CSSProperties } from 'react'
import {
	MAX_EXTENDED_STRINGS,
	extendedLevel,
	stringLetter,
	stringNumber,
	type Tuning,
} from '../audio/tunings'
import { speakNote } from '../speech'

function lockLabel(tuning: Tuning, index: number): string {
	const number = stringNumber(tuning, index)
	const which = number > 0 ? `string ${number}` : 'the extra high string'
	return `Lock ${which} (${speakNote(tuning.strings[index])})`
}

/**
 * A row of pips, one per open string (lowest on the left). The extra low strings
 * a 7-/8-string adds are tinted violet — deeper the further past standard they
 * sit — so they stand apart from the base six. The target string lights up and
 * turns green once it lands in tune, so you can see which string you're on
 * without leaving the rings.
 *
 * With `onToggleLock` (string mode) each pip is a toggle button: tapping one
 * pins the target to that string — handy when a badly detuned string sits
 * closer to its neighbour's pitch — and tapping it again goes back to automatic.
 * Without it (chromatic mode) the strip is a decorative reference only.
 */
export const StringStrip = memo(function StringStrip({
	tuning,
	activeIndex,
	inTune,
	lockedIndex = null,
	onToggleLock,
}: {
	tuning: Tuning
	activeIndex: number | null
	inTune: boolean
	/** The string the target is pinned to, or null while picking automatically. */
	lockedIndex?: number | null
	onToggleLock?: (index: number) => void
}) {
	const lockable = onToggleLock !== undefined
	return (
		<div
			className={`string-strip${lockable ? ' is-lockable' : ''}`}
			{...(lockable
				? { role: 'group', 'aria-label': 'Strings — tap one to lock it as the target' }
				: { 'aria-hidden': true })}
		>
			{tuning.strings.map((note, index) => {
				const active = index === activeIndex
				const locked = lockable && index === lockedIndex
				const level = extendedLevel(tuning, index)
				const className = `string-pip${level > 0 ? ' is-extended' : ''}${
					active ? ' is-active' : ''
				}${active && inTune ? ' in-tune' : ''}${locked ? ' is-locked' : ''}`
				const style =
					level > 0 ? ({ '--ext-t': level / MAX_EXTENDED_STRINGS } as CSSProperties) : undefined
				const key = `${note}-${index}`
				if (!lockable) {
					return (
						<span className={className} key={key} style={style}>
							{stringLetter(note)}
						</span>
					)
				}
				return (
					<button
						type="button"
						className={className}
						key={key}
						style={style}
						aria-pressed={locked}
						aria-label={lockLabel(tuning, index)}
						onClick={() => onToggleLock(index)}
					>
						{stringLetter(note)}
					</button>
				)
			})}
		</div>
	)
})
