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
      renderQuote(prevQuote); // Uses the wrapper to increment activeQuoteRequestId and preempt current loading
      this.isNavigating = false;
    }
    this.updateButtonState();
  },

  forward() {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      this.isNavigating = true;
      const nextQuote = this.history[this.currentIndex];
      renderQuote(nextQuote);
      this.isNavigating = false;
    }
    this.updateButtonState();
  },

  updateButtonState() {
    const btnBack = document.getElementById('btn-back');
    if (btnBack) {
      const canGoBack = this.currentIndex > 0;
      btnBack.disabled = !canGoBack;
      btnBack.style.opacity = canGoBack ? '1' : '0.5';
      btnBack.style.pointerEvents = canGoBack ? 'auto' : 'none';
    }

    const btnFresh = document.querySelector('.dock-btn.primary');
    if (btnFresh) {
      const canGoForward = this.currentIndex < this.history.length - 1;
      const span = btnFresh.querySelector('span');
      
      if (canGoForward) {
        btnFresh.setAttribute('data-action', 'history-forward');
        btnFresh.setAttribute('aria-label', 'Next Quote');
        if (span) span.textContent = 'Forward';
      } else {
        btnFresh.setAttribute('data-action', 'fresh-quote');
        btnFresh.setAttribute('aria-label', 'Get Fresh Quote');
        if (span) span.textContent = 'Fresh Quote';
      }
    }
  }
};
