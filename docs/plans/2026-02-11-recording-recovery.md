# 录音中断保护功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现录音中断保护机制，定期保存临时文件，应用启动时检测并提示恢复，支持继续录制、立即转写或删除。

**Architecture:** 
- 录音时每5分钟自动保存临时文件到用户数据目录
- 使用元数据文件记录录音状态（开始时间、平台类型、文件列表等）
- 应用启动时检查临时文件和元数据，弹出恢复对话框
- Windows使用单一临时文件，Linux使用双文件（麦克风+系统音频）

**Tech Stack:** Electron IPC, IndexedDB, FFmpeg (Linux), MediaRecorder API

---

## Task 1: 创建临时录音管理模块

**Files:**
- Create: `src/js/recovery-manager.js`
- Modify: `electron/preload.js` (添加IPC接口)
- Modify: `electron/main.js` (添加IPC处理器)

**Step 1: 创建恢复管理模块基础结构**

Create `src/js/recovery-manager.js`:
```javascript
/**
 * 录音恢复管理器
 * 管理临时录音文件的保存、检测和恢复
 */

const RECOVERY_META_FILE = 'recovery_meta.json';
const TEMP_SAVE_INTERVAL = 5 * 60 * 1000; // 5分钟

let tempSaveTimer = null;
let recoveryMeta = null;

/**
 * 初始化恢复管理器
 */
async function initRecoveryManager() {
    console.log('[Recovery] Initializing recovery manager...');
    
    // 检查是否有未完成的录音
    const hasRecovery = await checkUnfinishedRecording();
    
    if (hasRecovery) {
        console.log('[Recovery] Found unfinished recording:', recoveryMeta);
        return recoveryMeta;
    }
    
    return null;
}

/**
 * 检查是否有未完成的录音
 */
async function checkUnfinishedRecording() {
    if (!window.electronAPI) {
        console.log('[Recovery] Not in Electron environment');
        return false;
    }
    
    try {
        const result = await window.electronAPI.readRecoveryMeta();
        if (result.success && result.meta) {
            recoveryMeta = result.meta;
            
            // 检查临时文件是否存在
            const filesExist = await checkTempFilesExist(recoveryMeta);
            if (filesExist) {
                return true;
            } else {
                // 清理无效的元数据
                await clearRecoveryData();
                return false;
            }
        }
    } catch (error) {
        console.error('[Recovery] Error checking unfinished recording:', error);
    }
    
    return false;
}

/**
 * 检查临时文件是否存在
 */
async function checkTempFilesExist(meta) {
    if (!meta || !meta.tempFiles) return false;
    
    for (const filePath of meta.tempFiles) {
        const result = await window.electronAPI.fileExists(filePath);
        if (!result.exists) {
            console.warn('[Recovery] Temp file not found:', filePath);
            return false;
        }
    }
    
    return true;
}

/**
 * 开始录音时创建恢复元数据
 */
async function startRecoveryTracking(platform, isLinux) {
    const timestamp = Date.now();
    const audioDirResult = await window.electronAPI.getAudioDirectory();
    
    if (!audioDirResult.success) {
        console.error('[Recovery] Failed to get audio directory');
        return null;
    }
    
    const audioDir = audioDirResult.path;
    
    recoveryMeta = {
        id: timestamp.toString(),
        startTime: new Date().toISOString(),
        platform: platform,
        isLinux: isLinux,
        tempFiles: isLinux ? [
            `${audioDir}/temp_mic_${timestamp}.webm`,
            `${audioDir}/temp_sys_${timestamp}.webm`
        ] : [
            `${audioDir}/temp_recording_${timestamp}.webm`
        ],
        lastSaveTime: timestamp,
        duration: 0
    };
    
    // 保存元数据
    await window.electronAPI.writeRecoveryMeta(recoveryMeta);
    
    // 启动定期保存
    startTempSaveTimer();
    
    console.log('[Recovery] Started tracking:', recoveryMeta);
    return recoveryMeta;
}

/**
 * 启动定期保存定时器
 */
function startTempSaveTimer() {
    if (tempSaveTimer) {
        clearInterval(tempSaveTimer);
    }
    
    tempSaveTimer = setInterval(async () => {
        await saveTempRecording();
    }, TEMP_SAVE_INTERVAL);
    
    console.log('[Recovery] Temp save timer started');
}

/**
 * 停止定期保存
 */
function stopTempSaveTimer() {
    if (tempSaveTimer) {
        clearInterval(tempSaveTimer);
        tempSaveTimer = null;
        console.log('[Recovery] Temp save timer stopped');
    }
}

/**
 * 保存临时录音（由 recorder.js 调用）
 */
async function saveTempRecording(audioData, duration) {
    if (!recoveryMeta) return;
    
    try {
        // 更新元数据
        recoveryMeta.lastSaveTime = Date.now();
        recoveryMeta.duration = duration || recoveryMeta.duration;
        await window.electronAPI.writeRecoveryMeta(recoveryMeta);
        
        console.log('[Recovery] Temp metadata updated, duration:', duration);
    } catch (error) {
        console.error('[Recovery] Error saving temp recording:', error);
    }
}

/**
 * 获取恢复元数据
 */
function getRecoveryMeta() {
    return recoveryMeta;
}

/**
 * 清除恢复数据
 */
async function clearRecoveryData() {
    stopTempSaveTimer();
    
    if (recoveryMeta && recoveryMeta.tempFiles) {
        // 删除临时文件
        for (const filePath of recoveryMeta.tempFiles) {
            await window.electronAPI.deleteFile(filePath);
        }
    }
    
    // 删除元数据文件
    await window.electronAPI.deleteRecoveryMeta();
    
    recoveryMeta = null;
    console.log('[Recovery] Recovery data cleared');
}

/**
 * 从临时文件恢复录音Blob
 */
async function recoverAudioBlob() {
    if (!recoveryMeta) return null;
    
    try {
        if (recoveryMeta.isLinux) {
            // Linux: 需要合并两个文件
            const micPath = recoveryMeta.tempFiles[0];
            const sysPath = recoveryMeta.tempFiles[1];
            const outputPath = micPath.replace('temp_mic_', 'recovered_');
            
            const mergeResult = await window.electronAPI.mergeAudioFiles(
                micPath, sysPath, outputPath
            );
            
            if (!mergeResult.success) {
                throw new Error('Failed to merge audio files');
            }
            
            // 读取合并后的文件
            const readResult = await window.electronAPI.readAudioFile(outputPath);
            if (!readResult.success) {
                throw new Error('Failed to read recovered audio');
            }
            
            const buffer = new Uint8Array(readResult.data);
            return new Blob([buffer], { type: 'audio/webm' });
        } else {
            // Windows: 直接读取临时文件
            const tempPath = recoveryMeta.tempFiles[0];
            const readResult = await window.electronAPI.readAudioFile(tempPath);
            
            if (!readResult.success) {
                throw new Error('Failed to read temp audio');
            }
            
            const buffer = new Uint8Array(readResult.data);
            return new Blob([buffer], { type: 'audio/webm' });
        }
    } catch (error) {
        console.error('[Recovery] Error recovering audio:', error);
        return null;
    }
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initRecoveryManager,
        startRecoveryTracking,
        saveTempRecording,
        stopTempSaveTimer,
        clearRecoveryData,
        recoverAudioBlob,
        getRecoveryMeta,
        checkUnfinishedRecording
    };
}
```

**Step 2: 在 preload.js 中添加 IPC 接口**

Modify `electron/preload.js`, add to `electronAPI`:
```javascript
// 恢复管理相关接口
readRecoveryMeta: () => ipcRenderer.invoke('read-recovery-meta'),
writeRecoveryMeta: (meta) => ipcRenderer.invoke('write-recovery-meta', meta),
deleteRecoveryMeta: () => ipcRenderer.invoke('delete-recovery-meta'),
fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
```

**Step 3: 在 main.js 中添加 IPC 处理器**

Modify `electron/main.js`, add after existing IPC handlers:
```javascript
const RECOVERY_META_PATH = path.join(app.getPath('userData'), RECOVERY_META_FILE);

// IPC: 读取恢复元数据
ipcMain.handle('read-recovery-meta', async () => {
  try {
    if (fs.existsSync(RECOVERY_META_PATH)) {
      const data = fs.readFileSync(RECOVERY_META_PATH, 'utf8');
      return { success: true, meta: JSON.parse(data) };
    }
    return { success: true, meta: null };
  } catch (error) {
    console.error('Error reading recovery meta:', error);
    return { success: false, error: error.message };
  }
});

// IPC: 写入恢复元数据
ipcMain.handle('write-recovery-meta', async (event, meta) => {
  try {
    fs.writeFileSync(RECOVERY_META_PATH, JSON.stringify(meta, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Error writing recovery meta:', error);
    return { success: false, error: error.message };
  }
});

// IPC: 删除恢复元数据
ipcMain.handle('delete-recovery-meta', async () => {
  try {
    if (fs.existsSync(RECOVERY_META_PATH)) {
      fs.unlinkSync(RECOVERY_META_PATH);
    }
    return { success: true };
  } catch (error) {
    console.error('Error deleting recovery meta:', error);
    return { success: false, error: error.message };
  }
});

// IPC: 检查文件是否存在
ipcMain.handle('file-exists', async (event, filePath) => {
  try {
    const exists = fs.existsSync(filePath);
    return { success: true, exists };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC: 删除文件
ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

**Step 4: Commit**

```bash
git add src/js/recovery-manager.js electron/preload.js electron/main.js
git commit -m "feat: add recovery manager module for recording protection"
```

---

## Task 2: 修改录音逻辑，集成定期保存

**Files:**
- Modify: `src/js/recorder.js` (添加定期保存调用)

**Step 1: 在 startRecording 中启动恢复跟踪**

Modify `src/js/recorder.js`, in `startRecording()` function:
```javascript
async function startRecording() {
    try {
        console.log('=== 开始录音调试 ===');
        
        // 检测平台
        await detectPlatform();
        
        // 启动恢复跟踪（新增）
        if (typeof startRecoveryTracking === 'function') {
            await startRecoveryTracking(currentPlatform, isLinuxPlatform);
        }
        
        // ... 原有代码 ...
    } catch (error) {
        // ... 原有代码 ...
    }
}
```

**Step 2: 在 stopRecording 中停止恢复跟踪**

Modify `src/js/recorder.js`, in `stopRecording()` function:
```javascript
async function stopRecording() {
    return new Promise(async (resolve, reject) => {
        // ... 原有代码 ...
        
        try {
            // ... 原有代码 ...
            
            isRecording = false;
            isPaused = false;
            stopTimer();
            
            // 停止恢复跟踪（新增）
            if (typeof stopTempSaveTimer === 'function') {
                stopTempSaveTimer();
            }
            
            // 正常停止时清除恢复数据（新增）
            if (typeof clearRecoveryData === 'function') {
                await clearRecoveryData();
            }
            
        } catch (error) {
            reject(error);
        }
    });
}
```

**Step 3: 在计时器更新中保存进度**

Modify `src/js/recorder.js`, in `startTimer()` function:
```javascript
function startTimer() {
    timerInterval = setInterval(async () => {
        const duration = getRecordingDuration();
        updateRecordingTime(duration);
        
        // 定期保存恢复数据（新增）
        if (typeof saveTempRecording === 'function' && isRecording && !isPaused) {
            const durationMs = Date.now() - recordingStartTime - recordingPausedTime;
            await saveTempRecording(null, durationMs);
        }
    }, 1000);
}
```

**Step 4: Commit**

```bash
git add src/js/recorder.js
git commit -m "feat: integrate recovery tracking into recording flow"
```

---

## Task 3: 创建恢复对话框 UI

**Files:**
- Modify: `src/index.html` (添加恢复对话框)
- Modify: `src/css/style.css` (添加对话框样式)

**Step 1: 在 index.html 中添加恢复对话框**

Modify `src/index.html`, add before closing `</body>`:
```html
<!-- 录音恢复对话框 -->
<div id="recoveryModal" class="modal">
    <div class="modal-content recovery-modal">
        <div class="modal-header">
            <h3 id="recoveryTitle">发现未完成的录音</h3>
            <button class="close-btn" onclick="closeRecoveryModal()">&times;</button>
        </div>
        <div class="modal-body">
            <div class="recovery-info">
                <div class="recovery-icon">🎙️</div>
                <div class="recovery-details">
                    <p><strong>录音时间:</strong> <span id="recoveryDate">-</span></p>
                    <p><strong>已录制时长:</strong> <span id="recoveryDuration">-</span></p>
                    <p><strong>最后保存:</strong> <span id="recoveryLastSave">-</span></p>
                </div>
            </div>
            <p class="recovery-hint">您可以选择继续录制、立即转写或删除此录音。</p>
        </div>
        <div class="modal-footer recovery-actions">
            <button id="btnDeleteRecovery" class="btn btn-secondary">
                <span class="icon">🗑️</span> 删除
            </button>
            <button id="btnTranscribeRecovery" class="btn btn-primary">
                <span class="icon">📝</span> 立即转写
            </button>
            <button id="btnContinueRecovery" class="btn btn-success">
                <span class="icon">▶️</span> 继续录制
            </button>
        </div>
    </div>
</div>
```

**Step 2: 添加恢复对话框样式**

Modify `src/css/style.css`, add at the end:
```css
/* 恢复对话框样式 */
.recovery-modal {
    max-width: 480px;
}

.recovery-info {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 20px;
    background: var(--bg-secondary);
    border-radius: 12px;
    margin-bottom: 16px;
}

.recovery-icon {
    font-size: 48px;
    flex-shrink: 0;
}

.recovery-details {
    flex: 1;
}

.recovery-details p {
    margin: 8px 0;
    color: var(--text-secondary);
}

.recovery-details strong {
    color: var(--text-primary);
}

.recovery-hint {
    text-align: center;
    color: var(--text-secondary);
    font-size: 14px;
    margin-top: 16px;
}

.recovery-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
}

.recovery-actions .btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
}

.recovery-actions .btn .icon {
    font-size: 16px;
}

.recovery-actions .btn-success {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
}

.recovery-actions .btn-success:hover {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
}
```

**Step 3: Commit**

```bash
git add src/index.html src/css/style.css
git commit -m "feat: add recovery dialog UI"
```

---

## Task 4: 实现恢复对话框逻辑

**Files:**
- Create: `src/js/recovery-ui.js`
- Modify: `src/js/app.js` (集成恢复检测)

**Step 1: 创建恢复对话框逻辑模块**

Create `src/js/recovery-ui.js`:
```javascript
/**
 * 录音恢复对话框 UI 逻辑
 */

let recoveryModal = null;

/**
 * 初始化恢复对话框
 */
function initRecoveryUI() {
    recoveryModal = document.getElementById('recoveryModal');
    
    // 绑定按钮事件
    document.getElementById('btnContinueRecovery').addEventListener('click', handleContinueRecording);
    document.getElementById('btnTranscribeRecovery').addEventListener('click', handleTranscribeNow);
    document.getElementById('btnDeleteRecovery').addEventListener('click', handleDeleteRecovery);
    
    console.log('[RecoveryUI] Initialized');
}

/**
 * 显示恢复对话框
 */
async function showRecoveryDialog(recoveryMeta) {
    if (!recoveryMeta) return;
    
    // 填充信息
    document.getElementById('recoveryDate').textContent = formatDateTime(recoveryMeta.startTime);
    document.getElementById('recoveryDuration').textContent = formatDuration(recoveryMeta.duration);
    document.getElementById('recoveryLastSave').textContent = formatTimeAgo(recoveryMeta.lastSaveTime);
    
    // 显示对话框
    recoveryModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/**
 * 关闭恢复对话框
 */
function closeRecoveryModal() {
    if (recoveryModal) {
        recoveryModal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * 处理继续录制
 */
async function handleContinueRecording() {
    closeRecoveryModal();
    
    const meta = getRecoveryMeta();
    if (!meta) return;
    
    showToast('准备继续录制...', 'info');
    
    try {
        // 恢复录音状态
        await resumeRecordingFromRecovery(meta);
        showToast('继续录制', 'success');
    } catch (error) {
        console.error('[RecoveryUI] Error continuing recording:', error);
        showToast('继续录制失败: ' + error.message, 'error');
    }
}

/**
 * 处理立即转写
 */
async function handleTranscribeNow() {
    closeRecoveryModal();
    
    showToast('正在恢复录音文件...', 'info');
    
    try {
        // 从临时文件恢复音频
        const audioBlob = await recoverAudioBlob();
        
        if (!audioBlob) {
            showToast('恢复录音文件失败', 'error');
            return;
        }
        
        // 设置录音时长
        const meta = getRecoveryMeta();
        if (meta) {
            setLastRecordingDuration(formatDuration(meta.duration));
        }
        
        // 清除恢复数据
        await clearRecoveryData();
        
        // 进入处理流程
        showToast('录音已恢复，开始转写...', 'info');
        await processRecording(audioBlob);
        
    } catch (error) {
        console.error('[RecoveryUI] Error transcribing:', error);
        showToast('转写失败: ' + error.message, 'error');
    }
}

/**
 * 处理删除恢复
 */
async function handleDeleteRecovery() {
    if (!confirm('确定要删除这条未完成的录音吗？此操作不可恢复。')) {
        return;
    }
    
    closeRecoveryModal();
    
    try {
        await clearRecoveryData();
        showToast('已删除未完成的录音', 'success');
    } catch (error) {
        console.error('[RecoveryUI] Error deleting recovery:', error);
        showToast('删除失败: ' + error.message, 'error');
    }
}

/**
 * 格式化日期时间
 */
function formatDateTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * 格式化时长
 */
function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
        return `${hours}小时${minutes}分钟`;
    } else if (minutes > 0) {
        return `${minutes}分钟${seconds}秒`;
    } else {
        return `${seconds}秒`;
    }
}

/**
 * 格式化相对时间
 */
function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (days > 0) {
        return `${days}天前`;
    } else if (hours > 0) {
        return `${hours}小时前`;
    } else if (minutes > 0) {
        return `${minutes}分钟前`;
    } else {
        return '刚刚';
    }
}

/**
 * 从恢复状态继续录制
 * 注意：这需要重新初始化录音，但保留之前的音频
 */
async function resumeRecordingFromRecovery(meta) {
    // TODO: 实现继续录制逻辑
    // 这需要重新设计 recorder.js 来支持追加录制
    // 目前先提示用户
    showToast('继续录制功能即将推出，请先使用"立即转写"', 'info');
    throw new Error('继续录制功能暂未实现');
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initRecoveryUI,
        showRecoveryDialog,
        closeRecoveryModal
    };
}
```

**Step 2: 在 app.js 中集成恢复检测**

Modify `src/js/app.js`, in `initApp()` function:
```javascript
async function initApp() {
    try {
        await initDB();
        
        // 初始化国际化
        if (typeof i18n !== 'undefined') {
            i18n.init();
        }
        
        // 初始化恢复对话框（新增）
        if (typeof initRecoveryUI === 'function') {
            initRecoveryUI();
        }
        
        // 检查是否有未完成的录音（新增）
        if (typeof initRecoveryManager === 'function') {
            const recoveryMeta = await initRecoveryManager();
            if (recoveryMeta && typeof showRecoveryDialog === 'function') {
                // 延迟显示，等待其他初始化完成
                setTimeout(() => {
                    showRecoveryDialog(recoveryMeta);
                }, 500);
            }
        }
        
        // ... 原有代码 ...
    } catch (error) {
        // ... 原有代码 ...
    }
}
```

**Step 3: Commit**

```bash
git add src/js/recovery-ui.js src/js/app.js
git commit -m "feat: implement recovery dialog logic and integrate with app init"
```

---

## Task 5: 实现临时文件定期保存（Windows）

**Files:**
- Modify: `src/js/recorder.js` (Windows 定期保存逻辑)

**Step 1: 在标准录制中添加临时文件保存**

Modify `src/js/recorder.js`, in `startStandardRecording()` function, update `mediaRecorder.ondataavailable`:
```javascript
mediaRecorder.ondataavailable = async (event) => {
    console.log('MediaRecorder ondataavailable, 数据大小:', event.data.size);
    if (event.data.size > 0) {
        audioChunks.push(event.data);
        
        // 定期保存到临时文件（新增）
        if (recoveryMeta && !recoveryMeta.isLinux) {
            await saveWindowsTempFile();
        }
    }
};
```

**Step 2: 添加 Windows 临时文件保存函数**

Add to `src/js/recorder.js`:
```javascript
/**
 * 保存 Windows 临时录音文件
 */
async function saveWindowsTempFile() {
    if (!recoveryMeta || recoveryMeta.isLinux) return;
    
    try {
        const tempPath = recoveryMeta.tempFiles[0];
        const tempBlob = new Blob(audioChunks, { type: 'audio/webm' });
        
        const arrayBuffer = await tempBlob.arrayBuffer();
        const result = await window.electronAPI.saveAudioToPath(
            Array.from(new Uint8Array(arrayBuffer)),
            tempPath
        );
        
        if (result.success) {
            console.log('[Recorder] Temp file saved:', tempPath, 'size:', tempBlob.size);
        } else {
            console.warn('[Recorder] Failed to save temp file:', result.error);
        }
    } catch (error) {
        console.error('[Recorder] Error saving temp file:', error);
    }
}
```

**Step 3: Commit**

```bash
git add src/js/recorder.js
git commit -m "feat: implement temp file saving for Windows recording"
```

---

## Task 6: 实现临时文件定期保存（Linux）

**Files:**
- Modify: `src/js/recorder.js` (Linux 定期保存逻辑)

**Step 1: 在 Linux 麦克风录制中添加保存**

Modify `src/js/recorder.js`, in `startLinuxRecording()` function, update `linuxMicMediaRecorder.ondataavailable`:
```javascript
linuxMicMediaRecorder.ondataavailable = async (event) => {
    console.log('麦克风 MediaRecorder ondataavailable, 数据大小:', event.data.size);
    if (event.data.size > 0) {
        linuxMicAudioChunks.push(event.data);
        
        // 定期保存麦克风临时文件（新增）
        await saveLinuxMicTempFile();
    }
};
```

**Step 2: 添加 Linux 临时文件保存函数**

Add to `src/js/recorder.js`:
```javascript
/**
 * 保存 Linux 麦克风临时文件
 */
async function saveLinuxMicTempFile() {
    if (!recoveryMeta || !recoveryMeta.isLinux) return;
    
    try {
        const tempPath = recoveryMeta.tempFiles[0]; // mic temp file
        const tempBlob = new Blob(linuxMicAudioChunks, { type: 'audio/webm' });
        
        const arrayBuffer = await tempBlob.arrayBuffer();
        const result = await window.electronAPI.saveAudioToPath(
            Array.from(new Uint8Array(arrayBuffer)),
            tempPath
        );
        
        if (result.success) {
            console.log('[Recorder] Linux mic temp file saved:', tempPath);
        }
    } catch (error) {
        console.error('[Recorder] Error saving Linux mic temp file:', error);
    }
}
```

**Step 3: 在 main.js 中添加 FFmpeg 输出路径配置**

Modify `electron/main.js`, in `start-ffmpeg-system-audio` handler:
```javascript
// 修改 FFmpeg 启动参数，使用指定的输出路径
ipcMain.handle('start-ffmpeg-system-audio', async (event, { outputPath, device = null }) => {
  // ... 原有代码 ...
  
  // 使用传入的 outputPath 作为临时文件路径
  const finalOutputPath = outputPath || path.join(AUDIO_DIR, `system_${Date.now()}.webm`);
  
  // ... 修改 args 中的输出路径 ...
  const args = [
    // ... 其他参数 ...
    '-y',
    finalOutputPath
  ];
  
  // ... 原有代码 ...
});
```

**Step 4: Commit**

```bash
git add src/js/recorder.js electron/main.js
git commit -m "feat: implement temp file saving for Linux recording"
```

---

## Task 7: 在 index.html 中引入新脚本

**Files:**
- Modify: `src/index.html`

**Step 1: 添加脚本引用**

Modify `src/index.html`, add before `</body>`:
```html
<!-- 恢复管理模块 -->
<script src="js/recovery-manager.js"></script>
<script src="js/recovery-ui.js"></script>
```

**Step 2: Commit**

```bash
git add src/index.html
git commit -m "chore: include recovery scripts in HTML"
```

---

## Task 8: 测试 Windows 平台功能

**Files:**
- Test: Manual testing on Windows

**Step 1: 启动应用并检查恢复对话框**

Run:
```bash
npm start
```

**Expected:**
- 应用正常启动
- 如果没有未完成录音，正常显示主界面

**Step 2: 测试录音和定期保存**

1. 点击"开始录音"
2. 录制超过5分钟
3. 检查用户数据目录是否有临时文件生成
4. 强制关闭应用（Alt+F4 或任务管理器）
5. 重新启动应用

**Expected:**
- 临时文件保存在 `%APPDATA%/auto-meeting-recorder/audio_files/` 目录
- 重新启动后显示恢复对话框

**Step 3: 测试恢复功能**

1. 选择"立即转写"
2. 验证转写流程正常
3. 验证历史记录正确创建

**Step 4: 测试删除功能**

1. 重新开始录音
2. 强制关闭应用
3. 重新启动，选择"删除"
4. 验证临时文件被清理

**Step 5: Commit**

```bash
git commit -m "test: verify Windows recording recovery functionality"
```

---

## Task 9: 测试 Linux 平台功能

**Files:**
- Test: Manual testing on Linux

**Step 1: 启动应用并检查恢复对话框**

Run:
```bash
npm start
```

**Step 2: 测试录音和定期保存**

1. 点击"开始录音"
2. 录制超过5分钟
3. 检查临时文件：`temp_mic_*.webm` 和 `temp_sys_*.webm`

**Expected:**
- 两个临时文件都存在
- 元数据文件 `recovery_meta.json` 正确更新

**Step 3: 测试恢复功能**

1. 强制关闭应用
2. 重新启动
3. 选择"立即转写"
4. 验证两个文件正确合并

**Step 4: Commit**

```bash
git commit -m "test: verify Linux recording recovery functionality"
```

---

## Task 10: 添加应用关闭保护

**Files:**
- Modify: `electron/main.js`
- Modify: `src/js/app.js`

**Step 1: 在 main.js 中添加关闭确认**

Modify `electron/main.js`, add in `createWindow()`:
```javascript
// 处理窗口关闭事件
mainWindow.on('close', (event) => {
  // 检查是否正在录音
  mainWindow.webContents.send('check-recording-before-close');
  
  // 阻止立即关闭，等待渲染进程响应
  event.preventDefault();
});

// 监听渲染进程的响应
ipcMain.handle('confirm-close', async (event, { isRecording }) => {
  if (isRecording) {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '录音进行中',
      message: '当前正在录音中，关闭应用将导致录音丢失。',
      buttons: ['取消', '停止录音并关闭', '强制关闭'],
      defaultId: 0,
      cancelId: 0
    });
    
    if (result.response === 0) {
      // 取消关闭
      return { shouldClose: false };
    } else if (result.response === 1) {
      // 停止录音并关闭
      mainWindow.webContents.send('stop-recording-and-close');
      return { shouldClose: false, waitForStop: true };
    } else {
      // 强制关闭
      return { shouldClose: true };
    }
  }
  
  return { shouldClose: true };
});
```

**Step 2: 在 app.js 中处理关闭确认**

Modify `src/js/app.js`, add in `setupEventListeners()`:
```javascript
// 监听关闭确认请求
if (window.electronAPI) {
    window.electronAPI.onCheckRecordingBeforeClose(async () => {
        const state = getRecordingState();
        await window.electronAPI.confirmClose({ isRecording: state.isRecording });
    });
    
    window.electronAPI.onStopRecordingAndClose(async () => {
        if (getRecordingState().isRecording) {
            await handleStopRecording();
        }
        window.electronAPI.closeWindow();
    });
}
```

**Step 3: Commit**

```bash
git add electron/main.js src/js/app.js
git commit -m "feat: add app close protection during recording"
```

---

## Summary

This implementation plan covers:

1. **Recovery Manager Module** - Core logic for temp file management
2. **Recording Integration** - Periodic save during recording
3. **Recovery Dialog UI** - User interface for recovery options
4. **Platform-Specific Handling** - Windows (single file) vs Linux (dual file)
5. **App Close Protection** - Prevent accidental data loss

**Key Features:**
- Auto-save every 5 minutes
- Detect unfinished recordings on startup
- Three recovery options: Continue / Transcribe / Delete
- Cross-platform support (Windows & Linux)
- Graceful app close handling

**Next Steps After Implementation:**
- Consider implementing "Continue Recording" feature (append to temp file)
- Add configurable auto-save interval in settings
- Add recovery statistics/metrics
