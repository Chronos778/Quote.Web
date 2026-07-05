const DEFAULT_API_BASE = 'https://quotes-api-ruddy.vercel.app';
const OFFLINE_QUOTES_PATH = './assets/data/offline-quotes.json';
const OFFLINE_QUOTES_RETRY_INTERVAL_MS = 60 * 1000;
const MAX_RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_BASE_DELAY_MS = 500;
const NETWORK_RETRY_BASE_DELAY_MS = 300;

let offlineQuoteCache = null;
let offlineQuoteCacheSource = 'none';
let lastOfflineQuotesFetchAttemptAt = 0;

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

export const { apiBaseUrl: API_BASE } = readRuntimeConfig();

export class ApiError extends Error {
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

export async function fetchApiJson(path, { params = {}, retries = MAX_RATE_LIMIT_RETRIES, signal } = {}) {
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

export function normalizeQuote(quote) {
  if (!quote || typeof quote !== 'object') return null;

  const text = quote.text || quote.quote || quote.content;
  if (!text) return null;

  return {
    ...quote,
    text,
    author: quote.author || quote.authorName || 'Unknown',
  };
}

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

export async function getOfflineQuotesPool() {
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

  return fallbackOfflineQuotes;
}

export function normalizeSearchResponse(json, requestedPage, pageSize) {
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

export function mergeSearchResults(existing, incoming) {
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

export function getSearchErrorMessage(error) {
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

export async function fetchSearchPayload(query, page, filters, { signal } = {}) {
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
    
    if (!navigator.onLine || (error instanceof ApiError && error.status === 503) || error.message === 'Failed to fetch') {
      const allQuotes = await getOfflineQuotesPool();
      const q = (query || '').toLowerCase();
      const authorQ = (filters.author || '').toLowerCase();
      let matches = allQuotes;
      if (q) matches = matches.filter(quote => quote.text.toLowerCase().includes(q));
      if (authorQ) matches = matches.filter(quote => (quote.author || '').toLowerCase().includes(authorQ));
      
      const limit = Number(filters.limit) || 20;
      const start = (page - 1) * limit;
      const paginated = matches.slice(start, start + limit);
      
      return {
        data: paginated,
        pagination: {
          page,
          total: matches.length,
          totalPages: Math.ceil(matches.length / limit)
        }
      };
    }

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
