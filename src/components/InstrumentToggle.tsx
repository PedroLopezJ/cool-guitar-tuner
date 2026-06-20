import { INSTRUMENTS, type Instrument } from '../audio/tunings'

/** Small segmented control (Guitar / Bass) tucked into a corner. */
export function InstrumentToggle({
	value,
	onChange,
}: {
	value: Instrument
	onChange: (instrument: Instrument) => void
}) {
	return (
		<div className="instrument-toggle" role="radiogroup" aria-label="Instrument">
			{INSTRUMENTS.map((instrument) => (
				<button
					type="button"
					key={instrument.id}
					role="radio"
					aria-checked={instrument.id === value}
					className={`instrument-toggle__option${instrument.id === value ? ' is-active' : ''}`}
					onClick={() => onChange(instrument.id)}
				>
					{instrument.label}
				</button>
			))}
		</div>
	)
}
