// --- Starfield Animation (Canvas) ---
class Starfield {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.stars = [];
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.createStars();
        this.animate();
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    createStars() {
        this.stars = [];
        const count = this.width < 768 ? 100 : 400; // Adjust count based on screen size

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

    animate() {
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

        requestAnimationFrame(() => this.animate());
    }
}

// --- Application State & Logic ---

const API_BASE = "https://quotes-api-ruddy.vercel.app";
const SEARCH_PAGE_SIZE = 20;
const MAX_RATE_LIMIT_RETRIES = 2;
const SEARCH_LIMIT_OPTIONS = [20, 40, 60];
let searchTimeout;
let activeSearchRequestId = 0;

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

async function fetchApiJson(path, { params = {}, retries = MAX_RATE_LIMIT_RETRIES } = {}) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(toApiUrl(path, params), {
                headers: { 'Accept': 'application/json' }
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
        <p>GitHub: <a href="https://github.com/Chronos778" target="_blank">Chronos778</a></p>
    `
};

// --- Core functions ---

async function fetchQOD() {
    ui.text.classList.add('loading');
    ui.author.parentElement.classList.add('loading');
    if (ui.badge) ui.badge.innerText = "Quote of the Day";

    try {
        const json = await fetchApiJson('/quotes/qod');
        const quote = normalizeQuote(json?.data);

        if (json?.success && quote) {
            renderQuote(quote);
            return;
        }

        await fetchNewQuote();
    } catch (error) {
        console.error("Failed to fetch QOD", error);

        if (error instanceof ApiError && error.status === 429) {
            renderOfflineQuote('Rate limited · Offline');
            return;
        }

        await fetchNewQuote();
    }
}

// Fallback quotes for offline usage
const offlineQuotes = [
    { text: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt" },
    { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
    { text: "The best way to predict the future is to create it.", author: "Peter Drucker" },
    { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
    { text: "Success is not final, failure is not fatal: It is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "Hardships often prepare ordinary people for an extraordinary destiny.", author: "C.S. Lewis" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
    { text: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", author: "Ralph Waldo Emerson" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { text: "Keep your face always toward the sunshine—and shadows will fall behind you.", author: "Walt Whitman" },
    { text: "The power of imagination makes us infinite.", author: "John Muir" },
    { text: "Try to be a rainbow in someone's cloud.", author: "Maya Angelou" },
    { text: "We generate fears while we sit. We overcome them by action.", author: "Dr. Henry Link" },
    { text: "Dream big and dare to fail.", author: "Norman Vaughan" },
    { text: "Act as if what you do makes a difference. It does.", author: "William James" },
    { text: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau" },
    { text: "Don't be pushed around by the fears in your mind. Be led by the dreams in your heart.", author: "Roy T. Bennett" },
    { text: "It's not whether you get knocked down, it's whether you get up.", author: "Vince Lombardi" },
    { text: "If you want to live a happy life, tie it to a goal, not to people or things.", author: "Albert Einstein" },
    { text: "Never let the fear of striking out keep you from playing the game.", author: "Babe Ruth" },
    { text: "Money and success don’t change people; they merely amplify what is already there.", author: "Will Smith" },
    { text: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs" },
    { text: "Not how long, but how well you have lived is the main thing.", author: "Seneca" },
    { text: "If life were predictable it would cease to be life, and be without flavor.", author: "Eleanor Roosevelt" },
    { text: "The whole secret of a successful life is to find out what is one's destiny to do, and then do it.", author: "Henry Ford" },
    { text: "In order to write about life first you must live it.", author: "Ernest Hemingway" },
    { text: "Life is not a problem to be solved, but a reality to be experienced.", author: "Søren Kierkegaard" },
    { text: "The unexamined life is not worth living.", author: "Socrates" },
    { text: "Turn your wounds into wisdom.", author: "Oprah Winfrey" },
    { text: "The purpose of our lives is to be happy.", author: "Dalai Lama" },
    { text: "Live for each second without hesitation.", author: "Elton John" },
    { text: "Life is ten percent what happens to you and ninety percent how you respond to it.", author: "Charles Swindoll" },
    { text: "Keep calm and carry on.", author: "Winston Churchill" },
    { text: "Maybe that’s what life is... a wink of the eye and winking stars.", author: "Jack Kerouac" },
    { text: "Life is a flower of which love is the honey.", author: "Victor Hugo" },
    { text: "Health is the greatest gift, contentment the greatest wealth, faithfulness the best relationship.", author: "Buddha" },
    { text: "The brain is wider than the sky.", author: "Emily Dickinson" },
    { text: "Great things are done by a series of small things brought together.", author: "Vincent Van Gogh" },
    { text: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
    { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
    { text: "When something is important enough, you do it even if the odds are not in your favor.", author: "Elon Musk" },
    { text: "If you're going through hell, keep going.", author: "Winston Churchill" },
    { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
    { text: "Good judgment comes from experience, and a lot of that comes from bad judgment.", author: "Will Rogers" },
    { text: "Think of all the beauty still left around you and be happy.", author: "Anne Frank" },
    { text: "We may encounter many defeats but we must not be defeated.", author: "Maya Angelou" },
    { text: "Life is really simple, but we insist on making it complicated.", author: "Confucius" },
    { text: "Change the world by being yourself.", author: "Amy Poehler" },
    { text: "Every moment is a fresh beginning.", author: "T.S. Eliot" },
    { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
    { text: "Whatever you do, do it well.", author: "Walt Disney" },
    { text: "What we think, we become.", author: "Buddha" },
    { text: "All limitations are self-imposed.", author: "Oliver Wendell Holmes" },
    { text: "Tough times never last but tough people do.", author: "Robert H. Schuller" },
    { text: "Problems are not stop signs, they are guidelines.", author: "Robert H. Schuller" },
    { text: "One day the people that don’t even believe in you will tell everyone how they met you.", author: "Johnny Depp" },
    { text: "If I tell you I'm good, probably you will say I'm boasting. But if I tell you I'm not good, you'll know I'm lying.", author: "Bruce Lee" },
    { text: "Have no fear of perfection, you'll never reach it.", author: "Salvador Dali" },
    { text: "Determined to never be idle. No person will have occasion to complain of the want of time who never loses any.", author: "Thomas Jefferson" },
    { text: "The two most important days in your life are the day you are born and the day you find out why.", author: "Mark Twain" },
    { text: "Nothing is impossible, the word itself says 'I'm possible'!", author: "Audrey Hepburn" },
    { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
    { text: "Light tomorrow with today.", author: "Elizabeth Barrett Browning" },
    { text: "Sadness flies away on the wings of time.", author: "Jean de La Fontaine" },
    { text: "I enjoy life when things are happening. I don't care if it's good things or bad things. That means you're alive.", author: "Joan Rivers" },
    { text: "Life is short, and it is up to you to make it sweet.", author: "Sarah Louise Delany" },
    { text: "It is never too late to be what you might have been.", author: "George Eliot" },
    { text: "To live is the rarest thing in the world. Most people exist, that is all.", author: "Oscar Wilde" },
    { text: "Pain is inevitable. Suffering is optional.", author: "Haruki Murakami" },
    { text: "Be kind, for everyone you meet is fighting a hard battle.", author: "Plato" },
    { text: "We are all in the gutter, but some of us are looking at the stars.", author: "Oscar Wilde" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "If you tell the truth, you don't have to remember anything.", author: "Mark Twain" },
    { text: "A friend is someone who knows all about you and still loves you.", author: "Elbert Hubbard" },
    { text: "To survive it is often necessary to fight and to fight you have to dirty yourself.", author: "George Orwell" },
    { text: "Knowing yourself is the beginning of all wisdom.", author: "Aristotle" },
    { text: "No one can make you feel inferior without your consent.", author: "Eleanor Roosevelt" },
    { text: "Be the change that you wish to see in the world.", author: "Mahatma Gandhi" },
    { text: "If you cannot do great things, do small things in a great way.", author: "Napoleon Hill" },
    { text: "If opportunity doesn't knock, build a door.", author: "Milton Berle" },
    { text: "Wise men speak because they have something to say; fools because they have to say something.", author: "Plato" },
    { text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
    { text: "Two roads diverged in a wood, and I—I took the one less traveled by, And that has made all the difference.", author: "Robert Frost" },
    { text: "Do not go where the path may lead, go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson" },
    { text: "Be yourself; everyone else is already taken.", author: "Oscar Wilde" },
    { text: "We don't need to be smarter than the rest. We have to be more disciplined than the rest.", author: "Warren Buffett" },
    { text: "Creativity is intelligence having fun.", author: "Albert Einstein" },
    { text: "There is no substitute for hard work.", author: "Thomas Edison" },
    { text: "Excellence is not a skill. It is an attitude.", author: "Ralph Marston" },
    { text: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs" },
    { text: "The journey of a thousand miles begins with one step.", author: "Lao Tzu" },
    { text: "What we achieve inwardly will change outer reality.", author: "Plutarch" }
];

async function fetchNewQuote() {
    ui.text.classList.add('loading');
    ui.author.parentElement.classList.add('loading');
    if (ui.badge) ui.badge.innerText = "Random Inspiration";

    try {
        const json = await fetchApiJson('/quotes/random');
        const quote = normalizeQuote(json?.data);

        if (!quote) {
            throw new Error('Unexpected API payload');
        }

        renderQuote(quote);
    } catch (error) {
        console.warn("Using offline quote due to:", error.message);
        if (error instanceof ApiError && error.status === 429) {
            renderOfflineQuote('Rate limited · Offline');
            return;
        }

        renderOfflineQuote('Offline Inspiration');
    }
}

function renderOfflineQuote(label = 'Offline Inspiration') {
    const randomQuote = offlineQuotes[Math.floor(Math.random() * offlineQuotes.length)];
    renderQuote(randomQuote);
    if (ui.badge) ui.badge.innerText = label;
}

function renderQuote(data) {
    setTimeout(() => {
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

function copyQuote() {
    const textToCopy = ui.text.innerText + " — " + ui.author.innerText;
    navigator.clipboard.writeText(textToCopy);
    showToast();
}

function shareQuote() {
    if (navigator.share) {
        navigator.share({
            title: 'Daily Inspiration',
            text: ui.text.innerText + " — " + ui.author.innerText,
            url: window.location.href
        }).catch(console.error);
    } else {
        copyQuote();
    }
}

function showToast() {
    ui.toast.classList.add('show');
    setTimeout(() => ui.toast.classList.remove('show'), 2000);
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

async function fetchSearchPayload(query, page, filters) {
    const listingParams = {
        q: query || undefined,
        author: filters.author || undefined,
        sort: filters.sort || undefined,
        order: filters.sort ? filters.order : undefined,
        page,
        limit: filters.limit
    };

    try {
        return await fetchApiJson('/quotes', { params: listingParams });
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

        return fetchApiJson('/quotes/search', { params: legacySearchParams });
    }
}

async function runSearch(query, { append = false } = {}) {
    if (append && searchState.isLoading) return;

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
        const json = await fetchSearchPayload(query, requestedPage, filters);

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
        activeSearchRequestId++;
        resetSearchState(query);
        renderSearchResults([]);
        return;
    }

    searchTimeout = setTimeout(() => {
        runSearch(query);
    }, 300);
}

function renderSearchResults(results, { isLoading = false, canLoadMore = false, errorMessage = '' } = {}) {
    ui.cmdResults.innerHTML = '';
    const hasActiveQuery = isSearchInputActive();

    updateSearchMeta(results.length, { isLoading, errorMessage });

    if (errorMessage && results.length === 0) {
        ui.cmdResults.innerHTML = `<div class="cmd-item cmd-item-muted">${errorMessage}</div>`;
        return;
    }

    if (results.length === 0 && hasActiveQuery && isLoading) {
        ui.cmdResults.innerHTML = '<div class="cmd-item cmd-item-muted">Searching...</div>';
        return;
    }

    if (results.length === 0 && hasActiveQuery) {
        ui.cmdResults.innerHTML = '<div class="cmd-item cmd-item-muted">No matches found.</div>';
        return;
    }

    if (results.length === 0) {
        ui.cmdResults.innerHTML = `
            <div class="cmd-item selected" onclick="fetchNewQuote(); closeAllOverlays()">
                <span>Fetch new random quote</span>
                <span class="cmd-kbd">Space</span>
            </div>
        `;
        return;
    }

    results.forEach(quote => {
        const div = document.createElement('div');
        div.className = 'cmd-item';

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
        div.appendChild(content);

        div.onclick = () => {
            renderQuote(quote);
            closeAllOverlays();
            if (ui.badge) ui.badge.innerText = "Search Result";
        };
        ui.cmdResults.appendChild(div);
    });

    if (canLoadMore) {
        const loadMore = document.createElement('div');
        loadMore.className = 'cmd-item is-load-more';
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
        loading.textContent = 'Loading more...';
        ui.cmdResults.appendChild(loading);
    }

    if (errorMessage) {
        const errorHint = document.createElement('div');
        errorHint.className = 'cmd-item cmd-item-muted';
        errorHint.textContent = errorMessage;
        ui.cmdResults.appendChild(errorHint);
    }
}

// --- UI Management ---

function toggleCommandPalette() {
    const isActive = ui.palette.classList.contains('active');
    if (isActive) {
        closeAllOverlays();
    } else {
        ui.backdrop.classList.add('active');
        ui.palette.classList.add('active');

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
    ui.drawerBody.innerHTML = content[type];
    ui.backdrop.classList.add('active');
    ui.drawer.classList.add('active');
}

function closeDrawer() {
    ui.drawer.classList.remove('active');
    ui.backdrop.classList.remove('active');
}

function closeAllOverlays(keepBackdrop = false) {
    ui.palette.classList.remove('active');
    ui.drawer.classList.remove('active');
    if (!keepBackdrop) ui.backdrop.classList.remove('active');
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    // Icons
    if (window.lucide) {
        lucide.createIcons();
    } else {
        console.warn("Lucide icons not loaded (offline?)");
    }

    // Starfield
    new Starfield('starfield');

    // Event Listeners
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            toggleCommandPalette();
        }
        if (e.key === 'Escape') closeAllOverlays();
    });

    let selectedIndex = -1;

    function updateSelection() {
        const items = ui.cmdResults.querySelectorAll('.cmd-item');
        items.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    ui.cmdInput.addEventListener('keydown', (e) => {
        const items = ui.cmdResults.querySelectorAll('.cmd-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % items.length;
            updateSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            updateSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && items[selectedIndex]) {
                items[selectedIndex].click();
            } else if (items[0]) {
                items[0].click();
            }
        }
    });

    ui.cmdInput.addEventListener('input', (e) => {
        selectedIndex = -1; // Reset selection on typing
        handleSearch();
    });

    if (ui.cmdAuthor) {
        ui.cmdAuthor.addEventListener('input', () => {
            selectedIndex = -1;
            handleSearch();
        });
    }

    if (ui.cmdSort) {
        ui.cmdSort.addEventListener('change', () => {
            selectedIndex = -1;
            handleSearch();
        });
    }

    if (ui.cmdOrder) {
        ui.cmdOrder.addEventListener('change', () => {
            selectedIndex = -1;
            handleSearch();
        });
    }

    if (ui.cmdLimit) {
        ui.cmdLimit.value = String(SEARCH_PAGE_SIZE);
        ui.cmdLimit.addEventListener('change', () => {
            selectedIndex = -1;
            handleSearch();
        });
    }

    renderSearchResults([]);

    // Initial Fetch
    fetchQOD();
});
