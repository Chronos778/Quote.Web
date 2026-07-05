let ui = null;
let closeAllOverlays = () => {};
let showToast = () => {};

export const ImageGenerator = {
  activeTemplate: 'deep-void',
  currentBlob: null,

  templates: {
    'deep-void': {
      bg: '#050505',
      text: '#f3f4f6',
      author: '#a1a1aa',
      accent: '#8b5cf6',
      watermark: 'rgba(255,255,255,0.2)',
      grain: true,
      stars: true,
    },
    luminous: {
      bg: '#f8f7f4',
      text: '#1a1a1a',
      author: '#6b6b73',
      accent: '#d97706',
      watermark: 'rgba(0,0,0,0.2)',
      grain: false,
      stars: false,
    },
    'gradient-bliss': {
      bgGradient: ['#4c1d95', '#0f172a'],
      text: '#ffffff',
      author: '#cbd5e1',
      accent: 'rgba(255,255,255,0.3)',
      watermark: 'rgba(255,255,255,0.3)',
      grain: true,
      stars: false,
    },
  },

  init(config) {
    if (config?.ui) ui = config.ui;
    if (config?.closeAllOverlays) closeAllOverlays = config.closeAllOverlays;
    if (config?.showToast) showToast = config.showToast;
  },

  open() {
    closeAllOverlays();
    ui.backdrop.classList.add('active');
    document.getElementById('image-gen-modal').classList.add('active');
    this.render();
  },

  close() {
    const img = document.getElementById('image-gen-preview');
    if (img?.src?.startsWith('blob:')) {
      URL.revokeObjectURL(img.src);
      img.src = '';
    }
    this.currentBlob = null;
    document.getElementById('image-gen-modal').classList.remove('active');
    ui.backdrop.classList.remove('active');
  },

  selectTemplate(templateId) {
    this.activeTemplate = templateId;
    document.querySelectorAll('.template-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.template === templateId);
    });
    this.render();
  },

  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && i > 0) {
        ctx.fillText(line, x, currentY);
        line = words[i] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
    return currentY;
  },

  async render() {
    await document.fonts.ready;

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    const tpl = this.templates[this.activeTemplate];

    if (tpl.bgGradient) {
      const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
      grad.addColorStop(0, tpl.bgGradient[0]);
      grad.addColorStop(1, tpl.bgGradient[1]);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = tpl.bg;
    }
    ctx.fillRect(0, 0, 1080, 1080);

    if (tpl.stars) {
      ctx.fillStyle = 'white';
      for (let i = 0; i < 150; i++) {
        ctx.globalAlpha = Math.random() * 0.8;
        ctx.beginPath();
        ctx.arc(Math.random() * 1080, Math.random() * 1080, Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (tpl.grain) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let i = 0; i < 5000; i++) {
        ctx.fillRect(Math.random() * 1080, Math.random() * 1080, 2, 2);
      }
    }

    const quoteText = ui.text.innerText.replace(/^"|"$/g, '');
    const quoteAuthor = ui.author.innerText;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let fontSize = 80;
    if (quoteText.length < 50) fontSize = 100;
    else if (quoteText.length > 250) fontSize = 52;
    else if (quoteText.length > 150) fontSize = 64;

    ctx.font = `400 ${fontSize}px "Fraunces", serif`;
    ctx.fillStyle = tpl.text;

    const maxWidth = 800;
    const lineHeight = fontSize * 1.3;

    const words = quoteText.split(' ');
    let lines = 1;
    let lineForMeasure = '';
    for (let i = 0; i < words.length; i++) {
      const test = lineForMeasure + words[i] + ' ';
      if (ctx.measureText(test).width > maxWidth && i > 0) {
        lines++;
        lineForMeasure = words[i] + ' ';
      } else {
        lineForMeasure = test;
      }
    }

    const totalTextHeight = lines * lineHeight;
    let startY = (1080 - totalTextHeight) / 2 - 40;

    const endY = this.wrapText(ctx, quoteText, 540, startY, maxWidth, lineHeight);

    const accentY = endY + 80;
    ctx.fillStyle = tpl.accent;
    ctx.fillRect(540 - 40, accentY, 80, 4);

    ctx.font = `500 36px "Manrope", sans-serif`;
    ctx.fillStyle = tpl.author;
    ctx.fillText(quoteAuthor, 540, accentY + 60);

    ctx.font = `600 24px "Manrope", sans-serif`;
    ctx.fillStyle = tpl.watermark;
    ctx.fillText('Quote.Web', 540, 1020);

    canvas.toBlob((blob) => {
      this.currentBlob = blob;
      const url = URL.createObjectURL(blob);
      const img = document.getElementById('image-gen-preview');
      if (img.src && img.src.startsWith('blob:')) {
        URL.revokeObjectURL(img.src);
      }
      img.src = url;
    }, 'image/png');
  },

  async downloadImage() {
    if (!this.currentBlob) return;
    const url = URL.createObjectURL(this.currentBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quote-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  },

  async copyImage() {
    if (!this.currentBlob) return;
    try {
      if (navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': this.currentBlob }),
        ]);
        showToast('Image copied to clipboard');
      } else {
        showToast('Image copy not supported by your browser');
      }
    } catch (e) {
      console.error('Image copy failed', e);
      showToast('Failed to copy image');
    }
  },

  async shareImage() {
    if (!this.currentBlob) return;
    const file = new File([this.currentBlob], 'quote.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Daily Quote',
          text: 'Check out this quote!',
        });
      } catch (e) {
        if (e.name !== 'AbortError') console.error('Share failed', e);
      }
    } else {
      showToast('Native sharing not supported');
    }
  },
};
