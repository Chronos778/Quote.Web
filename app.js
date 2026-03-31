// --- Starfield Animation (Canvas) ---
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
        window.addEventListener('resize', () => this.resize());
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
                opacity: Math.random()
            });
        }
    }

    drawStaticFrame() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.fillStyle = 'white';

        this.stars.forEach(star => {
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
        this.ctx.fillStyle = "white";

        this.stars.forEach(star => {
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

const API_BASE = "https://quotes-api-ruddy.vercel.app";
const OFFLINE_QUOTES_PATH = './assets/data/offline-quotes.json';
const OFFLINE_QUOTES_RETRY_INTERVAL_MS = 60 * 1000;
const SEARCH_PAGE_SIZE = 20;
const MAX_RATE_LIMIT_RETRIES = 2;
const SEARCH_LIMIT_OPTIONS = [20, 40, 60];
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
        limit: SEARCH_PAGE_SIZE
    }
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
    return new Promise(resolve => setTimeout(resolve, ms));
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
                headers: { 'Accept': 'application/json' },
                signal
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
                const retryDelayMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
                    ? retryAfterHeader * 1000
                    : 500 * Math.pow(2, attempt);
                const jitterMs = Math.floor(Math.random() * 150);
                await wait(retryDelayMs + jitterMs);
                continue;
            }

            const message = payload && typeof payload === 'object'
                ? payload.message || payload.error
                : null;

            throw new ApiError(response.status, message || `Request failed with status ${response.status}`, payload);
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw error;
            }

            lastError = error;

            if (attempt < retries && !(error instanceof ApiError)) {
                await wait(300 * Math.pow(2, attempt));
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
        author: quote.author || quote.authorName || 'Unknown'
    };
}

const ui = {
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
    cmdLimit: document.getElementById('cmd-limit')
};

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
    `
};

// --- Core functions ---

async function fetchQOD() {
    const requestId = ++activeQuoteRequestId;

    ui.text.classList.add('loading');
    ui.author.parentElement.classList.add('loading');
    if (ui.badge) ui.badge.innerText = "Quote of the Day";

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
        console.error("Failed to fetch QOD", error);

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
    { text: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt" },
    { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
    { text: "The best way to predict the future is to create it.", author: "Peter Drucker" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { text: "Success is not final, failure is not fatal: It is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "Great things are done by a series of small things brought together.", author: "Vincent Van Gogh" },
    { text: "No one can make you feel inferior without your consent.", author: "Eleanor Roosevelt" },
    { text: "Creativity is intelligence having fun.", author: "Albert Einstein" }
];

async function getOfflineQuotesPool() {
    if (Array.isArray(offlineQuoteCache) && offlineQuoteCache.length > 0 && offlineQuoteCacheSource === 'file') {
        return offlineQuoteCache;
    }

    const hasCachedFallback = Array.isArray(offlineQuoteCache) && offlineQuoteCache.length > 0 && offlineQuoteCacheSource === 'fallback';
    const now = Date.now();
    const shouldRetryFileFetch = offlineQuoteCacheSource !== 'fallback'
        || (now - lastOfflineQuotesFetchAttemptAt >= OFFLINE_QUOTES_RETRY_INTERVAL_MS)
        || navigator.onLine;

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

        const normalized = payload
            .map(normalizeQuote)
            .filter(Boolean);

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
    if (ui.badge) ui.badge.innerText = "Random Inspiration";

    try {
        const json = await fetchApiJson('/quotes/random');
        const quote = normalizeQuote(json?.data);

        if (!quote) {
            throw new Error('Unexpected API payload');
        }

        if (requestId !== activeQuoteRequestId) return;
        renderQuote(quote, requestId);
    } catch (error) {
        console.warn("Using offline quote due to:", error.message);
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
        author: 'Quote.Web'
    };
    renderQuote(randomQuote, requestId);
    if (ui.badge) ui.badge.innerText = label;
}

function renderQuote(data, requestId = activeQuoteRequestId) {
    setTimeout(() => {
        if (requestId !== activeQuoteRequestId) return;

        ui.text.innerText = `"${data.text}"`;
        ui.author.innerText = data.author || "Unknown";

        // Responsive Font Sizing
        const len = data.text.length;
        if (len < 50) {
            ui.text.style.fontSize = "clamp(32px, 5vw, 56px)";
        } else if (len < 100) {
            ui.text.style.fontSize = "clamp(24px, 4vw, 42px)";
        } else if (len < 200) {
            ui.text.style.fontSize = "clamp(20px, 3.5vw, 36px)";
        } else {
            ui.text.style.fontSize = "clamp(18px, 2.5vw, 24px)";
        }

        ui.text.classList.remove('loading');
        ui.author.parentElement.classList.remove('loading');
    }, 300);
}

async function copyQuote() {
    const textToCopy = ui.text.innerText + " — " + ui.author.innerText;

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
        text: ui.text.innerText + " — " + ui.author.innerText,
        url: window.location.href
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
    }, 2000);
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
    const parsedLimit = Number(ui.cmdLimit?.value || SEARCH_PAGE_SIZE);
    const limit = SEARCH_LIMIT_OPTIONS.includes(parsedLimit) ? parsedLimit : SEARCH_PAGE_SIZE;

    return {
        author: (ui.cmdAuthor?.value || '').trim(),
        sort: (ui.cmdSort?.value || '').trim(),
        order: (ui.cmdOrder?.value || 'desc').trim() || 'desc',
        limit
    };
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

    const parts = [`${resultsCount} result${resultsCount === 1 ? '' : 's'}`, `page ${searchState.page}`];

    if (searchState.total !== null) {
        parts.push(`${searchState.total} total`);
    }

    if (searchState.hasMore) {
        parts.push('more available');
    }

    const filterSummary = [];
    if (searchState.filters.author) filterSummary.push(`author: ${searchState.filters.author}`);
    if (searchState.filters.sort) filterSummary.push(`sort: ${searchState.filters.sort} ${searchState.filters.order}`);
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
        const parsedTotal = Number(pagination.total ?? pagination.totalResults ?? data.total ?? data.totalResults ?? json.total ?? json.totalResults);
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

    results = results
        .map(normalizeQuote)
        .filter(Boolean);

    if (totalPages !== null && page < totalPages) {
        hasMore = true;
    } else if (totalPages === null && results.length === pageSize) {
        hasMore = true;
    }

    return { results, page, hasMore, total };
}

function mergeSearchResults(existing, incoming) {
    const seen = new Set(existing.map(quote => `${quote.text}::${quote.author || ''}`));
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
        limit: filters.limit
    };

    try {
        return await fetchApiJson('/quotes', { params: listingParams, signal });
    } catch (error) {
        const canFallbackToLegacySearch = error instanceof ApiError && (error.status === 404 || error.status === 405);
        if (!canFallbackToLegacySearch) {
            throw error;
        }

        const legacySearchParams = {
            q: query || filters.author,
            page,
            limit: filters.limit
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
            isLoading: false
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            return;
        }

        if (requestId !== activeSearchRequestId) return;

        console.error("Search failed", error);

        const message = getSearchErrorMessage(error);

        if (append && searchState.results.length > 0) {
            renderSearchResults(searchState.results, {
                errorMessage: `Could not load more results. ${message}`,
                canLoadMore: false,
                isLoading: false
            });
            return;
        }

        renderSearchResults(searchState.results, {
            errorMessage: message,
            canLoadMore: false,
            isLoading: false
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
    }, 300);
}

function renderSearchResults(results, { isLoading = false, canLoadMore = false, errorMessage = '' } = {}) {
    ui.cmdResults.innerHTML = '';
    selectedSearchIndex = -1;
    const hasActiveQuery = isSearchInputActive();

    updateSearchMeta(results.length, { isLoading, errorMessage });

    if (errorMessage && results.length === 0) {
        ui.cmdResults.innerHTML = `<div class="cmd-item cmd-item-muted" role="status" aria-live="polite">${errorMessage}</div>`;
        return;
    }

    if (results.length === 0 && hasActiveQuery && isLoading) {
        ui.cmdResults.innerHTML = '<div class="cmd-item cmd-item-muted" role="status" aria-live="polite">Searching...</div>';
        return;
    }

    if (results.length === 0 && hasActiveQuery) {
        ui.cmdResults.innerHTML = '<div class="cmd-item cmd-item-muted" role="status" aria-live="polite">No matches found.</div>';
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
            if (ui.badge) ui.badge.innerText = "Search Result";
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
        ui.cmdInput.placeholder = "Search text, then refine by author/sort...";

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

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('service-worker.js')
        .then(() => console.log('Service Worker Registered'))
        .catch((error) => console.error('Service Worker Failed', error));
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
        case 'fresh-quote-close':
            await fetchNewQuote();
            closeAllOverlays();
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
    registerServiceWorker();

    // Icons
    if (window.lucide) {
        lucide.createIcons();
    } else {
        console.warn("Lucide icons not loaded (offline?)");
    }

    // Starfield
    new Starfield('starfield');
    setActiveNav('discover');

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
            const prevIndex = selectedSearchIndex < 0 ? items.length - 1 : (selectedSearchIndex - 1 + items.length) % items.length;
            setSelectedSearchIndex(prevIndex);
        } else if (e.key === 'Home') {
            e.preventDefault();
            setSelectedSearchIndex(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            setSelectedSearchIndex(items.length - 1);
        } else if (e.key === 'PageDown') {
            e.preventDefault();
            const nextPageIndex = selectedSearchIndex < 0 ? 0 : Math.min(selectedSearchIndex + 5, items.length - 1);
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

    ui.cmdInput.addEventListener('input', (e) => {
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

