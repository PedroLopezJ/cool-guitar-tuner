import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { PitchState } from '../audio/usePitchDetection'

const BASE_RADIUS = 1.6
const RING_THICKNESS = 0.075
const CENTS_SCALE = 0.02
const RADIUS_CLAMP_MIN = 0.6
const RADIUS_CLAMP_MAX = 2.6
// Largest radius the scene can ever draw — the camera zoom is derived from this
// so nothing is clipped, even on narrow phone screens.
const FIT_RADIUS = RADIUS_CLAMP_MAX + RING_THICKNESS + 0.1
// Higher = snappier, lower = smoother. These drive frame-rate-independent
// damping so the rings glide instead of stepping with each detection.
const RADIUS_DAMP = 5
const COLOR_DAMP = 9

const COLOR_IN_TUNE = '#22c55e'
const COLOR_BASE = '#38bdf8'
const COLOR_OFFSET = '#f97316'

const BG_BASE = '#05070d'
const BG_IN_TUNE = '#04140a'

function frequencyRadius(cents: number): number {
	const r = BASE_RADIUS * (1 + cents * CENTS_SCALE)
	return Math.max(RADIUS_CLAMP_MIN, Math.min(RADIUS_CLAMP_MAX, r))
}

/** Ease the scene background toward green while the note is in tune. */
function AnimatedBackground({ inTune }: { inTune: boolean }) {
	const scene = useThree((s) => s.scene)
	const current = useRef(new THREE.Color(BG_BASE))
	const base = useMemo(() => new THREE.Color(BG_BASE), [])
	const green = useMemo(() => new THREE.Color(BG_IN_TUNE), [])
	useFrame((_, delta) => {
		current.current.lerp(inTune ? green : base, 1 - Math.exp(-COLOR_DAMP * delta))
		scene.background = current.current
	})
	return null
}

/** Keep the whole tuner inside the viewport on any screen size. */
function ResponsiveZoom() {
	const camera = useThree((s) => s.camera)
	const width = useThree((s) => s.size.width)
	const height = useThree((s) => s.size.height)
	useEffect(() => {
		const minDimension = Math.min(width, height)
		const ortho = camera as THREE.OrthographicCamera
		ortho.zoom = ((minDimension / 2) * 0.95) / FIT_RADIUS
		ortho.updateProjectionMatrix()
	}, [camera, width, height])
	return null
}

// The Canvas runs frameloop="demand", so it only redraws when asked. This drives
// a steady ~30 fps so the rings keep pulsing smoothly without re-rendering at the
// display's full refresh (120 Hz on ProMotion = ~4× the GPU work for no gain).
// damp()/exp() easing is frame-rate independent, so the motion is unchanged.
const TARGET_FPS = 30

function FrameLimiter() {
	const invalidate = useThree((s) => s.invalidate)
	useEffect(() => {
		let raf = 0
		let last = 0
		const interval = 1000 / TARGET_FPS
		function loop(now: number) {
			raf = requestAnimationFrame(loop)
			if (now - last >= interval) {
				last = now
				invalidate()
			}
		}
		raf = requestAnimationFrame(loop)
		return () => cancelAnimationFrame(raf)
	}, [invalidate])
	return null
}

function PulsingRing({
	baseRadius,
	targetRadius,
	color,
	speed,
	opacity,
	z,
}: {
	baseRadius: number
	targetRadius: number
	color: string
	speed: number
	opacity: number
	z: number
}) {
	const meshRef = useRef<THREE.Mesh>(null)
	const currentRadiusRef = useRef(targetRadius)
	const targetColor = useMemo(() => new THREE.Color(color), [color])
	// Created once; radius is applied via scale and color is eased every frame,
	// so we never rebuild geometry/material as the reading changes.
	const material = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				color: new THREE.Color(color),
				transparent: true,
				opacity,
				blending: THREE.AdditiveBlending,
				side: THREE.DoubleSide,
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	)
	const geometry = useMemo(
		() =>
			new THREE.RingGeometry(
				Math.max(0.01, baseRadius - RING_THICKNESS),
				baseRadius + RING_THICKNESS,
				128,
			),
		[baseRadius],
	)

	useFrame(({ clock }, delta) => {
		const mesh = meshRef.current
		if (!mesh) return
		currentRadiusRef.current = THREE.MathUtils.damp(
			currentRadiusRef.current,
			targetRadius,
			RADIUS_DAMP,
			delta,
		)
		const scale = currentRadiusRef.current / baseRadius
		const pulse = 1 + Math.sin(clock.getElapsedTime() * speed) * 0.015
		mesh.scale.set(scale * pulse, scale * pulse, 1)
		const mat = mesh.material as THREE.MeshBasicMaterial
		mat.color.lerp(targetColor, 1 - Math.exp(-COLOR_DAMP * delta))
	})

	return <mesh ref={meshRef} position={[0, 0, z]} geometry={geometry} material={material} />
}

export function TunerSceneThree({
	pitchState,
	stringInfo,
}: {
	pitchState: PitchState
	stringInfo: { number: number | null; target: string } | null
}) {
	const { noteName, noteWithOctave, cents, inTune } = pitchState
	const baseColor = inTune ? COLOR_IN_TUNE : COLOR_BASE
	const offsetColor = inTune ? COLOR_IN_TUNE : COLOR_OFFSET
	const offsetRadius = frequencyRadius(cents)

	const octave = noteWithOctave === '—' ? '' : noteWithOctave.slice(noteName.length)
	// Sit the octave just past the right edge of the note glyphs (approx width).
	const octaveX = (noteName.length * 0.34) / 2 + 0.14

	return (
		<>
			<AnimatedBackground inTune={inTune} />
			<FrameLimiter />
			<ambientLight intensity={0.6} />
			<ResponsiveZoom />
			<Suspense fallback={null}>
				<Text position={[0, 0, 0.2]} fontSize={0.6} anchorX="center" anchorY="middle" color="#e6f0ff">
					{noteName}
				</Text>
				{octave && (
					<Text
						position={[octaveX, -0.16, 0.2]}
						fontSize={0.3}
						anchorX="left"
						anchorY="middle"
						color={inTune ? COLOR_IN_TUNE : '#9fb6d4'}
					>
						{octave}
					</Text>
				)}
				{stringInfo && (
					<Text
						position={[0, -0.62, 0.2]}
						fontSize={0.16}
						anchorX="center"
						anchorY="middle"
						color={inTune ? COLOR_IN_TUNE : '#9fb6d4'}
					>
						{stringInfo.number === null
							? `STRING · ${stringInfo.target}`
							: `STRING ${stringInfo.number} · ${stringInfo.target}`}
					</Text>
				)}
			</Suspense>
			<PulsingRing
				baseRadius={BASE_RADIUS - RING_THICKNESS}
				targetRadius={BASE_RADIUS - RING_THICKNESS}
				color={baseColor}
				speed={0.6}
				opacity={0.75}
				z={0}
			/>
			<PulsingRing
				baseRadius={BASE_RADIUS + RING_THICKNESS}
				targetRadius={BASE_RADIUS + RING_THICKNESS}
				color={baseColor}
				speed={0.9}
				opacity={0.35}
				z={-0.01}
			/>
			<PulsingRing
				baseRadius={BASE_RADIUS - RING_THICKNESS}
				targetRadius={offsetRadius - RING_THICKNESS}
				color={offsetColor}
				speed={1.1}
				opacity={0.8}
				z={0.02}
			/>
			<PulsingRing
				baseRadius={BASE_RADIUS + RING_THICKNESS}
				targetRadius={offsetRadius + RING_THICKNESS}
				color={offsetColor}
				speed={1.4}
				opacity={0.4}
				z={0.01}
			/>
		</>
	)
}
