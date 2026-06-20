import { Canvas } from '@react-three/fiber'
import { TunerSceneThree } from './components/TunerSceneThree'
import { TuningSelector } from './components/TuningSelector'
import { InstrumentToggle } from './components/InstrumentToggle'
import { StringStrip } from './components/StringStrip'
import { nearestString, stringNumber, type Instrument, type Tuning } from './audio/tunings'
import type { PitchState } from './audio/usePitchDetection'

/**
 * The live tuner: the 3D scene plus the floating controls. Split into its own
 * lazy-loaded module so the heavy three / @react-three-fiber / drei dependencies
 * stay out of the initial bundle — they only download once the user enters here.
 */
export default function TunerView({
	pitchState,
	instrument,
	tuning,
	hasDetected,
	onChangeInstrument,
	onChangeTuning,
}: {
	pitchState: PitchState
	instrument: Instrument
	tuning: Tuning
	hasDetected: boolean
	onChangeInstrument: (instrument: Instrument) => void
	onChangeTuning: (tuning: Tuning) => void
}) {
	// Which open string of the selected tuning the current pitch is closest to.
	const active = pitchState.frequency === null ? null : nearestString(pitchState.frequency, tuning)
	let stringInfo: { number: number | null; target: string } | null = null
	if (active) {
		const number = stringNumber(tuning, active.index)
		stringInfo = { number: number > 0 ? number : null, target: active.note }
	}

	return (
		<div className={`tuner-canvas-wrapper${pitchState.inTune ? ' in-tune' : ''}`}>
			{/* Cap the pixel ratio (Retina default 2–3× shades 4–9× the pixels for no
			    visible gain) and render on demand — a FrameLimiter in the scene drives
			    a steady ~30 fps instead of pinning the GPU at the display's full
			    refresh (120 Hz on ProMotion). */}
			<Canvas
				dpr={[1, 1.5]}
				flat
				orthographic
				frameloop="demand"
				camera={{ position: [0, 0, 5], zoom: 120 }}
			>
				<TunerSceneThree pitchState={pitchState} stringInfo={stringInfo} />
			</Canvas>
			<div className="electric-overlay" aria-hidden="true" />
			<InstrumentToggle value={instrument} onChange={onChangeInstrument} />
			<TuningSelector instrument={instrument} value={tuning} onChange={onChangeTuning} />
			<StringStrip
				tuning={tuning}
				activeIndex={active ? active.index : null}
				inTune={pitchState.inTune}
			/>
			{!hasDetected && (
				<div className="tuner-overlay" role="status" aria-live="polite">
					<p>Listening… play a single note to start tuning.</p>
				</div>
			)}
		</div>
	)
}
