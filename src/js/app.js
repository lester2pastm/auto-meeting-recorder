let currentSettings = null;
let currentMeetingId = null;
let currentAudioBlob = null;
let currentAudioFilePath = null;
let currentAudioSourceState = null;

const TRANSCRIPT_STATUS = {
    PENDING: 'pending',
    TRANSCRIBING: 'transcribing',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

function containsChineseText(text) {
    return typeof text === 'string' && /[\u4e00-\u9fff]/.test(text);
}

function getLocalizedMessage(key, fallbackMessage) {
    return i18n ? i18n.get(key) : fallbackMessage;
}

function normalizeUserFacingMessage(message, fallbackMessage) {
    if (typeof message !== 'string') {
        return fallbackMessage;
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
        return fallbackMessage;
    }

    return containsChineseText(trimmedMessage) ? trimmedMessage : fallbackMessage;
}

function buildUserFacingErrorToast(baseMessage, detailMessage) {
    const normalizedDetail = normalizeUserFacingMessage(detailMessage, '');
    return normalizedDetail && normalizedDetail !== baseMessage
        ? `${baseMessage}: ${normalizedDetail}`
        : baseMessage;
}

function getAudioSourceHelper() {
    if (typeof window !== 'undefined' && window.audioSourceSettings) {
        return window.audioSourceSettings;
    }

    return {
        AUDIO_SOURCE_AUTO: 'auto',
        AUDIO_SOURCE_UNAVAILABLE: 'unavailable',
        getDefaultAudioSourceSettings: () => ({
            preferredMicSource: 'auto',
            preferredSystemSource: 'auto'
        }),
        resolvePreferredAudioSource: ({ preferredSource, recommendedSource }) => preferredSource || recommendedSource || 'auto',
        buildLinuxAudioSourceState: () => ({
            microphoneSources: [],
            systemSources: [],
            recommendedMicSource: null,
            recommendedSystemSource: null
        })
    };
}

async function initApp() {
    try {
        await initDB();
        await recoverInterruptedMeetingStates();
        
        // 初始化国际化
        if (typeof i18n !== 'undefined') {
            i18n.init();
        }
        
        // 初始化恢复对话框
        if (typeof initRecoveryUI === 'function') {
            initRecoveryUI();
        }
        
        // 检测 Linux FFmpeg 依赖
        await checkFFmpegDependency();
        
        // 获取应用版本
        await loadAppVersion();
        
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
        
        const { getDefaultAudioSourceSettings } = getAudioSourceHelper();
        const defaultAudioSourceSettings = getDefaultAudioSourceSettings(currentSettings || {});
        
        if (!currentSettings) {
            currentSettings = {
                sttApiUrl: '',
                sttApiKey: '',
                sttModel: 'whisper-1',
                summaryApiUrl: '',
                summaryApiKey: '',
                summaryModel: 'gpt-3.5-turbo',
                summaryTemplate: DEFAULT_TEMPLATE,
                ...defaultAudioSourceSettings
            };
            await saveSettings(currentSettings);
            
            // 同时保存到文件系统
            if (typeof window !== 'undefined' && window.electronAPI) {
                await saveConfigToFile(currentSettings);
            }
        } else {
            currentSettings = {
                ...currentSettings,
                ...defaultAudioSourceSettings
            };
        }
        
        loadSettings(currentSettings);
        loadDefaultTemplate();
        await refreshAudioSourceOptions({ silent: true });
        
        // 初始化侧边栏导航
        initNavigation();
        
        // 初始化内容标签页
        initContentTabs();
        
        setupEventListeners();
        
        // 初始化退出保护
        setupAppControl();
        
        // 检查是否有未完成的录音
        if (typeof initRecoveryManager === 'function') {
            const recoveryMeta = await initRecoveryManager();
            if (recoveryMeta && typeof showRecoveryDialog === 'function') {
                // 延迟显示，等待其他初始化完成
                setTimeout(() => {
                    showRecoveryDialog(recoveryMeta);
                }, 500);
            }
        }
        
        showToast(i18n ? i18n.get('initSuccess') : '应用初始化成功', 'success');
    } catch (error) {
        console.error('Failed to initialize app:', error);
        showToast(i18n ? i18n.get('initFailed') : '应用初始化失败', 'error');
    }
}

async function checkFFmpegDependency() {
    if (typeof window === 'undefined' || !window.electronAPI || !window.electronAPI.checkLinuxDependencies) {
        return;
    }
    
    try {
        const platform = await window.electronAPI.getPlatform();
        if (!platform.success || platform.platform !== 'linux') {
            return;
        }
        
        const deps = await window.electronAPI.checkLinuxDependencies();
        
        if (!deps.success) {
            console.error('检测系统依赖失败:', deps.error);
            return;
        }
        
        if (!deps.hasDependencies && deps.missingDeps && deps.missingDeps.length > 0) {
            showDependencyModal(deps.missingDeps);
        }
    } catch (error) {
        console.error('检测依赖失败:', error);
    }
}

async function loadAppVersion() {
    if (typeof window === 'undefined' || !window.electronAPI || !window.electronAPI.getAppVersion) {
        return;
    }
    
    try {
        const result = await window.electronAPI.getAppVersion();
        if (result.success) {
            const versionEl = document.getElementById('appVersion');
            if (versionEl) {
                versionEl.textContent = result.version;
            }
        }
    } catch (error) {
        console.error('获取应用版本失败:', error);
    }
}

function buildOptionList(baseOptions, options = []) {
    const seen = new Set();
    const merged = [];

    [...baseOptions, ...options].forEach(option => {
        if (!option || !option.id || seen.has(option.id)) {
            return;
        }
        seen.add(option.id);
        merged.push(option);
    });

    return merged;
}

function buildAudioSourceStatusText(platform, micSources, systemSources) {
    if (platform === 'linux') {
        return `已检测到 ${micSources.length} 个麦克风源 / ${systemSources.length} 个系统音频源`;
    }

    if (systemSources.some(source => source.id === 'unavailable')) {
        return `已检测到 ${micSources.length} 个麦克风源；系统音频源当前由系统自动选择`;
    }

    return `已检测到 ${micSources.length} 个麦克风源 / ${systemSources.length} 个系统音频源`;
}

async function getBrowserMicrophoneSources() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
        return [];
    }

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices
            .filter(device => device.kind === 'audioinput')
            .map((device, index) => ({
                id: device.deviceId,
                label: device.label || `麦克风 ${index + 1}`,
                description: device.label || `麦克风 ${index + 1}`
            }));
    } catch (error) {
        console.error('Failed to enumerate browser microphone devices:', error);
        return [];
    }
}

async function refreshAudioSourceOptions({ silent = false } = {}) {
    const {
        AUDIO_SOURCE_AUTO,
        AUDIO_SOURCE_UNAVAILABLE,
        resolvePreferredAudioSource,
        buildLinuxAudioSourceState
    } = getAudioSourceHelper();

    let platform = 'unknown';
    let microphoneSources = [];
    let systemSources = [];
    let recommendedMicSource = null;
    let recommendedSystemSource = null;

    if (window.electronAPI && window.electronAPI.getPlatform) {
        const platformResult = await window.electronAPI.getPlatform();
        if (platformResult.success) {
            platform = platformResult.platform;
        }
    }

    if (platform === 'linux' && window.electronAPI && window.electronAPI.getAudioSourceOptions) {
        const sourceResult = await window.electronAPI.getAudioSourceOptions();
        const linuxState = buildLinuxAudioSourceState([
            ...(sourceResult.microphoneSources || []).map(source => ({
                name: source.id,
                description: source.description || source.label || source.id,
                driver: source.driver || ''
            })),
            ...(sourceResult.systemSources || []).map(source => ({
                name: source.id,
                description: source.description || source.label || source.id,
                driver: source.driver || ''
            }))
        ]);

        microphoneSources = linuxState.microphoneSources;
        systemSources = linuxState.systemSources;
        recommendedMicSource = sourceResult.recommendedMicSource || linuxState.recommendedMicSource;
        recommendedSystemSource = sourceResult.recommendedSystemSource || linuxState.recommendedSystemSource;
    } else {
        microphoneSources = await getBrowserMicrophoneSources();
    }

    const micOptions = buildOptionList(
        [{ id: AUDIO_SOURCE_AUTO, label: '自动选择（推荐）' }],
        microphoneSources
    );
    const systemBaseOptions = [{ id: AUDIO_SOURCE_AUTO, label: '自动选择（推荐）' }];
    const systemUnavailableOptions = systemSources.length === 0
        ? [{ id: AUDIO_SOURCE_UNAVAILABLE, label: '当前不可用' }]
        : [];
    const systemOptions = buildOptionList(systemBaseOptions, [...systemSources, ...systemUnavailableOptions]);

    const selectedMicSource = resolvePreferredAudioSource({
        preferredSource: currentSettings?.preferredMicSource || AUDIO_SOURCE_AUTO,
        sources: micOptions,
        recommendedSource: recommendedMicSource
    });
    const selectedSystemSource = resolvePreferredAudioSource({
        preferredSource: currentSettings?.preferredSystemSource || AUDIO_SOURCE_AUTO,
        sources: systemOptions,
        recommendedSource: recommendedSystemSource
    });
    const statusText = buildAudioSourceStatusText(platform, microphoneSources, systemSources);

    currentAudioSourceState = {
        platform,
        microphoneSources,
        systemSources,
        micOptions,
        systemOptions,
        recommendedMicSource,
        recommendedSystemSource,
        selectedMicSource,
        selectedSystemSource
    };

    renderAudioSourceOptions({
        microphoneSources: micOptions,
        systemSources: systemOptions,
        selectedMicSource,
        selectedSystemSource,
        statusText
    });

    if (!silent) {
        showToast('音频源列表已刷新', 'success');
    }
}

function showDependencyModal(missingDeps) {
    const modal = document.getElementById('dependencyModal');
    if (!modal) {
        showToast('Linux 系统需要安装以下依赖才能录制系统音频:\n' + 
            missingDeps.map(d => `${d.name}: ${d.command}`).join('\n'), 'warning');
        return;
    }
    
    const body = document.getElementById('dependencyModalBody');
    if (body) {
        body.innerHTML = `
            <p>以下依赖未安装，将无法录制系统音频:</p>
            <ul style="margin: 15px 0; padding-left: 20px;">
                ${missingDeps.map(d => `<li style="margin-bottom: 10px;"><strong>${d.name}:</strong><br><code style="font-size: 13px;">${d.command}</code></li>`).join('')}
            </ul>
            <p style="color: #888;">安装后重启应用即可。</p>
        `;
    }
    
    modal.classList.add('active');
    
    const closeModal = () => modal.classList.remove('active');
    
    document.getElementById('dependencyModalCloseBtn')?.addEventListener('click', closeModal);
    document.getElementById('dependencyModalConfirm')?.addEventListener('click', closeModal);
    modal.querySelector('.modal-overlay')?.addEventListener('click', closeModal);
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
    document.getElementById('btnRetryTranscription').addEventListener('click', handleRetryTranscription);
    
    // 刷新纪要按钮
    document.getElementById('btnRefreshSummary').addEventListener('click', handleRefreshSummary);
    
    // 设置页面按钮
    document.getElementById('btnTestSttApi').addEventListener('click', handleTestSttApi);
    document.getElementById('btnTestSummaryApi').addEventListener('click', handleTestSummaryApi);
    document.getElementById('btnSaveTemplate').addEventListener('click', handleSaveTemplate);
    document.getElementById('btnRefreshAudioSources').addEventListener('click', () => refreshAudioSourceOptions());
    document.getElementById('btnSaveAudioSources').addEventListener('click', handleSaveAudioSources);
}

let isRecordingWorkflowBusy = false;

function updateRecordingWorkflowState(isBusy, message = '', targets) {
    isRecordingWorkflowBusy = isBusy;

    if (typeof updateRecordingButtons === 'function' && typeof getRecordingState === 'function') {
        updateRecordingButtons(getRecordingState(), { isProcessing: isBusy });
    }

    if (isBusy && message && typeof showLoading === 'function') {
        showLoading(message, targets);
    }
}

function clearRecordingWorkflowState() {
    isRecordingWorkflowBusy = false;

    if (typeof updateRecordingButtons === 'function' && typeof getRecordingState === 'function') {
        updateRecordingButtons(getRecordingState(), { isProcessing: false });
    }
}

function isExitProtectionActive() {
    let isRecordingActive = false;

    if (typeof getRecordingState === 'function') {
        const state = getRecordingState();
        isRecordingActive = !!(state && state.isRecording);
    } else if (typeof window.isRecording !== 'undefined') {
        isRecordingActive = !!window.isRecording;
    }

    return isRecordingActive || isRecordingWorkflowBusy;
}

function clearCurrentMeetingContext() {
    currentMeetingId = null;
}

async function recoverInterruptedMeetingStates() {
    if (typeof getAllMeetings !== 'function' || typeof updateMeeting !== 'function') {
        return;
    }

    const meetings = await getAllMeetings();
    const recoveryTasks = [];

    meetings.forEach((meeting) => {
        if (!meeting || !meeting.id) {
            return;
        }

        if (meeting.transcriptStatus === TRANSCRIPT_STATUS.TRANSCRIBING) {
            recoveryTasks.push(updateMeeting(meeting.id, {
                transcriptStatus: TRANSCRIPT_STATUS.FAILED
            }));
        }

        if (meeting.summaryStatus === 'generating') {
            recoveryTasks.push(updateMeeting(meeting.id, {
                summaryStatus: ''
            }));
        }
    });

    if (recoveryTasks.length > 0) {
        await Promise.all(recoveryTasks);
    }
}

function getUploadAudioExtension(file) {
    if (file && typeof file.name === 'string') {
        const filename = file.name.trim();
        const lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex > -1 && lastDotIndex < filename.length - 1) {
            return filename.slice(lastDotIndex);
        }
    }

    return '.webm';
}

async function persistUploadedAudioForTranscription(file, arrayBuffer) {
    if (
        typeof window === 'undefined' ||
        !window.electronAPI ||
        typeof window.electronAPI.saveAudio !== 'function'
    ) {
        return null;
    }

    const extension = getUploadAudioExtension(file);
    const uploadFilename = `upload_${Date.now()}${extension}`;
    const binaryData = new Uint8Array(arrayBuffer);
    const result = await window.electronAPI.saveAudio(binaryData, uploadFilename);

    if (!result || !result.success || !result.filePath) {
        throw new Error(result && result.error ? result.error : '保存上传音频失败');
    }

    return result.filePath;
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
        clearCurrentMeetingContext();
        await startRecording();
        updateRecordingButtons(getRecordingState());
        showToast('录音已开始', 'success');
    } catch (error) {
        console.error('Failed to start recording:', error);
        showToast(buildUserFacingErrorToast(getLocalizedMessage('toastRecordingStartFailed', '录音启动失败'), error.message), 'error');
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
    const stopBtn = document.getElementById('btnStopRecording');
    let shouldKeepBusyState = false;
    
    try {
        stopBtn.classList.add('btn-loading');
        stopBtn.disabled = true;
        updateRecordingWorkflowState(true, i18n ? i18n.get('workflowStopping') : '正在停止录音...');
        
        const currentDuration = getRecordingDuration();
        setLastRecordingDuration(currentDuration);
        
        // 先注册回调：文件读取完成后自动保存记录并转写
        if (typeof setAudioFileReadyCallback === 'function') {
            setAudioFileReadyCallback(async (audioBlob) => {
                try {
                    if (audioBlob) {
                        updateRecordingWorkflowState(true, i18n ? i18n.get('workflowSaving') : '正在保存录音...');
                        const meeting = await saveEmptyMeetingRecord(audioBlob);
                        updateRecordingWorkflowState(true, i18n ? i18n.get('workflowTranscribing') : '正在转写...');
                        showToast(i18n ? i18n.get('toastRecordingStopped') : '录音已停止，正在转写...', 'info');
                        await processRecording(audioBlob, meeting.id, meeting.audioFilename || null);
                    } else {
                        clearRecordingWorkflowState();
                        hideLoading();
                    }
                } catch (error) {
                    clearRecordingWorkflowState();
                    hideLoading();
                    console.error('异步处理录音文件失败:', error);
                    showToast(buildUserFacingErrorToast(getLocalizedMessage('toastProcessingFailed', '处理录音失败'), error.message), 'error');
                } finally {
                    if (typeof setAudioFileReadyCallback === 'function') {
                        setAudioFileReadyCallback(null);
                    }
                }
            });
        }
        
        // 停止录音（Linux 平台会同步等待文件读取完成）
        const audioBlob = await stopRecording();
        updateRecordingButtons(getRecordingState(), { isProcessing: true });
        
        // 如果 audioBlob 已准备好（Linux 平台），直接处理
        if (audioBlob) {
            updateRecordingWorkflowState(true, i18n ? i18n.get('workflowSaving') : '正在保存录音...');
            const meeting = await saveEmptyMeetingRecord(audioBlob);
            updateRecordingWorkflowState(true, i18n ? i18n.get('workflowTranscribing') : '正在转写...');
            showToast(i18n ? i18n.get('toastRecordingStopped') : '录音已停止，正在转写...', 'info');
            await processRecording(audioBlob, meeting.id, meeting.audioFilename || null);
        } else {
            shouldKeepBusyState = true;
            updateRecordingWorkflowState(true, i18n ? i18n.get('workflowOrganizing') : '正在整理录音...');
        }
    } catch (error) {
        console.error('Failed to stop recording:', error);
        clearRecordingWorkflowState();
        hideLoading();
        showToast('停止录音失败', 'error');
    } finally {
        stopBtn.classList.remove('btn-loading');
        stopBtn.disabled = false;

        if (!shouldKeepBusyState) {
            clearRecordingWorkflowState();
        }
    }
}

// 新增：保存空记录（pending状态）
async function saveEmptyMeetingRecord(audioBlob) {
    const meeting = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        duration: lastRecordingDuration,
        audioFile: audioBlob,
        transcript: '',
        summary: '',
        transcriptStatus: TRANSCRIPT_STATUS.PENDING
    };
    
    return await saveMeeting(meeting);
}

async function processRecording(audioBlob, meetingId, audioFilePath = null) {
    try {
        console.log('处理录音, meetingId:', meetingId, '当前设置:', currentSettings);

        const transcriptLoadingTargets = {
            transcript: true,
            summary: true,
            summaryMessage: i18n ? i18n.get('workflowSummaryPending') : '转写完成后自动生成纪要...'
        };

        if (!currentSettings.sttApiUrl || !currentSettings.sttApiKey) {
            console.error('API 未配置:', { url: currentSettings.sttApiUrl, key: currentSettings.sttApiKey ? '已设置' : '未设置' });
            if (meetingId) {
                await updateMeeting(meetingId, {
                    transcriptStatus: TRANSCRIPT_STATUS.FAILED
                });
            }
            showToast('请先配置语音识别API', 'error');
            return;
        }

        updateRecordingWorkflowState(
            true,
            i18n ? i18n.get('workflowTranscribingDetail') : '正在识别录音内容...',
            transcriptLoadingTargets
        );
        console.log('开始调用转写 API:', { url: currentSettings.sttApiUrl, model: currentSettings.sttModel });

        // 更新为转写中状态
        await updateMeeting(meetingId, { 
            transcriptStatus: TRANSCRIPT_STATUS.TRANSCRIBING 
        });

        const result = await transcribeAudio(
            audioBlob,
            currentSettings.sttApiUrl,
            currentSettings.sttApiKey,
            currentSettings.sttModel,
            audioFilePath,
            (message) => updateRecordingWorkflowState(true, message, transcriptLoadingTargets)
        );

        console.log('转写结果:', result);

        if (!result.success) {
            // 转写失败，更新状态为 failed
            await updateMeeting(meetingId, { 
                transcriptStatus: TRANSCRIPT_STATUS.FAILED 
            });
            
            // 在全文区域显示清晰错误提示
            let errorHint = '转写失败，请重新转写';
            if (result.message && (result.message.includes('超时') || result.message.includes('网络') || result.message.includes('连接'))) {
                errorHint = '网络不稳定，转写失败，请重新转写';
            }
            updateSubtitleContent(errorHint);
            
            // 保存音频blob和meetingId用于重试
            currentAudioBlob = audioBlob;
            currentMeetingId = meetingId;
            currentAudioFilePath = audioFilePath;
            showRetryTranscriptionButton();
            
            showToast(buildUserFacingErrorToast('转写失败', result.message), 'error');
            return;
        }

        updateSubtitleContent(result.text);
        hideRetryTranscriptionButton();

        // 保存当前转写文本，用于刷新纪要
        currentTranscript = result.text;

        // 更新转写成功状态和内容
        await updateMeeting(meetingId, {
            transcript: result.text,
            transcriptStatus: TRANSCRIPT_STATUS.COMPLETED
        });

        // 检查转写内容是否为空，空内容不生成纪要
        console.log('[DEBUG] result.text length:', (result.text || '').length, 'content:', JSON.stringify(result.text));
        if (!result.text || result.text.trim().length === 0) {
            console.log('[DEBUG] Empty transcript branch entered');
            if (typeof updateSummaryContent === 'function') {
                updateSummaryContent('');
            }
            updateRecordingWorkflowState(true, i18n ? i18n.get('workflowCompleted') : '处理完成', { transcript: false, summary: false });
            // 保存记录（纪要为空白）
            await saveMeetingRecord(result.text || '', '', audioBlob, meetingId);
        } else {
            updateRecordingWorkflowState(true, i18n ? i18n.get('workflowPreparingSummary') : '正在整理转写内容...', { transcript: false, summary: true });
            showToast(i18n ? i18n.get('toastTranscriptionComplete') : '转写完成，正在生成纪要...', 'info');
            await generateMeetingSummary(result.text, audioBlob, meetingId);
        }
    } catch (error) {
        console.error('Failed to process recording:', error);
        // 异常时更新状态为 failed
        await updateMeeting(meetingId, { 
            transcriptStatus: TRANSCRIPT_STATUS.FAILED 
        });
        showToast('处理录音失败', 'error');
    } finally {
        clearRecordingWorkflowState();
        hideLoading();
    }
}

async function generateMeetingSummary(transcript, audioBlob, meetingId) {
    console.log('[App] generateMeetingSummary called, meetingId:', meetingId);
    let summary = '';

    try {
        updateRecordingWorkflowState(true, i18n ? i18n.get('workflowGeneratingSummary') : '正在生成会议纪要...', { transcript: false, summary: true });

        // 检查转写内容是否为空
        if (!transcript || transcript.trim().length === 0) {
            console.log('[App] Transcript is empty, skipping summary generation');
            if (typeof updateSummaryContent === 'function') {
                updateSummaryContent('');
            }
            // 仍然保存记录（纪要为空白）
            await saveMeetingRecord(transcript || '', '', audioBlob, meetingId);
            return;
        }

        if (!currentSettings.summaryApiUrl || !currentSettings.summaryApiKey) {
            console.log('[App] Summary API not configured, skipping summary generation');
            showToast('未配置纪要生成API，仅保存转写内容', 'info');
        } else {
            const result = await generateSummary(
                transcript,
                currentSettings.summaryTemplate,
                currentSettings.summaryApiUrl,
                currentSettings.summaryApiKey,
                currentSettings.summaryModel,
                (message) => updateRecordingWorkflowState(true, message, { transcript: false, summary: true })
            );

            if (!result.success) {
                console.log('[App] Summary generation failed:', result.message);
                showToast(buildUserFacingErrorToast('生成纪要失败', result.message), 'error');
            } else {
                summary = result.summary;
                updateSummaryContent(summary);
                showToast('纪要生成成功', 'success');
            }
        }

        // 无论纪要生成成功与否，都保存会议记录
        console.log('[App] Saving meeting record, meetingId:', meetingId, 'hasSummary:', !!summary);
        await saveMeetingRecord(transcript, summary, audioBlob, meetingId);
    } catch (error) {
        console.error('[App] Failed to generate summary:', error);
        showToast('生成纪要失败', 'error');
        // 即使出错也尝试保存转写内容
        try {
            await saveMeetingRecord(transcript, '', audioBlob, meetingId);
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

async function saveMeetingRecord(transcript, summary, audioBlob, meetingId = null) {
    console.log('[App] saveMeetingRecord called, meetingId:', meetingId, 'audioBlob:', audioBlob ? { size: audioBlob.size, type: audioBlob.type } : 'null');
    try {
        if (meetingId) {
            // Update existing meeting record
            const updates = {
                transcript: transcript,
                summary: summary,
                transcriptStatus: TRANSCRIPT_STATUS.COMPLETED
            };
            await updateMeeting(meetingId, updates);
            console.log('[App] updateMeeting completed successfully for meetingId:', meetingId);
        } else {
            // Create new meeting record (backward compatible)
            const meeting = {
                id: Date.now().toString(),
                date: new Date().toISOString(),
                duration: lastRecordingDuration,
                transcript: transcript,
                summary: summary,
                transcriptStatus: TRANSCRIPT_STATUS.COMPLETED
            };
            if (currentAudioFilePath) {
                meeting.audioFilename = currentAudioFilePath;
                meeting.audioStorageStatus = 'saved';
            } else {
                meeting.audioFile = audioBlob;
            }
            console.log('[App] Created new meeting object, has audioFile:', !!meeting.audioFile);
            await saveMeeting(meeting);
            console.log('[App] saveMeeting completed successfully');
        }
        const hasTranscript = !!(transcript && transcript.trim());
        if (hasTranscript) {
            showToast('会议记录已保存', 'success');
        } else {
            showToast('未识别到有效语音，会议记录已保存', 'warning');
        }
    } catch (error) {
        console.error('[App] Failed to save meeting:', error);
        showToast(buildUserFacingErrorToast(getLocalizedMessage('toastSaveMeetingFailed', '保存会议记录失败'), error.message), 'error');
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

async function persistSettings(settings) {
    await saveSettings(settings);

    if (typeof window !== 'undefined' && window.electronAPI) {
        await saveConfigToFile(settings);
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
        await persistSettings(currentSettings);
        showToast(`${normalizeUserFacingMessage(result.message, getLocalizedMessage('toastConnectionTestSuccess', '连接测试成功'))}，设置已自动保存`, 'success');
    } else {
        showToast(normalizeUserFacingMessage(result.message, getLocalizedMessage('toastConnectionTestFailed', '连接测试失败')), 'error');
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
        await persistSettings(currentSettings);
        showToast(`${normalizeUserFacingMessage(result.message, getLocalizedMessage('toastConnectionTestSuccess', '连接测试成功'))}，设置已自动保存`, 'success');
    } else {
        showToast(normalizeUserFacingMessage(result.message, getLocalizedMessage('toastConnectionTestFailed', '连接测试失败')), 'error');
    }
}

async function handleSaveTemplate() {
    try {
        const settings = getSettingsFromUI();
        await persistSettings(settings);
        currentSettings = settings;
        showToast('模板已保存', 'success');
    } catch (error) {
        console.error('Failed to save template:', error);
        showToast('保存模板失败', 'error');
    }
}

async function handleSaveAudioSources() {
    try {
        const settings = getSettingsFromUI();
        currentSettings = {
            ...currentSettings,
            preferredMicSource: settings.preferredMicSource,
            preferredSystemSource: settings.preferredSystemSource
        };

        await persistSettings(currentSettings);

        await refreshAudioSourceOptions({ silent: true });
        showToast('音频源设置已保存', 'success');
    } catch (error) {
        console.error('Failed to save audio source settings:', error);
        showToast('保存音频源设置失败', 'error');
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

    clearCurrentMeetingContext();

    if (typeof cleanupDetailAudioPreview === 'function') {
        cleanupDetailAudioPreview();
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
// 会议详情页刷新功能
// ============================================

/**
 * 在会议详情页重新转写音频
 * @param {string} meetingId - 会议ID
 */
async function handleRefreshTranscriptInDetail(meetingId) {
    let shouldCheckCompletion = false;

    try {
        const meeting = await getMeeting(meetingId);
        if (!meeting) {
            showToast('未找到会议记录', 'error');
            return;
        }

        // 检查是否有音频文件
        let audioBlob = null;
        if (meeting.audioFile && meeting.audioFile instanceof Blob) {
            audioBlob = meeting.audioFile;
        } else if (meeting.audioFilename && window.electronAPI) {
            // 从文件系统加载音频
            const result = await getAudioFile(meeting.audioFilename);
            if (result.success && result.blob) {
                audioBlob = result.blob;
            }
        }

        if (!audioBlob) {
            showToast('没有可用的音频文件', 'error');
            return;
        }

        await renderMeetingDetail({
            ...meeting,
            transcript: '',
            transcriptStatus: TRANSCRIPT_STATUS.TRANSCRIBING
        });

        showToast('正在重新转写...', 'info');

        // 调用重试转写
        const retryResult = await retryTranscription(meetingId, audioBlob, meeting.audioFilename || null);
        if (!retryResult || retryResult.allowed === false) {
            return;
        }

        shouldCheckCompletion = true;
    } catch (error) {
        console.error('Failed to refresh transcript:', error);
        showToast(buildUserFacingErrorToast(getLocalizedMessage('toastRetryTranscriptionFailed', '重新转写失败'), error.message), 'error');
    } finally {
        const updatedMeeting = await getMeeting(meetingId);
        if (updatedMeeting) {
            await renderMeetingDetail(updatedMeeting);

            if (shouldCheckCompletion && updatedMeeting.transcriptStatus === TRANSCRIPT_STATUS.COMPLETED) {
                showToast('转写完成', 'success');
            }
            return;
        }

        const refreshBtn = document.getElementById(`btnRefreshTranscript_${meetingId}`);
        if (refreshBtn) {
            refreshBtn.classList.remove('btn-loading');
            refreshBtn.disabled = false;
        }
    }
}

/**
 * 在会议详情页重新生成会议纪要
 * @param {string} meetingId - 会议ID
 */
async function handleRefreshSummaryInDetail(meetingId) {
    let shouldCheckCompletion = false;

    try {
        const meeting = await getMeeting(meetingId);
        if (!meeting) {
            showToast('未找到会议记录', 'error');
            return;
        }

        if (!meeting.transcript) {
            showToast('没有转写文本，请先重新转写', 'error');
            return;
        }

        if (!currentSettings.summaryApiUrl || !currentSettings.summaryApiKey) {
            showToast('请先配置纪要生成API', 'error');
            return;
        }

        await renderMeetingDetail({
            ...meeting,
            summary: '',
            summaryStatus: 'generating'
        });

        showToast('正在重新生成纪要...', 'info');

        // 调用生成纪要 API
        const result = await generateSummary(
            meeting.transcript,
            currentSettings.summaryTemplate,
            currentSettings.summaryApiUrl,
            currentSettings.summaryApiKey,
            currentSettings.summaryModel
        );

        if (!result.success) {
            showToast(buildUserFacingErrorToast('生成纪要失败', result.message), 'error');
            return;
        }

        // 更新数据库中的纪要
        await updateMeeting(meetingId, {
            summary: result.summary
        });
        shouldCheckCompletion = true;
    } catch (error) {
        console.error('Failed to refresh summary:', error);
        showToast(buildUserFacingErrorToast(getLocalizedMessage('toastRegenerateSummaryFailed', '重新生成纪要失败'), error.message), 'error');
    } finally {
        const updatedMeeting = await getMeeting(meetingId);
        if (updatedMeeting) {
            await renderMeetingDetail(updatedMeeting);

            if (shouldCheckCompletion) {
                showToast('纪要已重新生成', 'success');
            }
            return;
        }

        const refreshBtn = document.getElementById(`btnRefreshSummary_${meetingId}`);
        if (refreshBtn) {
            refreshBtn.classList.remove('btn-loading');
            refreshBtn.disabled = false;
        }
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
        showToast(buildUserFacingErrorToast(i18n ? i18n.get('saveFailed') : '处理音频文件失败', error.message), 'error');
    } finally {
        // 清空文件输入，允许重复选择同一文件
        event.target.value = '';
    }
}

function showRetryTranscriptionButton() {
    const btn = document.getElementById('btnRetryTranscription');
    if (btn) btn.style.display = 'inline-flex';
}

function hideRetryTranscriptionButton() {
    const btn = document.getElementById('btnRetryTranscription');
    if (btn) btn.style.display = 'none';
}

async function handleRetryTranscription() {
    if (!currentAudioBlob) {
        showToast('没有可重新转写的音频', 'warning');
        return;
    }
    
    if (!currentSettings || !currentSettings.sttApiUrl || !currentSettings.sttApiKey) {
        showToast(i18n ? i18n.get('testFailed') : '请先配置语音识别API', 'error');
        return;
    }
    
    try {
        showLoading(i18n ? i18n.get('audioTranscribing') : '正在重新转写...');
        hideRetryTranscriptionButton();

        if (currentMeetingId) {
            const retryResult = await retryTranscription(
                currentMeetingId,
                currentAudioBlob,
                currentAudioFilePath
            );

            if (!retryResult || retryResult.allowed === false) {
                showRetryTranscriptionButton();
            }

            return;
        }

        const result = await transcribeAudio(
            currentAudioBlob,
            currentSettings.sttApiUrl,
            currentSettings.sttApiKey,
            currentSettings.sttModel,
            currentAudioFilePath
        );

        if (!result.success) {
            showRetryTranscriptionButton();
            showToast(buildUserFacingErrorToast(i18n ? i18n.get('testFailed') : '转写失败', result.message), 'error');
            return;
        }

        hideRetryTranscriptionButton();
        updateSubtitleContent(result.text);
        currentTranscript = result.text;
        await generateMeetingSummary(result.text, currentAudioBlob, null);
    } catch (error) {
        showRetryTranscriptionButton();
        showToast(buildUserFacingErrorToast(getLocalizedMessage('toastRetryTranscriptionFailed', '重新转写失败'), error.message), 'error');
    } finally {
        hideLoading();
    }
}

async function processAudioFile(file) {
    console.log('[App] processAudioFile called, currentSettings:', currentSettings ? { 
        hasSttUrl: !!currentSettings.sttApiUrl, 
        hasSttKey: !!currentSettings.sttApiKey 
    } : 'null');

    clearCurrentMeetingContext();
    
    if (!currentSettings || !currentSettings.sttApiUrl || !currentSettings.sttApiKey) {
        console.log('[App] API not configured, showing error');
        showToast(i18n ? i18n.get('testFailed') : '请先配置语音识别API', 'error');
        return;
    }

    showLoading(i18n ? i18n.get('audioTranscribing') : '正在转写音频文件...');

    try {
        const audioArrayBuffer = await file.arrayBuffer();
        const managedAudioFilePath = await persistUploadedAudioForTranscription(file, audioArrayBuffer);

        // 将 File 对象转换为 Blob
        const audioBlob = new Blob([audioArrayBuffer], { type: file.type });
        currentAudioBlob = audioBlob;
        currentAudioFilePath = managedAudioFilePath;
        
        // 为上传的文件设置一个标识性的 duration
        setLastRecordingDuration('上传音频');

        console.log('开始转写音频文件:', { 
            name: file.name, 
            type: file.type, 
            size: file.size,
            apiUrl: currentSettings.sttApiUrl 
        });

        const result = await transcribeAudio(
            audioBlob,
            currentSettings.sttApiUrl,
            currentSettings.sttApiKey,
            currentSettings.sttModel,
            managedAudioFilePath
        );

        console.log('转写结果:', result);

        if (!result.success) {
            // 转写失败，显示重试按钮
            updateSubtitleContent('转写失败，请重新转写');
            showRetryTranscriptionButton();
            showToast(buildUserFacingErrorToast(i18n ? i18n.get('testFailed') : '转写失败', result.message), 'error');
            hideLoading();
            return;
        }
        
        // 转写成功，隐藏重试按钮
        hideRetryTranscriptionButton();

        updateSubtitleContent(result.text);
        showToast(i18n ? i18n.get('generatingSummary') : '转写完成，正在生成纪要...', 'info');

        // 保存当前转写文本，用于刷新纪要
        currentTranscript = result.text;

        await generateMeetingSummary(result.text, audioBlob);
    } catch (error) {
        console.error('Failed to process audio file:', error);
        updateSubtitleContent('处理音频文件失败，请重试');
        showToast(buildUserFacingErrorToast(i18n ? i18n.get('saveFailed') : '处理音频文件失败', error.message), 'error');
    } finally {
        hideLoading();
    }
}

// ============================================
// 转写管理器实例
// ============================================

const transcriptionManager = new TranscriptionManager();

// ============================================
// 重试转写功能
// ============================================

/**
 * 重试转写会议录音
 * @param {string} meetingId - 会议ID
 * @param {Blob} audioBlob - 音频数据
 * @returns {Promise<{allowed: boolean}>} - 是否允许转写
 */
async function retryTranscription(meetingId, audioBlob, audioFilePath = null) {
    if (!transcriptionManager.canTranscribe(meetingId)) {
        showToast('请等待10秒后再试', 'warning');
        return { allowed: false };
    }
    
    transcriptionManager.recordTranscriptionTime(meetingId);
    
    // 重置状态为 pending
    await updateMeeting(meetingId, { 
        transcriptStatus: TRANSCRIPT_STATUS.PENDING,
        transcript: ''
    });
    
    // 重新转写
    await processRecording(audioBlob, meetingId, audioFilePath);
    
    return { allowed: true };
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
            showToast(buildUserFacingErrorToast(i18n ? i18n.get('saveFailed') : '生成纪要失败', result.message), 'error');
            return;
        }

        updateSummaryContent(result.summary);
        if (currentMeetingId) {
            await updateMeeting(currentMeetingId, {
                summary: result.summary
            });
        }
        showToast(i18n ? i18n.get('summaryRefreshed') : '会议纪要已更新', 'success');
    } catch (error) {
        console.error('Failed to refresh summary:', error);
        showToast(buildUserFacingErrorToast(getLocalizedMessage('toastRegenerateSummaryFailed', '重新生成纪要失败'), error.message), 'error');
    } finally {
        refreshBtn.classList.remove('spinning');
    }
}

// ============================================
// 应用控制与退出保护
// ============================================

function setupAppControl() {
    if (window.electronAPI && window.electronAPI.onCheckRecordingStatus) {
        window.electronAPI.onCheckRecordingStatus(() => {
            if (isExitProtectionActive()) {
                showExitConfirmModal();
            } else {
                window.electronAPI.forceClose();
            }
        });
    }
}

function showExitConfirmModal() {
    const modal = document.getElementById('exitConfirmModal');
    if (!modal) return;
    
    modal.classList.add('active');
    
    const btnCancel = document.getElementById('btnCancelExit');
    const btnConfirm = document.getElementById('btnConfirmExit');
    const btnClose = document.getElementById('btnCloseExitModal');
    const overlay = document.getElementById('exitConfirmOverlay');

    const closeModal = () => {
        modal.classList.remove('active');
    };

    const handleConfirm = () => {
        closeModal();
        if (window.electronAPI && window.electronAPI.forceClose) {
            window.electronAPI.forceClose();
        }
    };
    
    if (btnCancel) btnCancel.onclick = closeModal;
    if (btnClose) btnClose.onclick = closeModal;
    if (overlay) overlay.onclick = closeModal;
    if (btnConfirm) btnConfirm.onclick = handleConfirm;
}

if (typeof window !== 'undefined') {
    window.getAudioSourceSelection = function getAudioSourceSelection() {
        return {
            settings: currentSettings,
            state: currentAudioSourceState
        };
    };
}

document.addEventListener('DOMContentLoaded', initApp);
