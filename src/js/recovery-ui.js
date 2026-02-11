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
        // 获取恢复元数据
        const meta = getRecoveryMeta();
        if (!meta) {
            showToast('恢复元数据不存在', 'error');
            return;
        }
        
        // 从临时文件恢复音频
        const audioBlob = await recoverAudioBlob(meta);
        
        if (!audioBlob) {
            showToast('恢复录音文件失败', 'error');
            return;
        }
        
        // 设置录音时长
        setLastRecordingDuration(formatDuration(meta.duration));
        
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
    // 检查是否有临时文件可以恢复
    if (!meta || !meta.tempFile) {
        throw new Error('没有可恢复的录音文件');
    }
    
    // 检查临时文件是否存在
    const filesToCheck = [meta.tempFile];
    if (meta.systemTempFile) {
        filesToCheck.push(meta.systemTempFile);
    }
    
    let filesExist = true;
    for (const filePath of filesToCheck) {
        const result = await window.electronAPI.fileExists(filePath);
        if (!result.exists) {
            filesExist = false;
            break;
        }
    }
    
    if (!filesExist) {
        throw new Error('录音文件已丢失，无法继续录制');
    }
    
    // TODO: 实现真正的继续录制功能（追加录制）
    // 由于 Web Audio API 限制，真正的追加录制需要复杂的音频处理
    // 目前提供两种替代方案：
    
    // 方案1：将之前的录音保存为历史记录，然后开始新录音
    const choice = await showContinueRecordingDialog(meta);
    
    if (choice === 'save_and_start') {
        // 保存当前录音到历史记录，然后开始新录音
        await saveRecoveryToHistory(meta);
        await clearRecoveryData();
        showToast('已保存录音到历史记录，请开始新的录音', 'success');
    } else if (choice === 'discard_and_start') {
        // 丢弃当前录音，开始新录音
        await clearRecoveryData();
        showToast('已清除未完成的录音，请开始新的录音', 'info');
    } else {
        // 用户取消
        throw new Error('用户取消了继续录制');
    }
}

/**
 * 显示继续录制选项对话框
 */
async function showContinueRecordingDialog(meta) {
    // 由于无法真正追加录制，提供替代方案
    const duration = formatDuration(meta.duration);
    const message = `检测到未完成的录音（${duration}）。\n\n由于技术限制，暂时无法直接继续录制。您可以选择：\n\n1. 保存到历史记录后开始新录音\n2. 丢弃后开始新录音\n3. 取消并返回`;
    
    // 使用自定义对话框替代 confirm
    return new Promise((resolve) => {
        // 创建临时对话框
        const dialog = document.createElement('div');
        dialog.className = 'recovery-choice-dialog';
        dialog.innerHTML = `
            <div class="recovery-choice-overlay"></div>
            <div class="recovery-choice-content">
                <h3>继续录制选项</h3>
                <p>检测到未完成的录音（${duration}）</p>
                <p class="recovery-choice-hint">由于技术限制，暂时无法直接继续录制。请选择：</p>
                <div class="recovery-choice-buttons">
                    <button id="btnSaveAndStart" class="btn btn-primary">保存到历史并新录</button>
                    <button id="btnDiscardAndStart" class="btn btn-secondary">丢弃并新录</button>
                    <button id="btnCancelContinue" class="btn btn-text">取消</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // 绑定按钮事件
        document.getElementById('btnSaveAndStart').onclick = () => {
            document.body.removeChild(dialog);
            resolve('save_and_start');
        };
        
        document.getElementById('btnDiscardAndStart').onclick = () => {
            document.body.removeChild(dialog);
            resolve('discard_and_start');
        };
        
        document.getElementById('btnCancelContinue').onclick = () => {
            document.body.removeChild(dialog);
            resolve('cancel');
        };
    });
}

/**
 * 将恢复的录音保存到历史记录
 */
async function saveRecoveryToHistory(meta) {
    try {
        // 从临时文件恢复音频（传入 meta 参数，避免依赖全局 recoveryMeta）
        const audioBlob = await recoverAudioBlob(meta);
        
        if (!audioBlob) {
            throw new Error('恢复录音文件失败');
        }
        
        // 生成文件名
        const date = new Date(meta.startTime);
        const filename = `${date.toISOString().split('T')[0]}_${date.toTimeString().split(' ')[0].replace(/:/g, '-')}_recovered.webm`;
        
        // 保存到历史记录
        // 将毫秒数转换为格式化时长字符串
        const formattedDuration = formatDuration(meta.duration || 0);
        
        // 保存音频文件（使用 electronAPI.saveAudio 获取完整路径）
        let audioFilePath = filename;
        if (window.electronAPI && window.electronAPI.saveAudio) {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const saveResult = await window.electronAPI.saveAudio(
                Array.from(new Uint8Array(arrayBuffer)),
                filename
            );
            
            if (!saveResult.success) {
                throw new Error('保存音频文件失败: ' + saveResult.error);
            }
            // 使用返回的完整路径
            audioFilePath = saveResult.filePath;
        }
        
        const meetingData = {
            id: Date.now().toString(),
            date: date.toISOString(),
            duration: formattedDuration,
            audioFilename: audioFilePath, // 使用完整路径
            status: 'completed', // 标记为已完成（录音完成但未转写）
            transcript: '',
            summary: ''
        };
        
        // 保存会议记录到 IndexedDB
        await addMeetingRecord(meetingData);
        
        showToast('录音已保存到历史记录', 'success');
        
        // 刷新历史记录列表
        if (typeof loadHistory === 'function') {
            await loadHistory();
        }
        
    } catch (error) {
        console.error('[RecoveryUI] Error saving to history:', error);
        throw error;
    }
}

// 添加会议记录到 IndexedDB 的辅助函数
async function addMeetingRecord(meetingData) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('MeetingMinutesDB', 2);
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            // 如果 meetings store 不存在，创建它
            if (!database.objectStoreNames.contains('meetings')) {
                const objectStore = database.createObjectStore('meetings', { keyPath: 'id' });
                objectStore.createIndex('date', 'date', { unique: false });
            }
        };
        
        request.onsuccess = (event) => {
            const db = event.target.result;
            
            // 检查 meetings store 是否存在
            if (!db.objectStoreNames.contains('meetings')) {
                reject(new Error('Database object store not found'));
                return;
            }
            
            const transaction = db.transaction(['meetings'], 'readwrite');
            const store = transaction.objectStore('meetings');
            
            const addRequest = store.add(meetingData);
            
            addRequest.onsuccess = () => {
                resolve();
            };
            
            addRequest.onerror = (error) => {
                console.error('[RecoveryUI] Error adding meeting record:', error);
                reject(new Error('Failed to add meeting record'));
            };
            
            transaction.onerror = (error) => {
                console.error('[RecoveryUI] Transaction error:', error);
                reject(new Error('Transaction failed'));
            };
        };
        
        request.onerror = (error) => {
            console.error('[RecoveryUI] Database open error:', error);
            reject(new Error('Failed to open database'));
        };
        
        request.onblocked = () => {
            console.error('[RecoveryUI] Database blocked');
            reject(new Error('Database is blocked by another connection'));
        };
    });
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initRecoveryUI,
        showRecoveryDialog,
        closeRecoveryModal
    };
}
