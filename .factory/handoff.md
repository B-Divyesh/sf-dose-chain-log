# Dose Chain Log repair handoff

Date: 2026-08-28
Work order: `dose-chain-log-repair-1`
Base candidate: `7e2751bea0d2d9cffbcfe726cb792bfd042a4e79`
Artifact/deploy class: Android-capable PWA, static deployment from `dist/`

## Repair completed

The failed offline-persistence test was a real service-worker lifecycle race.
The old worker called `skipWaiting()` outside its install `waitUntil` chain, so
precache completion, activation, and `clients.claim()` were not one ordered
lifetime. A clean browser context could therefore reach the test before the
new worker had claimed the page.

The worker is now cache version `dose-chain-v4` and makes its lifecycle
explicit:

- install completes the entire shell precache before awaiting `skipWaiting()`;
- activate completes stale-cache cleanup before awaiting `clients.claim()`;
- app registration begins before local-database startup and bypasses an
  intermediary HTTP cache for worker-update checks.

The browser suite now clears IndexedDB by awaiting the deletion request from a
non-app page, then waits for the platform lifecycle (`serviceWorker.ready` and
`controllerchange`) rather than polling or sleeping. The offline regression
asserts that `/sw.js` controls the page, turns the Playwright context offline,
reloads, confirms the saved `Evening` window remains, and records a new local
event. It has no arbitrary timing delay. A keyboard regression verifies
Enter opens the dialog, initial form focus is set, Escape closes it, and focus
returns to its opener.

## Verification evidence

All commands were run from `/work/repo` on 2026-08-28.

| Check | Result |
| --- | --- |
| `npm ci && npm run build` | Passed. TypeScript check and Vite build completed; deploy root is `dist/`. |
| `npm test` | Passed: 4 Vitest data tests + 7 Playwright 1.58.2 Pixel 5 Chromium tests in 24.6 s. |
| `npx playwright test --repeat-each=3` | Passed: 18 consecutive browser runs of the pre-existing workflow set, including the strict offline controller/reload flow; no controller timeout. |
| Browser/mobile workflow | Passed group setup, one-tap actual-time logging, follow-up chain, local persistence, offline reload and offline mutation, free-tier/restore UI, legal routes, and console-clean load. |
| Keyboard | Passed Enter/Escape dialog operation, form focus, and focus restoration. |
| Accessibility | Playwright axe reported zero serious or critical violations on both empty and configured states. |
| Privacy | Local IndexedDB persistence and offline mutation passed; browser tests cover standalone `/privacy/` and `/terms/`; source contains no analytics, third-party fonts, or runtime CDN scripts. |
| Service-worker update/offline | Lifecycle regression confirms the active `/sw.js` has claimed before offline navigation; precache/skip-waiting/claim ordering is now atomic across install and activate lifetimes. |
| `npx cap sync android` | Passed. Capacitor copied the production web build and detected `@capacitor/local-notifications@7.0.7`. |
| `cd android && ./gradlew test` | Not runnable in this static worker: no `java` executable and `JAVA_HOME` is unset. No APK build was attempted. |
| Lighthouse 12.8.2, local production preview, mobile | Passed with no runtime error: Performance 100, Accessibility 100, Best Practices 100, SEO 100; LCP 1.4 s, TBT 0 ms, CLS 0. |
| Output budgets | Initial app JS 29,396 B plus 8,773 B shared module (well below 200 KB); app CSS 14,607 B; no font payload; mobile WebP 9,864 B. |
| Live deployment | `/opt/fleet/lib/deploy-static.sh dose-chain-log dist` succeeded (Azure deployment `a50b876c-58a8-4bcd-bf5d-3de20926e9aa`). The custom domain reached `Ready` and HTTPS `https://dose-chain-log.sociobot.in/` returns 200. |
| Live identity/accessibility | `verify-url.sh` passed: title `Dose Chain Log — private group medication log`, `lang=en`, one `h1`, `main`, zero images without `alt`, zero unlabeled buttons, 638 ms load, and zero console/page errors. Live axe-core CLI 4.13.0 reported zero violations. |

The original product scope, dark pixel-sequencer visual system, generated-art
provenance, local-first data ownership, Sociobot-only billing integration, and
Capacitor Android skeleton are retained unchanged.

## Deployment and follow-up

Static deployment of the committed `dist/` output is complete at
`https://dose-chain-log.sociobot.in`.

The factory can later build the Android debug APK in an Android SDK/JDK worker
with `cd android && ./gradlew assembleDebug`; device testing remains necessary
for notification delivery under battery restrictions.
