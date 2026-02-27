# Legacy Technical Audit & Architecture Overview

**Date:** 2026-02-13
**Version:** 1.0
**Purpose:** Document the existing architecture, technical debt, and functionality to guide the Vue 3 + TypeScript refactoring.

## 1. Project Overview
Auto Meeting Recorder is a desktop application for recording meetings, transcribing audio, and generating AI summaries. It supports Windows, macOS, and Linux, with specific optimizations for Linux system audio recording.

## 2. Technical Stack (Legacy)

| Component | Technology | Notes |
| :--- | :--- | :--- |
| **Framework** | Electron 28.0.0 | Main process management |
| **UI Library** | Vanilla JS / HTML / CSS | No frontend framework used |
| **Build Tool** | Electron Builder | Cross-platform packaging |
| **State Management** | Global Variables | `window.currentSettings`, `window.isRecording` |
| **Storage** | IndexedDB (Dexie-like wrapper) | Metadata storage (meetings, transcripts) |
| **Config** | Electron Store | File-based persistent configuration |
| **Audio (Win/Mac)** | MediaRecorder API | Web standard recording |
| **Audio (Linux)** | FFmpeg / PulseAudio / PipeWire | System-level audio capture via `child_process` |
| **Testing** | Jest (Unit), Playwright (E2E) | |

## 3. Architecture Analysis

### 3.1 Process Model
- **Main Process (`electron/main.js`)**:
  - Window creation and lifecycle management.
  - Native file system access (`fs`).
  - `child_process` management for FFmpeg (Linux).
  - IPC handlers for `saveAudio`, `getAudio`, `checkFFmpeg`, etc.
- **Renderer Process (`src/js/*.js`)**:
  - Direct DOM manipulation.
  - Business logic mixed with UI code.
  - IPC communication via `window.electronAPI` (Context Isolation enabled).

### 3.2 Data Flow
1.  **Audio Capture**:
    *   **Win/Mac**: `navigator.mediaDevices.getUserMedia` -> `MediaRecorder` -> `Blob`.
    *   **Linux**: `ffmpeg` process -> stdout stream -> `File Stream`.
2.  **Storage**:
    *   Audio blobs are converted to `ArrayBuffer` -> sent via IPC -> written to `userData/audio_files`.
    *   Meeting metadata (ID, timestamp, duration) stored in IndexedDB.
3.  **Transcription**:
    *   Audio file -> OpenAI Whisper API (or compatible) -> Text.
    *   Text stored in IndexedDB.

### 3.3 File Structure (Key Files)
- `src/js/app.js`: Application entry point, UI initialization, global event listeners.
- `src/js/recorder.js`: **CRITICAL**. Handles recording state machine, platform detection, and stream management. Contains complex logic for Linux mixed recording (mic + system).
- `src/js/storage.js`: IndexedDB wrapper and file system IPC bridges.
- `src/js/recovery-manager.js`: Crash protection system. Writes `recovery_meta.json` periodically.
- `electron/linux-audio-helper.js`: Helper functions to detect PulseAudio/PipeWire and generate FFmpeg commands.

## 4. Linux Specific Implementation

Linux recording is significantly more complex due to the lack of native system audio capture in Electron's `desktopCapturer` on some configurations.

- **Dependency Check**: Checks for `pulseaudio`, `pavucontrol`, or `pipewire`.
- **Recording Strategy**:
  - Uses `ffmpeg` to capture the monitor source of the default sink.
  - **Mixed Mode**: Captures Microphone via Web Audio API + System Audio via FFmpeg, then merges them (currently implemented as separate files or post-process merging depending on version).
- **Process Management**:
  - Spawns `ffmpeg` as a child process.
  - Needs careful handling of `SIGTERM`/`SIGINT` to ensure files are finalized correctly.

## 5. Current Pain Points (Refactoring Drivers)

1.  **Global Mutable State**: `isRecording`, `currentSettings`, `mediaRecorder` are global variables, leading to race conditions and hard-to-debug states.
2.  **DOM Spaghetti**: UI updates are scattered across `app.js` and `ui.js` using `document.getElementById`. Adding new features requires touching multiple files.
3.  **Type Safety**: Lack of TypeScript means IPC message payloads and complex objects (like audio streams) are untyped, leading to runtime errors.
4.  **Linux Stability**: FFmpeg process management is tightly coupled with the UI logic. If the UI freezes, the recording might fail to stop gracefully.
5.  **Reusability**: Audio logic is not reusable. It's hard to test the recording logic in isolation from the DOM.

## 6. Refactoring Strategy: Vue 3 + TypeScript

### 6.1 Recommended Architecture
- **State Management**: Use **Pinia** to manage `RecordingStore` (status, duration, levels) and `SettingsStore`.
- **Composables**:
  - `useAudioRecorder()`: Interface for start/stop/pause.
  - `useLinuxAudio()`: Encapsulate FFmpeg logic.
  - `useRecovery()`: Hook into the recovery system.
- **UI Framework**: **Tailwind CSS** for consistent styling across platforms.
- **IPC Layer**: Typed wrappers around `window.electronAPI` to ensure type safety between Main and Renderer.

### 6.2 Migration Path
1.  **Setup**: Initialize Vite + Vue 3 + TS alongside the current `src` folder.
2.  **Core Logic**: Port `storage.js` and `api.js` to TypeScript utility classes.
3.  **Store**: Implement Pinia stores for Settings and Meetings.
4.  **Recorder**: Rewrite `recorder.js` as a Composable, separating Linux/Windows logic strategies.
5.  **UI**: Rebuild the interface component by component.
