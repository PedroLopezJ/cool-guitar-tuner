import { memo, type CSSProperties } from 'react'
import { MAX_EXTENDED_STRINGS, extendedLevel, stringLetter, type Tuning } from '../audio/tunings'

/**
 * A row of pips, one per open string (lowest on the left). The extra low strings
 * a 7-/8-string adds are tinted violet — deeper the further past standard they
 * sit — so they stand apart from the base six. The string nearest the current
 * pitch lights up and turns green once it lands in tune, so you can see which
 * string you're on without leaving the rings.
 */
export const StringStrip = memo(function StringStrip({
	tuning,
	activeIndex,
	inTune,
}: {
	tuning: Tuning
	activeIndex: number | null
	inTune: boolean
}) {
	return (
		<div className="string-strip" aria-hidden="true">
			{tuning.strings.map((note, index) => {
				const active = index === activeIndex
				const level = extendedLevel(tuning, index)
				const className = `string-pip${level > 0 ? ' is-extended' : ''}${
					active ? ' is-active' : ''
				}${active && inTune ? ' in-tune' : ''}`
				return (
					<span
						className={className}
						key={`${note}-${index}`}
						style={level > 0 ? ({ '--ext-t': level / MAX_EXTENDED_STRINGS } as CSSProperties) : undefined}
					>
						{stringLetter(note)}
					</span>
				)
			})}
		</div>
	)
})
