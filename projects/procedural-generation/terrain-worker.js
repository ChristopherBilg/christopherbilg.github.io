/**
 * Web Worker for terrain generation (Module Worker)
 * Offloads heavy computation from the main thread
 */

// Import noise and terrain generation functions as ES6 modules
import { NoiseGenerator } from './noise.js';
import { HeightMapGenerator } from './terrain-generator.js';

self.onmessage = function(e) {
  const { type, config, chunkInfo } = e.data;

  if (type === 'generate') {
    try {
      const generator = new HeightMapGenerator(config);

      let heightMap, moistureMap, temperatureMap;

      if (config.useBiomes) {
        const result = generator.generateWithClimate();
        heightMap = result.heightMap;
        moistureMap = result.moistureMap;
        temperatureMap = result.temperatureMap;
      } else {
        heightMap = generator.generate();
        moistureMap = null;
        temperatureMap = null;
      }

      // Send result back to main thread
      self.postMessage({
        type: 'complete',
        heightMap,
        moistureMap,
        temperatureMap,
      });
    } catch (error) {
      self.postMessage({
        type: 'error',
        error: error.message,
      });
    }
  } else if (type === 'generateChunk') {
    // Progressive rendering: generate a chunk of the terrain
    try {
      const { startY, endY, width, height } = chunkInfo;
      const { scale, octaves, persistence, useDomainWarping, warpStrength, seed, noiseType } = config;

      const noise = new NoiseGenerator(seed, noiseType);
      const moistureNoise = new NoiseGenerator(seed + 1000, 'perlin');
      const temperatureNoise = new NoiseGenerator(seed + 2000, 'perlin');

      const heightChunk = [];
      const moistureChunk = config.useBiomes ? [] : null;
      const temperatureChunk = config.useBiomes ? [] : null;

      for (let y = startY; y < endY; y++) {
        const heightRow = [];
        const moistureRow = config.useBiomes ? [] : null;
        const temperatureRow = config.useBiomes ? [] : null;

        for (let x = 0; x < width; x++) {
          let noiseValue;

          if (useDomainWarping) {
            noiseValue = noise.domainWarp(x * scale, y * scale, octaves, persistence, warpStrength);
          } else {
            noiseValue = noise.fbm(x * scale, y * scale, octaves, persistence);
          }

          // Normalize to 0-1 range
          noiseValue = (noiseValue + 1) / 2;
          heightRow.push(noiseValue);

          if (config.useBiomes) {
            const moisture = (moistureNoise.fbm(x * config.moistureScale, y * config.moistureScale, 3, 0.5) + 1) / 2;
            const temp = (temperatureNoise.fbm(x * config.temperatureScale, y * config.temperatureScale, 3, 0.5) + 1) / 2;
            moistureRow.push(moisture);
            temperatureRow.push(temp);
          }
        }

        heightChunk.push(heightRow);
        if (config.useBiomes) {
          moistureChunk.push(moistureRow);
          temperatureChunk.push(temperatureRow);
        }
      }

      self.postMessage({
        type: 'chunkComplete',
        chunkInfo,
        heightChunk,
        moistureChunk,
        temperatureChunk,
      });
    } catch (error) {
      self.postMessage({
        type: 'error',
        error: error.message,
      });
    }
  }
};
