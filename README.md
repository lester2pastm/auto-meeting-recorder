# Auto Meeting Recorder

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/Electron-28.0.0-47848F?logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Node.js-16+-339933?logo=node.js&logoColor=white" alt="Node.js">
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/lester2pastm/auto-meeting-recorder?style=social" alt="GitHub Stars">
  <img src="https://img.shields.io/github/forks/lester2pastm/auto-meeting-recorder?style=social" alt="GitHub Forks">
</p>

<p align="center">
  <b>🎙️ Record · 📝 Transcribe · 🤖 Summarize</b>
</p>

<p align="center">
  A cross-platform desktop application for automatic meeting minutes generation with AI-powered transcription and summarization.
</p>

<p align="center">
  <a href="README_CN.md">中文文档</a> •
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#screenshots">Screenshots</a>
</p>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🎙️ **Audio Recording**
- Record meeting audio with microphone and system audio support
- Real-time audio visualization
- Pause and resume recording
- High-quality audio capture

</td>
<td width="50%">

### 📝 **Speech-to-Text**
- Transcribe audio using OpenAI Whisper API
- Support for multiple providers (OpenAI, Alibaba Cloud, SiliconFlow)
- Real-time transcription display
- Multi-language support

</td>
</tr>
<tr>
<td width="50%">

### 🤖 **AI Summary Generation**
- Automatically generate meeting minutes using LLM APIs
- Customizable templates with Markdown
- Structured output (topics, decisions, action items)
- Support for GPT-4, Claude, and other models

</td>
<td width="50%">

### 🔒 **Privacy-First**
- All data stored locally
- No cloud dependency
- No analytics or telemetry
- Your API keys stay on your device

</td>
</tr>
<tr>
<td width="50%">

### 📚 **History Management**
- Save and manage all meeting records
- Search and filter past meetings
- Export minutes in multiple formats
- Local data persistence

</td>
<td width="50%">

### 💻 **Cross-Platform**
- Windows, macOS, and Linux support
- Desktop app (Electron)
- Web version (Browser-based)
- Consistent experience across platforms

</td>
</tr>
</table>

---

## 📸 Screenshots

### 🎙️ Recording Interface
<p align="center">
  <img src="docs/screenshots/recording.png" alt="Recording Interface" width="80%">
</p>
<p align="center"><i>Main recording interface with audio visualization and timer</i></p>

<!-- 
### 📝 Transcription View
![Transcription](docs/screenshots/transcription.png)

### 📊 Meeting Minutes
![Meeting Minutes](docs/screenshots/minutes.png)

### ⚙️ Settings Page
![Settings](docs/screenshots/settings.png)
-->

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 16+** (for development)
- **Modern browser** (Chrome, Firefox, Edge) for web version
- **API keys** for speech recognition and summary generation

### Installation

#### Option 1: Desktop App (Recommended)

**Download Pre-built Binaries**

| Platform | Download |
|----------|----------|
| Windows | [AutoMeetingRecorder-1.2.0-win.exe](https://github.com/lester2pastm/auto-meeting-recorder/releases) |
| macOS | [AutoMeetingRecorder-1.2.0-mac.dmg](https://github.com/lester2pastm/auto-meeting-recorder/releases) |
| Linux | [AutoMeetingRecorder-1.2.0-linux.AppImage](https://github.com/lester2pastm/auto-meeting-recorder/releases) |

**Build from Source**

```bash
# Clone the repository
git clone https://github.com/lester2pastm/auto-meeting-recorder.git
cd auto-meeting-recorder

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build        # All platforms
npm run build:win    # Windows only
npm run build:mac    # macOS only
npm run build:linux  # Linux only
```

#### Option 2: Web Version

Simply open `src/index.html` in your browser or serve it with any static file server:

```bash
npx serve src
```

---

## ⚙️ Configuration

### API Setup

The app requires API keys for speech recognition and meeting summary generation.

#### Speech-to-Text API (Whisper)

| Provider | API URL | Model |
|----------|---------|-------|
| **OpenAI** | `https://api.openai.com/v1/audio/transcriptions` | `whisper-1` |
| **Alibaba Cloud** | `https://dashscope.aliyuncs.com/api/v1/audio/transcriptions` | `whisper-v3` |
| **SiliconFlow** | `https://api.siliconflow.cn/v1/audio/transcriptions` | `whisper-large-v3` |

#### Summary Generation API (LLM)

| Provider | API URL | Models |
|----------|---------|--------|
| **OpenAI** | `https://api.openai.com/v1/chat/completions` | `gpt-4`, `gpt-3.5-turbo` |
| **Anthropic** | `https://api.anthropic.com/v1/messages` | `claude-3-opus`, `claude-3-sonnet` |
| **Alibaba Cloud** | `https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation` | `qwen-max`, `qwen-plus` |

### Meeting Minutes Template

Customize your meeting minutes template using Markdown:

```markdown
# Meeting Minutes - {{date}}

## Overview
- **Date:** {{date}}
- **Duration:** {{duration}}
- **Participants:** {{participants}}

## Main Topics
{{topics}}

## Discussion Points
{{discussion}}

## Decisions
{{decisions}}

## Action Items
{{action_items}}

## Other Notes
{{notes}}
```

---

## 📖 Usage Guide

### First Time Setup

1. Open the app and navigate to **Settings**
2. Configure your Speech-to-Text API credentials
3. Configure your Summary Generation API credentials
4. Customize your meeting template (optional)
5. Test the configuration

### Recording a Meeting

1. Click **"Start Recording"** to begin capturing audio
2. Use the **Pause** button during breaks
3. Click **"Stop Recording"** when the meeting ends
4. Wait for transcription and summary generation
5. Review and edit the generated minutes
6. Save or export your meeting minutes

### Managing History

- Access all past meetings in the **History** page
- Search by date, topic, or keywords
- Export individual meetings or bulk export
- Delete old records to free up space

---

## 🏗️ Project Structure

```
auto-meeting-recorder/
├── 📁 electron/              # Electron main process
│   ├── main.js              # Main entry point
│   └── preload.js           # Preload script for security
│
├── 📁 src/                   # Application source code
│   ├── 📁 css/              # Stylesheets
│   │   └── style.css        # Main stylesheet
│   ├── 📁 js/               # JavaScript modules
│   │   ├── app.js           # Main application logic
│   │   ├── api.js           # API integrations
│   │   ├── recorder.js      # Audio recording functionality
│   │   ├── storage.js       # Data persistence layer
│   │   ├── ui.js            # UI interactions
│   │   └── i18n.js          # Internationalization
│   └── index.html           # Main HTML file
│
├── 📁 docs/                  # Documentation
│   └── 📁 plans/            # Development plans
│
├── 📁 .github/               # GitHub configurations
│   └── 📁 workflows/        # CI/CD workflows
│
├── package.json             # Project configuration
├── LICENSE                  # MIT License
└── README.md                # This file
```

---

## 🌐 Browser Compatibility

| Browser | Minimum Version | Status |
|---------|----------------|--------|
| Chrome | 90+ | ✅ Fully Supported |
| Firefox | 88+ | ✅ Fully Supported |
| Edge | 90+ | ✅ Fully Supported |
| Safari | 14+ | ⚠️ Limited Support |

---

## 💾 Data Storage

All data is stored locally on your device:

| Data Type | Desktop | Web |
|-----------|---------|-----|
| Audio Recordings | Local filesystem | IndexedDB |
| Transcriptions | Electron Store | IndexedDB |
| Meeting Minutes | Electron Store | IndexedDB |
| API Settings | Encrypted store | LocalStorage |

---

## 🔐 Privacy & Security

- ✅ All data stored locally on your device
- ✅ API keys are never shared or transmitted except to your configured endpoints
- ✅ No analytics, telemetry, or tracking
- ✅ No cloud services required
- ✅ Open source - audit the code yourself

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** your feature branch: `git checkout -b feature/AmazingFeature`
3. **Commit** your changes: `git commit -m 'Add some AmazingFeature'`
4. **Push** to the branch: `git push origin feature/AmazingFeature`
5. **Open** a Pull Request

Please read our [Contributing Guide](CONTRIBUTING.md) for more details.

### Contributors

<a href="https://github.com/lester2pastm/auto-meeting-recorder/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=lester2pastm/auto-meeting-recorder" alt="Contributors" />
</a>

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with [Electron](https://www.electronjs.org/) - Cross-platform desktop apps
- Speech recognition powered by [OpenAI Whisper](https://openai.com/research/whisper) and compatible APIs
- Meeting summaries generated by Large Language Models
- Icons by [Heroicons](https://heroicons.com/)

---

## 💬 Support

<p align="center">
  <b>If you find this project helpful, please give it a ⭐ on GitHub!</b>
</p>

<p align="center">
  <a href="https://github.com/lester2pastm/auto-meeting-recorder/issues">🐛 Report Bug</a> •
  <a href="https://github.com/lester2pastm/auto-meeting-recorder/issues">✨ Request Feature</a> •
  <a href="https://github.com/lester2pastm/auto-meeting-recorder/discussions">💬 Discussions</a>
</p>

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/lester2pastm">Lester</a>
</p>
