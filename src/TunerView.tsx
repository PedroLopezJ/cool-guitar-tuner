import { useCallback, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { TunerSceneThree, type SceneReading } from './components/TunerSceneThree'
import { TuningSelector } from './components/TuningSelector'
import { InstrumentToggle } from './components/InstrumentToggle'
import { StringStrip } from './components/StringStrip'
import { CentsReadout } from './components/CentsReadout'
import { TunerSettings } from './components/TunerSettings'
import { spellNoteName, usesFlats, type Instrument, type Tuning } from './audio/tunings'
import { useTargetString, type TargetString } from './audio/useTargetString'
import type { PitchState } from './audio/usePitchDetection'
import { useTunerAnnouncer } from './hooks/useTunerAnnouncer'
import { describeString, speakNote } from './speech'
import type { TunerMode } from './settings'

function stringLabel(target: TargetString): string {
	const which = target.number === null ? 'STRING' : `STRING ${target.number}`
	return `${which} · ${target.note}${target.locked ? ' · LOCKED' : ''}`
}

/**
 * The live tuner: the 3D scene plus the floating controls. Split into its own
 * lazy-loaded module so the heavy three / @react-three-fiber / drei dependencies
 * stay out of the initial bundle — they only download once the user enters here.
 */
export default function TunerView({
	pitchState,
	instrument,
	tuning,
	mode,
	a4Hz,
	hasDetected,
	onChangeInstrument,
	onChangeTuning,
	onChangeMode,
	onChangeA4,
}: {
	pitchState: PitchState
	instrument: Instrument
	tuning: Tuning
	mode: TunerMode
	a4Hz: number
	hasDetected: boolean
	onChangeInstrument: (instrument: Instrument) => void
	onChangeTuning: (tuning: Tuning) => void
	onChangeMode: (mode: TunerMode) => void
	onChangeA4: (a4Hz: number) => void
}) {
	const stringMode = mode === 'string'

	// A locked string belongs to the tuning (and mode) it was picked in. Dropping
	// it while rendering the change (React's "adjust state on prop change"
	// pattern) means it can't resurface if the player switches back later.
	const [lock, setLock] = useState<{ tuningId: string; index: number } | null>(null)
	if (lock && (lock.tuningId !== tuning.id || !stringMode)) setLock(null)
	const lockedIndex = lock && lock.tuningId === tuning.id && stringMode ? lock.index : null
	const tuningId = tuning.id
	const toggleLock = useCallback(
		(index: number) =>
			setLock((current) =>
				current?.tuningId === tuningId && current.index === index ? null : { tuningId, index },
			),
		[tuningId],
	)

	// In string mode the reference is the target string of the tuning, never the
	// nearest chromatic note: an untouched E2 in Eb Standard is a perfect E but a
	// semitone sharp of the Eb it should be, and must not light up green.
	const target = useTargetString(stringMode ? pitchState.frequency : null, tuning, {
		lockedIndex,
		a4Hz,
	})
	const hasSignal = pitchState.frequency !== null
	const cents = stringMode ? (target?.cents ?? 0) : pitchState.cents
	const inTune = hasSignal && (stringMode ? (target?.inTune ?? false) : pitchState.inTune)

	// Follow the tuning's own spelling, so Eb Standard reads "Eb", not "D#".
	const flats = usesFlats(tuning)
	const noteName = spellNoteName(pitchState.noteName, flats)
	const octave = hasSignal ? pitchState.noteWithOctave.slice(pitchState.noteName.length) : ''
	const reading = useMemo<SceneReading>(
		() => ({ noteName, octave, cents, inTune, active: hasSignal }),
		[noteName, octave, cents, inTune, hasSignal],
	)
	const label = target ? stringLabel(target) : null

	const announcerRef = useTunerAnnouncer({
		subjectKey: !hasSignal
			? null
			: stringMode
				? target && `${tuning.id}:${target.index}`
				: pitchState.noteWithOctave,
		subject:
			stringMode && target
				? describeString(target.number, target.note)
				: `${speakNote(`${noteName}${octave}`)}.`,
		cents,
		inTune,
	})

	// The autoplay policy can leave audio suspended after an automatic start;
	// nothing is heard until the first tap, so say so instead of "Listening…".
	const overlay = pitchState.suspended
		? 'Tap anywhere to start listening'
		: hasDetected
			? null
			: 'Listening… play a single note to start tuning.'

	return (
		<div className={`tuner-canvas-wrapper${inTune ? ' in-tune' : ''}`}>
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
				<TunerSceneThree reading={reading} label={label} />
			</Canvas>
			<div className="electric-overlay" aria-hidden="true" />
			{hasSignal && <CentsReadout cents={cents} inTune={inTune} />}
			<InstrumentToggle value={instrument} onChange={onChangeInstrument} />
			<TuningSelector instrument={instrument} value={tuning} onChange={onChangeTuning} />
			<TunerSettings mode={mode} a4Hz={a4Hz} onChangeMode={onChangeMode} onChangeA4={onChangeA4} />
			<StringStrip
				tuning={tuning}
				activeIndex={target ? target.index : null}
				inTune={inTune}
				lockedIndex={lockedIndex}
				onToggleLock={stringMode ? toggleLock : undefined}
			/>
			<div ref={announcerRef} className="sr-only" aria-live="polite" aria-atomic="true" />
			{overlay && (
				<div className="tuner-overlay" role="status" aria-live="polite">
					<p>{overlay}</p>
				</div>
			)}
		</div>
	)
}
