let mediaRecorder = null;
let isRecording = false;
let isStartingRecording = false;
let isPaused = false;
let recordingStartTime = null;
let pauseStartTime = null;
let recordingPausedTime = 0;
let timerInterval = null;
let audioBlob = null;
let liveSpeechInput = null;
let onAudioFileReady = null; // 回调：音频文件读取完成后触发

let audioContext = null;
// 音频流相关变量
let microphoneStream = null;
let systemAudioStream = null;

// 平台检测
let currentPlatform = null;
let isLinuxPlatform = false;
let isFFmpegRecording = false;
let pendingStopResolve = null;
let pendingStopReject = null;

function takePendingStopHandlers() {
    const handlers = {
        resolve: pendingStopResolve,
        reject: pendingStopReject
    };
    pendingStopResolve = null;
    pendingStopReject = null;
    return handlers;
}

async function notifyAudioFileReady(audioBlob) {
    if (typeof onAudioFileReady === 'function') {
        await Promise.resolve(onAudioFileReady(audioBlob));
    }
}

// FFmpeg 录制相关变量（Linux）
let linuxRecordingPaths = null;

// 初始化平台检测
async function detectPlatform() {
    if (window.electronAPI && window.electronAPI.getPlatform) {
        try {
            const result = await window.electronAPI.getPlatform();
            if (result.success) {
                currentPlatform = result.platform;
                isLinuxPlatform = result.isLinux;
                if (window.DEBUG_AUDIO) {
                    console.log('平台检测:', currentPlatform, 'isLinux:', isLinuxPlatform);
                }
                return result;
            }
        } catch (e) {
            if (window.DEBUG_AUDIO) {
                console.warn('平台检测失败:', e);
            }
        }
    }
    // 回退检测
    currentPlatform = navigator.platform.toLowerCase().includes('linux') ? 'linux' : 
                     navigator.platform.toLowerCase().includes('win') ? 'win32' : 
                     navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'unknown';
    isLinuxPlatform = currentPlatform === 'linux';
    return { platform: currentPlatform, isLinux: isLinuxPlatform };
}

function getSavedAudioSourceSelection() {
    if (typeof window !== 'undefined' && typeof window.getAudioSourceSelection === 'function') {
        return window.getAudioSourceSelection();
    }

    return {
        settings: null,
        state: null
    };
}

function resolvePreferredSourceId(preferredSource, recommendedSource, sources = []) {
    if (preferredSource && preferredSource !== 'auto' && preferredSource !== 'unavailable') {
        const matched = sources.find(source => source.id === preferredSource || source.name === preferredSource);
        if (matched) {
            return preferredSource;
        }
    }

    return recommendedSource || null;
}

async function startRecording(localAsr = false) {
    if (isRecording || isStartingRecording) {
        throw new Error('录音已启动或正在启动');
    }
    isStartingRecording = true;
    try {
        if (window.DEBUG_AUDIO) {
            console.log('=== 开始录音 ===');
        }
        
        // 检测平台
        await detectPlatform();
        
        // 启动恢复跟踪
        if (typeof startRecoveryTracking === 'function') {
            const recoveryState = await startRecoveryTracking(currentPlatform, isLinuxPlatform);
            if (!recoveryState || !recoveryState.tempFile) {
                throw new Error('恢复录音初始化失败，请检查音频目录权限后重试');
            }
        }
        
        // Linux 平台使用 FFmpeg 录制（已在应用启动时检测依赖）
        if (isLinuxPlatform && window.electronAPI && window.electronAPI.checkFFmpeg) {
            const ffmpegCheck = await window.electronAPI.checkFFmpeg();
            if (ffmpegCheck.success && ffmpegCheck.available) {
                if (window.DEBUG_AUDIO) {
                    console.log('Linux 平台使用 FFmpeg 录制');
                }
                return await startLinuxRecording(localAsr);
            } else {
                console.warn('Linux: 未检测到 ffmpeg，使用标准方式录制');
                return await startStandardRecording(localAsr);
            }
        }
        
        // 标准录制方式（Windows/Mac）
        return await startStandardRecording(localAsr);
    } catch (error) {
        console.error('录音启动失败:', error);
        isRecording = false;
        await disconnectLiveSpeechInput();
        stopTimer();
        if (typeof stopTempSaveTimer === 'function') {
            stopTempSaveTimer();
        }
        stopAllStreams();
        closeRecordingAudioContext();
        throw error;
    } finally {
        isStartingRecording = false;
    }
}

async function startLinuxRecording(localAsr) {
    try {
        if (window.DEBUG_AUDIO) {
            console.log('=== 开始 Linux FFmpeg 录音 ===');
        }
        
        // 检查 recoveryMeta 是否已初始化
        if (typeof recoveryMeta === 'undefined' || !recoveryMeta) {
            throw new Error('恢复元数据未初始化，请确保 startRecoveryTracking() 已被调用');
        }
        
        if (!recoveryMeta.tempFile) {
            throw new Error('恢复元数据缺少临时文件路径');
        }
        
        linuxRecordingPaths = {
            output: recoveryMeta.tempFile
        };

        const audioSourceSelection = getSavedAudioSourceSelection();
        const audioSourceState = audioSourceSelection.state || {};
        const savedSettings = audioSourceSelection.settings || {};
        const preferredLinuxMicSource = resolvePreferredSourceId(
            savedSettings.preferredMicSource,
            audioSourceState.recommendedMicSource,
            audioSourceState.microphoneSources || []
        );
        const preferredLinuxSystemSource = resolvePreferredSourceId(
            savedSettings.preferredSystemSource,
            audioSourceState.recommendedSystemSource,
            audioSourceState.systemSources || []
        );
        
        console.log('[Recorder] Linux recording paths:', linuxRecordingPaths);

        // 1. 检测并修复 PulseAudio 输入设备（ARM Linux 常见问题）
        if (window.electronAPI && window.electronAPI.checkPulseAudioInput && !preferredLinuxMicSource) {
            const checkResult = await window.electronAPI.checkPulseAudioInput();
            if (checkResult.success && !checkResult.hasInput) {
                console.log('[Recorder] 检测到无 PulseAudio 输入设备，尝试自动修复...');
                if (window.electronAPI.fixPulseAudioInput) {
                    const fixResult = await window.electronAPI.fixPulseAudioInput();
                    if (fixResult.success) {
                        console.log('[Recorder] PulseAudio 输入设备修复成功');
                    } else {
                        console.warn('[Recorder] PulseAudio 输入设备修复失败:', fixResult.error);
                    }
                }
            }
        }

        const sysResult = await window.electronAPI.startFFmpegSystemAudio(
            linuxRecordingPaths.output,
            preferredLinuxSystemSource,
            preferredLinuxMicSource,
            localAsr
        );
        if (!sysResult.success) {
            throw new Error('启动 Linux 录音失败: ' + sysResult.error);
        }
        
        isFFmpegRecording = true;
        isRecording = true;
        isPaused = false;
        recordingStartTime = Date.now();
        recordingPausedTime = 0;
        startTimer();
        
        return true;
        
    } catch (error) {
        console.error('Linux 录制启动失败:', error);
        linuxRecordingPaths = null;
        throw error;
    }
}

// 标准录制方式（Windows/Mac）
async function startStandardRecording(localAsr) {
    if (window.DEBUG_AUDIO) {
        console.log('=== 开始标准录音 ===');
    }
    
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioSourceSelection = getSavedAudioSourceSelection();
    const savedSettings = audioSourceSelection.settings || {};
    const preferredMicDeviceId = savedSettings.preferredMicSource &&
        savedSettings.preferredMicSource !== 'auto' &&
        savedSettings.preferredMicSource !== 'unavailable'
        ? savedSettings.preferredMicSource
        : null;

    const microphoneConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    };

    // 获取麦克风音频
    try {
        microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                ...microphoneConstraints,
                ...(preferredMicDeviceId ? { deviceId: { exact: preferredMicDeviceId } } : {})
            }
        });
    } catch (error) {
        if (!preferredMicDeviceId) {
            throw error;
        }

        console.warn('[Recorder] Preferred microphone device unavailable, fallback to default:', preferredMicDeviceId);
        microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: microphoneConstraints
        });
    }

    // 获取系统音频（通过 Electron desktopCapturer）
    try {
        // 检查是否在 Electron 环境中
        if (window.electronAPI && window.electronAPI.getDesktopCapturerSources) {
            // Electron 环境：使用 desktopCapturer
            const result = await window.electronAPI.getDesktopCapturerSources();
            
            if (!result.success) {
                throw new Error('获取屏幕分享源失败: ' + result.error);
            }
            
            const sources = result.sources;
            
            if (sources.length === 0) {
                throw new Error('没有可用的屏幕分享源');
            }
            
            // 选择第一个屏幕源（通常是整个屏幕）
            const screenSource = sources.find(s => s.name === 'Entire screen') || sources[0];
            
            // 使用 getUserMedia 配合 chromeMediaSource 获取系统音频
            systemAudioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: screenSource.id
                    }
                },
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: screenSource.id
                    }
                }
            });

            const systemAudioTrack = systemAudioStream.getAudioTracks()[0];
            if (!systemAudioTrack) {
                systemAudioStream.getTracks().forEach(track => track.stop());
                systemAudioStream = null;
                throw new Error('系统音频轨道不可用');
            }
        } else {
            // 浏览器环境：使用 getDisplayMedia
            console.log('提示: 请在弹出的对话框中选择"整个屏幕"或"标签页"，并勾选"分享音频"选项');
            
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
            
            const systemAudioTrack = displayStream.getAudioTracks()[0];
            if (!systemAudioTrack) {
                console.error('错误: 未获取到系统音频轨道');
                displayStream.getTracks().forEach(track => track.stop());
                throw new Error('未获取到系统音频，请确保选择了"分享音频"选项');
            }
            
            // 停止视频轨道，只保留音频
            displayStream.getVideoTracks().forEach(track => track.stop());
            
            // 创建系统音频流（只包含音频轨道）
            systemAudioStream = new MediaStream([systemAudioTrack]);
        }
    } catch (err) {
        stopAllStreams();
        console.error('获取系统音频失败:', err.name, err.message);
        throw new Error('获取系统音频失败: ' + err.message);
    }

    if (audioContext.state === 'suspended') await audioContext.resume();
    const combinedStream = await combineAudioStreams(microphoneStream, systemAudioStream, audioContext);

    mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: 'audio/webm'
    });

    if (localAsr) await startLiveSpeechInput(combinedStream);

    let pendingWrites = Promise.resolve();
    let writeError = null;
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        pendingWrites = pendingWrites.then(async () => {
            const chunkData = new Uint8Array(await event.data.arrayBuffer());
            await appendAudioChunk(chunkData);
        }).catch((error) => {
            writeError = writeError || error;
        });
    };

    mediaRecorder.onstop = async () => {
        const handlers = takePendingStopHandlers();

        try {
            await finishLiveSpeechInput();
            await pendingWrites;
            if (writeError) throw writeError;
            const meta = typeof getRecoveryMeta === 'function' ? getRecoveryMeta() : null;
            if (!meta || !meta.tempFile) {
                throw new Error('Temporary recording file is not available');
            }
            if (!window.electronAPI || typeof window.electronAPI.readAudioFile !== 'function') {
                throw new Error('readAudioFile IPC is not available');
            }

            const readResult = await window.electronAPI.readAudioFile(meta.tempFile);
            if (!readResult.success) {
                throw new Error(readResult.error || 'Failed to read audio recording');
            }

            const buffer = readResult.data instanceof Uint8Array ? readResult.data : new Uint8Array(readResult.data);
            audioBlob = new Blob([buffer], { type: 'audio/webm' });

            if (typeof handlers.resolve === 'function') {
                handlers.resolve(audioBlob);
            }

            try {
                await notifyAudioFileReady(audioBlob);
            } catch (callbackError) {
                console.error('[Recorder] Audio ready callback failed:', callbackError);
            }
        } catch (error) {
            console.error('[Recorder] Error reading audio file:', error);
            if (typeof handlers.reject === 'function') {
                handlers.reject(error);
            }
        } finally {
            stopAllStreams();
            closeRecordingAudioContext();
            mediaRecorder = null;
        }
    };
    
    mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder 错误:', event);
        const handlers = takePendingStopHandlers();
        if (typeof handlers.reject === 'function') {
            const recorderError = event && event.error ? event.error : new Error('MediaRecorder error');
            handlers.reject(recorderError);
        }
    };

    mediaRecorder.start(1000);
    
    isRecording = true;
    isPaused = false;
    isFFmpegRecording = false;
    recordingStartTime = Date.now();
    recordingPausedTime = 0;
    startTimer();

    console.log('=== 录音启动完成 ===');

    return true;
}

async function combineAudioStreams(micStream, sysStream, ctx) {
    const micSource = ctx.createMediaStreamSource(micStream);
    const sysSource = ctx.createMediaStreamSource(sysStream);

    const micGain = ctx.createGain();
    const sysGain = ctx.createGain();

    micSource.connect(micGain);
    sysSource.connect(sysGain);

    const destination = ctx.createMediaStreamDestination();
    micGain.connect(destination);
    sysGain.connect(destination);

    return destination.stream;
}

function stopAllStreams() {
    if (microphoneStream) {
        microphoneStream.getTracks().forEach(track => track.stop());
        microphoneStream = null;
    }
    
    if (systemAudioStream) {
        systemAudioStream.getTracks().forEach(track => track.stop());
        systemAudioStream = null;
    }
}

async function startLiveSpeechInput(stream) {
    const api = window.electronAPI;
    let started = false;
    try {
        await audioContext.audioWorklet.addModule(new URL('./js/local-asr-worklet.js', document.baseURI).href);
        const ready = await api.startLocalAsr(audioContext.sampleRate, true);
        if (!ready.success) throw new Error(ready.message);
        started = true;
        const capture = new AudioWorkletNode(audioContext, 'local-speech-capture', {
            channelCount: 1,
            channelCountMode: 'explicit'
        });
        const input = audioContext.createMediaStreamSource(stream);
        liveSpeechInput = { capture, input, lastWrite: null, finish: null };
        const session = liveSpeechInput;
        capture.port.onmessage = ({ data }) => {
            if (data === 'finished') {
                session.finish?.();
            } else {
                session.lastWrite = api.writeLocalAsr(data, true).catch(() => false);
            }
        };
        input.connect(capture);
        capture.connect(audioContext.destination);
    } catch (error) {
        await disconnectLiveSpeechInput();
        if (started) await api.cancelLocalAsr(true).catch(() => {});
        console.warn('Could not start live subtitles:', error.message);
    }
}

async function disconnectLiveSpeechInput() {
    const session = liveSpeechInput;
    if (!session) return;
    liveSpeechInput = null;
    session.capture.port.onmessage = null;
    session.input.disconnect();
    session.capture.disconnect();
    await window.electronAPI.cancelLocalAsr(true).catch(() => {});
}

async function finishLiveSpeechInput() {
    const session = liveSpeechInput;
    if (!session) return;
    liveSpeechInput = null;
    const flushed = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 250);
        session.finish = () => {
            clearTimeout(timeout);
            resolve(true);
        };
        session.capture.port.postMessage('finish');
    });
    session.capture.port.onmessage = null;
    session.input.disconnect();
    session.capture.disconnect();
    if (!flushed || (session.lastWrite && !(await session.lastWrite))) {
        await window.electronAPI.cancelLocalAsr(true).catch(() => {});
    }
}

function pauseRecording() {
    if (isFFmpegRecording) {
        // Linux ffmpeg 录制不支持暂停
        console.warn('Linux ffmpeg 录制不支持暂停功能');
        return;
    }
    
    if (mediaRecorder && isRecording && !isPaused) {
        mediaRecorder.pause();
        liveSpeechInput?.capture.port.postMessage('pause');
        isPaused = true;
        pauseStartTime = Date.now();
        stopTimer();
    }
}

function resumeRecording() {
    if (isFFmpegRecording) {
        // Linux ffmpeg 录制不支持恢复
        console.warn('Linux ffmpeg 录制不支持恢复功能');
        return;
    }
    
    if (mediaRecorder && isRecording && isPaused) {
        mediaRecorder.resume();
        liveSpeechInput?.capture.port.postMessage('resume');
        isPaused = false;
        recordingPausedTime += Date.now() - pauseStartTime;
        startTimer();
    }
}

async function stopRecording() {
    if (!isRecording) {
        return null;
    }
    
    // 先更新录音状态，让 UI 立即响应
    isRecording = false;
    isPaused = false;
    stopTimer();
    
    if (typeof stopTempSaveTimer === 'function') {
        stopTempSaveTimer();
    }
    
    if (isFFmpegRecording) {
        return await stopLinuxRecording();
    }

    if (!mediaRecorder) {
        return null;
    }

    if (pendingStopResolve || pendingStopReject) {
        throw new Error('Recording stop is already in progress');
    }

    return await new Promise((resolve, reject) => {
        pendingStopResolve = resolve;
        pendingStopReject = reject;

        try {
            mediaRecorder.stop();
        } catch (error) {
            pendingStopResolve = null;
            pendingStopReject = null;
            void disconnectLiveSpeechInput();
            reject(error);
        }
    });
}

async function stopLinuxRecording() {
    try {
        if (!linuxRecordingPaths) {
            throw new Error('录音路径未设置');
        }

        const stopResult = await window.electronAPI.stopFFmpegRecording();
        if (!stopResult.success) {
            throw new Error(stopResult.error || 'FFmpeg 未能正常结束录音');
        }

        const readResult = await window.electronAPI.readAudioFile(linuxRecordingPaths.output);
        if (!readResult.success) {
            throw new Error('读取音频文件失败: ' + readResult.error);
        }
        
        const buffer = readResult.data instanceof Uint8Array ? readResult.data : new Uint8Array(readResult.data);
        audioBlob = new Blob([buffer], { type: 'audio/webm' });
        
        return audioBlob;
        
    } finally {
        isFFmpegRecording = false;
        linuxRecordingPaths = null;
    }
}

function getRecordingState() {
    return {
        isRecording,
        isPaused,
        canPause: isRecording && !isFFmpegRecording && typeof mediaRecorder?.pause === 'function' && typeof mediaRecorder?.resume === 'function',
        duration: getRecordingDuration()
    };
}

function getRecordingDuration() {
    if (!isRecording) return '00:00:00';
    
    let duration;
    if (isPaused) {
        duration = pauseStartTime - recordingStartTime - recordingPausedTime;
    } else {
        duration = Date.now() - recordingStartTime - recordingPausedTime;
    }
    
    return formatRecordingTime(duration);
}

function formatRecordingTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function startTimer() {
    updateRecordingTime(getRecordingDuration());
    timerInterval = setInterval(async () => {
        const duration = getRecordingDuration();
        updateRecordingTime(duration);
        
        // 定期保存恢复数据
        if (typeof saveTempRecording === 'function' && isRecording && !isPaused) {
            const durationMs = Date.now() - recordingStartTime - recordingPausedTime;
            await saveTempRecording(null, durationMs);
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateRecordingTime(duration) {
    const timeElement = document.getElementById('recordingTime');
    if (timeElement) {
        timeElement.textContent = duration;
    }
}

function getAudioBlob() {
    return audioBlob;
}

// 设置音频文件准备好的回调
function setAudioFileReadyCallback(callback) {
    onAudioFileReady = callback;
}

function closeRecordingAudioContext() {
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
}

// 导出函数供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        getRecordingState,
        getAudioBlob
    };
}
