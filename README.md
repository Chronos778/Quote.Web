# Quote.Web

A modern, dark-themed Progressive Web App (PWA) for daily inspiration. Browse random quotes with a premium UI, search the collection, and enjoy a fully offline-capable experience.

## Features

- **Progressive Web App** — Installable on any device with native-like experience
- **Offline Support** — Works without internet (icons, fonts, and 100 fallback quotes)
- **Immersive Reader** — Distraction-free interface with expressive typography
- **Command Palette** — Instant quote discovery with text search, author filter, sort/order, and load-more pagination (`Ctrl+K`)
- **API-Ready UX** — Handles rate limits (`429`) with retry/backoff and graceful offline fallback
- **Dark Theme** — Premium aesthetic with animated starfield background
- **Mobile Optimized** — Adaptive layout with safe-area support for all devices
- **Performance First** — Deferred scripts, self-hosted fonts, 60fps canvas animations

## Quick Start

### Online

Visit the live website: [Quote.Web](https://chronos778.github.io/quote.web)

### Local Development

1. Clone this repository:

   ```bash
   git clone https://github.com/Chronos778/quote.web.git
   cd quote.web
   ```

2. Serve using any HTTP server (required for Service Worker):

   ```bash
   # Python
   python -m http.server 8080
   
   # Node.js
   npx serve .
   ```

3. Open `http://localhost:8080` in your browser.

## PWA Installation

Quote.Web can be installed as a standalone application:

1. Visit the website in Chrome, Edge, or Safari
2. Click the "Install" icon in the address bar (or use browser menu)
3. The app will appear on your home screen or desktop

## API Integration

Quote.Web fetches data from the [Quotes API](https://quotes-api-ruddy.vercel.app):

| Endpoint               | Description                              |
| ---------------------- | ---------------------------------------- |
| `/quotes/qod`          | Quote of the Day (shown on initial load) |
| `/quotes/random`       | Random inspirational quote               |
| `/quotes?...`          | Paginated listing + text/author filters  |
| `/quotes/search?...`   | Legacy search fallback compatibility     |

When offline, the app serves from a library of 100 built-in quotes.

Search requests use `q`, `page`, `limit`, `author`, `sort`, and `order` when available.
The command palette includes author filtering, sort/order selectors, and page-size selection (20/40/60), with "Load more" support for paginated results.
Rate limits (`429`) are handled with retry/backoff and graceful fallback messaging.

The app first attempts paginated listing/search via `/quotes` and falls back to `/quotes/search` for legacy compatibility.

## Keyboard Shortcuts

- `Ctrl + K` — Open search command palette
- `Arrow Up/Down` — Navigate search results
- `Enter` — Select highlighted result (or first item)
- `Escape` — Close overlays

## Technologies

- **HTML5** — Semantic structure
- **CSS3** — Custom properties, responsive design, glassmorphism effects
- **JavaScript (ES6+)** — No frameworks, vanilla implementation
- **Service Worker** — Offline caching and PWA support
- **Canvas API** — Performant starfield animation
- **Lucide Icons** — Self-hosted icon library

## Project Structure

```text
quote.web/
├── index.html           # Main HTML document
├── styles.css           # Styles including @font-face declarations
├── app.js               # Application logic
├── service-worker.js    # PWA caching strategy
├── manifest.json        # PWA manifest
├── lucide.min.js        # Local icon library
├── assets/
│   ├── fonts/           # Self-hosted Fraunces and Manrope
│   ├── icons/           # PWA application icons
│   └── screenshots/     # PWA install screenshots
├── README.md            # This file
├── LICENSE              # MIT License
└── .gitignore           # Git ignore rules
```

## Browser Support

| Browser         | Minimum Version      |
| --------------- | -------------------- |
| Chrome          | 80+                  |
| Firefox         | 75+                  |
| Safari          | 13+                  |
| Edge            | 80+                  |
| Mobile browsers | iOS 13+, Android 8+  |

## Contributing

Contributions are welcome. Please feel free to:

- Report bugs
- Suggest new features
- Submit pull requests
- Improve documentation

## License

MIT License — See [LICENSE](LICENSE) file for details.

## Author

Created by [Chronos778](https://github.com/Chronos778)

---

Built for daily inspiration.
