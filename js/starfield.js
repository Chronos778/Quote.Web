const STARFIELD_RESIZE_DEBOUNCE_MS = 150;
export class Starfield {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.stars = [];
    this.rafId = null;
    this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.isPageVisible = !document.hidden;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.init();
  }

  init() {
    this.resize();
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => requestAnimationFrame(() => this.resize()), STARFIELD_RESIZE_DEBOUNCE_MS);
    });
    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    this.createElements();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          if (this.isReducedMotion) this.drawStaticFrame();
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });

    if (this.isReducedMotion) {
      this.drawStaticFrame();
      return;
    }

    // Delay start to allow main thread to become idle for LCP/TTI
    setTimeout(() => {
      this.start();
    }, 2500);
  }

  resize() {
    // Batch layout reads
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    // Then batch writes (no interleaved reads)
    this.width = width;
    this.height = height;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.createElements();

    if (this.isReducedMotion) {
      this.drawStaticFrame();
    }
  }

  createElements() {
    this.stars = [];
    this.orbs = [];

    const isLowEnd = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency <= 4) || this.width < 768;
    const count = isLowEnd ? 40 : 220;
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: Math.random() * 2,
        speed: Math.random() * 0.5 + 0.1,
        opacity: Math.random(),
      });
    }

    const orbColors = [
      { r: 217, g: 119, b: 6, a: 0.4 }, 
      { r: 225, g: 29, b: 72, a: 0.3 }, 
      { r: 234, g: 179, b: 8, a: 0.35 }, 
    ];

    for (let i = 0; i < orbColors.length; i++) {
      this.orbs.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        radius: Math.random() * 200 + 400, 
        dx: (Math.random() - 0.5) * 0.5, 
        dy: (Math.random() - 0.5) * 0.5,
        color: orbColors[i],
      });
    }
  }

  drawStaticFrame() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

    if (isLight) {
      this.drawOrbs(false);
    } else {
      this.drawStars(false);
    }
  }

  drawOrbs(move) {
    this.orbs.forEach((orb) => {
      const gradient = this.ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius);
      gradient.addColorStop(0, `rgba(${orb.color.r}, ${orb.color.g}, ${orb.color.b}, ${orb.color.a})`);
      gradient.addColorStop(1, `rgba(${orb.color.r}, ${orb.color.g}, ${orb.color.b}, 0)`);

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
      this.ctx.fill();

      if (move) {
        orb.x += orb.dx;
        orb.y += orb.dy;

        if (orb.x - orb.radius > this.width || orb.x + orb.radius < 0) orb.dx *= -1;
        if (orb.y - orb.radius > this.height || orb.y + orb.radius < 0) orb.dy *= -1;
      }
    });
  }

  drawStars(move) {
    this.ctx.fillStyle = 'white';

    this.stars.forEach((star) => {
      this.ctx.globalAlpha = star.opacity;
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      this.ctx.fill();

      if (move) {
        star.y -= star.speed;
        if (star.y < 0) {
          star.y = this.height;
          star.x = Math.random() * this.width;
        }
      }
    });
    this.ctx.globalAlpha = 1;
  }

  handleVisibilityChange() {
    this.isPageVisible = !document.hidden;
    if (this.isReducedMotion) {
      return;
    }

    if (this.isPageVisible) {
      this.start();
    } else {
      this.stop();
    }
  }

  start() {
    if (this.rafId !== null) return;
    this.animate();
  }

  stop() {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  animate() {
    if (!this.isPageVisible || this.isReducedMotion) {
      this.rafId = null;
      return;
    }

    this.ctx.clearRect(0, 0, this.width, this.height);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

    if (isLight) {
      this.drawOrbs(true);
    } else {
      this.drawStars(true);
    }

    this.rafId = requestAnimationFrame(() => this.animate());
  }
}
