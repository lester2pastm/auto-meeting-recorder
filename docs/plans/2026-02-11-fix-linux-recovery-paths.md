# Linux 录音缓存提醒修复计划

## 目标
修复 Linux 平台下录音缓存提醒功能不工作的问题，确保 `startLinuxRecording()` 使用与 `recoveryMeta` 一致的路径。

## 问题根因
- `recovery-manager.js` 在 `startRecoveryTracking()` 中创建临时文件路径：`temp_mic_xxx.webm` 和 `temp_sys_xxx.webm`
- `recorder.js` 的 `startLinuxRecording()` 使用独立的路径变量 `linuxRecordingPaths`：`mic_xxx.webm` 和 `sys_xxx.webm`
- 路径前缀不一致（缺少 `temp_`），导致重启后检测不到文件

## 修复方案

### 方案对比

**方案 A: 修改 recorder.js 使用 recoveryMeta 路径（推荐）**
- 优点：保持 recovery-manager.js 的元数据设计不变
- 缺点：需要修改 recorder.js，依赖 recoveryMeta 的初始化时机

**方案 B: 统一使用 linuxRecordingPaths 的路径格式**
- 优点：简单直接
- 缺点：需要修改 recovery-manager.js 的命名逻辑，可能影响其他逻辑

**选择方案 A**，因为 `recoveryMeta` 的路径设计是正确的（带 `temp_` 前缀表明是临时文件），问题出在 recorder.js 没有使用它。

---

## Task 1: 修改 recorder.js 使用 recoveryMeta 路径

**Files:**
- Modify: `src/js/recorder.js`

**Step 1: 在 startLinuxRecording() 中删除独立的路径创建，使用 recoveryMeta 路径**

```javascript
// 找到 startLinuxRecording() 函数（约第 101 行）
// 删除以下代码（第 108-119 行）：
/*
const timestamp = Date.now();
const audioDir = audioDirResult.path;
linuxRecordingPaths = {
    microphone: `${audioDir}/mic_${timestamp}.webm`,
    systemAudio: `${audioDir}/sys_${timestamp}.webm`,
    output: `${audioDir}/combined_${timestamp}.webm`
};
*/

// 替换为：
// 使用 recoveryMeta 中定义的路径
if (!recoveryMeta || !recoveryMeta.tempFile) {
    throw new Error('恢复元数据未初始化');
}

linuxRecordingPaths = {
    microphone: recoveryMeta.tempFile,
    systemAudio: recoveryMeta.systemTempFile,
    output: recoveryMeta.tempFile.replace('temp_mic_', 'combined_')
};

console.log('[Recorder] Linux recording paths:', linuxRecordingPaths);
```

**Step 2: 修改调用 FFmpeg 的地方使用新的路径**

在第 225 行（原来的代码），确认使用的是 `linuxRecordingPaths.systemAudio`：
```javascript
// 确保这行代码使用 linuxRecordingPaths.systemAudio
const sysResult = await window.electronAPI.startFFmpegSystemAudio(
    linuxRecordingPaths.systemAudio, 
    systemDevice
);
```

**Step 3: 移除 recorder.js 中对 linuxRecordingPaths 的重新定义**

找到第 32 行：`let linuxRecordingPaths = null;`
保持不变，但确保它在 startLinuxRecording 中被正确赋值。

**Step 4: 验证修改**

检查修改后的代码确保：
1. `linuxRecordingPaths.microphone` 使用 `recoveryMeta.tempFile`
2. `linuxRecordingPaths.systemAudio` 使用 `recoveryMeta.systemTempFile`
3. 输出路径基于 `tempFile` 生成（替换 `temp_mic_` 为 `combined_`）

---

## Task 2: 添加路径一致性检查（可选增强）

**Files:**
- Modify: `src/js/recorder.js`

**Step 1: 在 startLinuxRecording 开头添加路径验证**

```javascript
async function startLinuxRecording() {
    try {
        console.log('[Recorder] === 开始 Linux 混合录音 ===');
        
        // 检查 recoveryMeta 是否已初始化
        if (!recoveryMeta) {
            throw new Error('恢复元数据未初始化，请确保 startRecoveryTracking() 已被调用');
        }
        
        if (!recoveryMeta.tempFile || !recoveryMeta.systemTempFile) {
            throw new Error('恢复元数据缺少临时文件路径');
        }
        
        console.log('[Recorder] Recovery meta initialized:', {
            tempFile: recoveryMeta.tempFile,
            systemTempFile: recoveryMeta.systemTempFile
        });
        
        // ... 后续代码
```

---

## Task 3: 测试修复

**Files:**
- Test: Manual testing on Linux

**Step 1: 测试录音启动**

1. 启动应用
2. 点击"开始录音"
3. 检查控制台日志确认路径一致

**Expected:**
```
[Recorder] Recovery meta initialized: { tempFile: '.../temp_mic_xxx.webm', systemTempFile: '.../temp_sys_xxx.webm' }
[Recorder] Linux recording paths: { microphone: '.../temp_mic_xxx.webm', systemAudio: '.../temp_sys_xxx.webm', output: '.../combined_xxx.webm' }
```

**Step 2: 测试临时文件生成**

1. 录音超过 5 分钟（或修改 TEMP_SAVE_INTERVAL 为 10000ms 测试）
2. 检查 `~/.config/auto-meeting-recorder/audio_files/` 目录
3. 确认 `temp_mic_xxx.webm` 和 `temp_sys_xxx.webm` 文件存在

**Step 3: 测试应用重启恢复**

1. 正在录音时强制关闭应用
2. 重新启动应用
3. **Expected:** 应该显示"发现未完成的录音"对话框
4. 选择"立即转写"，验证录音可以正常恢复

**Step 4: 测试 Windows 平台不受影响**

1. 在 Windows 上重复上述测试
2. **Expected:** Windows 平台功能正常，不受 Linux 修复影响

---

## Task 4: 提交修复

```bash
git add src/js/recorder.js
git commit -m "fix: use recoveryMeta paths in Linux recording

修复 Linux 平台录音缓存提醒不工作的问题。

- 修改 startLinuxRecording() 使用 recoveryMeta.tempFile 和 systemTempFile
- 确保录音文件路径与恢复元数据一致
- 添加 recoveryMeta 初始化检查

Fixes #linux-recovery-issue"
```

---

## 验证清单

- [ ] Linux 录音时生成 `temp_mic_*.webm` 和 `temp_sys_*.webm`
- [ ] 重启应用后检测到未完成录音并显示对话框
- [ ] 可以选择"立即转写"并正常恢复录音
- [ ] Windows 平台功能不受影响
- [ ] 代码通过代码审查

## 风险评估

- **风险等级：低**
- 只修改 recorder.js 的路径使用逻辑
- Windows 平台使用不同的录制路径（startStandardRecording），不受影响
- 修改范围小，易于回滚
