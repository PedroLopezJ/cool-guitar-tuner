import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

vi.mock('@react-three/fiber', () => ({
	Canvas: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="tuner-canvas">{children}</div>
	),
}))

vi.mock('./components/TunerSceneThree', () => ({
	TunerSceneThree: () => <div data-testid="tuner-scene">TunerScene</div>,
}))

describe('App', () => {
	beforeEach(() => {
		const mockGetUserMedia = vi.fn()
		vi.stubGlobal('navigator', {
			...navigator,
			mediaDevices: {
				getUserMedia: mockGetUserMedia,
			},
		})
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('shows Allow microphone button when no stream', () => {
		render(<App />)
		expect(screen.getByRole('button', { name: /allow microphone/i })).toBeInTheDocument()
		expect(screen.queryByTestId('tuner-canvas')).not.toBeInTheDocument()
	})

	it('calls getUserMedia with audio when Allow microphone is clicked', async () => {
		const user = userEvent.setup()
		const getUserMedia = vi.fn().mockResolvedValue({
			getTracks: () => [{ stop: vi.fn() }],
		})
		vi.stubGlobal('navigator', {
			...navigator,
			mediaDevices: { getUserMedia },
		})

		const mockCtx = {
			sampleRate: 44100,
			createBiquadFilter: vi.fn(() => ({
				type: 'lowpass',
				frequency: { value: 0 },
				connect: vi.fn(),
			})),
			createAnalyser: vi.fn(() => ({
				fftSize: 4096,
				connect: vi.fn(),
				disconnect: vi.fn(),
				getFloatTimeDomainData: vi.fn(),
			})),
			createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
			close: vi.fn().mockResolvedValue(undefined),
			state: 'running',
		}
		vi.stubGlobal('AudioContext', function MockAudioContext(this: unknown) {
			return mockCtx
		})
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn(() => 1),
		)
		vi.stubGlobal('cancelAnimationFrame', vi.fn())

		render(<App />)
		await user.click(screen.getByRole('button', { name: /allow microphone/i }))

		await waitFor(() => {
			expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
		})
	})

	it('shows tuner canvas after getUserMedia resolves', async () => {
		const user = userEvent.setup()
		const stopTrack = vi.fn()
		const getUserMedia = vi.fn().mockResolvedValue({
			getTracks: () => [{ stop: stopTrack }],
		})
		vi.stubGlobal('navigator', {
			...navigator,
			mediaDevices: { getUserMedia },
		})

		const mockCtx = {
			sampleRate: 44100,
			createBiquadFilter: vi.fn(() => ({
				type: 'lowpass',
				frequency: { value: 0 },
				connect: vi.fn(),
			})),
			createAnalyser: vi.fn(() => ({
				fftSize: 4096,
				connect: vi.fn(),
				disconnect: vi.fn(),
				getFloatTimeDomainData: vi.fn(),
			})),
			createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
			close: vi.fn().mockResolvedValue(undefined),
			state: 'running',
		}
		vi.stubGlobal('AudioContext', function MockAudioContext(this: unknown) {
			return mockCtx
		})
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn(() => 1),
		)
		vi.stubGlobal('cancelAnimationFrame', vi.fn())

		render(<App />)
		await user.click(screen.getByRole('button', { name: /allow microphone/i }))

		await waitFor(
			() => {
				expect(screen.getByTestId('tuner-canvas')).toBeInTheDocument()
				expect(screen.getByTestId('tuner-scene')).toBeInTheDocument()
			},
			{ timeout: 2000 },
		)

		expect(screen.queryByRole('button', { name: /allow microphone/i })).not.toBeInTheDocument()
	})

	it('shows error message when getUserMedia rejects', async () => {
		const user = userEvent.setup()
		const getUserMedia = vi.fn().mockRejectedValue(new Error('Permission denied'))
		vi.stubGlobal('navigator', {
			...navigator,
			mediaDevices: { getUserMedia },
		})

		render(<App />)
		await user.click(screen.getByRole('button', { name: /allow microphone/i }))

		await waitFor(() => {
			expect(screen.getByText('Permission denied')).toBeInTheDocument()
		})

		expect(screen.getByRole('button', { name: /allow microphone/i })).toBeInTheDocument()
	})
})
