/**
 * Snowfall effect for winter months
 */

export class SnowfallEffect {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.snowflakes = [];
    this.animationId = null;
    this.enabled = false;
    this.isWinter = this.checkIfWinter();
  }

  checkIfWinter() {
    const month = new Date().getMonth();

    // Winter months: December (11), January (0), February (1)
    return month === 11 || month === 0 || month === 1;
  }

  init() {
    if (!this.isWinter) {
      return;
    }

    // Check localStorage for saved preference
    const savedPreference = localStorage.getItem("snowfall-enabled");
    this.enabled = savedPreference === null ? true : savedPreference === "true";

    this.createCanvas();
    this.createToggleButton();

    if (this.enabled) {
      this.start();
    }
  }

  createCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "snowfall-canvas";
    this.canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9999;
    `;
    document.body.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d");
    this.resizeCanvas();

    window.addEventListener("resize", () => this.resizeCanvas());
  }

  resizeCanvas() {
    if (!this.canvas) return;

    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Recreate snowflakes on resize
    if (this.enabled) {
      this.createSnowflakes();
    }
  }

  createSnowflakes() {
    const density = Math.floor((this.canvas.width * this.canvas.height) / 15000);
    this.snowflakes = [];

    for (let i = 0; i < density; i++) {
      this.snowflakes.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        radius: Math.random() * 9 + 6, // 3x larger: 6-15px
        speed: Math.random() * 0.5 + 0.3,
        drift: Math.random() * 0.5 - 0.25,
        opacity: Math.random() * 0.6 + 0.4,
        rotation: Math.random() * Math.PI * 2,
      });
    }
  }

  drawSnowflake(x, y, radius, rotation, opacity) {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(rotation);
    this.ctx.strokeStyle = `rgba(173, 216, 230, ${opacity})`;
    this.ctx.fillStyle = `rgba(173, 216, 230, ${opacity})`;
    this.ctx.lineWidth = Math.max(radius / 4, 0.5);
    this.ctx.lineCap = "round";

    // Draw 6 branches of the snowflake
    for (let i = 0; i < 6; i++) {
      this.ctx.rotate(Math.PI / 3);

      // Main branch
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(0, -radius);
      this.ctx.stroke();

      // Side branches
      this.ctx.beginPath();
      this.ctx.moveTo(0, -radius * 0.6);
      this.ctx.lineTo(-radius * 0.3, -radius * 0.8);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(0, -radius * 0.6);
      this.ctx.lineTo(radius * 0.3, -radius * 0.8);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  createToggleButton() {
    const button = document.createElement("button");
    button.id = "snowfall-toggle";
    button.innerHTML = this.enabled ? "❄️" : "🔆";
    button.title = this.enabled ? "Disable snowfall" : "Enable snowfall";
    button.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.8);
      background: rgba(0, 0, 0, 0.5);
      color: white;
      font-size: 24px;
      cursor: pointer;
      z-index: 10000;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    `;

    button.addEventListener("mouseenter", () => {
      button.style.transform = "scale(1.1)";
      button.style.boxShadow = "0 6px 8px rgba(0, 0, 0, 0.4)";
    });

    button.addEventListener("mouseleave", () => {
      button.style.transform = "scale(1)";
      button.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.3)";
    });

    button.addEventListener("click", () => {
      this.toggle();
      button.innerHTML = this.enabled ? "❄️" : "🔆";
      button.title = this.enabled ? "Disable snowfall" : "Enable snowfall";
    });

    document.body.appendChild(button);
  }

  start() {
    this.enabled = true;
    localStorage.setItem("snowfall-enabled", "true");

    if (!this.canvas) {
      this.createCanvas();
    }

    this.createSnowflakes();
    this.animate();
  }

  stop() {
    this.enabled = false;
    localStorage.setItem("snowfall-enabled", "false");

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  toggle() {
    if (this.enabled) {
      this.stop();
    } else {
      this.start();
    }
  }

  animate() {
    if (!this.enabled) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const flake of this.snowflakes) {
      // Update position
      flake.y += flake.speed;
      flake.x += flake.drift;
      flake.rotation += 0.01; // Slow rotation

      // Wrap around
      if (flake.y > this.canvas.height) {
        flake.y = -10;
        flake.x = Math.random() * this.canvas.width;
      }

      if (flake.x > this.canvas.width) {
        flake.x = 0;
      } else if (flake.x < 0) {
        flake.x = this.canvas.width;
      }

      // Draw snowflake using the new snowflake shape
      this.drawSnowflake(flake.x, flake.y, flake.radius, flake.rotation, flake.opacity);
    }

    this.animationId = requestAnimationFrame(() => this.animate());
  }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  const snowfall = new SnowfallEffect();
  snowfall.init();
});
