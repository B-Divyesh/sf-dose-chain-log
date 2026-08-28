# Dose Chain Log repair handoff — PASS

Date: 2026-08-28
Work order: `dose-chain-log-repair-3`
Rejected/base candidate: `c3c014dae94409804d75123d9c48404cd0be7929`
Repair commits: `795f0daa43415264624078dc05ec24ea3fc81db8`, `6a4e0363da8073d809cb1496d15e11ac5517deda`
Live URL: <https://dose-chain-log.sociobot.in>

## Result

**PASS.** The production-preview offline path is deterministic, verifies that a real built service worker controls the page, and proves that a newly logged dose survives a second reload while the browser remains offline. The repaired build is deployed and the live static files match local `dist/`.

## Diagnosis and repair

The reported `navigator.serviceWorker.controller === null` failure did not reproduce at the supplied base: the focused baseline run passed in both desktop and 390×844 Chromium. Repository history also contains no `vite-plugin-pwa`; this product uses a hand-authored worker. The base Playwright configuration already ran `npm run build && npm run preview`, and the worker already used install-time `skipWaiting()` plus activate-time `clients.claim()`.

The remaining test helper did contain a controller ownership race: it awaited `navigator.serviceWorker.ready`, checked `controller`, and only then installed the `controllerchange` listener. A claim occurring between the check and listener could leave the test waiting forever. The helper now installs the listener first and resolves either from `controllerchange` or from the post-`ready` controller check.

The focused regression now also proves that the test server is a production bundle (no `/@vite/client`), the generated worker has its hashed app asset injected, `skipWaiting()` and `clients.claim()` remain present, the offline fallback uses an external stylesheet, controller ownership exists before and after offline reload, and the actual recorded dose remains in history after a second offline reload. `npm run test:offline` exposes this check directly.

Live QA found and reproduced one additional production-only offline defect: `/offline.html` contained inline CSS, which the deployed `style-src 'self'` CSP blocked. The styles now live in `/offline.css`, that file is precached, and the cache version is `dose-chain-v5`. A regression rejects a fallback page that reintroduces inline `<style>` and verifies the stylesheet is served.

## Verification

Commands run from the repository:

```sh
npm ci
npx playwright test --grep "persists locally and works after the network goes offline" --reporter=list
npm run test:offline
npm run lint
npm test
npm run build
npx cap sync android
/opt/fleet/lib/verify-url.sh http://127.0.0.1:4173 <evidence-dir>
CHROME_PATH=/opt/pw-browsers/chromium-1208/chrome-linux64/chrome npx --yes lighthouse@12.8.2 http://127.0.0.1:4173 ...
```

Results:

- Clean `npm ci`: 150 packages installed, 0 vulnerabilities.
- Baseline focused offline test: 2/2 passed; the supplied base did not reproduce the reported null-controller failure.
- `npm run lint`: passed (`tsc --noEmit`).
- `npm test`: 6/6 Vitest tests and 16/16 Playwright tests passed across desktop Chromium and exact 390×844 mobile Chromium.
- Final focused production/offline regression after the CSP repair: 2/2 passed.
- Exact clean production command `npm run build`: passed and produced `dist/`.
- Initial JS is 41,738 B uncompressed; app CSS is 14,607 B; offline CSS is 322 B; mobile illustration is 9,864 B. All are within budget.
- Local `verify-url.sh`: HTTP 200 in 617 ms, no console/page errors, title present, `lang=en`, one `h1`, one `main`, no missing image alt text, and no unnamed buttons.
- Playwright axe scans at empty and configured states found zero serious/critical violations. Keyboard dialog open/close and focus return passed on desktop and mobile. A separate 390px reduced-motion check found a 3px amber focus outline, 0 horizontal overflow, and 0.01 ms transition duration.
- Lighthouse mobile: Performance 99, Accessibility 100, Best Practices 100, SEO 100; LCP 1,411 ms, TBT 116 ms, CLS 0. Lighthouse wrote a complete report with no run warnings, then its Chromium process reported a teardown `TARGET_CRASHED`; the report itself was valid.
- `npx cap sync android`: passed with `@capacitor/local-notifications@7.0.7`; no tracked Android files changed.
- Privacy inspection found no analytics, third-party scripts/fonts, or health-data network route. The only external app endpoint is the documented Sociobot checkout/license verification API. A runtime 390px audit contacted only the app origin.
- Manifest has standalone display, versioned start URL, 192×192, 512×512, and maskable icons. The built worker contains hashed app precache entries, versioned caches, `skipWaiting()`, `clients.claim()`, and the offline fallback stylesheet.

## Deployment and live QA

Deployed the final `dist/` with:

```sh
/opt/fleet/lib/deploy-static.sh dose-chain-log dist
```

Final Azure Static Web Apps deployment ID: `a5d94db0-ecbd-445f-a9ad-6796e2cb9adf`.

Live verification at the custom HTTPS URL returned 200 in 676 ms with no console/page errors, valid title/lang/main structure, one `h1`, no missing alt text, and no unnamed buttons. A fresh 390×844 browser profile created a window, acquired `/sw.js` control, went offline, reloaded, logged a dose, reloaded again while offline, and found the dose in History. Controller ownership remained non-null; the only contacted origin was `https://dose-chain-log.sociobot.in`.

SHA-256 comparison matched all 21 publicly served files in local `dist/` against the live origin (excluding the host-only `staticwebapp.config.json`). Live headers include CSP, Permissions-Policy, X-Frame-Options, Referrer-Policy, X-Content-Type-Options, and HSTS; hashed assets use `public, max-age=31536000, immutable`.

## Known gap

This worker has no `java` executable or `JAVA_HOME`, so Android Gradle tests and debug APK assembly could not run. The requested deployment class remains static/PWA, and the checked-in Capacitor Android skeleton synchronized successfully for the later Android build work order.
