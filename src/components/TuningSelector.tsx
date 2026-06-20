import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
	TUNING_CATEGORY_ORDER,
	MAX_EXTENDED_STRINGS,
	extendedLevel,
	stringLetter,
	tuningsForInstrument,
	type Instrument,
	type Tuning,
} from '../audio/tunings'

/**
 * The open-string notes as a compact row. Extended-range strings (the low ones
 * a 7-/8-string adds) are tinted violet, deeper the further past standard they
 * sit, so the extra reach reads at a glance without splitting the list.
 */
function NoteLetters({ tuning }: { tuning: Tuning }) {
	return (
		<span className="tuning-letters">
			{tuning.strings.map((note, index) => {
				const level = extendedLevel(tuning, index)
				return (
					<span
						key={`${note}-${index}`}
						className={level > 0 ? 'tuning-letter tuning-letter--ext' : 'tuning-letter'}
						style={level > 0 ? ({ '--ext-t': level / MAX_EXTENDED_STRINGS } as CSSProperties) : undefined}
					>
						{stringLetter(note)}
					</span>
				)
			})}
		</span>
	)
}

export const TuningSelector = memo(function TuningSelector({
	instrument,
	value,
	onChange,
}: {
	instrument: Instrument
	value: Tuning
	onChange: (tuning: Tuning) => void
}) {
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)

	// Group the instrument's tunings by category once per instrument, instead of
	// re-filtering the full list for every category on each render of the panel.
	const groups = useMemo(() => {
		const all = tuningsForInstrument(instrument)
		return TUNING_CATEGORY_ORDER.map((category) => ({
			category,
			items: all.filter((tuning) => tuning.category === category),
		})).filter((group) => group.items.length > 0)
	}, [instrument])

	// Dismiss on outside click or Escape so the panel never traps the view.
	useEffect(() => {
		if (!open) return
		function onPointerDown(event: MouseEvent) {
			if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') setOpen(false)
		}
		document.addEventListener('mousedown', onPointerDown)
		document.addEventListener('keydown', onKeyDown)
		return () => {
			document.removeEventListener('mousedown', onPointerDown)
			document.removeEventListener('keydown', onKeyDown)
		}
	}, [open])

	return (
		<div className="tuning-selector" ref={ref}>
			<button
				type="button"
				className="tuning-selector__current"
				aria-haspopup="listbox"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
			>
				<span className="tuning-selector__col">
					<span className="tuning-selector__name">{value.name}</span>
					<span className="tuning-selector__sub">
						<NoteLetters tuning={value} />
					</span>
				</span>
				<span className="tuning-selector__caret" aria-hidden="true">
					▾
				</span>
			</button>

			{open && (
				<div className="tuning-selector__panel" role="listbox">
					{groups.map(({ category, items }) => {
						return (
							<div className="tuning-group" key={category}>
								<div className="tuning-group__label">{category}</div>
								{items.map((tuning) => (
									<button
										type="button"
										key={tuning.id}
										role="option"
										aria-selected={tuning.id === value.id}
										className={`tuning-option${tuning.id === value.id ? ' is-selected' : ''}`}
										onClick={() => {
											onChange(tuning)
											setOpen(false)
										}}
									>
										<span className="tuning-option__name">{tuning.name}</span>
										<span className="tuning-option__sub">
											<NoteLetters tuning={tuning} />
										</span>
									</button>
								))}
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
})
