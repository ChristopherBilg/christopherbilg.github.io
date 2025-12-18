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
      noiseType: 'perlin',
      useDomainWarping: false,
      warpStrength: 0.3,
      useBiomes: false,
      moistureScale: 0.01,
      temperatureScale: 0.008,
      view3D: false,
      heightMultiplier: 40,
      animateGeneration: false,
      season: 'spring',
      timeOfDay: 0.5, // 0 = midnight, 0.5 = noon, 1 = midnight
      showMinimap: false,
      zoom: 1.0,
      panX: 0,
      panY: 0,
      useWebWorker: false, // Performance: offload to worker
      useProgressiveRendering: false, // Performance: render in chunks
      // Advanced terrain features
      showRivers: false,
      riverThreshold: 100, // Flow accumulation threshold for rivers
      useErosion: false,
      erosionIterations: 20000,
      erosionStrength: 0.3,
      showVegetation: false,
      showSettlements: false,
      settlementMinDistance: 40,
      showRoads: false,
      ...config,
    };
    this.generator = new HeightMapGenerator(this.config);
    this.currentSeed = this.generator.config.seed;
    // Set default realistic theme
    this.currentTheme = [
      { threshold: 0.3, name: "deep_water", color: { r: 0, g: 50, b: 150 } },
      { threshold: 0.4, name: "shallow_water", color: { r: 50, g: 100, b: 200 } },
      { threshold: 0.45, name: "beach", color: { r: 210, g: 180, b: 140 } },
      { threshold: 0.6, name: "grass", color: { r: 50, g: 150, b: 50 } },
      { threshold: 0.75, name: "hills", color: { r: 34, g: 100, b: 34 } },
      { threshold: 0.85, name: "mountains", color: { r: 100, g: 100, b: 100 } },
      { threshold: Infinity, name: "snow", color: { r: 240, g: 240, b: 240 } },
    ];
    this.animationFrame = null; // For animation tracking
    // Store terrain data for minimap and navigation
    this.cachedHeightMap = null;
    this.cachedMoistureMap = null;
    this.cachedTemperatureMap = null;
    this.cachedRiverMap = null;
    this.cachedVegetationMap = null;
    this.cachedSettlements = null;
    this.cachedRoads = null;
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    // Performance optimization: Web Worker
    this.worker = null;
    this.workerSupported = typeof Worker !== 'undefined';
  }

  /**
   * Initialize Web Worker for terrain generation
   * @private
   */
  initWebWorker() {
    if (!this.workerSupported) return;

    try {
      this.worker = new Worker('./terrain-worker.js', { type: 'module' });
      console.log('Web Worker initialized for terrain generation');
    } catch (error) {
      console.error('Failed to initialize Web Worker:', error);
      this.config.useWebWorker = false;
    }
  }

  /**
   * Cleanup Web Worker
   * @private
   */
  terminateWebWorker() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      console.log('Web Worker terminated');
    }
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
            ${this._renderCanvasContainer()}
            ${this._renderInfo()}
          </div>
        `;
      }

      _renderControls() {
        return self.vdom`
          <div style=${{
            marginBottom: "20px",
          }}>
            ${this._renderMainControls()}
            ${this._renderVisualizationControls()}
            ${this._renderAnimationControls()}
            ${this._renderExportControls()}
            ${this._renderParameterSliders()}
          </div>
        `;
      }

      _renderMainControls() {
        return self.vdom`
          <div style=${{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            marginBottom: "15px",
            padding: "15px",
            backgroundColor: "#f0f8ff",
            borderRadius: "8px",
            flexWrap: "wrap",
          }}>
            <strong style=${{ marginRight: "10px" }}>Generation:</strong>
            <button
              onclick=${() => this.regenerate()}
              style=${{
                padding: "8px 16px",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              Regenerate
            </button>
            <label style=${{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Seed:</span>
              <input
                type="number"
                placeholder="Random"
                style=${{ width: "120px", padding: "6px" }}
                value=${this.app.currentSeed}
                oninput=${(e) => {
                  this.app.currentSeed = e.target.value;
                }}
              />
            </label>
            <label style=${{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Noise Type:</span>
              <select
                onchange=${(e) => this.changeNoiseType(e.target.value)}
                style=${{ padding: "6px" }}
              >
                <option value="perlin">Perlin</option>
                <option value="simplex">Simplex</option>
                <option value="voronoi">Voronoi</option>
              </select>
            </label>
            <label style=${{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Theme:</span>
              <select
                id="theme-select"
                onchange=${(e) => this.applyColorTheme(e.target.value)}
                style=${{ padding: "6px" }}
              >
                <option value="realistic">Realistic</option>
                <option value="fantasy">Fantasy</option>
                <option value="alien">Alien</option>
              </select>
            </label>
          </div>
        `;
      }

      _renderVisualizationControls() {
        return self.vdom`
          <div>
            <details style=${{
              marginBottom: "15px",
              padding: "12px 15px",
              backgroundColor: "#fff5e6",
              borderRadius: "8px",
            }}>
              <summary style=${{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                ⚙️ Visualization Options
              </summary>
              <div style=${{
                display: "flex",
                gap: "15px",
                alignItems: "center",
                marginTop: "10px",
                flexWrap: "wrap",
              }}>
                <label style=${{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    onchange=${(e) => this.toggleDomainWarping(e.target.checked)}
                  />
                  <span>Domain Warp</span>
                </label>
                <label style=${{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    onchange=${(e) => this.toggleBiomes(e.target.checked)}
                  />
                  <span>Biomes</span>
                </label>
                <label style=${{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked=${this.app.config.view3D}
                    onchange=${(e) => this.toggle3DView(e.target.checked)}
                  />
                  <span>3D View</span>
                </label>
                <label style=${{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked=${this.app.config.showMinimap}
                    onchange=${(e) => this.toggleMinimap(e.target.checked)}
                  />
                  <span>Show Minimap</span>
                </label>
              </div>
            </details>

            <details style=${{
              marginBottom: "15px",
              padding: "12px 15px",
              backgroundColor: "#ffe6f0",
              borderRadius: "8px",
            }}>
              <summary style=${{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                ⚡ Performance Options
              </summary>
              <div style=${{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
                ${this.app.workerSupported ? self.vdom`
                  <label style=${{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked=${this.app.config.useWebWorker}
                      onchange=${(e) => this.toggleWebWorker(e.target.checked)}
                    />
                    <span>Use Web Worker (offload to background thread)</span>
                  </label>
                ` : self.vdom`<div style=${{ color: "#999" }}>Web Workers not supported in this browser</div>`}
                <label style=${{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked=${this.app.config.useProgressiveRendering}
                    onchange=${(e) => this.toggleProgressiveRendering(e.target.checked)}
                  />
                  <span>Progressive Rendering (render in chunks)</span>
                </label>
              </div>
            </details>

            <details style=${{
              marginBottom: "15px",
              padding: "12px 15px",
              backgroundColor: "#e6f7ff",
              borderRadius: "8px",
            }}>
              <summary style=${{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                🏞️ Advanced Terrain Features
              </summary>
            <div style=${{ display: "flex", flexDirection: "column", gap: "12px" }}>

              <div>
                <label style=${{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", marginBottom: "8px" }}>
                  <input
                    type="checkbox"
                    checked=${this.app.config.showRivers}
                    onchange=${(e) => this.toggleRivers(e.target.checked)}
                  />
                  <span style=${{ fontWeight: "bold" }}>Show Rivers (flow accumulation)</span>
                </label>
                ${this.app.config.showRivers ? self.vdom`
                  <div style=${{ marginLeft: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label style=${{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span>River Threshold: ${this.app.config.riverThreshold}</span>
                      <input
                        type="range"
                        min="50"
                        max="500"
                        step="10"
                        value=${this.app.config.riverThreshold}
                        oninput=${(e) => this.updateRiverThreshold(parseInt(e.target.value))}
                        style=${{ width: "100%" }}
                      />
                    </label>
                  </div>
                ` : ''}
              </div>

              <div>
                <label style=${{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", marginBottom: "8px" }}>
                  <input
                    type="checkbox"
                    checked=${this.app.config.useErosion}
                    onchange=${(e) => this.toggleErosion(e.target.checked)}
                  />
                  <span style=${{ fontWeight: "bold" }}>Apply Hydraulic Erosion</span>
                </label>
                ${this.app.config.useErosion ? self.vdom`
                  <div style=${{ marginLeft: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label style=${{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span>Erosion Iterations: ${this.app.config.erosionIterations}</span>
                      <input
                        type="range"
                        min="5000"
                        max="50000"
                        step="5000"
                        value=${this.app.config.erosionIterations}
                        oninput=${(e) => this.updateErosionIterations(parseInt(e.target.value))}
                        style=${{ width: "100%" }}
                      />
                    </label>
                    <label style=${{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span>Erosion Strength: ${this.app.config.erosionStrength.toFixed(2)}</span>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.1"
                        value=${this.app.config.erosionStrength}
                        oninput=${(e) => this.updateErosionStrength(parseFloat(e.target.value))}
                        style=${{ width: "100%" }}
                      />
                    </label>
                  </div>
                ` : ''}
              </div>

              <div>
                <label style=${{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked=${this.app.config.showVegetation}
                    onchange=${(e) => this.toggleVegetation(e.target.checked)}
                  />
                  <span style=${{ fontWeight: "bold" }}>Show Vegetation (biome-based)</span>
                </label>
              </div>

              <div>
                <label style=${{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", marginBottom: "8px" }}>
                  <input
                    type="checkbox"
                    checked=${this.app.config.showSettlements}
                    onchange=${(e) => this.toggleSettlements(e.target.checked)}
                  />
                  <span style=${{ fontWeight: "bold" }}>Show Settlements (Poisson disc)</span>
                </label>
                ${this.app.config.showSettlements ? self.vdom`
                  <div style=${{ marginLeft: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label style=${{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span>Settlement Spacing: ${this.app.config.settlementMinDistance}</span>
                      <input
                        type="range"
                        min="20"
                        max="80"
                        step="10"
                        value=${this.app.config.settlementMinDistance}
                        oninput=${(e) => this.updateSettlementSpacing(parseInt(e.target.value))}
                        style=${{ width: "100%" }}
                      />
                    </label>
                  </div>
                ` : ''}
              </div>

              <div>
                <label style=${{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked=${this.app.config.showRoads}
                    onchange=${(e) => this.toggleRoads(e.target.checked)}
                    disabled=${!this.app.config.showSettlements}
                  />
                  <span style=${{ fontWeight: "bold" }}>Show Roads (A* pathfinding)</span>
                </label>
                ${!this.app.config.showSettlements ? self.vdom`
                  <div style=${{ marginLeft: "24px", color: "#999", fontSize: "0.9em" }}>
                    (Enable settlements first)
                  </div>
                ` : ''}
              </div>

            </div>
            </details>
          </div>
        `;
      }

      _renderAnimationControls() {
        return self.vdom`
          <details style=${{
            marginBottom: "15px",
            padding: "12px 15px",
            backgroundColor: "#f0ffe6",
            borderRadius: "8px",
          }}>
            <summary style=${{
              cursor: "pointer",
              fontWeight: "bold",
              marginBottom: "10px",
            }}>
              🎬 Animation and Time
            </summary>
            <div style=${{
              display: "flex",
              flexDirection: "column",
              gap: "15px",
            }}>
              <label style=${{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  onchange=${(e) => this.toggleAnimatedGeneration(e.target.checked)}
                />
                <span>Animate Generation</span>
              </label>

              <div style=${{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style=${{ fontWeight: "bold" }}>Season:</label>
                <div style=${{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <label style=${{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <input type="radio" name="season" value="spring" checked=${this.app.config.season === 'spring'} onchange=${(e) => this.changeSeason(e.target.value)} />
                    <span>Spring</span>
                  </label>
                  <label style=${{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <input type="radio" name="season" value="summer" checked=${this.app.config.season === 'summer'} onchange=${(e) => this.changeSeason(e.target.value)} />
                    <span>Summer</span>
                  </label>
                  <label style=${{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <input type="radio" name="season" value="fall" checked=${this.app.config.season === 'fall'} onchange=${(e) => this.changeSeason(e.target.value)} />
                    <span>Fall</span>
                  </label>
                  <label style=${{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <input type="radio" name="season" value="winter" checked=${this.app.config.season === 'winter'} onchange=${(e) => this.changeSeason(e.target.value)} />
                    <span>Winter</span>
                  </label>
                </div>
              </div>

              <div style=${{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style=${{ fontWeight: "bold" }}>
                  Time of Day: <span id="time-of-day-label">${this._formatTimeOfDay(this.app.config.timeOfDay)}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value=${this.app.config.timeOfDay}
                  style=${{ width: "100%" }}
                  oninput=${(e) => {
                    const val = parseFloat(e.target.value);
                    this.app.config.timeOfDay = val;
                    this.node.querySelector("#time-of-day-label").textContent = this._formatTimeOfDay(val);
                    this.applyTimeOfDay();
                  }}
                />
              </div>

              ${this.app.config.showMinimap ? this._renderZoomControls() : ""}
            </div>
          </details>
        `;
      }

      _renderZoomControls() {
        return self.vdom`
          <div style=${{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style=${{ fontWeight: "bold" }}>
              Zoom: <span>${this.app.config.zoom.toFixed(1)}x</span>
            </label>
            <div style=${{ display: "flex", gap: "8px" }}>
              <button
                onclick=${() => this.zoomIn()}
                style=${{
                  flex: "1",
                  padding: "6px 12px",
                  cursor: "pointer",
                  backgroundColor: "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                }}
                disabled=${this.app.config.zoom >= 5}
              >
                Zoom In (+)
              </button>
              <button
                onclick=${() => this.zoomOut()}
                style=${{
                  flex: "1",
                  padding: "6px 12px",
                  cursor: "pointer",
                  backgroundColor: "#2196F3",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                }}
                disabled=${this.app.config.zoom <= 1}
              >
                Zoom Out (-)
              </button>
              <button
                onclick=${() => this.resetZoom()}
                style=${{
                  flex: "1",
                  padding: "6px 12px",
                  cursor: "pointer",
                  backgroundColor: "#757575",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                }}
                disabled=${this.app.config.zoom === 1}
              >
                Reset
              </button>
            </div>
          </div>
        `;
      }

      _renderExportControls() {
        return self.vdom`
          <details style=${{
            marginBottom: "15px",
            padding: "12px 15px",
            backgroundColor: "#e8f4f8",
            borderRadius: "8px",
          }}>
            <summary style=${{
              cursor: "pointer",
              fontWeight: "bold",
              marginBottom: "10px",
            }}>
              📤 Export and Share
            </summary>
            <div style=${{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}>
              <div style=${{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "10px",
              }}>
                <button
                  onclick=${() => this.exportAsPNG()}
                  style=${{
                    padding: "8px 12px",
                    cursor: "pointer",
                    backgroundColor: "#fff",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                  }}
                >
                  Save as PNG
                </button>
                <button
                  onclick=${() => this.exportConfig()}
                  style=${{
                    padding: "8px 12px",
                    cursor: "pointer",
                    backgroundColor: "#fff",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                  }}
                >
                  Export Config
                </button>
                <button
                  onclick=${() => this.copyShareableLink()}
                  style=${{
                    padding: "8px 12px",
                    cursor: "pointer",
                    backgroundColor: "#fff",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                  }}
                >
                  Copy Share Link
                </button>
                <button
                  onclick=${() => this.toggleImportArea()}
                  style=${{
                    padding: "8px 12px",
                    cursor: "pointer",
                    backgroundColor: "#fff",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                  }}
                >
                  Import Config
                </button>
              </div>
              <div id="import-config-container" style=${{ display: "none" }}>
                <textarea
                  id="import-config-area"
                  placeholder="Paste config JSON here..."
                  style=${{
                    width: "100%",
                    minHeight: "80px",
                    resize: "vertical",
                    padding: "8px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    borderRadius: "4px",
                    border: "1px solid #999",
                    boxSizing: "border-box",
                  }}
                ></textarea>
                <div style=${{
                  display: "flex",
                  gap: "8px",
                  marginTop: "8px",
                }}>
                  <button
                    onclick=${() => this.applyImportedConfig()}
                    style=${{
                      padding: "6px 12px",
                      cursor: "pointer",
                      backgroundColor: "#4CAF50",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      fontWeight: "bold",
                    }}
                  >
                    Apply
                  </button>
                  <button
                    onclick=${() => this.cancelImport()}
                    style=${{
                      padding: "6px 12px",
                      cursor: "pointer",
                      backgroundColor: "#f44336",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </details>
        `;
      }

      _renderParameterSliders() {
        return self.vdom`
          <details style=${{
            marginBottom: "15px",
            padding: "12px 15px",
            backgroundColor: "#f5f5f5",
            borderRadius: "8px",
          }}>
            <summary style=${{
              cursor: "pointer",
              fontWeight: "bold",
              marginBottom: "10px",
            }}>
              ⚙️ Advanced Parameters
            </summary>
            <div style=${{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "15px",
            }}>
              ${this._renderSlider("Scale", "scale", 0.001, 0.05, 0.001, this.app.config.scale)}
              ${this._renderSlider("Octaves", "octaves", 1, 8, 1, this.app.config.octaves)}
              ${this._renderSlider("Persistence", "persistence", 0.1, 1.0, 0.1, this.app.config.persistence)}
              ${this._renderSlider("Warp Strength", "warpStrength", 0.0, 1.0, 0.05, this.app.config.warpStrength)}
              ${this._renderSlider("Height Multiplier", "heightMultiplier", 10, 100, 5, this.app.config.heightMultiplier)}
              ${this._renderSlider("Width", "width", 200, 1200, 50, this.app.config.width)}
              ${this._renderSlider("Height", "height", 200, 800, 50, this.app.config.height)}
            </div>
          </details>
        `;
      }

      _renderSlider(label, param, min, max, step, value) {
        return self.vdom`
          <div>
            <label style=${{ display: "block", marginBottom: "5px", fontWeight: "bold", fontSize: "14px" }}>
              ${label}: <span id="${param}-value">${value}</span>
            </label>
            <input
              type="range"
              min=${min}
              max=${max}
              step=${step}
              value=${value}
              style=${{ width: "100%" }}
              oninput=${(e) => {
                const val = param === "octaves" ? parseInt(e.target.value) : parseFloat(e.target.value);
                this.app.config[param] = val;
                this.node.querySelector("#" + param + "-value").textContent = val;
                this.regenerate();
              }}
            />
          </div>
        `;
      }

      applyColorTheme(theme) {
        const themes = {
          realistic: [
            { threshold: 0.3, name: "deep_water", color: { r: 0, g: 50, b: 150 } },
            { threshold: 0.4, name: "shallow_water", color: { r: 50, g: 100, b: 200 } },
            { threshold: 0.45, name: "beach", color: { r: 210, g: 180, b: 140 } },
            { threshold: 0.6, name: "grass", color: { r: 50, g: 150, b: 50 } },
            { threshold: 0.75, name: "hills", color: { r: 34, g: 100, b: 34 } },
            { threshold: 0.85, name: "mountains", color: { r: 100, g: 100, b: 100 } },
            { threshold: Infinity, name: "snow", color: { r: 240, g: 240, b: 240 } },
          ],
          fantasy: [
            { threshold: 0.3, name: "deep_water", color: { r: 75, g: 0, b: 130 } },
            { threshold: 0.4, name: "shallow_water", color: { r: 138, g: 43, b: 226 } },
            { threshold: 0.45, name: "beach", color: { r: 255, g: 215, b: 0 } },
            { threshold: 0.6, name: "grass", color: { r: 50, g: 205, b: 50 } },
            { threshold: 0.75, name: "hills", color: { r: 34, g: 139, b: 34 } },
            { threshold: 0.85, name: "mountains", color: { r: 139, g: 0, b: 139 } },
            { threshold: Infinity, name: "snow", color: { r: 255, g: 182, b: 193 } },
          ],
          alien: [
            { threshold: 0.3, name: "deep_water", color: { r: 0, g: 100, b: 0 } },
            { threshold: 0.4, name: "shallow_water", color: { r: 0, g: 150, b: 0 } },
            { threshold: 0.45, name: "beach", color: { r: 255, g: 140, b: 0 } },
            { threshold: 0.6, name: "grass", color: { r: 255, g: 69, b: 0 } },
            { threshold: 0.75, name: "hills", color: { r: 178, g: 34, b: 34 } },
            { threshold: 0.85, name: "mountains", color: { r: 128, g: 0, b: 128 } },
            { threshold: Infinity, name: "snow", color: { r: 255, g: 255, b: 0 } },
          ],
        };

        if (themes[theme]) {
          this.app.currentTheme = themes[theme];
          this.regenerate();
        }
      }

      changeNoiseType(noiseType) {
        this.app.config.noiseType = noiseType;
        this.app.generator.setNoiseType(noiseType);
        this.regenerate();
      }

      toggleDomainWarping(enabled) {
        this.app.config.useDomainWarping = enabled;
        this.regenerate();
      }

      toggleBiomes(enabled) {
        this.app.config.useBiomes = enabled;

        // Update theme selector state
        const themeSelect = this.node.querySelector("#theme-select");
        if (themeSelect) {
          themeSelect.disabled = enabled;
          themeSelect.style.opacity = enabled ? "0.5" : "1";
          themeSelect.style.cursor = enabled ? "not-allowed" : "pointer";
        }

        this.regenerate();
      }

      toggle3DView(enabled) {
        this.app.config.view3D = enabled;
        this.regenerate();
      }

      toggleMinimap(enabled) {
        this.app.config.showMinimap = enabled;
        this.render();
        if (enabled) {
          // Render minimap after rerender
          setTimeout(() => this.updateMinimap(), 50);
        }
      }

      toggleWebWorker(enabled) {
        this.app.config.useWebWorker = enabled;
        if (enabled && this.app.workerSupported) {
          // Initialize worker if not already done
          if (!this.app.worker) {
            this.app.initWebWorker();
          }
        }
        // No need to regenerate, will be used on next generation
      }

      toggleProgressiveRendering(enabled) {
        this.app.config.useProgressiveRendering = enabled;
        // No need to regenerate, will be used on next generation
      }

      toggleRivers(enabled) {
        this.app.config.showRivers = enabled;
        this.regenerate();
      }

      updateRiverThreshold(value) {
        this.app.config.riverThreshold = value;
        this.render();
        this.regenerate();
      }

      toggleErosion(enabled) {
        this.app.config.useErosion = enabled;
        this.regenerate();
      }

      updateErosionIterations(value) {
        this.app.config.erosionIterations = value;
        this.render();
      }

      updateErosionStrength(value) {
        this.app.config.erosionStrength = value;
        this.render();
      }

      toggleVegetation(enabled) {
        this.app.config.showVegetation = enabled;
        this.regenerate();
      }

      toggleSettlements(enabled) {
        this.app.config.showSettlements = enabled;
        if (!enabled) {
          this.app.config.showRoads = false;
        }
        this.render(); // Re-render UI to update roads checkbox state
        this.regenerate();
      }

      updateSettlementSpacing(value) {
        this.app.config.settlementMinDistance = value;
        this.render();
        this.regenerate();
      }

      toggleRoads(enabled) {
        this.app.config.showRoads = enabled;
        this.regenerate();
      }

      startPan(e) {
        if (!this.app.config.showMinimap || this.app.config.zoom <= 1) return;
        this.app.isDragging = true;
        this.app.lastMouseX = e.clientX;
        this.app.lastMouseY = e.clientY;
        e.preventDefault();
      }

      doPan(e) {
        if (!this.app.isDragging) return;

        const dx = e.clientX - this.app.lastMouseX;
        const dy = e.clientY - this.app.lastMouseY;

        // Pan amount should be in screen pixels (not affected by zoom division)
        this.app.config.panX += dx;
        this.app.config.panY += dy;

        this.app.lastMouseX = e.clientX;
        this.app.lastMouseY = e.clientY;

        this.render();
        setTimeout(() => this.updateMinimapViewport(), 10);
      }

      endPan() {
        this.app.isDragging = false;
      }

      handleZoom(e) {
        if (!this.app.config.showMinimap) return;

        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(1, Math.min(5, this.app.config.zoom * delta));

        if (newZoom === 1) {
          this.app.config.panX = 0;
          this.app.config.panY = 0;
        }

        this.app.config.zoom = newZoom;
        this.render();
        setTimeout(() => this.updateMinimapViewport(), 10);
      }

      clickMinimap(e) {
        const canvas = e.target;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;

        // Center the viewport at the clicked position
        const viewportWidth = 1 / this.app.config.zoom;
        const viewportHeight = 1 / this.app.config.zoom;

        this.app.config.panX = -(x - viewportWidth / 2) * this.app.config.width;
        this.app.config.panY = -(y - viewportHeight / 2) * this.app.config.height;

        this.render();
        setTimeout(() => this.updateMinimapViewport(), 10);
      }

      updateMinimap() {
        const minimapCanvas = this.node.querySelector("#minimap-canvas");
        if (!minimapCanvas || !this.app.cachedHeightMap) return;

        const ctx = minimapCanvas.getContext("2d");
        const width = minimapCanvas.width;
        const height = minimapCanvas.height;

        // Scale down the main canvas to minimap size
        const mainCanvas = this.node.querySelector("#main-canvas");
        if (mainCanvas) {
          ctx.drawImage(mainCanvas, 0, 0, width, height);
        }

        // Draw viewport indicator if zoomed in
        if (this.app.config.zoom > 1) {
          const viewportWidth = width / this.app.config.zoom;
          const viewportHeight = height / this.app.config.zoom;
          const viewportX = -(this.app.config.panX / this.app.config.width) * width;
          const viewportY = -(this.app.config.panY / this.app.config.height) * height;

          ctx.strokeStyle = "rgba(255, 255, 0, 0.9)";
          ctx.lineWidth = 2;
          ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);
        }
      }

      updateMinimapViewport() {
        // Just redraw the entire minimap (which includes the viewport indicator)
        this.updateMinimap();
      }

      zoomIn() {
        this.app.config.zoom = Math.min(5, this.app.config.zoom + 0.5);
        this.render();
        setTimeout(() => this.updateMinimapViewport(), 10);
      }

      zoomOut() {
        this.app.config.zoom = Math.max(1, this.app.config.zoom - 0.5);
        if (this.app.config.zoom === 1) {
          this.app.config.panX = 0;
          this.app.config.panY = 0;
        }
        this.render();
        setTimeout(() => this.updateMinimapViewport(), 10);
      }

      resetZoom() {
        this.app.config.zoom = 1;
        this.app.config.panX = 0;
        this.app.config.panY = 0;
        this.render();
        setTimeout(() => this.updateMinimap(), 10);
      }

      toggleAnimatedGeneration(enabled) {
        this.app.config.animateGeneration = enabled;
        if (enabled) {
          this.regenerateAnimated();
        } else {
          this.regenerate();
        }
      }

      changeSeason(season) {
        this.app.config.season = season;
        this.regenerate();
      }

      applyTimeOfDay() {
        // Instantly re-render with time of day lighting
        this.regenerate();
      }

      _formatTimeOfDay(value) {
        const hours = value * 24;
        const h = Math.floor(hours);
        const m = Math.floor((hours - h) * 60);
        const period = h >= 12 ? 'PM' : 'AM';
        const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
      }

      exportAsPNG() {
        const canvas = this.node.querySelector("canvas");
        if (!canvas) return;

        // Create a download link
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.download = `terrain-${this.app.currentSeed}.png`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
        });
      }

      exportConfig() {
        const config = {
          seed: this.app.currentSeed,
          width: this.app.config.width,
          height: this.app.config.height,
          scale: this.app.config.scale,
          octaves: this.app.config.octaves,
          persistence: this.app.config.persistence,
          noiseType: this.app.config.noiseType,
          useDomainWarping: this.app.config.useDomainWarping,
          warpStrength: this.app.config.warpStrength,
          useBiomes: this.app.config.useBiomes,
          moistureScale: this.app.config.moistureScale,
          temperatureScale: this.app.config.temperatureScale,
          view3D: this.app.config.view3D,
          heightMultiplier: this.app.config.heightMultiplier,
          theme: this._getCurrentThemeName(),
          // Advanced terrain features
          showRivers: this.app.config.showRivers,
          riverThreshold: this.app.config.riverThreshold,
          useErosion: this.app.config.useErosion,
          erosionIterations: this.app.config.erosionIterations,
          erosionStrength: this.app.config.erosionStrength,
          showVegetation: this.app.config.showVegetation,
          showSettlements: this.app.config.showSettlements,
          settlementMinDistance: this.app.config.settlementMinDistance,
          showRoads: this.app.config.showRoads,
          // Visualization
          season: this.app.config.season,
          timeOfDay: this.app.config.timeOfDay,
          showMinimap: this.app.config.showMinimap,
          zoom: this.app.config.zoom,
          panX: this.app.config.panX,
          panY: this.app.config.panY,
          // Performance options
          useWebWorker: this.app.config.useWebWorker,
          useProgressiveRendering: this.app.config.useProgressiveRendering,
        };

        const json = JSON.stringify(config, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `terrain-config-${this.app.currentSeed}.json`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      }

      copyShareableLink() {
        const config = {
          seed: this.app.currentSeed,
          width: this.app.config.width,
          height: this.app.config.height,
          scale: this.app.config.scale,
          octaves: this.app.config.octaves,
          persistence: this.app.config.persistence,
          noiseType: this.app.config.noiseType,
          useDomainWarping: this.app.config.useDomainWarping,
          warpStrength: this.app.config.warpStrength,
          useBiomes: this.app.config.useBiomes,
          moistureScale: this.app.config.moistureScale,
          temperatureScale: this.app.config.temperatureScale,
          view3D: this.app.config.view3D,
          heightMultiplier: this.app.config.heightMultiplier,
          theme: this._getCurrentThemeName(),
          // Advanced terrain features
          showRivers: this.app.config.showRivers,
          riverThreshold: this.app.config.riverThreshold,
          useErosion: this.app.config.useErosion,
          erosionIterations: this.app.config.erosionIterations,
          erosionStrength: this.app.config.erosionStrength,
          showVegetation: this.app.config.showVegetation,
          showSettlements: this.app.config.showSettlements,
          settlementMinDistance: this.app.config.settlementMinDistance,
          showRoads: this.app.config.showRoads,
          // Visualization
          season: this.app.config.season,
          timeOfDay: this.app.config.timeOfDay,
          showMinimap: this.app.config.showMinimap,
          zoom: this.app.config.zoom,
          panX: this.app.config.panX,
          panY: this.app.config.panY,
          // Performance options
          useWebWorker: this.app.config.useWebWorker,
          useProgressiveRendering: this.app.config.useProgressiveRendering,
        };

        const encoded = btoa(JSON.stringify(config));
        const url = `${window.location.origin}${window.location.pathname}?config=${encoded}`;

        navigator.clipboard.writeText(url).then(() => {
          alert("Shareable link copied to clipboard!");
        }).catch(() => {
          // Fallback for older browsers
          const textArea = document.createElement("textarea");
          textArea.value = url;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
          alert("Shareable link copied to clipboard!");
        });
      }

      toggleImportArea() {
        const container = this.node.querySelector("#import-config-container");
        if (!container) return;

        if (container.style.display === "none") {
          container.style.display = "block";
          const textarea = this.node.querySelector("#import-config-area");
          if (textarea) textarea.focus();
        } else {
          container.style.display = "none";
          const textarea = this.node.querySelector("#import-config-area");
          if (textarea) textarea.value = "";
        }
      }

      applyImportedConfig() {
        const textarea = this.node.querySelector("#import-config-area");
        if (!textarea) return;

        try {
          const config = JSON.parse(textarea.value);
          this._applyImportedConfigData(config);

          // Hide the import area
          const container = this.node.querySelector("#import-config-container");
          if (container) container.style.display = "none";
          textarea.value = "";

          alert("Configuration imported successfully!");
        } catch (e) {
          alert("Invalid JSON format. Please check your configuration.");
        }
      }

      cancelImport() {
        const container = this.node.querySelector("#import-config-container");
        const textarea = this.node.querySelector("#import-config-area");

        if (container) container.style.display = "none";
        if (textarea) textarea.value = "";
      }

      _getCurrentThemeName() {
        if (!this.app.currentTheme) return "realistic";

        // Try to match current theme against known themes
        const themeStrings = {
          realistic: JSON.stringify([
            { threshold: 0.3, name: "deep_water", color: { r: 0, g: 50, b: 150 } },
            { threshold: 0.4, name: "shallow_water", color: { r: 50, g: 100, b: 200 } },
            { threshold: 0.45, name: "beach", color: { r: 210, g: 180, b: 140 } },
            { threshold: 0.6, name: "grass", color: { r: 50, g: 150, b: 50 } },
            { threshold: 0.75, name: "hills", color: { r: 34, g: 100, b: 34 } },
            { threshold: 0.85, name: "mountains", color: { r: 100, g: 100, b: 100 } },
            { threshold: Infinity, name: "snow", color: { r: 240, g: 240, b: 240 } },
          ]),
          fantasy: JSON.stringify([
            { threshold: 0.3, name: "deep_water", color: { r: 75, g: 0, b: 130 } },
            { threshold: 0.4, name: "shallow_water", color: { r: 138, g: 43, b: 226 } },
            { threshold: 0.45, name: "beach", color: { r: 255, g: 215, b: 0 } },
            { threshold: 0.6, name: "grass", color: { r: 50, g: 205, b: 50 } },
            { threshold: 0.75, name: "hills", color: { r: 34, g: 139, b: 34 } },
            { threshold: 0.85, name: "mountains", color: { r: 139, g: 0, b: 139 } },
            { threshold: Infinity, name: "snow", color: { r: 255, g: 182, b: 193 } },
          ]),
          alien: JSON.stringify([
            { threshold: 0.3, name: "deep_water", color: { r: 0, g: 100, b: 0 } },
            { threshold: 0.4, name: "shallow_water", color: { r: 0, g: 150, b: 0 } },
            { threshold: 0.45, name: "beach", color: { r: 255, g: 140, b: 0 } },
            { threshold: 0.6, name: "grass", color: { r: 255, g: 69, b: 0 } },
            { threshold: 0.75, name: "hills", color: { r: 178, g: 34, b: 34 } },
            { threshold: 0.85, name: "mountains", color: { r: 128, g: 0, b: 128 } },
            { threshold: Infinity, name: "snow", color: { r: 255, g: 255, b: 0 } },
          ]),
        };

        const currentThemeStr = JSON.stringify(this.app.currentTheme);
        for (const [name, themeStr] of Object.entries(themeStrings)) {
          if (themeStr === currentThemeStr) return name;
        }

        return "realistic";
      }

      _applyImportedConfigData(config) {
        // Apply all config values
        if (config.seed) this.app.currentSeed = config.seed;
        if (config.width) this.app.config.width = config.width;
        if (config.height) this.app.config.height = config.height;
        if (config.scale) this.app.config.scale = config.scale;
        if (config.octaves) this.app.config.octaves = config.octaves;
        if (config.persistence) this.app.config.persistence = config.persistence;
        if (config.noiseType) this.app.config.noiseType = config.noiseType;
        if (config.useDomainWarping !== undefined) this.app.config.useDomainWarping = config.useDomainWarping;
        if (config.warpStrength) this.app.config.warpStrength = config.warpStrength;
        if (config.useBiomes !== undefined) this.app.config.useBiomes = config.useBiomes;
        if (config.moistureScale) this.app.config.moistureScale = config.moistureScale;
        if (config.temperatureScale) this.app.config.temperatureScale = config.temperatureScale;
        if (config.view3D !== undefined) this.app.config.view3D = config.view3D;
        if (config.heightMultiplier) this.app.config.heightMultiplier = config.heightMultiplier;
        if (config.theme) this.applyColorTheme(config.theme);

        // Advanced terrain features
        if (config.showRivers !== undefined) this.app.config.showRivers = config.showRivers;
        if (config.riverThreshold) this.app.config.riverThreshold = config.riverThreshold;
        if (config.useErosion !== undefined) this.app.config.useErosion = config.useErosion;
        if (config.erosionIterations) this.app.config.erosionIterations = config.erosionIterations;
        if (config.erosionStrength) this.app.config.erosionStrength = config.erosionStrength;
        if (config.showVegetation !== undefined) this.app.config.showVegetation = config.showVegetation;
        if (config.showSettlements !== undefined) this.app.config.showSettlements = config.showSettlements;
        if (config.settlementMinDistance) this.app.config.settlementMinDistance = config.settlementMinDistance;
        if (config.showRoads !== undefined) this.app.config.showRoads = config.showRoads;

        // Visualization
        if (config.season) this.app.config.season = config.season;
        if (config.timeOfDay !== undefined) this.app.config.timeOfDay = config.timeOfDay;
        if (config.showMinimap !== undefined) this.app.config.showMinimap = config.showMinimap;
        if (config.zoom !== undefined) this.app.config.zoom = config.zoom;
        if (config.panX !== undefined) this.app.config.panX = config.panX;
        if (config.panY !== undefined) this.app.config.panY = config.panY;

        // Performance options
        if (config.useWebWorker !== undefined) this.app.config.useWebWorker = config.useWebWorker;
        if (config.useProgressiveRendering !== undefined) this.app.config.useProgressiveRendering = config.useProgressiveRendering;

        // Update UI elements
        this._updateUIFromConfig();

        // Regenerate terrain
        this.regenerate();
      }

      _updateUIFromConfig() {
        // Re-render the component to update all UI elements
        // This is the most reliable way to ensure all checkboxes, sliders, radio buttons, etc. are updated
        this.render();
      }

      _renderCanvasContainer() {
        // Apply translate first (in unscaled space), then scale
        // This way panning works correctly with zoom
        const transformStr = `translate(${this.app.config.panX}px, ${this.app.config.panY}px) scale(${this.app.config.zoom})`;
        const cursorStyle = this.app.config.showMinimap && this.app.config.zoom > 1 ? "move" : "default";

        return self.vdom`
          <div style=${{ position: "relative", display: "inline-block" }}>
            <div style=${{
              position: "relative",
              overflow: "visible",
              border: "1px solid #ccc",
              display: "inline-block",
              width: this.app.config.width + "px",
              height: this.app.config.height + "px",
              cursor: cursorStyle,
            }}>
              <canvas
                id="main-canvas"
                width=${this.app.config.width}
                height=${this.app.config.height}
                style="display: block; image-rendering: pixelated; transform: ${transformStr}; transform-origin: top left;"
                onmousedown=${(e) => this.startPan(e)}
                onmousemove=${(e) => this.doPan(e)}
                onmouseup=${() => this.endPan()}
                onmouseleave=${() => this.endPan()}
                onwheel=${(e) => this.handleZoom(e)}
              ></canvas>
            </div>
            ${this.app.config.showMinimap ? this._renderMinimap() : ""}
          </div>
        `;
      }

      _renderMinimap() {
        const minimapSize = 150;
        const minimapHeight = Math.floor(minimapSize * this.app.config.height / this.app.config.width);

        return self.vdom`
          <div style=${{
            position: "absolute",
            bottom: "10px",
            right: "10px",
            width: minimapSize + "px",
            height: minimapHeight + "px",
            border: "2px solid #333",
            borderRadius: "4px",
            backgroundColor: "#000",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            overflow: "hidden",
          }}>
            <canvas
              id="minimap-canvas"
              width=${minimapSize}
              height=${minimapHeight}
              style=${{
                display: "block",
                width: "100%",
                height: "100%",
              }}
              onclick=${(e) => this.clickMinimap(e)}
            ></canvas>
          </div>
        `;
      }

      _renderInfo() {
        return self.vdom`
          <div style=${{ marginTop: "20px" }}>
            <h3>How it works:</h3>
            <ul>
              <li><strong>Noise Types:</strong> Choose between Perlin (smooth), Simplex (efficient, less artifacts), or Voronoi (cellular patterns)</li>
              <li><strong>Fractal Brownian Motion (FBM):</strong> Layers multiple octaves of noise for natural-looking terrain</li>
              <li><strong>Domain Warping:</strong> Distorts coordinate space for more organic, flowing patterns</li>
              <li><strong>Biomes:</strong> Enable to generate realistic ecosystems based on elevation, moisture, and temperature (includes deserts, forests, tundra, etc.)</li>
              <li><strong>3D View:</strong> Renders terrain in isometric perspective with height exaggeration for depth visualization</li>
              <li><strong>Height Mapping:</strong> Each pixel's height determines its base color (water, land, mountains, snow)</li>
              <li><strong>Seeded Random:</strong> Same seed produces same terrain (reproducibility)</li>
            </ul>
            <h3>Animation and Time:</h3>
            <ul>
              <li><strong>Animate Generation:</strong> When enabled, terrain reveals progressively from left to right with a smooth animation</li>
              <li><strong>Seasons:</strong> Changes color palette - Spring (vibrant greens), Summer (warm tones), Fall (orange/brown), Winter (cold, desaturated)</li>
              <li><strong>Time of Day:</strong> Adjusts lighting overlay to simulate different times - Night (dark blue), Dawn/Dusk (warm orange), Day (bright)</li>
            </ul>
            <h3>Minimap and Navigation:</h3>
            <ul>
              <li><strong>Show Minimap:</strong> Displays a small overview map in the bottom-right corner</li>
              <li><strong>Zoom:</strong> Use mouse wheel to zoom in/out (1x to 5x), minimap must be enabled</li>
              <li><strong>Pan:</strong> Click and drag on the main canvas to pan when zoomed in</li>
              <li><strong>Minimap Click:</strong> Click anywhere on the minimap to jump to that location</li>
              <li><strong>Viewport Indicator:</strong> Yellow rectangle on minimap shows current visible area when zoomed</li>
            </ul>
            <h3>Export and Sharing:</h3>
            <ul>
              <li><strong>Save as PNG:</strong> Downloads the current terrain as a PNG image file</li>
              <li><strong>Export Config:</strong> Downloads a JSON file containing all current settings (seed, parameters, theme, etc.)</li>
              <li><strong>Copy Share Link:</strong> Creates a shareable URL with all settings encoded - anyone with the link can recreate your exact terrain</li>
              <li><strong>Import Config:</strong> Click once to show text area, paste JSON config, click again to import and apply the settings</li>
            </ul>
            <h3>Performance Options:</h3>
            <ul>
              <li><strong>Web Worker:</strong> Offloads terrain generation to a background thread, keeping the UI responsive during generation. Best for large terrains or complex settings.</li>
              <li><strong>Progressive Rendering:</strong> Generates terrain in chunks (50 rows at a time), rendering incrementally. Keeps UI interactive during generation, useful for large canvas sizes.</li>
              <li><strong>Note:</strong> Both options add slight overhead, so they're most beneficial for large terrains (800x600+) or high octave counts (6+). For small terrains, standard rendering may be faster.</li>
            </ul>
            <h3>Advanced Terrain Features:</h3>
            <ul>
              <li><strong>Rivers (Flow Accumulation):</strong> Simulates water flow from high to low elevation. Adjust the threshold to control river formation - lower values create more rivers, higher values show only major waterways.</li>
              <li><strong>Hydraulic Erosion:</strong> Simulates realistic terrain erosion by water droplets. Creates valleys, smooths terrain, and adds natural-looking features. More iterations = more erosion (slower). Higher strength = more aggressive erosion.</li>
              <li><strong>Vegetation:</strong> Generates vegetation density based on moisture, temperature, and elevation. Requires biomes to be enabled. Dense vegetation appears in warm, moist areas with moderate elevation.</li>
              <li><strong>Settlements:</strong> Places settlements using Poisson disc sampling for even distribution. Settlements prefer flat, habitable land near water sources. Adjust spacing to control settlement density.</li>
              <li><strong>Roads:</strong> Connects settlements with roads using A* pathfinding. Roads prefer flat terrain and avoid water. Requires settlements to be enabled first.</li>
              <li><strong>Tip:</strong> For realistic worlds, enable features in this order: Erosion → Biomes → Rivers → Vegetation → Settlements → Roads. Each feature builds on previous ones for natural-looking terrain.</li>
            </ul>
          </div>
        `;
      }

      regenerate() {
        const seed = this.app.currentSeed ? parseInt(this.app.currentSeed) : Date.now();
        this.app.generate(seed, this.node);
      }

      regenerateAnimated() {
        const seed = this.app.currentSeed ? parseInt(this.app.currentSeed) : Date.now();
        this.app.generateAnimated(seed, this.node);
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

    // Update generator config with current values
    this.generator.config.scale = this.config.scale;
    this.generator.config.octaves = this.config.octaves;
    this.generator.config.persistence = this.config.persistence;
    this.generator.config.width = this.config.width;
    this.generator.config.height = this.config.height;
    this.generator.config.noiseType = this.config.noiseType;
    this.generator.config.useDomainWarping = this.config.useDomainWarping;
    this.generator.config.warpStrength = this.config.warpStrength;
    this.generator.config.useBiomes = this.config.useBiomes;
    this.generator.config.moistureScale = this.config.moistureScale;
    this.generator.config.temperatureScale = this.config.temperatureScale;
    this.generator.config.view3D = this.config.view3D;
    this.generator.config.heightMultiplier = this.config.heightMultiplier;

    // Find canvas
    const canvas = containerNode.querySelector("canvas");
    if (!canvas) return;

    // Use setTimeout to ensure rendering happens after any DOM updates
    setTimeout(() => {
      this._renderTerrain(canvas);

      // Update seed input field
      const seedInput = containerNode.querySelector('input[type="number"]');
      if (seedInput) {
        seedInput.value = this.currentSeed;
      }

      // Update minimap if visible
      if (this.config.showMinimap) {
        const component = this.createComponent();
        if (component.updateMinimap) {
          setTimeout(() => component.updateMinimap.call(component), 10);
        }
      }
    }, 0);
  }

  /**
   * Generate and render terrain with animation
   * @param {number} seed - Random seed
   * @param {HTMLElement} containerNode - Container DOM node
   */
  generateAnimated(seed, containerNode) {
    // Cancel any existing animation
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // Update generator with new seed
    this.generator.setSeed(seed);
    this.currentSeed = this.generator.config.seed;

    // Update generator config with current values
    this.generator.config.scale = this.config.scale;
    this.generator.config.octaves = this.config.octaves;
    this.generator.config.persistence = this.config.persistence;
    this.generator.config.width = this.config.width;
    this.generator.config.height = this.config.height;
    this.generator.config.noiseType = this.config.noiseType;
    this.generator.config.useDomainWarping = this.config.useDomainWarping;
    this.generator.config.warpStrength = this.config.warpStrength;
    this.generator.config.useBiomes = this.config.useBiomes;
    this.generator.config.moistureScale = this.config.moistureScale;
    this.generator.config.temperatureScale = this.config.temperatureScale;
    this.generator.config.view3D = this.config.view3D;
    this.generator.config.heightMultiplier = this.config.heightMultiplier;

    // Find canvas
    const canvas = containerNode.querySelector("canvas");
    if (!canvas) return;

    // Generate the terrain data
    let heightMap, moistureMap, temperatureMap;
    if (this.config.useBiomes) {
      const result = this.generator.generateWithClimate();
      heightMap = result.heightMap;
      moistureMap = result.moistureMap;
      temperatureMap = result.temperatureMap;
    } else {
      heightMap = this.generator.generate();
    }

    // Cache for minimap
    this.cachedHeightMap = heightMap;
    this.cachedMoistureMap = moistureMap;
    this.cachedTemperatureMap = temperatureMap;

    // Animate the reveal
    const duration = 2000; // 2 seconds
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Use easing function for smooth animation
      const easedProgress = this._easeInOutCubic(progress);

      this._renderTerrainPartial(canvas, heightMap, moistureMap, temperatureMap, easedProgress);

      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        this.animationFrame = null;
      }
    };

    // Update seed input field
    const seedInput = containerNode.querySelector('input[type="number"]');
    if (seedInput) {
      seedInput.value = this.currentSeed;
    }

    animate();
  }

  /**
   * Easing function for smooth animation
   * @private
   */
  _easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Render terrain with all effects applied
   * @private
   */
  _renderTerrain(canvas) {
    // Use Web Worker if enabled and supported
    if (this.config.useWebWorker && this.worker) {
      this._renderTerrainWithWorker(canvas);
      return;
    }

    // Use Progressive Rendering if enabled
    if (this.config.useProgressiveRendering) {
      this._renderTerrainProgressive(canvas);
      return;
    }

    // Standard synchronous rendering
    let heightMap, moistureMap, temperatureMap;

    if (this.config.useBiomes) {
      const result = this.generator.generateWithClimate();
      heightMap = result.heightMap;
      moistureMap = result.moistureMap;
      temperatureMap = result.temperatureMap;
    } else {
      heightMap = this.generator.generate();
    }

    // Apply erosion if enabled
    if (this.config.useErosion) {
      heightMap = this.generator.applyHydraulicErosion(
        heightMap,
        this.config.erosionIterations,
        this.config.erosionStrength
      );
    }

    // Generate rivers if enabled
    let riverMap = null;
    if (this.config.showRivers) {
      riverMap = this.generator.generateRivers(heightMap, this.config.riverThreshold);
    }

    // Generate vegetation if enabled
    let vegetationMap = null;
    if (this.config.showVegetation && moistureMap && temperatureMap) {
      vegetationMap = this.generator.generateVegetation(heightMap, moistureMap, temperatureMap);
    }

    // Generate settlements if enabled
    let settlements = null;
    if (this.config.showSettlements) {
      settlements = this.generator.generateSettlements(
        heightMap,
        moistureMap,
        this.config.settlementMinDistance
      );
    }

    // Generate roads if enabled
    let roads = null;
    if (this.config.showRoads && settlements && settlements.length >= 2) {
      roads = this.generator.generateRoads(heightMap, settlements);
    }

    // Cache for minimap
    this.cachedHeightMap = heightMap;
    this.cachedMoistureMap = moistureMap;
    this.cachedTemperatureMap = temperatureMap;
    this.cachedRiverMap = riverMap;
    this.cachedVegetationMap = vegetationMap;
    this.cachedSettlements = settlements;
    this.cachedRoads = roads;

    console.log(`[Standard] Generated features: rivers=${riverMap ? 'yes' : 'no'}, vegetation=${vegetationMap ? 'yes' : 'no'}, settlements=${settlements ? settlements.length : 0}, roads=${roads ? roads.length : 0}`);

    this._renderTerrainPartial(canvas, heightMap, moistureMap, temperatureMap, riverMap, vegetationMap, settlements, roads, 1.0);
  }

  /**
   * Render terrain using Web Worker (async, offloaded to background thread)
   * @private
   */
  _renderTerrainWithWorker(canvas) {
    const startTime = performance.now();

    this.worker.onmessage = (e) => {
      const { type, error } = e.data;
      let { heightMap, moistureMap, temperatureMap } = e.data;

      if (type === 'error') {
        console.error('Web Worker error:', error);
        // Fallback to sync rendering
        this.config.useWebWorker = false;
        this._renderTerrain(canvas);
        return;
      }

      if (type === 'complete') {
        const endTime = performance.now();
        console.log(`Terrain generated in worker: ${(endTime - startTime).toFixed(2)}ms`);

        // Apply erosion if enabled
        if (this.config.useErosion) {
          heightMap = this.generator.applyHydraulicErosion(
            heightMap,
            this.config.erosionIterations,
            this.config.erosionStrength
          );
        }

        // Generate rivers if enabled
        let riverMap = null;
        if (this.config.showRivers) {
          riverMap = this.generator.generateRivers(heightMap, this.config.riverThreshold);
        }

        // Generate vegetation if enabled
        let vegetationMap = null;
        if (this.config.showVegetation && moistureMap && temperatureMap) {
          vegetationMap = this.generator.generateVegetation(heightMap, moistureMap, temperatureMap);
        }

        // Generate settlements if enabled
        let settlements = null;
        if (this.config.showSettlements) {
          settlements = this.generator.generateSettlements(
            heightMap,
            moistureMap,
            this.config.settlementMinDistance
          );
        }

        // Generate roads if enabled
        let roads = null;
        if (this.config.showRoads && settlements && settlements.length >= 2) {
          roads = this.generator.generateRoads(heightMap, settlements);
        }

        // Cache for minimap
        this.cachedHeightMap = heightMap;
        this.cachedMoistureMap = moistureMap;
        this.cachedTemperatureMap = temperatureMap;
        this.cachedRiverMap = riverMap;
        this.cachedVegetationMap = vegetationMap;
        this.cachedSettlements = settlements;
        this.cachedRoads = roads;

        console.log(`[Web Worker] Generated features: rivers=${riverMap ? 'yes' : 'no'}, vegetation=${vegetationMap ? 'yes' : 'no'}, settlements=${settlements ? settlements.length : 0}, roads=${roads ? roads.length : 0}`);

        this._renderTerrainPartial(canvas, heightMap, moistureMap, temperatureMap, riverMap, vegetationMap, settlements, roads, 1.0);
      }
    };

    // Send generation request to worker
    this.worker.postMessage({
      type: 'generate',
      config: this.generator.config,
    });
  }

  /**
   * Render terrain progressively in chunks (keeps UI responsive)
   * @private
   */
  _renderTerrainProgressive(canvas) {
    const startTime = performance.now();
    const chunkSize = 50; // Render 50 rows at a time
    const height = this.config.height;
    let currentY = 0;

    // Initialize heightMap arrays
    let heightMap = [];
    let moistureMap = this.config.useBiomes ? [] : null;
    let temperatureMap = this.config.useBiomes ? [] : null;

    const renderChunk = () => {
      const endY = Math.min(currentY + chunkSize, height);

      // Generate chunk
      for (let y = currentY; y < endY; y++) {
        const heightRow = [];
        const moistureRow = this.config.useBiomes ? [] : null;
        const temperatureRow = this.config.useBiomes ? [] : null;

        for (let x = 0; x < this.config.width; x++) {
          let noiseValue;

          if (this.config.useDomainWarping) {
            noiseValue = this.generator.noise.domainWarp(
              x * this.config.scale,
              y * this.config.scale,
              this.config.octaves,
              this.config.persistence,
              this.config.warpStrength
            );
          } else {
            noiseValue = this.generator.noise.fbm(
              x * this.config.scale,
              y * this.config.scale,
              this.config.octaves,
              this.config.persistence
            );
          }

          noiseValue = (noiseValue + 1) / 2;
          heightRow.push(noiseValue);

          if (this.config.useBiomes) {
            const moisture = (this.generator.moistureNoise.fbm(
              x * this.config.moistureScale,
              y * this.config.moistureScale,
              3,
              0.5
            ) + 1) / 2;
            const temp = (this.generator.temperatureNoise.fbm(
              x * this.config.temperatureScale,
              y * this.config.temperatureScale,
              3,
              0.5
            ) + 1) / 2;
            moistureRow.push(moisture);
            temperatureRow.push(temp);
          }
        }

        heightMap.push(heightRow);
        if (this.config.useBiomes) {
          moistureMap.push(moistureRow);
          temperatureMap.push(temperatureRow);
        }
      }

      currentY = endY;

      if (currentY < height) {
        // Schedule next chunk using requestAnimationFrame for smooth UI
        requestAnimationFrame(renderChunk);
      } else {
        // Done - apply advanced features and render
        const endTime = performance.now();
        console.log(`Terrain generated progressively: ${(endTime - startTime).toFixed(2)}ms`);

        // Apply erosion if enabled
        if (this.config.useErosion) {
          heightMap = this.generator.applyHydraulicErosion(
            heightMap,
            this.config.erosionIterations,
            this.config.erosionStrength
          );
        }

        // Generate rivers if enabled
        let riverMap = null;
        if (this.config.showRivers) {
          riverMap = this.generator.generateRivers(heightMap, this.config.riverThreshold);
        }

        // Generate vegetation if enabled
        let vegetationMap = null;
        if (this.config.showVegetation && moistureMap && temperatureMap) {
          vegetationMap = this.generator.generateVegetation(heightMap, moistureMap, temperatureMap);
        }

        // Generate settlements if enabled
        let settlements = null;
        if (this.config.showSettlements) {
          settlements = this.generator.generateSettlements(
            heightMap,
            moistureMap,
            this.config.settlementMinDistance
          );
        }

        // Generate roads if enabled
        let roads = null;
        if (this.config.showRoads && settlements && settlements.length >= 2) {
          roads = this.generator.generateRoads(heightMap, settlements);
        }

        this.cachedHeightMap = heightMap;
        this.cachedMoistureMap = moistureMap;
        this.cachedTemperatureMap = temperatureMap;
        this.cachedRiverMap = riverMap;
        this.cachedVegetationMap = vegetationMap;
        this.cachedSettlements = settlements;
        this.cachedRoads = roads;

        console.log(`[Progressive] Generated features: rivers=${riverMap ? 'yes' : 'no'}, vegetation=${vegetationMap ? 'yes' : 'no'}, settlements=${settlements ? settlements.length : 0}, roads=${roads ? roads.length : 0}`);

        // Render the final complete terrain with all features
        this._renderTerrainPartial(canvas, heightMap, moistureMap, temperatureMap, riverMap, vegetationMap, settlements, roads, 1.0);
      }
    };

    // Start progressive rendering
    requestAnimationFrame(renderChunk);
  }

  /**
   * Render terrain with partial reveal (for animation) and time/season effects
   * @private
   */
  _renderTerrainPartial(canvas, heightMap, moistureMap, temperatureMap, riverMapOrProgress, vegetationMap = null, settlements = null, roads = null, progress = 1.0) {
    const ctx = canvas.getContext("2d");
    const width = this.config.width;
    const height = this.config.height;

    // Handle parameter overloading for backwards compatibility
    let riverMap = null;
    let actualProgress = progress;
    let actualVegetationMap = vegetationMap;
    let actualSettlements = settlements;
    let actualRoads = roads;

    if (typeof riverMapOrProgress === 'number') {
      // Old signature: riverMapOrProgress is actually progress
      actualProgress = riverMapOrProgress;
      riverMap = null;
      actualVegetationMap = null;
      actualSettlements = null;
      actualRoads = null;
    } else {
      // New signature: riverMapOrProgress is riverMap
      riverMap = riverMapOrProgress;
    }

    // Apply season and time of day to theme/colors
    const modifiedTheme = this._applySeasonalAndTimeEffects(this.currentTheme);

    if (this.config.view3D) {
      // 3D rendering
      if (this.config.useBiomes) {
        TerrainRenderer.render3DWithBiomes(canvas, heightMap, moistureMap, temperatureMap, width, height, this.config.heightMultiplier);
      } else {
        TerrainRenderer.render3D(canvas, heightMap, width, height, modifiedTheme, this.config.heightMultiplier);
      }
    } else {
      // 2D rendering
      if (this.config.useBiomes) {
        TerrainRenderer.renderWithBiomes(canvas, heightMap, moistureMap, temperatureMap, width, height);
      } else {
        TerrainRenderer.render(canvas, heightMap, width, height, modifiedTheme);
      }
    }

    // Render rivers if enabled and riverMap is provided
    if (this.config.showRivers && riverMap) {
      this._renderRivers(ctx, riverMap, width, height);
    }

    // Render vegetation if enabled
    if (this.config.showVegetation && actualVegetationMap) {
      this._renderVegetation(ctx, actualVegetationMap, width, height);
    }

    // Render roads if enabled (before settlements so settlements appear on top)
    if (this.config.showRoads && actualRoads) {
      this._renderRoads(ctx, actualRoads);
    }

    // Render settlements if enabled
    if (this.config.showSettlements && actualSettlements) {
      this._renderSettlements(ctx, actualSettlements);
    }

    // Apply seasonal color filter for biomes
    if (this.config.useBiomes && this.config.season !== 'spring') {
      this._applySeasonalBiomeFilter(canvas, ctx, width, height);
    }

    // Apply time of day lighting overlay
    this._applyTimeOfDayLighting(canvas, ctx, width, height);

    // Apply animation reveal effect
    if (actualProgress < 1) {
      this._applyRevealMask(canvas, ctx, width, height, actualProgress);
    }
  }

  /**
   * Render rivers on the canvas
   * @private
   */
  _renderRivers(ctx, riverMap, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Find max flow for normalization
    let maxFlow = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (riverMap[y][x] > maxFlow) {
          maxFlow = riverMap[y][x];
        }
      }
    }

    // Render rivers based on flow accumulation
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const flow = riverMap[y][x];
        if (flow > this.config.riverThreshold) {
          // River color: dark blue, with alpha based on flow strength
          const flowRatio = Math.min(1, flow / maxFlow);
          const idx = (y * width + x) * 4;

          // Blend river color with existing terrain
          const riverR = 30;
          const riverG = 100;
          const riverB = 200;
          const alpha = Math.min(0.9, flowRatio * 0.7 + 0.2);

          data[idx] = Math.floor(data[idx] * (1 - alpha) + riverR * alpha);
          data[idx + 1] = Math.floor(data[idx + 1] * (1 - alpha) + riverG * alpha);
          data[idx + 2] = Math.floor(data[idx + 2] * (1 - alpha) + riverB * alpha);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Render vegetation on the canvas
   * @private
   */
  _renderVegetation(ctx, vegetationMap, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Render vegetation as green overlay with varying intensity
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const density = vegetationMap[y][x];
        if (density > 0.1) {
          const idx = (y * width + x) * 4;

          // Dark green for dense vegetation, lighter for sparse
          const vegR = 20 + density * 30;
          const vegG = 80 + density * 60;
          const vegB = 20 + density * 30;
          const alpha = density * 0.4;

          data[idx] = Math.floor(data[idx] * (1 - alpha) + vegR * alpha);
          data[idx + 1] = Math.floor(data[idx + 1] * (1 - alpha) + vegG * alpha);
          data[idx + 2] = Math.floor(data[idx + 2] * (1 - alpha) + vegB * alpha);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Render settlements on the canvas
   * @private
   */
  _renderSettlements(ctx, settlements) {
    for (const settlement of settlements) {
      const { x, y, size } = settlement;

      // Draw settlement as a circle with a border
      ctx.fillStyle = '#8B4513'; // Brown
      ctx.strokeStyle = '#654321'; // Darker brown
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Add a small highlight
      ctx.fillStyle = 'rgba(255, 255, 200, 0.3)';
      ctx.beginPath();
      ctx.arc(x - size * 0.3, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Render roads on the canvas
   * @private
   */
  _renderRoads(ctx, roads) {
    ctx.strokeStyle = '#8B7355'; // Light brown
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const road of roads) {
      if (!road.path || road.path.length < 2) continue;

      ctx.beginPath();
      ctx.moveTo(road.path[0].x, road.path[0].y);

      for (let i = 1; i < road.path.length; i++) {
        ctx.lineTo(road.path[i].x, road.path[i].y);
      }

      ctx.stroke();
    }
  }

  /**
   * Apply seasonal and time of day color modifications
   * @private
   */
  _applySeasonalAndTimeEffects(theme) {
    if (!theme) return null;

    const season = this.config.season;
    const modifiedTheme = JSON.parse(JSON.stringify(theme)); // Deep copy

    // Apply season color shifts
    for (let terrain of modifiedTheme) {
      const color = terrain.color;

      switch (season) {
        case 'spring':
          // More vibrant greens, lighter colors
          if (terrain.name === 'grass' || terrain.name === 'hills') {
            color.g = Math.min(255, color.g * 1.2);
            color.r = Math.max(0, color.r * 0.8);
          }
          break;
        case 'summer':
          // Warmer, more saturated colors
          color.r = Math.min(255, color.r * 1.1);
          color.g = Math.min(255, color.g * 1.05);
          break;
        case 'fall':
          // Orange and brown tones
          if (terrain.name === 'grass' || terrain.name === 'hills') {
            color.r = Math.min(255, color.r * 1.5 + 40);
            color.g = Math.max(0, color.g * 0.9);
            color.b = Math.max(0, color.b * 0.7);
          }
          break;
        case 'winter':
          // Colder, more desaturated
          const avg = (color.r + color.g + color.b) / 3;
          color.r = Math.floor(color.r * 0.7 + avg * 0.3);
          color.g = Math.floor(color.g * 0.7 + avg * 0.3);
          color.b = Math.floor(color.b * 0.8 + avg * 0.2 + 30);
          break;
      }
    }

    return modifiedTheme;
  }

  /**
   * Apply seasonal color filter for biomes
   * @private
   */
  _applySeasonalBiomeFilter(canvas, ctx, width, height) {
    const season = this.config.season;

    // Get the current canvas image data
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Apply seasonal transformations pixel by pixel
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      switch (season) {
        case 'summer':
          // Warmer, more saturated - boost reds slightly
          data[i] = Math.min(255, r * 1.08);
          data[i + 1] = Math.min(255, g * 1.03);
          break;
        case 'fall':
          // Check if this is a greenish pixel (likely vegetation)
          const isGreen = g > r && g > b && g > 80;
          if (isGreen) {
            // Turn greens into oranges and browns
            data[i] = Math.min(255, r * 1.4 + 30);
            data[i + 1] = Math.max(0, g * 0.9);
            data[i + 2] = Math.max(0, b * 0.7);
          } else {
            // Slightly warm up other colors
            data[i] = Math.min(255, r * 1.05);
          }
          break;
        case 'winter':
          // Desaturate and add blue tint
          const avg = (r + g + b) / 3;
          data[i] = Math.floor(r * 0.7 + avg * 0.3);
          data[i + 1] = Math.floor(g * 0.7 + avg * 0.3);
          data[i + 2] = Math.floor(b * 0.8 + avg * 0.2 + 20);
          break;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Apply time of day lighting overlay
   * @private
   */
  _applyTimeOfDayLighting(canvas, ctx, width, height) {
    const timeOfDay = this.config.timeOfDay;

    // Calculate brightness based on time (0 = night, 0.5 = day, 1 = night)
    const brightness = Math.sin(timeOfDay * Math.PI);
    const darkness = 1 - brightness;

    if (darkness > 0.1) {
      // Apply dark overlay for night
      ctx.fillStyle = `rgba(0, 0, 50, ${darkness * 0.6})`;
      ctx.fillRect(0, 0, width, height);
    }

    // Apply warm/cool tones based on time
    if (timeOfDay < 0.25 || timeOfDay > 0.75) {
      // Night - cool blue tint
      ctx.fillStyle = `rgba(0, 0, 80, ${Math.min(darkness * 0.3, 0.4)})`;
      ctx.fillRect(0, 0, width, height);
    } else if (timeOfDay < 0.35 || timeOfDay > 0.65) {
      // Dawn/Dusk - warm orange tint
      const dawnDuskIntensity = timeOfDay < 0.35
        ? (0.35 - timeOfDay) / 0.1
        : (timeOfDay - 0.65) / 0.1;
      ctx.fillStyle = `rgba(255, 140, 60, ${dawnDuskIntensity * 0.2})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  /**
   * Apply animated reveal mask
   * @private
   */
  _applyRevealMask(canvas, ctx, width, height, progress) {
    // Reveal from left to right with a smooth gradient edge
    const revealX = width * progress;
    const gradientWidth = 50;

    // Create gradient mask
    const gradient = ctx.createLinearGradient(revealX - gradientWidth, 0, revealX, 0);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');

    // Draw mask
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillRect(revealX, 0, width - revealX, height);

    ctx.fillStyle = gradient;
    ctx.fillRect(revealX - gradientWidth, 0, gradientWidth, height);
  }
}
