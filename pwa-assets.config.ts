import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

// Generates the PWA icons from public/favicon.svg (the synthwave pick).
// The SVG is transparent, so we fill a #070b14 background behind the pick for
// the maskable (Android) and apple-touch (iOS) icons, where transparency is unwanted.
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
