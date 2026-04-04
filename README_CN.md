# 自动会议纪要

<p align="center">
  <img src="Auto Meeting Recorder App Icon.png" alt="Auto Meeting Recorder Icon" width="120">
</p>

<h1 align="center">自动会议纪要</h1>

<p align="center">
  录音、转写、生成纪要，并把整个会议处理流程尽量留在你的本机。
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="#亮点">亮点</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#开发说明">开发说明</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.6.17-blue.svg" alt="版本">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="许可证">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg" alt="平台">
  <img src="https://img.shields.io/badge/Electron-28.0.0-47848F?logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Node.js-18%20recommended-339933?logo=node.js&logoColor=white" alt="Node.js">
</p>

<p align="center">
  一个基于 Electron 的桌面应用，适合希望把会议录音、语音转写、纪要生成和历史留存在本地的用户。
  你可以接入自己配置的 STT 和 LLM 接口，而不是绑定单一服务商。
</p>

<p align="center">
  <img src="docs/screenshots/recording.png" alt="录音界面" width="88%">
</p>

---

## 亮点

| | |
|---|---|
| 恢复优先 | 启动时自动检测中断录音，并允许继续录制、立即转写或丢弃 |
| 本地优先 | 音频、设置、历史记录和纪要默认保存在本机 |
| 接口灵活 | 支持你自行配置的 OpenAI 兼容转写接口和聊天式纪要接口 |
| 面向桌面录音 | 支持 Windows、macOS、Linux，并为 Linux 提供 FFmpeg 录音路径 |
| 历史可复用 | 可以重新打开历史会议、回放音频、复制全文，并重新生成纪要 |

### 为什么当前版本值得关注

- 当前版本：`2.6.17`
- 最近的工作重点是恢复流程正确性、设置校验安全性、用户可见错误提示国际化，以及端到端回归覆盖
- `src/index.html` 仍适合 UI 开发和浏览器 E2E 检查，但完整产品能力依赖 Electron IPC

---

## 功能概览

### 采集

- 支持麦克风和系统音频录制
- 支持上传已有音频文件
- 支持保存首选麦克风和系统音频源
- Linux 在可用时走 FFmpeg 录音链路

### 处理

- 将音频发送到你配置的 STT 接口
- 转写完成后自动进入纪要生成
- 支持失败后重新转写
- 对超长音频或大于 `50 MB` 的文件自动分段处理

### 查看

- 可在全文和纪要视图之间切换
- 可从历史记录重新打开过去的会议
- 可在会议详情中回放保存的音频
- 可在当前会议和历史会议中重新生成纪要

### 存储

- 音频文件统一保存在应用受控目录
- 设置通过 Electron Store 保存，并同步到渲染层 IndexedDB
- 为中断录音维护恢复元数据
- 对受管音频路径做越界访问保护

---

## 快速开始

### 下载

普通使用场景下，直接从 [Releases](https://github.com/lester2pastm/auto-meeting-recorder/releases) 页面下载最新安装包即可。

### 从源码构建

- 开发环境建议使用 Node.js `18`
- `npm`
- 一个语音转写 API 地址、密钥和模型
- 一个纪要生成 API 地址、密钥和模型

### 安装依赖

```bash
git clone https://github.com/lester2pastm/auto-meeting-recorder.git
cd auto-meeting-recorder
npm install
```

### 本地运行

```bash
npm run dev
```

### 手动构建安装包

```bash
npm run build
npm run build:win
npm run build:mac
npm run build:linux
```

构建产物会输出到 `dist/`，并带上当前包版本号。

---

## 典型使用流程

1. 打开桌面应用。
2. 在设置页配置转写和纪要 API。
3. 按需测试两个接口的连通性。
4. 如果需要，选择首选音频源。
5. 开始录音，或者直接上传音频文件。
6. 等待全文生成。
7. 查看自动生成的会议纪要。
8. 之后可在历史记录中再次打开和处理。

### 如果应用中途被打断

应用启动时会检测未完成录音，并提供以下操作：

- 继续录制
- 立即转写
- 删除恢复数据

---

## 平台说明

### Windows 和 macOS

- 使用标准桌面录音路径
- 暂停和继续支持相对更完整

### Linux

- 应用启动时会检查 Linux 音频依赖
- Linux 录音在可用时使用 FFmpeg
- 会检测 PulseAudio 的麦克风源和 monitor 系统音频源
- 如果缺少依赖，会弹出可见提示，而不是静默失败

### 双环境切换

仓库内置了适合无符号链接文件系统的切换脚本：

```bash
npm run use:linux
npm run use:win
```

如果你同时维护 `node_modules_linux/` 和 `node_modules_win/`，请查看 [DUAL_ENV_SETUP.md](DUAL_ENV_SETUP.md)。

---

## 配置说明

### 语音转写设置

- API 地址
- API Key
- 模型名称

常见兼容形式：

- OpenAI 风格的 `/v1/audio/transcriptions`
- SiliconFlow 转写接口
- DashScope / 百炼兼容转写接口

### 纪要生成设置

- API 地址
- API Key
- 模型名称
- 自定义 Markdown 模板

常见兼容形式：

- OpenAI 风格的 `/v1/chat/completions`
- DeepSeek 兼容聊天接口
- 其他接受标准 chat payload 的兼容网关

### 模板编辑

内置会议纪要模板基于 Markdown，可以在设置页按你的结构偏好自行修改。

---

## 开发说明

### 脚本

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

`npm run dev:win` 当前是一个保护性提示脚本，用来提醒你先切换到 Windows 依赖环境。

### 项目结构

```text
auto-meeting-recorder/
├── electron/                 # Electron 主进程和 IPC
├── src/
│   ├── css/                  # 样式
│   ├── js/                   # 渲染层逻辑
│   └── index.html            # 主界面入口
├── tests/
│   ├── unit/                 # Jest 单元测试
│   ├── integration/          # Jest 集成测试
│   └── e2e/                  # Playwright 端到端测试
├── docs/                     # 审计与项目文档
├── scripts/                  # 环境切换和初始化脚本
├── DUAL_ENV_SETUP.md         # 双平台依赖工作流
└── README_CN.md
```

### 当前测试覆盖

- 针对应用流程、存储、API、恢复、UI 和 Linux 音频辅助逻辑的 Jest 单元测试
- 针对录音和恢复流程的集成测试
- 针对导航、录音界面和响应式行为的 Playwright E2E 测试

如果要做浏览器环境的 E2E 检查，可以先把 `src/` 作为静态目录启动，再让 Playwright 指向该环境。

---

## 数据与隐私

- 音频、全文、纪要和设置默认保存在本地
- AI 处理不是离线完成的，音频和文本会发送到你配置的接口
- 主应用流程中没有分析统计或遥测逻辑
- API Key 保存在本地；如果你需要更严格的密钥管理，建议结合运行环境进一步审查

---

## 参与贡献

欢迎提交 Issue 和 Pull Request。涉及用户可见行为时，请同步更新测试，并保持 `README.md` 与 `README_CN.md` 一致。

---

## 许可证

本项目采用 [MIT License](LICENSE)。
