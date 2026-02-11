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
    // 检查是否有未完成的录音
    const hasRecovery = await checkUnfinishedRecording();
    
    if (hasRecovery) {
        console.log('[Recovery] 发现未完成的录音');
        return recoveryMeta;
    }
    
    return null;
}

/**
 * 检查是否有未完成的录音
 */
async function checkUnfinishedRecording() {
    if (!window.electronAPI) {
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
    if (!meta) return false;
    
    const filesToCheck = [meta.tempFile];
    if (meta.systemTempFile) {
        filesToCheck.push(meta.systemTempFile);
    }
    
    for (const filePath of filesToCheck) {
        const result = await window.electronAPI.fileExists(filePath);
        if (!result.exists) {
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
        return null;
    }
    
    const audioDir = audioDirResult.path;
    
    recoveryMeta = {
        id: timestamp.toString(),
        startTime: new Date().toISOString(),
        platform: platform,
        isLinux: isLinux,
        tempFile: isLinux ? 
            `${audioDir}/temp_mic_${timestamp}.webm` : 
            `${audioDir}/temp_recording_${timestamp}.webm`,
        systemTempFile: isLinux ? `${audioDir}/temp_sys_${timestamp}.webm` : null,
        lastSaveTime: timestamp,
        duration: 0,
        chunkCount: 0
    };
    
    // 保存元数据
    await window.electronAPI.writeRecoveryMeta(recoveryMeta);
    
    // 启动定期保存
    startTempSaveTimer();
    
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
}

/**
 * 停止定期保存
 */
function stopTempSaveTimer() {
    if (tempSaveTimer) {
        clearInterval(tempSaveTimer);
        tempSaveTimer = null;
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
        
        // 仅在DEBUG模式下输出日志
        if (window.DEBUG_RECOVERY) {
            console.log('[Recovery] Temp metadata updated, duration:', duration);
        }
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
    
    if (recoveryMeta) {
        const filesToDelete = [recoveryMeta.tempFile];
        if (recoveryMeta.systemTempFile) {
            filesToDelete.push(recoveryMeta.systemTempFile);
        }
        
        for (const filePath of filesToDelete) {
            await window.electronAPI.deleteFile(filePath);
        }
    }
    
    // 删除元数据文件
    await window.electronAPI.deleteRecoveryMeta();
    
    recoveryMeta = null;
}

/**
 * 从临时文件恢复录音Blob
 * @param {Object} meta - 恢复元数据（可选，默认使用全局 recoveryMeta）
 */
async function recoverAudioBlob(meta) {
    const targetMeta = meta || recoveryMeta;
    if (!targetMeta) return null;
    
    try {
        if (targetMeta.isLinux) {
            const micPath = targetMeta.tempFile;
            const sysPath = targetMeta.systemTempFile;
            const outputPath = micPath.replace('temp_mic_', 'recovered_');
            
            const mergeResult = await window.electronAPI.mergeAudioFiles(
                micPath, sysPath, outputPath
            );
            
            if (!mergeResult.success) {
                throw new Error('Failed to merge audio files');
            }
            
            const readResult = await window.electronAPI.readAudioFile(outputPath);
            if (!readResult.success) {
                throw new Error('Failed to read recovered audio');
            }
            
            const buffer = new Uint8Array(readResult.data);
            return new Blob([buffer], { type: 'audio/webm' });
        } else {
            const tempPath = targetMeta.tempFile;
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

/**
 * 增量保存音频 chunk
 */
async function appendAudioChunk(chunkData) {
    if (!recoveryMeta) return;
    
    try {
        await window.electronAPI.appendAudioToPath(chunkData, recoveryMeta.tempFile);
        recoveryMeta.chunkCount++;
        recoveryMeta.lastSaveTime = Date.now();
    } catch (error) {
        console.error('[Recovery] Error appending audio chunk:', error);
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
        checkUnfinishedRecording,
        appendAudioChunk
    };
}
