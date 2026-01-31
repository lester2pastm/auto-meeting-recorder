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

        // 获取系统音频（通过 Electron desktopCapturer）
        console.log('正在通过 Electron 获取系统音频...');
        
        let systemAudioStream;
        try {
            // 检查是否在 Electron 环境中
            if (window.electronAPI && window.electronAPI.getDesktopCapturerSources) {
                // Electron 环境：使用 desktopCapturer
                console.log('检测到 Electron 环境，使用 desktopCapturer');
                const result = await window.electronAPI.getDesktopCapturerSources();
                
                if (!result.success) {
                    throw new Error('获取屏幕分享源失败: ' + result.error);
                }
                
                const sources = result.sources;
                console.log('获取到屏幕分享源数量:', sources.length);
                
                if (sources.length === 0) {
                    throw new Error('没有可用的屏幕分享源');
                }
                
                // 选择第一个屏幕源（通常是整个屏幕）
                const screenSource = sources.find(s => s.name === 'Entire screen') || sources[0];
                console.log('选择的屏幕源:', screenSource.name, 'ID:', screenSource.id);
                
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
                
                console.log('系统音频流获取成功（Electron 方式）');
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
            console.error('获取系统音频失败:', err.name, err.message);
            throw new Error('获取系统音频失败: ' + err.message);
        }
        
        console.log('系统音频流状态:', {
            active: systemAudioStream.active,
            audioTracks: systemAudioStream.getAudioTracks().length
        });

        // 测试系统音频流是否活跃
        console.log('系统音频流状态:', {
            active: systemAudioStream.active,
            audioTracks: systemAudioStream.getAudioTracks().length
        });

        const combinedStream = await combineAudioStreams(microphoneStream, systemAudioStream, audioContext);
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
    }
}

function stopRecording() {
    return new Promise((resolve, reject) => {
        if (mediaRecorder && isRecording) {
            const originalOnStop = mediaRecorder.onstop;
            
            mediaRecorder.onstop = (event) => {
                if (originalOnStop) {
                    originalOnStop(event);
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
