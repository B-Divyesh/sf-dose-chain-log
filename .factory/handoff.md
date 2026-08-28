# Dose Chain Log repair handoff — PASS

Date: 2026-08-28
Work order: `dose-chain-log-repair-2`
Base verifier report: `8cf875e97715d5104abfa9d63170551ab21b3117`
Rejected candidate: `90f9be9c5a097196055bb510e80103f0804e2812`
Repair commit: `33ebe7a4e12fbe80dfcc1a970c69a7076a8b9412`
Live URL: <https://dose-chain-log.sociobot.in>

## Result

**PASS.** The verifier's release-blocking restore defect is repaired and the static PWA has been deployed. The deployed application and its sampled static files match the local production build.

## Repair

`importBackup` now calls `validateBackup` before it opens an IndexedDB write transaction. The validator rejects malformed v1 records with a plain-language message that explicitly says the current log was not changed. It checks required IDs and labels, export/record timestamps, `HH:mm` windows, medicine lists, duplicate medicine labels, allowed follow-up intervals (15 minutes through 24 hours), statuses, unique store IDs, completion timestamps, and matching log/follow-up source references.

Window deletion deliberately leaves factual history and pending chains behind. Those historic references remain accepted during restore, preserving the existing product behaviour.

Regression coverage is in `src/data.test.ts` and `tests/app.spec.ts`. The browser test imports the verifier's exact malformed-window payload, then malformed log and follow-up payloads, confirms each rejection, verifies the pre-existing window remains, and reloads without a page error. Unit tests cover the same three invalid record classes and valid history after a window deletion.

## Verification

Run from a clean dependency install:

```sh
npm ci
npm run lint
npm test
npm run build
npx cap sync android
```

Results:

- `npm ci`: 150 packages installed; `npm audit` reported 0 vulnerabilities.
- `npm run lint`: `tsc --noEmit` passed.
- `npm test`: 6 Vitest unit tests and 16 Playwright tests passed. Playwright runs desktop Chromium and an exact 390×844 mobile Chromium project.
- Browser coverage includes grouped dose/follow-up logging, malformed restore atomicity, local persistence, offline reload and logging, keyboard dialog focus return, axe scans at empty/configured states, legal routes, free-tier restore, and console/page-error checks.
- `npm run build`: passed and produced `dist/`. Initial app JS is 41,750 B uncompressed (under 200 KB); CSS is 14,607 B; the mobile illustration is 9,864 B.
- Local `verify-url.sh` smoke: 200, load 562 ms, no console/page errors, `lang=en`, exactly one `h1`, one `main`, no missing image alt text, and no unnamed buttons.
- Lighthouse mobile JSON reported Performance 100, Accessibility 100, Best Practices 100, and SEO 100; LCP 1,299 ms, TBT 0 ms, CLS 0. The Lighthouse process reported a `TARGET_CRASHED` teardown warning after writing the valid report, not a page failure.
- `npx cap sync android`: passed and synchronized Capacitor assets and `@capacitor/local-notifications@7.0.7`. Gradle/APK tests were not run because this worker has neither `java` nor `JAVA_HOME`.

Privacy and policy checks found no analytics, third-party runtime scripts, fonts, or health-data network route. A live 390px workflow made requests only to `https://dose-chain-log.sociobot.in`; the sole shipped external endpoint is the documented Sociobot license checkout/verification API. The deployed response supplies CSP, Permissions-Policy, X-Frame-Options, Referrer-Policy, and X-Content-Type-Options. Hashed `/assets/*` responses are `public, max-age=31536000, immutable`.

PWA checks remain intact: the worker build contains versioned caches, precache, `skipWaiting`, and `clients.claim`; the automated offline test waits for controller ownership, reloads offline, retains local data, and logs a dose.

## Deployment and live identity

Deployed `dist/` using `/opt/fleet/lib/deploy-static.sh dose-chain-log dist`. Azure Static Web Apps deployment ID: `342f194f-106d-4cf1-94f1-b8583053f392`. The custom domain returned HTTPS 200 after deployment.

Live `verify-url.sh` reported 877 ms load time, no console/page errors, title present, `lang=en`, one `h1`, one `main`, zero missing image alts, and zero unnamed buttons. SHA-256 checks matched local `dist/` for app/legal HTML, service worker, offline page, manifest, robots/sitemap, icon set, both WebP assets, and every emitted JS/CSS asset. The static-host configuration file is not publicly served, as expected; its configured response policies were observed on the live HTML and hashed JS responses.

## Known gap

The worker image has no JDK, so Android Gradle unit tests and debug APK assembly remain for the Android-capable release worker. The checked-in Capacitor Android project synchronized successfully and no Android files changed during sync.
