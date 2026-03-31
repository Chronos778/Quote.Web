# Quote.Web

A fast, installable Progressive Web App for discovering and sharing inspiring quotes. Built with vanilla JavaScript, fully functional offline, and optimized for mobile.

**[Live Demo](https://chronos778.github.io/quote.web)**

## Features

- **Installable PWA** — Install as a standalone app on desktop or mobile
- **Fast Search** — Command palette (Ctrl+K) with filters, sorting & pagination
- **Mobile-First** — Responsive design with keyboard-friendly navigation
- **Offline Support** — Works without internet using cached data & service worker
- **Random & Daily** — Fetch random quotes or quotes of the day  

## Quick Start

### Prerequisites
- Node.js 20+
- npm or yarn

### Installation

\\\ash
# Clone the repository
git clone https://github.com/Chronos778/quote.web.git
cd quote.web

# Install dependencies
npm ci

# Start local server
# (Service workers require HTTP origin)
npx serve .

# Open http://localhost:3000
\\\

## Usage

- **Fresh Quote** — Click the button to load a random quote
- **Search** — Press <kbd>Ctrl</kbd>+<kbd>K</kbd> (<kbd>Cmd</kbd>+<kbd>K</kbd> on macOS)
- **Filters** — Use author, sort, order & limit in the search panel
- **Keyboard Nav** — Arrow keys to browse, Enter to select

## Configuration

Configuration is loaded in this order:

1. \config.js\ — \window.QUOTE_WEB_CONFIG.apiBaseUrl\
2. \index.html\ — \meta[name="quote-web-api-base"]\
3. App defaults

Example \config.js\:
\\\js
window.QUOTE_WEB_CONFIG = Object.freeze({
  apiBaseUrl: 'https://quotes-api-ruddy.vercel.app',
});
\\\

## Development

### Scripts

\\\ash
npm run lint        # Check code style
npm run format      # Auto-format code
npm run format:check  # Verify formatting
npm run check       # Lint + format check
npm test            # Alias for check
\\\

### Folder Structure

\\\
quote.web/
├── assets/
│   ├── data/          # Offline quote data
│   ├── fonts/         # Self-hosted fonts
│   ├── icons/         # App icons
│   └── screenshots/   # Screenshots
├── app.js             # Main application
├── config.js          # Runtime configuration
├── service-worker.js  # Offline support
├── index.html
├── styles.css
└── manifest.json      # PWA metadata
\\\

## Tech Stack

- HTML5, CSS3, ES6+ JavaScript
- Service Worker API for offline support
- Web App Manifest for PWA features
- Lucide icons (self-hosted)
- ESLint & Prettier for code quality

## Browser Support

Modern browsers with PWA & Service Worker support:
- Chrome/Edge 51+
- Firefox 44+
- Safari 11.1+
- Opera 39+

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (\git checkout -b feature/amazing-thing\)
3. Commit your changes (\git commit -m 'feat: add amazing thing'\)
4. Push to the branch (\git push origin feature/amazing-thing\)
5. Open a Pull Request

## License

MIT — See [LICENSE](./LICENSE) for details
