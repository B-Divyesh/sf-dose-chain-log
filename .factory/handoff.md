# Dose Chain Log v1 handoff

Date: 2026-08-28  
Work order: `dose-chain-log-build-1`  
Deploy: static `dist/` plus checked-in Capacitor Android project skeleton

## What was built

- A production Vite + TypeScript PWA for grouped medicine-event confirmation.
- User-configured shared windows with one or more medicine labels and optional
  15-minute to 24-hour follow-up intervals.
- One-tap “Mark all taken now”, plus group late and skip actions. Actual press
  time anchors follow-up events; marking a follow-up taken continues its chain.
- Clear today, pending-chain, history, setup, empty, error and offline states.
- Undo for event logging, follow-up completion and window deletion.
- IndexedDB persistence; user-initiated JSON backup/restore and CSV export.
- PWA manifest, maskable icons, deterministic app-shell precache, offline
  fallback, cache cleanup, update notice and install-safe mobile layout.
- Optional browser notifications plus Capacitor Local Notifications for the
  Android wrapper, including runtime permission and persisted rescheduling.
- One useful free window; ₹399 one-time full unlock for unlimited windows using
  the Sociobot checkout, return-token storage, daily verification caching,
  optimistic offline unlock and paste-to-restore flow. Safety, accessibility,
  logging and exports are not paywalled.
- Standalone `/privacy/` and `/terms/` pages. No analytics, accounts, remote
  health-data sync, third-party scripts, fonts, or runtime CDNs.
- Original pixel/demoscene visual system, generated explanatory artwork and
  hand-authored app mark. Full provenance and prompt are in `design.md` and
  `assets/src/dose-sequencer.prompt.json`.
- Capacitor Android project at `android/`, app ID
  `in.sociobot.dosechainlog`, with branded launcher assets and splash screens.

## Verification

Run from a clean checkout:

```sh
npm install
npm test
npm run build
npx cap sync android
```

Verified in this worker:

- `npm test`: pass — 4 Vitest unit tests and 6 Playwright 1.58.2 mobile
  Chromium tests.
- Playwright paths cover group creation, one-tap logging, actual-time follow-up
  creation, persistence, offline reload and offline mutation, free-tier limit,
  license restore UI, legal routes, and console-clean load.
- Playwright axe scan: no serious or critical issues in empty or configured
  states.
- `npm run build`: pass; output root is exactly `dist/` with `index.html`.
- `npx cap sync android`: pass; Local Notifications plugin detected.
- Initial shipped JS: 29.33 KB main + 8.77 KB shared module uncompressed
  (well below 200 KB). CSS: 14.61 KB. No font payload. Mobile hero: 9.9 KB
  (12 KB on disk), below 300 KB.
- Lighthouse 12.8.2 mobile against the production build:
  - Performance: 100
  - Accessibility: 100
  - Best Practices: 100
  - SEO: 100
  - LCP: 1.5 s
  - Total Blocking Time: 0 ms
  - CLS: 0
  - Speed Index: 1.1 s
- Visual review completed at Pixel 5/390px-class and 1440px widths. Focus,
  safe-area spacing, 48px targets, contrast, reduced-motion and one-h1
  semantics are implemented.

## Known gaps / next work order

- This static worker did not provide a JDK, so no APK was assembled. The next
  Android work order should run `./gradlew assembleDebug`, exercise local
  notifications on a physical Android device (including reboot and battery
  restriction cases), then use the factory keystore for a signed release.
- The factory must register the production billing product and confirm the
  ₹399 price/return URL before release. The UI intentionally contains no
  hardcoded billing product ID or provider integration.
- Browser PWA notifications are best-effort while the installed app is active;
  Android APK delivery uses the native local-notification path. This limitation
  is stated in-product and does not affect the persistent pending-chain view.
- A real 30-day opt-in pilot is still needed to measure the brief’s adherence
  capture and median-tap success targets. No telemetry was added; any study
  should use explicit participant-provided exports.
