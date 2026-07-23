# Contributing to Quote.Web

Thank you for your interest in contributing to Quote.Web! We welcome contributions from everyone. This document outlines the guidelines and processes for contributing to the project.

Quote.Web is a vanilla JavaScript Progressive Web App (PWA). Contributions typically involve Quote API integration, Service Worker caching, Vite build optimizations, and new PWA features.

## Table of Contents

- [How to Report Bugs](#how-to-report-bugs)
- [How to Suggest Features](#how-to-suggest-features)
- [Development Setup](#development-setup)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Documentation Updates](#documentation-updates)
- [Security Reporting](#security-reporting)

---

## How to Report Bugs

When reporting a bug, please ensure you include as much context as possible to help us reproduce the issue. 

Please pay special attention to these common problem areas:
- **Service Worker & PWA Issues**: Include whether the issue happens on first load or subsequent loads. Check the Application tab in DevTools for active service workers.
- **Offline Caching Problems**: Mention your browser, OS, and whether the network was throttled or completely offline.
- **Quote API Failures**: Include the network response status code and message if a fetch fails.
- **Vite Build Issues**: Include Node version, npm version, and the full error stack trace.

Use the GitHub Issue Tracker and use the `bug` label.

## How to Suggest Features

We love new ideas! When suggesting a feature, clearly describe the problem it solves and how you envision it working.

Common areas for enhancements include:
- **New Quote Sources**: Suggestions for new API endpoints or fallback offline quotes.
- **PWA Enhancements**: Improvements to offline UX, app install prompts, or push notifications.
- **Theme Options**: New color palettes or background animations (like the Starfield).
- **Sharing Features**: Enhancements to the Image Generator canvas, deep linking, or web share API.

Use the GitHub Issue Tracker and use the `enhancement` label.

## Development Setup

1. **Prerequisites**: Ensure you have Node.js (v20+) installed.
2. **Clone the repository**: `git clone https://github.com/Chronos778/Quote.Web.git`
3. **Install dependencies**: `npm install`
4. **Start the dev server**: `npm run dev` (powered by Vite)

### NPM Scripts

- `npm run dev`: Starts the local Vite development server.
- `npm run build`: Creates a production-ready build in the `dist` folder.
- `npm run preview`: Previews the production build locally.
- `npm run lint`: Runs ESLint against the JavaScript source files.
- `npm test`: Runs Vitest unit tests.
- `npm run test:e2e`: Runs Playwright End-to-End tests.

## Code Style Guidelines

We enforce a consistent code style across the project. 

- **JavaScript Standard**: We use ES2022 syntax and native ES Modules (`import`/`export`).
- **Linting**: Ensure you run `npm run lint` before committing. We use ESLint to catch syntax errors and enforce best practices.
- **Formatting**: Prettier is configured in the repository. Please ensure your editor runs Prettier on save.
- **Vite**: Keep the build configuration minimal. Avoid adding massive dependencies unless strictly necessary to keep the PWA lightweight.
- **Vanilla JS**: This is a framework-free project. Do not introduce React, Vue, or similar libraries.

## Testing Requirements

We expect all new features and bug fixes to be tested appropriately.

- **Unit Tests**: Write Vitest unit tests for pure functions, data normalization (`api.js`), and utilities. Run them with `npm test`.
- **E2E Tests**: Playwright is used for critical user flows (e.g., search, toggling favorites, opening the image generator). Run them with `npm run test:e2e`.
- **PWA Offline Testing**: If you modify `service-worker.js` or caching logic, you must manually test offline functionality. Disable your network in Chrome DevTools and verify that the app still loads, displays cached quotes, and handles API fallbacks gracefully.

## Pull Request Process

1. Fork the repository and create a new branch from `main` (e.g., `feat/new-theme` or `fix/cache-bug`).
2. Implement your changes following the [Code Style Guidelines](#code-style-guidelines).
3. Ensure all tests pass (`npm test` and `npm run test:e2e`) and the linter is happy (`npm run lint`).
4. Update relevant documentation (see below).
5. Submit a Pull Request.

**Commit Convention**: We follow Conventional Commits:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `chore:` for maintenance or dependency updates
- `perf:` for performance improvements

## Documentation Updates

If your changes affect how the application is built, configured, or run, you must update the documentation:
- **README.md**: Update if you add new npm scripts, change requirements, or add major features.
- **API Configuration**: Update `config.js` and the README if the Quote API integration changes.
- **Manifest**: Update `public/manifest.json` if you change icons, theme colors, or display modes.

## Security Reporting

If you discover a security vulnerability, please do NOT open a public issue. This is especially important for:
- PWA Service Worker caching leaks (e.g., exposing sensitive user data across origins)
- Quote API vulnerabilities or injection vectors (e.g., XSS via maliciously formatted quotes)
- Offline data manipulation (e.g., exploiting localStorage parsing)

Please report security issues by emailing the repository maintainer directly or using GitHub's private vulnerability reporting feature.
