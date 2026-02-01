import { useState, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { TunerSceneThree } from './components/TunerSceneThree'
import { usePitchDetection } from './audio/usePitchDetection'

function App() {
	const [stream, setStream] = useState<MediaStream | null>(null)
	const [error, setError] = useState<string | null>(null)
	const pitchState = usePitchDetection(stream)

	const requestMic = useCallback(async () => {
		setError(null)
		try {
			const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
			setStream(mediaStream)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Microphone access denied')
		}
	}, [])

	if (stream) {
		return (
			<div className="tuner-canvas-wrapper">
				<Canvas flat orthographic camera={{ position: [0, 0, 5], zoom: 120 }}>
					<TunerSceneThree pitchState={pitchState} />
				</Canvas>
				{pitchState.frequency === null && (
					<div className="tuner-overlay" role="status" aria-live="polite">
						<p>Listening… play a single note to start tuning.</p>
					</div>
				)}
			</div>
		)
	}

	return (
		<div className="mic-button">
			<div>
				<button type="button" onClick={requestMic}>
					Allow microphone
				</button>
				{error && <p className="error">{error}</p>}
			</div>
		</div>
	)
}

export default App
