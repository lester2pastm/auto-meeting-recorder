let mediaRecorder = null;
let audioChunks = [];
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

// 音频流相关变量
let microphoneStream = null;
let systemAudioStream = null;
let destinationStream = null;

// ffmpeg 相关变量
let usingFFmpeg = false;
let ffmpegSystemAudioPath = null;
let ffmpegMicAudioPath = null;

// 辅助函数：查找系统音频设备
function findSystemAudioDevice(devices) {
    // 首先尝试精确匹配 Computer-sound
    let device = devices.find(d => 
        d.kind === 'audioinput' && d.label === 'Computer-sound'
    );
    
    if (device) {
        console.log('找到精确匹配的 Computer-sound 设备');
        return device;
    }
    
    // 尝试包含匹配
    device = devices.find(d => 
        d.kind === 'audioinput' && (
            d.label.includes('Computer-sound') || 
            d.label.includes('computer') ||
            d.label.includes('Computer')
        )
    );
    
    if (device) {
        console.log('找到包含匹配的 Computer-sound 设备:', device.label);
        return device;
    }
    
    // 尝试匹配 remap 或 monitor 源
    device = devices.find(d => 
        d.kind === 'audioinput' && (
            d.label.toLowerCase().includes('remap') ||
            d.label.toLowerCase().includes('monitor')
        )
    );
    
    if (device) {
        console.log('找到 remap/monitor 设备:', device.label);
        return device;
    }
    
    return null;
}

// 辅助函数：带重试机制的系统音频流获取
async function getSystemAudioStreamWithRetry(device, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`尝试获取系统音频流 (${attempt}/${maxRetries})...`);
        
        try {
            // 尝试使用 exact deviceId
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: { exact: device.deviceId },
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
            
            console.log(`第 ${attempt} 次尝试成功获取系统音频流`);
            return stream;
        } catch (error) {
            lastError = error;
            console.warn(`第 ${attempt} 次尝试失败:`, {
                name: error.name,
                message: error.message,
                constraint: error.constraint
            });
            
            // 如果是 NotReadableError，等待后重试
            if (error.name === 'NotReadableError' && attempt < maxRetries) {
                const waitTime = attempt * 2000; // 递增等待时间: 2s, 4s
                console.log(`等待 ${waitTime}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                // 重新枚举设备，deviceId 可能已改变
                console.log('重新枚举设备...');
                const newDevices = await navigator.mediaDevices.enumerateDevices();
                const newDevice = findSystemAudioDevice(newDevices);
                
                if (newDevice && newDevice.deviceId !== device.deviceId) {
                    console.log('设备ID已更新:', {
                        oldId: device.deviceId,
                        newId: newDevice.deviceId
                    });
                    device = newDevice;
                }
            } else if (attempt === maxRetries) {
                // 最后一次尝试：使用 ideal 而不是 exact
                console.log('使用 ideal constraint 进行最后一次尝试...');
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            deviceId: { ideal: device.deviceId },
                            echoCancellation: false,
                            noiseSuppression: false,
                            autoGainControl: false
                        }
                    });
                    console.log('使用 ideal constraint 成功获取系统音频流');
                    return stream;
                } catch (finalError) {
                    console.error('最后一次尝试也失败:', finalError);
                    throw finalError;
                }
            }
        }
    }
    
    throw lastError || new Error('无法获取系统音频流');
}

async function startRecording() {
    try {
        console.log('=== 开始录音调试 ===');
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('AudioContext 创建成功, sampleRate:', audioContext.sampleRate);

        // 获取麦克风音频
        console.log('正在获取麦克风音频...');
        microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        console.log('麦克风音频获取成功');
        console.log('麦克风轨道数:', microphoneStream.getAudioTracks().length);
        microphoneStream.getAudioTracks().forEach((track, i) => {
            console.log(`  麦克风轨道[${i}]:`, {
                label: track.label,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState
            });
        });

        // 关键步骤：触发一次设备权限请求，确保设备标签完全加载
        // 这是 WebRTC 的已知特性 - 只有在用户授权后，设备标签才会显示
        console.log('触发设备权限请求以加载设备标签...');
        await navigator.mediaDevices.enumerateDevices();
        console.log('设备标签加载完成');

        // 获取系统音频
        console.log('正在获取系统音频...');
        
        // 诊断：对比 PulseAudio 设备和 Chromium 设备
        if (typeof process !== 'undefined' && process.platform === 'linux' && window.electronAPI) {
            console.log('=== 开始诊断：对比 PulseAudio 和 Chromium 设备 ===');
            
            try {
                // 获取 PulseAudio 设备列表
                const pulseAudioResult = await window.electronAPI.getPulseAudioSourcesDetailed();
                if (pulseAudioResult.success) {
                    console.log('PulseAudio 源列表:');
                    pulseAudioResult.sources.forEach((source, i) => {
                        console.log(`  PulseAudio[${i}]:`, {
                            name: source.name,
                            description: source.description,
                            device: source.device
                        });
                    });
                }
                
                // 获取 Chromium 设备列表
                const chromiumDevices = await navigator.mediaDevices.enumerateDevices();
                console.log('Chromium 音频输入设备列表:');
                chromiumDevices.forEach((device, i) => {
                    if (device.kind === 'audioinput') {
                        console.log(`  Chromium[${i}]:`, {
                            label: device.label,
                            deviceId: device.deviceId,
                            groupId: device.groupId
                        });
                    }
                });
                
                console.log('=== 诊断完成 ===');
            } catch (error) {
                console.error('诊断失败:', error);
            }
        }
        
        systemAudioStream = null;
        let systemAudioFailed = false;
        try {
            // 检测平台
            if (typeof process !== 'undefined' && process.platform === 'linux' && window.electronAPI) {
                // Linux 平台：先尝试 PulseAudio remap-source，失败则回退到 ffmpeg
                console.log('检测到 Linux 平台，尝试 PulseAudio remap-source');
                
                // 枚举所有音频设备
                const devices = await navigator.mediaDevices.enumerateDevices();
                console.log('=== 音频设备详细列表 ===');
                devices.forEach((d, i) => {
                    console.log(`设备[${i}]:`, {
                        kind: d.kind,
                        label: d.label,
                        deviceId: d.deviceId,
                        groupId: d.groupId
                    });
                });
                console.log('=== 音频设备列表结束 ===');
                
                // 查找 Computer-sound 设备
                let systemAudioDevice = findSystemAudioDevice(devices);
                
                console.log('查找结果 - systemAudioDevice:', systemAudioDevice ? {
                    label: systemAudioDevice.label,
                    deviceId: systemAudioDevice.deviceId
                } : '未找到');
                
                if (!systemAudioDevice) {
                    console.warn('未找到 Computer-sound 设备，尝试重新设置...');
                    
                    // 尝试重新设置 remap-source
                    const setupResult = await window.electronAPI.setupPulseAudioRemapSource();
                    
                    if (!setupResult.success) {
                        console.error('设置系统音频失败:', setupResult.error);
                        throw new Error('设置系统音频失败: ' + setupResult.error);
                    }
                    
                    console.log('remap-source 设置成功，等待设备注册...');
                    // 等待更长时间，确保设备被 Chromium 完全识别
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    // 重新枚举设备
                    const newDevices = await navigator.mediaDevices.enumerateDevices();
                    console.log('=== 重新枚举设备列表 ===');
                    newDevices.forEach((d, i) => {
                        console.log(`设备[${i}]:`, {
                            kind: d.kind,
                            label: d.label,
                            deviceId: d.deviceId
                        });
                    });
                    console.log('=== 重新枚举设备列表结束 ===');
                    
                    systemAudioDevice = findSystemAudioDevice(newDevices);
                    
                    if (!systemAudioDevice) {
                        console.error('=== 设备查找失败 ===');
                        console.log('重新枚举后的设备列表:');
                        newDevices.forEach((d, i) => {
                            console.log(`设备[${i}]:`, {
                                kind: d.kind,
                                label: d.label,
                                deviceId: d.deviceId
                            });
                        });
                        throw new Error('无法找到系统音频设备');
                    }
                }
                
                console.log('=== 准备获取系统音频流 ===');
                console.log('使用设备:', {
                    label: systemAudioDevice.label,
                    deviceId: systemAudioDevice.deviceId
                });
                
                // 使用重试机制获取系统音频流
                systemAudioStream = await getSystemAudioStreamWithRetry(systemAudioDevice);
                
                console.log('系统音频流获取成功（Linux PulseAudio 方式）');
            } else if (window.electronAPI && window.electronAPI.getDesktopCapturerSources) {
                console.log('检测到 Electron 环境，使用 getDisplayMedia 获取系统音频');
                console.log('提示: 请在弹出的对话框中选择"整个屏幕"，并勾选"分享音频"选项');
                
                const displayStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                    }
                });
                
                console.log('屏幕分享获取成功');
                
                const systemAudioTrack = displayStream.getAudioTracks()[0];
                if (!systemAudioTrack) {
                    console.error('错误: 未获取到系统音频轨道');
                    displayStream.getTracks().forEach(track => track.stop());
                    throw new Error('未获取到系统音频，请确保选择了"分享音频"选项');
                }
                
                const systemAudioVideoTrack = displayStream.getVideoTracks()[0];
                if (systemAudioVideoTrack) {
                    systemAudioVideoTrack.stop();
                }
                
                systemAudioStream = new MediaStream([systemAudioTrack]);
                console.log('系统音频流创建成功（Electron getDisplayMedia 方式）');
            } else {
                // 浏览器环境：使用 getDisplayMedia
                console.log('检测到浏览器环境，使用 getDisplayMedia');
                console.log('提示: 请在弹出的对话框中选择"整个屏幕"或"标签页"，并勾选"分享音频"选项');
                
                const displayStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                    }
                });
                
                console.log('屏幕分享获取成功');
                
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
                console.log('系统音频流创建成功（浏览器方式）');
            }
        } catch (err) {
            console.warn('获取系统音频失败:', err.name, err.message);
            
            // Linux 平台：尝试回退到 ffmpeg 方案
            if (typeof process !== 'undefined' && process.platform === 'linux' && window.electronAPI) {
                console.log('=== 尝试回退到 ffmpeg 方案 ===');
                
                try {
                    // 检查 ffmpeg 是否可用
                    const ffmpegCheck = await window.electronAPI.checkFFmpeg();
                    
                    if (ffmpegCheck.available) {
                        console.log('ffmpeg 可用，使用 ffmpeg 录制系统音频');
                        usingFFmpeg = true;
                        
                        // 生成临时文件路径
                        const timestamp = Date.now();
                        ffmpegSystemAudioPath = `ffmpeg_system_${timestamp}.webm`;
                        ffmpegMicAudioPath = `ffmpeg_mic_${timestamp}.webm`;
                        
                        // 启动 ffmpeg 录制系统音频
                        const startResult = await window.electronAPI.startFFmpegAudioCapture(ffmpegSystemAudioPath);
                        
                        if (startResult.success) {
                            console.log('ffmpeg 系统音频录制已启动');
                            systemAudioFailed = false;
                        } else {
                            console.error('ffmpeg 系统音频录制启动失败:', startResult.error);
                            systemAudioFailed = true;
                            usingFFmpeg = false;
                        }
                    } else {
                        console.warn('ffmpeg 不可用:', ffmpegCheck.reason);
                        systemAudioFailed = true;
                        
                        // 显示 ffmpeg 安装提示
                        if (typeof showFFmpegErrorDialog === 'function') {
                            showFFmpegErrorDialog(ffmpegCheck.reason);
                        }
                    }
                } catch (ffmpegError) {
                    console.error('ffmpeg 回退方案失败:', ffmpegError);
                    systemAudioFailed = true;
                    usingFFmpeg = false;
                }
            } else {
                systemAudioFailed = true;
            }
            
            console.log('将仅录制麦克风音频');
        }
        
        if (systemAudioStream) {
            console.log('系统音频流状态:', {
                active: systemAudioStream.active,
                audioTracks: systemAudioStream.getAudioTracks().length
            });
        }

        const combinedStream = await combineAudioStreams(microphoneStream, systemAudioStream, audioContext, systemAudioFailed);
        console.log('音频流合并成功');

        mediaRecorder = new MediaRecorder(combinedStream, {
            mimeType: 'audio/webm'
        });
        console.log('MediaRecorder 创建成功, mimeType:', mediaRecorder.mimeType);

        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            console.log('MediaRecorder ondataavailable, 数据大小:', event.data.size);
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            console.log('MediaRecorder onstop, 总数据块数:', audioChunks.length);
            audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            console.log('音频 Blob 创建成功, 大小:', audioBlob.size);
            stopAllStreams();
            stopWaveform();
        };
        
        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder 错误:', event);
        };

        mediaRecorder.start(1000);
        console.log('MediaRecorder 已开始录制');
        
        isRecording = true;
        isPaused = false;
        recordingStartTime = Date.now();
        recordingPausedTime = 0;
        startTimer();

        initWaveform(combinedStream);
        console.log('=== 录音启动完成 ===');

        return true;
    } catch (error) {
        console.error('Error starting recording:', error);
        stopAllStreams();
        throw error;
    }
}

async function combineAudioStreams(micStream, sysStream, ctx, systemAudioFailed) {
    const micSource = ctx.createMediaStreamSource(micStream);
    const micGain = ctx.createGain();
    micSource.connect(micGain);

    const destination = ctx.createMediaStreamDestination();
    micGain.connect(destination);

    // 如果系统音频获取成功，则合并系统音频
    if (!systemAudioFailed && sysStream) {
        const sysSource = ctx.createMediaStreamSource(sysStream);
        const sysGain = ctx.createGain();
        sysSource.connect(sysGain);
        sysGain.connect(destination);
        console.log('已合并麦克风音频和系统音频');
    } else {
        console.log('仅录制麦克风音频（系统音频不可用）');
    }

    return destination.stream;
}

function stopAllStreams() {
    console.log('=== 停止所有音频流 ===');
    
    if (microphoneStream) {
        console.log('停止麦克风流, 轨道数:', microphoneStream.getTracks().length);
        microphoneStream.getTracks().forEach((track, i) => {
            console.log(`  停止麦克风轨道[${i}]:`, track.label);
            track.stop();
        });
        microphoneStream = null;
    }
    
    if (systemAudioStream) {
        console.log('停止系统音频流, 轨道数:', systemAudioStream.getTracks().length);
        systemAudioStream.getTracks().forEach((track, i) => {
            console.log(`  停止系统音频轨道[${i}]:`, track.label);
            track.stop();
        });
        systemAudioStream = null;
    }
    
    if (destinationStream) {
        console.log('停止目标流, 轨道数:', destinationStream.getTracks().length);
        destinationStream.getTracks().forEach((track, i) => {
            console.log(`  停止目标轨道[${i}]:`, track.label);
            track.stop();
        });
        destinationStream = null;
    }
    
    console.log('=== 所有音频流已停止 ===');
}

function pauseRecording() {
    if (mediaRecorder && isRecording && !isPaused) {
        mediaRecorder.pause();
        isPaused = true;
        pauseStartTime = Date.now();
        stopTimer();
    }
}

function resumeRecording() {
    if (mediaRecorder && isRecording && isPaused) {
        mediaRecorder.resume();
        isPaused = false;
        recordingPausedTime += Date.now() - pauseStartTime;
        startTimer();
        // 重启波形动画
        drawWaveform();
    }
}

async function stopRecording() {
    return new Promise(async (resolve, reject) => {
        if (mediaRecorder && isRecording) {
            const originalOnStop = mediaRecorder.onstop;
            
            mediaRecorder.onstop = async (event) => {
                if (originalOnStop) {
                    originalOnStop(event);
                }
                
                // 如果使用 ffmpeg，需要合并音频
                if (usingFFmpeg && window.electronAPI) {
                    console.log('=== 使用 ffmpeg，开始合并音频 ===');
                    
                    try {
                        // 停止 ffmpeg 录制
                        const stopResult = await window.electronAPI.stopFFmpegAudioCapture();
                        
                        if (stopResult.success && stopResult.filePath) {
                            console.log('ffmpeg 系统音频录制已停止:', stopResult.filePath);
                            
                            // 保存麦克风音频到临时文件
                            const micAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                            const micAudioBuffer = await micAudioBlob.arrayBuffer();
                            const micAudioData = Array.from(new Uint8Array(micAudioBuffer));
                            
                            const saveResult = await window.electronAPI.saveAudio({
                                blob: micAudioData,
                                filename: ffmpegMicAudioPath
                            });
                            
                            if (saveResult.success) {
                                console.log('麦克风音频已保存:', saveResult.filePath);
                                
                                // 合并音频文件
                                const timestamp = Date.now();
                                const mergedFilename = `merged_${timestamp}.webm`;
                                const mergeResult = await window.electronAPI.mergeAudioFiles(
                                    stopResult.filePath,
                                    saveResult.filePath,
                                    mergedFilename
                                );
                                
                                if (mergeResult.success) {
                                    console.log('音频合并成功:', mergeResult.filePath);
                                    
                                    // 读取合并后的音频文件
                                    const getAudioResult = await window.electronAPI.getAudio(mergedFilename);
                                    
                                    if (getAudioResult.success) {
                                        const mergedBuffer = new Uint8Array(getAudioResult.data);
                                        audioBlob = new Blob([mergedBuffer], { type: 'audio/webm' });
                                        console.log('合并后的音频 Blob 创建成功, 大小:', audioBlob.size);
                                        
                                        // 清理临时文件
                                        await window.electronAPI.deleteAudio(ffmpegSystemAudioPath);
                                        await window.electronAPI.deleteAudio(ffmpegMicAudioPath);
                                        await window.electronAPI.deleteAudio(mergedFilename);
                                        
                                        console.log('临时文件已清理');
                                    } else {
                                        console.error('读取合并后的音频失败:', getAudioResult.error);
                                        // 回退到仅使用麦克风音频
                                    }
                                } else {
                                    console.error('合并音频失败:', mergeResult.error);
                                    // 回退到仅使用麦克风音频
                                }
                            } else {
                                console.error('保存麦克风音频失败:', saveResult.error);
                                // 回退到仅使用麦克风音频
                            }
                        } else {
                            console.error('停止 ffmpeg 录制失败:', stopResult.error);
                            // 回退到仅使用麦克风音频
                        }
                    } catch (ffmpegError) {
                        console.error('ffmpeg 音频处理失败:', ffmpegError);
                        // 回退到仅使用麦克风音频
                    }
                    
                    // 重置 ffmpeg 标志
                    usingFFmpeg = false;
                    ffmpegSystemAudioPath = null;
                    ffmpegMicAudioPath = null;
                }
                
                resolve(audioBlob);
            };
            
            mediaRecorder.stop();
            isRecording = false;
            isPaused = false;
            stopTimer();
        } else {
            resolve(null);
        }
    });
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
    timerInterval = setInterval(() => {
        const duration = getRecordingDuration();
        updateRecordingTime(duration);
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
function initWaveform(stream) {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        drawWaveform();
    } catch (error) {
        console.error('Error initializing waveform:', error);
    }
}

// 更新音频条 - 根据实际音频数据
function drawWaveform() {
    const audioBars = document.getElementById('audioBars');
    if (!audioBars) return;

    const bars = audioBars.querySelectorAll('.audio-bar');
    if (bars.length === 0) return;

    // 用于平滑过渡的历史数据
    const smoothedData = new Array(bars.length).fill(4);
    const smoothingFactor = 0.3;

    function update() {
        if (!isRecording || isPaused) return;

        animationId = requestAnimationFrame(update);

        analyser.getByteFrequencyData(dataArray);

        // 将频率数据映射到音频条
        const barCount = bars.length;
        const dataLength = dataArray.length;
        const step = Math.floor(dataLength / barCount);

        for (let i = 0; i < barCount; i++) {
            // 获取对应频率范围的平均值
            let sum = 0;
            const startIdx = i * step;
            const endIdx = Math.min(startIdx + step, dataLength);
            const count = endIdx - startIdx;

            for (let j = startIdx; j < endIdx; j++) {
                sum += dataArray[j];
            }

            const average = count > 0 ? sum / count : 0;

            // 归一化到 0-1 范围
            const normalizedValue = average / 255;

            // 计算目标高度 (最小4px，最大36px)
            const targetHeight = 4 + normalizedValue * 32;

            // 平滑过渡
            smoothedData[i] = smoothedData[i] * (1 - smoothingFactor) + targetHeight * smoothingFactor;

            // 应用高度
            bars[i].style.height = `${smoothedData[i]}px`;

            // 根据音量调整透明度
            const opacity = 0.4 + normalizedValue * 0.6;
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
