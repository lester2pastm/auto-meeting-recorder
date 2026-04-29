// 带超时的 fetch 封装函数（用于大文件上传）
// 默认 10 分钟超时，支持音频转写等大文件操作
async function fetchWithTimeout(url, options, timeout = 600000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`请求超时（${timeout / 1000}秒）`);
        }
        throw error;
    }
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error, fallback = '请求失败，请稍后重试') {
    if (typeof error === 'string' && error.trim()) {
        return error;
    }

    if (error && typeof error.message === 'string' && error.message.trim()) {
        return error.message;
    }

    return fallback;
}

function isTimeoutErrorMessage(error) {
    return getErrorMessage(error, '').includes('请求超时');
}

function isNetworkErrorLike(error) {
    const errorMessage = getErrorMessage(error, '');

    return !!(error && (
        error.name === 'TypeError' ||
        errorMessage === 'Failed to fetch' ||
        errorMessage.includes('net::ERR_')
    ));
}

function getSummaryRequestTimeout(transcript) {
    const baseTimeout = 15000;
    const maxTimeout = 120000;
    const transcriptLength = typeof transcript === 'string' ? transcript.trim().length : 0;

    if (transcriptLength === 0) {
        return baseTimeout;
    }

    // Give longer transcripts more time to complete without letting requests hang indefinitely.
    const extraTimeout = Math.ceil(transcriptLength / 1000) * 5000;
    return Math.min(baseTimeout + extraTimeout, maxTimeout);
}

function getMeetingTitleRequestTimeout(summary) {
    const baseTimeout = 10000;
    const maxTimeout = 30000;
    const summaryLength = typeof summary === 'string' ? summary.trim().length : 0;

    if (summaryLength === 0) {
        return baseTimeout;
    }

    const extraTimeout = Math.ceil(summaryLength / 500) * 2000;
    return Math.min(baseTimeout + extraTimeout, maxTimeout);
}

function isRetryableSummaryStatus(status) {
    return status === 429 || status >= 500;
}

function isRetryableSummaryErrorLegacy(error) {
    if (!error) {
        return false;
    }

    if (typeof error.status === 'number') {
        return isRetryableSummaryStatus(error.status);
    }

    return error.name === 'AbortError' ||
        error.name === 'TypeError' ||
        error.message === 'Failed to fetch' ||
        error.message.includes('net::ERR_') ||
        error.message.includes('请求超时');
}

function getI18nValue(key, replacements = {}) {
    let i18nInstance = null;

    if (typeof globalThis !== 'undefined' && globalThis.i18n && typeof globalThis.i18n.get === 'function') {
        i18nInstance = globalThis.i18n;
    } else if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.get === 'function') {
        i18nInstance = window.i18n;
    } else if (typeof require === 'function') {
        try {
            i18nInstance = require('./i18n');
        } catch (error) {
            i18nInstance = null;
        }
    }

    let value = i18nInstance && typeof i18nInstance.get === 'function'
        ? i18nInstance.get(key)
        : key;

    Object.keys(replacements).forEach((placeholder) => {
        value = value.replace(`{${placeholder}}`, replacements[placeholder]);
    });

    return value;
}

function getSummaryRetryProgressLabelLegacy(error) {
    if (!error || !error.message) {
        return getI18nValue('summaryRetryGenericLabel');
    }

    if (error.message.includes('请求超时')) {
        return getI18nValue('summaryRetryTimeoutLabel');
    }

    if (error.message === 'Failed to fetch' ||
        error.message.includes('net::ERR_') ||
        error.name === 'TypeError') {
        return getI18nValue('summaryRetryNetworkLabel');
    }

    return getI18nValue('summaryRetryGenericLabel');
}

function getSummaryRetryExhaustedMessage(error) {
    const progressLabel = getSummaryRetryProgressLabel(error);

    if (progressLabel === getI18nValue('summaryRetryTimeoutLabel')) {
        return getI18nValue('summaryRetryExhaustedTimeout');
    }

    if (progressLabel === getI18nValue('summaryRetryNetworkLabel')) {
        return getI18nValue('summaryRetryExhaustedNetwork');
    }

    return getI18nValue('summaryRetryExhaustedGeneric');
}

function getTranscriptionRetryProgressLabelLegacy(error) {
    if (!error || !error.message) {
        return getI18nValue('transcriptionRetryGenericLabel');
    }

    if (error.message.includes('请求超时')) {
        return getI18nValue('transcriptionRetryTimeoutLabel');
    }

    if (error.message === 'Failed to fetch' ||
        error.message.includes('网络连接失败') ||
        error.message.includes('net::ERR_') ||
        error.name === 'TypeError') {
        return getI18nValue('transcriptionRetryNetworkLabel');
    }

    return getI18nValue('transcriptionRetryGenericLabel');
}

function getTranscriptionRetryProgressMessage(error, attempt, maxAttempts) {
    return getI18nValue('transcriptionRetryProgressTemplate', {
        label: getTranscriptionRetryProgressLabel(error),
        attempt: String(attempt),
        maxAttempts: String(maxAttempts)
    });
}

function getTranscriptionRetryExhaustedMessage(error) {
    const progressLabel = getTranscriptionRetryProgressLabel(error);

    if (progressLabel === getI18nValue('transcriptionRetryTimeoutLabel')) {
        return getI18nValue('transcriptionRetryExhaustedTimeout');
    }

    if (progressLabel === getI18nValue('transcriptionRetryNetworkLabel')) {
        return getI18nValue('transcriptionRetryExhaustedNetwork');
    }

    return getI18nValue('transcriptionRetryExhaustedGeneric');
}

function isRetryableSummaryError(error) {
    if (!error) {
        return false;
    }

    if (typeof error.status === 'number') {
        return isRetryableSummaryStatus(error.status);
    }

    return error.name === 'AbortError' ||
        isNetworkErrorLike(error) ||
        isTimeoutErrorMessage(error);
}

function getSummaryRetryProgressLabel(error) {
    if (!error) {
        return getI18nValue('summaryRetryGenericLabel');
    }

    if (isTimeoutErrorMessage(error)) {
        return getI18nValue('summaryRetryTimeoutLabel');
    }

    if (isNetworkErrorLike(error)) {
        return getI18nValue('summaryRetryNetworkLabel');
    }

    return getI18nValue('summaryRetryGenericLabel');
}

function getTranscriptionRetryProgressLabel(error) {
    if (!error) {
        return getI18nValue('transcriptionRetryGenericLabel');
    }

    if (isTimeoutErrorMessage(error)) {
        return getI18nValue('transcriptionRetryTimeoutLabel');
    }

    if (isNetworkErrorLike(error) ||
        getErrorMessage(error, '').includes('网络连接失败')) {
        return getI18nValue('transcriptionRetryNetworkLabel');
    }

    return getI18nValue('transcriptionRetryGenericLabel');
}

async function parseSummaryError(response) {
    try {
        const errorData = await response.json();
        return errorData.error?.message || errorData.message || `生成失败: ${response.status}`;
    } catch (error) {
        return `生成失败: ${response.status}`;
    }
}

async function testSttApi(apiUrl, apiKey, model = 'whisper-1') {
    try {
        const formData = new FormData();
        formData.append('file', new Blob(['test'], { type: 'audio/webm' }), 'test.webm');
        formData.append('model', model);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });

        if (response.ok || response.status === 400) {
            return { success: true, message: '连接成功' };
        } else {
            return { success: false, message: `连接失败: ${response.status}` };
        }
    } catch (error) {
        return { success: false, message: `连接失败: ${error.message}` };
    }
}

async function testSummaryApi(apiUrl, apiKey, model = 'gpt-3.5-turbo') {
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'user', content: 'test' }
                ],
                max_tokens: 10
            })
        });

        if (response.ok || response.status === 400) {
            return { success: true, message: '连接成功' };
        } else {
            return { success: false, message: `连接失败: ${response.status}` };
        }
    } catch (error) {
        return { success: false, message: `连接失败: ${error.message}` };
    }
}

async function transcribeAudio(audioBlob, apiUrl, apiKey, model = 'whisper-1', audioFilePath = null, onProgress = null) {
    try {
        console.log('开始转写音频:', { apiUrl, model, blobSize: audioBlob.size, blobType: audioBlob.type });

        const sizeMB = audioBlob.size / (1024 * 1024);
        const isSiliconFlow = apiUrl.includes('siliconflow.cn') || apiUrl.includes('siliconflow.ai');

        // 超长音频统一走分段转写，避免不同服务商路径分叉导致大文件直传失败
        if (sizeMB > 50) {
            console.log('文件大小超过 50MB 限制，使用分段转写...');
            return await transcribeAudioSegments(audioBlob, apiUrl, apiKey, model, audioFilePath, onProgress);
        }

        const durationSeconds = await getAudioDuration(audioBlob);
        const durationMinutes = isValidAudioDuration(durationSeconds) ? durationSeconds / 60 : null;
        if (durationMinutes !== null && durationMinutes > 60) {
            console.log('音频时长超过 60 分钟限制，使用分段转写...');
            return await transcribeAudioSegments(audioBlob, apiUrl, apiKey, model, audioFilePath, onProgress);
        }

        if (isSiliconFlow) {
            // 不超过限制，直接使用原始 webm 格式
            console.log('使用原始 webm 格式转写');
            return await transcribeSingleSegment(audioBlob, apiUrl, apiKey, model, 600000);
        }

        // 判断是否为阿里云百炼 API
        const isBailian = apiUrl.includes('bailian') || apiUrl.includes('dashscope.aliyuncs.com/api/v1');
        const isDashScopeCompatible = apiUrl.includes('dashscope') && apiUrl.includes('compatible-mode');
        // isSiliconFlow 已在上面检查过

        let response;
        const audioFormat = detectAudioFormat(audioBlob);

        if (isBailian) {
            const base64Audio = await blobToBase64(audioBlob);

            const requestBody = {
                model: model,
                input: {
                    audio: base64Audio
                },
                parameters: {
                    sample_rate: 16000,
                    format: audioFormat,
                    language_hints: ['zh', 'en']
                }
            };

            console.log('发送百炼录音文件识别请求:', { url: apiUrl, model });
            response = await fetchWithTimeout(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
        } else if (isDashScopeCompatible) {
            const audioEndpoint = apiUrl.replace('/chat/completions', '/audio/transcriptions');
            
            const formData = new FormData();
            formData.append('file', audioBlob, `recording.${audioFormat}`);
            formData.append('model', model || 'whisper-1');

            console.log('发送 DashScope 兼容请求:', { url: audioEndpoint, model });
            response = await fetchWithTimeout(audioEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                body: formData
            });
        } else if (isSiliconFlow) {
            let audioEndpoint = apiUrl;
            if (apiUrl.includes('/chat/completions')) {
                audioEndpoint = apiUrl.replace('/chat/completions', '/audio/transcriptions');
            }
            
            const formData = new FormData();
            formData.append('file', audioBlob, `recording.${audioFormat}`);
            formData.append('model', model || 'whisper-1');

            console.log('发送 SiliconFlow 请求:', { url: audioEndpoint, model });
            response = await fetchWithTimeout(audioEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                body: formData
            });
        } else {
            const formData = new FormData();
            formData.append('file', audioBlob, `recording.${audioFormat}`);
            formData.append('model', model);

            console.log('发送 OpenAI 请求:', { url: apiUrl, model });
            response = await fetchWithTimeout(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                body: formData
            });
        }

        console.log('响应状态:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API 错误响应:', errorText);
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { error: { message: errorText } };
            }
            throw new Error(errorData.error?.message || errorData.message || `转录失败: ${response.status}`);
        }

        const data = await response.json();
        console.log('API 响应数据:', data);

        // 解析不同格式的响应
        let transcriptText = '';
        if (data.text) {
            // OpenAI 格式
            transcriptText = data.text;
        } else if (data.choices && data.choices[0] && data.choices[0].message) {
            // Chat completions 格式
            const message = data.choices[0].message;
            if (message.content) {
                transcriptText = message.content;
            } else if (message.audio && message.audio.transcript) {
                transcriptText = message.audio.transcript;
            }
        } else if (data.output && data.output.text) {
            // 百炼/DashScope 格式
            transcriptText = data.output.text;
        } else if (data.output && data.output.sentences) {
            // 百炼句子数组格式
            transcriptText = data.output.sentences.map(s => s.text).join('');
        } else if (data.output && data.output.flash_result) {
            // 实时识别结果格式
            transcriptText = data.output.flash_result.text || '';
        }

        return { success: true, text: transcriptText };
    } catch (error) {
        console.error('Transcription error:', error);
        let userMessage = getErrorMessage(error);
        if (isNetworkErrorLike(error)) {
            userMessage = '网络连接失败，请检查网络或代理设置';
        }
        return { success: false, message: userMessage };
    }
}

function calculateSegmentCount(sizeMB, durationMinutes, maxSizeMB = 45, maxDurationMinutes = 55) {
    const sizeSegments = Math.max(1, Math.ceil(sizeMB / maxSizeMB));
    const safeDurationMinutes = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 0;
    const durationSegments = Math.max(1, Math.ceil(safeDurationMinutes / maxDurationMinutes));
    return Math.max(sizeSegments, durationSegments);
}

function isValidAudioDuration(duration) {
    return Number.isFinite(duration) && duration > 0;
}

function detectAudioFormat(audioBlob) {
    const mimeType = (audioBlob && audioBlob.type ? audioBlob.type : '').toLowerCase();

    if (mimeType.includes('wav')) return 'wav';
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'mp4';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('webm')) return 'webm';

    return 'webm';
}

// 辅助函数：将 Blob 转换为 Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // 移除 data:audio/webm;base64, 前缀
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// 分割音频文件（用于处理超过 API 限制的大文件）
// API 限制：文件大小 ≤ 50MB，使用 45MB 作为安全阈值
async function splitAudio(audioBlob, maxSizeMB = 45, knownDuration = null) {
    console.log('开始分割音频...');

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const sampleRate = audioBuffer.sampleRate;
        const totalDuration = knownDuration && knownDuration > 0 ? knownDuration : audioBuffer.duration;

        if (knownDuration && knownDuration > 0) {
            console.log('使用已知的音频时长，避免重复解码...');
        }

        console.log(`音频总时长: ${totalDuration.toFixed(2)}秒 (${(totalDuration / 60).toFixed(2)}分钟)`);

        const totalSizeMB = audioBlob.size / (1024 * 1024);
        console.log(`音频总大小: ${totalSizeMB.toFixed(2)}MB`);

        const numSegments = Math.ceil(totalSizeMB / maxSizeMB);
        console.log(`根据大小限制，需要分成 ${numSegments} 个片段`);

        const segmentDuration = totalDuration / numSegments;
        const segments = [];

        for (let i = 0; i < numSegments; i++) {
            const startTime = i * segmentDuration;
            const endTime = (i === numSegments - 1) ? totalDuration : (i + 1) * segmentDuration;

            const segmentBlob = await extractAudioSegment(audioBuffer, startTime, endTime, sampleRate);
            const sizeMB = segmentBlob.size / (1024 * 1024);

            console.log(`片段 ${i + 1}/${numSegments}: ${((endTime - startTime) / 60).toFixed(2)}分钟, 大小: ${sizeMB.toFixed(2)}MB`);

            segments.push(segmentBlob);
        }

        console.log(`音频已分割为 ${segments.length} 个片段`);
        return segments;
    } finally {
        await audioContext.close();
    }
}

async function createBlobFromFilePath(filePath) {
    const readResult = await window.electronAPI.readAudioFile(filePath);
    if (!readResult.success) {
        throw new Error(readResult.error || 'Failed to read audio segment');
    }

    const binary = readResult.data instanceof Uint8Array ? readResult.data : new Uint8Array(readResult.data);
    return new Blob([binary], { type: 'audio/webm' });
}

async function splitAudioByFilePath(filePath, totalDuration, totalSizeMB) {
    const durationMinutes = totalDuration / 60;
    const segmentCount = calculateSegmentCount(totalSizeMB, durationMinutes);

    if (!window.electronAPI || typeof window.electronAPI.splitAudioFile !== 'function') {
        throw new Error('splitAudioFile IPC is not available');
    }

    const result = await window.electronAPI.splitAudioFile(filePath, {
        segmentCount,
        segmentDuration: totalDuration / segmentCount
    });

    if (!result.success) {
        throw new Error(result.error || 'Failed to split audio file');
    }

    return result.files || [];
}

// 从 AudioBuffer 提取时间段并转换为 webm
async function extractAudioSegment(audioBuffer, startTime, endTime, sampleRate) {
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.floor(endTime * sampleRate);
    const segmentLength = endSample - startSample;
    
    const numberOfChannels = audioBuffer.numberOfChannels;
    const segmentBuffer = new AudioContext().createBuffer(
        numberOfChannels,
        segmentLength,
        sampleRate
    );
    
    for (let channel = 0; channel < numberOfChannels; channel++) {
        const sourceData = audioBuffer.getChannelData(channel);
        const segmentData = segmentBuffer.getChannelData(channel);
        segmentData.set(sourceData.subarray(startSample, endSample));
    }
    
    return await audioBufferToWebm(segmentBuffer);
}

// 将 AudioBuffer 转换为 webm Blob（简化版）
async function audioBufferToWebm(audioBuffer) {
    return new Promise((resolve) => {
        const ctx = new AudioContext();
        const offlineCtx = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            audioBuffer.length,
            audioBuffer.sampleRate
        );
        
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineCtx.destination);
        source.start();
        
        offlineCtx.startRendering().then((rendered) => {
            const dest = ctx.createMediaStreamDestination();
            const recorder = new MediaRecorder(dest.stream, { 
                mimeType: 'audio/webm;codecs=opus' 
            });
            const chunks = [];
            
            recorder.ondataavailable = (e) => chunks.push(e.data);
            recorder.onstop = () => {
                resolve(new Blob(chunks, { type: 'audio/webm' }));
                ctx.close();
            };
            
            const src = ctx.createBufferSource();
            src.buffer = rendered;
            src.connect(dest);
            src.start();
            recorder.start();
            src.onended = () => recorder.stop();
        });
    });
}

// 分段转写音频
async function transcribeAudioSegments(audioBlob, apiUrl, apiKey, model = 'whisper-1', audioFilePath = null, onProgress = null) {
    const requestTimeout = 600000;
    // 直接使用原始 webm，不需要转换为 WAV
    const sizeMB = audioBlob.size / (1024 * 1024);
    
    // 获取音频时长（使用 audio 元素）
    const duration = await getAudioDuration(audioBlob);
    const hasKnownDuration = isValidAudioDuration(duration);
    const durationMinutes = hasKnownDuration ? duration / 60 : 0;
    const durationLabel = durationMinutes === null ? 'unknown' : `${durationMinutes.toFixed(2)}åˆ†é’Ÿ`;
    
    console.log(`音频信息: ${durationMinutes.toFixed(2)}分钟, ${sizeMB.toFixed(2)}MB`);
    
    console.log(`转写超时时间: ${(requestTimeout / 1000 / 60).toFixed(1)}分钟`);
    
    // 检查是否需要分割
    const needsSplit = sizeMB > 50 || (hasKnownDuration && durationMinutes > 60);
    
    if (!needsSplit) {
        // 不需要分割，直接转写
        return await transcribeSingleSegment(audioBlob, apiUrl, apiKey, model, requestTimeout);
    }
    
    // 需要分割
    console.log('音频超过限制，开始分段处理...');
    let segments = null;
    let segmentPaths = [];

    if (audioFilePath && hasKnownDuration && window.electronAPI && typeof window.electronAPI.splitAudioFile === 'function') {
        try {
            segmentPaths = await splitAudioByFilePath(audioFilePath, duration, sizeMB);
            console.log(`主进程已分割为 ${segmentPaths.length} 个片段`);
        } catch (error) {
            console.warn('主进程分段失败，回退到渲染进程分段:', error.message);
            segments = await splitAudio(audioBlob, 45, duration);
        }
    } else {
        segments = await splitAudio(audioBlob, 45, hasKnownDuration ? duration : null);
    }
    
    // 逐个转写每个片段
    const transcripts = [];
    const totalSegments = segmentPaths.length || segments.length;
    let lastFailedMessage = '';
    const loadSegmentBlob = async (index) => (
        segmentPaths.length > 0
            ? createBlobFromFilePath(segmentPaths[index])
            : segments[index]
    );

    for (let i = 0; i < totalSegments; i++) {
        console.log(`转写片段 ${i + 1}/${totalSegments}...`);
        let segmentBlob = await loadSegmentBlob(i);
        
        let result = await transcribeSingleSegment(segmentBlob, apiUrl, apiKey, model, requestTimeout);
        
        let retryCount = 0;
        const maxRetries = 2;
        while (!result.success && retryCount < maxRetries) {
            retryCount++;
            console.log(getTranscriptionRetryProgressMessage(result, retryCount + 1, maxRetries + 1));
            if (typeof onProgress === 'function') {
                onProgress(getTranscriptionRetryProgressMessage(result, retryCount + 1, maxRetries + 1));
            }
            await new Promise(resolve => setTimeout(resolve, retryCount * 5000));
            segmentBlob = await loadSegmentBlob(i);
            result = await transcribeSingleSegment(segmentBlob, apiUrl, apiKey, model, requestTimeout);
        }
        
        if (result.success) {
            transcripts.push(result.text);
            console.log(`片段 ${i + 1} 转写完成`);
        } else {
            lastFailedMessage = getTranscriptionRetryExhaustedMessage(result);
            console.error(`片段 ${i + 1} 转写失败:`, lastFailedMessage);
        }
    }
    
    if (transcripts.length === 0) {
        return { success: false, message: lastFailedMessage || getI18nValue('transcriptionRetryExhaustedGeneric') };
    }
    
    if (segmentPaths.length > 0 && window.electronAPI && typeof window.electronAPI.deleteFile === 'function') {
        await Promise.all(segmentPaths.map((filePath) => window.electronAPI.deleteFile(filePath).catch(() => null)));
    }

    const combinedText = transcripts.join('\n\n');
    console.log(`转写完成，共 ${totalSegments} 个片段，合并后文本长度: ${combinedText.length}`);
    
    return { success: true, text: combinedText };
}

// 获取音频时长（使用 audio 元素，避免解码整个文件）
async function getAudioDuration(audioBlob) {
    return new Promise((resolve, reject) => {
        const audio = new Audio();
        const url = URL.createObjectURL(audioBlob);
        const resolveWithFallback = () => {
            getAudioDurationFallback(audioBlob)
                .then((duration) => resolve(isValidAudioDuration(duration) ? duration : 0))
                .catch(() => resolve(0));
        };
        
        audio.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            if (isValidAudioDuration(audio.duration)) {
                resolve(audio.duration);
                return;
            }

            resolveWithFallback();
        };
        
        audio.onerror = () => {
            URL.revokeObjectURL(url);
            // 如果失败，尝试使用 AudioContext 解码
            resolveWithFallback();
        };
        
        audio.src = url;
    });
}

// 获取音频时长（备用方案：使用 AudioContext 解码）
async function getAudioDurationFallback(audioBlob) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        return audioBuffer.duration;
    } finally {
        await audioContext.close();
    }
}

// 转写单个音频片段
async function transcribeSingleSegment(audioBlob, apiUrl, apiKey, model, timeout = 600000) {
    try {
        const isBailian = apiUrl.includes('bailian') || apiUrl.includes('dashscope.aliyuncs.com/api/v1');
        const isDashScopeCompatible = apiUrl.includes('dashscope') && apiUrl.includes('compatible-mode');
        const isSiliconFlow = apiUrl.includes('siliconflow.cn') || apiUrl.includes('siliconflow.ai');
        
        let response;
        
        if (isBailian) {
            const base64Audio = await blobToBase64(audioBlob);
            const requestBody = {
                model: model,
                input: { audio: base64Audio },
                parameters: { sample_rate: 16000, format: detectAudioFormat(audioBlob), language_hints: ['zh', 'en'] }
            };
            
            response = await fetchWithTimeout(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            }, timeout);
        } else if (isDashScopeCompatible) {
            const audioEndpoint = apiUrl.replace('/chat/completions', '/audio/transcriptions');
            const formData = new FormData();
            formData.append('file', audioBlob, 'segment.webm');
            formData.append('model', model || 'whisper-1');
            
            response = await fetchWithTimeout(audioEndpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            }, timeout);
        } else if (isSiliconFlow) {
            let audioEndpoint = apiUrl;
            if (apiUrl.includes('/chat/completions')) {
                audioEndpoint = apiUrl.replace('/chat/completions', '/audio/transcriptions');
            }
            
            const formData = new FormData();
            formData.append('file', audioBlob, 'segment.webm');
            formData.append('model', model || 'whisper-1');
            
            response = await fetchWithTimeout(audioEndpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            }, timeout);
        } else {
            const formData = new FormData();
            formData.append('file', audioBlob, 'segment.webm');
            formData.append('model', model);
            
            response = await fetchWithTimeout(apiUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            }, timeout);
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API 错误: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        let transcriptText = '';
        
        if (data.text) {
            transcriptText = data.text;
        } else if (data.choices && data.choices[0] && data.choices[0].message) {
            const message = data.choices[0].message;
            transcriptText = message.content || (message.audio && message.audio.transcript) || '';
        } else if (data.output && data.output.text) {
            transcriptText = data.output.text;
        } else if (data.output && data.output.sentences) {
            transcriptText = data.output.sentences.map(s => s.text).join('');
        }
        
        return { success: true, text: transcriptText };
    } catch (error) {
        console.error('单片段转写错误:', error);
        let userMessage = getErrorMessage(error);
        if (isNetworkErrorLike(error)) {
            userMessage = '网络连接失败，请检查网络或代理设置';
        }
        return { success: false, message: userMessage };
    }
}

async function generateSummary(transcript, template, apiUrl, apiKey, model = 'gpt-3.5-turbo', onProgress = null) {
    try {
        const prompt = `请根据以下会议转录内容，按照指定的模板格式生成会议纪要：

模板格式：
${template}

会议转录内容：
${transcript}

请严格按照模板格式输出会议纪要，保持Markdown格式。`;

        const maxAttempts = 3;
        const requestTimeout = getSummaryRequestTimeout(transcript);
        const maxBackoff = 2000;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await fetchWithTimeout(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.7,
                        max_tokens: 2000
                    })
                }, requestTimeout);

                if (!response.ok) {
                    const error = new Error(await parseSummaryError(response));
                    error.status = response.status;
                    throw error;
                }

                const data = await response.json();
                const summary = data.choices[0].message.content;
                return { success: true, summary };
            } catch (error) {
                const shouldRetry = attempt < maxAttempts && isRetryableSummaryError(error);

                if (!shouldRetry) {
                    if (attempt === maxAttempts && isRetryableSummaryError(error)) {
                        const exhaustedError = new Error(getSummaryRetryExhaustedMessage(error));
                        exhaustedError.status = error.status;
                        throw exhaustedError;
                    }

                    throw error;
                }

                const nextAttempt = attempt + 1;
                if (typeof onProgress === 'function') {
                    const progressLabel = getSummaryRetryProgressLabel(error);
                    onProgress(getI18nValue('summaryRetryProgressTemplate', {
                        label: progressLabel,
                        attempt: String(nextAttempt),
                        maxAttempts: String(maxAttempts)
                    }));
                }

                const backoff = Math.min(1000 * attempt, maxBackoff);
                await delay(backoff);
            }
        }
    } catch (error) {
        console.error('Summary generation error:', error);
        let userMessage = getErrorMessage(error);
        if (isNetworkErrorLike(error)) {
            userMessage = '网络连接失败，请检查网络或代理设置';
        }
        return { success: false, message: userMessage };
    }
}

function getMeetingTitleSanitizer() {
    if (typeof globalThis !== 'undefined' && typeof globalThis.sanitizeGeneratedMeetingTitle === 'function') {
        return globalThis.sanitizeGeneratedMeetingTitle;
    }

    return (title) => String(title || '').trim();
}

async function generateMeetingTitle(summary, apiUrl, apiKey, model = 'gpt-4o-mini', onProgress = null) {
    if (!summary || !summary.trim()) {
        return { success: false, message: '缺少可用于生成标题的会议纪要' };
    }

    const titlePrompt = `生成一个不超过15个汉字的会议标题，只输出标题本身。

会议纪要：
${summary}`;

    const sanitizeTitle = getMeetingTitleSanitizer();
    const maxAttempts = 3;
    const requestTimeout = getMeetingTitleRequestTimeout(summary);
    const maxBackoff = 2000;

    try {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await fetchWithTimeout(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: 'user', content: titlePrompt }
                        ],
                        temperature: 0,
                        max_tokens: 60
                    })
                }, requestTimeout);

                if (!response.ok) {
                    const error = new Error(await parseSummaryError(response));
                    error.status = response.status;
                    throw error;
                }

                const data = await response.json();
                const rawTitle = data.choices?.[0]?.message?.content || '';
                const sanitizedTitle = sanitizeTitle(rawTitle);

                if (!sanitizedTitle) {
                    return { success: false, message: '生成的会议标题为空' };
                }

                return { success: true, title: sanitizedTitle };
            } catch (error) {
                const shouldRetry = attempt < maxAttempts && isRetryableSummaryError(error);

                if (!shouldRetry) {
                    if (attempt === maxAttempts && isRetryableSummaryError(error)) {
                        const exhaustedError = new Error(getSummaryRetryExhaustedMessage(error));
                        exhaustedError.status = error.status;
                        throw exhaustedError;
                    }

                    throw error;
                }

                const nextAttempt = attempt + 1;
                if (typeof onProgress === 'function') {
                    const progressLabel = getSummaryRetryProgressLabel(error);
                    onProgress(getI18nValue('summaryRetryProgressTemplate', {
                        label: progressLabel,
                        attempt: String(nextAttempt),
                        maxAttempts: String(maxAttempts)
                    }));
                }

                const backoff = Math.min(1000 * attempt, maxBackoff);
                await delay(backoff);
            }
        }
    } catch (error) {
        console.error('Meeting title generation error:', error);
        let userMessage = getErrorMessage(error);
        if (isNetworkErrorLike(error)) {
            userMessage = '网络连接失败，请检查网络或代理设置';
        }
        return { success: false, message: userMessage };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        transcribeAudio,
        transcribeAudioSegments,
        transcribeSingleSegment,
        generateSummary,
        generateMeetingTitle,
        calculateSegmentCount,
        getAudioDuration,
        splitAudio,
        splitAudioByFilePath
    };
}
