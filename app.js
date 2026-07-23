import { ThemeManager } from './js/theme.js';
import { Starfield } from './js/starfield.js';
import { PushNotificationManager } from './js/notifications.js';
import { ImageGenerator } from './js/image-generator.js';
import { FavoritesManager } from './js/favorites.js';
import { HistoryManager } from './js/history.js';
import { showToast, vibrate } from './js/utils.js';
import { API_BASE, ApiError, fetchApiJson, normalizeQuote, getOfflineQuotesPool } from './js/api.js';
import { SearchManager } from './js/search.js';

// --- Application State & Logic ---

const QUOTE_RENDER_DELAY_MS = 100;
let lastFocusedElementBeforeOverlay = null;
let activeQuoteRequestId = 0;

// --- Core UI Logic ---

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
  if (ui.badge) ui.badge.textContent = 'Quote of the Day';

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const cacheKey = `qod_${dateStr}`;

  // Purge stale QOD cache entries from previous days
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('qod_') && key !== cacheKey) {
        localStorage.removeItem(key);
      }
    }
  } catch (err) {
    console.debug('QOD cache cleanup error:', err);
  }
  
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.text) {
        if (requestId !== activeQuoteRequestId) return;
        renderQuote(parsed, requestId);
        return;
      }
    }
  } catch (err) {
    console.debug('Cache read error:', err);
  }

  try {
    const json = await fetchApiJson('/quotes/qod');
    const quote = normalizeQuote(json?.data);

    if (json?.success && quote) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(quote));
      } catch (err) {
        console.debug('Cache write error:', err);
      }
      
      if (requestId !== activeQuoteRequestId) return;
      renderQuote(quote, requestId);
      return;
    }

    if (requestId !== activeQuoteRequestId) return;
    await fetchNewQuote();
  } catch (error) {
    console.warn('Failed to fetch QOD', error);

    if (error instanceof ApiError && error.status === 429) {
      await renderOfflineQuote('Rate limited · Offline', requestId);
      return;
    }

    if (requestId !== activeQuoteRequestId) return;
    await fetchNewQuote();
  }
}

// getOfflineQuotesPool moved to js/api.js

async function fetchNewQuote() {
  vibrate([30]);
  const requestId = ++activeQuoteRequestId;

  ui.text.classList.add('loading');
  ui.author.parentElement.classList.add('loading');
  if (ui.badge) ui.badge.textContent = 'Random Inspiration';

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
  if (ui.badge) ui.badge.textContent = label;
}

function renderQuote(data, requestId = activeQuoteRequestId) {
  HistoryManager.add(data.text, data.author || 'Unknown');
  setTimeout(() => {
    if (requestId !== activeQuoteRequestId) return;

    ui.text.textContent = `"${data.text}"`;
    ui.author.textContent = data.author || 'Unknown';

    // Announce to screen readers
    const announcer = document.getElementById('quote-announcer');
    if (announcer) {
      announcer.textContent = `${data.text} by ${data.author || 'Unknown'}`;
    }

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
    FavoritesManager.updateButtonState();
  }, QUOTE_RENDER_DELAY_MS);
}

function getQuoteString() {
  return ui.text.textContent + ' — ' + ui.author.textContent;
}

async function copyQuote() {
  const textToCopy = getQuoteString();

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
    console.warn('Copy failed', error);
    showToast('Copy failed');
    return false;
  }
}

async function shareQuote() {
  const quoteObj = { text: ui.text.textContent.replace(/^"|"$/g, ''), author: ui.author.textContent };
  const hash = '#quote=' + btoa(unescape(encodeURIComponent(JSON.stringify(quoteObj))));
  const url = window.location.origin + window.location.pathname + hash;
  
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Daily Quote',
        text: `"${quoteObj.text}" — ${quoteObj.author}`,
        url: url,
      });
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('Share failed', err);
    }
  } else {
    // Fallback to copy link
    try {
      await navigator.clipboard.writeText(`"${quoteObj.text}" — ${quoteObj.author}\n${url}`);
      showToast('Link copied to clipboard');
    } catch {
      copyQuote();
    }
  }
}

function speakQuote() {
  if (!('speechSynthesis' in window)) {
    showToast('Text-to-speech not supported');
    return;
  }
  
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    return;
  }

  const quote = ui.text.textContent.replace(/^"|"$/g, '');
  const author = ui.author.textContent;
  
  const utterance = new SpeechSynthesisUtterance(`${quote}. By ${author}.`);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  
  speechSynthesis.speak(utterance);
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

function markPaletteExpanded(isExpanded) {
  const searchNav = document.querySelector('.nav-item[data-nav="search"]');
  if (searchNav) {
    searchNav.setAttribute('aria-expanded', String(isExpanded));
  }

  ui.cmdInput.setAttribute('aria-expanded', String(isExpanded));
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
      SearchManager.renderSearchResults([]);
    }
  }
}

function openDrawer(type) {
  if (!content[type]) return;
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

  SearchManager.selectedSearchIndex = -1;
  ui.cmdInput.setAttribute('aria-activedescendant', '');
}

// ThemeManager moved to js/theme.js
// PushNotificationManager moved to js/notifications.js

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
    .then((registration) => {
      console.log('Service Worker Registered');
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Update available. Refresh the page.');
            }
          });
        }
      });
    })
    .catch((error) => console.warn('Service Worker Failed', error));
}

function registerGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    console.warn('Unhandled runtime error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.warn('Unhandled promise rejection', event.reason);
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
      if (drawerType === 'favorites') {
        ui.drawer.dataset.currentView = 'favorites';
        FavoritesManager.renderList();
        ui.drawer.classList.add('active');
        ui.backdrop.classList.add('active');
        setActiveNav(actionElement.dataset.nav || 'favorites');
      } else if (drawerType && content[drawerType]) {
        openDrawer(drawerType);
      }
      break;
    }
    case 'copy-quote':
      copyQuote();
      break;
    case 'speak-quote':
      speakQuote();
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
    case 'toggle-favorite':
      vibrate([40, 20, 40]);
      FavoritesManager.toggle();
      break;
    case 'history-back':
      vibrate([30]);
      HistoryManager.back();
      break;
    case 'history-forward':
      vibrate([30]);
      HistoryManager.forward();
      break;
    case 'search-category':
      ui.cmdInput.value = actionElement.dataset.category;
      SearchManager.runSearch(ui.cmdInput.value);
      break;
    case 'toggle-notifications':
      await PushNotificationManager.toggle();
      break;
    case 'close-overlays':
      closeAllOverlays();
      break;
    case 'render-favorite': {
      const index = parseInt(actionElement.dataset.index, 10);
      const fav = FavoritesManager.favorites[index];
      if (fav) {
        const requestId = ++activeQuoteRequestId;
        renderQuote(fav, requestId);
        closeDrawer();
      }
      break;
    }
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

  // Defer heavy paint/layout work to avoid forced reflow and main-thread blocking during init
  // Use requestIdleCallback with a fallback, and stagger the tasks.
  setTimeout(() => {
    if (window.requestIdleCallback) {
      requestIdleCallback(() => {
        if (window.lucide) lucide.createIcons();
      });
    } else {
      if (window.lucide) lucide.createIcons();
    }
  }, 50);

  setTimeout(() => {
    window.starfieldInstance = new Starfield('starfield');
  }, 100);
  setActiveNav('discover');

  ThemeManager.init();
  PushNotificationManager.init({ apiBase: API_BASE, showToast });
  ImageGenerator.init({ ui, closeAllOverlays, showToast });
  FavoritesManager.init({ ui, showToast });
  HistoryManager.init({
    renderQuote: (quote) => {
      const requestId = ++activeQuoteRequestId;
      renderQuote(quote, requestId);
    }
  });
  SearchManager.init({
    ui,
    onSelectQuote: (quote) => {
      const requestId = ++activeQuoteRequestId;
      renderQuote(quote, requestId);
      closeAllOverlays();
      if (ui.badge) ui.badge.textContent = 'Search Result';
    },
    onFetchNewQuote: async () => {
      await fetchNewQuote();
      closeAllOverlays();
    }
  });

  // Event Listeners
  document.addEventListener('keydown', (e) => {
    // If user is in an input field, do not trigger global shortcuts
    const isInputActive = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    
    // Command Palette Toggle (Ctrl+K or Cmd+K)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.querySelector('[data-action="toggle-search"]')?.click();
      return;
    }

    if (ui.palette.classList.contains('active')) {
      return;
    }

    if (isInputActive) return;

    if (e.key === ' ' || e.key === 'ArrowRight') {
      e.preventDefault();
      fetchNewQuote();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      HistoryManager.back();
    } else if (e.key.toLowerCase() === 'c') {
      e.preventDefault();
      copyQuote();
    } else if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      speakQuote();
    } else if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      FavoritesManager.toggle();
    } else if (e.key === 'Escape') {
      closeAllOverlays();
    }
  });

  // Swipe Gestures
  let touchStartX = 0;
  let touchEndX = 0;

  window.addEventListener('online', () => {
    document.getElementById('offline-banner')?.classList.remove('active');
  });

  window.addEventListener('offline', () => {
    document.getElementById('offline-banner')?.classList.add('active');
  });

  document.querySelector('.workspace').addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  document.querySelector('.workspace').addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });

  function handleSwipe() {
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) { // Threshold
      if (diff > 0) {
        // Swiped left -> Next quote
        fetchNewQuote();
      } else {
        // Swiped right -> Previous quote
        HistoryManager.back();
      }
    }
  }

  document.addEventListener('click', (e) => {
    handleActionClick(e);
  });

  ui.cmdInput.addEventListener('keydown', (e) => {
    SearchManager.handleKeyDown(e);
  });

  SearchManager.renderSearchResults([]);

  // Initial Fetch or Deep Link
  const hash = window.location.hash;
  if (hash.startsWith('#quote=')) {
    try {
      const base64 = hash.replace('#quote=', '');
      const decoded = JSON.parse(decodeURIComponent(escape(atob(base64))));
      const quote = normalizeQuote(decoded);
      if (quote && quote.text.length <= 1000) {
        const requestId = ++activeQuoteRequestId;
        renderQuote(quote, requestId);
        return;
      }
    } catch (e) {
      console.warn('Invalid quote deep link', e);
      window.location.hash = '';
    }
  }

  fetchQOD();
});
