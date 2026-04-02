# Auto Meeting Recorder

<p align="center">
  <img src="Auto Meeting Recorder App Icon.png" alt="Auto Meeting Recorder Icon" width="120">
</p>

<h1 align="center">Auto Meeting Recorder</h1>

<p align="center">
  Record meetings, transcribe audio, generate summaries, and keep the whole workflow on your machine.
</p>

<p align="center">
  <a href="README_CN.md">中文文档</a> ·
  <a href="#highlights">Highlights</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#development">Development</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.6.15-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/Electron-28.0.0-47848F?logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Node.js-18%20recommended-339933?logo=node.js&logoColor=white" alt="Node.js">
</p>

<p align="center">
  An Electron desktop app for teams and individuals who want a practical local-first meeting workflow:
  capture audio, send it to your own STT and LLM endpoints, then keep transcripts, summaries, and audio history locally.
</p>

<p align="center">
  <img src="docs/screenshots/recording.png" alt="Recording Interface" width="88%">
</p>

---

## Highlights

| | |
|---|---|
| Recovery-first workflow | Detects interrupted recordings on next launch and lets you continue, transcribe, or discard them |
| Local-first storage | Audio, settings, transcript history, and summaries stay on device by default |
| Flexible AI backends | Works with OpenAI-compatible STT and chat-style summary endpoints you configure yourself |
| Built for desktop recording | Windows, macOS, and Linux support with a dedicated Linux FFmpeg path |
| History that stays useful | Re-open meetings, replay audio, copy transcript, and refresh summaries later |

### Why this version matters

- Current app version: `2.6.15`
- Recent work focused on recovery, retry-flow correctness, persistence consistency, and Linux recording resilience
- `src/index.html` is still useful for UI development and browser-based E2E checks, but the full product experience depends on Electron IPC

---

## Feature Overview

### Capture

- Record from microphone and system audio
- Upload existing audio files for processing
- Choose preferred microphone and system audio sources
- Use Linux FFmpeg recording when available

### Process

- Send audio to your configured STT endpoint
- Automatically continue into summary generation after transcription
- Retry failed transcription jobs
- Segment long audio or files larger than `50 MB`

### Review

- Switch between transcript and summary views
- Re-open past meetings from history
- Replay saved audio from meeting detail
- Refresh summaries for the current meeting or from history

### Store

- Keep audio files inside the managed app audio directory
- Persist settings locally through Electron store and renderer-side IndexedDB sync
- Maintain recovery metadata for interrupted sessions
- Guard managed audio paths against traversal outside the app directory

---

## Quick Start

### Download

For normal use, download the latest packaged build directly from the [Releases](https://github.com/lester2pastm/auto-meeting-recorder/releases) page.

### Build from source

- Node.js `18` recommended for development
- `npm`
- A speech-to-text API endpoint, key, and model
- A summary-generation API endpoint, key, and model

### Install dependencies

```bash
git clone https://github.com/lester2pastm/auto-meeting-recorder.git
cd auto-meeting-recorder
npm install
```

### Run locally

```bash
npm run dev
```

### Build packages manually

```bash
npm run build
npm run build:win
npm run build:mac
npm run build:linux
```

Build artifacts are generated in `dist/` and use the current package version in the file name.

---

## Typical Flow

1. Open the desktop app.
2. Configure STT and summary APIs in Settings.
3. Optionally test both connections.
4. Pick preferred audio sources if you want manual control.
5. Start recording or upload an audio file.
6. Wait for transcript generation.
7. Review the generated meeting summary.
8. Revisit the result later from History.

### If the app was interrupted

On startup, the app can detect unfinished recording metadata and offer to:

- continue recording
- transcribe immediately
- delete the recovery data

---

## Platform Notes

### Windows and macOS

- Use the standard desktop recording path
- Pause and resume support is more complete here than on Linux

### Linux

- The app checks Linux audio dependencies at startup
- FFmpeg is used for the Linux recording path when available
- PulseAudio sources are detected for microphone and monitor-device capture
- Missing dependencies trigger a user-visible dependency prompt instead of silent failure

### Dual environment setup

This repository includes platform-switch scripts for filesystems that do not handle symlinks well:

```bash
npm run use:linux
npm run use:win
```

If you maintain both `node_modules_linux/` and `node_modules_win/`, see [DUAL_ENV_SETUP.md](DUAL_ENV_SETUP.md).

---

## Configuration

### Speech-to-text settings

- API URL
- API key
- Model name

Common compatible endpoint styles:

- OpenAI-style `/v1/audio/transcriptions`
- SiliconFlow transcription endpoints
- DashScope / Bailian-compatible transcription endpoints

### Summary settings

- API URL
- API key
- Model name
- Custom markdown summary template

Common compatible endpoint styles:

- OpenAI-style `/v1/chat/completions`
- DeepSeek-compatible chat endpoints
- Other gateways that accept standard chat payloads

### Template editing

The built-in meeting summary template is markdown-based and can be customized in Settings to match your preferred structure.

---

## Development

### Scripts

```bash
npm run dev
npm run dev:linux
npm run use:linux
npm run use:win
npm run install:linux
npm run install:win
npm run test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:coverage
```

`npm run dev:win` is intentionally a guard message that reminds you to switch to the Windows dependency environment first.

### Project structure

```text
auto-meeting-recorder/
├── electron/                 # Electron main process and IPC handlers
├── src/
│   ├── css/                  # Application styles
│   ├── js/                   # Renderer logic
│   └── index.html            # Main UI entry
├── tests/
│   ├── unit/                 # Jest unit tests
│   ├── integration/          # Jest integration tests
│   └── e2e/                  # Playwright E2E tests
├── docs/                     # Audits and project documentation
├── scripts/                  # Environment-switch and setup scripts
├── DUAL_ENV_SETUP.md         # Dual-platform dependency workflow
└── README.md
```

### Test coverage today

- Jest unit tests for app flow, storage, API handling, recovery, UI behavior, and Linux audio helpers
- Integration tests for recorder and recovery flows
- Playwright coverage for navigation, recorder UI, and responsive behavior

For browser-based E2E checks, serve `src/` locally and point Playwright at that environment.

---

## Data and Privacy

- Audio, transcripts, summaries, and settings are stored locally by default
- AI processing is not offline: audio and text are sent to the endpoints you configure
- The main app flow does not include analytics or telemetry logic
- API keys are stored locally; if you need stricter secret handling, review the code and your deployment environment carefully

---

## Contributing

Issues and pull requests are welcome. If you change user-facing behavior, please update tests and keep `README.md` and `README_CN.md` aligned.

---

## License

This project is licensed under the [MIT License](LICENSE).
