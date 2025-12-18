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
 * Simplex Noise Generator (Ken Perlin's improved Perlin noise)
 * More efficient and has fewer directional artifacts than classic Perlin
 */
export class SimplexNoise {
  constructor(seed) {
    this.seed = seed;
    this.random = new SeededRandom(seed);
    this._buildPermutationTable();
  }

  _buildPermutationTable() {
    this.perm = new Array(512);
    this.permMod12 = new Array(512);
    const p = [];

    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }

    // Shuffle using seeded random
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(this.random.next() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  // 2D Simplex noise
  noise2D(x, y) {
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    let i1, j1;
    if (x0 > y0) {
      i1 = 1; j1 = 0;
    } else {
      i1 = 0; j1 = 1;
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    const gi0 = this.permMod12[ii + this.perm[jj]] % 12;
    const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]] % 12;
    const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]] % 12;

    const grad3 = [
      [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
      [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
      [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
    ];

    const dot = (g, x, y) => g[0] * x + g[1] * y;

    let n0, n1, n2;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 < 0) n0 = 0.0;
    else {
      t0 *= t0;
      n0 = t0 * t0 * dot(grad3[gi0], x0, y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 < 0) n1 = 0.0;
    else {
      t1 *= t1;
      n1 = t1 * t1 * dot(grad3[gi1], x1, y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 < 0) n2 = 0.0;
    else {
      t2 *= t2;
      n2 = t2 * t2 * dot(grad3[gi2], x2, y2);
    }

    return 70.0 * (n0 + n1 + n2);
  }
}

/**
 * Voronoi/Worley Noise Generator
 * Creates cellular patterns by calculating distance to nearest feature points
 */
export class VoronoiNoise {
  constructor(seed) {
    this.seed = seed;
    this.random = new SeededRandom(seed);
  }

  // Hash function to get consistent random points for each cell
  _hash2D(x, y) {
    const h = Math.sin(x * 127.1 + y * 311.7 + this.seed) * 43758.5453;
    return h - Math.floor(h);
  }

  // Get feature point for a cell
  _getFeaturePoint(cellX, cellY) {
    const random = new SeededRandom(this.seed + cellX * 374761393 + cellY * 668265263);
    return {
      x: cellX + random.next(),
      y: cellY + random.next()
    };
  }

  // 2D Voronoi noise (returns distance to nearest feature point)
  noise2D(x, y) {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);

    let minDist = Infinity;

    // Check surrounding cells
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const featurePoint = this._getFeaturePoint(cellX + i, cellY + j);
        const dx = x - featurePoint.x;
        const dy = y - featurePoint.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        minDist = Math.min(minDist, dist);
      }
    }

    // Normalize to approximately -1 to 1 range
    return (minDist * 2 - 1);
  }
}

/**
 * 2D Perlin-like noise generator
 */
export class NoiseGenerator {
  constructor(seed, type = 'perlin') {
    this.seed = seed;
    this.random = new SeededRandom(seed);
    this.type = type;

    // Initialize different noise generators
    this.simplexNoise = new SimplexNoise(seed);
    this.voronoiNoise = new VoronoiNoise(seed);
  }

  /**
   * Generate smooth interpolated 2D noise
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {number} Noise value between -1 and 1
   */
  noise2D(x, y) {
    switch (this.type) {
      case 'simplex':
        return this.simplexNoise.noise2D(x, y);
      case 'voronoi':
        return this.voronoiNoise.noise2D(x, y);
      case 'perlin':
      default:
        return this._perlinNoise2D(x, y);
    }
  }

  /**
   * Classic Perlin-like noise implementation
   * @private
   */
  _perlinNoise2D(x, y) {
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
   * Domain Warping - distorts the coordinate space before sampling noise
   * Creates more organic, flowing patterns
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} octaves - Number of noise layers
   * @param {number} persistence - Amplitude decay
   * @param {number} warpStrength - How much to distort the space (0-1)
   * @returns {number} Warped noise value between -1 and 1
   */
  domainWarp(x, y, octaves = 4, persistence = 0.5, warpStrength = 0.3) {
    // Generate two offset values using different noise samples
    const offsetX = this.fbm(x + 5.2, y + 1.3, octaves, persistence) * warpStrength;
    const offsetY = this.fbm(x + 4.7, y + 9.1, octaves, persistence) * warpStrength;

    // Sample noise at the warped coordinates
    return this.fbm(x + offsetX, y + offsetY, octaves, persistence);
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
