let currentSettings = null;
let currentMeetingId = null;

async function initApp() {
    try {
        await initDB();
        
        // 优先从文件系统加载配置（Electron 环境）
        if (typeof window !== 'undefined' && window.electronAPI) {
            const fileConfig = await loadConfigFromFile();
            if (fileConfig.success && fileConfig.config) {
                currentSettings = fileConfig.config;
                await saveSettings(currentSettings); // 同步到 IndexedDB
            } else {
                // 如果文件系统没有配置，尝试从 IndexedDB 加载
                currentSettings = await getSettings();
            }
        } else {
            currentSettings = await getSettings();
        }
        
        if (!currentSettings) {
            currentSettings = {
                sttApiUrl: '',
                sttApiKey: '',
                sttModel: 'whisper-1',
                summaryApiUrl: '',
                summaryApiKey: '',
                summaryModel: 'gpt-3.5-turbo',
                summaryTemplate: DEFAULT_TEMPLATE
            };
            await saveSettings(currentSettings);
            
            // 同时保存到文件系统
            if (typeof window !== 'undefined' && window.electronAPI) {
                await saveConfigToFile(currentSettings);
            }
        }
        
        loadSettings(currentSettings);
        loadDefaultTemplate();
        
        // 初始化侧边栏导航
        initNavigation();
        
        setupEventListeners();
        
        showToast('应用初始化成功', 'success');
    } catch (error) {
        console.error('Failed to initialize app:', error);
        showToast('应用初始化失败', 'error');
    }
}

function setupEventListeners() {
    // 录音控制按钮
    document.getElementById('btnStartRecording').addEventListener('click', handleStartRecording);
    document.getElementById('btnPauseRecording').addEventListener('click', handlePauseRecording);
    document.getElementById('btnResumeRecording').addEventListener('click', handleResumeRecording);
    document.getElementById('btnStopRecording').addEventListener('click', handleStopRecording);
    
    // 复制按钮
    document.getElementById('btnCopySubtitle').addEventListener('click', handleCopySubtitle);
    document.getElementById('btnCopySummary').addEventListener('click', handleCopySummary);
    
    // 设置页面按钮
    document.getElementById('btnTestSttApi').addEventListener('click', handleTestSttApi);
    document.getElementById('btnTestSummaryApi').addEventListener('click', handleTestSummaryApi);
    document.getElementById('btnSaveTemplate').addEventListener('click', handleSaveTemplate);
}

// 兼容旧代码 - 导航函数现在使用新的视图系统
function showMain() {
    switchView('recorder');
}

function showSettings() {
    switchView('settings');
}

function showHistory() {
    switchView('history');
    loadHistoryList();
}

// 加载会议列表（用于历史视图）
async function loadMeetings() {
    await loadHistoryList();
}

async function loadHistoryList() {
    try {
        const meetings = await getAllMeetings();
        meetings.sort((a, b) => new Date(b.date) - new Date(a.date));
        renderHistoryList(meetings);
    } catch (error) {
        console.error('Failed to load history:', error);
        showToast('加载历史记录失败', 'error');
    }
}

async function handleStartRecording() {
    try {
        await startRecording();
        updateRecordingButtons(getRecordingState());
        showToast('录音已开始', 'success');
    } catch (error) {
        console.error('Failed to start recording:', error);
        showToast('录音启动失败: ' + error.message, 'error');
    }
}

function handlePauseRecording() {
    try {
        pauseRecording();
        updateRecordingButtons(getRecordingState());
        showToast('录音已暂停', 'info');
    } catch (error) {
        console.error('Failed to pause recording:', error);
        showToast('暂停录音失败', 'error');
    }
}

function handleResumeRecording() {
    try {
        resumeRecording();
        updateRecordingButtons(getRecordingState());
        showToast('录音已继续', 'info');
    } catch (error) {
        console.error('Failed to resume recording:', error);
        showToast('继续录音失败', 'error');
    }
}

async function handleStopRecording() {
    try {
        const audioBlob = await stopRecording();
        updateRecordingButtons(getRecordingState());
        
        if (audioBlob) {
            showToast('录音已停止，正在转写...', 'info');
            await processRecording(audioBlob);
        }
    } catch (error) {
        console.error('Failed to stop recording:', error);
        showToast('停止录音失败', 'error');
    }
}

async function processRecording(audioBlob) {
    try {
        console.log('处理录音, 当前设置:', currentSettings);

        if (!currentSettings.sttApiUrl || !currentSettings.sttApiKey) {
            console.error('API 未配置:', { url: currentSettings.sttApiUrl, key: currentSettings.sttApiKey ? '已设置' : '未设置' });
            showToast('请先配置语音识别API', 'error');
            return;
        }

        showLoading('正在转写...');
        console.log('开始调用转写 API:', { url: currentSettings.sttApiUrl, model: currentSettings.sttModel });

        const result = await transcribeAudio(audioBlob, currentSettings.sttApiUrl, currentSettings.sttApiKey, currentSettings.sttModel);

        console.log('转写结果:', result);

        if (!result.success) {
            showToast('转写失败: ' + result.message, 'error');
            return;
        }

        updateSubtitleContent(result.text);
        showToast('转写完成，正在生成纪要...', 'info');

        await generateMeetingSummary(result.text, audioBlob);
    } catch (error) {
        console.error('Failed to process recording:', error);
        showToast('处理录音失败', 'error');
    }
}

async function generateMeetingSummary(transcript, audioBlob) {
    try {
        if (!currentSettings.summaryApiUrl || !currentSettings.summaryApiKey) {
            showToast('请先配置纪要生成API', 'error');
            return;
        }

        const result = await generateSummary(transcript, currentSettings.summaryTemplate, currentSettings.summaryApiUrl, currentSettings.summaryApiKey, currentSettings.summaryModel);
        
        if (!result.success) {
            showToast('生成纪要失败: ' + result.message, 'error');
            return;
        }

        updateSummaryContent(result.summary);
        showToast('纪要生成成功', 'success');
        
        await saveMeetingRecord(transcript, result.summary, audioBlob);
    } catch (error) {
        console.error('Failed to generate summary:', error);
        showToast('生成纪要失败', 'error');
    }
}

async function saveMeetingRecord(transcript, summary, audioBlob) {
    try {
        const meeting = {
            id: Date.now().toString(),
            date: new Date().toISOString().split('T')[0],
            duration: getRecordingDuration(),
            audioFile: audioBlob,
            transcript: transcript,
            summary: summary
        };

        await saveMeeting(meeting);
        showToast('会议记录已保存', 'success');
    } catch (error) {
        console.error('Failed to save meeting:', error);
        showToast('保存会议记录失败', 'error');
    }
}

function handleCopySubtitle() {
    const subtitleContent = document.getElementById('subtitleContent');
    if (subtitleContent && subtitleContent.textContent) {
        copyToClipboard(subtitleContent.textContent);
    } else {
        showToast('暂无字幕内容', 'info');
    }
}

function handleCopySummary() {
    const summaryContent = document.getElementById('summaryContent');
    if (summaryContent && summaryContent.textContent) {
        copyToClipboard(summaryContent.textContent);
    } else {
        showToast('暂无纪要内容', 'info');
    }
}

async function handleTestSttApi() {
    const apiUrl = document.getElementById('sttApiUrl').value.trim();
    const apiKey = document.getElementById('sttApiKey').value.trim();
    const model = document.getElementById('sttModel').value.trim() || 'whisper-1';

    if (!apiUrl || !apiKey) {
        showToast('请输入API地址和API Key', 'error');
        return;
    }

    showToast('正在测试连接...', 'info');
    const result = await testSttApi(apiUrl, apiKey, model);
    
    if (result.success) {
        // 测试成功后自动保存设置
        currentSettings.sttApiUrl = apiUrl;
        currentSettings.sttApiKey = apiKey;
        currentSettings.sttModel = model;
        await saveSettings(currentSettings);
        showToast(result.message + '，设置已自动保存', 'success');
    } else {
        showToast(result.message, 'error');
    }
}

async function handleTestSummaryApi() {
    const apiUrl = document.getElementById('summaryApiUrl').value.trim();
    const apiKey = document.getElementById('summaryApiKey').value.trim();
    const model = document.getElementById('summaryModel').value.trim() || 'gpt-3.5-turbo';

    if (!apiUrl || !apiKey) {
        showToast('请输入API地址和API Key', 'error');
        return;
    }

    showToast('正在测试连接...', 'info');
    const result = await testSummaryApi(apiUrl, apiKey, model);
    
    if (result.success) {
        // 测试成功后自动保存设置
        currentSettings.summaryApiUrl = apiUrl;
        currentSettings.summaryApiKey = apiKey;
        currentSettings.summaryModel = model;
        await saveSettings(currentSettings);
        showToast(result.message + '，设置已自动保存', 'success');
    } else {
        showToast(result.message, 'error');
    }
}

async function handleSaveTemplate() {
    try {
        const settings = getSettingsFromUI();
        await saveSettings(settings);
        currentSettings = settings;
        
        // 同时保存到文件系统（Electron 环境）
        if (typeof window !== 'undefined' && window.electronAPI) {
            await saveConfigToFile(settings);
        }
        
        showToast('模板已保存', 'success');
    } catch (error) {
        console.error('Failed to save template:', error);
        showToast('保存模板失败', 'error');
    }
}

async function viewMeetingDetail(id) {
    try {
        const meeting = await getMeeting(id);
        if (meeting) {
            currentMeetingId = id;
            await renderMeetingDetail(meeting);
            showSection('detailSection');
        } else {
            showToast('未找到会议记录', 'error');
        }
    } catch (error) {
        console.error('Failed to view meeting:', error);
        showToast('查看会议详情失败', 'error');
    }
}

async function deleteMeeting(id) {
    if (!confirm('确定要删除这条会议记录吗？')) {
        return;
    }

    try {
        await deleteMeeting(id);
        showToast('删除成功', 'success');
        loadHistoryList();
    } catch (error) {
        console.error('Failed to delete meeting:', error);
        showToast('删除失败', 'error');
    }
}

async function copyTranscript(id) {
    try {
        const meeting = await getMeeting(id);
        if (meeting && meeting.transcript) {
            copyToClipboard(meeting.transcript);
        } else {
            showToast('暂无转写文本', 'info');
        }
    } catch (error) {
        console.error('Failed to copy transcript:', error);
        showToast('复制失败', 'error');
    }
}

async function copySummary(id) {
    try {
        const meeting = await getMeeting(id);
        if (meeting && meeting.summary) {
            copyToClipboard(meeting.summary);
        } else {
            showToast('暂无会议纪要', 'info');
        }
    } catch (error) {
        console.error('Failed to copy summary:', error);
        showToast('复制失败', 'error');
    }
}

async function downloadAudio(id) {
    try {
        const meeting = await getMeeting(id);
        if (meeting && meeting.audioFile) {
            const url = URL.createObjectURL(meeting.audioFile);
            const a = document.createElement('a');
            a.href = url;
            a.download = `meeting_${meeting.date}_${meeting.duration}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('下载已开始', 'success');
        } else {
            showToast('暂无录音文件', 'info');
        }
    } catch (error) {
        console.error('Failed to download audio:', error);
        showToast('下载失败', 'error');
    }
}

document.addEventListener('DOMContentLoaded', initApp);
