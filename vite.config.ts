import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'
import { version } from './package.json'

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(version),
	},
	plugins: [
		react(),
		VitePWA({
			registerType: 'autoUpdate',
			pwaAssets: { config: true }, // generate and inject icons from pwa-assets.config.ts
			manifest: {
				name: 'Coolest Guitar & Bass Tuner',
				short_name: 'Coolest Tuner',
				description:
					"The coolest guitar and bass tuner you've ever seen, with real-time pitch detection and a 3D scene.",
				lang: 'en',
				theme_color: '#070b14',
				background_color: '#070b14',
				display: 'standalone',
				start_url: '/',
				scope: '/',
				categories: ['music', 'utilities'],
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
				navigateFallback: 'index.html',
				cleanupOutdatedCaches: true,
				clientsClaim: true,
				// Three.js/R3F/drei produce large chunks; raise the cap (2 MiB by default)
				// so the 3D bundle fits in the precache and the app works offline.
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
			},
			devOptions: { enabled: false }, // service worker only in build/preview, not in `vite dev`
		}),
	],
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: './src/test/setup.ts',
		// Agent worktrees live under .claude/worktrees; keep their copies of the
		// test files out of this project's run.
		exclude: [...configDefaults.exclude, '.claude/**'],
	},
})
