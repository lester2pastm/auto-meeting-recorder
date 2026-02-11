let mediaRecorder = null;
let isRecording = false;
let isPaused = false;
let recordingStartTime = null;
let pauseStartTime = null;
let recordingPausedTime = 0;
let timerInterval = null;
let audioBlob = null;

// 音频可视化相关变量
let audioContext = null;
let analyser = null;
let dataArray = null;
let source = null;
let animationId = null;
let systemAudioLevel = 0;    // FFmpeg 系统音频音量级别 (Linux)
let systemAudioLastUpdateTime = 0;  // FFmpeg 音量最后更新时间
const SYSTEM_AUDIO_TIMEOUT = 300;   // 超时阈值（毫秒），超过此时间开始衰减
const SYSTEM_AUDIO_DECAY_RATE = 0.2; // 衰减率，每次更新衰减的比例
const SYSTEM_AUDIO_SILENCE_THRESHOLD = 0.15; // 静音阈值，低于此值认为是静音

// 音频流相关变量
let microphoneStream = null;
let systemAudioStream = null;

// 平台检测
let currentPlatform = null;
let isLinuxPlatform = false;
let isFFmpegRecording = false;

// FFmpeg 录制相关变量（Linux）
let linuxRecordingPaths = null;

// Linux 混合录制模式变量
let linuxMicMediaRecorder = null;

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

async function startRecording() {
    try {
        if (window.DEBUG_AUDIO) {
            console.log('=== 开始录音 ===');
        }
        
        // 检测平台
        await detectPlatform();
        
        // 启动恢复跟踪
        if (typeof startRecoveryTracking === 'function') {
            await startRecoveryTracking(currentPlatform, isLinuxPlatform);
        }
        
        // Linux 平台使用 FFmpeg 录制
        if (isLinuxPlatform && window.electronAPI && window.electronAPI.checkFFmpeg) {
            const ffmpegCheck = await window.electronAPI.checkFFmpeg();
            if (ffmpegCheck.success && ffmpegCheck.available) {
                if (window.DEBUG_AUDIO) {
                    console.log('Linux 平台使用 FFmpeg 录制');
                }
                return await startLinuxRecording();
            } else {
                console.warn('Linux: 未检测到 ffmpeg，使用标准方式录制');
            }
        }
        
        // 标准录制方式（Windows/Mac）
        return await startStandardRecording();
    } catch (error) {
        console.error('录音启动失败:', error);
        stopAllStreams();
        throw error;
    }
}

// Linux 平台使用混合录制（麦克风用 MediaRecorder，系统音频用 FFmpeg）
async function startLinuxRecording() {
    try {
        if (window.DEBUG_AUDIO) {
            console.log('=== 开始 Linux 混合录音 ===');
        }
        
        // 获取音频目录
        const audioDirResult = await window.electronAPI.getAudioDirectory();
        if (!audioDirResult.success) {
            throw new Error('无法获取音频目录');
        }
        
        const timestamp = Date.now();
        const audioDir = audioDirResult.path;
        linuxRecordingPaths = {
            microphone: `${audioDir}/mic_${timestamp}.webm`,
            systemAudio: `${audioDir}/sys_${timestamp}.webm`,
            output: `${audioDir}/combined_${timestamp}.webm`
        };
        
        // 创建音频上下文
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 1. 获取麦克风音频（用于录制和可视化）
        microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        // 2. 设置录音状态（必须在初始化波形可视化之前）
        isRecording = true;
        isPaused = false;
        recordingStartTime = Date.now();
        recordingPausedTime = 0;
        startTimer();
        
        // 3. 获取系统音频用于可视化（通过 Web Audio API 捕获 monitor 设备）
        let visualizerStream = microphoneStream;
        try {
            // 尝试获取系统音频 - 在 Linux 上需要使用 desktopCapturer
            if (window.electronAPI && window.electronAPI.getDesktopCapturerSources) {
                const result = await window.electronAPI.getDesktopCapturerSources();
                if (result.success && result.sources.length > 0) {
                    const screenSource = result.sources.find(s => s.name === 'Entire screen') || result.sources[0];
                    
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
                    
                    // 停止视频轨道
                    systemAudioStream.getVideoTracks().forEach(track => track.stop());
                    const audioTrack = systemAudioStream.getAudioTracks()[0];
                    if (audioTrack) {
                        // 合并麦克风和系统音频用于可视化
                        visualizerStream = await combineAudioStreams(
                            microphoneStream, 
                            systemAudioStream, 
                            audioContext
                        );
                    } else {
                        systemAudioStream = null;
                    }
                }
            }
        } catch (sysAudioError) {
            // 回退到仅使用麦克风
            visualizerStream = microphoneStream;
            systemAudioStream = null;
        }
        
        // 4. 初始化波形可视化（使用合并后的音频流）
        await initWaveform(visualizerStream);
        
        // 4. 使用 MediaRecorder 录制麦克风
        linuxMicMediaRecorder = new MediaRecorder(microphoneStream, {
            mimeType: 'audio/webm'
        });
        
        linuxMicMediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                const arrayBuffer = await event.data.arrayBuffer();
                const chunkData = Array.from(new Uint8Array(arrayBuffer));
                
                if (typeof appendAudioChunk === 'function') {
                    await appendAudioChunk(chunkData);
                }
            }
        };
        
        linuxMicMediaRecorder.onstop = async () => {
            console.log('[Recorder] Microphone recording stopped, file saved');
        };
        
        linuxMicMediaRecorder.start(1000);
        
        // 4. 获取 PulseAudio 源列表并启动 FFmpeg 录制系统音频
        const sourcesResult = await window.electronAPI.getPulseAudioSources();
        
        let systemDevice = 'default';
        if (sourcesResult.success && sourcesResult.sources.length > 0) {
            // 查找系统音频 monitor（通常是输出设备的 monitor）
            const monitorSource = sourcesResult.sources.find(s => 
                s.name.includes('.monitor') || s.description.toLowerCase().includes('monitor')
            );
            if (monitorSource) {
                systemDevice = monitorSource.name.replace('.monitor', '');
            }
        }
        
        // 启动系统音频录制（FFmpeg）
        const sysResult = await window.electronAPI.startFFmpegSystemAudio(
            linuxRecordingPaths.systemAudio, 
            systemDevice
        );
        if (!sysResult.success) {
            throw new Error('启动系统音频录制失败: ' + sysResult.error);
        }
        
        // 设置 FFmpeg 录制标志（isRecording 已经在前面设置）
        isFFmpegRecording = true;
        
        return true;
        
    } catch (error) {
        console.error('Linux 录制启动失败:', error);
        await stopLinuxRecording();
        throw error;
    }
}

// 标准录制方式（Windows/Mac）
async function startStandardRecording() {
    if (window.DEBUG_AUDIO) {
        console.log('=== 开始标准录音 ===');
    }
    
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // 获取麦克风音频
    microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    });

    // 获取系统音频（通过 Electron desktopCapturer）
    let systemAudioStream;
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
        console.error('获取系统音频失败:', err.name, err.message);
        throw new Error('获取系统音频失败: ' + err.message);
    }

    const combinedStream = await combineAudioStreams(microphoneStream, systemAudioStream, audioContext);

    mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: 'audio/webm'
    });

    mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
            const arrayBuffer = await event.data.arrayBuffer();
            const chunkData = Array.from(new Uint8Array(arrayBuffer));
            
            if (typeof appendAudioChunk === 'function') {
                await appendAudioChunk(chunkData);
            }
        }
    };

    mediaRecorder.onstop = async () => {
        const meta = typeof getRecoveryMeta === 'function' ? getRecoveryMeta() : null;
        if (meta && meta.tempFile) {
            try {
                const readResult = await window.electronAPI.readAudioFile(meta.tempFile);
                if (readResult.success) {
                    const buffer = new Uint8Array(readResult.data);
                    audioBlob = new Blob([buffer], { type: 'audio/webm' });
                }
            } catch (error) {
                console.error('[Recorder] Error reading audio file:', error);
            }
        }
        
        stopAllStreams();
        stopWaveform();
        
        if (typeof clearRecoveryData === 'function') {
            await clearRecoveryData();
        }
    };
    
    mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder 错误:', event);
    };

    mediaRecorder.start(1000);
    
    // 先设置录音状态，再初始化波形可视化
    isRecording = true;
    isPaused = false;
    isFFmpegRecording = false;
    recordingStartTime = Date.now();
    recordingPausedTime = 0;
    startTimer();

    await initWaveform(combinedStream);
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

function pauseRecording() {
    if (isFFmpegRecording) {
        // Linux ffmpeg 录制不支持暂停
        console.warn('Linux ffmpeg 录制不支持暂停功能');
        return;
    }
    
    if (mediaRecorder && isRecording && !isPaused) {
        mediaRecorder.pause();
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
        isPaused = false;
        recordingPausedTime += Date.now() - pauseStartTime;
        startTimer();
        // 重启波形动画（先停止之前的动画）
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        drawWaveform();
    }
}

async function stopRecording() {
    return new Promise(async (resolve, reject) => {
        if (!isRecording) {
            resolve(null);
            return;
        }
        
        try {
            if (isFFmpegRecording) {
                // Linux ffmpeg 录制停止
                const result = await stopLinuxRecording();
                resolve(result);
            } else {
                // 标准录制停止
                if (mediaRecorder) {
                    const originalOnStop = mediaRecorder.onstop;
                    
                    mediaRecorder.onstop = async (event) => {
                        // 等待原始 onstop 完成（包括文件读取）
                        if (originalOnStop) {
                            await originalOnStop(event);
                        }
                        resolve(audioBlob);
                    };
                    
                    mediaRecorder.stop();
                } else {
                    resolve(null);
                }
            }
            
            isRecording = false;
            isPaused = false;
            stopTimer();
            
            // 停止恢复跟踪（但不删除临时文件，让 onstop 回调处理）
            if (typeof stopTempSaveTimer === 'function') {
                stopTempSaveTimer();
            }
            
            // 注意：正常停止时不立即清除恢复数据
            // 临时文件会在 onstop 回调中处理，或下次启动时清理
            
        } catch (error) {
            reject(error);
        }
    });
}

// 停止 Linux 混合录制并合并音频
async function stopLinuxRecording() {
    try {
        if (!linuxRecordingPaths) {
            throw new Error('录音路径未设置');
        }
        
        // 1. 停止麦克风录制（MediaRecorder）
        if (linuxMicMediaRecorder && linuxMicMediaRecorder.state !== 'inactive') {
            await new Promise((resolve) => {
                // 等待 onstop 回调完成
                const originalOnStop = linuxMicMediaRecorder.onstop;
                linuxMicMediaRecorder.onstop = async (event) => {
                    if (originalOnStop) {
                        await originalOnStop(event);
                    }
                    resolve();
                };
                linuxMicMediaRecorder.stop();
            });
        }
        
        // 2. 停止系统音频录制（FFmpeg）
        await window.electronAPI.stopFFmpegRecording();
        
        // 等待 FFmpeg 文件写入完成
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 3. 合并音频文件
        const mergeResult = await window.electronAPI.mergeAudioFiles(
            linuxRecordingPaths.microphone,
            linuxRecordingPaths.systemAudio,
            linuxRecordingPaths.output
        );
        
        if (!mergeResult.success) {
            throw new Error('合并音频失败: ' + mergeResult.error);
        }
        
        // 4. 读取合并后的文件为 Blob
        const readResult = await window.electronAPI.readAudioFile(mergeResult.outputPath);
        if (!readResult.success) {
            throw new Error('读取音频文件失败: ' + readResult.error);
        }
        
        const buffer = new Uint8Array(readResult.data);
        audioBlob = new Blob([buffer], { type: 'audio/webm' });
        
        // 5. 清理
        stopAllStreams();
        stopWaveform();
        linuxMicMediaRecorder = null;
        isFFmpegRecording = false;
        linuxRecordingPaths = null;
        
        if (typeof clearRecoveryData === 'function') {
            await clearRecoveryData();
        }
        
        return audioBlob;
        
    } catch (error) {
        console.error('停止 Linux 录制失败:', error);
        linuxMicMediaRecorder = null;
        isFFmpegRecording = false;
        linuxRecordingPaths = null;
        throw error;
    }
}

function getRecordingState() {
    return {
        isRecording,
        isPaused,
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
    
    return formatDuration(duration);
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function startTimer() {
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

// 初始化音频波形可视化
async function initWaveform(stream) {
    try {
        console.log('=== 初始化波形可视化 ===');
        
        // 验证传入的流
        if (!stream) {
            console.error('错误: 传入的音频流为空');
            return;
        }
        
        // 创建或恢复音频上下文（必须在用户交互后创建）
        if (!audioContext || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // 如果音频上下文被暂停，尝试恢复
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // 创建分析器
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        
        // 创建数据数组用于存储时域数据
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        // 连接音频源
        if (source) {
            try {
                source.disconnect();
            } catch (e) {}
        }
        
        source = audioContext.createMediaStreamSource(stream);
        
        // 连接到 analyser（用于波形可视化）
        source.connect(analyser);
        
        // 注意：不使用 ScriptProcessorNode，因为它在 Electron 中会导致渲染进程卡死
        // 改为使用 AnalyserNode.getByteTimeDomainData() 实时获取音频振幅

        // 在 Linux 平台设置 FFmpeg 音量监听
        if (isLinuxPlatform && window.electronAPI && window.electronAPI.onAudioLevel) {
            window.electronAPI.onAudioLevel((data) => {
                if (data.type === 'system') {
                    // 更新最后接收时间
                    systemAudioLastUpdateTime = Date.now();
                    
                    // 将 RMS dB 转换为 0-1 范围
                    // -70 dB (静音) -> 0
                    // -30 dB (轻声) -> 0.3
                    // -10 dB (正常) -> 0.7
                    // 0 dB (最大) -> 1
                    const rmsDb = data.rms || -70;
                    const minDb = -70;
                    const maxDb = -5;
                    let normalizedLevel = Math.max(0, Math.min(1, (rmsDb - minDb) / (maxDb - minDb)));
                    
                    // 如果音量低于静音阈值，直接设为0
                    if (normalizedLevel < SYSTEM_AUDIO_SILENCE_THRESHOLD) {
                        normalizedLevel = 0;
                    }
                    
                    systemAudioLevel = normalizedLevel;
                }
            });
        }

        // 开始绘制
        drawWaveform();
    } catch (error) {
        console.error('初始化波形可视化时出错:', error);
    }
}

// 更新音频条 - 根据实际音频数据
function drawWaveform() {
    const audioBars = document.getElementById('audioBars');
    if (!audioBars) {
        return;
    }

    const bars = audioBars.querySelectorAll('.audio-bar');
    if (bars.length === 0) {
        return;
    }

    // 用于平滑过渡的历史数据
    const smoothedData = new Array(bars.length).fill(4);
    const smoothingFactor = 0.15;
    let frameCount = 0;
    let hasDetectedAudio = false;

    function update() {
        if (!isRecording || isPaused) {
            return;
        }

        animationId = requestAnimationFrame(update);

        // 从 AnalyserNode 获取麦克风振幅（替代 ScriptProcessorNode，避免 Electron 黑屏）
        let micAmplitude = 0;
        if (analyser && dataArray) {
            analyser.getByteTimeDomainData(dataArray);
            
            // 计算 RMS (均方根) 振幅
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                // 将 0-255 映射到 -1 到 1
                const value = (dataArray[i] - 128) / 128;
                sum += value * value;
            }
            const rms = Math.sqrt(sum / dataArray.length);
            micAmplitude = Math.min(rms * 4, 1); // 放大4倍使波形更明显
        }
        
        // 在 Linux 平台，也获取 FFmpeg 系统音频音量
        let sysAmplitude = 0;
        if (isLinuxPlatform) {
            const now = Date.now();
            const timeSinceLastUpdate = now - systemAudioLastUpdateTime;
            
            // 如果超过 300ms 没有收到新数据，开始衰减
            if (timeSinceLastUpdate > SYSTEM_AUDIO_TIMEOUT && systemAudioLevel > 0) {
                // 每次衰减一定比例，让波形平滑减小
                systemAudioLevel = systemAudioLevel * (1 - SYSTEM_AUDIO_DECAY_RATE);
                if (systemAudioLevel < 0.01) {
                    systemAudioLevel = 0;
                }
            }
            sysAmplitude = systemAudioLevel || 0;
        }
        
        // 合并两个声源的振幅（取最大值）
        const amplitude = Math.max(micAmplitude, sysAmplitude);
        
        // 每300帧（约5秒）输出一次调试信息，避免性能问题
        frameCount++;
        if (frameCount % 600 === 0) {
            if (amplitude > 0.01 && !hasDetectedAudio) {
                hasDetectedAudio = true;
                console.log('✓ 检测到音频输入! 麦克风:', micAmplitude.toFixed(3), '系统:', sysAmplitude.toFixed(3));
            }
            // 仅在调试模式下输出详细日志
            if (window.DEBUG_AUDIO) {
                if (isLinuxPlatform) {
                    const now = Date.now();
                    const timeout = now - systemAudioLastUpdateTime;
                    console.log(`音频振幅 - 麦克风: ${micAmplitude.toFixed(3)} 系统: ${sysAmplitude.toFixed(3)} (${timeout}ms)`, 
                                hasDetectedAudio ? '[已检测到音频]' : '[未检测到音频]');
                } else {
                    console.log('音频振幅:', amplitude.toFixed(3), hasDetectedAudio ? '[已检测到音频]' : '[未检测到音频]');
                }
            }
        }

        // 生成波形效果 - 使用振幅值创建波动
        const barCount = bars.length;
        const time = Date.now() / 200; // 时间因子用于创建波动动画
        
        for (let i = 0; i < barCount; i++) {
            // 基于位置和振幅创建波形
            const position = i / barCount;
            const waveOffset = Math.sin(time + position * Math.PI * 4) * 0.3;
            
            // 结合麦克风和系统音频振幅
            // Linux: 合并两个声源，非 Linux: 只使用麦克风
            let combinedAmplitude;
            if (isLinuxPlatform) {
                // 在 Linux 上，根据波形条位置混合两个声源
                // 左侧条主要显示麦克风，右侧条主要显示系统音频
                const micWeight = 1 - position * 0.5;  // 左侧权重高
                const sysWeight = 0.5 + position * 0.5; // 右侧权重高
                combinedAmplitude = micAmplitude * micWeight + sysAmplitude * sysWeight;
            } else {
                combinedAmplitude = micAmplitude;
            }
            
            // 结合音频振幅和波形动画
            let normalizedValue = combinedAmplitude * (0.7 + waveOffset * 0.3);
            
            // 确保有最小波动（即使没有音频输入）
            normalizedValue = Math.max(normalizedValue, 0.05);
            
            // 计算目标高度 (最小4px，最大48px)
            const targetHeight = 4 + normalizedValue * 44;

            // 平滑过渡
            smoothedData[i] = smoothedData[i] * (1 - smoothingFactor) + targetHeight * smoothingFactor;

            // 应用高度
            bars[i].style.height = `${smoothedData[i]}px`;

            // 根据音量调整透明度
            const opacity = 0.3 + normalizedValue * 0.7;
            bars[i].style.opacity = opacity;
        }
    }

    update();
}

// 停止波形可视化
function stopWaveform() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    // 重置音频级别变量
    systemAudioLevel = 0;
    systemAudioLastUpdateTime = 0;

    // 移除 FFmpeg 监听器
    if (window.electronAPI && window.electronAPI.removeAudioLevelListener) {
        window.electronAPI.removeAudioLevelListener();
    }

    // 重置音频条
    const audioBars = document.getElementById('audioBars');
    if (audioBars) {
        const bars = audioBars.querySelectorAll('.audio-bar');
        bars.forEach(bar => {
            bar.style.height = '4px';
            bar.style.opacity = '0.4';
        });
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
