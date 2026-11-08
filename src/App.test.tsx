import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { SETTINGS_STORAGE_KEY } from './settings'

vi.mock('@react-three/fiber', () => ({
	Canvas: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="tuner-canvas">{children}</div>
	),
}))

vi.mock('./components/TunerSceneThree', () => ({
	TunerSceneThree: () => <div data-testid="tuner-scene">TunerScene</div>,
}))

const MIC_CONSTRAINTS = {
	audio: {
		echoCancellation: false,
		noiseSuppression: false,
		autoGainControl: false,
	},
}

/** A MediaStream stand-in whose single audio track can be ended on demand. */
function createMockStream() {
	const listeners = new Set<() => void>()
	const track = {
		kind: 'audio',
		stop: vi.fn(),
		addEventListener: vi.fn((type: string, listener: () => void) => {
			if (type === 'ended') listeners.add(listener)
		}),
		removeEventListener: vi.fn((type: string, listener: () => void) => {
			if (type === 'ended') listeners.delete(listener)
		}),
		end: () => listeners.forEach((listener) => listener()),
	}
	const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
	return { stream, track }
}

const audioNode = () => ({ connect: vi.fn(), disconnect: vi.fn() })

/** Enough of the Web Audio graph for usePitchDetection to run silently. */
function stubAudio() {
	const node = audioNode
	const mockCtx = {
		sampleRate: 44100,
		state: 'running',
		currentTime: 0,
		createBiquadFilter: vi.fn(() => ({ ...node(), type: 'lowpass', frequency: { value: 0 } })),
		createAnalyser: vi.fn(() => ({ ...node(), fftSize: 4096, getFloatTimeDomainData: vi.fn() })),
		createMediaStreamSource: vi.fn(() => node()),
		resume: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockResolvedValue(undefined),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	}
	vi.stubGlobal('AudioContext', function MockAudioContext(this: unknown) {
		return mockCtx
	})
	vi.stubGlobal(
		'requestAnimationFrame',
		vi.fn(() => 1),
	)
	vi.stubGlobal('cancelAnimationFrame', vi.fn())
	return mockCtx
}

type PermissionStub = PermissionState | 'unsupported' | 'pending'

function stubNavigator({
	getUserMedia = vi.fn(),
	permission = 'unsupported',
}: {
	getUserMedia?: ReturnType<typeof vi.fn>
	permission?: PermissionStub
} = {}) {
	const permissions =
		permission === 'unsupported'
			? undefined
			: {
					query: vi.fn(() =>
						permission === 'pending'
							? new Promise<never>(() => {})
							: Promise.resolve({ state: permission }),
					),
				}
	vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia }, permissions })
	return { getUserMedia, permissions }
}

const allowButton = () => screen.queryByRole('button', { name: /allow microphone/i })

describe('App', () => {
	beforeEach(() => {
		window.localStorage.clear()
		stubNavigator()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('shows Allow microphone button when no stream', () => {
		render(<App />)
		expect(allowButton()).toBeInTheDocument()
		expect(screen.queryByTestId('tuner-canvas')).not.toBeInTheDocument()
	})

	it('calls getUserMedia with audio when Allow microphone is clicked', async () => {
		const user = userEvent.setup()
		const { getUserMedia } = stubNavigator({
			getUserMedia: vi.fn().mockResolvedValue(createMockStream().stream),
		})
		stubAudio()

		render(<App />)
		await user.click(allowButton()!)

		await waitFor(() => {
			expect(getUserMedia).toHaveBeenCalledWith(MIC_CONSTRAINTS)
		})
	})

	it('shows tuner canvas after getUserMedia resolves', async () => {
		const user = userEvent.setup()
		stubNavigator({ getUserMedia: vi.fn().mockResolvedValue(createMockStream().stream) })
		stubAudio()

		render(<App />)
		await user.click(allowButton()!)

		await waitFor(
			() => {
				expect(screen.getByTestId('tuner-canvas')).toBeInTheDocument()
				expect(screen.getByTestId('tuner-scene')).toBeInTheDocument()
			},
			{ timeout: 2000 },
		)

		expect(allowButton()).not.toBeInTheDocument()
	})

	it('shows error message when getUserMedia rejects', async () => {
		const user = userEvent.setup()
		stubNavigator({ getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')) })

		render(<App />)
		await user.click(allowButton()!)

		await waitFor(() => {
			expect(screen.getByText('Permission denied')).toBeInTheDocument()
		})

		expect(allowButton()).toBeInTheDocument()
	})

	it('restores the persisted instrument and tuning', async () => {
		window.localStorage.setItem(
			SETTINGS_STORAGE_KEY,
			JSON.stringify({ v: 1, instrument: 'bass', tuningId: 'bass-drop-d' }),
		)
		const user = userEvent.setup()
		stubNavigator({ getUserMedia: vi.fn().mockResolvedValue(createMockStream().stream) })
		stubAudio()

		render(<App />)
		await user.click(allowButton()!)

		expect(await screen.findByRole('button', { name: /drop d/i })).toBeInTheDocument()
		expect(screen.getByRole('radio', { name: 'Bass' })).toHaveAttribute('aria-checked', 'true')
	})

	it('persists a tuning change', async () => {
		const user = userEvent.setup()
		stubNavigator({ getUserMedia: vi.fn().mockResolvedValue(createMockStream().stream) })
		stubAudio()

		render(<App />)
		await user.click(allowButton()!)
		await user.click(await screen.findByRole('button', { name: /e standard/i }))
		await user.click(screen.getByRole('option', { name: /open g/i }))

		const stored = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY)!)
		expect(stored).toMatchObject({ v: 1, instrument: 'guitar', tuningId: 'open-g' })
	})

	it('starts automatically when the mic permission is already granted', async () => {
		const { getUserMedia } = stubNavigator({
			getUserMedia: vi.fn().mockResolvedValue(createMockStream().stream),
			permission: 'granted',
		})
		stubAudio()

		render(<App />)
		// No button flash while the permission check runs.
		expect(allowButton()).not.toBeInTheDocument()

		await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith(MIC_CONSTRAINTS))
		expect(await screen.findByTestId('tuner-canvas')).toBeInTheDocument()
		expect(allowButton()).not.toBeInTheDocument()
	})

	it('waits for a click when the mic permission is still a prompt', async () => {
		const { getUserMedia, permissions } = stubNavigator({ permission: 'prompt' })

		render(<App />)

		expect(await screen.findByRole('button', { name: /allow microphone/i })).toBeInTheDocument()
		expect(permissions!.query).toHaveBeenCalledWith({ name: 'microphone' })
		expect(getUserMedia).not.toHaveBeenCalled()
	})

	it('falls back to the button if the permission check hangs', async () => {
		const { getUserMedia } = stubNavigator({ permission: 'pending' })

		render(<App />)
		expect(allowButton()).not.toBeInTheDocument()

		expect(await screen.findByRole('button', { name: /allow microphone/i })).toBeInTheDocument()
		expect(getUserMedia).not.toHaveBeenCalled()
	})

	it('returns to the start screen with an error when the mic track ends', async () => {
		const user = userEvent.setup()
		const { stream, track } = createMockStream()
		stubNavigator({ getUserMedia: vi.fn().mockResolvedValue(stream) })
		stubAudio()

		render(<App />)
		await user.click(allowButton()!)
		expect(await screen.findByTestId('tuner-canvas')).toBeInTheDocument()

		act(() => track.end())

		expect(screen.getByRole('alert')).toHaveTextContent(/microphone was disconnected/i)
		expect(allowButton()).toBeInTheDocument()
		expect(screen.queryByTestId('tuner-canvas')).not.toBeInTheDocument()
		expect(track.stop).toHaveBeenCalled()
		expect(track.removeEventListener).toHaveBeenCalledWith('ended', expect.any(Function))
	})
})
