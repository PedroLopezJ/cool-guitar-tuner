import {
	memo,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { flushSync } from 'react-dom'
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

/**
 * Tuning picker: a trigger button plus a popup listbox grouped by category.
 * Keyboard follows the WAI-ARIA listbox pattern — focus moves onto the options
 * (roving tabIndex), arrows/Home/End move, Enter/Space pick, Escape closes and
 * hands focus back to the trigger.
 */
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
	// The option holding the roving tabIndex (and focus) while the list is open.
	const [activeId, setActiveId] = useState(value.id)
	const ref = useRef<HTMLDivElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const optionRefs = useRef(new Map<string, HTMLButtonElement>())
	const baseId = useId()
	const listboxId = `${baseId}-listbox`

	// Group the instrument's tunings by category once per instrument, instead of
	// re-filtering the full list for every category on each render of the panel.
	const groups = useMemo(() => {
		const all = tuningsForInstrument(instrument)
		return TUNING_CATEGORY_ORDER.map((category) => ({
			category,
			items: all.filter((tuning) => tuning.category === category),
		})).filter((group) => group.items.length > 0)
	}, [instrument])
	// Keyboard order: categories top to bottom, exactly as rendered.
	const ordered = useMemo(() => groups.flatMap((group) => group.items), [groups])

	const openList = useCallback(() => {
		if (ordered.length === 0) return
		const selected = ordered.find((tuning) => tuning.id === value.id) ?? ordered[0]
		setActiveId(selected.id)
		setOpen(true)
	}, [ordered, value.id])

	const closeList = useCallback((restoreFocus: boolean) => {
		setOpen(false)
		if (restoreFocus) triggerRef.current?.focus()
	}, [])

	const select = useCallback(
		(tuning: Tuning) => {
			onChange(tuning)
			closeList(true)
		},
		[onChange, closeList],
	)

	// Opening (or arrowing) moves real focus onto the active option, so screen
	// readers announce it and Enter/Space act on it.
	useEffect(() => {
		if (open) optionRefs.current.get(activeId)?.focus()
	}, [open, activeId])

	// Dismiss on an outside press or Escape so the panel never traps the view.
	// pointerdown covers mouse, touch and pen alike.
	useEffect(() => {
		if (!open) return
		function onPointerDown(event: PointerEvent) {
			if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== 'Escape') return
			const focusInside = ref.current?.contains(document.activeElement) ?? false
			closeList(focusInside)
		}
		document.addEventListener('pointerdown', onPointerDown)
		document.addEventListener('keydown', onKeyDown)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown)
			document.removeEventListener('keydown', onKeyDown)
		}
	}, [open, closeList])

	function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault()
			openList()
		}
	}

	function onListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
		const index = ordered.findIndex((tuning) => tuning.id === activeId)
		const moveTo = (next: number) => {
			event.preventDefault()
			const wrapped = (next + ordered.length) % ordered.length
			setActiveId(ordered[wrapped].id)
		}
		switch (event.key) {
			case 'ArrowDown':
				moveTo(index + 1)
				break
			case 'ArrowUp':
				moveTo(index - 1)
				break
			case 'Home':
				moveTo(0)
				break
			case 'End':
				moveTo(ordered.length - 1)
				break
			case 'Enter':
			case ' ': {
				event.preventDefault()
				const tuning = ordered[index]
				if (tuning) select(tuning)
				break
			}
			case 'Tab':
				// Hand focus back to the trigger and unmount the options *before* the
				// browser runs the Tab, so it moves on from the trigger rather than
				// into an option that's about to disappear.
				triggerRef.current?.focus()
				flushSync(() => setOpen(false))
				break
		}
	}

	return (
		<div className="tuning-selector" ref={ref}>
			<button
				type="button"
				ref={triggerRef}
				className="tuning-selector__current"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={open ? listboxId : undefined}
				onClick={() => (open ? closeList(false) : openList())}
				onKeyDown={onTriggerKeyDown}
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
				<div
					className="tuning-selector__panel"
					id={listboxId}
					role="listbox"
					aria-label="Tunings"
					onKeyDown={onListKeyDown}
				>
					{groups.map(({ category, items }) => {
						const labelId = `${baseId}-group-${category}`
						return (
							<div className="tuning-group" key={category} role="group" aria-labelledby={labelId}>
								<div className="tuning-group__label" id={labelId} role="presentation">
									{category}
								</div>
								{items.map((tuning) => (
									<button
										type="button"
										key={tuning.id}
										ref={(node) => {
											if (node) optionRefs.current.set(tuning.id, node)
											else optionRefs.current.delete(tuning.id)
										}}
										id={`${baseId}-option-${tuning.id}`}
										role="option"
										aria-selected={tuning.id === value.id}
										tabIndex={tuning.id === activeId ? 0 : -1}
										className={`tuning-option${tuning.id === value.id ? ' is-selected' : ''}`}
										onClick={() => select(tuning)}
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
