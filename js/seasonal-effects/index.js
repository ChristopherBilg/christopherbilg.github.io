/**
 * Seasonal effects for different times of the year
 */

export class SeasonalEffects {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.animationId = null;
    this.enabled = false;
    this.currentSeason = this.detectSeason();
  }

  detectSeason() {
    const now = new Date();
    const month = now.getMonth();
    const day = now.getDate();

    // Special occasions take precedence
    // New Year's Day (January 1)
    if (month === 0 && day === 1) {
      return "newyear";
    }

    // Valentine's Day (February 14)
    if (month === 1 && day === 14) {
      return "valentine";
    }

    // Independence Day (July 4)
    if (month === 6 && day === 4) {
      return "july4th";
    }

    // Regular seasons
    // Winter: December (11), January (0), February (1)
    if (month === 11 || month === 0 || month === 1) {
      return "winter";
    }

    // Spring: March (2), April (3), May (4)
    if (month >= 2 && month <= 4) {
      return "spring";
    }

    // Summer: June (5), July (6), August (7)
    if (month >= 5 && month <= 7) {
      return "summer";
    }

    // Fall/Autumn: September (8), October (9), November (10)
    if (month >= 8 && month <= 10) {
      return "autumn";
    }

    return null;
  }

  getSeasonConfig() {
    const configs = {
      winter: {
        name: "winter",
        storageKey: "seasonal-winter-enabled",
        enabledIcon: "❄️",
        disabledIcon: "⭘",
        enabledTitle: "Disable snowfall",
        disabledTitle: "Enable snowfall",
        density: 15000,
        particleCreator: () => this.createSnowflake(),
        drawer: (particle) => this.drawSnowflake(particle),
      },
      autumn: {
        name: "autumn",
        storageKey: "seasonal-autumn-enabled",
        enabledIcon: "🍂",
        disabledIcon: "⭘",
        enabledTitle: "Disable falling leaves",
        disabledTitle: "Enable falling leaves",
        density: 12000,
        particleCreator: () => this.createLeaf(),
        drawer: (particle) => this.drawLeaf(particle),
      },
      summer: {
        name: "summer",
        storageKey: "seasonal-summer-enabled",
        enabledIcon: "✨",
        disabledIcon: "⭘",
        enabledTitle: "Disable fireflies",
        disabledTitle: "Enable fireflies",
        density: 20000,
        particleCreator: () => this.createFirefly(),
        drawer: (particle) => this.drawFirefly(particle),
      },
      spring: {
        name: "spring",
        storageKey: "seasonal-spring-enabled",
        enabledIcon: "🌸",
        disabledIcon: "⭘",
        enabledTitle: "Disable cherry blossoms",
        disabledTitle: "Enable cherry blossoms",
        density: 13000,
        particleCreator: () => this.createPetal(),
        drawer: (particle) => this.drawPetal(particle),
      },
      newyear: {
        name: "newyear",
        storageKey: "seasonal-newyear-enabled",
        enabledIcon: "🎉",
        disabledIcon: "⭘",
        enabledTitle: "Disable confetti",
        disabledTitle: "Enable confetti",
        density: 8000,
        particleCreator: () => this.createConfetti(),
        drawer: (particle) => this.drawConfetti(particle),
      },
      valentine: {
        name: "valentine",
        storageKey: "seasonal-valentine-enabled",
        enabledIcon: "💝",
        disabledIcon: "⭘",
        enabledTitle: "Disable hearts",
        disabledTitle: "Enable hearts",
        density: 18000,
        particleCreator: () => this.createHeart(),
        drawer: (particle) => this.drawHeart(particle),
      },
      july4th: {
        name: "july4th",
        storageKey: "seasonal-july4th-enabled",
        enabledIcon: "🎆",
        disabledIcon: "⭘",
        enabledTitle: "Disable fireworks",
        disabledTitle: "Enable fireworks",
        density: 25000,
        particleCreator: () => this.createFirework(),
        drawer: (particle) => this.drawFirework(particle),
      },
    };

    return configs[this.currentSeason] || null;
  }

  init() {
    if (!this.currentSeason) {
      return;
    }

    const config = this.getSeasonConfig();
    if (!config) return;

    // Check localStorage for saved preference (default to OFF)
    const savedPreference = localStorage.getItem(config.storageKey);
    this.enabled = savedPreference === "true"; // Default is false if not set

    this.createCanvas();
    this.createToggleButton();

    if (this.enabled) {
      this.start();
    }
  }

  createCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "seasonal-effects-canvas";
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

    if (this.enabled) {
      this.createParticles();
    }
  }

  createParticles() {
    const config = this.getSeasonConfig();
    if (!config) return;

    const density = Math.floor((this.canvas.width * this.canvas.height) / config.density);
    this.particles = [];

    for (let i = 0; i < density; i++) {
      // For fireworks, stagger the creation with delays
      if (this.currentSeason === "july4th") {
        const delayFrames = Math.floor(Math.random() * 120); // Random delay up to 2 seconds at 60fps
        this.particles.push(this.createFirework(delayFrames));
      } else {
        this.particles.push(config.particleCreator());
      }
    }
  }

  // Winter - Snowflakes
  createSnowflake() {
    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      radius: Math.random() * 9 + 6,
      speed: Math.random() * 0.5 + 0.3,
      drift: Math.random() * 0.5 - 0.25,
      opacity: Math.random() * 0.6 + 0.4,
      rotation: Math.random() * Math.PI * 2,
    };
  }

  drawSnowflake(particle) {
    this.ctx.save();
    this.ctx.translate(particle.x, particle.y);
    this.ctx.rotate(particle.rotation);
    this.ctx.strokeStyle = `rgba(173, 216, 230, ${particle.opacity})`;
    this.ctx.lineWidth = Math.max(particle.radius / 4, 0.5);
    this.ctx.lineCap = "round";

    for (let i = 0; i < 6; i++) {
      this.ctx.rotate(Math.PI / 3);
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(0, -particle.radius);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(0, -particle.radius * 0.6);
      this.ctx.lineTo(-particle.radius * 0.3, -particle.radius * 0.8);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(0, -particle.radius * 0.6);
      this.ctx.lineTo(particle.radius * 0.3, -particle.radius * 0.8);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  // Autumn - Leaves
  createLeaf() {
    const colors = [
      [180, 34, 34], // Firebrick red
      [255, 140, 0], // Dark orange
      [218, 165, 32], // Goldenrod
      [139, 69, 19], // Saddle brown
      [205, 92, 92], // Indian red
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];

    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      radius: Math.random() * 6 + 4,
      speed: Math.random() * 0.6 + 0.3, // Slower fall speed
      drift: Math.random() * 0.5 - 0.25, // Less horizontal drift
      opacity: Math.random() * 0.5 + 0.5,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.02, // Slower rotation
      swingSpeed: Math.random() * 0.001 + 0.0005, // Much slower swing for smoother motion
      swingAmount: Math.random() * 1 + 0.5, // Smaller swing amplitude
      swingOffset: Math.random() * Math.PI * 2, // Random starting phase
      color: color,
    };
  }

  drawLeaf(particle) {
    this.ctx.save();
    this.ctx.translate(particle.x, particle.y);
    this.ctx.rotate(particle.rotation);

    const [r, g, b] = particle.color;
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${particle.opacity})`;
    this.ctx.strokeStyle = `rgba(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)}, ${
      particle.opacity
    })`;
    this.ctx.lineWidth = 0.5;

    // Draw leaf shape
    this.ctx.beginPath();
    this.ctx.moveTo(0, -particle.radius);
    this.ctx.quadraticCurveTo(particle.radius * 0.8, -particle.radius * 0.3, particle.radius * 0.3, particle.radius);
    this.ctx.quadraticCurveTo(0, particle.radius * 0.7, -particle.radius * 0.3, particle.radius);
    this.ctx.quadraticCurveTo(-particle.radius * 0.8, -particle.radius * 0.3, 0, -particle.radius);
    this.ctx.fill();
    this.ctx.stroke();

    // Draw vein
    this.ctx.beginPath();
    this.ctx.moveTo(0, -particle.radius);
    this.ctx.lineTo(0, particle.radius);
    this.ctx.stroke();

    this.ctx.restore();
  }

  // Summer - Fireflies
  createFirefly() {
    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      radius: Math.random() * 3 + 2.5, // Larger base size
      speedX: (Math.random() - 0.5) * 0.5,
      speedY: (Math.random() - 0.5) * 0.5,
      opacity: Math.random() * 0.4 + 0.5, // Start with higher minimum opacity
      pulseSpeed: Math.random() * 0.05 + 0.02,
      pulsePhase: Math.random() * Math.PI * 2,
    };
  }

  drawFirefly(particle) {
    // Multi-layer glow effect for better visibility on white background
    const glowSize = particle.radius * 5;

    // Outer amber glow (more visible against white)
    const outerGradient = this.ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, glowSize);
    outerGradient.addColorStop(0, `rgba(255, 200, 50, ${particle.opacity * 0.7})`);
    outerGradient.addColorStop(0.3, `rgba(255, 180, 20, ${particle.opacity * 0.4})`);
    outerGradient.addColorStop(0.6, `rgba(200, 140, 0, ${particle.opacity * 0.2})`);
    outerGradient.addColorStop(1, "rgba(200, 140, 0, 0)");

    this.ctx.fillStyle = outerGradient;
    this.ctx.beginPath();
    this.ctx.arc(particle.x, particle.y, glowSize, 0, Math.PI * 2);
    this.ctx.fill();

    // Inner bright core
    const coreGradient = this.ctx.createRadialGradient(
      particle.x,
      particle.y,
      0,
      particle.x,
      particle.y,
      particle.radius * 2
    );
    coreGradient.addColorStop(0, `rgba(255, 240, 150, ${particle.opacity})`);
    coreGradient.addColorStop(0.5, `rgba(255, 200, 80, ${particle.opacity * 0.6})`);
    coreGradient.addColorStop(1, `rgba(255, 180, 20, 0)`);

    this.ctx.fillStyle = coreGradient;
    this.ctx.beginPath();
    this.ctx.arc(particle.x, particle.y, particle.radius * 2, 0, Math.PI * 2);
    this.ctx.fill();

    // Central bright dot
    this.ctx.fillStyle = `rgba(255, 255, 200, ${particle.opacity})`;
    this.ctx.beginPath();
    this.ctx.arc(particle.x, particle.y, particle.radius * 0.5, 0, Math.PI * 2);
    this.ctx.fill();
  }

  // Spring - Cherry Blossom Petals
  createPetal() {
    const colors = [
      [255, 182, 193], // Light pink
      [255, 192, 203], // Pink
      [255, 240, 245], // Lavender blush
      [255, 228, 225], // Misty rose
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];

    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      radius: Math.random() * 4 + 3,
      speed: Math.random() * 0.4 + 0.15, // Slower fall speed
      drift: Math.random() * 0.4 - 0.2, // Less horizontal drift
      opacity: Math.random() * 0.5 + 0.5,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.015, // Slower rotation
      swingSpeed: Math.random() * 0.0015 + 0.0005, // Much slower swing speed for smoother motion
      swingAmount: Math.random() * 0.8 + 0.3, // Smaller swing amplitude
      swingOffset: Math.random() * Math.PI * 2, // Random starting phase
      color: color,
    };
  }

  drawPetal(particle) {
    this.ctx.save();
    this.ctx.translate(particle.x, particle.y);
    this.ctx.rotate(particle.rotation);

    const [r, g, b] = particle.color;
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${particle.opacity})`;

    // Draw 5-petal flower shape
    for (let i = 0; i < 5; i++) {
      this.ctx.rotate((Math.PI * 2) / 5);
      this.ctx.beginPath();
      this.ctx.ellipse(0, -particle.radius * 0.4, particle.radius * 0.5, particle.radius * 0.8, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  // Special - New Year's Confetti
  createConfetti() {
    const colors = [
      [255, 0, 0], // Red
      [0, 0, 255], // Blue
      [255, 215, 0], // Gold
      [50, 205, 50], // Lime green
      [255, 20, 147], // Deep pink
      [138, 43, 226], // Blue violet
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];

    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      width: Math.random() * 8 + 4,
      height: Math.random() * 12 + 6,
      speed: Math.random() * 2 + 1,
      drift: Math.random() * 1 - 0.5,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      opacity: Math.random() * 0.6 + 0.4,
      color: color,
    };
  }

  drawConfetti(particle) {
    this.ctx.save();
    this.ctx.translate(particle.x, particle.y);
    this.ctx.rotate(particle.rotation);

    const [r, g, b] = particle.color;
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${particle.opacity})`;
    this.ctx.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);

    this.ctx.restore();
  }

  // Special - Valentine's Hearts
  createHeart() {
    const colors = [
      [255, 20, 147], // Deep pink
      [255, 105, 180], // Hot pink
      [255, 182, 193], // Light pink
      [220, 20, 60], // Crimson
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];

    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      size: Math.random() * 8 + 6,
      speed: Math.random() * 0.4 + 0.2,
      drift: Math.random() * 0.6 - 0.3,
      opacity: Math.random() * 0.5 + 0.4,
      rotation: Math.random() * 0.4 - 0.2,
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.03 + 0.02,
      color: color,
    };
  }

  drawHeart(particle) {
    const pulseFactor = 1 + Math.sin(particle.pulsePhase) * 0.1;
    const size = particle.size * pulseFactor;

    this.ctx.save();
    this.ctx.translate(particle.x, particle.y);
    this.ctx.rotate(particle.rotation);

    const [r, g, b] = particle.color;
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${particle.opacity})`;

    this.ctx.beginPath();
    this.ctx.moveTo(0, size * 0.3);
    this.ctx.bezierCurveTo(-size * 0.5, -size * 0.3, -size, -size * 0.1, -size * 0.5, size * 0.5);
    this.ctx.bezierCurveTo(-size * 0.5, size * 0.8, 0, size, 0, size);
    this.ctx.bezierCurveTo(0, size, size * 0.5, size * 0.8, size * 0.5, size * 0.5);
    this.ctx.bezierCurveTo(size, -size * 0.1, size * 0.5, -size * 0.3, 0, size * 0.3);
    this.ctx.fill();

    this.ctx.restore();
  }

  // Special - July 4th Fireworks
  createFirework(delayFrames = 0) {
    const colors = [
      [255, 0, 0], // Red
      [255, 255, 255], // White
      [0, 0, 255], // Blue
      [255, 215, 0], // Gold
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];

    // Create explosion center point
    const centerX = Math.random() * this.canvas.width;
    const centerY = Math.random() * this.canvas.height * 0.6 + 50; // Upper portion

    // Create particles for explosion
    const particleCount = Math.floor(Math.random() * 20 + 15);
    const particles = [];

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const speed = Math.random() * 2 + 1.5;

      particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: delayFrames > 0 ? 0 : 1.0, // Start with 0 life if delayed
        maxLife: 1.0,
        decay: Math.random() * 0.01 + 0.008,
      });
    }

    return {
      centerX: centerX,
      centerY: centerY,
      particles: particles,
      color: color,
      exploded: delayFrames === 0,
      sparkle: Math.random() > 0.3,
      delayFrames: delayFrames,
    };
  }

  drawFirework(firework) {
    const [r, g, b] = firework.color;

    // Draw each particle in the explosion
    for (const particle of firework.particles) {
      if (particle.life <= 0) continue;

      const radius = Math.max(1.5 * particle.life, 0.5);

      // Draw sparkle effect for some fireworks
      if (firework.sparkle) {
        const gradient = this.ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, radius * 4);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${particle.life * 0.8})`);
        gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${particle.life * 0.6})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(particle.x, particle.y, radius * 4, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Draw main particle
      this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${particle.life})`;
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  createToggleButton() {
    const config = this.getSeasonConfig();
    if (!config) return;

    const button = document.createElement("button");
    button.id = "seasonal-effects-toggle";
    button.innerHTML = this.enabled ? config.enabledIcon : config.disabledIcon;
    button.title = this.enabled ? config.enabledTitle : config.disabledTitle;
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
      button.innerHTML = this.enabled ? config.enabledIcon : config.disabledIcon;
      button.title = this.enabled ? config.enabledTitle : config.disabledTitle;
    });

    document.body.appendChild(button);
  }

  start() {
    const config = this.getSeasonConfig();
    if (!config) return;

    this.enabled = true;
    localStorage.setItem(config.storageKey, "true");

    if (!this.canvas) {
      this.createCanvas();
    }

    this.createParticles();
    this.animate();
  }

  stop() {
    const config = this.getSeasonConfig();
    if (!config) return;

    this.enabled = false;
    localStorage.setItem(config.storageKey, "false");

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

  updateParticle(particle) {
    const season = this.currentSeason;

    if (season === "winter") {
      particle.y += particle.speed;
      particle.x += particle.drift;
      particle.rotation += 0.01;
    } else if (season === "autumn") {
      particle.y += particle.speed;
      particle.swingOffset += particle.swingSpeed;
      particle.x += particle.drift + Math.sin(particle.swingOffset) * particle.swingAmount;
      particle.rotation += particle.rotationSpeed;
    } else if (season === "summer") {
      particle.x += particle.speedX;
      particle.y += particle.speedY;
      particle.pulsePhase += particle.pulseSpeed;
      particle.opacity = ((Math.sin(particle.pulsePhase) + 1) / 2) * 0.8 + 0.2;

      // Gentle random direction changes
      if (Math.random() < 0.01) {
        particle.speedX += (Math.random() - 0.5) * 0.1;
        particle.speedY += (Math.random() - 0.5) * 0.1;
      }
    } else if (season === "spring") {
      particle.y += particle.speed;
      particle.swingOffset += particle.swingSpeed;
      particle.x += particle.drift + Math.sin(particle.swingOffset) * particle.swingAmount;
      particle.rotation += particle.rotationSpeed;
    } else if (season === "newyear") {
      particle.y += particle.speed;
      particle.x += particle.drift;
      particle.rotation += particle.rotationSpeed;
    } else if (season === "valentine") {
      particle.y += particle.speed;
      particle.x += particle.drift;
      particle.pulsePhase += particle.pulseSpeed;
    } else if (season === "july4th") {
      // Handle delay countdown
      if (particle.delayFrames > 0) {
        particle.delayFrames--;
        if (particle.delayFrames === 0) {
          // Trigger explosion
          particle.exploded = true;
          for (const p of particle.particles) {
            p.life = p.maxLife;
          }
        }
        return; // Don't update particles while delayed
      }

      // Update explosion particles
      let allDead = true;
      for (const p of particle.particles) {
        if (p.life > 0) {
          allDead = false;
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.05; // Gravity
          p.life -= p.decay;
        }
      }

      // Mark for recreation if all particles are dead
      if (allDead) {
        particle._dead = true;
      }
    }

    // Wrap around logic
    if (season === "summer") {
      // Fireflies bounce off edges
      if (particle.x < 0 || particle.x > this.canvas.width) {
        particle.speedX *= -1;
        particle.x = Math.max(0, Math.min(this.canvas.width, particle.x));
      }
      if (particle.y < 0 || particle.y > this.canvas.height) {
        particle.speedY *= -1;
        particle.y = Math.max(0, Math.min(this.canvas.height, particle.y));
      }
    } else if (season !== "july4th") {
      // Most effects wrap around from top (except fireworks which recreate themselves)
      if (particle.y > this.canvas.height + 20) {
        particle.y = -20;
        particle.x = Math.random() * this.canvas.width;
      }

      if (particle.x > this.canvas.width + 20) {
        particle.x = -20;
      } else if (particle.x < -20) {
        particle.x = this.canvas.width + 20;
      }
    }
  }

  animate() {
    if (!this.enabled) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const config = this.getSeasonConfig();
    if (!config) return;

    // Handle firework recreation
    if (this.currentSeason === "july4th") {
      for (let i = 0; i < this.particles.length; i++) {
        if (this.particles[i]._dead) {
          // Create a new firework with a random delay to stagger explosions
          const delayFrames = Math.floor(Math.random() * 60); // 0-1 second delay
          this.particles[i] = this.createFirework(delayFrames);
        }
      }
    }

    for (const particle of this.particles) {
      this.updateParticle(particle);
      config.drawer(particle);
    }

    this.animationId = requestAnimationFrame(() => this.animate());
  }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  const effects = new SeasonalEffects();
  effects.init();
});
