import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import TunerView from './TunerView'
import type { SceneReading } from './components/TunerSceneThree'
import { TUNINGS, type Tuning } from './audio/tunings'
import { frequencyToSemitone, getCents, noteFromSemitone } from './audio/noteUtils'
import type { PitchState } from './audio/usePitchDetection'

vi.mock('@react-three/fiber', () => ({
	Canvas: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="tuner-canvas">{children}</div>
	),
}))

// Expose exactly what the view hands the 3D scene, so the tests can check what
// would be drawn without WebGL.
vi.mock('./components/TunerSceneThree', () => ({
	TunerSceneThree: ({ reading, label }: { reading: SceneReading; label: string | null }) => (
		<div
			data-testid="tuner-scene"
			data-note={reading.noteName}
			data-octave={reading.octave}
			data-cents={reading.cents}
			data-in-tune={String(reading.inTune)}
			data-label={label ?? ''}
		/>
	),
}))

const tuningById = (id: string): Tuning => TUNINGS.find((t) => t.id === id)!

/** A PitchState as usePitchDetection would report it for a steady `frequency`. */
function pitchAt(frequency: number | null, overrides: Partial<PitchState> = {}): PitchState {
	if (frequency === null) {
		return {
			frequency: null,
			noteName: '—',
			noteWithOctave: '—',
			cents: 0,
			inTune: false,
			suspended: false,
			...overrides,
		}
	}
	const { name, octave, referenceHz } = noteFromSemitone(frequencyToSemitone(frequency)!)
	const cents = getCents(frequency, referenceHz)
	return {
		frequency,
		noteName: name,
		noteWithOctave: `${name}${octave}`,
		cents,
		inTune: Math.abs(cents) < 5,
		suspended: false,
		...overrides,
	}
}

/** `cents` away from `hz`. */
const detune = (hz: number, cents: number) => hz * 2 ** (cents / 1200)

const E2 = 82.4069
const A2 = 110
const EB2 = 77.7817
const DS3 = 155.5635

type Props = ComponentProps<typeof TunerView>

function renderView(overrides: Partial<Props> = {}) {
	let props: Props = {
		pitchState: pitchAt(null),
		instrument: 'guitar',
		tuning: tuningById('e-standard'),
		mode: 'string',
		a4Hz: 440,
		hasDetected: true,
		onChangeInstrument: vi.fn(),
		onChangeTuning: vi.fn(),
		onChangeMode: vi.fn(),
		onChangeA4: vi.fn(),
		...overrides,
	}
	const utils = render(<TunerView {...props} />)
	return {
		...utils,
		props,
		update(next: Partial<Props>) {
			props = { ...props, ...next }
			utils.rerender(<TunerView {...props} />)
		},
	}
}

const scene = () => screen.getByTestId('tuner-scene')
const wrapper = (container: HTMLElement) => container.querySelector('.tuner-canvas-wrapper')!
const lockButton = (name: RegExp) => screen.getByRole('button', { name })
const lockButtons = () => screen.queryAllByRole('button', { name: /^lock /i })
const announcement = (container: HTMLElement) =>
	(container.querySelector('.sr-only[aria-live]')!.textContent ?? '').replace(/ $/, '')

afterEach(() => {
	vi.useRealTimers()
})

describe('TunerView — string mode', () => {
	it('does not call an untouched E2 in Eb Standard in tune (regression)', () => {
		const { container } = renderView({ tuning: tuningById('eb-standard'), pitchState: pitchAt(E2) })

		// A perfect chromatic E…
		expect(scene()).toHaveAttribute('data-note', 'E')
		expect(scene()).toHaveAttribute('data-octave', '2')
		// …is a semitone sharp of the Eb2 string it should be.
		expect(scene()).toHaveAttribute('data-in-tune', 'false')
		expect(Number(scene().dataset.cents)).toBeCloseTo(100, 0)
		expect(scene()).toHaveAttribute('data-label', 'STRING 6 · Eb2')
		expect(wrapper(container)).not.toHaveClass('in-tune')

		const pip = lockButton(/string 6 \(E flat 2\)/i)
		expect(pip).toHaveClass('is-active')
		expect(pip).not.toHaveClass('in-tune')

		expect(screen.getByText('+100 ¢')).toBeInTheDocument()
		expect(screen.getByText('Tune down')).toBeInTheDocument()
	})

	it('goes green once the target string itself is in tune', () => {
		const { container } = renderView({ tuning: tuningById('eb-standard'), pitchState: pitchAt(EB2) })

		expect(scene()).toHaveAttribute('data-in-tune', 'true')
		expect(wrapper(container)).toHaveClass('in-tune')
		expect(lockButton(/string 6 \(E flat 2\)/i)).toHaveClass('is-active', 'in-tune')
		expect(screen.getByText('In tune')).toBeInTheDocument()
	})

	it("spells the note with the tuning's accidentals", () => {
		const { update } = renderView({ tuning: tuningById('eb-standard'), pitchState: pitchAt(DS3) })
		expect(scene()).toHaveAttribute('data-note', 'Eb')
		expect(scene()).toHaveAttribute('data-octave', '3')

		update({ tuning: tuningById('e-standard') })
		expect(scene()).toHaveAttribute('data-note', 'D#')
	})

	it('shows a signed cents readout with a direction hint, hidden while silent', () => {
		const { container, update } = renderView({ pitchState: pitchAt(detune(E2, -12)) })
		// True minus sign, not a hyphen.
		expect(screen.getByText('−12 ¢')).toBeInTheDocument()
		expect(screen.getByText('Tune up')).toBeInTheDocument()

		update({ pitchState: pitchAt(null) })
		expect(container.querySelector('.cents-readout')).toBeNull()
	})

	it('measures against the calibrated A4', () => {
		const { container } = renderView({ a4Hz: 432, pitchState: pitchAt(E2 * (432 / 440)) })
		expect(wrapper(container)).toHaveClass('in-tune')
		expect(Math.abs(Number(scene().dataset.cents))).toBeLessThan(1)
	})
})

describe('TunerView — string lock', () => {
	it('locks the target to a tapped string and unlocks on a second tap', async () => {
		const user = userEvent.setup()
		renderView({ pitchState: pitchAt(E2) })
		expect(scene()).toHaveAttribute('data-label', 'STRING 6 · E2')

		const a = lockButton(/lock string 5 \(A 2\)/i)
		expect(a).toHaveAttribute('aria-pressed', 'false')
		await user.click(a)

		expect(a).toHaveAttribute('aria-pressed', 'true')
		expect(a).toHaveClass('is-locked', 'is-active')
		expect(scene()).toHaveAttribute('data-label', 'STRING 5 · A2 · LOCKED')
		// E2 measured against the locked A2: five semitones flat.
		expect(screen.getByText('−500 ¢')).toBeInTheDocument()

		await user.click(a)
		expect(a).toHaveAttribute('aria-pressed', 'false')
		expect(scene()).toHaveAttribute('data-label', 'STRING 6 · E2')
	})

	it('drops the lock when the tuning changes, and does not bring it back', async () => {
		const user = userEvent.setup()
		const { update } = renderView({ pitchState: pitchAt(E2) })
		await user.click(lockButton(/lock string 5 \(A 2\)/i))

		update({ tuning: tuningById('drop-d') })
		expect(lockButtons().some((b) => b.getAttribute('aria-pressed') === 'true')).toBe(false)

		update({ tuning: tuningById('e-standard') })
		expect(lockButtons().some((b) => b.getAttribute('aria-pressed') === 'true')).toBe(false)
		expect(scene()).toHaveAttribute('data-label', 'STRING 6 · E2')
	})

	it('labels a string above the standard set without a number', () => {
		renderView({ instrument: 'bass', tuning: tuningById('bass-e-standard') })
		expect(lockButton(/lock the extra high string \(C 3\)/i)).toBeInTheDocument()
	})
})

describe('TunerView — chromatic mode', () => {
	it('uses the nearest chromatic note, with no target string or lock', () => {
		const { container } = renderView({
			mode: 'chromatic',
			tuning: tuningById('eb-standard'),
			pitchState: pitchAt(E2),
		})

		expect(scene()).toHaveAttribute('data-in-tune', 'true')
		expect(scene()).toHaveAttribute('data-label', '')
		expect(wrapper(container)).toHaveClass('in-tune')
		expect(container.querySelector('.string-pip.is-active')).toBeNull()
		expect(lockButtons()).toHaveLength(0)
		expect(screen.getByText('0 ¢')).toBeInTheDocument()
	})

	it('switches mode from the toggle', async () => {
		const user = userEvent.setup()
		const { props } = renderView()
		const group = screen.getByRole('radiogroup', { name: 'Tuning mode' })
		expect(within(group).getByRole('radio', { name: 'String' })).toHaveAttribute(
			'aria-checked',
			'true',
		)
		await user.click(within(group).getByRole('radio', { name: 'Chromatic' }))
		expect(props.onChangeMode).toHaveBeenCalledWith('chromatic')
	})

	it('drops a string lock when switching to chromatic', async () => {
		const user = userEvent.setup()
		const { update } = renderView({ pitchState: pitchAt(E2) })
		await user.click(lockButton(/lock string 5 \(A 2\)/i))

		update({ mode: 'chromatic' })
		update({ mode: 'string' })
		expect(lockButton(/lock string 5 \(A 2\)/i)).toHaveAttribute('aria-pressed', 'false')
	})
})

describe('TunerView — A4 control', () => {
	it('steps A4 by 1 Hz and offers a reset away from 440', async () => {
		const user = userEvent.setup()
		const { props, update } = renderView()
		expect(screen.queryByRole('button', { name: /reset a4/i })).toBeNull()

		await user.click(screen.getByRole('button', { name: 'Raise A4 by 1 hertz' }))
		expect(props.onChangeA4).toHaveBeenLastCalledWith(441)
		await user.click(screen.getByRole('button', { name: 'Lower A4 by 1 hertz' }))
		expect(props.onChangeA4).toHaveBeenLastCalledWith(439)

		update({ a4Hz: 442 })
		expect(screen.getByText('442')).toBeInTheDocument()
		await user.click(screen.getByRole('button', { name: 'Reset A4 to 440 hertz' }))
		expect(props.onChangeA4).toHaveBeenLastCalledWith(440)
	})

	it('stops at the ends of the range', async () => {
		const user = userEvent.setup()
		const { props, update } = renderView({ a4Hz: 450 })
		const raise = screen.getByRole('button', { name: 'Raise A4 by 1 hertz' })
		expect(raise).toHaveAttribute('aria-disabled', 'true')
		await user.click(raise)
		expect(props.onChangeA4).not.toHaveBeenCalled()

		update({ a4Hz: 430 })
		const lower = screen.getByRole('button', { name: 'Lower A4 by 1 hertz' })
		expect(lower).toHaveAttribute('aria-disabled', 'true')
		await user.click(lower)
		expect(props.onChangeA4).not.toHaveBeenCalled()
	})
})

describe('TunerView — screen-reader announcements', () => {
	it('announces the target string with the offset, spelled out', () => {
		const { container } = renderView({ tuning: tuningById('eb-standard'), pitchState: pitchAt(E2) })
		expect(announcement(container)).toBe('String 6, E flat 2. 100 cents sharp, tune down.')
	})

	it('announces in-tune flips at once but throttles string changes and ignores drift', () => {
		vi.useFakeTimers()
		const { container, update } = renderView({ pitchState: pitchAt(detune(E2, -12)) })
		expect(announcement(container)).toBe('String 6, E 2. 12 cents flat, tune up.')

		// Cents drift on the same string is never announced.
		update({ pitchState: pitchAt(detune(E2, -9)) })
		expect(announcement(container)).toBe('String 6, E 2. 12 cents flat, tune up.')

		// Landing in tune is announced immediately, throttle or not.
		update({ pitchState: pitchAt(E2) })
		expect(announcement(container)).toBe('In tune.')

		// A new string inside the throttle window waits for it…
		update({ pitchState: pitchAt(A2) })
		expect(announcement(container)).toBe('In tune.')
		act(() => {
			vi.advanceTimersByTime(1500)
		})
		// …and then reports the latest reading.
		expect(announcement(container)).toBe('String 5, A 2. In tune.')
	})

	it('announces the note itself in chromatic mode', () => {
		const { container } = renderView({
			mode: 'chromatic',
			tuning: tuningById('eb-standard'),
			pitchState: pitchAt(DS3),
		})
		expect(announcement(container)).toBe('E flat 3. In tune.')
	})
})

describe('TunerView — overlays', () => {
	it('asks for a tap while the browser keeps audio suspended', () => {
		renderView({ hasDetected: true, pitchState: pitchAt(null, { suspended: true }) })
		expect(screen.getByRole('status')).toHaveTextContent('Tap anywhere to start listening')
		expect(screen.queryByText(/listening…/i)).toBeNull()
	})

	it('shows the listening prompt until the first note', () => {
		const { update } = renderView({ hasDetected: false })
		expect(screen.getByRole('status')).toHaveTextContent(/listening…/i)
		update({ hasDetected: true })
		expect(screen.queryByRole('status')).toBeNull()
	})
})
