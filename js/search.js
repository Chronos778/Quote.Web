import { fetchSearchPayload, normalizeSearchResponse, mergeSearchResults, getSearchErrorMessage } from './api.js';

export const SearchManager = {
  SEARCH_PAGE_SIZE: 20,
  SEARCH_LIMIT_OPTIONS: [20, 40, 60],
  SEARCH_DEBOUNCE_MS: 300,
  VALID_SEARCH_SORT_FIELDS: ['author', 'text'],
  VALID_SEARCH_ORDERS: ['asc', 'desc'],

  searchTimeout: null,
  activeSearchRequestId: 0,
  selectedSearchIndex: -1,
  currentSearchAbortController: null,
  
  ui: null,
  onSelectQuote: null,
  onFetchNewQuote: null,

  searchState: {
    query: '',
    page: 1,
    hasMore: false,
    isLoading: false,
    results: [],
    total: null,
    filters: {
      author: '',
      sort: '',
      order: 'desc',
      limit: 20,
    },
  },

  init({ ui, onSelectQuote, onFetchNewQuote }) {
    this.ui = ui;
    this.onSelectQuote = onSelectQuote;
    this.onFetchNewQuote = onFetchNewQuote;

    if (this.ui.cmdInput) {
      this.ui.cmdInput.addEventListener('input', () => {
        this.selectedSearchIndex = -1;
        this.handleSearch();
      });
    }

    if (this.ui.cmdAuthor) {
      this.ui.cmdAuthor.addEventListener('input', () => {
        this.selectedSearchIndex = -1;
        this.handleSearch();
      });
    }

    if (this.ui.cmdSort) {
      this.ui.cmdSort.addEventListener('change', () => {
        this.selectedSearchIndex = -1;
        this.handleSearch();
      });
    }

    if (this.ui.cmdOrder) {
      this.ui.cmdOrder.addEventListener('change', () => {
        this.selectedSearchIndex = -1;
        this.handleSearch();
      });
    }

    if (this.ui.cmdLimit) {
      this.ui.cmdLimit.value = String(this.SEARCH_PAGE_SIZE);
      this.ui.cmdLimit.addEventListener('change', () => {
        this.selectedSearchIndex = -1;
        this.handleSearch();
      });
    }
  },

  sanitizeSearchFilters(filters) {
    const candidateSort = (filters?.sort || '').trim();
    const candidateOrder = (filters?.order || '').trim().toLowerCase();
    const parsedLimit = Number(filters?.limit || this.SEARCH_PAGE_SIZE);
  
    return {
      author: (filters?.author || '').trim(),
      sort: this.VALID_SEARCH_SORT_FIELDS.includes(candidateSort) ? candidateSort : '',
      order: this.VALID_SEARCH_ORDERS.includes(candidateOrder) ? candidateOrder : 'desc',
      limit: this.SEARCH_LIMIT_OPTIONS.includes(parsedLimit) ? parsedLimit : this.SEARCH_PAGE_SIZE,
    };
  },

  resetSearchState(query = '') {
    this.searchState.query = query;
    this.searchState.page = 1;
    this.searchState.hasMore = false;
    this.searchState.isLoading = false;
    this.searchState.results = [];
    this.searchState.total = null;
    this.searchState.filters = this.getSearchFiltersFromUI();
  },

  setSelectedSearchIndex(index) {
    const items = this.ui.cmdResults.querySelectorAll('.cmd-item[role="option"]');
  
    if (items.length === 0) {
      this.selectedSearchIndex = -1;
      this.ui.cmdInput.setAttribute('aria-activedescendant', '');
      return;
    }
  
    if (index < 0) {
      this.selectedSearchIndex = -1;
    } else {
      this.selectedSearchIndex = Math.min(index, items.length - 1);
    }
  
    items.forEach((item, itemIndex) => {
      const isSelected = itemIndex === this.selectedSearchIndex;
      item.classList.toggle('selected', isSelected);
      item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  
      if (isSelected) {
        item.scrollIntoView({ block: 'nearest' });
        this.ui.cmdInput.setAttribute('aria-activedescendant', item.id || '');
      }
    });
  
    if (this.selectedSearchIndex < 0) {
      this.ui.cmdInput.setAttribute('aria-activedescendant', '');
    }
  },

  getSearchFiltersFromUI() {
    return this.sanitizeSearchFilters({
      author: this.ui.cmdAuthor?.value || '',
      sort: this.ui.cmdSort?.value || '',
      order: this.ui.cmdOrder?.value || 'desc',
      limit: this.ui.cmdLimit?.value || this.SEARCH_PAGE_SIZE,
    });
  },

  isSearchInputActive() {
    const query = this.ui.cmdInput.value.trim();
    const author = (this.ui.cmdAuthor?.value || '').trim();
    return query.length >= 2 || author.length >= 2;
  },

  updateSearchMeta(resultsCount, { isLoading = false, errorMessage = '' } = {}) {
    if (!this.ui.cmdMeta) return;
  
    if (errorMessage) {
      this.ui.cmdMeta.textContent = errorMessage;
      return;
    }
  
    if (!this.isSearchInputActive()) {
      this.ui.cmdMeta.textContent = 'Type at least 2 characters in query or author.';
      return;
    }
  
    if (isLoading && resultsCount === 0) {
      this.ui.cmdMeta.textContent = 'Searching...';
      return;
    }
  
    const parts = [
      `${resultsCount} result${resultsCount === 1 ? '' : 's'}`,
      `page ${this.searchState.page}`,
    ];
  
    if (this.searchState.total !== null) {
      parts.push(`${this.searchState.total} total`);
    }
  
    if (this.searchState.hasMore) {
      parts.push('more available');
    }
  
    const filterSummary = [];
    if (this.searchState.filters.author) filterSummary.push(`author: ${this.searchState.filters.author}`);
    if (this.searchState.filters.sort)
      filterSummary.push(`sort: ${this.searchState.filters.sort} ${this.searchState.filters.order}`);
    filterSummary.push(`limit: ${this.searchState.filters.limit}`);
  
    this.ui.cmdMeta.textContent = `${parts.join(' · ')} · ${filterSummary.join(' · ')}`;
  },

  async runSearch(query, { append = false } = {}) {
    if (append && this.searchState.isLoading) return;
  
    if (this.currentSearchAbortController) {
      this.currentSearchAbortController.abort();
    }
  
    this.currentSearchAbortController = new AbortController();
    const { signal } = this.currentSearchAbortController;
  
    const filters = append ? this.searchState.filters : this.getSearchFiltersFromUI();
    const requestedPage = append ? this.searchState.page + 1 : 1;
    const requestId = ++this.activeSearchRequestId;
  
    if (!append) {
      this.resetSearchState(query);
    }
  
    this.searchState.filters = filters;
    this.searchState.isLoading = true;
    this.renderSearchResults(this.searchState.results, { isLoading: true, canLoadMore: false });
  
    try {
      const json = await fetchSearchPayload(query, requestedPage, filters, { signal });
  
      if (requestId !== this.activeSearchRequestId) return;
  
      const normalized = normalizeSearchResponse(json, requestedPage, filters.limit);
  
      this.searchState.query = query;
      this.searchState.page = normalized.page;
      this.searchState.hasMore = normalized.hasMore;
      this.searchState.total = normalized.total;
      this.searchState.results = append
        ? mergeSearchResults(this.searchState.results, normalized.results)
        : normalized.results;
  
      this.renderSearchResults(this.searchState.results, {
        canLoadMore: this.searchState.hasMore,
        isLoading: false,
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        console.debug('Search request canceled (aborted for a newer request).');
        return;
      }
  
      if (requestId !== this.activeSearchRequestId) return;
  
      console.warn('Search failed', error);
  
      const message = getSearchErrorMessage(error);
  
      if (append && this.searchState.results.length > 0) {
        this.renderSearchResults(this.searchState.results, {
          errorMessage: `Could not load more results. ${message}`,
          canLoadMore: false,
          isLoading: false,
        });
        return;
      }
  
      this.renderSearchResults(this.searchState.results, {
        errorMessage: message,
        canLoadMore: false,
        isLoading: false,
      });
    } finally {
      if (requestId === this.activeSearchRequestId) {
        this.searchState.isLoading = false;
      }
  
      if (this.currentSearchAbortController?.signal === signal) {
        this.currentSearchAbortController = null;
      }
    }
  },

  loadMoreSearchResults() {
    if (!this.searchState.query || !this.searchState.hasMore || this.searchState.isLoading) return;
    this.runSearch(this.searchState.query, { append: true });
  },

  handleSearch() {
    const query = this.ui.cmdInput.value.trim();
  
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
  
    if (!this.isSearchInputActive()) {
      if (this.currentSearchAbortController) {
        this.currentSearchAbortController.abort();
        this.currentSearchAbortController = null;
      }
  
      this.activeSearchRequestId++;
      this.resetSearchState(query);
      this.selectedSearchIndex = -1;
      this.renderSearchResults([]);
      return;
    }
  
    this.searchTimeout = setTimeout(() => {
      this.runSearch(query);
    }, this.SEARCH_DEBOUNCE_MS);
  },

  renderSearchResults(
    results,
    { isLoading = false, canLoadMore = false, errorMessage = '' } = {}
  ) {
    this.ui.cmdResults.innerHTML = '';
    this.selectedSearchIndex = -1;
    const hasActiveQuery = this.isSearchInputActive();
  
    this.updateSearchMeta(results.length, { isLoading, errorMessage });
  
    if (errorMessage && results.length === 0) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'cmd-item cmd-item-error';
      errorDiv.setAttribute('role', 'status');
      errorDiv.setAttribute('aria-live', 'assertive');
      errorDiv.textContent = errorMessage;
      this.ui.cmdResults.appendChild(errorDiv);
      return;
    }
  
    if (results.length === 0 && hasActiveQuery && isLoading) {
      const searchingDiv = document.createElement('div');
      searchingDiv.className = 'cmd-item cmd-item-muted';
      searchingDiv.setAttribute('role', 'status');
      searchingDiv.setAttribute('aria-live', 'polite');
      searchingDiv.textContent = 'Searching...';
      this.ui.cmdResults.appendChild(searchingDiv);
      return;
    }
  
    if (results.length === 0 && hasActiveQuery) {
      const noMatchDiv = document.createElement('div');
      noMatchDiv.className = 'cmd-item cmd-item-muted';
      noMatchDiv.setAttribute('role', 'status');
      noMatchDiv.setAttribute('aria-live', 'polite');
      noMatchDiv.textContent = 'No matches found.';
      this.ui.cmdResults.appendChild(noMatchDiv);
      return;
    }
  
    if (results.length === 0) {
      const fallbackAction = document.createElement('button');
      fallbackAction.type = 'button';
      fallbackAction.className = 'cmd-item';
      fallbackAction.id = 'cmd-item-fallback-action';
      fallbackAction.setAttribute('role', 'option');
      fallbackAction.innerHTML = `
              <span>Fetch new random quote</span>
              <span class="cmd-kbd">Space</span>
          `;
      fallbackAction.onclick = () => {
        if (this.onFetchNewQuote) this.onFetchNewQuote();
      };
      this.ui.cmdResults.appendChild(fallbackAction);
      this.setSelectedSearchIndex(0);
      return;
    }
  
    const fragment = document.createDocumentFragment();
  
    results.forEach((quote, index) => {
      const resultButton = document.createElement('button');
      resultButton.type = 'button';
      resultButton.className = 'cmd-item';
      resultButton.id = `cmd-item-result-${index}`;
      resultButton.setAttribute('role', 'option');
  
      const content = document.createElement('div');
      content.className = 'cmd-result-content';
  
      const text = document.createElement('span');
      text.className = 'cmd-result-text';
      text.textContent = quote.text;
  
      const author = document.createElement('span');
      author.className = 'cmd-result-author';
      author.textContent = quote.author;
  
      content.appendChild(text);
      content.appendChild(author);
      resultButton.appendChild(content);
  
      resultButton.onclick = () => {
        if (this.onSelectQuote) this.onSelectQuote(quote);
      };
  
      fragment.appendChild(resultButton);
    });
  
    if (canLoadMore) {
      const loadMore = document.createElement('button');
      loadMore.type = 'button';
      loadMore.className = 'cmd-item is-load-more';
      loadMore.id = `cmd-item-load-more-${this.searchState.page}`;
      loadMore.setAttribute('role', 'option');
      loadMore.innerHTML = `
              <span>Load more results</span>
              <span class="cmd-kbd">Enter</span>
          `;
      loadMore.onclick = () => this.loadMoreSearchResults();
      fragment.appendChild(loadMore);
    }
  
    if (isLoading) {
      const loading = document.createElement('div');
      loading.className = 'cmd-item cmd-item-muted';
      loading.setAttribute('role', 'status');
      loading.setAttribute('aria-live', 'polite');
      loading.textContent = 'Loading more...';
      fragment.appendChild(loading);
    }
  
    if (errorMessage) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'cmd-item cmd-item-error';
      errorDiv.setAttribute('role', 'status');
      errorDiv.setAttribute('aria-live', 'assertive');
      errorDiv.textContent = errorMessage;
      fragment.appendChild(errorDiv);
    }
  
    this.ui.cmdResults.appendChild(fragment);
    this.setSelectedSearchIndex(0);
  },

  handleKeyDown(e) {
    const items = this.ui.cmdResults.querySelectorAll('.cmd-item[role="option"]');
    if (items.length === 0) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = this.selectedSearchIndex < 0 ? 0 : (this.selectedSearchIndex + 1) % items.length;
      this.setSelectedSearchIndex(nextIndex);
      return true;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex =
        this.selectedSearchIndex < 0
          ? items.length - 1
          : (this.selectedSearchIndex - 1 + items.length) % items.length;
      this.setSelectedSearchIndex(prevIndex);
      return true;
    } else if (e.key === 'Home') {
      e.preventDefault();
      this.setSelectedSearchIndex(0);
      return true;
    } else if (e.key === 'End') {
      e.preventDefault();
      this.setSelectedSearchIndex(items.length - 1);
      return true;
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      const nextPageIndex =
        this.selectedSearchIndex < 0 ? 0 : Math.min(this.selectedSearchIndex + 5, items.length - 1);
      this.setSelectedSearchIndex(nextPageIndex);
      return true;
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      const prevPageIndex = this.selectedSearchIndex < 0 ? 0 : Math.max(this.selectedSearchIndex - 5, 0);
      this.setSelectedSearchIndex(prevPageIndex);
      return true;
    } else if (e.key === ' ') {
      if (this.selectedSearchIndex < 0 && !this.isSearchInputActive()) {
        e.preventDefault();
        if (items[0]) {
          items[0].click();
        }
        return true;
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.selectedSearchIndex >= 0 && items[this.selectedSearchIndex]) {
        items[this.selectedSearchIndex].click();
      } else if (items[0]) {
        items[0].click();
      }
      return true;
    }
    return false;
  }
};
