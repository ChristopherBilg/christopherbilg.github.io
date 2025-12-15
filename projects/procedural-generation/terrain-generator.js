/**
 * Terrain generation using height maps and noise functions
 */

import { NoiseGenerator } from "./noise.js";

/**
 * Configuration for terrain generation
 * @typedef {Object} TerrainConfig
 * @property {number} width - Width of the terrain in pixels
 * @property {number} height - Height of the terrain in pixels
 * @property {number} seed - Random seed for reproducible generation
 * @property {number} scale - Noise scale factor (smaller = more zoomed out)
 * @property {number} octaves - Number of noise layers
 * @property {number} persistence - Amplitude decay between octaves
 */

const DEFAULT_CONFIG = {
  width: 400,
  height: 300,
  seed: Date.now(),
  scale: 0.02,
  octaves: 4,
  persistence: 0.5,
};

/**
 * Terrain types mapped by elevation thresholds
 */
const TERRAIN_TYPES = [
  { threshold: 0.3, name: "deep_water", color: { r: 0, g: 50, b: 150 } },
  { threshold: 0.4, name: "shallow_water", color: { r: 50, g: 100, b: 200 } },
  { threshold: 0.45, name: "beach", color: { r: 210, g: 180, b: 140 } },
  { threshold: 0.6, name: "grass", color: { r: 50, g: 150, b: 50 } },
  { threshold: 0.75, name: "hills", color: { r: 34, g: 100, b: 34 } },
  { threshold: 0.85, name: "mountains", color: { r: 100, g: 100, b: 100 } },
  { threshold: Infinity, name: "snow", color: { r: 240, g: 240, b: 240 } },
];

/**
 * Height map generator for terrain
 */
export class HeightMapGenerator {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.noise = new NoiseGenerator(this.config.seed);
  }

  /**
   * Generate a 2D array of height values (0-1 range)
   * @returns {number[][]} Height map
   */
  generate() {
    const { width, height, scale, octaves, persistence } = this.config;
    const heightMap = [];

    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        const noiseValue = this.noise.fbm(x * scale, y * scale, octaves, persistence);
        // Normalize from [-1, 1] to [0, 1]
        const heightValue = (noiseValue + 1) / 2;
        row.push(heightValue);
      }
      heightMap.push(row);
    }

    return heightMap;
  }

  /**
   * Update the seed and regenerate noise generator
   * @param {number} newSeed - New random seed
   */
  setSeed(newSeed) {
    this.config.seed = newSeed || Date.now();
    this.noise = new NoiseGenerator(this.config.seed);
  }
}

/**
 * Renderer for height maps to canvas
 */
export class TerrainRenderer {
  /**
   * Convert height value to terrain color
   * @param {number} height - Height value (0-1)
   * @returns {Object} RGB color object
   */
  static getTerrainColor(height) {
    for (const terrain of TERRAIN_TYPES) {
      if (height < terrain.threshold) {
        return terrain.color;
      }
    }
    return TERRAIN_TYPES[TERRAIN_TYPES.length - 1].color;
  }

  /**
   * Render height map to canvas element
   * @param {HTMLCanvasElement} canvas - Target canvas element
   * @param {number[][]} heightMap - 2D array of height values
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   */
  static render(canvas, heightMap, width, height) {
    if (!canvas) {
      throw new Error("Canvas element is required");
    }

    const ctx = canvas.getContext("2d");

    // Set canvas dimensions
    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);

    // Populate image data with terrain colors
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const heightValue = heightMap[y][x];
        const color = TerrainRenderer.getTerrainColor(heightValue);

        const idx = (y * width + x) * 4;
        imageData.data[idx] = color.r;
        imageData.data[idx + 1] = color.g;
        imageData.data[idx + 2] = color.b;
        imageData.data[idx + 3] = 255; // Alpha
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }
}
