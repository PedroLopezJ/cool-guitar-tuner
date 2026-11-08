import {
	DEFAULT_TUNING_BY_INSTRUMENT,
	INSTRUMENTS,
	TUNINGS,
	type Instrument,
	type Tuning,
} from './audio/tunings'

// What the app remembers between visits, kept in localStorage. Storage can be
// missing, full or blocked (private mode, disabled cookies), and the stored JSON
// may come from an older build or be hand-edited, so every read is validated and
// every access is wrapped: the worst case is simply starting from the defaults.

export const SETTINGS_STORAGE_KEY = 'coolest-tuner:settings'
const SETTINGS_VERSION = 1

interface Field<T> {
	fallback: T
	isValid: (value: unknown) => value is T
}

const field = <T>(fallback: T, isValid: (value: unknown) => value is T): Field<T> => ({
	fallback,
	isValid,
})

const isInstrument = (value: unknown): value is Instrument =>
	INSTRUMENTS.some((instrument) => instrument.id === value)

const isTuningId = (value: unknown): value is string =>
	typeof value === 'string' && TUNINGS.some((tuning) => tuning.id === value)

/**
 * One entry per persisted setting: its default and a validator for what comes
 * back out of storage. Adding a setting is a single line here — the Settings
 * type, the defaults and the validation all derive from this table.
 */
const FIELDS = {
	instrument: field<Instrument>('guitar', isInstrument),
	tuningId: field<string>(DEFAULT_TUNING_BY_INSTRUMENT.guitar.id, isTuningId),
}

type FieldValue<F> = F extends Field<infer T> ? T : never

export type Settings = { [K in keyof typeof FIELDS]: FieldValue<(typeof FIELDS)[K]> }

const FIELD_KEYS = Object.keys(FIELDS) as Array<keyof Settings>

export const DEFAULT_SETTINGS: Settings = Object.fromEntries(
	FIELD_KEYS.map((key) => [key, FIELDS[key].fallback]),
) as Settings

/** The stored object as-is (only when it's a v1 object), including unknown keys. */
function readRaw(): Record<string, unknown> | null {
	try {
		const json = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
		if (!json) return null
		const parsed: unknown = JSON.parse(json)
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
		const raw = parsed as Record<string, unknown>
		return raw.v === SETTINGS_VERSION ? raw : null
	} catch {
		return null
	}
}

/** Cross-field rules a per-field validator can't express. */
function normalize(settings: Settings): Settings {
	const tuning = TUNINGS.find((t) => t.id === settings.tuningId)
	if (!tuning || tuning.instrument !== settings.instrument) {
		return { ...settings, tuningId: DEFAULT_TUNING_BY_INSTRUMENT[settings.instrument].id }
	}
	return settings
}

export function loadSettings(): Settings {
	const raw = readRaw()
	if (!raw) return DEFAULT_SETTINGS
	const settings = Object.fromEntries(
		FIELD_KEYS.map((key) => {
			const { fallback, isValid } = FIELDS[key] as Field<unknown>
			return [key, isValid(raw[key]) ? raw[key] : fallback]
		}),
	) as Settings
	return normalize(settings)
}

/**
 * Merge `partial` into what's stored. Keys this build doesn't know about are
 * kept, so a newer build's settings survive a visit from an older cached one.
 */
export function saveSettings(partial: Partial<Settings>): void {
	try {
		const next = { ...readRaw(), ...partial, v: SETTINGS_VERSION }
		window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next))
	} catch {
		// Storage full or blocked — settings just won't persist this session.
	}
}

/** The Tuning object a (validated) settings snapshot points at. */
export function settingsTuning(settings: Settings): Tuning {
	return (
		TUNINGS.find((t) => t.id === settings.tuningId) ??
		DEFAULT_TUNING_BY_INSTRUMENT[settings.instrument]
	)
}
