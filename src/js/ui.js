function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    
    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    
    toast.innerHTML = icons[type] + '<span>' + message + '</span>';
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ============================================
// 视图管理 - 侧边栏导航
// ============================================

const views = {
    recorder: document.getElementById('recorderView'),
    history: document.getElementById('historyView'),
    settings: document.getElementById('settingsView')
};

let navItems = null;

// 切换视图
function switchView(viewName) {
    // 隐藏所有视图
    Object.values(views).forEach(view => {
        if (view) {
            view.classList.remove('active');
        }
    });
    
    // 显示目标视图
    if (views[viewName]) {
        views[viewName].classList.add('active');
    }
    
    // 更新导航状态
    if (navItems) {
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.view === viewName) {
                item.classList.add('active');
            }
        });
    }
    
    // 如果切换到历史视图，刷新历史列表
    if (viewName === 'history' && typeof loadHistoryList === 'function') {
        loadHistoryList();
    }
}

// 初始化导航事件
function initNavigation() {
    navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const viewName = item.dataset.view;
            if (viewName) {
                switchView(viewName);
            }
        });
    });
}

// 兼容旧代码 - 保留 showSection 函数
function showSection(sectionId) {
    // 映射旧 section ID 到新 view ID
    const sectionToView = {
        'mainSection': 'recorder',
        'historySection': 'history',
        'settingsSection': 'settings'
    };
    
    const viewName = sectionToView[sectionId];
    if (viewName) {
        switchView(viewName);
    }
}

function updateSubtitleContent(text) {
    const subtitleContent = document.getElementById('subtitleContent');
    if (subtitleContent) {
        if (text && text.trim()) {
            subtitleContent.innerHTML = `<div class="content-text">${escapeHtml(text)}</div>`;
        } else {
            const emptyHint = i18n ? i18n.get('emptySubtitleHint') : '开始录音后将显示转写内容';
            subtitleContent.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                            <line x1="12" y1="19" x2="12" y2="22"/>
                        </svg>
                    </div>
                    <p>${emptyHint}</p>
                </div>
            `;
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateSummaryContent(summary) {
    const summaryContent = document.getElementById('summaryContent');
    if (summaryContent) {
        if (summary && summary.trim()) {
            summaryContent.innerHTML = `<div class="content-text">${escapeHtml(summary)}</div>`;
        } else {
            const emptyHint = i18n ? i18n.get('emptySummaryHint') : '录音结束后自动生成会议纪要';
            summaryContent.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                            <polyline points="10 9 9 9 8 9"/>
                        </svg>
                    </div>
                    <p>${emptyHint}</p>
                </div>
            `;
        }
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(i18n ? i18n.get('copySuccess') : '复制成功', 'success');
    }).catch(err => {
        showToast(i18n ? i18n.get('copyFailed') : '复制失败', 'error');
        console.error('Copy error:', err);
    });
}

function renderHistoryList(meetings) {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    if (meetings.length === 0) {
        const noRecordsText = i18n ? i18n.get('noRecording') : '暂无历史记录';
        historyList.innerHTML = `
            <div class="empty-state" style="padding: 80px 20px;">
                <div class="empty-icon" style="width: 64px; height: 64px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                </div>
                <p>${noRecordsText}</p>
            </div>
        `;
        return;
    }

    const viewText = i18n ? i18n.get('view') : '查看';
    const deleteText = i18n ? i18n.get('delete') : '删除';

    historyList.innerHTML = meetings.map(meeting => `
        <div class="history-item">
            <div class="history-item-info">
                <div class="history-item-date">${formatDate(meeting.date)}</div>
                <div class="history-item-meta">
                    <span class="history-item-duration">${meeting.duration}</span>
                </div>
            </div>
            <div class="history-item-actions">
                <button class="btn btn-outline" onclick="viewMeetingDetail('${meeting.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    ${viewText}
                </button>
                <button class="btn btn-danger" onclick="handleDeleteMeeting('${meeting.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    ${deleteText}
                </button>
            </div>
        </div>
    `).join('');
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

async function renderMeetingDetail(meeting) {
    const detailContent = document.getElementById('detailContent');
    if (!detailContent) return;

    // 处理音频文件
    let audioUrl = '';
    let hasAudioFile = false;
    
    if (meeting.audioFile && meeting.audioFile instanceof Blob) {
        // 使用内存中的 Blob
        audioUrl = URL.createObjectURL(meeting.audioFile);
        hasAudioFile = true;
    } else if (meeting.audioFilename && typeof window !== 'undefined' && window.electronAPI) {
        // 从文件系统加载音频
        try {
            const result = await getAudioFile(meeting.audioFilename);
            if (result.success && result.blob) {
                audioUrl = URL.createObjectURL(result.blob);
                hasAudioFile = true;
            }
        } catch (error) {
            console.error('Failed to load audio file:', error);
        }
    }

    const isElectronEnv = typeof window !== 'undefined' && window.electronAPI;

    detailContent.innerHTML = `
        <div class="detail-section">
            <h3>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
                基本信息
            </h3>
            <div class="detail-info">
                <div class="detail-info-item">
                    <div class="detail-info-label">日期</div>
                    <div class="detail-info-value">${formatDate(meeting.date)}</div>
                </div>
                <div class="detail-info-item">
                    <div class="detail-info-label">时长</div>
                    <div class="detail-info-value">${meeting.duration}</div>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                </svg>
                录音文件
                ${meeting.audioFilename ? `
                <span class="path-info-icon" data-path="${escapeHtml(meeting.audioFilename)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span class="path-tooltip">${escapeHtml(meeting.audioFilename)}</span>
                </span>
                ` : ''}
            </h3>
            ${hasAudioFile ? `
            <audio controls class="audio-player">
                <source src="${audioUrl}" type="audio/webm">
                您的浏览器不支持音频播放
            </audio>
            ` : '<p style="color: #888;">音频文件不可用</p>'}
            <div class="detail-actions">
                ${isElectronEnv && meeting.audioFilename ? `
                <button class="action-btn test-btn" id="btnExportAudio_${meeting.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    导出音频
                </button>
                ` : ''}
            </div>
        </div>

        <div class="detail-section">
            <h3>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                转写文本
            </h3>
            <div class="detail-content-area">${meeting.transcript || '暂无转写文本'}</div>
            <button class="action-btn test-btn" onclick="copyTranscript('${meeting.id}')" style="margin-top: 12px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                复制全文
            </button>
        </div>

        <div class="detail-section">
            <h3>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                会议纪要
            </h3>
            <div class="detail-content-area">${meeting.summary || '暂无会议纪要'}</div>
            <button class="action-btn test-btn" onclick="copySummary('${meeting.id}')" style="margin-top: 12px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                复制纪要
            </button>
        </div>
    `;

    // 绑定导出按钮事件
    if (isElectronEnv && meeting.audioFilename) {
        const exportBtn = document.getElementById(`btnExportAudio_${meeting.id}`);
        if (exportBtn) {
            exportBtn.addEventListener('click', () => exportMeetingAudio(meeting));
        }
    }
}

// 导出会议音频
async function exportMeetingAudio(meeting) {
    try {
        if (!meeting.audioFilename) {
            showToast('没有可导出的音频文件', 'error');
            return;
        }

        const result = await exportAudioFile(meeting.audioFilename, meeting.audioFilename);
        if (result.success) {
            showToast(`音频已导出到: ${result.filePath}`, 'success');
        } else {
            showToast('导出失败: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Failed to export audio:', error);
        showToast('导出音频失败', 'error');
    }
}

function updateRecordingButtons(state) {
    const btnStart = document.getElementById('btnStartRecording');
    const btnPause = document.getElementById('btnPauseRecording');
    const btnResume = document.getElementById('btnResumeRecording');
    const btnStop = document.getElementById('btnStopRecording');
    const audioBars = document.getElementById('audioBars');
    const recordingIndicator = document.getElementById('recordingIndicator');

    if (state.isRecording) {
        btnStart.style.display = 'none';
        if (state.isPaused) {
            btnPause.style.display = 'none';
            btnResume.style.display = 'inline-flex';
            btnStop.style.display = 'inline-flex';
            recordingIndicator.classList.remove('active');
        } else {
            btnPause.style.display = 'inline-flex';
            btnResume.style.display = 'none';
            btnStop.style.display = 'inline-flex';
            recordingIndicator.classList.add('active');
        }
    } else {
        btnStart.style.display = 'inline-flex';
        btnPause.style.display = 'none';
        btnResume.style.display = 'none';
        btnStop.style.display = 'none';
        recordingIndicator.classList.remove('active');
    }
}

function showLoading(message) {
    const subtitleContent = document.getElementById('subtitleContent');
    const summaryContent = document.getElementById('summaryContent');
    
    const loadingHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>${message}</p>
        </div>
    `;
    
    if (subtitleContent) {
        subtitleContent.innerHTML = loadingHTML;
    }
    
    if (summaryContent) {
        summaryContent.innerHTML = loadingHTML.replace(message, '生成中...');
    }
}

function loadSettings(settings) {
    if (!settings) return;

    const sttApiUrl = document.getElementById('sttApiUrl');
    const sttApiKey = document.getElementById('sttApiKey');
    const sttModel = document.getElementById('sttModel');
    const summaryApiUrl = document.getElementById('summaryApiUrl');
    const summaryApiKey = document.getElementById('summaryApiKey');
    const summaryModel = document.getElementById('summaryModel');
    const summaryTemplate = document.getElementById('summaryTemplate');

    if (sttApiUrl && settings.sttApiUrl) sttApiUrl.value = settings.sttApiUrl;
    if (sttApiKey && settings.sttApiKey) sttApiKey.value = settings.sttApiKey;
    if (sttModel && settings.sttModel) sttModel.value = settings.sttModel;
    if (summaryApiUrl && settings.summaryApiUrl) summaryApiUrl.value = settings.summaryApiUrl;
    if (summaryApiKey && settings.summaryApiKey) summaryApiKey.value = settings.summaryApiKey;
    if (summaryModel && settings.summaryModel) summaryModel.value = settings.summaryModel;
    if (summaryTemplate && settings.summaryTemplate) summaryTemplate.value = settings.summaryTemplate;
}

function getSettingsFromUI() {
    return {
        sttApiUrl: document.getElementById('sttApiUrl').value.trim(),
        sttApiKey: document.getElementById('sttApiKey').value.trim(),
        sttModel: document.getElementById('sttModel').value.trim(),
        summaryApiUrl: document.getElementById('summaryApiUrl').value.trim(),
        summaryApiKey: document.getElementById('summaryApiKey').value.trim(),
        summaryModel: document.getElementById('summaryModel').value.trim(),
        summaryTemplate: document.getElementById('summaryTemplate').value.trim()
    };
}

const DEFAULT_TEMPLATE = `# 会议纪要

## 会议概述
[会议概述内容]

## 主要议题
[主要议题内容]

## 讨论要点
[讨论要点内容]

## 决策事项
[决策事项内容]

## 待办事项
[待办事项内容]

## 其他事项
[其他事项内容]`;

function loadDefaultTemplate() {
    const summaryTemplate = document.getElementById('summaryTemplate');
    if (summaryTemplate && !summaryTemplate.value) {
        summaryTemplate.value = DEFAULT_TEMPLATE;
    }
}

// ============================================
// 标签页切换功能
// ============================================

function initContentTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            // 移除所有活动状态
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // 添加当前活动状态
            btn.classList.add('active');
            const targetContent = document.getElementById(tabName + 'Tab');
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

// 切换到指定标签页
function switchToTab(tabName) {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // 移除所有活动状态
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    // 添加目标标签页活动状态
    const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    const targetContent = document.getElementById(tabName + 'Tab');
    
    if (targetBtn) targetBtn.classList.add('active');
    if (targetContent) targetContent.classList.add('active');
}
