import { useEffect } from 'react'

/**
 * Keep the screen awake while `active` — tuning means staring at the display
 * with both hands on the instrument, and a phone dimming mid-string is exactly
 * what we don't want. The browser drops the lock whenever the page is hidden, so
 * it's re-requested each time the page becomes visible again. Unsupported
 * browsers (and refusals, e.g. low battery) are silently ignored.
 */
export function useWakeLock(active: boolean): void {
	useEffect(() => {
		if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

		let sentinel: WakeLockSentinel | null = null
		let requesting = false
		let disposed = false

		async function acquire() {
			if (disposed || requesting || sentinel || document.visibilityState !== 'visible') return
			requesting = true
			try {
				const lock = await navigator.wakeLock.request('screen')
				if (disposed) {
					void lock.release().catch(() => {})
					return
				}
				sentinel = lock
				lock.addEventListener('release', () => {
					if (sentinel === lock) sentinel = null
				})
			} catch {
				// Refused (battery saver, permissions policy, not visible) — not fatal.
			} finally {
				requesting = false
			}
		}

		function onVisibilityChange() {
			if (document.visibilityState === 'visible') void acquire()
		}

		void acquire()
		document.addEventListener('visibilitychange', onVisibilityChange)
		return () => {
			disposed = true
			document.removeEventListener('visibilitychange', onVisibilityChange)
			const lock = sentinel
			sentinel = null
			if (lock) void lock.release().catch(() => {})
		}
	}, [active])
}
