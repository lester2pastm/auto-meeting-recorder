# Release v1.5.3 - 添加应用图标系统

**发布日期**: 2026-02-10  
**版本号**: v1.5.3  
**提交**: [2a6e2d2](https://github.com/lester2pastm/auto-meeting-recorder/commit/2a6e2d2)

---

## 🎨 新增功能

### 应用图标系统
为自动会议纪要应用添加了完整的跨平台图标支持，统一了品牌视觉体验。

**支持的平台:**
- **Windows**: `.ico` 格式（包含 16x16 至 256x256 多种尺寸）
- **macOS**: `.icns` 格式（支持 Retina 显示）
- **Linux**: `.png` 格式（512x512 高清）

**图标特性:**
- 简约黑白麦克风图标设计
- 圆角矩形边框
- 适用于任务栏、Dock、窗口标题栏

---

## 🔧 技术改进

### 自动化工具
- 新增 `scripts/generate-icons.js` - 图标生成脚本
- 支持从原始 PNG 一键生成所有平台格式
- 使用 `png2icons` 库进行专业格式转换

### 代码优化
- `electron/main.js`: 动态加载平台特定图标
- `src/index.html`: 添加 favicon 支持
- `package.json`: 更新打包配置，包含图标资源

---

## 📁 文件变更

### 新增文件 (7)
```
assets/icons/
├── icon.ico           # Windows 应用图标 (124.6 KB)
├── icon.icns          # macOS 应用图标 (1.5 MB)
├── icon.png           # Linux 应用图标 (1 MB)
├── icon-256x256.png   # 备用尺寸
└── icon-512x512.png   # 备用尺寸

scripts/
└── generate-icons.js  # 图标生成脚本

Auto Meeting Recorder App Icon.png  # 原始设计图
```

### 修改文件 (4)
- `package.json` - 版本号更新至 1.5.3，添加图标配置
- `package-lock.json` - 依赖更新（添加 png2icons）
- `electron/main.js` - 窗口图标加载逻辑
- `src/index.html` - favicon 链接

---

## 🎯 用户体验

- ✅ 任务栏/Dock 显示统一的应用图标
- ✅ 窗口标题栏显示图标（Windows/Linux）
- ✅ 浏览器标签页显示 favicon
- ✅ 打包后的安装程序显示正确图标

---

## 📦 安装包信息

| 平台 | 格式 | 文件名 |
|------|------|--------|
| Windows | NSIS | AutoMeetingRecorder-1.5.3-win.exe |
| macOS | DMG | AutoMeetingRecorder-1.5.3-mac.dmg |
| Linux | AppImage | AutoMeetingRecorder-1.5.3-linux.AppImage |

---

## 🔗 相关链接

- [完整变更记录](https://github.com/lester2pastm/auto-meeting-recorder/compare/v1.5.2...v1.5.3)
- [提交历史](https://github.com/lester2pastm/auto-meeting-recorder/commits/v1.5.3)
- [Issues](https://github.com/lester2pastm/auto-meeting-recorder/issues)

---

## 📝 注意事项

**开发者:** 如需重新生成图标，运行:
```bash
npm install
node scripts/generate-icons.js
```

**用户:** 升级到 v1.5.3 后，应用将自动显示新图标，无需额外操作。

---

**下载地址**: [GitHub Releases](https://github.com/lester2pastm/auto-meeting-recorder/releases/tag/v1.5.3)

**感谢使用自动会议纪要应用！** 🎤
