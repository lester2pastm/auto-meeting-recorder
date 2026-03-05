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

async function transcribeAudio(audioBlob, apiUrl, apiKey, model = 'whisper-1') {
    try {
        console.log('开始转写音频:', { apiUrl, model, blobSize: audioBlob.size, blobType: audioBlob.type });

        // 检查是否需要分段转写（SiliconFlow 限制：时长 ≤1小时，文件 ≤50MB）
        const isSiliconFlow = apiUrl.includes('siliconflow.cn') || apiUrl.includes('siliconflow.ai');
        
        if (isSiliconFlow) {
            // 先转换为 WAV 获取准确的大小信息
            let processedBlob;
            try {
                processedBlob = await convertToWav(audioBlob);
            } catch (e) {
                processedBlob = audioBlob;
            }
            
            const sizeMB = processedBlob.size / (1024 * 1024);
            
            // 检查是否超过限制
            if (sizeMB > 50) {
                console.log('文件大小超过 50MB 限制，使用分段转写...');
                return await transcribeAudioSegments(audioBlob, apiUrl, apiKey, model);
            }
            
            // 获取音频时长
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await processedBlob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const durationMinutes = audioBuffer.duration / 60;
            await audioContext.close();
            
            if (durationMinutes > 60) {
                console.log('音频时长超过 60 分钟限制，使用分段转写...');
                return await transcribeAudioSegments(audioBlob, apiUrl, apiKey, model);
            }
        }

        // 继续原有逻辑（不分段）
        // 将音频转换为 WAV 格式以确保兼容性
        let processedBlob = audioBlob;
        try {
            processedBlob = await convertToWav(audioBlob);
            console.log('音频已转换为 WAV 格式:', { size: processedBlob.size, type: processedBlob.type });
        } catch (convertError) {
            console.warn('音频转换失败，使用原始格式:', convertError.message);
        }

        // 判断是否为阿里云百炼 API
        const isBailian = apiUrl.includes('bailian') || apiUrl.includes('dashscope.aliyuncs.com/api/v1');
        const isDashScopeCompatible = apiUrl.includes('dashscope') && apiUrl.includes('compatible-mode');
        // isSiliconFlow 已在上面检查过

        let response;

        if (isBailian) {
            const base64Audio = await blobToBase64(processedBlob);

            const requestBody = {
                model: model,
                input: {
                    audio: base64Audio
                },
                parameters: {
                    sample_rate: 16000,
                    format: 'wav',
                    language_hints: ['zh', 'en']
                }
            };

            console.log('发送百炼录音文件识别请求:', { url: apiUrl, model });
            response = await fetch(apiUrl, {
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
            formData.append('file', processedBlob, 'recording.wav');
            formData.append('model', model || 'whisper-1');

            console.log('发送 DashScope 兼容请求:', { url: audioEndpoint, model });
            response = await fetch(audioEndpoint, {
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
            formData.append('file', processedBlob, 'recording.wav');
            formData.append('model', model || 'whisper-1');

            console.log('发送 SiliconFlow 请求:', { url: audioEndpoint, model });
            response = await fetch(audioEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                body: formData
            });
        } else {
            const formData = new FormData();
            formData.append('file', processedBlob, 'recording.wav');
            formData.append('model', model);

            console.log('发送 OpenAI 请求:', { url: apiUrl, model });
            response = await fetch(apiUrl, {
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
        return { success: false, message: error.message };
    }
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
// API 限制：时长 ≤ 1小时，文件大小 ≤ 50MB
async function splitAudio(audioBlob, maxDurationMinutes = 55, maxSizeMB = 45) {
    console.log('开始分割音频...');
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const sampleRate = audioBuffer.sampleRate;
    const totalDuration = audioBuffer.duration;
    const totalDurationMinutes = totalDuration / 60;
    
    console.log(`音频总时长: ${totalDuration.toFixed(2)}秒 (${totalDurationMinutes.toFixed(2)}分钟)`);
    
    // 计算需要分割的段数
    const segments = [];
    const segmentDurationSamples = Math.floor(maxDurationMinutes * 60 * sampleRate);
    const totalSamples = audioBuffer.length;
    
    let startSample = 0;
    let segmentIndex = 0;
    
    while (startSample < totalSamples) {
        const endSample = Math.min(startSample + segmentDurationSamples, totalSamples);
        const segmentLength = endSample - startSample;
        
        // 创建片段的 AudioBuffer
        const numberOfChannels = audioBuffer.numberOfChannels;
        const segmentBuffer = audioContext.createBuffer(
            numberOfChannels,
            segmentLength,
            sampleRate
        );
        
        // 复制数据到片段
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sourceData = audioBuffer.getChannelData(channel);
            const segmentData = segmentBuffer.getChannelData(channel);
            for (let i = 0; i < segmentLength; i++) {
                segmentData[i] = sourceData[startSample + i];
            }
        }
        
        // 转换为 WAV Blob
        const segmentBlob = await audioBufferToWav(segmentBuffer);
        
        // 检查大小，如果超过限制则进一步分割
        const sizeMB = segmentBlob.size / (1024 * 1024);
        console.log(`片段 ${segmentIndex + 1}: ${(segmentLength / sampleRate / 60).toFixed(2)}分钟, 大小: ${sizeMB.toFixed(2)}MB`);
        
        if (sizeMB > maxSizeMB) {
            // 如果片段仍然太大，递归分割为更小的片段（减小分段时长）
            console.log(`片段过大，进一步分割...`);
            await audioContext.close();
            const newMaxDuration = Math.max(5, maxDurationMinutes - 10);
            return splitAudio(segmentBlob, newMaxDuration, maxSizeMB);
        }
        
        segments.push(segmentBlob);
        startSample = endSample;
        segmentIndex++;
    }
    
    await audioContext.close();
    console.log(`音频已分割为 ${segments.length} 个片段`);
    return segments;
}

// 将 AudioBuffer 转换为 WAV Blob
async function audioBufferToWav(audioBuffer) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    
    const wavBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(wavBuffer);
    
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numberOfChannels * 2, true);
    
    let offset = 44;
    for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sample = audioBuffer.getChannelData(channel)[i];
            const clamped = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true);
            offset += 2;
        }
    }
    
    return new Blob([wavBuffer], { type: 'audio/wav' });
}

// 分段转写音频
async function transcribeAudioSegments(audioBlob, apiUrl, apiKey, model = 'whisper-1') {
    // 将音频转换为 WAV 并获取信息
    let processedBlob = audioBlob;
    try {
        processedBlob = await convertToWav(audioBlob);
        console.log('音频已转换为 WAV 格式:', { size: processedBlob.size, type: processedBlob.type });
    } catch (convertError) {
        console.warn('音频转换失败，使用原始格式:', convertError.message);
    }
    
    const sizeMB = processedBlob.size / (1024 * 1024);
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await processedBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const durationMinutes = audioBuffer.duration / 60;
    await audioContext.close();
    
    console.log(`音频信息: ${durationMinutes.toFixed(2)}分钟, ${sizeMB.toFixed(2)}MB`);
    
    // 检查是否需要分割
    const needsSplit = sizeMB > 50;
    
    if (!needsSplit) {
        // 不需要分割，直接转写
        return await transcribeAudio(audioBlob, apiUrl, apiKey, model);
    }
    
    // 需要分割
    console.log('音频超过限制，开始分段处理...');
    const segments = await splitAudio(processedBlob);
    
    // 逐个转写每个片段
    const transcripts = [];
    for (let i = 0; i < segments.length; i++) {
        console.log(`转写片段 ${i + 1}/${segments.length}...`);
        
        // 为每个片段调用转写（复用现有的转写逻辑，但传入已处理的片段）
        const result = await transcribeSingleSegment(segments[i], apiUrl, apiKey, model);
        
        if (result.success) {
            transcripts.push(result.text);
            console.log(`片段 ${i + 1} 转写完成`);
        } else {
            console.error(`片段 ${i + 1} 转写失败:`, result.message);
            // 继续处理其他片段
        }
    }
    
    if (transcripts.length === 0) {
        return { success: false, message: '所有片段转写失败' };
    }
    
    // 合并转写结果
    const combinedText = transcripts.join('\n\n');
    console.log(`转写完成，共 ${segments.length} 个片段，合并后文本长度: ${combinedText.length}`);
    
    return { success: true, text: combinedText };
}

// 转写单个音频片段
async function transcribeSingleSegment(audioBlob, apiUrl, apiKey, model) {
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
                parameters: { sample_rate: 16000, format: 'wav', language_hints: ['zh', 'en'] }
            };
            
            response = await fetch(apiUrl, {
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
            formData.append('file', audioBlob, 'segment.wav');
            formData.append('model', model || 'whisper-1');
            
            response = await fetch(audioEndpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            });
        } else if (isSiliconFlow) {
            let audioEndpoint = apiUrl;
            if (apiUrl.includes('/chat/completions')) {
                audioEndpoint = apiUrl.replace('/chat/completions', '/audio/transcriptions');
            }
            
            const formData = new FormData();
            formData.append('file', audioBlob, 'segment.wav');
            formData.append('model', model || 'whisper-1');
            
            response = await fetch(audioEndpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            });
        } else {
            const formData = new FormData();
            formData.append('file', audioBlob, 'segment.wav');
            formData.append('model', model);
            
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            });
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
        return { success: false, message: error.message };
    }
}

async function generateSummary(transcript, template, apiUrl, apiKey, model = 'gpt-3.5-turbo') {
    try {
        const prompt = `请根据以下会议转录内容，按照指定的模板格式生成会议纪要：

模板格式：
${template}

会议转录内容：
${transcript}

请严格按照模板格式输出会议纪要，保持Markdown格式。`;

        const response = await fetch(apiUrl, {
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
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `生成失败: ${response.status}`);
        }

        const data = await response.json();
        const summary = data.choices[0].message.content;
        return { success: true, summary };
    } catch (error) {
        console.error('Summary generation error:', error);
        return { success: false, message: error.message };
    }
}

async function convertToWav(audioBlob) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    
    const wavBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(wavBuffer);
    
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numberOfChannels * 2, true);
    
    let offset = 44;
    for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sample = audioBuffer.getChannelData(channel)[i];
            const clamped = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true);
            offset += 2;
        }
    }
    
    await audioContext.close();
    
    return new Blob([wavBuffer], { type: 'audio/wav' });
}
