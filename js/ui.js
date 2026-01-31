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
    if (viewName === 'history' && typeof loadMeetings === 'function') {
        loadMeetings();
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
            subtitleContent.textContent = text;
        } else {
            subtitleContent.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="22"/>
                    </svg>
                    <p>暂无转写内容</p>
                </div>
            `;
        }
    }
}

function updateSummaryContent(summary) {
    const summaryContent = document.getElementById('summaryContent');
    if (summaryContent) {
        if (summary && summary.trim()) {
            summaryContent.textContent = summary;
        } else {
            summaryContent.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                    </svg>
                    <p>暂无会议纪要</p>
                </div>
            `;
        }
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('复制成功', 'success');
    }).catch(err => {
        showToast('复制失败', 'error');
        console.error('Copy error:', err);
    });
}

function renderHistoryList(meetings) {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    if (meetings.length === 0) {
        historyList.innerHTML = `
            <div class="empty-state" style="padding: 60px 20px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 64px; height: 64px; margin-bottom: 20px;">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
                <p style="font-size: 1.1rem;">暂无历史记录</p>
                <p style="font-size: 0.9rem; margin-top: 8px;">开始录音后会自动保存记录</p>
            </div>
        `;
        return;
    }

    historyList.innerHTML = meetings.map(meeting => `
        <div class="history-item">
            <div class="history-item-info">
                <div class="history-item-date">${formatDate(meeting.date)}</div>
                <div class="history-item-duration">${meeting.duration}</div>
            </div>
            <div class="history-item-actions">
                <button class="view-btn" onclick="viewMeetingDetail('${meeting.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    查看
                </button>
                <button class="delete-btn" onclick="deleteMeeting('${meeting.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    删除
                </button>
            </div>
        </div>
    `).join('');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function renderMeetingDetail(meeting) {
    const detailContent = document.getElementById('detailContent');
    if (!detailContent) return;

    const audioUrl = URL.createObjectURL(meeting.audioFile);

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
            </h3>
            <audio controls class="audio-player">
                <source src="${audioUrl}" type="audio/webm">
                您的浏览器不支持音频播放
            </audio>
            <button class="action-btn test-btn" onclick="downloadAudio('${meeting.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                下载录音
            </button>
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
}

function updateRecordingButtons(state) {
    const btnStart = document.getElementById('btnStartRecording');
    const btnPause = document.getElementById('btnPauseRecording');
    const btnResume = document.getElementById('btnResumeRecording');
    const btnStop = document.getElementById('btnStopRecording');
    const audioBars = document.getElementById('audioBars');
    const recordingIndicator = document.getElementById('recordingIndicator');
    const recorderCard = document.querySelector('.recorder-card');

    if (state.isRecording) {
        btnStart.style.display = 'none';
        if (state.isPaused) {
            btnPause.style.display = 'none';
            btnResume.style.display = 'inline-flex';
            btnStop.style.display = 'inline-flex';
            audioBars.classList.remove('active');
            recordingIndicator.classList.remove('active');
            recorderCard.classList.remove('recording');
        } else {
            btnPause.style.display = 'inline-flex';
            btnResume.style.display = 'none';
            btnStop.style.display = 'inline-flex';
            audioBars.classList.add('active');
            recordingIndicator.classList.add('active');
            recorderCard.classList.add('recording');
        }
    } else {
        btnStart.style.display = 'inline-flex';
        btnPause.style.display = 'none';
        btnResume.style.display = 'none';
        btnStop.style.display = 'none';
        audioBars.classList.remove('active');
        recordingIndicator.classList.remove('active');
        recorderCard.classList.remove('recording');
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

function hideLoading() {
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
