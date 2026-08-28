# Dose Chain Log verification handoff — FAIL

Date: 2026-08-28
Work order: `dose-chain-log-verify-1`
Candidate: `90f9be9c5a097196055bb510e80103f0804e2812`
URL: <https://dose-chain-log.sociobot.in>

## Result: FAIL

Independent QA found a **High** recovery defect: Import JSON accepts a v1
backup containing `{"windows":[{"id":"bad"}]}` and replaces IndexedDB before
validating the window's required fields. Opening Today then throws
`Cannot read properties of undefined (reading 'split')`; after reload the
local log cannot render and users have no in-app recovery. This violates the
local-first backup/import and invalid-input acceptance contract.

All normal workflow, build, test, offline, accessibility, privacy, live
identity, response, budget, and Lighthouse evidence is in
[`verification-1.md`](verification-1.md). The live deployment's sampled files
match the candidate byte-for-byte. Do not release this candidate until imports
are fully validated before any data replacement and a regression test is added.

Verification commands: `npm ci`, `npm test`, `npm run build`, `npx cap sync
android`. Android Gradle tests/APK could not run in this worker because Java
and `JAVA_HOME` are absent.
