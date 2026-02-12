# 弱网转写保护设计文档

**日期**: 2026-02-12  
**主题**: 弱网情况下的录音转写保护机制

---

## 概述

解决断网或API故障导致转写失败时录音数据丢失的问题。录音停止后立即保存到历史记录，转写失败时保留数据并提供重试机制。

---

## 核心流程

### 流程变更

**当前（有缺陷）:**
```
停止录音 → 调用转写API → 成功: 保存到历史记录
                     → 失败: 显示错误，数据丢失
```

**新（安全）:**
```
停止录音 → 立即保存历史记录（status: pending）
       → 尝试转写 → 成功: 更新记录（status: completed）
                   → 失败: 保持记录（status: failed）
```

### 保存时机

1. **停止录音后立即保存**: 音频文件 + 空转写记录
2. **转写成功更新**: 填充转写文本和会议纪要
3. **转写失败保留**: 仅更新状态，数据不丢失

---

## 状态管理

### 状态定义

| 状态 | 含义 | UI显示 | 操作按钮 |
|------|------|--------|----------|
| `pending` | 等待转写 | ⏳ 等待转写 | 【开始转写】 |
| `transcribing` | 转写中 | ⏳ 转写中... | 【转写中...】（禁用） |
| `completed` | 已完成 | ✓ 已完成 | 【重新转写】 |
| `failed` | 转写失败 | ✗ 转写失败 | 【重试转写】 |

### 边界情况处理

1. **转写中关闭应用**: 状态重置为 `pending`，允许重试
2. **纪要生成失败**: 仅提示用户，不影响转写状态，可手动重新生成
3. **存储空间不足**: 保存前检查，提示用户清理空间
4. **文件损坏**: 标记为 `failed`，允许删除
5. **API限流（429）**: 特殊提示"请求过于频繁"

---

## 防频繁请求机制

### 实现

```javascript
const lastTranscriptionTime = new Map();

function canTranscribe(meetingId) {
    const lastTime = lastTranscriptionTime.get(meetingId);
    if (!lastTime) return true;
    return (Date.now() - lastTime) >= 10000; // 10秒限制
}
```

**提示文案**: "请等待10秒后再试"

---

## 数据结构变更

### Meeting 对象新增字段

```javascript
{
    id: string,
    date: string,
    duration: string,
    audioFilename: string,
    transcript: string,           // 转写文本
    summary: string,              // 会议纪要
    transcriptStatus: 'pending' | 'transcribing' | 'completed' | 'failed',
    createdAt: number,            // 创建时间戳
    lastTranscribedAt: number     // 上次转写时间（用于10s限制）
}
```

---

## UI变更

### 历史记录列表

每条记录显示：
- 日期时间
- 时长
- 状态图标 + 文字
- 操作按钮（根据状态显示）

### 详情页

- **pending/failed**: 显示【开始转写】/【重试】按钮
- **transcribing**: 显示加载动画，禁用操作
- **completed**: 显示转写内容和纪要

---

## 关键修改文件

### 修改文件

1. **`src/js/app.js`**
   - `handleStopRecording()`: 先保存空记录再转写
   - `processRecording()`: 改为更新记录而非新建
   - 新增 `retryTranscription()` 函数

2. **`src/js/ui.js`**
   - `renderHistoryList()`: 显示状态图标和按钮
   - `renderMeetingDetail()`: 根据状态显示不同UI
   - 新增转写状态渲染逻辑

3. **`src/js/storage.js`**
   - `saveMeeting()`: 支持更新现有记录
   - 新增 `updateMeeting()` 辅助函数

### 新增文件

4. **`src/js/transcription-manager.js`**
   - 管理转写状态和10s限制
   - 封装重试逻辑

---

## 测试要点

1. **断网场景**: 停止录音后断网，验证记录是否保存
2. **重试功能**: 模拟转写失败，验证可重试
3. **10秒限制**: 验证频繁点击被阻止
4. **状态流转**: 验证 pending → transcribing → completed/failed

---

## 实施建议

1. 先修改保存逻辑，确保录音不丢失
2. 再添加状态管理和UI
3. 最后实现重试功能和防频繁请求
4. 每个阶段都进行完整测试

---

**状态**: 待实施  
**优先级**: 高（数据安全相关）
