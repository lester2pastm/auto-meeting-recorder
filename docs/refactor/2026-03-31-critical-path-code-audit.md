# Critical Path Code Audit

**Date:** 2026-03-31  
**Scope:** Recording start/stop, persistence, transcription, summary generation, recovery, meeting detail retry flows, and test infrastructure.

## 1. Audit Goal

This audit focused on the user-facing critical path of the Electron application:

1. Start recording
2. Stop recording and persist audio
3. Transcribe audio
4. Generate summary
5. Recover unfinished recordings
6. Retry or refresh results from meeting detail/history flows

The goal was to identify issues that could cause data loss, incorrect persisted state, stuck workflows, or unreliable regression signals.

## 2. Findings Summary

### High Priority Findings

1. **Standard recording cleanup leaked system audio streams**
   - In the standard recording path, the system audio stream was shadowed by a local variable in `src/js/recorder.js`.
   - `stopAllStreams()` only cleaned the module-level stream reference, so the actual system stream could remain active after stop.
   - Risk:
     - system capture not released cleanly
     - follow-up recordings becoming unstable
     - platform-level capture indicators remaining active

2. **Failed transcription retry bypassed the persisted workflow**
   - The main retry button in `src/js/app.js` called `transcribeAudio()` directly instead of reusing the normal `retryTranscription()` / `processRecording()` flow.
   - Risk:
     - subtitle UI updated but meeting record stayed stale
     - transcript status in IndexedDB remained inconsistent
     - summary generation did not resume after retry
     - loading state handling was incomplete on success

3. **Meetings could remain stuck in `pending` when STT config was missing**
   - The stop-recording path first created a pending meeting record, then `processRecording()` returned early if STT settings were absent.
   - Risk:
     - history contained records that looked in-progress forever
     - persisted state did not reflect the real failure mode

### Medium Priority Findings

4. **Main-page summary refresh did not persist the regenerated summary**
   - The main summary refresh flow updated the current UI but did not write the new summary back to the active meeting record.
   - Risk:
     - main page and detail page behavior diverged
     - regenerated results were lost after reopening the record

5. **Meeting detail audio previews leaked Blob object URLs**
   - Each detail render created a new `URL.createObjectURL()` without revoking the previous one.
   - Risk:
     - repeated history/detail usage accumulated unnecessary memory

### Tooling / Verification Findings

6. **Jest scanned platform backup dependency directories**
   - `node_modules_win/` and `node_modules_linux/` were included in the Jest crawl.
   - Risk:
     - haste naming collisions
     - noisy or unreliable regression signals

7. **A script-style test file with `process.exit()` was matched by Jest**
   - `tests/tdd-linux-recording-paths.test.js` behaved like a standalone script rather than a Jest test suite.
   - Risk:
     - test runner pollution
     - false negatives or abrupt runner termination

## 3. Changes Applied

The following fixes were implemented during the audit:

1. **Reused the persisted retry workflow**
   - `handleRetryTranscription()` now routes retryable meeting flows through the normal retry/transcription pipeline.
   - This keeps UI state, DB state, transcript status, and summary generation aligned.

2. **Marked missing-STT-config processing as failed**
   - `processRecording()` now updates the meeting status to `failed` before returning when STT configuration is missing.

3. **Persisted refreshed summaries**
   - Main-page summary refresh now writes the regenerated summary back to the current meeting when a meeting context exists.

4. **Fixed stream ownership for standard recording cleanup**
   - The system audio stream reference in `src/js/recorder.js` now uses the shared module-level variable so `stopAllStreams()` can clean it correctly.

5. **Added detail preview cleanup**
   - Audio preview Blob URLs are revoked before re-render.
   - Closing the detail modal now also releases the active preview URL.

6. **Stabilized Jest configuration**
   - Ignored `node_modules_win/` and `node_modules_linux/`.
   - Excluded the standalone TDD script test from normal Jest matching.

## 4. Regression Coverage Added

New or expanded tests now cover:

1. Retry transcription reusing the main persisted workflow
2. Summary refresh persistence
3. Missing STT configuration no longer leaving meetings in `pending`
4. Recorder cleanup releasing system audio streams
5. Detail audio preview URL cleanup on re-render
6. Detail audio preview URL cleanup on modal close

Related files:

- `tests/unit/app-critical-path.test.js`
- `tests/unit/recorder-cleanup.test.js`
- `tests/unit/ui-loading.test.js`

## 5. Verification Result

Verification command run after changes:

```bash
npm test -- --runInBand
```

Result at audit completion:

- `28` test suites passed
- `240` tests passed
- `8` tests skipped
- `0` test suites failed

## 6. Residual Risks

The critical path is in a materially better state, but some structural risks remain:

1. **Global mutable renderer state**
   - `currentSettings`, `currentMeetingId`, `currentAudioBlob`, and recording globals still span multiple flows.
   - This remains a source of coupling and future race-condition risk.

2. **Cross-file UI workflow coupling**
   - `app.js`, `ui.js`, `recorder.js`, and `storage.js` still coordinate through direct globals and implicit sequencing.
   - A future refactor toward explicit state ownership would reduce regression risk.

3. **Test log noise**
   - Some tests still emit console output from production code paths.
   - This is not a correctness issue, but it does reduce signal quality during review.

## 7. Recommended Next Steps

### Short Term

1. Introduce a small workflow state wrapper for the active meeting lifecycle instead of spreading state across globals.
2. Reduce console noise in tests by stubbing logging in selected suites.
3. Add one integration test for the full failed-transcription then retry-to-summary path.

### Medium Term

1. Extract meeting processing orchestration from `app.js` into a dedicated workflow module.
2. Make transcript and summary status fields explicit and symmetric.
3. Reduce direct DOM-driven state derivation in favor of a single in-memory source of truth.

## 8. Conclusion

The highest-risk issues found in this audit were not architectural speculation; they were concrete critical-path inconsistencies in cleanup, retry orchestration, persistence, and test reliability. Those issues have been corrected and covered with regression tests.

The project still has legacy coupling, but the immediate user-facing path from recording to persisted result is now more coherent, more recoverable, and easier to verify.
