import { memo } from 'react'
import { DEFAULT_A4_HZ, MAX_A4_HZ, MIN_A4_HZ, clampA4Hz } from '../audio/noteUtils'
import { TUNER_MODES, type TunerMode } from '../settings'

/**
 * The tuner's two less-used settings, grouped so they don't compete with the
 * instrument/tuning controls: string vs chromatic mode, and the A4 calibration.
 */
export const TunerSettings = memo(function TunerSettings({
	mode,
	a4Hz,
	onChangeMode,
	onChangeA4,
}: {
	mode: TunerMode
	a4Hz: number
	onChangeMode: (mode: TunerMode) => void
	onChangeA4: (a4Hz: number) => void
}) {
	const atMin = a4Hz <= MIN_A4_HZ
	const atMax = a4Hz >= MAX_A4_HZ
	// At a limit the step button is aria-disabled rather than disabled, so it
	// keeps keyboard focus instead of dumping it on the page.
	const step = (delta: number, blocked: boolean) => () => {
		if (!blocked) onChangeA4(clampA4Hz(a4Hz + delta))
	}

	return (
		<div className="tuner-settings">
			<div className="segmented" role="radiogroup" aria-label="Tuning mode">
				{TUNER_MODES.map((option) => (
					<button
						type="button"
						key={option.id}
						role="radio"
						aria-checked={option.id === mode}
						className={`segmented__option${option.id === mode ? ' is-active' : ''}`}
						onClick={() => onChangeMode(option.id)}
					>
						{option.label}
					</button>
				))}
			</div>

			<div className="a4-control" role="group" aria-label="A4 calibration">
				<button
					type="button"
					className="a4-control__step"
					aria-label="Lower A4 by 1 hertz"
					aria-disabled={atMin}
					onClick={step(-1, atMin)}
				>
					−
				</button>
				{/* Polite live text so a screen reader hears the new value after a step
				    (focus stays on the button, which wouldn't announce it). */}
				<span className="a4-control__value" aria-live="polite">
					<span className="a4-control__note">A4</span> {a4Hz}{' '}
					<span className="a4-control__unit">Hz</span>
				</span>
				<button
					type="button"
					className="a4-control__step"
					aria-label="Raise A4 by 1 hertz"
					aria-disabled={atMax}
					onClick={step(1, atMax)}
				>
					+
				</button>
				{a4Hz !== DEFAULT_A4_HZ && (
					<button
						type="button"
						className="a4-control__reset"
						aria-label={`Reset A4 to ${DEFAULT_A4_HZ} hertz`}
						title={`Reset to ${DEFAULT_A4_HZ} Hz`}
						onClick={() => onChangeA4(DEFAULT_A4_HZ)}
					>
						↺
					</button>
				)}
			</div>
		</div>
	)
})
