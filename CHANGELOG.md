# Changelog

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
