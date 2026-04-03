# Quote.Web

A fast, installable Progressive Web App for discovering and sharing inspiring quotes. Built with vanilla JavaScript, fully functional offline, and optimized for mobile.

**[Live Demo](https://chronos778.github.io/Quote.Web/)** | **[GitHub](https://github.com/Chronos778/Quote.Web)**

## Overview

Quote.Web is a standalone PWA that provides seamless quote discovery with robust offline support. The application fetches quotes from a remote API, offers advanced search and filtering capabilities, and functions entirely offline using cached data and service worker technology.

## Features

- **Progressive Web App** — Install as a standalone application on desktop or mobile devices
- **Fast Search** — Command palette search (Ctrl+K) with filters, sorting, and pagination
- **Responsive Design** — Mobile-first UI with keyboard-friendly navigation
- **Offline Functionality** — Works seamlessly without internet connectivity
- **Random Quote Generator** — Fetch daily or random quotes with a single click

## Getting Started

### Prerequisites

- Node.js 20 or higher
- npm or yarn package manager

### Installation

```bash
git clone https://github.com/Chronos778/Quote.Web.git
cd Quote.Web
npm ci
npx serve .
```

Open http://localhost:3000 in your browser.

> Note: Service workers require an HTTP origin; local file:// protocol will not work.

## Usage Guide

| Action          | Description                                               |
| --------------- | --------------------------------------------------------- |
| **Fresh Quote** | Click the button to load a random quote                   |
| **Search**      | Press Ctrl+K (Cmd+K on macOS) to open the command palette |
| **Filters**     | Use author, sort, order, and limit filters in search      |
| **Navigation**  | Use Arrow keys to browse results, Enter to select         |

## Configuration

The API base URL is configured in the following order of precedence:

1. `config.js` — `window.QUOTE_WEB_CONFIG.apiBaseUrl`
2. `index.html` — `meta[name="quote-web-api-base"]`
3. Built-in application defaults

### Example Configuration

```javascript
window.QUOTE_WEB_CONFIG = Object.freeze({
  apiBaseUrl: 'https://quotes-api-ruddy.vercel.app',
});
```

## Development

### Available Scripts

```bash
npm run lint          # Run ESLint code style checks
npm run format        # Format code with Prettier
npm run format:check  # Verify code formatting without changes
npm run check         # Run lint and format checks
npm test              # Run all quality checks
```

### Project Structure

```
quote.web/
├── app.js             # Main application logic
├── config.js          # Runtime configuration
├── service-worker.js  # Offline support and caching
├── index.html         # Application markup
├── styles.css         # Application styles
├── manifest.json      # PWA manifest
├── lucide.min.js      # Icon library
├── assets/
│   ├── data/          # Offline quote dataset
│   ├── fonts/         # Self-hosted web fonts
│   ├── icons/         # Application icons
│   └── screenshots/   # Project screenshots
└── package.json       # Project metadata and scripts
```

## Technology Stack

- **Languages:** HTML5, CSS3, JavaScript (ES6+)
- **Architecture:** Progressive Web App with Service Worker
- **APIs:** Web App Manifest, Service Worker API
- **Icons:** Lucide (self-hosted)
- **Quality Tools:** ESLint, Prettier

## Browser Compatibility

Supported on modern browsers with PWA and Service Worker support:

| Browser       | Version |
| ------------- | ------- |
| Chrome / Edge | 51+     |
| Firefox       | 44+     |
| Safari        | 11.1+   |
| Opera         | 39+     |

## Contributing

Contributions are welcome! Follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m 'feat: add your feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Open a Pull Request

### Commit Convention

Please use conventional commits for clear history:

- `feat:` for new features
- `fix:` for bug fixes
- `chore:` for maintenance tasks
- `docs:` for documentation updates

## License

MIT — See [LICENSE](./LICENSE) for complete details
