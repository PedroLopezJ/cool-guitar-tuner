import { memo } from 'react'

// A real minus sign: the hyphen-minus is narrower than '+' and makes the number
// jump sideways as the reading crosses zero.
const MINUS = '−'

/** Whole cents, always signed away from zero: "+12", "−7", "0". */
export function formatCents(cents: number): string {
	const rounded = Math.round(cents)
	if (rounded === 0) return '0'
	return `${rounded > 0 ? '+' : MINUS}${Math.abs(rounded)}`
}

type Direction = 'in-tune' | 'flat' | 'sharp'

const HINTS: Record<Direction, { symbol: string; text: string }> = {
	'in-tune': { symbol: '✓', text: 'In tune' },
	flat: { symbol: '♭', text: 'Tune up' },
	sharp: { symbol: '♯', text: 'Tune down' },
}

/**
 * The offset as text under the note. The rings already show it, but only as a
 * radius and a color — this spells out how far and which way to turn the peg,
 * so it reads without relying on color (or on judging a ring's size).
 *
 * Lives in the HTML overlay rather than the 3D scene: the bundled 3D font has no
 * ♭/♯ glyphs, and plain DOM text is crisper at small sizes anyway.
 */
export const CentsReadout = memo(function CentsReadout({
	cents,
	inTune,
}: {
	cents: number
	inTune: boolean
}) {
	const direction: Direction = inTune ? 'in-tune' : cents < 0 ? 'flat' : 'sharp'
	const hint = HINTS[direction]
	return (
		<div className={`cents-readout is-${direction}`}>
			<span className="cents-readout__value">{formatCents(cents)}</span>
			<span className="cents-readout__hint">
				<span className="cents-readout__symbol" aria-hidden="true">
					{hint.symbol}
				</span>{' '}
				{hint.text}
			</span>
		</div>
	)
})
