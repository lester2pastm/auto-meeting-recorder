# 侧边栏布局优化实施方案

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将现有的多页面翻页结构改造为侧边栏导航的单页应用布局，提高页面利用率，让功能简单清晰直接且有扩展性。

**Architecture:** 采用左侧固定侧边栏导航 + 右侧主内容区的布局模式。主内容区始终显示录音控制、实时字幕和会议纪要。历史和设置通过侧边栏切换在主内容区下方或侧边面板展示。使用CSS Grid和Flexbox实现响应式布局。

**Tech Stack:** HTML5, CSS3 (Grid/Flexbox), Vanilla JavaScript (无需额外框架)

---

## 设计概览

### 新布局结构
```
┌─────────────────────────────────────────────────────────────┐
│  Logo                    自动会议纪要                        │
├──────────┬──────────────────────────────────────────────────┤
│          │  ┌──────────────────────────────────────────────┐│
│  🎙️ 录音   │  │         录音控制区 (可视化 + 按钮)            ││
│          │  └──────────────────────────────────────────────┘│
│  📜 历史   │  ┌────────────────────┐ ┌──────────────────────┐│
│          │  │     实时字幕        │ │      会议纪要         ││
│  ⚙️ 设置   │  │                    │ │                      ││
│          │  └────────────────────┘ └──────────────────────┘│
└──────────┴──────────────────────────────────────────────────┘
```

### 响应式行为
- **桌面端 (>1024px):** 侧边栏固定展开，三栏布局
- **平板端 (768px-1024px):** 侧边栏收起为图标，两栏布局
- **移动端 (<768px):** 底部导航栏，单栏堆叠

---

## Task 1: 重构 HTML 结构 - 添加侧边栏导航

**Files:**
- Modify: `index.html:1-324` (整个body部分)

**Step 1: 备份原文件**

复制 `index.html` 为 `index.html.backup`

**Step 2: 重写 body 结构**

将现有的多 section 切换结构改为侧边栏布局：

```html
<body>
    <!-- 背景保持 -->
    <div class="ambient-bg">
        <div class="gradient-orb orb-1"></div>
        <div class="gradient-orb orb-2"></div>
        <div class="gradient-orb orb-3"></div>
    </div>
    
    <div class="app-container">
        <!-- 顶部标题栏 -->
        <header class="top-header">
            <div class="logo">
                <div class="logo-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="22"/>
                    </svg>
                </div>
                <h1>自动会议纪要</h1>
            </div>
        </header>

        <!-- 侧边栏导航 -->
        <aside class="sidebar">
            <nav class="sidebar-nav">
                <button class="nav-item active" data-view="recorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <circle cx="12" cy="12" r="4" fill="currentColor"/>
                    </svg>
                    <span>录音</span>
                </button>
                <button class="nav-item" data-view="history">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span>历史</span>
                </button>
                <button class="nav-item" data-view="settings">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M12 1v6m0 6v6m4.22-10.22l4.24-4.24M6.34 6.34L2.1 2.1m17.8 17.8l-4.24-4.24M6.34 17.66l-4.24 4.24M23 12h-6m-6 0H1m20.24-4.24l-4.24 4.24M6.34 6.34l-4.24-4.24"/>
                    </svg>
                    <span>设置</span>
                </button>
            </nav>
        </aside>

        <!-- 主内容区 -->
        <main class="main-content">
            <!-- 录音视图 (默认显示) -->
            <div id="recorderView" class="view active">
                <!-- 录音控制卡片 -->
                <div class="recorder-card glass-card">
                    <div class="recorder-visualization">
                        <div class="waveform-ring" id="waveformRing">
                            <div class="ring ring-1"></div>
                            <div class="ring ring-2"></div>
                            <div class="ring ring-3"></div>
                        </div>
                        <div class="recording-indicator" id="recordingIndicator">
                            <div class="pulse-dot"></div>
                            <span>录音中</span>
                        </div>
                    </div>
                    
                    <div class="recording-time" id="recordingTime">00:00:00</div>
                    
                    <div class="recorder-controls">
                        <button id="btnStartRecording" class="control-btn primary">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <circle cx="12" cy="12" r="4" fill="currentColor"/>
                            </svg>
                            <span>开始录音</span>
                        </button>
                        <button id="btnPauseRecording" class="control-btn secondary" style="display: none;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="6" y="4" width="4" height="16" rx="1"/>
                                <rect x="14" y="4" width="4" height="16" rx="1"/>
                            </svg>
                            <span>暂停</span>
                        </button>
                        <button id="btnResumeRecording" class="control-btn secondary" style="display: none;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
                            </svg>
                            <span>继续</span>
                        </button>
                        <button id="btnStopRecording" class="control-btn danger" style="display: none;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
                            </svg>
                            <span>停止</span>
                        </button>
                    </div>
                    
                    <div class="waveform-container" id="waveformContainer" style="display: none;">
                        <canvas id="audioWaveform" width="600" height="60"></canvas>
                    </div>
                </div>

                <!-- 内容网格：字幕 + 纪要 -->
                <div class="content-grid">
                    <div class="content-card glass-card">
                        <div class="card-header">
                            <div class="card-icon subtitle-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                </svg>
                            </div>
                            <h2>实时字幕</h2>
                            <button id="btnCopySubtitle" class="icon-btn" title="复制全文">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                            </button>
                        </div>
                        <div id="subtitleContent" class="content-area">
                            <div class="empty-state">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                    <line x1="12" y1="19" x2="12" y2="22"/>
                                </svg>
                                <p>开始录音后将显示转写内容</p>
                            </div>
                        </div>
                    </div>

                    <div class="content-card glass-card">
                        <div class="card-header">
                            <div class="card-icon summary-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                    <line x1="16" y1="13" x2="8" y2="13"/>
                                    <line x1="16" y1="17" x2="8" y2="17"/>
                                    <polyline points="10 9 9 9 8 9"/>
                                </svg>
                            </div>
                            <h2>会议纪要</h2>
                            <button id="btnCopySummary" class="icon-btn" title="复制纪要">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                            </button>
                        </div>
                        <div id="summaryContent" class="content-area">
                            <div class="empty-state">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                    <line x1="16" y1="13" x2="8" y2="13"/>
                                    <line x1="16" y1="17" x2="8" y2="17"/>
                                    <polyline points="10 9 9 9 8 9"/>
                                </svg>
                                <p>录音结束后自动生成会议纪要</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 历史视图 -->
            <div id="historyView" class="view">
                <div class="view-header">
                    <h2>历史记录</h2>
                    <p>查看和管理之前的会议记录</p>
                </div>
                <div id="historyList" class="history-list"></div>
            </div>

            <!-- 设置视图 -->
            <div id="settingsView" class="view">
                <div class="view-header">
                    <h2>设置</h2>
                    <p>配置API和模板</p>
                </div>
                <div class="settings-content">
                    <!-- 原有的设置组 -->
                    <div class="settings-group glass-card">
                        <h3>
                            <span class="settings-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                </svg>
                            </span>
                            语音识别API配置
                        </h3>
                        <div class="form-group">
                            <label for="sttApiUrl">API地址</label>
                            <input type="text" id="sttApiUrl" placeholder="https://api.example.com/v1/audio/transcriptions">
                        </div>
                        <div class="form-group">
                            <label for="sttApiKey">API Key</label>
                            <input type="password" id="sttApiKey" placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx">
                        </div>
                        <div class="form-group">
                            <label for="sttModel">模型名称</label>
                            <input type="text" id="sttModel" placeholder="whisper-1">
                        </div>
                        <button id="btnTestSttApi" class="action-btn test-btn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            测试连接
                        </button>
                    </div>

                    <div class="settings-group glass-card">
                        <h3>
                            <span class="settings-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                </svg>
                            </span>
                            纪要生成API配置
                        </h3>
                        <div class="form-group">
                            <label for="summaryApiUrl">API地址</label>
                            <input type="text" id="summaryApiUrl" placeholder="https://api.example.com/v1/chat/completions">
                        </div>
                        <div class="form-group">
                            <label for="summaryApiKey">API Key</label>
                            <input type="password" id="summaryApiKey" placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx">
                        </div>
                        <div class="form-group">
                            <label for="summaryModel">模型名称</label>
                            <input type="text" id="summaryModel" placeholder="gpt-3.5-turbo">
                        </div>
                        <button id="btnTestSummaryApi" class="action-btn test-btn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            测试连接
                        </button>
                    </div>

                    <div class="settings-group glass-card">
                        <h3>
                            <span class="settings-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                    <line x1="9" y1="9" x2="15" y2="9"/>
                                    <line x1="9" y1="15" x2="15" y2="15"/>
                                </svg>
                            </span>
                            纪要模板配置
                        </h3>
                        <div class="form-group">
                            <label for="summaryTemplate">纪要模板（Markdown格式）</label>
                            <textarea id="summaryTemplate" rows="15"></textarea>
                        </div>
                        <button id="btnSaveTemplate" class="action-btn save-btn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                <polyline points="17 21 17 13 7 13 7 21"/>
                                <polyline points="7 3 7 8 15 8"/>
                            </svg>
                            保存模板
                        </button>
                    </div>
                </div>
            </div>
        </main>

        <!-- Toast 通知 -->
        <div id="toast" class="toast"></div>
    </div>

    <script src="js/storage.js"></script>
    <script src="js/recorder.js"></script>
    <script src="js/api.js"></script>
    <script src="js/ui.js"></script>
    <script src="js/app.js"></script>
</body>
```

**Step 3: 验证 HTML 结构**

检查点：
- [ ] 包含 `app-container` 作为整体容器
- [ ] 包含 `sidebar` 侧边栏
- [ ] 包含 `main-content` 主内容区
- [ ] 三个 view: `recorderView`, `historyView`, `settingsView`
- [ ] 所有原有功能元素ID保持不变

---

## Task 2: 重构 CSS - 侧边栏布局样式

**Files:**
- Modify: `css/style.css` (大量修改，建议先备份)

**Step 1: 添加布局基础样式**

在 `:root` 之后添加：

```css
/* ============================================
   布局系统 - 侧边栏导航
   ============================================ */

/* 应用容器 */
.app-container {
    position: relative;
    z-index: 1;
    min-height: 100vh;
    display: grid;
    grid-template-areas:
        "header header"
        "sidebar main";
    grid-template-rows: auto 1fr;
    grid-template-columns: 240px 1fr;
}

/* 顶部标题栏 */
.top-header {
    grid-area: header;
    background: var(--glass-bg);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--glass-border);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: sticky;
    top: 0;
    z-index: 100;
}

.top-header .logo {
    display: flex;
    align-items: center;
    gap: 12px;
}

.top-header .logo-icon {
    width: 36px;
    height: 36px;
    background: var(--gradient-primary);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: 0 4px 15px rgba(0, 212, 255, 0.3);
}

.top-header .logo-icon svg {
    width: 20px;
    height: 20px;
}

.top-header h1 {
    font-size: 1.25rem;
    font-weight: 700;
    background: var(--gradient-primary);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

/* 侧边栏 */
.sidebar {
    grid-area: sidebar;
    background: var(--glass-bg);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-right: 1px solid var(--glass-border);
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
}

.sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 12px;
    color: var(--text-secondary);
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-normal);
    text-align: left;
}

.nav-item svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
}

.nav-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-primary);
}

.nav-item.active {
    background: rgba(0, 212, 255, 0.1);
    border-color: rgba(0, 212, 255, 0.3);
    color: var(--accent-cyan);
}

/* 主内容区 */
.main-content {
    grid-area: main;
    padding: 24px;
    overflow-y: auto;
    max-height: calc(100vh - 70px);
}

/* 视图切换 */
.view {
    display: none;
    animation: fadeIn 0.3s ease-out;
}

.view.active {
    display: block;
}

/* 视图头部 */
.view-header {
    margin-bottom: 24px;
}

.view-header h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 8px;
}

.view-header p {
    color: var(--text-secondary);
    font-size: 0.95rem;
}
```

**Step 2: 修改内容网格样式**

找到 `.content-grid` 并修改为：

```css
/* Content Grid - 优化为始终可见 */
.content-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    margin-top: 24px;
}

.content-card {
    padding: 24px;
    display: flex;
    flex-direction: column;
    min-height: 350px;
}
```

**Step 3: 修改历史记录列表样式**

找到 `.history-list` 区域并更新：

```css
/* History List - 在视图内展示 */
.history-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.history-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    background: var(--glass-bg);
    backdrop-filter: blur(20px);
    border: 1px solid var(--glass-border);
    border-radius: 16px;
    transition: all var(--transition-normal);
}

.history-item:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(0, 212, 255, 0.2);
    transform: translateX(4px);
}
```

**Step 4: 修改设置内容样式**

```css
/* Settings Content */
.settings-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 800px;
}

.settings-group {
    padding: 24px;
}
```

**Step 5: 添加响应式样式**

在文件末尾添加新的响应式规则：

```css
/* ============================================
   响应式布局
   ============================================ */

/* 平板端 - 侧边栏收缩 */
@media (max-width: 1024px) {
    .app-container {
        grid-template-columns: 72px 1fr;
    }
    
    .sidebar {
        padding: 24px 12px;
    }
    
    .nav-item {
        justify-content: center;
        padding: 14px;
    }
    
    .nav-item span {
        display: none;
    }
    
    .content-grid {
        grid-template-columns: 1fr;
    }
}

/* 移动端 - 底部导航 */
@media (max-width: 768px) {
    .app-container {
        grid-template-areas:
            "header"
            "main"
            "sidebar";
        grid-template-rows: auto 1fr auto;
        grid-template-columns: 1fr;
    }
    
    .top-header {
        padding: 12px 16px;
    }
    
    .top-header h1 {
        font-size: 1.1rem;
    }
    
    .sidebar {
        border-right: none;
        border-top: 1px solid var(--glass-border);
        padding: 8px 16px;
        position: sticky;
        bottom: 0;
    }
    
    .sidebar-nav {
        flex-direction: row;
        justify-content: space-around;
    }
    
    .nav-item {
        flex-direction: column;
        gap: 4px;
        padding: 8px 12px;
        font-size: 0.75rem;
    }
    
    .nav-item span {
        display: block;
    }
    
    .main-content {
        padding: 16px;
        max-height: none;
    }
    
    .recorder-card {
        padding: 24px;
    }
    
    .recording-time {
        font-size: 2.5rem;
    }
    
    .content-card {
        min-height: 250px;
    }
    
    .history-item {
        flex-direction: column;
        gap: 16px;
        align-items: flex-start;
    }
    
    .history-item-actions {
        width: 100%;
        justify-content: flex-end;
    }
}
```

**Step 6: 删除旧的页面切换样式**

删除以下样式（如果有的话）：
- `.glass-header` (旧版头部)
- `section` 相关的显示/隐藏样式
- `section.hidden`, `section.active`
- 旧的 `.section-header` 样式（保留但简化）

---

## Task 3: 更新 JavaScript - 视图切换逻辑

**Files:**
- Modify: `js/ui.js`
- Modify: `js/app.js` (可能需要微调)

**Step 1: 添加视图切换函数到 ui.js**

在 `ui.js` 中添加：

```javascript
// 视图管理
const views = {
    recorder: document.getElementById('recorderView'),
    history: document.getElementById('historyView'),
    settings: document.getElementById('settingsView')
};

const navItems = document.querySelectorAll('.nav-item');

// 切换视图
function switchView(viewName) {
    // 隐藏所有视图
    Object.values(views).forEach(view => {
        if (view) {
            view.classList.remove('active');
        }
    });
    
    // 显示目标视图
    if (views[viewName]) {
        views[viewName].classList.add('active');
    }
    
    // 更新导航状态
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewName) {
            item.classList.add('active');
        }
    });
    
    // 如果切换到历史视图，刷新历史列表
    if (viewName === 'history') {
        renderHistoryList();
    }
    
    // 如果切换到设置视图，加载设置
    if (viewName === 'settings') {
        loadSettings();
    }
}

// 初始化导航事件
function initNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const viewName = item.dataset.view;
            if (viewName) {
                switchView(viewName);
            }
        });
    });
}

// 在 DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    // ... 其他初始化代码
});
```

**Step 2: 更新历史记录渲染函数**

修改 `renderHistoryList` 函数（如果存在）：

```javascript
function renderHistoryList() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    
    const records = getMeetingRecords(); // 从 storage.js 获取
    
    if (records.length === 0) {
        historyList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
                <p>暂无历史记录</p>
            </div>
        `;
        return;
    }
    
    historyList.innerHTML = records.map(record => `
        <div class="history-item" data-id="${record.id}">
            <div class="history-item-info">
                <div class="history-item-date">${formatDate(record.date)}</div>
                <div class="history-item-duration">${formatDuration(record.duration)}</div>
            </div>
            <div class="history-item-actions">
                <button class="view-btn" onclick="viewRecord('${record.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    查看
                </button>
                <button class="delete-btn" onclick="deleteRecord('${record.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    删除
                </button>
            </div>
        </div>
    `).join('');
}
```

**Step 3: 删除旧的页面切换代码**

在 `ui.js` 和 `app.js` 中删除：
- `showSection()` 函数
- `hideAllSections()` 函数
- 旧的 `btnHistory`, `btnSettings`, `btnBackFromHistory` 等按钮事件监听

**Step 4: 更新设置加载函数**

```javascript
function loadSettings() {
    const settings = getSettings(); // 从 storage.js 获取
    
    document.getElementById('sttApiUrl').value = settings.sttApiUrl || '';
    document.getElementById('sttApiKey').value = settings.sttApiKey || '';
    document.getElementById('sttModel').value = settings.sttModel || '';
    document.getElementById('summaryApiUrl').value = settings.summaryApiUrl || '';
    document.getElementById('summaryApiKey').value = settings.summaryApiKey || '';
    document.getElementById('summaryModel').value = settings.summaryModel || '';
    document.getElementById('summaryTemplate').value = settings.summaryTemplate || '';
}
```

---

## Task 4: 测试和验证

**Step 1: 功能测试清单**

- [ ] 页面加载后默认显示录音视图
- [ ] 点击侧边栏"录音"导航，显示录音视图
- [ ] 点击侧边栏"历史"导航，显示历史视图并加载历史列表
- [ ] 点击侧边栏"设置"导航，显示设置视图并加载设置
- [ ] 录音功能正常工作（开始、暂停、继续、停止）
- [ ] 实时字幕区域正常显示
- [ ] 会议纪要区域正常显示
- [ ] 历史记录可以正常查看和删除
- [ ] 设置可以正常保存
- [ ] Toast 通知正常显示

**Step 2: 响应式测试清单**

- [ ] 桌面端 (>1024px): 侧边栏完全展开，两栏内容布局
- [ ] 平板端 (768px-1024px): 侧边栏收缩为图标，单栏内容布局
- [ ] 移动端 (<768px): 底部导航栏，单栏堆叠布局

**Step 3: 视觉检查**

- [ ] 整体风格保持一致（深色科技风）
- [ ] 玻璃态效果正常
- [ ] 动画过渡流畅
- [ ] 没有布局错位或溢出

---

## Task 5: 清理和优化

**Step 1: 删除无用代码**

- [ ] 删除旧的 `section` 相关样式
- [ ] 删除旧的 `glass-header` 样式（如果已替换）
- [ ] 删除旧的页面切换函数
- [ ] 删除备份文件 `index.html.backup`

**Step 2: 代码优化**

- [ ] 检查 CSS 变量使用一致性
- [ ] 检查 JavaScript 事件监听器是否有内存泄漏
- [ ] 优化动画性能（使用 `transform` 和 `opacity`）

**Step 3: 最终验证**

- [ ] 所有功能正常工作
- [ ] 控制台无错误
- [ ] 响应式布局正常
- [ ] 代码整洁无冗余

---

## 扩展性考虑

新布局的扩展点：

1. **添加新导航项**: 在 `.sidebar-nav` 中添加新的 `.nav-item` 按钮，在 `main-content` 中添加对应的 `.view`
2. **添加新功能模块**: 在 `recorderView` 中的 `.content-grid` 添加新的 `.content-card`
3. **自定义主题**: 通过修改 CSS 变量实现
4. **插件系统**: 可以在侧边栏添加插件入口

---

## 回滚方案

如果实施过程中出现问题：

```bash
# 恢复备份
copy index.html.backup index.html
# 从 git 恢复 CSS 和 JS 文件
git checkout css/style.css js/ui.js js/app.js
```

---

**计划完成！**

实施选项：
1. **Subagent-Driven (推荐)** - 在当前会话中逐个任务执行，每个任务后代码审查
2. **Parallel Session** - 新开会话批量执行

请选择实施方式，我将开始执行。