import { StrictMode } from 'react'
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { resolveTargetString, useTargetString } from './useTargetString'
import { DEFAULT_TUNING_BY_INSTRUMENT, TUNINGS, noteToFrequency, type Tuning } from './tunings'

const byId = (id: string) => TUNINGS.find((t) => t.id === id)!
const ebStandard = byId('eb-standard')
const dropD = byId('drop-d')
const guitar = DEFAULT_TUNING_BY_INSTRUMENT.guitar // F#1 B1 E2 A2 D3 G3 B3 E4
const bass = DEFAULT_TUNING_BY_INSTRUMENT.bass // B0 E1 A1 D2 G2 C3

/** Frequency `cents` away from a note. */
const at = (note: string, cents = 0, a4Hz?: number) =>
	noteToFrequency(note, a4Hz) * Math.pow(2, cents / 1200)

describe('resolveTargetString', () => {
	it('returns null without a valid pitch', () => {
		expect(resolveTargetString(null, guitar)).toBeNull()
		expect(resolveTargetString(0, guitar)).toBeNull()
		expect(resolveTargetString(Number.NaN, guitar)).toBeNull()
	})

	it('targets the nearest open string with its number and offset', () => {
		const target = resolveTargetString(at('A2', -12), guitar)!
		expect(target).toMatchObject({ index: 3, note: 'A2', number: 5, locked: false })
		expect(target.cents).toBeCloseTo(-12, 6)
	})

	it('has no fixed number for a string above the standard core (6-string bass high C)', () => {
		expect(resolveTargetString(at('C3'), bass)).toMatchObject({ note: 'C3', number: null })
	})

	it('forces a valid locked string, however far the pitch is', () => {
		const target = resolveTargetString(at('A2'), guitar, 2)!
		expect(target).toMatchObject({ index: 2, note: 'E2', number: 6, locked: true })
		expect(target.cents).toBeCloseTo(500, 6)
	})

	it('ignores an out-of-range or non-integer locked index', () => {
		for (const lockedIndex of [-1, guitar.strings.length, 1.5]) {
			expect(resolveTargetString(at('A2'), guitar, lockedIndex)).toMatchObject({
				index: 3,
				locked: false,
			})
		}
	})

	it('measures against the calibrated A4', () => {
		expect(resolveTargetString(at('E2', 0, 432), guitar, null, 432)!.cents).toBeCloseTo(0, 6)
	})
})

describe('useTargetString', () => {
	function renderTarget(
		initial: { frequency: number | null; tuning?: Tuning; lockedIndex?: number | null },
		options: { strict?: boolean } = {},
	) {
		return renderHook(
			({ frequency, tuning = guitar, lockedIndex = null }) =>
				useTargetString(frequency, tuning, { lockedIndex }),
			{ initialProps: initial, wrapper: options.strict ? StrictMode : undefined },
		)
	}

	it('regression: an untouched E2 string is NOT in tune for Eb Standard', () => {
		const { result } = renderTarget({ frequency: at('E2'), tuning: ebStandard })
		const target = result.current!
		expect(target.note).toBe('Eb2')
		expect(target.number).toBe(6)
		expect(target.cents).toBeCloseTo(100, 6)
		expect(target.inTune).toBe(false)
	})

	it('regression: a perfect D#2 is NOT in tune for Drop D', () => {
		const { result } = renderTarget({ frequency: at('D#2'), tuning: dropD })
		expect(result.current!.note).toBe('D2')
		expect(result.current!.cents).toBeCloseTo(100, 6)
		expect(result.current!.inTune).toBe(false)
	})

	it('is in tune on the target string itself', () => {
		const { result } = renderTarget({ frequency: at('Eb2', 2), tuning: ebStandard })
		expect(result.current).toMatchObject({ note: 'Eb2', inTune: true })
	})

	it('applies hysteresis while staying on the same string', () => {
		const { result, rerender } = renderTarget({ frequency: at('A2', 3) })
		expect(result.current!.inTune).toBe(true)
		rerender({ frequency: at('A2', 7) }) // inside the exit band: stays green
		expect(result.current!.inTune).toBe(true)
		rerender({ frequency: at('A2', 9) }) // past it: out
		expect(result.current!.inTune).toBe(false)
		rerender({ frequency: at('A2', 7) }) // must get back under the enter band
		expect(result.current!.inTune).toBe(false)
		rerender({ frequency: at('A2', 4) })
		expect(result.current!.inTune).toBe(true)
	})

	it('behaves the same under StrictMode (double render)', () => {
		const { result, rerender } = renderTarget({ frequency: at('A2', 3) }, { strict: true })
		expect(result.current!.inTune).toBe(true)
		rerender({ frequency: at('A2', 7) })
		expect(result.current!.inTune).toBe(true)
		rerender({ frequency: at('A2', 9) })
		expect(result.current!.inTune).toBe(false)
		rerender({ frequency: at('A2', 7) })
		expect(result.current!.inTune).toBe(false)
	})

	it('resets the hysteresis when the signal drops', () => {
		const { result, rerender } = renderTarget({ frequency: at('A2', 3) })
		expect(result.current!.inTune).toBe(true)
		rerender({ frequency: null })
		expect(result.current).toBeNull()
		rerender({ frequency: at('A2', 7) })
		expect(result.current!.inTune).toBe(false)
	})

	it('resets the hysteresis when the target string changes', () => {
		const { result, rerender } = renderTarget({ frequency: at('A2', 3) })
		expect(result.current!.inTune).toBe(true)
		rerender({ frequency: at('D3', 7) })
		expect(result.current).toMatchObject({ note: 'D3', inTune: false })
	})

	it('resets the hysteresis when the tuning changes', () => {
		const { result, rerender } = renderTarget({ frequency: at('A2', 3), tuning: guitar })
		expect(result.current!.inTune).toBe(true)
		// Drop D also has A2 at index 1 (different id/index): starts fresh.
		rerender({ frequency: at('A2', 7), tuning: dropD })
		expect(result.current).toMatchObject({ note: 'A2', inTune: false })
	})

	it('follows a locked string and reports it as locked', () => {
		const { result, rerender } = renderTarget({ frequency: at('A2'), lockedIndex: 2 })
		expect(result.current).toMatchObject({ note: 'E2', locked: true, inTune: false })
		expect(result.current!.cents).toBeCloseTo(500, 6)
		rerender({ frequency: at('A2'), lockedIndex: null })
		expect(result.current).toMatchObject({ note: 'A2', locked: false, inTune: true })
	})

	it('keeps the same object while nothing changes', () => {
		const frequency = at('A2', 3)
		const { result, rerender } = renderTarget({ frequency })
		const first = result.current
		rerender({ frequency })
		expect(result.current).toBe(first)
	})
})
