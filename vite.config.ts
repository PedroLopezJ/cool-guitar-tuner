import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
	plugins: [
		react(),
		VitePWA({
			registerType: 'autoUpdate',
			pwaAssets: { config: true }, // usa pwa-assets.config.ts para generar e inyectar iconos
			manifest: {
				name: 'Coolest Guitar Tuner',
				short_name: 'Coolest Tuner',
				description:
					'Afinador de guitarra synthwave con detección de tono en tiempo real y escena 3D. Funciona sin conexión.',
				lang: 'es',
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
				// Three.js/R3F/drei generan chunks grandes; subir el tope (por defecto 2 MiB)
				// para que el bundle 3D entre en el precache y la app funcione offline.
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
			},
			devOptions: { enabled: false }, // SW sólo en build/preview, no en `vite dev`
		}),
	],
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: './src/test/setup.ts',
	},
})
