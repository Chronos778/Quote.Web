let ui = null;
let showToast = () => {};

export const FavoritesManager = {
  favorites: [],

  init(config) {
    if (config?.ui) ui = config.ui;
    if (config?.showToast) showToast = config.showToast;

    const stored = localStorage.getItem('favorites');
    if (stored) {
      try {
        this.favorites = JSON.parse(stored);
      } catch {
        this.favorites = [];
      }
    }
    
    // Listen for current quote to update button state
    this.updateButtonState();
  },

  getCurrentQuoteObj() {
    return {
      text: ui.text.innerText.replace(/^"|"$/g, ''),
      author: ui.author.innerText
    };
  },

  isFavorite(quoteText, quoteAuthor) {
    return this.favorites.some(f => f.text === quoteText && f.author === quoteAuthor);
  },

  updateButtonState() {
    const btn = document.getElementById('icon-favorite');
    if (!btn) return;
    
    const quote = this.getCurrentQuoteObj();
    const isFav = this.isFavorite(quote.text, quote.author);
    
    btn.classList.toggle('filled', isFav);
    btn.style.color = isFav ? 'var(--accent-light)' : 'inherit';
  },

  toggle() {
    const quote = this.getCurrentQuoteObj();
    if (!quote.text || quote.text === '...') return; // Skip if loading

    const index = this.favorites.findIndex(f => f.text === quote.text && f.author === quote.author);
    
    if (index >= 0) {
      this.favorites.splice(index, 1);
      showToast('Removed from favorites');
    } else {
      this.favorites.unshift({ text: quote.text, author: quote.author, date: Date.now() });
      showToast('Added to favorites');
    }
    
    localStorage.setItem('favorites', JSON.stringify(this.favorites));
    this.updateButtonState();
    this.renderList();
  },

  remove(text, author) {
    this.favorites = this.favorites.filter(f => !(f.text === text && f.author === author));
    localStorage.setItem('favorites', JSON.stringify(this.favorites));
    this.updateButtonState();
    this.renderList();
  },

  renderList() {
    // If the drawer is showing favorites, update it
    if (ui.drawer.dataset.currentView !== 'favorites') return;
    
    if (this.favorites.length === 0) {
      ui.drawerBody.innerHTML = '<div class="drawer-empty">No favorites yet.</div>';
      return;
    }

    ui.drawerBody.innerHTML = this.favorites.map((f, i) => `
      <div class="cmd-item" tabindex="0" data-action="render-favorite" data-index="${i}">
        <div class="cmd-item-content">
          <div class="cmd-item-text">"${f.text}"</div>
          <div class="cmd-item-author">${f.author}</div>
        </div>
      </div>
    `).join('');
  }
};
