# Quote.Web

Quote.Web is a production-focused Progressive Web App for daily inspiration. It delivers quote discovery with an immersive reader experience, fast search, and robust offline behavior.

Live demo: https://chronos778.github.io/quote.web

## Features

- Installable PWA with standalone app behavior
- Quote of the day + random quote fetch flow
- Command-palette search (Ctrl+K) with filters, sorting, and pagination
- Offline-first fallback using cached dataset and service worker caching
- Retry/backoff handling for API rate limits and transient network errors
- Mobile-optimized UI with accessibility-focused keyboard interactions

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript (ES6+)
- Service Worker API
- Web App Manifest
- Lucide icons (self-hosted)

## Installation

1. Clone the repository.

```bash
git clone https://github.com/Chronos778/quote.web.git
cd quote.web
```

2. Install tooling dependencies.

```bash
npm ci
```

3. Start a local static server (service worker requires HTTP origin).

```bash
npx serve .
```

4. Open http://localhost:3000 (or printed serve port).

## Usage

- Click Fresh Quote to load a random quote
- Press Ctrl+K (Cmd+K on macOS) to open search
- Use author, sort, order, and limit filters in the command palette
- Use Arrow keys and Enter for keyboard-first result navigation

## Environment Configuration

This is a static project, so runtime config is file-driven.

- Runtime config source priority:

1. window.QUOTE_WEB_CONFIG.apiBaseUrl in config.js
2. meta[name="quote-web-api-base"] in index.html
3. Default fallback in app.js

- Environment template is documented in .env.example for deployment tooling.

Example config.js:

```js
window.QUOTE_WEB_CONFIG = Object.freeze({
  apiBaseUrl: 'https://quotes-api-ruddy.vercel.app',
});
```

## Scripts

- npm run lint: ESLint checks
- npm run format: Prettier write mode
- npm run format:check: formatting verification
- npm run check: lint + format check
- npm test: alias for check

## Project Audit Summary

### What the project does

Quote.Web is a client-side PWA that fetches quotes from a remote API, supports search/filter flows, and provides offline fallback through service worker caching plus local JSON fallback data.

### Issues found during audit

- Local editor-only settings were committed
- Inconsistent licensing metadata between package.json and LICENSE
- Placeholder test script failed by design and was not CI-friendly
- Ambiguous implementation comments reduced repo polish
- Runtime API base URL had no explicit configuration contract

## Cleanup and Removal

### Removed

- .vscode/settings.json
  Reason: local developer preference (Live Server port) should not be versioned in a public production repo.

### Cleaned

- .gitignore stale entries removed and tightened
- Ambiguous font fallback comments rewritten for clarity
- Placeholder toolbar comment removed from index.html

## Codebase Refinement

- Added runtime config reader with URL validation and safe fallback
- Added search filter sanitization for sort/order/limit constraints
- Added global error and unhandled promise rejection logging hooks
- Preserved existing UX while improving reliability and maintainability

## Production Readiness Improvements

- Runtime API base configuration support via config.js + meta fallback
- Added .env.example to formalize deployment variable expectations
- Added consolidated npm run check quality gate
- Updated CI workflow to Node 22 with npm cache and unified quality check

## Dependency and Build Optimization

- package.json license aligned to MIT
- test script now runs meaningful checks instead of guaranteed failure
- Added Node engine requirement (>=20)
- Consolidated quality command to reduce CI duplication

## Folder Structure

### Before

```text
quote.web/
   app.js
   index.html
   styles.css
   service-worker.js
   manifest.json
   lucide.min.js
   assets/
   .vscode/settings.json
```

### After

```text
quote.web/
   .github/
      workflows/
         ci.yml
   assets/
      data/
         offline-quotes.json
      fonts/
      icons/
      screenshots/
   app.js
   config.js
   index.html
   styles.css
   service-worker.js
   manifest.json
   lucide.min.js
   .env.example
   .gitignore
   package.json
   README.md
   LICENSE
```

## Screenshots

- Desktop: assets/screenshots/desktop.png
- Mobile: assets/screenshots/mobile.png

## Repo Hygiene

- .gitignore now avoids stale patterns and tracks only meaningful exclusions
- Recommended commit style: imperative, concise
  - feat: add runtime API config fallback
  - fix: sanitize search filter inputs
  - chore: align CI quality checks
- Suggested branch strategy:
  - main: stable releases
  - feature/\*: features
  - fix/\*: bug fixes
  - chore/\*: maintenance

## Future Improvements

- Add automated browser tests for critical user flows (search, offline mode, copy/share)
- Add structured telemetry endpoint for production diagnostics
- Split app.js into modules (api, ui, search, offline) once feature scope grows
- Add release automation and changelog generation

## License

MIT. See LICENSE.
