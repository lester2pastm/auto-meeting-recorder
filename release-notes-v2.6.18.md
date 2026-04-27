# Auto Meeting Recorder v2.6.18

This release improves transcription resilience for long recordings and removes the app's runtime dependency on Google Fonts.

## Highlights

- Removed remote Google Fonts loading and switched the renderer to offline-friendly system font stacks.
- Fixed segmented transcription retries so each retry reads a fresh file-backed audio blob instead of reusing the previous upload payload.
- Ensured retry progress messages always resolve localized text instead of exposing raw i18n keys in the UI.

## Reliability and UX improvements

- Long SiliconFlow transcription retries now behave more predictably after request timeouts and network resets.
- Restricted or certificate-intercepted networks no longer trigger Google Fonts loading errors in the app shell.
- Browser-side retry progress updates share the same i18n instance as the rest of the app.

## Testing and verification

- Added unit coverage for re-reading file-backed transcription segments before retry.
- Added unit coverage confirming the shared `i18n` instance is exposed to browser consumers.
- Verified related workflow and critical-path regression suites.

## Version

- App version: `2.6.18`
- Tag: `v2.6.18`
