let renderQuote = () => {};

export const HistoryManager = {
  history: [],
  currentIndex: -1,
  isNavigating: false,

  init(config) {
    if (config?.renderQuote) renderQuote = config.renderQuote;
  },

  add(quoteText, quoteAuthor) {
    if (this.isNavigating) return;

    // Trim future history if we were in the middle and got a fresh quote
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    this.history.push({ text: quoteText, author: quoteAuthor });
    
    // Keep max 50 items
    if (this.history.length > 50) {
      this.history.shift();
    }
    
    this.currentIndex = this.history.length - 1;
    this.updateButtonState();
  },

  back() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.isNavigating = true;
      const prevQuote = this.history[this.currentIndex];
      renderQuote(prevQuote, Date.now()); // Date.now() acts as requestId to preempt current loading
      this.isNavigating = false;
    }
    this.updateButtonState();
  },

  updateButtonState() {
    const btn = document.getElementById('btn-back');
    if (btn) {
      const canGoBack = this.currentIndex > 0;
      btn.disabled = !canGoBack;
      btn.style.opacity = canGoBack ? '1' : '0.5';
      btn.style.pointerEvents = canGoBack ? 'auto' : 'none';
    }
  }
};
