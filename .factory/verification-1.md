# Independent verification #1 — FAIL

Date: 2026-08-28
Candidate: `90f9be9c5a097196055bb510e80103f0804e2812`
Live URL: <https://dose-chain-log.sociobot.in>

## Verdict

**FAIL.** The ordinary group-log workflow is sound, but a schema-invalid JSON
backup that passes the shallow version/array check can overwrite the on-device
log and leave the app unusable. This fails the required invalid-input and
recovery path for a local-first medication log.

## Blocking defect

### High — accepted malformed backup can brick the local log

`importBackup` accepts a v1 object when `windows`, `logs`, and `followUps` are
arrays, without validating individual records. In a clean Chromium profile I
imported this user-selected file through **More → Import JSON → Replace and
import**:

```json
{"version":1,"windows":[{"id":"bad"}],"logs":[],"followUps":[]}
```

The import succeeds and replaces the stores. Navigating to Today produces the
page error `Cannot read properties of undefined (reading 'split')` because the
window has no `time`; a reload with the Today route cannot render the log.
There is no in-app restore or data-clear action on the resulting recovery
screen. A person must use browser/app site-storage controls to recover, losing
the imported/current log unless they independently retained an export.

Required remediation: validate every backup record (required fields, types,
statuses, times, interval bounds, referential IDs) before opening a write
transaction; reject atomically with a plain-language error and preserve the
current stores. Add an integration regression for this payload and for a
malformed log/follow-up record.

## Passed evidence

All work ran from a clean checkout at the candidate SHA using `npm ci`.

| Area | Evidence/result |
| --- | --- |
| Install, types, production build | `npm ci` completed with 0 vulnerabilities. Exact `npm run build` passed (`tsc --noEmit && vite build`) and produced `dist/`. |
| Automated tests | `npm test` ran Vitest (4/4) and Playwright. A subsequent `npx playwright test --reporter=list` completed; `test-results/.last-run.json` reports `status: passed`, no failed tests. No lint command exists in `package.json`. |
| Main job | Independent 390px Chromium run created a three-medicine group, rejected duplicate labels, logged all three in one tap, showed two actual-time follow-ups (15 min and 24 hr), completed a follow-up which scheduled the next link, and showed all three history entries. Live URL independently logged two medicines in one action and created one 15-minute follow-up. |
| Invalid/recovery paths | Duplicate medicine labels display a specific error; removing the only medicine displays a specific error; unsupported backup version displays `This backup version is not supported.`; export produced `dose-chain-backup.json`. The malformed-record case above fails. |
| Offline/PWA | Independently waited for `/sw.js` control, set the 390px context offline, reloaded, retained the saved window, and observed `OFFLINE · LOGGING LOCALLY`. The checked-in worker has versioned caches, precache, `skipWaiting`, and `clients.claim`; update toast code is present. |
| Accessibility/keyboard/motion | axe Playwright scans at empty and configured states: 0 serious/critical findings; live empty state: 0. Keyboard Tab produced a visible `solid 3px rgb(255, 209, 102)` focus ring; existing keyboard dialog test passed. Under reduced motion, transition duration was `1e-05s`. Live document has `lang=en`, one `h1`, and one `main`. |
| Layout/errors | 390px and 1440px manual browser runs had no page/console errors during valid workflows; desktop had no horizontal overflow. |
| Privacy/outbound | Empty local and live workflows made no third-party requests. Source inspection found no analytics, CDN font, or health-data network route; the only external app endpoint is the documented Sociobot license checkout/verification API. IndexedDB is local and JSON/CSV export is user initiated. Privacy and terms routes load. |
| Performance | Local production Lighthouse: Performance 100, Accessibility 100, Best Practices 100, SEO 100; LCP 1,276 ms, TBT 0 ms, CLS 0. Initial JS is 42,166 B uncompressed (29,396 B app + 8,773 B shared + smaller chunks), CSS 14,607 B, no fonts, and mobile WebP 9,864 B. |
| Live identity | SHA-256 of live `/`, `/sw.js`, manifest, offline page, five JS/CSS assets, mobile illustration, and icon exactly matched the candidate `dist/` output. Live normal workflow was console/page-error clean. |
| Android | `npx cap sync android` passed and detected `@capacitor/local-notifications@7.0.7`; its dependency manifest supplies `POST_NOTIFICATIONS`. `./gradlew test`/APK build could not run because this worker has no `java` executable and no `JAVA_HOME`. |

## Non-blocking deployment observations

- The live origin supplies HSTS, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Content-Type-Options: nosniff`, but no `Content-Security-Policy`, `Permissions-Policy`, or `X-Frame-Options` header was observed.
- Hashed JS/CSS assets are served with `Cache-Control: public, must-revalidate, max-age=30`, rather than a long-lived immutable policy. The service worker masks much of this for installed use, but it leaves avoidable repeat-network work for normal web loads.

## Re-run

```sh
npm ci
npm test
npm run build
npm run preview
```

Then import the JSON payload above from More on a fresh profile, navigate to
Today, and reload. The candidate will reproduce the failure.
