# 弱网转写保护功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现弱网场景下的录音转写保护，确保录音数据不丢失，支持失败重试，并限制10秒内重复请求

**Architecture:** 
- 修改保存流程：停止录音后立即保存到历史记录（status: pending），转写作为更新操作
- 使用 Map 存储每条记录的最后转写时间实现10秒限制
- 四种状态流转：pending → transcribing → completed/failed

**Tech Stack:** JavaScript, Jest, Playwright (E2E)

---

### Task 1: 创建转写管理器 - 10秒限制功能

**Files:**
- Create: `src/js/transcription-manager.js`
- Test: `tests/unit/transcription-manager.test.js`

**Step 1: 写失败的测试**

```javascript
// tests/unit/transcription-manager.test.js
describe('TranscriptionManager', () => {
    let manager;
    
    beforeEach(() => {
        manager = new TranscriptionManager();
    });
    
    test('首次转写应允许', () => {
        expect(manager.canTranscribe('meeting-1')).toBe(true);
    });
    
    test('10秒内重复转写应被阻止', () => {
        manager.recordTranscriptionTime('meeting-1');
        expect(manager.canTranscribe('meeting-1')).toBe(false);
    });
    
    test('10秒后应允许再次转写', () => {
        jest.useFakeTimers();
        manager.recordTranscriptionTime('meeting-1');
        jest.advanceTimersByTime(10000);
        expect(manager.canTranscribe('meeting-1')).toBe(true);
        jest.useRealTimers();
    });
});
```

**Step 2: 运行测试确认失败**

Run: `npm test tests/unit/transcription-manager.test.js`
Expected: FAIL - "TranscriptionManager is not defined"

**Step 3: 写最小实现**

```javascript
// src/js/transcription-manager.js
class TranscriptionManager {
    constructor() {
        this.lastTranscriptionTime = new Map();
    }
    
    canTranscribe(meetingId) {
        const lastTime = this.lastTranscriptionTime.get(meetingId);
        if (!lastTime) return true;
        return (Date.now() - lastTime) >= 10000;
    }
    
    recordTranscriptionTime(meetingId) {
        this.lastTranscriptionTime.set(meetingId, Date.now());
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TranscriptionManager;
}
```

**Step 4: 运行测试确认通过**

Run: `npm test tests/unit/transcription-manager.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/transcription-manager.test.js src/js/transcription-manager.js
git commit -m "feat: add TranscriptionManager with 10s rate limiting"
```

---

### Task 2: 修改 Storage - 支持更新会议记录

**Files:**
- Modify: `src/js/storage.js`
- Test: `tests/unit/storage.test.js`

**Step 1: 写失败的测试**

```javascript
// tests/unit/storage.test.js
const { updateMeeting } = require('../../src/js/storage');

describe('updateMeeting', () => {
    test('应更新现有会议记录', async () => {
        const meeting = {
            id: 'test-1',
            transcript: 'old text',
            transcriptStatus: 'pending'
        };
        
        // 先保存
        await saveMeeting(meeting);
        
        // 更新
        await updateMeeting('test-1', {
            transcript: 'new text',
            transcriptStatus: 'completed'
        });
        
        const updated = await getMeeting('test-1');
        expect(updated.transcript).toBe('new text');
        expect(updated.transcriptStatus).toBe('completed');
    });
});
```

**Step 2: 运行测试确认失败**

Run: `npm test tests/unit/storage.test.js::updateMeeting`
Expected: FAIL - "updateMeeting is not defined"

**Step 3: 写最小实现**

```javascript
// src/js/storage.js
function updateMeeting(id, updates) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        
        const getRequest = objectStore.get(id);
        
        getRequest.onsuccess = () => {
            const existing = getRequest.result;
            if (!existing) {
                reject(new Error('Meeting not found'));
                return;
            }
            
            const updated = { ...existing, ...updates };
            const putRequest = objectStore.put(updated);
            
            putRequest.onsuccess = () => {
                resolve(updated);
            };
            
            putRequest.onerror = (event) => {
                reject(new Error('Failed to update meeting'));
            };
        };
        
        getRequest.onerror = () => {
            reject(new Error('Failed to get meeting'));
        };
    });
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        // ... existing exports
        updateMeeting
    };
}
```

**Step 4: 运行测试确认通过**

Run: `npm test tests/unit/storage.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/js/storage.js tests/unit/storage.test.js
git commit -m "feat: add updateMeeting function for partial updates"
```

---

### Task 3: 修改 App.js - 停止录音时先保存空记录

**Files:**
- Modify: `src/js/app.js`
- Test: `tests/integration/recorder-stop.test.js`

**Step 1: 写失败的测试**

```javascript
// tests/integration/recorder-stop.test.js
describe('Recording stop flow', () => {
    test('停止录音后应立即保存pending状态记录', async () => {
        // 模拟录音停止
        const audioBlob = new Blob(['test'], { type: 'audio/webm' });
        
        // 调用停止录音
        await handleStopRecording();
        
        // 检查是否保存了记录
        const meetings = await getAllMeetings();
        const latest = meetings[meetings.length - 1];
        
        expect(latest.transcriptStatus).toBe('pending');
        expect(latest.transcript).toBe('');
        expect(latest.audioFilename).toBeDefined();
    });
});
```

**Step 2: 运行测试确认失败**

Run: `npm test tests/integration/recorder-stop.test.js`
Expected: FAIL - 记录未保存或状态不是pending

**Step 3: 写最小实现**

```javascript
// src/js/app.js
async function handleStopRecording() {
    try {
        // 在停止前保存时长
        const currentDuration = getRecordingDuration();
        setLastRecordingDuration(currentDuration);
        
        const audioBlob = await stopRecording();
        updateRecordingButtons(getRecordingState());
        
        if (audioBlob) {
            // 先保存空记录（pending状态）
            const meetingId = await saveEmptyMeetingRecord(audioBlob);
            showToast('录音已停止，正在转写...', 'info');
            
            // 然后尝试转写
            await processRecording(audioBlob, meetingId);
        }
    } catch (error) {
        console.error('Failed to stop recording:', error);
        showToast('停止录音失败', 'error');
    }
}

// 新增：保存空记录
async function saveEmptyMeetingRecord(audioBlob) {
    const meeting = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        duration: lastRecordingDuration,
        audioFile: audioBlob,
        transcript: '',
        summary: '',
        transcriptStatus: 'pending'
    };
    
    await saveMeeting(meeting);
    return meeting.id;
}
```

**Step 4: 运行测试确认通过**

Run: `npm test tests/integration/recorder-stop.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/js/app.js tests/integration/recorder-stop.test.js
git commit -m "feat: save empty meeting record immediately on stop"
```

---

### Task 4: 修改 App.js - processRecording 改为更新记录

**Files:**
- Modify: `src/js/app.js`
- Test: `tests/integration/api-flow.test.js`

**Step 1: 写失败的测试**

```javascript
// tests/integration/api-flow.test.js
describe('Transcription flow with retry', () => {
    test('转写失败应更新状态为failed', async () => {
        // 模拟转写失败
        jest.spyOn(global, 'transcribeAudio').mockRejectedValue(new Error('Network error'));
        
        const meetingId = 'test-1';
        const audioBlob = new Blob(['test'], { type: 'audio/webm' });
        
        // 先保存空记录
        await saveMeeting({
            id: meetingId,
            transcriptStatus: 'pending',
            transcript: ''
        });
        
        // 尝试转写
        await processRecording(audioBlob, meetingId);
        
        // 检查状态
        const meeting = await getMeeting(meetingId);
        expect(meeting.transcriptStatus).toBe('failed');
    });
    
    test('转写成功应更新状态为completed', async () => {
        jest.spyOn(global, 'transcribeAudio').mockResolvedValue({
            success: true,
            text: 'Transcribed text'
        });
        
        const meetingId = 'test-2';
        await saveMeeting({
            id: meetingId,
            transcriptStatus: 'pending',
            transcript: ''
        });
        
        await processRecording(audioBlob, meetingId);
        
        const meeting = await getMeeting(meetingId);
        expect(meeting.transcriptStatus).toBe('completed');
        expect(meeting.transcript).toBe('Transcribed text');
    });
});
```

**Step 2: 运行测试确认失败**

Run: `npm test tests/integration/api-flow.test.js`
Expected: FAIL - 状态未正确更新

**Step 3: 写最小实现**

```javascript
// src/js/app.js
async function processRecording(audioBlob, meetingId) {
    try {
        // 更新为转写中状态
        await updateMeeting(meetingId, { transcriptStatus: 'transcribing' });
        
        console.log('处理录音, 当前设置:', currentSettings);

        if (!currentSettings.sttApiUrl || !currentSettings.sttApiKey) {
            console.error('API 未配置');
            await updateMeeting(meetingId, { transcriptStatus: 'failed' });
            showToast('请先配置语音识别API', 'error');
            return;
        }

        showLoading('正在转写...');
        
        const result = await transcribeAudio(
            audioBlob, 
            currentSettings.sttApiUrl, 
            currentSettings.sttApiKey, 
            currentSettings.sttModel
        );

        if (!result.success) {
            await updateMeeting(meetingId, { transcriptStatus: 'failed' });
            showToast('转写失败: ' + result.message, 'error');
            hideLoading();
            return;
        }

        // 更新转写成功
        await updateMeeting(meetingId, {
            transcript: result.text,
            transcriptStatus: 'completed'
        });
        
        updateSubtitleContent(result.text);
        showToast('转写完成，正在生成纪要...', 'info');
        
        currentTranscript = result.text;
        await generateMeetingSummary(result.text, audioBlob, meetingId);
        
    } catch (error) {
        console.error('Failed to process recording:', error);
        await updateMeeting(meetingId, { transcriptStatus: 'failed' });
        showToast('处理录音失败', 'error');
    } finally {
        hideLoading();
    }
}
```

**Step 4: 运行测试确认通过**

Run: `npm test tests/integration/api-flow.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/js/app.js tests/integration/api-flow.test.js
git commit -m "feat: update meeting status during transcription process"
```

---

### Task 5: 添加重试转写功能

**Files:**
- Modify: `src/js/app.js`
- Test: `tests/unit/app-retry.test.js`

**Step 1: 写失败的测试**

```javascript
// tests/unit/app-retry.test.js
describe('retryTranscription', () => {
    test('应允许10秒后重试', async () => {
        jest.useFakeTimers();
        
        const meetingId = 'test-1';
        const audioBlob = new Blob(['test'], { type: 'audio/webm' });
        
        // 第一次尝试
        await retryTranscription(meetingId, audioBlob);
        
        // 立即重试应被拒绝
        const result1 = await retryTranscription(meetingId, audioBlob);
        expect(result1.allowed).toBe(false);
        
        // 10秒后应允许
        jest.advanceTimersByTime(10000);
        const result2 = await retryTranscription(meetingId, audioBlob);
        expect(result2.allowed).toBe(true);
        
        jest.useRealTimers();
    });
});
```

**Step 2: 运行测试确认失败**

Run: `npm test tests/unit/app-retry.test.js`
Expected: FAIL - "retryTranscription is not defined"

**Step 3: 写最小实现**

```javascript
// src/js/app.js
const transcriptionManager = new TranscriptionManager();

async function retryTranscription(meetingId, audioBlob) {
    if (!transcriptionManager.canTranscribe(meetingId)) {
        return { allowed: false, message: '请等待10秒后再试' };
    }
    
    transcriptionManager.recordTranscriptionTime(meetingId);
    
    // 重置状态为pending并重新转写
    await updateMeeting(meetingId, { transcriptStatus: 'pending' });
    await processRecording(audioBlob, meetingId);
    
    return { allowed: true };
}

// 导出供测试
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        // ... existing exports
        retryTranscription
    };
}
```

**Step 4: 运行测试确认通过**

Run: `npm test tests/unit/app-retry.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/js/app.js tests/unit/app-retry.test.js
git commit -m "feat: add retryTranscription with 10s rate limiting"
```

---

### Task 6: UI - 历史记录显示状态图标

**Files:**
- Modify: `src/js/ui.js`
- Test: `tests/unit/ui.test.js`

**Step 1: 写失败的测试**

```javascript
// tests/unit/ui.test.js
describe('History list status display', () => {
    test('pending状态应显示等待图标', () => {
        const meeting = {
            id: '1',
            date: '2026-02-12T10:00:00Z',
            duration: '10:00',
            transcriptStatus: 'pending'
        };
        
        const html = renderHistoryItem(meeting);
        expect(html).toContain('等待转写');
        expect(html).toContain('btn-transcribe');
    });
    
    test('failed状态应显示重试按钮', () => {
        const meeting = {
            id: '2',
            transcriptStatus: 'failed'
        };
        
        const html = renderHistoryItem(meeting);
        expect(html).toContain('重试转写');
        expect(html).toContain('btn-retry');
    });
});
```

**Step 2: 运行测试确认失败**

Run: `npm test tests/unit/ui.test.js`
Expected: FAIL - 函数不存在或返回格式不对

**Step 3: 写最小实现**

```javascript
// src/js/ui.js
function renderHistoryItem(meeting) {
    const statusMap = {
        'pending': { text: '等待转写', icon: '⏳', class: 'status-pending' },
        'transcribing': { text: '转写中...', icon: '⏳', class: 'status-transcribing' },
        'completed': { text: '已完成', icon: '✓', class: 'status-completed' },
        'failed': { text: '转写失败', icon: '✗', class: 'status-failed' }
    };
    
    const status = statusMap[meeting.transcriptStatus] || statusMap['pending'];
    
    let actionButton = '';
    if (meeting.transcriptStatus === 'pending' || meeting.transcriptStatus === 'failed') {
        const btnText = meeting.transcriptStatus === 'failed' ? '重试转写' : '开始转写';
        const btnClass = meeting.transcriptStatus === 'failed' ? 'btn-retry' : 'btn-transcribe';
        actionButton = `<button class="btn btn-sm ${btnClass}" data-meeting-id="${meeting.id}">${btnText}</button>`;
    }
    
    return `
        <div class="history-item" data-id="${meeting.id}">
            <div class="history-info">
                <div class="history-date">${formatDateTime(meeting.date)}</div>
                <div class="history-duration">${meeting.duration}</div>
                <div class="history-status ${status.class}">
                    <span class="status-icon">${status.icon}</span>
                    <span class="status-text">${status.text}</span>
                </div>
            </div>
            <div class="history-actions">
                ${actionButton}
                <button class="btn btn-icon btn-view" data-meeting-id="${meeting.id}">查看</button>
            </div>
        </div>
    `;
}
```

**Step 4: 运行测试确认通过**

Run: `npm test tests/unit/ui.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/js/ui.js tests/unit/ui.test.js
git commit -m "feat: display transcription status in history list"
```

---

### Task 7: UI - 绑定重试按钮事件

**Files:**
- Modify: `src/js/ui.js`
- Test: `tests/e2e/transcription-retry.spec.js`

**Step 1: 写失败的测试**

```javascript
// tests/e2e/transcription-retry.spec.js
test('点击重试按钮应触发转写', async ({ page }) => {
    // 先创建一个失败的记录
    await page.evaluate(() => {
        localStorage.setItem('meetings', JSON.stringify([{
            id: 'test-1',
            transcriptStatus: 'failed',
            date: new Date().toISOString(),
            duration: '10:00'
        }]));
    });
    
    await page.goto('http://localhost:3000');
    await page.click('[data-view="history"]');
    
    // 点击重试按钮
    await page.click('.btn-retry');
    
    // 应显示转写中状态
    await expect(page.locator('.status-transcribing')).toBeVisible();
});
```

**Step 2: 运行测试确认失败**

Run: `npx playwright test tests/e2e/transcription-retry.spec.js`
Expected: FAIL - 按钮未绑定事件

**Step 3: 写最小实现**

```javascript
// src/js/ui.js
function initHistoryActions() {
    document.querySelectorAll('.btn-transcribe, .btn-retry').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const meetingId = e.target.dataset.meetingId;
            await handleTranscribeClick(meetingId);
        });
    });
}

async function handleTranscribeClick(meetingId) {
    const meeting = await getMeeting(meetingId);
    if (!meeting) return;
    
    // 检查10秒限制
    const result = await retryTranscription(meetingId, meeting.audioFile);
    
    if (!result.allowed) {
        showToast(result.message, 'warning');
        return;
    }
}

// 在 renderHistoryList 后调用
function renderHistoryList(meetings) {
    const container = document.getElementById('historyList');
    if (!container) return;
    
    container.innerHTML = meetings.map(renderHistoryItem).join('');
    
    // 绑定事件
    initHistoryActions();
}
```

**Step 4: 运行测试确认通过**

Run: `npx playwright test tests/e2e/transcription-retry.spec.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/js/ui.js tests/e2e/transcription-retry.spec.js
git commit -m "feat: bind retry button events with rate limiting"
```

---

### Task 8: 集成测试 - 完整弱网场景

**Files:**
- Create: `tests/integration/weak-network-scenario.test.js`

**测试场景：**

```javascript
// tests/integration/weak-network-scenario.test.js
describe('Weak network scenario', () => {
    test('断网时录音应保存，联网后可重试', async () => {
        // 1. 开始录音
        await startRecording();
        
        // 2. 模拟断网
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
        
        // 3. 停止录音
        await handleStopRecording();
        
        // 4. 验证记录已保存（pending状态）
        const meetings = await getAllMeetings();
        const latest = meetings[meetings.length - 1];
        expect(latest.transcriptStatus).toBe('failed'); // 或 pending，取决于实现
        expect(latest.audioFilename).toBeDefined();
        
        // 5. 恢复网络
        jest.restoreAllMocks();
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ text: 'Transcribed text' })
        });
        
        // 6. 重试转写
        await retryTranscription(latest.id, latest.audioFile);
        
        // 7. 验证转写成功
        const updated = await getMeeting(latest.id);
        expect(updated.transcriptStatus).toBe('completed');
        expect(updated.transcript).toBe('Transcribed text');
    });
});
```

**Step 1-5:** 运行测试 → 失败 → 修复 → 通过 → Commit

---

## 实施检查清单

- [ ] Task 1: TranscriptionManager 10秒限制
- [ ] Task 2: Storage updateMeeting 功能
- [ ] Task 3: 停止录音先保存空记录
- [ ] Task 4: processRecording 更新状态
- [ ] Task 5: 重试功能与10秒限制
- [ ] Task 6: 历史记录UI状态显示
- [ ] Task 7: 重试按钮事件绑定
- [ ] Task 8: 完整弱网集成测试

## 关键注意事项

1. **TDD 原则**: 每个 Task 都必须先写测试，看失败，再实现，看通过
2. **Minimal Implementation**: 每个实现只满足当前测试，不提前实现
3. **频繁提交**: 每个 Task 完成后立即 commit
4. **边界情况**: 
   - 10秒内点击重试应显示提示
   - 转写中关闭应用，状态应重置为 pending
   - 存储空间不足时给出友好提示

## 测试命令

```bash
# 单元测试
npm test tests/unit/transcription-manager.test.js
npm test tests/unit/storage.test.js
npm test tests/unit/ui.test.js

# 集成测试
npm test tests/integration/recorder-stop.test.js
npm test tests/integration/api-flow.test.js
npm test tests/integration/weak-network-scenario.test.js

# E2E测试
npx playwright test tests/e2e/transcription-retry.spec.js

# 全部测试
npm test
```
