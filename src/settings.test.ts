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

describe('settings', () => {
	beforeEach(() => window.localStorage.clear())
	afterEach(() => vi.restoreAllMocks())

	it('falls back to guitar E Standard when nothing is stored', () => {
		expect(loadSettings()).toEqual({ instrument: 'guitar', tuningId: 'e-standard' })
		expect(DEFAULT_SETTINGS).toEqual({ instrument: 'guitar', tuningId: 'e-standard' })
	})

	it('round-trips a saved instrument and tuning', () => {
		saveSettings({ instrument: 'bass', tuningId: 'bass-drop-d' })
		expect(loadSettings()).toEqual({ instrument: 'bass', tuningId: 'bass-drop-d' })
		expect(stored()).toMatchObject({ v: 1, instrument: 'bass', tuningId: 'bass-drop-d' })
	})

	it('resolves the stored tuning id to its Tuning object', () => {
		saveSettings({ instrument: 'guitar', tuningId: 'drop-d' })
		expect(settingsTuning(loadSettings()).name).toBe('Drop D')
	})

	it('falls back per field when a stored value is invalid', () => {
		store({ v: 1, instrument: 'ukulele', tuningId: 'drop-c' })
		expect(loadSettings()).toEqual({ instrument: 'guitar', tuningId: 'drop-c' })
	})

	it("drops an unknown tuning id to the instrument's default", () => {
		store({ v: 1, instrument: 'bass', tuningId: 'nope' })
		expect(loadSettings()).toEqual({ instrument: 'bass', tuningId: 'bass-e-standard' })
	})

	it("drops a tuning that belongs to another instrument to the instrument's default", () => {
		store({ v: 1, instrument: 'bass', tuningId: 'drop-d' })
		expect(loadSettings()).toEqual({ instrument: 'bass', tuningId: 'bass-e-standard' })
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
		store({ v: 1, instrument: 'guitar', tuningId: 'e-standard', a4Hz: 442 })
		saveSettings({ tuningId: 'open-g' })
		expect(stored()).toEqual({ v: 1, instrument: 'guitar', tuningId: 'open-g', a4Hz: 442 })
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
