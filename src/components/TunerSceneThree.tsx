import { Suspense, useMemo, useRef } from 'react'
import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { PitchState } from '../audio/usePitchDetection'

const BASE_RADIUS = 1.6
const RING_THICKNESS = 0.075
const CENTS_SCALE = 0.025
const RADIUS_CLAMP_MIN = 0.5
const RADIUS_CLAMP_MAX = 3.0

function frequencyRadius(cents: number): number {
	const r = BASE_RADIUS * (1 + cents * CENTS_SCALE)
	return Math.max(RADIUS_CLAMP_MIN, Math.min(RADIUS_CLAMP_MAX, r))
}

function PulsingRing({
	radius,
	color,
	speed,
	opacity,
	z,
}: {
	radius: number
	color: string
	speed: number
	opacity: number
	z: number
}) {
	const meshRef = useRef<THREE.Mesh>(null)
	const material = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				color,
				transparent: true,
				opacity,
				blending: THREE.AdditiveBlending,
				side: THREE.DoubleSide,
			}),
		[color, opacity],
	)
	const geometry = useMemo(
		() =>
			new THREE.RingGeometry(Math.max(0.01, radius - RING_THICKNESS), radius + RING_THICKNESS, 128),
		[radius],
	)

	useFrame(({ clock }) => {
		const t = clock.getElapsedTime() * speed
		const pulse = 1 + Math.sin(t) * 0.015
		if (!meshRef.current) return
		meshRef.current.scale.set(pulse, pulse, 1)
		meshRef.current.rotation.z += 0.0015 * speed
	})

	return <mesh ref={meshRef} position={[0, 0, z]} geometry={geometry} material={material} />
}

export function TunerSceneThree({ pitchState }: { pitchState: PitchState }) {
	const { noteName, cents, inTune } = pitchState
	const baseColor = inTune ? '#22c55e' : '#38bdf8'
	const offsetColor = inTune ? '#22c55e' : '#f97316'
	const offsetRadius = frequencyRadius(cents)

	return (
		<>
			<color attach="background" args={['#05070d']} />
			<ambientLight intensity={0.6} />
			<Suspense fallback={null}>
				<Text position={[0, 0, 0.2]} fontSize={0.6} anchorX="center" anchorY="middle" color="#e6f0ff">
					{noteName}
				</Text>
			</Suspense>
			<PulsingRing
				radius={BASE_RADIUS - RING_THICKNESS}
				color={baseColor}
				speed={0.6}
				opacity={0.75}
				z={0}
			/>
			<PulsingRing
				radius={BASE_RADIUS + RING_THICKNESS}
				color={baseColor}
				speed={0.9}
				opacity={0.35}
				z={-0.01}
			/>
			<PulsingRing
				radius={offsetRadius - RING_THICKNESS}
				color={offsetColor}
				speed={1.1}
				opacity={0.8}
				z={0.02}
			/>
			<PulsingRing
				radius={offsetRadius + RING_THICKNESS}
				color={offsetColor}
				speed={1.4}
				opacity={0.4}
				z={0.01}
			/>
		</>
	)
}
