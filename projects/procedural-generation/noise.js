/**
 * Noise generation utilities for procedural generation
 */

/**
 * Simple pseudo-random number generator with seed support
 */
export class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

/**
 * 2D Perlin-like noise generator
 */
export class NoiseGenerator {
  constructor(seed) {
    this.seed = seed;
    this.random = new SeededRandom(seed);
  }

  /**
   * Generate smooth interpolated 2D noise
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {number} Noise value between -1 and 1
   */
  noise2D(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;

    // Get corner values
    const n00 = this._hashCoordinates(xi, yi);
    const n10 = this._hashCoordinates(xi + 1, yi);
    const n01 = this._hashCoordinates(xi, yi + 1);
    const n11 = this._hashCoordinates(xi + 1, yi + 1);

    // Smooth interpolation
    const sx = this._smoothstep(xf);
    const sy = this._smoothstep(yf);

    // Bilinear interpolation
    const nx0 = this._lerp(n00, n10, sx);
    const nx1 = this._lerp(n01, n11, sx);
    return this._lerp(nx0, nx1, sy);
  }

  /**
   * Fractal Brownian Motion - layers multiple octaves of noise for natural variation
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} octaves - Number of noise layers to combine
   * @param {number} persistence - How much each octave contributes (amplitude decay)
   * @returns {number} Combined noise value between -1 and 1
   */
  fbm(x, y, octaves = 4, persistence = 0.5) {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxValue;
  }

  /**
   * Hash function for generating pseudo-random values from coordinates
   * @private
   */
  _hashCoordinates(x, y) {
    const hash = Math.sin(x * 12.9898 + y * 78.233 + this.seed * 43758.5453) * 43758.5453;
    return (hash - Math.floor(hash)) * 2 - 1;
  }

  /**
   * Linear interpolation
   * @private
   */
  _lerp(a, b, t) {
    return a + t * (b - a);
  }

  /**
   * Smooth step interpolation (ease in/out)
   * @private
   */
  _smoothstep(t) {
    return t * t * (3 - 2 * t);
  }
}
