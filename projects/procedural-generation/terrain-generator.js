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
  noiseType: 'perlin',
  useDomainWarping: false,
  warpStrength: 0.3,
  useBiomes: false,
  moistureScale: 0.01,
  temperatureScale: 0.008,
  view3D: false,
  heightMultiplier: 40,
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
 * Biome definitions based on elevation, moisture, and temperature
 * Each biome has conditions and a color
 */
const BIOMES = {
  // Water biomes (elevation < 0.4)
  deep_ocean: { color: { r: 0, g: 50, b: 150 } },
  ocean: { color: { r: 20, g: 80, b: 180 } },
  shallow_water: { color: { r: 50, g: 120, b: 220 } },

  // Beach/Coast (elevation 0.4 - 0.45)
  beach: { color: { r: 210, g: 180, b: 140 } },

  // Cold biomes (low temperature)
  tundra: { color: { r: 180, g: 200, b: 200 } },
  snow: { color: { r: 240, g: 245, b: 250 } },
  taiga: { color: { r: 40, g: 90, b: 60 } },

  // Temperate biomes (medium temperature)
  grassland: { color: { r: 100, g: 180, b: 80 } },
  temperate_forest: { color: { r: 50, g: 140, b: 50 } },
  temperate_rainforest: { color: { r: 30, g: 120, b: 40 } },

  // Warm biomes (high temperature)
  desert: { color: { r: 230, g: 200, b: 140 } },
  savanna: { color: { r: 180, g: 170, b: 90 } },
  tropical_forest: { color: { r: 40, g: 130, b: 40 } },
  rainforest: { color: { r: 20, g: 100, b: 30 } },

  // Mountain biomes
  bare_mountain: { color: { r: 120, g: 120, b: 120 } },
  mountain_peak: { color: { r: 250, g: 250, b: 255 } },
};

/**
 * Determine biome based on elevation, moisture, and temperature
 * @param {number} elevation - 0 to 1
 * @param {number} moisture - 0 to 1
 * @param {number} temperature - 0 to 1
 * @returns {Object} Biome color object
 */
function getBiome(elevation, moisture, temperature) {
  // Water bodies
  if (elevation < 0.3) return BIOMES.deep_ocean;
  if (elevation < 0.4) return BIOMES.ocean;
  if (elevation < 0.43) return BIOMES.shallow_water;

  // Beach
  if (elevation < 0.46) return BIOMES.beach;

  // High mountains (independent of moisture/temp)
  if (elevation > 0.85) return BIOMES.mountain_peak;
  if (elevation > 0.75) return BIOMES.bare_mountain;

  // Cold climates (low temperature)
  if (temperature < 0.3) {
    if (elevation > 0.65) return BIOMES.snow;
    if (moisture < 0.33) return BIOMES.tundra;
    return BIOMES.taiga;
  }

  // Temperate climates (medium temperature)
  if (temperature < 0.6) {
    if (moisture < 0.3) return BIOMES.grassland;
    if (moisture < 0.6) return BIOMES.temperate_forest;
    return BIOMES.temperate_rainforest;
  }

  // Warm/Hot climates (high temperature)
  if (moisture < 0.25) return BIOMES.desert;
  if (moisture < 0.5) return BIOMES.savanna;
  if (moisture < 0.75) return BIOMES.tropical_forest;
  return BIOMES.rainforest;
}

/**
 * Height map generator for terrain
 */
export class HeightMapGenerator {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.noise = new NoiseGenerator(this.config.seed, this.config.noiseType);
    this.moistureNoise = new NoiseGenerator(this.config.seed + 1000, 'perlin');
    this.temperatureNoise = new NoiseGenerator(this.config.seed + 2000, 'perlin');
  }

  /**
   * Generate a 2D array of height values (0-1 range)
   * @returns {number[][]} Height map
   */
  generate() {
    const { width, height, scale, octaves, persistence, useDomainWarping, warpStrength } = this.config;
    const heightMap = [];

    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        let noiseValue;

        if (useDomainWarping) {
          noiseValue = this.noise.domainWarp(x * scale, y * scale, octaves, persistence, warpStrength);
        } else {
          noiseValue = this.noise.fbm(x * scale, y * scale, octaves, persistence);
        }

        // Normalize from [-1, 1] to [0, 1]
        const heightValue = (noiseValue + 1) / 2;
        row.push(heightValue);
      }
      heightMap.push(row);
    }

    return heightMap;
  }

  /**
   * Generate moisture and temperature maps along with height map
   * @returns {Object} Object containing heightMap, moistureMap, and temperatureMap
   */
  generateWithClimate() {
    const { width, height, scale, octaves, persistence, useDomainWarping, warpStrength, moistureScale, temperatureScale } = this.config;
    const heightMap = [];
    const moistureMap = [];
    const temperatureMap = [];

    for (let y = 0; y < height; y++) {
      const heightRow = [];
      const moistureRow = [];
      const tempRow = [];

      for (let x = 0; x < width; x++) {
        // Generate height
        let noiseValue;
        if (useDomainWarping) {
          noiseValue = this.noise.domainWarp(x * scale, y * scale, octaves, persistence, warpStrength);
        } else {
          noiseValue = this.noise.fbm(x * scale, y * scale, octaves, persistence);
        }
        const heightValue = (noiseValue + 1) / 2;
        heightRow.push(heightValue);

        // Generate moisture (using different scale)
        const moistureValue = (this.moistureNoise.fbm(x * moistureScale, y * moistureScale, 4, 0.5) + 1) / 2;
        moistureRow.push(moistureValue);

        // Generate temperature (using different scale, influenced by latitude)
        const latitudeFactor = Math.abs((y / height) - 0.5) * 2; // 0 at equator, 1 at poles
        const baseTemp = (this.temperatureNoise.fbm(x * temperatureScale, y * temperatureScale, 3, 0.5) + 1) / 2;
        // Blend base temperature with latitude (colder at poles, hotter at equator)
        const temperature = baseTemp * 0.7 + (1 - latitudeFactor) * 0.3;
        tempRow.push(temperature);
      }

      heightMap.push(heightRow);
      moistureMap.push(moistureRow);
      temperatureMap.push(tempRow);
    }

    return { heightMap, moistureMap, temperatureMap };
  }

  /**
   * Update the seed and regenerate noise generator
   * @param {number} newSeed - New random seed
   */
  setSeed(newSeed) {
    this.config.seed = newSeed || Date.now();
    this.noise = new NoiseGenerator(this.config.seed, this.config.noiseType);
    this.moistureNoise = new NoiseGenerator(this.config.seed + 1000, 'perlin');
    this.temperatureNoise = new NoiseGenerator(this.config.seed + 2000, 'perlin');
  }

  /**
   * Update the noise type and regenerate noise generator
   * @param {string} noiseType - Type of noise (perlin, simplex, voronoi)
   */
  setNoiseType(noiseType) {
    this.config.noiseType = noiseType;
    this.noise = new NoiseGenerator(this.config.seed, noiseType);
  }

  /**
   * Generate rivers using flow accumulation
   * Water flows from high elevation to low elevation
   * @param {number[][]} heightMap - The height map to generate rivers on
   * @param {number} threshold - Flow accumulation threshold for river formation (default 100)
   * @returns {number[][]} Flow accumulation map
   */
  generateRivers(heightMap, threshold = 100) {
    const { width, height } = this.config;
    const flowAccumulation = Array(height).fill(0).map(() => Array(width).fill(1));
    const visited = Array(height).fill(false).map(() => Array(width).fill(false));

    // Sort all cells by elevation (highest first)
    const cells = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        cells.push({ x, y, elevation: heightMap[y][x] });
      }
    }
    cells.sort((a, b) => b.elevation - a.elevation);

    // 8-directional neighbors
    const directions = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];

    // Process cells from highest to lowest elevation
    for (const cell of cells) {
      const { x, y } = cell;
      if (visited[y][x]) continue;

      visited[y][x] = true;
      let lowestNeighbor = null;
      let lowestElevation = heightMap[y][x];

      // Find the lowest neighbor
      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const neighborElevation = heightMap[ny][nx];
          if (neighborElevation < lowestElevation) {
            lowestElevation = neighborElevation;
            lowestNeighbor = { x: nx, y: ny };
          }
        }
      }

      // Flow to the lowest neighbor
      if (lowestNeighbor) {
        flowAccumulation[lowestNeighbor.y][lowestNeighbor.x] += flowAccumulation[y][x];
      }
    }

    return flowAccumulation;
  }

  /**
   * Apply hydraulic erosion to the height map
   * Simulates water erosion over time
   * @param {number[][]} heightMap - The height map to erode
   * @param {number} iterations - Number of erosion iterations (default 50000)
   * @param {number} erosionStrength - How much material to erode (default 0.3)
   * @returns {number[][]} Eroded height map
   */
  applyHydraulicErosion(heightMap, iterations = 50000, erosionStrength = 0.3) {
    const { width, height } = this.config;

    // Validate heightMap
    if (!heightMap || !Array.isArray(heightMap) || heightMap.length === 0) {
      console.error('Invalid heightMap provided to applyHydraulicErosion');
      return heightMap;
    }

    const erodedMap = heightMap.map(row => [...row]);

    const inertia = 0.05; // How much the droplet maintains its direction
    const sedimentCapacityFactor = 4;
    const minSedimentCapacity = 0.01;
    const evaporateSpeed = 0.01;
    const depositSpeed = 0.3;
    const erodeSpeed = erosionStrength;
    const gravity = 4;

    // Random number generator seeded with config seed
    let seed = this.config.seed;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let i = 0; i < iterations; i++) {
      // Random starting position
      let x = random() * width;
      let y = random() * height;
      let dirX = 0;
      let dirY = 0;
      let speed = 1;
      let water = 1;
      let sediment = 0;

      // Simulate droplet path
      for (let lifetime = 0; lifetime < 30; lifetime++) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);

        // Stop if out of bounds
        if (ix < 0 || ix >= width - 1 || iy < 0 || iy >= height - 1) break;

        // Calculate droplet's height and gradient
        const fx = x - ix;
        const fy = y - iy;

        const h00 = erodedMap[iy][ix];
        const h10 = erodedMap[iy][ix + 1];
        const h01 = erodedMap[iy + 1][ix];
        const h11 = erodedMap[iy + 1][ix + 1];

        const gradX = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
        const gradY = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;

        // Update direction and position
        dirX = dirX * inertia - gradX * (1 - inertia);
        dirY = dirY * inertia - gradY * (1 - inertia);

        // Check for NaN values
        if (isNaN(dirX) || isNaN(dirY)) break;

        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        if (len !== 0) {
          dirX /= len;
          dirY /= len;
        }

        x += dirX;
        y += dirY;

        // Check for NaN in position
        if (isNaN(x) || isNaN(y)) break;

        // Stop if new position is out of bounds or higher
        const nix = Math.floor(x);
        const niy = Math.floor(y);
        if (nix < 0 || nix >= width - 1 || niy < 0 || niy >= height - 1) break;

        const newHeight = erodedMap[niy][nix];
        const deltaHeight = newHeight - h00;

        // Calculate sediment capacity
        const sedimentCapacity = Math.max(-deltaHeight * speed * water * sedimentCapacityFactor, minSedimentCapacity);

        if (sediment > sedimentCapacity || deltaHeight > 0) {
          // Deposit sediment
          const amountToDeposit = (deltaHeight > 0) ?
            Math.min(deltaHeight, sediment) :
            (sediment - sedimentCapacity) * depositSpeed;

          sediment -= amountToDeposit;
          erodedMap[iy][ix] += amountToDeposit;
        } else {
          // Erode
          const amountToErode = Math.min((sedimentCapacity - sediment) * erodeSpeed, -deltaHeight);
          sediment += amountToErode;
          erodedMap[iy][ix] -= amountToErode;
        }

        speed = Math.sqrt(speed * speed + deltaHeight * gravity);
        water *= (1 - evaporateSpeed);
      }
    }

    return erodedMap;
  }

  /**
   * Generate vegetation distribution based on biomes
   * Returns a map of vegetation density (0-1) for each pixel
   * @param {number[][]} heightMap - The height map
   * @param {number[][]} moistureMap - The moisture map
   * @param {number[][]} temperatureMap - The temperature map
   * @returns {number[][]} Vegetation density map (0-1)
   */
  generateVegetation(heightMap, moistureMap, temperatureMap) {
    const { width, height } = this.config;
    const vegetationMap = Array(height).fill(0).map(() => Array(width).fill(0));

    // Use a seeded random for consistent vegetation placement
    let seed = this.config.seed + 3000;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const elevation = heightMap[y][x];
        const moisture = moistureMap ? moistureMap[y][x] : 0.5;
        const temperature = temperatureMap ? temperatureMap[y][x] : 0.5;

        // No vegetation in water or very high mountains
        if (elevation < 0.43 || elevation > 0.85) {
          vegetationMap[y][x] = 0;
          continue;
        }

        // Calculate base vegetation density based on moisture and temperature
        let density = 0;

        // Optimal conditions: moderate temperature, high moisture
        const tempFactor = 1 - Math.abs(temperature - 0.6) * 1.5;
        const moistureFactor = moisture;

        density = Math.max(0, Math.min(1, tempFactor * moistureFactor));

        // Add some randomness for natural variation
        const randomFactor = random() * 0.3 + 0.85;
        density *= randomFactor;

        // Reduce vegetation on steep slopes (approximate by checking neighbors)
        let steepness = 0;
        if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
          const dx = Math.abs(heightMap[y][x + 1] - heightMap[y][x - 1]);
          const dy = Math.abs(heightMap[y + 1][x] - heightMap[y - 1][x]);
          steepness = Math.sqrt(dx * dx + dy * dy);
        }
        density *= Math.max(0.2, 1 - steepness * 2);

        vegetationMap[y][x] = Math.max(0, Math.min(1, density));
      }
    }

    return vegetationMap;
  }

  /**
   * Generate settlement locations using Poisson disc sampling
   * @param {number[][]} heightMap - The height map
   * @param {number[][]} moistureMap - The moisture map (optional)
   * @param {number} minDistance - Minimum distance between settlements
   * @param {number} maxAttempts - Maximum attempts per sample
   * @returns {Array} Array of settlement positions {x, y, size}
   */
  generateSettlements(heightMap, moistureMap, minDistance = 30, maxAttempts = 30) {
    const { width, height } = this.config;
    const settlements = [];
    const cellSize = minDistance / Math.sqrt(2);
    const gridWidth = Math.ceil(width / cellSize);
    const gridHeight = Math.ceil(height / cellSize);
    const grid = Array(gridHeight).fill(null).map(() => Array(gridWidth).fill(null));

    // Seeded random
    let seed = this.config.seed + 4000;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    // Helper to check if a point is valid
    const isValidPoint = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return false;

      const elevation = heightMap[y][x];
      const moisture = moistureMap ? moistureMap[y][x] : 0.5;

      // Settlements prefer: flat land, near water but not in it, moderate elevation
      if (elevation < 0.45 || elevation > 0.7) return false;
      if (moisture < 0.3) return false; // Not too dry

      // Check distance to other settlements
      const gridX = Math.floor(x / cellSize);
      const gridY = Math.floor(y / cellSize);

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const gx = gridX + dx;
          const gy = gridY + dy;
          if (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight && grid[gy][gx]) {
            const other = grid[gy][gx];
            const dist = Math.sqrt((x - other.x) ** 2 + (y - other.y) ** 2);
            if (dist < minDistance) return false;
          }
        }
      }

      return true;
    };

    // Start with a random valid point
    let activeList = [];
    for (let attempts = 0; attempts < 100; attempts++) {
      const x = Math.floor(random() * width);
      const y = Math.floor(random() * height);
      if (isValidPoint(x, y)) {
        const size = Math.floor(random() * 3 + 2); // Size 2-4
        const settlement = { x, y, size };
        settlements.push(settlement);
        activeList.push(settlement);
        const gridX = Math.floor(x / cellSize);
        const gridY = Math.floor(y / cellSize);
        grid[gridY][gridX] = settlement;
        break;
      }
    }

    // Poisson disc sampling
    while (activeList.length > 0) {
      const index = Math.floor(random() * activeList.length);
      const point = activeList[index];
      let found = false;

      for (let i = 0; i < maxAttempts; i++) {
        const angle = random() * Math.PI * 2;
        const radius = minDistance + random() * minDistance;
        const x = Math.round(point.x + Math.cos(angle) * radius);
        const y = Math.round(point.y + Math.sin(angle) * radius);

        if (isValidPoint(x, y)) {
          const size = Math.floor(random() * 3 + 2);
          const settlement = { x, y, size };
          settlements.push(settlement);
          activeList.push(settlement);
          const gridX = Math.floor(x / cellSize);
          const gridY = Math.floor(y / cellSize);
          grid[gridY][gridX] = settlement;
          found = true;
          break;
        }
      }

      if (!found) {
        activeList.splice(index, 1);
      }
    }

    return settlements;
  }

  /**
   * Generate road network connecting settlements
   * Uses A* pathfinding with terrain cost
   * @param {number[][]} heightMap - The height map
   * @param {Array} settlements - Array of settlement positions
   * @returns {Array} Array of road segments {from: {x,y}, to: {x,y}, path: [{x,y}]}
   */
  generateRoads(heightMap, settlements) {
    if (settlements.length < 2) return [];

    const { width, height } = this.config;
    const roads = [];

    // A* pathfinding helper
    const findPath = (start, end) => {
      const openSet = [{ ...start, g: 0, h: this._heuristic(start, end), f: 0 }];
      const closedSet = new Set();
      const cameFrom = new Map();

      while (openSet.length > 0) {
        // Find node with lowest f score
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();

        const key = `${current.x},${current.y}`;
        if (current.x === end.x && current.y === end.y) {
          // Reconstruct path
          const path = [];
          let temp = current;
          while (temp) {
            path.unshift({ x: temp.x, y: temp.y });
            temp = cameFrom.get(`${temp.x},${temp.y}`);
          }
          return path;
        }

        closedSet.add(key);

        // Check neighbors (8-directional)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;

            const nx = current.x + dx;
            const ny = current.y + dy;
            const nkey = `${nx},${ny}`;

            if (nx < 0 || nx >= width || ny < 0 || ny >= height || closedSet.has(nkey)) continue;

            // Calculate terrain cost (prefer flat, low elevation terrain)
            const elevation = heightMap[ny][nx];
            if (elevation < 0.43) continue; // Don't cross water

            const elevationDiff = Math.abs(heightMap[ny][nx] - heightMap[current.y][current.x]);
            const moveCost = 1 + elevationDiff * 10; // Penalize elevation changes
            const isDiagonal = dx !== 0 && dy !== 0;
            const g = current.g + moveCost * (isDiagonal ? 1.414 : 1);

            const existing = openSet.find(n => n.x === nx && n.y === ny);
            if (existing && g >= existing.g) continue;

            const h = this._heuristic({ x: nx, y: ny }, end);
            const neighbor = { x: nx, y: ny, g, h, f: g + h };

            if (existing) {
              existing.g = g;
              existing.f = g + h;
            } else {
              openSet.push(neighbor);
            }
            cameFrom.set(nkey, current);
          }
        }
      }

      return null; // No path found
    };

    // Connect settlements with minimum spanning tree approach
    const connected = new Set([0]);
    const unconnected = new Set(settlements.map((_, i) => i).slice(1));

    while (unconnected.size > 0) {
      let shortestPath = null;
      let shortestDist = Infinity;
      let bestFrom = -1;
      let bestTo = -1;

      for (const from of connected) {
        for (const to of unconnected) {
          const dist = this._heuristic(settlements[from], settlements[to]);
          if (dist < shortestDist) {
            shortestDist = dist;
            bestFrom = from;
            bestTo = to;
          }
        }
      }

      if (bestFrom !== -1 && bestTo !== -1) {
        const path = findPath(settlements[bestFrom], settlements[bestTo]);
        if (path) {
          roads.push({
            from: settlements[bestFrom],
            to: settlements[bestTo],
            path
          });
        }
        connected.add(bestTo);
        unconnected.delete(bestTo);
      } else {
        break;
      }
    }

    return roads;
  }

  /**
   * Heuristic function for A* (Manhattan distance)
   * @private
   */
  _heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }
}

/**
 * Renderer for height maps to canvas
 */
export class TerrainRenderer {
  /**
   * Convert height value to terrain color
   * @param {number} height - Height value (0-1)
   * @param {Array} terrainTypes - Optional custom terrain types array
   * @returns {Object} RGB color object
   */
  static getTerrainColor(height, terrainTypes = null) {
    const types = terrainTypes || TERRAIN_TYPES;
    for (const terrain of types) {
      if (height < terrain.threshold) {
        return terrain.color;
      }
    }
    return types[types.length - 1].color;
  }

  /**
   * Render height map to canvas element
   * @param {HTMLCanvasElement} canvas - Target canvas element
   * @param {number[][]} heightMap - 2D array of height values
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @param {Array} terrainTypes - Optional custom terrain types for coloring
   */
  static render(canvas, heightMap, width, height, terrainTypes = null) {
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
        const color = TerrainRenderer.getTerrainColor(heightValue, terrainTypes);

        const idx = (y * width + x) * 4;
        imageData.data[idx] = color.r;
        imageData.data[idx + 1] = color.g;
        imageData.data[idx + 2] = color.b;
        imageData.data[idx + 3] = 255; // Alpha
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Render terrain with biome system
   * @param {HTMLCanvasElement} canvas - Target canvas element
   * @param {number[][]} heightMap - 2D array of height values
   * @param {number[][]} moistureMap - 2D array of moisture values
   * @param {number[][]} temperatureMap - 2D array of temperature values
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   */
  static renderWithBiomes(canvas, heightMap, moistureMap, temperatureMap, width, height) {
    if (!canvas) {
      throw new Error("Canvas element is required");
    }

    const ctx = canvas.getContext("2d");

    // Set canvas dimensions
    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);

    // Populate image data with biome colors
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const elevation = heightMap[y][x];
        const moisture = moistureMap[y][x];
        const temperature = temperatureMap[y][x];

        const biome = getBiome(elevation, moisture, temperature);
        const color = biome.color;

        const idx = (y * width + x) * 4;
        imageData.data[idx] = color.r;
        imageData.data[idx + 1] = color.g;
        imageData.data[idx + 2] = color.b;
        imageData.data[idx + 3] = 255; // Alpha
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Convert 2D coordinates to isometric 3D coordinates
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} z - Z coordinate (height)
   * @returns {Object} Isometric coordinates {isoX, isoY}
   */
  static toIsometric(x, y, z) {
    const isoX = (x - y);
    const isoY = (x + y) * 0.5 - z;
    return { isoX, isoY };
  }

  /**
   * Render terrain in 3D isometric view
   * @param {HTMLCanvasElement} canvas - Target canvas element
   * @param {number[][]} heightMap - 2D array of height values
   * @param {number} mapWidth - Map width
   * @param {number} mapHeight - Map height
   * @param {Array} terrainTypes - Terrain color types
   * @param {number} heightMultiplier - How much to exaggerate height
   */
  static render3D(canvas, heightMap, mapWidth, mapHeight, terrainTypes, heightMultiplier = 40) {
    if (!canvas) {
      throw new Error("Canvas element is required");
    }

    const ctx = canvas.getContext("2d");
    const tileWidth = 2;
    const tileHeight = 1;

    // Calculate canvas size needed for isometric view
    const canvasWidth = (mapWidth + mapHeight) * tileWidth + 200;
    const canvasHeight = (mapWidth + mapHeight) * tileHeight + heightMultiplier + 150;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Clear canvas with sky color
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Center the terrain horizontally
    const offsetX = canvasWidth / 2 - (mapWidth - mapHeight) * tileWidth / 2;
    const offsetY = 100;

    // Render from back to front for proper occlusion
    for (let y = mapHeight - 1; y >= 0; y--) {
      for (let x = 0; x < mapWidth; x++) {
        const heightValue = heightMap[y][x];
        const z = heightValue * heightMultiplier;

        const color = TerrainRenderer.getTerrainColor(heightValue, terrainTypes);

        // Calculate isometric position
        const iso = TerrainRenderer.toIsometric(x * tileWidth, y * tileHeight, z);
        const screenX = iso.isoX + offsetX;
        const screenY = iso.isoY + offsetY;

        // Draw tile as a diamond
        ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX + tileWidth, screenY + tileHeight);
        ctx.lineTo(screenX, screenY + tileHeight * 2);
        ctx.lineTo(screenX - tileWidth, screenY + tileHeight);
        ctx.closePath();
        ctx.fill();

        // Add shading for depth
        if (heightValue > 0.4) {
          ctx.strokeStyle = `rgba(0, 0, 0, 0.2)`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  /**
   * Render terrain in 3D isometric view with biomes
   * @param {HTMLCanvasElement} canvas - Target canvas element
   * @param {number[][]} heightMap - 2D array of height values
   * @param {number[][]} moistureMap - 2D array of moisture values
   * @param {number[][]} temperatureMap - 2D array of temperature values
   * @param {number} mapWidth - Map width
   * @param {number} mapHeight - Map height
   * @param {number} heightMultiplier - How much to exaggerate height
   */
  static render3DWithBiomes(canvas, heightMap, moistureMap, temperatureMap, mapWidth, mapHeight, heightMultiplier = 40) {
    if (!canvas) {
      throw new Error("Canvas element is required");
    }

    const ctx = canvas.getContext("2d");
    const tileWidth = 2;
    const tileHeight = 1;

    // Calculate canvas size needed for isometric view
    const canvasWidth = (mapWidth + mapHeight) * tileWidth + 200;
    const canvasHeight = (mapWidth + mapHeight) * tileHeight + heightMultiplier + 150;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Clear canvas with sky color
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Center the terrain horizontally
    const offsetX = canvasWidth / 2 - (mapWidth - mapHeight) * tileWidth / 2;
    const offsetY = 100;

    // Render from back to front for proper occlusion
    for (let y = mapHeight - 1; y >= 0; y--) {
      for (let x = 0; x < mapWidth; x++) {
        const elevation = heightMap[y][x];
        const moisture = moistureMap[y][x];
        const temperature = temperatureMap[y][x];
        const z = elevation * heightMultiplier;

        const biome = getBiome(elevation, moisture, temperature);
        const color = biome.color;

        // Calculate isometric position
        const iso = TerrainRenderer.toIsometric(x * tileWidth, y * tileHeight, z);
        const screenX = iso.isoX + offsetX;
        const screenY = iso.isoY + offsetY;

        // Draw tile as a diamond
        ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX + tileWidth, screenY + tileHeight);
        ctx.lineTo(screenX, screenY + tileHeight * 2);
        ctx.lineTo(screenX - tileWidth, screenY + tileHeight);
        ctx.closePath();
        ctx.fill();

        // Add shading for depth
        if (elevation > 0.4) {
          ctx.strokeStyle = `rgba(0, 0, 0, 0.2)`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }
}
