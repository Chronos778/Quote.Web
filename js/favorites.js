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
      text: ui.text.textContent.replace(/^"|"$/g, ''),
      author: ui.author.textContent
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

    const fragment = document.createDocumentFragment();
    this.favorites.forEach((f, i) => {
      const item = document.createElement('div');
      item.className = 'cmd-item';
      item.tabIndex = 0;
      item.setAttribute('data-action', 'render-favorite');
      item.setAttribute('data-index', String(i));

      const content = document.createElement('div');
      content.className = 'cmd-item-content';

      const text = document.createElement('div');
      text.className = 'cmd-item-text';
      text.textContent = `"${f.text}"`;

      const author = document.createElement('div');
      author.className = 'cmd-item-author';
      author.textContent = f.author;

      content.appendChild(text);
      content.appendChild(author);
      item.appendChild(content);
      fragment.appendChild(item);
    });
    ui.drawerBody.innerHTML = '';
    ui.drawerBody.appendChild(fragment);
  }
};
