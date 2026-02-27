// 国际化配置
const i18n = {
    // 当前语言
    currentLang: 'zh',
    
    // 翻译字典
    translations: {
        zh: {
            appTitle: '自动会议纪要',
            appSubtitle: '实时语音转写，智能生成会议纪要',
            brandName: '会议纪要',
            navRecorder: '录音',
            navHistory: '历史',
            navSettings: '设置',
            recordingStatus: '录音中',
            startRecording: '开始录音',
            pause: '暂停',
            resume: '继续',
            stop: '停止',
            fullText: '会议全文',
            meetingSummary: '会议纪要',
            emptySubtitleHint: '开始录音后将显示转写内容',
            emptySummaryHint: '录音结束后自动生成会议纪要',
            historyTitle: '历史记录',
            historyDesc: '查看和管理之前的会议记录',
            settingsTitle: '设置',
            settingsDesc: '配置API和模板',
            sttConfig: '语音识别API配置',
            summaryConfig: '纪要生成API配置',
            templateConfig: '纪要模板配置',
            apiUrl: 'API地址',
            modelName: '模型名称',
            testConnection: '测试连接',
            templateLabel: '纪要模板（Markdown格式）',
            saveTemplate: '保存模板',
            copy: '复制',
            view: '查看',
            delete: '删除',
            confirmDelete: '确定要删除这条记录吗？',
            initSuccess: '应用初始化成功',
            initFailed: '应用初始化失败',
            recordingStarted: '开始录音',
            recordingPaused: '录音已暂停',
            recordingResumed: '录音已继续',
            recordingStopped: '录音已停止',
            copySuccess: '已复制到剪贴板',
            copyFailed: '复制失败',
            saveSuccess: '保存成功',
            saveFailed: '保存失败',
            testSuccess: '连接成功',
            testFailed: '连接失败',
            noRecording: '暂无录音数据',
            generatingSummary: '正在生成会议纪要...',
            summaryGenerated: '会议纪要已生成',
            uploadAudio: '上传音频',
            refreshSummary: '重新生成纪要',
            audioTranscribing: '正在转写音频文件...',
            audioTranscribed: '音频转写完成',
            summaryRefreshed: '会议纪要已更新',
            noTranscriptForRefresh: '请先进行录音或上传音频文件',
            exitConfirmTitle: '正在录音中',
            exitConfirmMessage: '正在进行录音，退出应用将停止录音。确定要退出吗？',
            cancel: '取消',
            confirmExit: '退出'
        },
        en: {
            appTitle: 'Auto Meeting Minutes',
            appSubtitle: 'Real-time transcription, intelligent meeting summaries',
            brandName: 'Meeting Minutes',
            navRecorder: 'Record',
            navHistory: 'History',
            navSettings: 'Settings',
            recordingStatus: 'Recording',
            startRecording: 'Start Recording',
            pause: 'Pause',
            resume: 'Resume',
            stop: 'Stop',
            fullText: 'Full Transcript',
            meetingSummary: 'Meeting Summary',
            emptySubtitleHint: 'Transcription will appear after recording starts',
            emptySummaryHint: 'Meeting summary will be generated after recording ends',
            historyTitle: 'History',
            historyDesc: 'View and manage previous meeting records',
            settingsTitle: 'Settings',
            settingsDesc: 'Configure API and templates',
            sttConfig: 'Speech Recognition API',
            summaryConfig: 'Summary Generation API',
            templateConfig: 'Summary Template',
            apiUrl: 'API URL',
            modelName: 'Model Name',
            testConnection: 'Test Connection',
            templateLabel: 'Summary Template (Markdown)',
            saveTemplate: 'Save Template',
            copy: 'Copy',
            view: 'View',
            delete: 'Delete',
            confirmDelete: 'Are you sure you want to delete this record?',
            initSuccess: 'Application initialized successfully',
            initFailed: 'Failed to initialize application',
            recordingStarted: 'Recording started',
            recordingPaused: 'Recording paused',
            recordingResumed: 'Recording resumed',
            recordingStopped: 'Recording stopped',
            copySuccess: 'Copied to clipboard',
            copyFailed: 'Copy failed',
            saveSuccess: 'Saved successfully',
            saveFailed: 'Save failed',
            testSuccess: 'Connection successful',
            testFailed: 'Connection failed',
            noRecording: 'No recording data available',
            generatingSummary: 'Generating meeting summary...',
            summaryGenerated: 'Meeting summary generated',
            uploadAudio: 'Upload Audio',
            refreshSummary: 'Refresh Summary',
            audioTranscribing: 'Transcribing audio file...',
            audioTranscribed: 'Audio transcribed',
            summaryRefreshed: 'Meeting summary refreshed',
            noTranscriptForRefresh: 'Please record or upload audio first',
            exitConfirmTitle: 'Recording in Progress',
            exitConfirmMessage: 'Recording is in progress. Exiting will stop the recording. Are you sure you want to exit?',
            cancel: 'Cancel',
            confirmExit: 'Exit'
        }
    },
    
    // 初始化
    init() {
        // 从本地存储加载语言设置
        const savedLang = localStorage.getItem('appLanguage');
        if (savedLang && this.translations[savedLang]) {
            this.currentLang = savedLang;
        }
        
        // 更新语言切换按钮显示
        this.updateLangToggle();
        
        // 应用翻译
        this.applyTranslations();
        
        // 绑定语言切换事件
        const langToggle = document.getElementById('langToggle');
        if (langToggle) {
            langToggle.addEventListener('click', () => this.toggleLanguage());
        }
    },
    
    // 切换语言
    toggleLanguage() {
        this.currentLang = this.currentLang === 'zh' ? 'en' : 'zh';
        localStorage.setItem('appLanguage', this.currentLang);
        this.updateLangToggle();
        this.applyTranslations();
    },
    
    // 更新语言切换按钮
    updateLangToggle() {
        const langToggle = document.getElementById('langToggle');
        if (langToggle) {
            const langText = langToggle.querySelector('.lang-text');
            if (langText) {
                langText.textContent = this.currentLang === 'zh' ? 'EN' : '中';
            }
        }
    },
    
    // 应用翻译
    applyTranslations() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.get(key);
            if (translation && translation !== key) {
                // 如果是 input 或 textarea，更新 placeholder
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = translation;
                } else {
                    el.textContent = translation;
                }
            }
        });

        // 更新页面标题
        document.title = this.get('appTitle');

        // 更新 html lang 属性
        document.documentElement.lang = this.currentLang === 'zh' ? 'zh-CN' : 'en';
    },
    
    // 获取翻译文本
    t(lang, key) {
        const translations = this.translations[lang] || this.translations.zh;
        return translations[key] || key;
    },
    
    // 获取当前语言的翻译
    get(key) {
        return this.t(this.currentLang, key);
    }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = i18n;
}
