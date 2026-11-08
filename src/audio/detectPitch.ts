// Pure pitch-detection DSP: no React and no Web Audio, just numbers in and a
// frequency out. Keeping it separate from the hook lets it be unit-tested and
// benchmarked on synthetic buffers.

// Frequency search range. Low end covers drop-tunings (drop-D ≈ 73 Hz, drop-C
// ≈ 65 Hz); high end leaves headroom above the open high-E harmonics. Callers
// lower the floor for bass and extended-range tunings.
export const MIN_FREQ = 60
export const MAX_FREQ = 1200

// McLeod peak-picking threshold: pick the first key maximum within this factor
// of the strongest one. Picking the *first* (lowest lag) such peak is what
// makes the method robust against octave errors.
const MPM_THRESHOLD = 0.9

// The audio graph already low-passes at ~2 kHz, so the signal is band-limited
// well below the original Nyquist. Decimating by this factor keeps everything
// we search for (≤ MAX_FREQ) safely below the decimated Nyquist while halving
// the correlation work. A box-average over each group doubles as a cheap
// anti-alias filter.
const DECIMATION = 2

// Below this fraction of the zero-lag energy, the overlap at a lag holds no
// usable signal and the NSDF ratio would just amplify rounding noise.
const ENERGY_FLOOR = 1e-9

export type PitchCandidate = {
	freq: number | null
	clarity: number
}

// Reused across detections so the hot path allocates nothing (no per-frame GC).
// detectPitch runs sequentially, so sharing module scratch is safe; buffers are
// only reallocated when the analysis window (and so the FFT size) changes.
let decimateScratch = new Float64Array(0)
let nsdfScratch = new Float64Array(0)
let fftLength = 0
let fftRe = new Float64Array(0)
let fftIm = new Float64Array(0)
let cosTable = new Float64Array(0)
let sinTable = new Float64Array(0)
let bitReverse = new Uint32Array(0)
let peakLags = new Int32Array(0)
let peakValues = new Float64Array(0)

/**
 * Box-average groups of `factor` samples down to a shorter buffer. The averaging
 * is a (cheap) low-pass that suppresses aliasing as we drop the sample rate.
 */
function decimate(buffer: ArrayLike<number>, factor: number): Float64Array {
	const outLen = Math.floor(buffer.length / factor)
	if (decimateScratch.length !== outLen) decimateScratch = new Float64Array(outLen)
	const out = decimateScratch
	const inv = 1 / factor
	for (let i = 0; i < outLen; i++) {
		let s = 0
		const base = i * factor
		for (let j = 0; j < factor; j++) s += buffer[base + j]
		out[i] = s * inv
	}
	return out
}

function nextPowerOfTwo(n: number): number {
	let p = 1
	while (p < n) p <<= 1
	return p
}

/** (Re)build twiddle and bit-reversal tables — only when the FFT size changes. */
function prepareFft(length: number): void {
	if (length === fftLength) return
	fftLength = length
	fftRe = new Float64Array(length)
	fftIm = new Float64Array(length)
	const half = length >> 1
	cosTable = new Float64Array(half)
	sinTable = new Float64Array(half)
	for (let k = 0; k < half; k++) {
		const angle = (2 * Math.PI * k) / length
		cosTable[k] = Math.cos(angle)
		sinTable[k] = Math.sin(angle)
	}
	let bits = 0
	while (1 << bits < length) bits++
	bitReverse = new Uint32Array(length)
	for (let i = 0; i < length; i++) {
		let reversed = 0
		let v = i
		for (let b = 0; b < bits; b++) {
			reversed = (reversed << 1) | (v & 1)
			v >>= 1
		}
		bitReverse[i] = reversed
	}
}

/** In-place iterative radix-2 forward FFT (kernel e^{-2πi·kn/N}) using the prepared tables. */
function fftInPlace(re: Float64Array, im: Float64Array): void {
	const n = re.length
	for (let i = 0; i < n; i++) {
		const j = bitReverse[i]
		if (j > i) {
			let t = re[i]
			re[i] = re[j]
			re[j] = t
			t = im[i]
			im[i] = im[j]
			im[j] = t
		}
	}
	for (let span = 2; span <= n; span <<= 1) {
		const half = span >> 1
		const stride = n / span
		for (let start = 0; start < n; start += span) {
			for (let k = 0, t = 0; k < half; k++, t += stride) {
				const wr = cosTable[t]
				const wi = -sinTable[t]
				const a = start + k
				const b = a + half
				const br = re[b]
				const bi = im[b]
				const xr = br * wr - bi * wi
				const xi = br * wi + bi * wr
				re[b] = re[a] - xr
				im[b] = im[a] - xi
				re[a] += xr
				im[a] += xi
			}
		}
	}
}

/**
 * McLeod Pitch Method (MPM): build the Normalized Square Difference Function
 * NSDF(τ) = 2·r(τ) / m(τ). The NSDF is self-normalizing (no window needed) and
 * bounded to [-1, 1], so its peak value doubles as a clarity measure.
 *
 * The autocorrelation r(τ) comes from the Wiener–Khinchin theorem (FFT → power
 * spectrum → FFT) in O(P log P) instead of the direct O(N·maxLag) sum, and the
 * energy term m(τ) = Σ x[i]² + x[i+τ]² is updated incrementally per lag.
 */
function normalizedSquareDifference(
	buffer: Float64Array,
	sampleRate: number,
	minFreq: number,
	maxFreq: number,
): { nsdf: Float64Array; minLag: number; maxLag: number } {
	const size = buffer.length
	const maxLag = Math.min(size - 1, Math.floor(sampleRate / minFreq))
	const minLag = Math.max(2, Math.ceil(sampleRate / maxFreq))
	if (nsdfScratch.length !== maxLag + 1) nsdfScratch = new Float64Array(maxLag + 1)
	const nsdf = nsdfScratch

	// Remove DC so a mic offset can't bias the correlation.
	let mean = 0
	for (let i = 0; i < size; i++) mean += buffer[i]
	mean /= size

	// A circular (FFT) correlation equals the linear one for every lag ≤ maxLag
	// as long as the zero padding leaves room for the shifted copy: N + maxLag.
	prepareFft(nextPowerOfTwo(size + maxLag))
	const re = fftRe
	const im = fftIm
	const n = fftLength
	let energy = 0
	for (let i = 0; i < size; i++) {
		const x = buffer[i] - mean
		re[i] = x
		energy += x * x
	}
	re.fill(0, size)
	im.fill(0)

	fftInPlace(re, im)
	for (let k = 0; k < n; k++) {
		re[k] = re[k] * re[k] + im[k] * im[k]
		im[k] = 0
	}
	// The power spectrum is real and even, so a *forward* FFT of it equals
	// n · IFFT — no separate inverse transform (or twiddle table) needed.
	fftInPlace(re, im)
	const scale = 1 / n

	// m(0) = 2·Σx²; each lag drops x[τ-1]² from the tail-shifted copy and
	// x[N-τ]² from the head copy as their overlap shrinks.
	let m = 2 * energy
	const floor = m * ENERGY_FLOOR
	for (let lag = 0; lag <= maxLag; lag++) {
		if (lag > 0) {
			const head = buffer[lag - 1] - mean
			const tail = buffer[size - lag] - mean
			m -= head * head + tail * tail
		}
		if (m > floor) {
			const value = (2 * re[lag] * scale) / m
			// Mathematically within [-1, 1] (Cauchy–Schwarz); clamp FFT rounding.
			nsdf[lag] = value > 1 ? 1 : value < -1 ? -1 : value
		} else {
			nsdf[lag] = 0
		}
	}

	return { nsdf, minLag, maxLag }
}

/**
 * Collect the "key maxima" of the NSDF: the single highest point inside each
 * positive lobe (the region between an upward and the following downward zero
 * crossing). The lobe containing lag 0 is intentionally skipped. Peaks land in
 * the module scratch arrays; the return value is how many were found.
 */
function keyMaxima(nsdf: Float64Array, minLag: number, maxLag: number): number {
	// Lobes alternate with negative stretches, so there are at most maxLag/2 of them.
	const capacity = (maxLag >> 1) + 1
	if (peakLags.length < capacity) {
		peakLags = new Int32Array(capacity)
		peakValues = new Float64Array(capacity)
	}
	let count = 0
	let inLobe = false
	let bestLag = -1
	let bestVal = -Infinity

	for (let lag = 1; lag <= maxLag; lag++) {
		const prev = nsdf[lag - 1]
		const cur = nsdf[lag]
		if (prev <= 0 && cur > 0) {
			// Entering a positive lobe.
			inLobe = true
			bestLag = lag
			bestVal = cur
		} else if (inLobe && cur > 0) {
			if (cur > bestVal) {
				bestVal = cur
				bestLag = lag
			}
		} else if (inLobe && cur <= 0) {
			// Leaving the lobe — commit its peak.
			if (bestLag >= minLag) {
				peakLags[count] = bestLag
				peakValues[count] = bestVal
				count++
			}
			inLobe = false
		}
	}
	if (inLobe && bestLag >= minLag) {
		peakLags[count] = bestLag
		peakValues[count] = bestVal
		count++
	}
	return count
}

export function detectPitch(
	buffer: ArrayLike<number>,
	sampleRate: number,
	minFreq: number = MIN_FREQ,
	maxFreq: number = MAX_FREQ,
): PitchCandidate {
	const decimated = decimate(buffer, DECIMATION)
	const ds = sampleRate / DECIMATION
	const { nsdf, minLag, maxLag } = normalizedSquareDifference(decimated, ds, minFreq, maxFreq)
	const count = keyMaxima(nsdf, minLag, maxLag)
	if (count === 0) return { freq: null, clarity: 0 }

	// Threshold relative to the strongest lobe, then take the first (lowest-lag,
	// i.e. highest-frequency / fundamental) lobe that clears it.
	let maxValue = 0
	for (let i = 0; i < count; i++) if (peakValues[i] > maxValue) maxValue = peakValues[i]
	const threshold = maxValue * MPM_THRESHOLD
	let chosen = 0
	while (chosen < count - 1 && peakValues[chosen] < threshold) chosen++
	const lag = peakLags[chosen]

	// Sub-sample peak location via parabolic interpolation around the integer lag.
	let refinedLag = lag
	let refinedValue = nsdf[lag]
	if (lag > 0 && lag < maxLag) {
		const y1 = nsdf[lag - 1]
		const y2 = nsdf[lag]
		const y3 = nsdf[lag + 1]
		const denom = y1 - 2 * y2 + y3
		if (denom !== 0) {
			const delta = (0.5 * (y1 - y3)) / denom
			refinedLag = lag + delta
			refinedValue = y2 - 0.25 * (y1 - y3) * delta
		}
	}
	if (refinedLag <= 0) return { freq: null, clarity: 0 }
	return { freq: ds / refinedLag, clarity: Math.max(0, Math.min(1, refinedValue)) }
}
