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

        // 判断是否为阿里云百炼 API
        const isBailian = apiUrl.includes('bailian') || apiUrl.includes('dashscope.aliyuncs.com/api/v1');
        const isDashScopeCompatible = apiUrl.includes('dashscope') && apiUrl.includes('compatible-mode');
        const isSiliconFlow = apiUrl.includes('siliconflow.cn') || apiUrl.includes('siliconflow.ai');

        let response;

        if (isBailian) {
            const base64Audio = await blobToBase64(audioBlob);

            const requestBody = {
                model: model,
                input: {
                    audio: base64Audio
                },
                parameters: {
                    sample_rate: 16000,
                    format: 'webm',
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
            formData.append('file', audioBlob, 'recording.webm');
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
            formData.append('file', audioBlob, 'recording.webm');
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
            formData.append('file', audioBlob, 'recording.webm');
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
