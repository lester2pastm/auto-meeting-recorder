# Changelog

## [2.7.3] - 2026-04-29

### Changed

- Expanded meeting-title provider compatibility so title-generation requests can disable or isolate reasoning output for DeepSeek, GLM, Qwen, MiniMax, OpenAI reasoning models, OpenRouter, and DashScope-compatible gateways.
- Hardened title sanitization to strip common `<think>`/`<thinking>` blocks plus `Title:`-style prefixes before saving the final meeting title.

### Fixed

- Prevented reasoning-capable providers such as GLM, Qwen, and MiniMax from leaking thinking content into meeting titles or exhausting the short title token budget before the actual title text appears.
- Preserved DeepSeek title-generation compatibility while broadening provider-specific request handling and adding regression coverage for both direct and gateway-based configurations.

## [2.7.2] - 2026-04-29

### Added

- Added automated Linux `.deb` packaging alongside the existing AppImage artifacts in GitHub Actions release builds.
- Added a reusable CI build retry helper plus unit coverage so transient external packaging download failures can self-recover.

### Changed

- Disabled DeepSeek thinking mode specifically for meeting-title generation requests while keeping other OpenAI-compatible providers untouched.
- Applied build-command retries across Windows, macOS, Linux x64, Linux arm64, and manual workflow builds.

### Fixed

- Prevented DeepSeek-compatible lightweight models such as `deepseek-v4-flash` from failing title generation because of default thinking-mode behavior.
- Corrected the manual build workflow so Linux-only system dependency installation no longer runs in the Windows job.
- Fixed the Linux ARM64 GitHub Actions dependency list for `ubuntu-22.04` by replacing the unavailable `libasound2t64` package with `libasound2`.
- Added the package author email metadata required by Electron Builder when generating Linux `.deb` maintainers.

## [2.7.0] - 2026-04-29

### Changed

- Simplified the AI meeting-title prompt with a clearer output anchor to improve compatibility with lightweight OpenAI-compatible models such as `deepseek-v4-flash`.

### Fixed

- Kept empty-title responses as explicit failed title metadata instead of silently falling back, while removing the temporary cross-platform debugging noise added during investigation.
- Preserved safer provider error handling so non-standard error payloads no longer trigger secondary exceptions when building user-facing messages.

## [2.6.20] - 2026-04-29

### Changed

- Added detailed meeting-title diagnostics across API requests, app flow state transitions, and IndexedDB persistence to make cross-platform title failures easier to trace.

### Fixed

- Stopped treating blank AI title payloads as silent success; they now persist failed title metadata instead of falling back without explanation.
- Hardened summary/title/transcription error handling so non-standard provider error objects no longer throw a second error while building user-facing messages.

## [2.6.19] - 2026-04-28

### Added

- Added AI-generated meeting titles to history items and meeting detail views, with truncation and full-title hover support.

### Fixed

- Prevented invalid audio durations such as `Infinity` from forcing short recordings into segmented transcription.
- Failed fast when Windows desktop capture does not expose a usable system-audio track, and cleaned up acquired streams on error.

## [2.6.18] - 2026-04-27

### Changed

- Removed the Google Fonts dependency and switched the app to offline-friendly system font stacks for more reliable rendering on restricted networks.
- Reused the shared i18n instance through `globalThis`/`window` so browser-side retry messaging resolves localized strings consistently.

### Fixed

- Refreshed file-backed transcription segments before each retry so long-running SiliconFlow retries upload a fresh blob after timeouts or connection resets.
- Prevented raw `transcriptionRetryProgressTemplate` keys from leaking into the UI when retry progress updates render in the browser.

## [2.6.17] - 2026-04-04

### Added

- Added focused IPC validation coverage for main-process handlers.
- Added recovery failure-path integration coverage and a broader Playwright core-flow suite.
- Added a lightweight static server script for Playwright runs in local development and CI-like environments.

### Changed

- Validated optional API URL fields when reading settings from the UI.
- Reused the shared storage layer from recovery flows instead of maintaining duplicate IndexedDB write logic.
- Reduced `splitAudio()` overhead by avoiding duplicate reads and duplicate decoding work.
- Localized newly introduced user-facing fallback error messages through `i18n`.
- Updated legacy E2E smoke tests to match the current transcript/summary tab behavior.

### Fixed

- Removed duplicated `.btn-loading` style definitions.
- Prevented outdated E2E assumptions from failing the full regression suite when the summary tab is not active by default.
- Improved release-readiness by aligning documentation version markers with the packaged app version.
