import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	DEFAULT_SETTINGS,
	SETTINGS_STORAGE_KEY,
	loadSettings,
	saveSettings,
	settingsTuning,
} from './settings'

const store = (value: unknown) =>
	window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(value))
const stored = () => JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null')
// The defaults of every field the instrument/tuning tests don't care about.
const DEFAULTS_REST = { mode: 'string', a4Hz: 440 } as const

describe('settings', () => {
	beforeEach(() => window.localStorage.clear())
	afterEach(() => vi.restoreAllMocks())

	it('falls back to guitar E Standard when nothing is stored', () => {
		expect(loadSettings()).toEqual({ ...DEFAULTS_REST, instrument: 'guitar', tuningId: 'e-standard' })
		expect(DEFAULT_SETTINGS).toEqual({
			...DEFAULTS_REST,
			instrument: 'guitar',
			tuningId: 'e-standard',
		})
	})

	it('round-trips a saved instrument and tuning', () => {
		saveSettings({ instrument: 'bass', tuningId: 'bass-drop-d' })
		expect(loadSettings()).toEqual({ ...DEFAULTS_REST, instrument: 'bass', tuningId: 'bass-drop-d' })
		expect(stored()).toMatchObject({ v: 1, instrument: 'bass', tuningId: 'bass-drop-d' })
	})

	it('resolves the stored tuning id to its Tuning object', () => {
		saveSettings({ instrument: 'guitar', tuningId: 'drop-d' })
		expect(settingsTuning(loadSettings()).name).toBe('Drop D')
	})

	it('falls back per field when a stored value is invalid', () => {
		store({ v: 1, instrument: 'ukulele', tuningId: 'drop-c' })
		expect(loadSettings()).toEqual({ ...DEFAULTS_REST, instrument: 'guitar', tuningId: 'drop-c' })
	})

	it("drops an unknown tuning id to the instrument's default", () => {
		store({ v: 1, instrument: 'bass', tuningId: 'nope' })
		expect(loadSettings()).toEqual({
			...DEFAULTS_REST,
			instrument: 'bass',
			tuningId: 'bass-e-standard',
		})
	})

	it("drops a tuning that belongs to another instrument to the instrument's default", () => {
		store({ v: 1, instrument: 'bass', tuningId: 'drop-d' })
		expect(loadSettings()).toEqual({
			...DEFAULTS_REST,
			instrument: 'bass',
			tuningId: 'bass-e-standard',
		})
	})

	it('ignores corrupt JSON, non-objects and other versions', () => {
		window.localStorage.setItem(SETTINGS_STORAGE_KEY, '{not json')
		expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
		store(['bass'])
		expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
		store({ v: 99, instrument: 'bass', tuningId: 'bass-drop-d' })
		expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
	})

	it('keeps unknown fields when saving', () => {
		store({ v: 1, instrument: 'guitar', tuningId: 'e-standard', fromNewerBuild: 'keep me' })
		saveSettings({ tuningId: 'open-g' })
		expect(stored()).toEqual({
			v: 1,
			instrument: 'guitar',
			tuningId: 'open-g',
			fromNewerBuild: 'keep me',
		})
	})

	it('round-trips the tuner mode and A4 calibration', () => {
		saveSettings({ mode: 'chromatic', a4Hz: 432 })
		expect(loadSettings()).toMatchObject({ mode: 'chromatic', a4Hz: 432 })
	})

	it('rejects an unknown mode and an out-of-range or fractional A4', () => {
		store({ v: 1, mode: 'needle', a4Hz: 500 })
		expect(loadSettings()).toMatchObject({ mode: 'string', a4Hz: 440 })
		store({ v: 1, a4Hz: 441.5 })
		expect(loadSettings().a4Hz).toBe(440)
		store({ v: 1, a4Hz: 430 })
		expect(loadSettings().a4Hz).toBe(430)
	})

	it('survives storage that throws', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('SecurityError')
		})
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('QuotaExceededError')
		})
		expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
		expect(() => saveSettings({ instrument: 'bass' })).not.toThrow()
	})
})
