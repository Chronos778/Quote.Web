// --- Starfield Animation (Canvas) ---
const STARFIELD_RESIZE_DEBOUNCE_MS = 150;
class Starfield {
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
      resizeTimer = setTimeout(() => this.resize(), STARFIELD_RESIZE_DEBOUNCE_MS);
    });
    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    this.createStars();

    if (this.isReducedMotion) {
      this.drawStaticFrame();
      return;
    }

    this.start();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.createStars();

    if (this.isReducedMotion) {
      this.drawStaticFrame();
    }
  }

  createStars() {
    this.stars = [];
    const count = this.width < 768 ? 80 : 220;

    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: Math.random() * 2,
        speed: Math.random() * 0.5 + 0.1,
        opacity: Math.random(),
      });
    }
  }

  drawStaticFrame() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    this.ctx.fillStyle = isLight ? 'rgba(0,0,0,0.15)' : 'white';

    this.stars.forEach((star) => {
      this.ctx.globalAlpha = star.opacity;
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      this.ctx.fill();
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
    this.ctx.fillStyle = isLight ? 'rgba(0,0,0,0.15)' : 'white';

    this.stars.forEach((star) => {
      this.ctx.globalAlpha = star.opacity;
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      this.ctx.fill();

      // Move star
      star.y -= star.speed;

      // Reset if off screen
      if (star.y < 0) {
        star.y = this.height;
        star.x = Math.random() * this.width;
      }
    });

    this.ctx.globalAlpha = 1;
    this.rafId = requestAnimationFrame(() => this.animate());
  }
}

// --- Application State & Logic ---

const DEFAULT_API_BASE = 'https://quotes-api-ruddy.vercel.app';
const OFFLINE_QUOTES_PATH = './assets/data/offline-quotes.json';
const OFFLINE_QUOTES_RETRY_INTERVAL_MS = 60 * 1000;
const SEARCH_PAGE_SIZE = 20;
const MAX_RATE_LIMIT_RETRIES = 2;
const SEARCH_LIMIT_OPTIONS = [20, 40, 60];
const SEARCH_DEBOUNCE_MS = 300;
const QUOTE_RENDER_DELAY_MS = 300;
const TOAST_DURATION_MS = 2000;
const RATE_LIMIT_BASE_DELAY_MS = 500;
const NETWORK_RETRY_BASE_DELAY_MS = 300;
const VALID_SEARCH_SORT_FIELDS = ['author', 'text'];
const VALID_SEARCH_ORDERS = ['asc', 'desc'];
let searchTimeout;
let activeSearchRequestId = 0;
let offlineQuoteCache = null;
let offlineQuoteCacheSource = 'none';
let lastOfflineQuotesFetchAttemptAt = 0;
let selectedSearchIndex = -1;
let lastFocusedElementBeforeOverlay = null;
let activeQuoteRequestId = 0;
let toastTimeoutId = null;
let currentSearchAbortController = null;

function readRuntimeConfig() {
  const metaApiBase = document
    .querySelector('meta[name="quote-web-api-base"]')
    ?.getAttribute('content')
    ?.trim();

  const globalApiBase = window?.QUOTE_WEB_CONFIG?.apiBaseUrl?.trim();
  const candidateApiBase = globalApiBase || metaApiBase || DEFAULT_API_BASE;

  try {
    const normalized = new URL(candidateApiBase);
    return { apiBaseUrl: normalized.origin };
  } catch {
    console.warn('Invalid API base URL runtime configuration. Falling back to default.');
    return { apiBaseUrl: DEFAULT_API_BASE };
  }
}

const { apiBaseUrl: API_BASE } = readRuntimeConfig();

function sanitizeSearchFilters(filters) {
  const candidateSort = (filters?.sort || '').trim();
  const candidateOrder = (filters?.order || '').trim().toLowerCase();
  const parsedLimit = Number(filters?.limit || SEARCH_PAGE_SIZE);

  return {
    author: (filters?.author || '').trim(),
    sort: VALID_SEARCH_SORT_FIELDS.includes(candidateSort) ? candidateSort : '',
    order: VALID_SEARCH_ORDERS.includes(candidateOrder) ? candidateOrder : 'desc',
    limit: SEARCH_LIMIT_OPTIONS.includes(parsedLimit) ? parsedLimit : SEARCH_PAGE_SIZE,
  };
}

const searchState = {
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
    limit: SEARCH_PAGE_SIZE,
  },
};

class ApiError extends Error {
  constructor(status, message, payload = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toApiUrl(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function fetchApiJson(path, { params = {}, retries = MAX_RATE_LIMIT_RETRIES, signal } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(toApiUrl(path, params), {
        headers: { Accept: 'application/json' },
        signal,
      });

      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : await response.text().catch(() => null);

      if (response.ok) {
        return payload;
      }

      if (response.status === 429 && attempt < retries) {
        const retryAfterHeader = Number(response.headers.get('Retry-After'));
        const retryDelayMs =
          Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
            ? retryAfterHeader * 1000
            : RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt);
        const jitterMs = Math.floor(Math.random() * 150);
        await wait(retryDelayMs + jitterMs);
        continue;
      }

      const message =
        payload && typeof payload === 'object' ? payload.message || payload.error : null;

      throw new ApiError(
        response.status,
        message || `Request failed with status ${response.status}`,
        payload
      );
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw error;
      }

      lastError = error;

      if (attempt < retries && !(error instanceof ApiError)) {
        await wait(NETWORK_RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }

      break;
    }
  }

  throw lastError || new Error('Unknown API error');
}

function normalizeQuote(quote) {
  if (!quote || typeof quote !== 'object') return null;

  const text = quote.text || quote.quote || quote.content;
  if (!text) return null;

  return {
    ...quote,
    text,
    author: quote.author || quote.authorName || 'Unknown',
  };
}

let ui = {};

const content = {
  about: `
        <div class="drawer-header"><h2 class="drawer-title">About</h2></div>
        <p>Quote.Web is a curated digital space designed to focus on the power of words. We removed the clutter to let the thoughts stand out.</p>
        <p>Powered by our custom <strong>Quotes API</strong>, utilized by developers worldwide to serve inspiration on demand.</p>
        <p>Version 2.3.0 — Search & API compatibility upgrade.</p>
    `,
  contact: `
        <div class="drawer-header"><h2 class="drawer-title">Contact</h2></div>
        <p>Have a suggestion or found a bug? I'd love to hear from you.</p>
        <p>Email: <a href="mailto:maithilpatil9@gmail.com">maithilpatil9@gmail.com</a></p>
        <p>GitHub: <a href="https://github.com/Chronos778" target="_blank" rel="noopener noreferrer">Chronos778</a></p>
    `,
};

// --- Core functions ---

async function fetchQOD() {
  const requestId = ++activeQuoteRequestId;

  ui.text.classList.add('loading');
  ui.author.parentElement.classList.add('loading');
  if (ui.badge) ui.badge.innerText = 'Quote of the Day';

  try {
    const json = await fetchApiJson('/quotes/qod');
    const quote = normalizeQuote(json?.data);

    if (json?.success && quote) {
      if (requestId !== activeQuoteRequestId) return;
      renderQuote(quote, requestId);
      return;
    }

    if (requestId !== activeQuoteRequestId) return;
    await fetchNewQuote();
  } catch (error) {
    console.error('Failed to fetch QOD', error);

    if (error instanceof ApiError && error.status === 429) {
      await renderOfflineQuote('Rate limited · Offline', requestId);
      return;
    }

    if (requestId !== activeQuoteRequestId) return;
    await fetchNewQuote();
  }
}

// Fallback quotes for offline usage
const fallbackOfflineQuotes = [
  {
    text: 'The only limit to our realization of tomorrow is our doubts of today.',
    author: 'Franklin D. Roosevelt',
  },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'The best way to predict the future is to create it.', author: 'Peter Drucker' },
  { text: "Believe you can and you're halfway there.", author: 'Theodore Roosevelt' },
  {
    text: 'Success is not final, failure is not fatal: It is the courage to continue that counts.',
    author: 'Winston Churchill',
  },
  {
    text: 'Great things are done by a series of small things brought together.',
    author: 'Vincent Van Gogh',
  },
  { text: 'No one can make you feel inferior without your consent.', author: 'Eleanor Roosevelt' },
  { text: 'Creativity is intelligence having fun.', author: 'Albert Einstein' },
];

async function getOfflineQuotesPool() {
  if (
    Array.isArray(offlineQuoteCache) &&
    offlineQuoteCache.length > 0 &&
    offlineQuoteCacheSource === 'file'
  ) {
    return offlineQuoteCache;
  }

  const hasCachedFallback =
    Array.isArray(offlineQuoteCache) &&
    offlineQuoteCache.length > 0 &&
    offlineQuoteCacheSource === 'fallback';
  const now = Date.now();
  const shouldRetryFileFetch =
    offlineQuoteCacheSource !== 'fallback' ||
    now - lastOfflineQuotesFetchAttemptAt >= OFFLINE_QUOTES_RETRY_INTERVAL_MS ||
    navigator.onLine;

  if (!shouldRetryFileFetch && hasCachedFallback) {
    return offlineQuoteCache;
  }

  try {
    lastOfflineQuotesFetchAttemptAt = now;
    const response = await fetch(OFFLINE_QUOTES_PATH, { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`Offline quote file unavailable (${response.status})`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Offline quote file has invalid shape');
    }

    const normalized = payload.map(normalizeQuote).filter(Boolean);

    if (normalized.length > 0) {
      offlineQuoteCache = normalized;
      offlineQuoteCacheSource = 'file';
      return normalized;
    }
  } catch (error) {
    console.warn('Falling back to in-bundle offline quotes', error);
  }

  offlineQuoteCache = fallbackOfflineQuotes;
  offlineQuoteCacheSource = 'fallback';
  return fallbackOfflineQuotes;
}

async function fetchNewQuote() {
  const requestId = ++activeQuoteRequestId;

  ui.text.classList.add('loading');
  ui.author.parentElement.classList.add('loading');
  if (ui.badge) ui.badge.innerText = 'Random Inspiration';

  try {
    const json = await fetchApiJson('/quotes/random');
    const quote = normalizeQuote(json?.data);

    if (!quote) {
      throw new Error('Unexpected API payload');
    }

    if (requestId !== activeQuoteRequestId) return;
    renderQuote(quote, requestId);
  } catch (error) {
    console.warn('Using offline quote due to:', error.message);
    if (error instanceof ApiError && error.status === 429) {
      await renderOfflineQuote('Rate limited · Offline', requestId);
      return;
    }

    await renderOfflineQuote('Offline Inspiration', requestId);
  }
}

async function renderOfflineQuote(label = 'Offline Inspiration', requestId = activeQuoteRequestId) {
  const pool = await getOfflineQuotesPool();
  if (requestId !== activeQuoteRequestId) return;

  const randomQuote = pool[Math.floor(Math.random() * pool.length)] || {
    text: 'Stay curious and keep building.',
    author: 'Quote.Web',
  };
  renderQuote(randomQuote, requestId);
  if (ui.badge) ui.badge.innerText = label;
}

function renderQuote(data, requestId = activeQuoteRequestId) {
  setTimeout(() => {
    if (requestId !== activeQuoteRequestId) return;

    ui.text.innerText = `"${data.text}"`;
    ui.author.innerText = data.author || 'Unknown';

    // Responsive Font Sizing
    const len = data.text.length;
    if (len < 50) {
      ui.text.style.fontSize = 'clamp(32px, 5vw, 56px)';
    } else if (len < 100) {
      ui.text.style.fontSize = 'clamp(24px, 4vw, 42px)';
    } else if (len < 200) {
      ui.text.style.fontSize = 'clamp(20px, 3.5vw, 36px)';
    } else {
      ui.text.style.fontSize = 'clamp(18px, 2.5vw, 24px)';
    }

    ui.text.classList.remove('loading');
    ui.author.parentElement.classList.remove('loading');
  }, QUOTE_RENDER_DELAY_MS);
}

async function copyQuote() {
  const textToCopy = ui.text.innerText + ' — ' + ui.author.innerText;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(textToCopy);
      showToast('Copied to clipboard');
      return true;
    }

    const fallbackInput = document.createElement('textarea');
    fallbackInput.value = textToCopy;
    fallbackInput.setAttribute('readonly', 'true');
    fallbackInput.style.position = 'fixed';
    fallbackInput.style.opacity = '0';
    document.body.appendChild(fallbackInput);

    try {
      fallbackInput.select();
      const success = document.execCommand('copy');

      if (!success) {
        throw new Error('Clipboard command was rejected');
      }
    } finally {
      fallbackInput.remove();
    }

    showToast('Copied to clipboard');
    return true;
  } catch (error) {
    console.error('Copy failed', error);
    showToast('Copy failed');
    return false;
  }
}

async function shareQuote() {
  const payload = {
    title: 'Daily Inspiration',
    text: ui.text.innerText + ' — ' + ui.author.innerText,
    url: window.location.href,
  };

  if (navigator.share) {
    try {
      await navigator.share(payload);
      showToast('Shared');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
      console.error('Share failed', error);
      showToast('Share failed, copied instead');
      await copyQuote();
      return;
    }
  }

  await copyQuote();
}

function showToast(message = 'Copied to clipboard') {
  if (toastTimeoutId !== null) {
    clearTimeout(toastTimeoutId);
  }

  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  toastTimeoutId = setTimeout(() => {
    ui.toast.classList.remove('show');
    toastTimeoutId = null;
  }, TOAST_DURATION_MS);
}

// --- Search Logic ---

function resetSearchState(query = '') {
  searchState.query = query;
  searchState.page = 1;
  searchState.hasMore = false;
  searchState.isLoading = false;
  searchState.results = [];
  searchState.total = null;
  searchState.filters = getSearchFiltersFromUI();
}

function setSelectedSearchIndex(index) {
  const items = ui.cmdResults.querySelectorAll('.cmd-item[role="option"]');

  if (items.length === 0) {
    selectedSearchIndex = -1;
    ui.cmdInput.setAttribute('aria-activedescendant', '');
    return;
  }

  if (index < 0) {
    selectedSearchIndex = -1;
  } else {
    selectedSearchIndex = Math.min(index, items.length - 1);
  }

  items.forEach((item, itemIndex) => {
    const isSelected = itemIndex === selectedSearchIndex;
    item.classList.toggle('selected', isSelected);
    item.setAttribute('aria-selected', isSelected ? 'true' : 'false');

    if (isSelected) {
      item.scrollIntoView({ block: 'nearest' });
      ui.cmdInput.setAttribute('aria-activedescendant', item.id || '');
    }
  });

  if (selectedSearchIndex < 0) {
    ui.cmdInput.setAttribute('aria-activedescendant', '');
  }
}

function markPaletteExpanded(isExpanded) {
  const searchNav = document.querySelector('.nav-item[data-nav="search"]');
  if (searchNav) {
    searchNav.setAttribute('aria-expanded', String(isExpanded));
  }

  ui.cmdInput.setAttribute('aria-expanded', String(isExpanded));
}

function getSearchFiltersFromUI() {
  return sanitizeSearchFilters({
    author: ui.cmdAuthor?.value || '',
    sort: ui.cmdSort?.value || '',
    order: ui.cmdOrder?.value || 'desc',
    limit: ui.cmdLimit?.value || SEARCH_PAGE_SIZE,
  });
}

function isSearchInputActive() {
  const query = ui.cmdInput.value.trim();
  const author = (ui.cmdAuthor?.value || '').trim();
  return query.length >= 2 || author.length >= 2;
}

function updateSearchMeta(resultsCount, { isLoading = false, errorMessage = '' } = {}) {
  if (!ui.cmdMeta) return;

  if (errorMessage) {
    ui.cmdMeta.textContent = errorMessage;
    return;
  }

  if (!isSearchInputActive()) {
    ui.cmdMeta.textContent = 'Type at least 2 characters in query or author.';
    return;
  }

  if (isLoading && resultsCount === 0) {
    ui.cmdMeta.textContent = 'Searching...';
    return;
  }

  const parts = [
    `${resultsCount} result${resultsCount === 1 ? '' : 's'}`,
    `page ${searchState.page}`,
  ];

  if (searchState.total !== null) {
    parts.push(`${searchState.total} total`);
  }

  if (searchState.hasMore) {
    parts.push('more available');
  }

  const filterSummary = [];
  if (searchState.filters.author) filterSummary.push(`author: ${searchState.filters.author}`);
  if (searchState.filters.sort)
    filterSummary.push(`sort: ${searchState.filters.sort} ${searchState.filters.order}`);
  filterSummary.push(`limit: ${searchState.filters.limit}`);

  ui.cmdMeta.textContent = `${parts.join(' · ')} · ${filterSummary.join(' · ')}`;
}

function normalizeSearchResponse(json, requestedPage, pageSize) {
  if (!json || json.success === false) {
    return { results: [], page: requestedPage, hasMore: false, total: null };
  }

  const data = json.data;
  let results = [];
  let page = requestedPage;
  let hasMore = false;
  let totalPages = null;
  let total = null;

  if (Array.isArray(data)) {
    results = data;
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.items)) {
      results = data.items;
    } else if (Array.isArray(data.results)) {
      results = data.results;
    } else if (Array.isArray(data.quotes)) {
      results = data.quotes;
    }

    const pagination = data.pagination || json.pagination || {};
    const parsedPage = Number(pagination.page ?? data.page ?? json.page ?? requestedPage);
    const parsedTotalPages = Number(pagination.totalPages ?? data.totalPages ?? json.totalPages);
    const parsedTotal = Number(
      pagination.total ??
        pagination.totalResults ??
        data.total ??
        data.totalResults ??
        json.total ??
        json.totalResults
    );
    const parsedHasNext = pagination.hasNext ?? data.hasNext ?? json.hasNext;

    if (Number.isFinite(parsedPage) && parsedPage > 0) {
      page = parsedPage;
    }
    if (Number.isFinite(parsedTotalPages) && parsedTotalPages > 0) {
      totalPages = parsedTotalPages;
    }
    if (Number.isFinite(parsedTotal) && parsedTotal >= 0) {
      total = parsedTotal;
    }
    if (typeof parsedHasNext === 'boolean') {
      hasMore = parsedHasNext;
    }
  }

  results = results.map(normalizeQuote).filter(Boolean);

  if (totalPages !== null && page < totalPages) {
    hasMore = true;
  } else if (totalPages === null && results.length === pageSize) {
    hasMore = true;
  }

  return { results, page, hasMore, total };
}

function mergeSearchResults(existing, incoming) {
  const seen = new Set(existing.map((quote) => `${quote.text}::${quote.author || ''}`));
  const merged = [...existing];

  incoming.forEach((quote) => {
    const key = `${quote.text}::${quote.author || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(quote);
    }
  });

  return merged;
}

function getSearchErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return 'Rate limit reached. Please wait and try again.';
    }
    if (error.status === 403) {
      return 'Search is unavailable right now (403).';
    }
    return 'Search failed. Please try again.';
  }

  return 'Search failed. Check your connection and retry.';
}

async function fetchSearchPayload(query, page, filters, { signal } = {}) {
  const listingParams = {
    q: query || undefined,
    author: filters.author || undefined,
    sort: filters.sort || undefined,
    order: filters.sort ? filters.order : undefined,
    page,
    limit: filters.limit,
  };

  try {
    return await fetchApiJson('/quotes', { params: listingParams, signal });
  } catch (error) {
    const canFallbackToLegacySearch =
      error instanceof ApiError && (error.status === 404 || error.status === 405);
    if (!canFallbackToLegacySearch) {
      throw error;
    }

    const legacySearchParams = {
      q: query || filters.author,
      page,
      limit: filters.limit,
    };

    return fetchApiJson('/quotes/search', { params: legacySearchParams, signal });
  }
}

async function runSearch(query, { append = false } = {}) {
  if (append && searchState.isLoading) return;

  if (currentSearchAbortController) {
    currentSearchAbortController.abort();
  }

  currentSearchAbortController = new AbortController();
  const { signal } = currentSearchAbortController;

  const filters = append ? searchState.filters : getSearchFiltersFromUI();
  const requestedPage = append ? searchState.page + 1 : 1;
  const requestId = ++activeSearchRequestId;

  if (!append) {
    resetSearchState(query);
  }

  searchState.filters = filters;
  searchState.isLoading = true;
  renderSearchResults(searchState.results, { isLoading: true, canLoadMore: false });

  try {
    const json = await fetchSearchPayload(query, requestedPage, filters, { signal });

    if (requestId !== activeSearchRequestId) return;

    const normalized = normalizeSearchResponse(json, requestedPage, filters.limit);

    searchState.query = query;
    searchState.page = normalized.page;
    searchState.hasMore = normalized.hasMore;
    searchState.total = normalized.total;
    searchState.results = append
      ? mergeSearchResults(searchState.results, normalized.results)
      : normalized.results;

    renderSearchResults(searchState.results, {
      canLoadMore: searchState.hasMore,
      isLoading: false,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      console.debug('Search request canceled (aborted for a newer request).');
      return;
    }

    if (requestId !== activeSearchRequestId) return;

    console.error('Search failed', error);

    const message = getSearchErrorMessage(error);

    if (append && searchState.results.length > 0) {
      renderSearchResults(searchState.results, {
        errorMessage: `Could not load more results. ${message}`,
        canLoadMore: false,
        isLoading: false,
      });
      return;
    }

    renderSearchResults(searchState.results, {
      errorMessage: message,
      canLoadMore: false,
      isLoading: false,
    });
  } finally {
    if (requestId === activeSearchRequestId) {
      searchState.isLoading = false;
    }

    if (currentSearchAbortController?.signal === signal) {
      currentSearchAbortController = null;
    }
  }
}

function loadMoreSearchResults() {
  if (!searchState.query || !searchState.hasMore || searchState.isLoading) return;
  runSearch(searchState.query, { append: true });
}

function handleSearch() {
  const query = ui.cmdInput.value.trim();

  if (searchTimeout) clearTimeout(searchTimeout);

  if (!isSearchInputActive()) {
    if (currentSearchAbortController) {
      currentSearchAbortController.abort();
      currentSearchAbortController = null;
    }

    activeSearchRequestId++;
    resetSearchState(query);
    selectedSearchIndex = -1;
    renderSearchResults([]);
    return;
  }

  searchTimeout = setTimeout(() => {
    runSearch(query);
  }, SEARCH_DEBOUNCE_MS);
}

function renderSearchResults(
  results,
  { isLoading = false, canLoadMore = false, errorMessage = '' } = {}
) {
  ui.cmdResults.innerHTML = '';
  selectedSearchIndex = -1;
  const hasActiveQuery = isSearchInputActive();

  updateSearchMeta(results.length, { isLoading, errorMessage });

  if (errorMessage && results.length === 0) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'cmd-item cmd-item-muted';
    errorDiv.setAttribute('role', 'status');
    errorDiv.setAttribute('aria-live', 'polite');
    errorDiv.textContent = errorMessage;
    ui.cmdResults.appendChild(errorDiv);
    return;
  }

  if (results.length === 0 && hasActiveQuery && isLoading) {
    const searchingDiv = document.createElement('div');
    searchingDiv.className = 'cmd-item cmd-item-muted';
    searchingDiv.setAttribute('role', 'status');
    searchingDiv.setAttribute('aria-live', 'polite');
    searchingDiv.textContent = 'Searching...';
    ui.cmdResults.appendChild(searchingDiv);
    return;
  }

  if (results.length === 0 && hasActiveQuery) {
    const noMatchDiv = document.createElement('div');
    noMatchDiv.className = 'cmd-item cmd-item-muted';
    noMatchDiv.setAttribute('role', 'status');
    noMatchDiv.setAttribute('aria-live', 'polite');
    noMatchDiv.textContent = 'No matches found.';
    ui.cmdResults.appendChild(noMatchDiv);
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
    fallbackAction.onclick = async () => {
      await fetchNewQuote();
      closeAllOverlays();
    };
    ui.cmdResults.appendChild(fallbackAction);
    setSelectedSearchIndex(0);
    return;
  }

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
      const requestId = ++activeQuoteRequestId;
      renderQuote(quote, requestId);
      closeAllOverlays();
      if (ui.badge) ui.badge.innerText = 'Search Result';
    };

    ui.cmdResults.appendChild(resultButton);
  });

  if (canLoadMore) {
    const loadMore = document.createElement('button');
    loadMore.type = 'button';
    loadMore.className = 'cmd-item is-load-more';
    loadMore.id = `cmd-item-load-more-${searchState.page}`;
    loadMore.setAttribute('role', 'option');
    loadMore.innerHTML = `
            <span>Load more results</span>
            <span class="cmd-kbd">Enter</span>
        `;
    loadMore.onclick = () => loadMoreSearchResults();
    ui.cmdResults.appendChild(loadMore);
  }

  if (isLoading) {
    const loading = document.createElement('div');
    loading.className = 'cmd-item cmd-item-muted';
    loading.setAttribute('role', 'status');
    loading.setAttribute('aria-live', 'polite');
    loading.textContent = 'Loading more...';
    ui.cmdResults.appendChild(loading);
  }

  if (errorMessage) {
    const errorHint = document.createElement('div');
    errorHint.className = 'cmd-item cmd-item-muted';
    errorHint.setAttribute('role', 'status');
    errorHint.setAttribute('aria-live', 'polite');
    errorHint.textContent = errorMessage;
    ui.cmdResults.appendChild(errorHint);
  }

  setSelectedSearchIndex(results.length > 0 ? 0 : -1);
}

// --- UI Management ---

function setActiveNav(navKey = 'discover') {
  const navItems = document.querySelectorAll('.nav-item[data-nav]');
  navItems.forEach((item) => {
    const isActive = item.getAttribute('data-nav') === navKey;
    item.classList.toggle('active', isActive);
    if (isActive) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });
}

function toggleCommandPalette() {
  const isActive = ui.palette.classList.contains('active');
  if (isActive) {
    closeAllOverlays();
  } else {
    lastFocusedElementBeforeOverlay = document.activeElement;
    setActiveNav('search');
    ui.backdrop.classList.add('active');
    ui.palette.classList.add('active');
    markPaletteExpanded(true);

    ui.cmdInput.disabled = false;
    ui.cmdInput.focus();
    ui.cmdInput.placeholder = 'Search text, then refine by author/sort...';

    if (!ui.cmdInput.value && !(ui.cmdAuthor?.value || '').trim()) {
      renderSearchResults([]);
    }
  }
}

function openDrawer(type) {
  closeAllOverlays();
  setActiveNav(type);
  ui.drawerBody.innerHTML = content[type];
  ui.backdrop.classList.add('active');
  ui.drawer.classList.add('active');
}

function closeDrawer() {
  ui.drawer.classList.remove('active');
  ui.backdrop.classList.remove('active');
  setActiveNav('discover');
}

function closeAllOverlays() {
  const paletteWasOpen = ui.palette.classList.contains('active');

  ui.palette.classList.remove('active');
  ui.drawer.classList.remove('active');
  ui.backdrop.classList.remove('active');

  ui.cmdInput.disabled = true;
  markPaletteExpanded(false);
  setActiveNav('discover');

  if (paletteWasOpen && lastFocusedElementBeforeOverlay instanceof HTMLElement) {
    lastFocusedElementBeforeOverlay.focus();
  }

  selectedSearchIndex = -1;
  ui.cmdInput.setAttribute('aria-activedescendant', '');
}

// --- Theme Manager ---
const ThemeManager = {
  init() {
    this.theme = localStorage.getItem('theme');
    if (!this.theme) {
      this.theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    this.applyTheme(this.theme);
  },

  toggle() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', this.theme);
    this.applyTheme(this.theme);
  },

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    const sunIcon = document.querySelector('.icon-sun');
    const moonIcon = document.querySelector('.icon-moon');
    if (sunIcon && moonIcon) {
      if (theme === 'light') {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
      } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
      }
    }

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'light' ? '#fafafa' : '#050505');
    }

    if (window.starfieldInstance) {
      window.starfieldInstance.resize();
    }
  },
};

// --- Push Notification Manager ---
const PushNotificationManager = {
  async init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      this.updateBellUI(!!subscription);
    } catch (e) {
      console.warn('Failed to get push subscription', e);
    }
  },

  updateBellUI(isSubscribed) {
    const icon = document.getElementById('bell-icon');
    const label = document.getElementById('bell-label');
    if (icon) {
      if (isSubscribed) {
        icon.classList.add('filled');
        icon.style.fill = 'currentColor';
      } else {
        icon.classList.remove('filled');
        icon.style.fill = 'none';
      }
    }
    if (label) {
      label.textContent = isSubscribed ? 'Subscribed' : 'Daily Quote';
    }
  },

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  },

  async toggle() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast('Push notifications not supported by your browser');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        await fetch(`${API_BASE}/push/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        this.updateBellUI(false);
        showToast('Notifications disabled');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          showToast('Notification permission denied');
          return;
        }

        const publicKey = window.QUOTE_WEB_CONFIG?.vapidPublicKey;
        if (!publicKey) {
          showToast('VAPID key not configured');
          return;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(publicKey),
        });

        await fetch(`${API_BASE}/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription }),
        });

        this.updateBellUI(true);
        showToast('Subscribed to daily quotes');
      }
    } catch (error) {
      console.error('Push notification toggle failed', error);
      showToast('Failed to toggle notifications');
    }
  },
};

// --- Image Generator ---
const ImageGenerator = {
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

  open() {
    closeAllOverlays();
    ui.backdrop.classList.add('active');
    document.getElementById('image-gen-modal').classList.add('active');
    this.render();
  },

  close() {
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
    else if (quoteText.length > 150) fontSize = 64;
    else if (quoteText.length > 250) fontSize = 52;

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
    showToast('Image downloaded');
  },

  async shareImage() {
    if (!this.currentBlob) return;

    const file = new File([this.currentBlob], 'quote.png', { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Daily Inspiration',
          text: ui.text.innerText + ' — ' + ui.author.innerText,
        });
        showToast('Shared successfully');
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(err);
          this.downloadImage();
        }
      }
    } else {
      this.downloadImage();
    }
  },

  async copyImage() {
    if (!this.currentBlob) return;
    try {
      if (!navigator.clipboard || !navigator.clipboard.write) {
        throw new Error('Clipboard API not supported');
      }
      const item = new ClipboardItem({ 'image/png': this.currentBlob });
      await navigator.clipboard.write([item]);
      showToast('Image copied to clipboard');
    } catch (err) {
      console.error('Failed to copy image', err);
      showToast('Copy failed, try downloading instead');
    }
  },
};

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const { pathname } = window.location;
  const lastSlashIndex = pathname.lastIndexOf('/');
  const lastSegment = pathname.slice(lastSlashIndex + 1);
  const hasExtension = lastSegment.includes('.');
  const basePath = hasExtension
    ? pathname.slice(0, lastSlashIndex + 1) || '/'
    : pathname.endsWith('/')
      ? pathname
      : `${pathname}/`;
  const serviceWorkerPath = `${basePath}service-worker.js`;

  navigator.serviceWorker
    .register(serviceWorkerPath, { scope: basePath })
    .then(() => console.log('Service Worker Registered'))
    .catch((error) => console.error('Service Worker Failed', error));
}

function registerGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    console.error('Unhandled runtime error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection', event.reason);
  });
}

async function handleActionClick(event) {
  const actionElement = event.target.closest('[data-action]');
  if (!actionElement) return;

  const { action } = actionElement.dataset;
  if (!action) return;

  switch (action) {
    case 'nav-discover':
      closeDrawer();
      break;
    case 'toggle-search':
      toggleCommandPalette();
      break;
    case 'open-drawer': {
      const drawerType = actionElement.dataset.drawer;
      if (drawerType && content[drawerType]) {
        openDrawer(drawerType);
      }
      break;
    }
    case 'copy-quote':
      await copyQuote();
      break;
    case 'share-quote':
      await shareQuote();
      break;
    case 'fresh-quote':
      await fetchNewQuote();
      break;
    case 'toggle-theme':
      ThemeManager.toggle();
      break;
    case 'generate-image':
      ImageGenerator.open();
      break;
    case 'close-image-gen':
      ImageGenerator.close();
      break;
    case 'select-template':
      ImageGenerator.selectTemplate(actionElement.dataset.template);
      break;
    case 'copy-image':
      await ImageGenerator.copyImage();
      break;
    case 'download-image':
      await ImageGenerator.downloadImage();
      break;
    case 'share-image-file':
      await ImageGenerator.shareImage();
      break;
    case 'toggle-notifications':
      await PushNotificationManager.toggle();
      break;
    case 'close-overlays':
      closeAllOverlays();
      break;
    case 'close-drawer':
      closeDrawer();
      break;
    default:
      break;
  }
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
  // Cache DOM references
  ui = {
    text: document.getElementById('quote-text'),
    author: document.getElementById('quote-author'),
    badge: document.querySelector('.quote-badge'),
    backdrop: document.getElementById('backdrop'),
    palette: document.getElementById('cmd-palette'),
    drawer: document.getElementById('side-drawer'),
    drawerBody: document.getElementById('drawer-body'),
    toast: document.getElementById('toast'),
    cmdInput: document.querySelector('.cmd-input'),
    cmdResults: document.querySelector('.cmd-results'),
    cmdMeta: document.getElementById('cmd-meta'),
    cmdAuthor: document.getElementById('cmd-author'),
    cmdSort: document.getElementById('cmd-sort'),
    cmdOrder: document.getElementById('cmd-order'),
    cmdLimit: document.getElementById('cmd-limit'),
  };

  registerServiceWorker();
  registerGlobalErrorHandlers();

  // Icons
  if (window.lucide) {
    lucide.createIcons();
  } else {
    console.warn('Lucide icons not loaded (offline?)');
  }

  // Starfield
  window.starfieldInstance = new Starfield('starfield');
  setActiveNav('discover');

  ThemeManager.init();
  PushNotificationManager.init();

  // Event Listeners
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      toggleCommandPalette();
    }
    if (e.key === 'Escape') closeAllOverlays();
  });

  document.addEventListener('click', (e) => {
    handleActionClick(e);
  });

  ui.cmdInput.addEventListener('keydown', (e) => {
    const items = ui.cmdResults.querySelectorAll('.cmd-item[role="option"]');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = selectedSearchIndex < 0 ? 0 : (selectedSearchIndex + 1) % items.length;
      setSelectedSearchIndex(nextIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex =
        selectedSearchIndex < 0
          ? items.length - 1
          : (selectedSearchIndex - 1 + items.length) % items.length;
      setSelectedSearchIndex(prevIndex);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectedSearchIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectedSearchIndex(items.length - 1);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      const nextPageIndex =
        selectedSearchIndex < 0 ? 0 : Math.min(selectedSearchIndex + 5, items.length - 1);
      setSelectedSearchIndex(nextPageIndex);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      const prevPageIndex = selectedSearchIndex < 0 ? 0 : Math.max(selectedSearchIndex - 5, 0);
      setSelectedSearchIndex(prevPageIndex);
    } else if (e.key === ' ') {
      if (selectedSearchIndex < 0 && !isSearchInputActive()) {
        e.preventDefault();
        if (items[0]) {
          items[0].click();
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSearchIndex >= 0 && items[selectedSearchIndex]) {
        items[selectedSearchIndex].click();
      } else if (items[0]) {
        items[0].click();
      }
    }
  });

  ui.cmdInput.addEventListener('input', () => {
    selectedSearchIndex = -1;
    handleSearch();
  });

  if (ui.cmdAuthor) {
    ui.cmdAuthor.addEventListener('input', () => {
      selectedSearchIndex = -1;
      handleSearch();
    });
  }

  if (ui.cmdSort) {
    ui.cmdSort.addEventListener('change', () => {
      selectedSearchIndex = -1;
      handleSearch();
    });
  }

  if (ui.cmdOrder) {
    ui.cmdOrder.addEventListener('change', () => {
      selectedSearchIndex = -1;
      handleSearch();
    });
  }

  if (ui.cmdLimit) {
    ui.cmdLimit.value = String(SEARCH_PAGE_SIZE);
    ui.cmdLimit.addEventListener('change', () => {
      selectedSearchIndex = -1;
      handleSearch();
    });
  }

  renderSearchResults([]);

  // Initial Fetch
  fetchQOD();
});
