/**
 * Application layer for the terrain generation UI
 */

import { HeightMapGenerator, TerrainRenderer } from "./terrain-generator.js";

/**
 * Terrain Generation Application
 * Manages the UI and coordinates between generation and rendering
 */
export class TerrainApp {
  constructor(Component, vdom, config = {}) {
    this.Component = Component;
    this.vdom = vdom;
    this.config = {
      width: 600,
      height: 400,
      scale: 0.015,
      octaves: 5,
      persistence: 0.5,
      ...config,
    };
    this.generator = new HeightMapGenerator(this.config);
    this.currentSeed = this.generator.config.seed;
  }

  /**
   * Create the Arlo component for the UI
   * @returns {Component} Arlo component instance
   */
  createComponent() {
    const self = this;

    class TerrainComponent extends self.Component {
      init() {
        this.app = self;
      }

      compose() {
        return self.vdom`
          <div>
            ${this._renderControls()}
            ${this._renderCanvas()}
            ${this._renderInfo()}
          </div>
        `;
      }

      _renderControls() {
        return self.vdom`
          <div style=${{
            marginBottom: "20px",
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}>
            <button onclick=${() => this.regenerate()}>
              Regenerate Terrain
            </button>
            <input
              type="number"
              placeholder="Seed (optional)"
              style=${{ width: "150px" }}
              value=${this.app.currentSeed}
              oninput=${(e) => {
                this.app.currentSeed = e.target.value;
              }}
            />
          </div>
        `;
      }

      _renderCanvas() {
        return self.vdom`
          <canvas
            width=${this.app.config.width}
            height=${this.app.config.height}
            style=${{
              border: "1px solid #ccc",
              display: "block",
              imageRendering: "pixelated",
              maxWidth: "100%",
              height: "auto",
            }}
          ></canvas>
        `;
      }

      _renderInfo() {
        return self.vdom`
          <div style=${{ marginTop: "20px" }}>
            <h3>How it works:</h3>
            <ul>
              <li><strong>Noise Generation:</strong> Uses a simplified Perlin-like noise algorithm</li>
              <li><strong>Fractal Brownian Motion (FBM):</strong> Layers multiple octaves of noise for natural-looking terrain</li>
              <li><strong>Height Mapping:</strong> Each pixel's height determines its color (water, land, mountains, snow)</li>
              <li><strong>Seeded Random:</strong> Same seed produces same terrain (reproducibility)</li>
            </ul>
          </div>
        `;
      }

      regenerate() {
        const seed = this.app.currentSeed ? parseInt(this.app.currentSeed) : Date.now();
        this.app.generate(seed, this.node);
      }
    }

    return new TerrainComponent();
  }

  /**
   * Generate and render terrain
   * @param {number} seed - Random seed
   * @param {HTMLElement} containerNode - Container DOM node
   */
  generate(seed, containerNode) {
    // Update generator with new seed
    this.generator.setSeed(seed);
    this.currentSeed = this.generator.config.seed;

    // Generate height map
    const heightMap = this.generator.generate();

    // Find canvas and render
    const canvas = containerNode.querySelector("canvas");
    if (canvas) {
      // Use setTimeout to ensure rendering happens after any DOM updates
      setTimeout(() => {
        TerrainRenderer.render(canvas, heightMap, this.config.width, this.config.height);

        // Update seed input field
        const seedInput = containerNode.querySelector('input[type="number"]');
        if (seedInput) {
          seedInput.value = this.currentSeed;
        }
      }, 0);
    }
  }
}
