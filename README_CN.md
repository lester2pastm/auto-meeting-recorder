# 自动会议记录器 (Auto Meeting Recorder)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一款跨平台的桌面应用程序，用于自动生成会议纪要。支持会议音频录制、语音转文字和 AI 驱动的会议纪要生成。

[English Documentation](README.md)

## 功能特性

- **音频录制**: 录制会议音频，支持麦克风和系统音频
- **语音转文字**: 使用兼容 OpenAI 格式的 API（Whisper）将音频转录为文字
- **AI 纪要生成**: 使用大语言模型 API 自动生成会议纪要
- **历史记录管理**: 在本地保存和管理所有会议记录
- **自定义模板**: 使用 Markdown 自定义会议纪要模板
- **跨平台**: 支持 Windows、macOS 和 Linux
- **隐私优先**: 所有数据本地存储，无需云服务

## 截图

*截图将在稍后添加*

## 快速开始

### 环境要求

- Node.js 16+（开发环境）
- 现代浏览器（Chrome、Firefox、Edge）用于网页版本
- 语音识别和纪要生成的 API 密钥

### 安装

#### 桌面应用（Electron）

1. 克隆仓库：
```bash
git clone https://github.com/yourusername/auto-meeting-recorder.git
cd auto-meeting-recorder
```

2. 安装依赖：
```bash
npm install
```

3. 运行应用：
```bash
npm run dev
```

4. 构建生产版本：
```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

#### 网页版本

直接用浏览器打开 `src/index.html` 文件即可。

## API 配置

应用需要配置 API 密钥用于语音识别和会议纪要生成。

### 语音识别 API

兼容 OpenAI Whisper API 格式：

- **API 地址**: 例如 `https://api.openai.com/v1/audio/transcriptions`
- **API Key**: 你的 API 密钥
- **模型**: 例如 `whisper-1`、`whisper-large-v3`

支持的提供商：
- OpenAI
- 阿里云百炼/灵积 (Bailian/DashScope)
- SiliconFlow
- 其他兼容 OpenAI 格式的服务

### 纪要生成 API

兼容 OpenAI Chat API 格式：

- **API 地址**: 例如 `https://api.openai.com/v1/chat/completions`
- **API Key**: 你的 API 密钥
- **模型**: 例如 `gpt-3.5-turbo`、`gpt-4`、`claude-3`

### 会议纪要模板

使用 Markdown 自定义模板。默认模板包含：

- 会议概述
- 主要议题
- 讨论要点
- 决策事项
- 待办事项
- 其他事项

## 使用流程

1. **首次设置**: 在设置页面配置 API 设置
2. **开始录音**: 点击"开始录音"开始捕获音频
3. **暂停/继续**: 休息时使用暂停按钮
4. **停止录音**: 点击"停止"结束录制
5. **生成纪要**: 应用会自动转录并生成会议纪要
6. **查看历史**: 在历史页面访问所有过去的会议

## 项目结构

```
auto-meeting-recorder/
├── electron/           # Electron 主进程
│   ├── main.js        # 主入口
│   └── preload.js     # 预加载脚本
├── src/               # 应用源码
│   ├── css/           # 样式表
│   ├── js/            # JavaScript 模块
│   │   ├── app.js     # 主应用逻辑
│   │   ├── api.js     # API 集成
│   │   ├── recorder.js # 音频录制
│   │   ├── storage.js # 数据持久化
│   │   └── ui.js      # UI 交互
│   └── index.html     # 主 HTML
├── docs/              # 文档
├── package.json       # 项目配置
└── README_CN.md       # 本文件
```

## 浏览器兼容性

- Chrome 90+
- Firefox 88+
- Edge 90+

## 数据存储

所有数据都存储在本地：

- **桌面版**: Electron store + IndexedDB
- **网页版**: 浏览器 IndexedDB

数据包括：
- 录音文件
- 转写文本
- 会议纪要
- API 设置

## 隐私与安全

- 所有数据存储在本地设备上
- API 密钥仅用于访问你配置的 API 端点，不会被共享或传输到其他地方
- 无分析或遥测
- 无需云服务

## 贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 本仓库
2. 创建你的功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 致谢

- 基于 [Electron](https://www.electronjs.org/) 构建
- 语音识别由 OpenAI Whisper 及兼容 API 提供支持
- 会议纪要由大语言模型生成

## 支持

如果这个项目对你有帮助，请在 GitHub 上给它一个 ⭐！

如有问题和功能请求，请使用 [GitHub Issues](https://github.com/yourusername/auto-meeting-recorder/issues) 页面。
