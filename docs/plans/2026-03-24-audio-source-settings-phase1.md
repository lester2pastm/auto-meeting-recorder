# Audio Source Settings Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a universal audio source settings card that appears on all platforms, with Linux source enumeration and safe fallback behavior during recording startup.

**Architecture:** Keep user preferences in the existing settings object and store only the preferred source ids, not full device snapshots. Add a small shared helper for default values and fallback selection, expose source enumeration from Electron on Linux, and let the recorder read the saved preference before choosing FFmpeg or `getUserMedia` inputs.

**Tech Stack:** Electron IPC, browser media devices, PulseAudio source detection, vanilla JS UI, Jest

---

### Task 1: Add failing tests for settings defaults and source fallback

**Files:**
- Create: `tests/unit/audio-source-settings.test.js`
- Create: `src/js/audio-source-settings.js`

**Step 1: Write the failing test**

Cover:
- default settings include `preferredMicSource: 'auto'`
- default settings include `preferredSystemSource: 'auto'`
- preferred source is kept when still available
- preferred source falls back to recommended source when missing
- fallback returns `auto` when no recommended source exists

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/audio-source-settings.test.js`

**Step 3: Write minimal implementation**

Add helper functions:
- `getDefaultAudioSourceSettings`
- `resolvePreferredAudioSource`
- `buildLinuxAudioSourceState`

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/audio-source-settings.test.js`

### Task 2: Add settings UI and persistence wiring

**Files:**
- Modify: `src/index.html`
- Modify: `src/js/ui.js`
- Modify: `src/js/app.js`

**Step 1: Write the failing test**

Extend UI-focused tests to cover:
- loading preferred source values into the new selects
- reading preferred source values back from the UI

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/ui-audio-source-settings.test.js`

**Step 3: Write minimal implementation**

Add:
- settings card with two selects and refresh button
- helper text/status area
- `renderAudioSourceOptions`
- persistence through `getSettingsFromUI` and `loadSettings`

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/ui-audio-source-settings.test.js`

### Task 3: Add Linux enumeration IPC and recorder preference fallback

**Files:**
- Modify: `electron/linux-audio-helper.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `src/js/recorder.js`

**Step 1: Write the failing test**

Cover:
- Linux pulse sources split into microphone and system source lists
- recorder-selected source falls back when saved source is missing

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/linux-audio-helper.test.js tests/unit/audio-source-settings.test.js`

**Step 3: Write minimal implementation**

Add:
- IPC to enumerate Linux audio sources
- preload bridge method
- recorder startup path that reads saved preferences and falls back to recommended sources

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/linux-audio-helper.test.js tests/unit/audio-source-settings.test.js`

### Task 4: Verify focused regressions

**Files:**
- Modify: none unless verification reveals issues

**Step 1: Run focused verification**

Run:
- `npm test -- tests/unit/audio-source-settings.test.js`
- `npm test -- tests/unit/ui-audio-source-settings.test.js`
- `npm test -- tests/unit/linux-audio-helper.test.js`
- `npm test -- tests/unit/linux-audio-recording.test.js tests/linux-audio-test.js`

**Step 2: Review diff and summarize risks**

Check:
- no unrelated settings flow regressions
- non-Linux still shows system source select with unavailable state
- Linux startup still degrades cleanly to mic-only or monitor-only recording
