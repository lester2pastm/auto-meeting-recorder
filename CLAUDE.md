# CLAUDE.md - AI 助手项目上下文指南

> 本文档帮助 AI 快速理解项目，以便更好地协助开发。

## 项目概述

**Auto Meeting Recorder** - 跨平台会议录制桌面应用

- **版本**: 2.1.2
- **技术栈**: Electron 28 + 原生 JavaScript
- **平台**: Windows / macOS / Linux
- **核心功能**: 音频录制 → 语音转写 → AI 生成纪要

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron 应用                            │
├─────────────────────────┬───────────────────────────────────┤
│      主进程 (Main)       │          渲染进程 (Renderer)        │
│     electron/main.js    │           src/js/*.js              │
├─────────────────────────┼───────────────────────────────────┤
│ • 文件系统操作            │ • app.js - 主应用逻辑              │
│ • FFmpeg 录制 (Linux)    │ • recorder.js - 音频录制           │
│ • IPC 通信处理            │ • api.js - STT/LLM API 调用        │
│ • 系统托盘/窗口           │ • storage.js - IndexedDB 存储      │
│                          │ • ui.js - UI 交互                  │
│                          │ • i18n.js - 国际化                 │
└─────────────────────────┴───────────────────────────────────┘
```

## 关键文件路径

| 文件 | 用途 |
|------|------|
| `electron/main.js` | 主进程入口、IPC 处理、FFmpeg 录制 |
| `electron/preload.js` | 上下文桥接，暴露 `window.electronAPI` |
| `src/js/app.js` | 渲染进程主逻辑、事件处理、流程控制 |
| `src/js/recorder.js` | 音频录制、平台适配、可视化 |
| `src/js/api.js` | STT/LLM API 封装、多提供商适配 |
| `src/js/storage.js` | IndexedDB 数据持久化 |
| `src/index.html` | 主页面 HTML |
| `package.json` | 项目配置、依赖、构建脚本 |

## 开发命令

```bash
# 开发
npm run dev              # 启动开发模式（Electron）

# 测试
npm test                 # 运行所有单元测试
npm run test:unit        # 单元测试
npm run test:integration # 集成测试
npm run test:e2e         # E2E 测试 (Playwright)
npm run test:coverage    # 测试覆盖率

# 构建
npm run build            # 构建所有平台
npm run build:win        # 仅 Windows
npm run build:mac        # 仅 macOS
npm run build:linux      # 仅 Linux

# 平台切换（依赖不同）
npm run use:win          # 切换到 Windows 依赖
npm run use:linux        # 切换到 Linux 依赖
```

## 代码风格约定

### 通用规则
- **语言**: 原生 JavaScript，无 TypeScript
- **异步**: 使用 `async/await`，避免回调地狱
- **命名**: 驼峰命名，函数以动词开头 (`handleStartRecording`)
- **注释**: 中文注释，简洁说明复杂逻辑

### 函数组织
```javascript
// 事件处理函数: handle + 动词 + 名词
async function handleStartRecording() { ... }
function handleStopRecording() { ... }

// 业务函数: 动词 + 名词
async function processRecording(audioBlob, meetingId) { ... }
async function generateMeetingSummary(transcript, audioBlob, meetingId) { ... }

// UI 更新函数: update + 名词
function updateRecordingButtons(state) { ... }
function updateSubtitleContent(text) { ... }
```

### 错误处理
```javascript
try {
    await someAsyncOperation();
    showToast('操作成功', 'success');
} catch (error) {
    console.error('操作失败:', error);
    showToast('操作失败: ' + error.message, 'error');
}
```

## 平台差异

### 音频录制
| 平台 | 方式 | 依赖 |
|------|------|------|
| Windows | MediaRecorder API | 浏览器原生 |
| macOS | MediaRecorder API | 浏览器原生 |
| Linux | FFmpeg + PulseAudio | `ffmpeg`, `xdg-desktop-portal` |

### Linux 特殊处理
- 系统音频录制需要 FFmpeg
- 使用 `pulse` 音频输入源
- 主进程管理 FFmpeg 子进程
- 通过 IPC 发送实时音量数据

## 数据存储

### Electron 环境
- **配置**: `electron-store` → `userData/config.json`
- **音频**: 文件系统 → `userData/audio_files/`
- **恢复元数据**: `userData/recovery_meta.json`

### Web 环境
- **所有数据**: IndexedDB

## API 集成

### 语音转写 (STT)
支持多种 API 提供商，自动适配请求格式：
- OpenAI Whisper
- SiliconFlow
- 阿里云百炼 / DashScope

### 纪要生成 (LLM)
OpenAI 兼容 API：
- DeepSeek (推荐)
- OpenAI GPT
- 其他兼容 API

## 常见开发任务

### 添加新的 IPC 通道
1. 在 `electron/main.js` 添加处理器:
   ```javascript
   ipcMain.handle('channel-name', async (event, args) => {
       // 处理逻辑
       return { success: true, data };
   });
   ```
2. 在 `electron/preload.js` 暴露 API:
   ```javascript
   channelName: (args) => ipcRenderer.invoke('channel-name', args)
   ```

### 添加新的 UI 功能
1. 在 `src/index.html` 添加 HTML 结构
2. 在 `src/js/app.js` 添加事件监听器
3. 在 `src/js/ui.js` 添加渲染函数
4. 更新 `src/js/i18n.js` 添加多语言支持

### 修改录音逻辑
- 主逻辑: `src/js/recorder.js`
- Linux FFmpeg: `electron/main.js` 中的 `start-ffmpeg-system-audio`

## 测试策略

- **单元测试**: Jest + jsdom，测试独立函数
- **集成测试**: 测试模块间交互
- **E2E 测试**: Playwright，测试完整用户流程

测试文件位于 `tests/` 目录：
- `tests/unit/` - 单元测试
- `tests/integration/` - 集成测试
- `tests/e2e/` - E2E 测试

## 重要注意事项

1. **不要手动创建 Release** - 使用 GitHub Actions 自动构建
2. **PowerShell 限制** - 不支持 `&&`，需分步执行命令
3. **Git commit message** - 避免使用 `remove`、`clean`、`delete` 等关键词
4. **Linux 依赖** - 需要 `xdg-desktop-portal` 才能录制系统音频
5. **配置同步** - Electron 环境下配置同时保存到文件系统和 IndexedDB

## 项目规则文件

详细的项目经验和规则记录在 `.trae/rules/project_rules.md`，包含：
- 核心规则
- 历史教训
- 最佳实践
