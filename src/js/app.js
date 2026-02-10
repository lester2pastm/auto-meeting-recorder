let currentSettings = null;
let currentMeetingId = null;

async function initApp() {
    try {
        await initDB();
        
        // 初始化国际化
        if (typeof i18n !== 'undefined') {
            i18n.init();
        }
        
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
        
        // 初始化内容标签页
        initContentTabs();
        
        setupEventListeners();
        
        showToast(i18n ? i18n.get('initSuccess') : '应用初始化成功', 'success');
    } catch (error) {
        console.error('Failed to initialize app:', error);
        showToast(i18n ? i18n.get('initFailed') : '应用初始化失败', 'error');
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
    
    // 音频上传按钮
    document.getElementById('btnUploadAudio').addEventListener('click', handleUploadAudioClick);
    document.getElementById('audioFileInput').addEventListener('change', handleAudioFileSelect);
    
    // 刷新纪要按钮
    document.getElementById('btnRefreshSummary').addEventListener('click', handleRefreshSummary);
    
    // 设置页面按钮
    document.getElementById('btnTestSttApi').addEventListener('click', handleTestSttApi);
    document.getElementById('btnTestSummaryApi').addEventListener('click', handleTestSummaryApi);
    document.getElementById('btnSaveTemplate').addEventListener('click', handleSaveTemplate);
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
        // 在停止前保存时长
        const currentDuration = getRecordingDuration();
        setLastRecordingDuration(currentDuration);
        
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

        // 保存当前转写文本，用于刷新纪要
        currentTranscript = result.text;

        await generateMeetingSummary(result.text, audioBlob);
    } catch (error) {
        console.error('Failed to process recording:', error);
        showToast('处理录音失败', 'error');
    }
}

async function generateMeetingSummary(transcript, audioBlob) {
    console.log('[App] generateMeetingSummary called');
    let summary = '';
    
    try {
        if (!currentSettings.summaryApiUrl || !currentSettings.summaryApiKey) {
            console.log('[App] Summary API not configured, skipping summary generation');
            showToast('未配置纪要生成API，仅保存转写内容', 'info');
        } else {
            const result = await generateSummary(transcript, currentSettings.summaryTemplate, currentSettings.summaryApiUrl, currentSettings.summaryApiKey, currentSettings.summaryModel);
            
            if (!result.success) {
                console.log('[App] Summary generation failed:', result.message);
                showToast('生成纪要失败: ' + result.message, 'error');
            } else {
                summary = result.summary;
                updateSummaryContent(summary);
                showToast('纪要生成成功', 'success');
            }
        }
        
        // 无论纪要生成成功与否，都保存会议记录
        console.log('[App] Saving meeting record, hasSummary:', !!summary);
        await saveMeetingRecord(transcript, summary, audioBlob);
    } catch (error) {
        console.error('[App] Failed to generate summary:', error);
        showToast('生成纪要失败', 'error');
        // 即使出错也尝试保存转写内容
        try {
            await saveMeetingRecord(transcript, '', audioBlob);
        } catch (saveError) {
            console.error('[App] Failed to save meeting after summary error:', saveError);
        }
    }
}

// 保存最后一次录音时长
let lastRecordingDuration = '00:00:00';

function setLastRecordingDuration(duration) {
    lastRecordingDuration = duration;
}

async function saveMeetingRecord(transcript, summary, audioBlob) {
    console.log('[App] saveMeetingRecord called, audioBlob:', audioBlob ? { size: audioBlob.size, type: audioBlob.type } : 'null');
    try {
        const meeting = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            duration: lastRecordingDuration,
            audioFile: audioBlob,
            transcript: transcript,
            summary: summary
        };
        console.log('[App] Created meeting object, has audioFile:', !!meeting.audioFile);

        await saveMeeting(meeting);
        console.log('[App] saveMeeting completed successfully');
        showToast('会议记录已保存', 'success');
    } catch (error) {
        console.error('[App] Failed to save meeting:', error);
        showToast('保存会议记录失败: ' + error.message, 'error');
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
            openDetailModal();
        } else {
            showToast('未找到会议记录', 'error');
        }
    } catch (error) {
        console.error('Failed to view meeting:', error);
        showToast('查看会议详情失败', 'error');
    }
}

function openDetailModal() {
    const modal = document.getElementById('detailModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeDetailModal() {
    const modal = document.getElementById('detailModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function handleDeleteMeeting(id) {
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

// ============================================
// 音频文件上传转写功能
// ============================================

function handleUploadAudioClick() {
    document.getElementById('audioFileInput').click();
}

async function handleAudioFileSelect(event) {
    console.log('[App] handleAudioFileSelect called');
    const file = event.target.files[0];
    console.log('[App] Selected file:', file ? { name: file.name, type: file.type, size: file.size } : 'null');
    
    if (!file) {
        console.log('[App] No file selected');
        return;
    }

    // 验证文件类型（支持 audio/* 和 video/webm）
    if (!file.type.startsWith('audio/') && file.type !== 'video/webm') {
        console.log('[App] Invalid file type:', file.type);
        showToast(i18n ? i18n.get('saveFailed') : '请选择有效的音频文件', 'error');
        return;
    }

    // 验证文件大小（最大 500MB）
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
        console.log('[App] File too large:', file.size);
        showToast(i18n ? i18n.get('saveFailed') : '音频文件大小不能超过 500MB', 'error');
        return;
    }

    try {
        showToast(`${i18n ? i18n.get('audioTranscribing') : '正在处理音频文件'}: ${file.name}`, 'info');
        await processAudioFile(file);
    } catch (error) {
        console.error('[App] Failed to process audio file:', error);
        showToast((i18n ? i18n.get('saveFailed') : '处理音频文件失败') + ': ' + error.message, 'error');
    } finally {
        // 清空文件输入，允许重复选择同一文件
        event.target.value = '';
    }
}

async function processAudioFile(file) {
    console.log('[App] processAudioFile called, currentSettings:', currentSettings ? { 
        hasSttUrl: !!currentSettings.sttApiUrl, 
        hasSttKey: !!currentSettings.sttApiKey 
    } : 'null');
    
    if (!currentSettings || !currentSettings.sttApiUrl || !currentSettings.sttApiKey) {
        console.log('[App] API not configured, showing error');
        showToast(i18n ? i18n.get('testFailed') : '请先配置语音识别API', 'error');
        return;
    }

    showLoading(i18n ? i18n.get('audioTranscribing') : '正在转写音频文件...');

    try {
        // 将 File 对象转换为 Blob
        const audioBlob = new Blob([await file.arrayBuffer()], { type: file.type });
        
        // 为上传的文件设置一个标识性的 duration
        setLastRecordingDuration('上传音频');

        console.log('开始转写音频文件:', { 
            name: file.name, 
            type: file.type, 
            size: file.size,
            apiUrl: currentSettings.sttApiUrl 
        });

        const result = await transcribeAudio(audioBlob, currentSettings.sttApiUrl, currentSettings.sttApiKey, currentSettings.sttModel);

        console.log('转写结果:', result);

        if (!result.success) {
            showToast((i18n ? i18n.get('testFailed') : '转写失败') + ': ' + result.message, 'error');
            hideLoading();
            return;
        }

        updateSubtitleContent(result.text);
        showToast(i18n ? i18n.get('generatingSummary') : '转写完成，正在生成纪要...', 'info');

        // 保存当前转写文本，用于刷新纪要
        currentTranscript = result.text;

        await generateMeetingSummary(result.text, audioBlob);
    } catch (error) {
        console.error('Failed to process audio file:', error);
        showToast((i18n ? i18n.get('saveFailed') : '处理音频文件失败') + ': ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// ============================================
// 会议纪要刷新功能
// ============================================

let currentTranscript = '';

async function handleRefreshSummary() {
    // 获取当前显示的转写文本
    const subtitleContent = document.getElementById('subtitleContent');
    const transcript = subtitleContent ? subtitleContent.textContent.trim() : '';

    if (!transcript || transcript === (i18n ? i18n.get('emptySubtitleHint') : '开始录音后将显示转写内容')) {
        showToast(i18n ? i18n.get('noTranscriptForRefresh') : '请先进行录音或上传音频文件', 'error');
        return;
    }

    if (!currentSettings.summaryApiUrl || !currentSettings.summaryApiKey) {
        showToast('请先配置纪要生成API', 'error');
        return;
    }

    // 添加旋转动画
    const refreshBtn = document.getElementById('btnRefreshSummary');
    refreshBtn.classList.add('spinning');

    try {
        showToast(i18n ? i18n.get('generatingSummary') : '正在重新生成会议纪要...', 'info');

        const result = await generateSummary(transcript, currentSettings.summaryTemplate, currentSettings.summaryApiUrl, currentSettings.summaryApiKey, currentSettings.summaryModel);

        if (!result.success) {
            showToast((i18n ? i18n.get('saveFailed') : '生成纪要失败') + ': ' + result.message, 'error');
            return;
        }

        updateSummaryContent(result.summary);
        showToast(i18n ? i18n.get('summaryRefreshed') : '会议纪要已更新', 'success');
    } catch (error) {
        console.error('Failed to refresh summary:', error);
        showToast((i18n ? i18n.get('saveFailed') : '重新生成纪要失败') + ': ' + error.message, 'error');
    } finally {
        refreshBtn.classList.remove('spinning');
    }
}

document.addEventListener('DOMContentLoaded', initApp);
