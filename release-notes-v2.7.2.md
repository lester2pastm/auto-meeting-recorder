# Auto Meeting Recorder v2.7.2

This release improves packaging reliability and restores meeting-title generation compatibility for DeepSeek-compatible lightweight models.

## Highlights

- Disabled DeepSeek thinking mode for meeting-title generation requests so `deepseek-v4-flash` can return usable title content more reliably.
- Added automatic `.deb` packaging to Linux release builds alongside the existing AppImage artifacts.
- Added a reusable build retry wrapper across Windows, macOS, Linux x64, Linux arm64, and manual workflows to reduce CI failures caused by transient upstream download errors.

## Reliability and release pipeline improvements

- Title-generation requests now keep provider-specific compatibility logic scoped to DeepSeek-compatible APIs and model names instead of sending unsupported fields to other OpenAI-compatible providers.
- Release workflows can retry packaging commands after temporary external failures such as intermittent `502` responses while fetching Electron Builder dependencies.
- Manual workflow configuration now keeps Linux-only package prerequisites in the Linux job instead of attempting them in the Windows runner.

## Testing and verification

- Added unit coverage for DeepSeek thinking-mode request handling in title generation.
- Added unit coverage for the retry helper covering both eventual success and exhausted retries.
- Re-ran title flow and helper regression tests related to meeting-title persistence and sanitization.

## Version

- App version: `2.7.2`
- Tag: `v2.7.2`
