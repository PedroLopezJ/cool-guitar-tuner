import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

// Genera los iconos de la PWA a partir de public/favicon.svg (el pick synthwave).
// El SVG es transparente, así que rellenamos el fondo #070b14 detrás del pick para
// los iconos maskable (Android) y apple-touch (iOS), donde no se quiere transparencia.
export default defineConfig({
	headLinkOptions: { preset: '2023' },
	preset: {
		...preset,
		maskable: {
			...preset.maskable,
			resizeOptions: { ...preset.maskable.resizeOptions, background: '#070b14' },
		},
		apple: {
			...preset.apple,
			resizeOptions: { ...preset.apple.resizeOptions, background: '#070b14' },
		},
	},
	images: ['public/favicon.svg'],
})
