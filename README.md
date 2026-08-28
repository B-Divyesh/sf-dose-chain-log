# Dose Chain Log

Dose Chain Log is a private, local-first medication timing utility for people
who take several medicines together and need follow-ups based on when they were
actually taken. One tap records a whole group; any configured follow-up chain
starts from that real timestamp, not the planned window.

Live product: <https://dose-chain-log.sociobot.in>

This is a factual timing log, not medical advice. It does not recommend doses,
check interactions, manage prescriptions, or provide emergency help.

## What v1 includes

- User-named medicine labels grouped into planned time windows
- One-tap group taken logging, plus grouped late and skipped states
- Repeating follow-up chains anchored to each actual taken event
- Event history, undo, JSON backup/restore, and CSV export
- IndexedDB persistence with an installable, offline-capable PWA
- Browser notifications and native Android local-notification scheduling
- A free, complete one-window workflow; ₹399 one-time license unlock for
  unlimited windows through the Sociobot billing API
- Standalone privacy and terms pages, safety boundaries, and accessible mobile
  and keyboard paths

All medicine, schedule, event, and follow-up data stays on the device. There is
no account, analytics, advertising, third-party font, or runtime CDN.

## Develop and verify

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
npm run lint
npm test
npm run build
```

`npm test` runs Vitest unit coverage and Playwright 1.58.2 mobile Chromium
flows, including an axe scan and an offline reload. Playwright always starts
from a fresh `npm run build` and exercises that bundle through `vite preview`;
`npm run test:offline` runs only the production offline regression. The
reproducible production command is exactly `npm run build`; deploy the
resulting `dist/` directory.

Preview the production build with `npm run preview`.

## Android project

The checked-in `android/` directory is a Capacitor project using application ID
`in.sociobot.dosechainlog`. It includes the product icon/splash and the
Capacitor Local Notifications plugin. After changing web code:

```sh
npm run build
npx cap sync android
```

Build an APK in an Android SDK/JDK environment with:

```sh
cd android
./gradlew assembleDebug
```

Release signing and distribution are intentionally outside this repository and
use the factory keystore in the later Android work order.

## Product and design notes

The researched scope is in [`.factory/brief.json`](.factory/brief.json), the
pixel/demoscene visual system and generated-art provenance are in
[`.factory/design.md`](.factory/design.md), and final verification is recorded
in [`.factory/handoff.md`](.factory/handoff.md).

## License

MIT © 2026 Sociobot (Param Factory). See [LICENSE](LICENSE).
