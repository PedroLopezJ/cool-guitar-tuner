import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useWakeLock } from './useWakeLock'

type Listener = () => void

function createSentinel() {
	const listeners: Listener[] = []
	const sentinel = {
		released: false,
		release: vi.fn(async () => {
			sentinel.released = true
			listeners.forEach((listener) => listener())
		}),
		addEventListener: vi.fn((_type: string, listener: Listener) => {
			listeners.push(listener)
		}),
	}
	return sentinel
}

let visibility: DocumentVisibilityState = 'visible'

function setVisibility(next: DocumentVisibilityState) {
	visibility = next
	document.dispatchEvent(new Event('visibilitychange'))
}

describe('useWakeLock', () => {
	let sentinels: Array<ReturnType<typeof createSentinel>>
	let request: ReturnType<typeof vi.fn>

	beforeEach(() => {
		visibility = 'visible'
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => visibility,
		})
		sentinels = []
		request = vi.fn(async () => {
			const sentinel = createSentinel()
			sentinels.push(sentinel)
			return sentinel
		})
		vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } })
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		delete (document as unknown as Record<string, unknown>).visibilityState
	})

	it('does nothing while inactive', () => {
		renderHook(() => useWakeLock(false))
		expect(request).not.toHaveBeenCalled()
	})

	it('holds a screen lock while active and releases it when deactivated', async () => {
		const { rerender } = renderHook(({ active }) => useWakeLock(active), {
			initialProps: { active: true },
		})
		await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))
		await waitFor(() => expect(sentinels).toHaveLength(1))

		rerender({ active: false })
		expect(sentinels[0].release).toHaveBeenCalled()
	})

	it('releases the lock on unmount', async () => {
		const { unmount } = renderHook(() => useWakeLock(true))
		await waitFor(() => expect(sentinels).toHaveLength(1))
		// Let the request promise settle so the sentinel is stored.
		await act(async () => {})
		unmount()
		expect(sentinels[0].release).toHaveBeenCalled()
	})

	it('re-acquires the lock when the page becomes visible again', async () => {
		renderHook(() => useWakeLock(true))
		await waitFor(() => expect(sentinels).toHaveLength(1))
		await act(async () => {})

		// The browser releases the lock itself when the page is hidden.
		await act(async () => {
			setVisibility('hidden')
			await sentinels[0].release()
		})
		expect(request).toHaveBeenCalledTimes(1)

		await act(async () => setVisibility('visible'))
		await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
	})

	it('does not request while the page is hidden', () => {
		visibility = 'hidden'
		renderHook(() => useWakeLock(true))
		expect(request).not.toHaveBeenCalled()
	})

	it('swallows a refused request', async () => {
		request.mockRejectedValueOnce(new Error('NotAllowedError'))
		renderHook(() => useWakeLock(true))
		await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
		await act(async () => {})
	})

	it('is a no-op when the Wake Lock API is missing', () => {
		vi.stubGlobal('navigator', {})
		expect(() => renderHook(() => useWakeLock(true))).not.toThrow()
	})
})
