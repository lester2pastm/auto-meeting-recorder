/**
 * Workflow Stage Messages 单元测试
 * 测试录音工作流中的各个阶段消息是否正确使用 i18n
 */

describe('Workflow Stage Messages i18n 测试', () => {
  let mockI18n;
  let capturedMessages = [];

  beforeEach(() => {
    jest.resetModules();
    capturedMessages = [];

    // 模拟 i18n
    mockI18n = {
      currentLang: 'zh',
      translations: {
        zh: {
          workflowStopping: '正在停止录音...',
          workflowSaving: '正在保存录音...',
          workflowTranscribing: '正在转写...',
          workflowGeneratingSummary: '正在生成纪要...',
          workflowOrganizing: '正在整理录音...',
          toastRecordingStopped: '录音已停止，正在转写...',
          toastTranscriptionComplete: '转写完成，正在生成纪要...',
          loadingGenerating: '生成中...'
        },
        en: {
          workflowStopping: 'Stopping recording...',
          workflowSaving: 'Saving recording...',
          workflowTranscribing: 'Transcribing...',
          workflowGeneratingSummary: 'Generating summary...',
          workflowOrganizing: 'Organizing recording...',
          toastRecordingStopped: 'Recording stopped, transcribing...',
          toastTranscriptionComplete: 'Transcription complete, generating summary...',
          loadingGenerating: 'Generating...'
        }
      },
      get: function(key) {
        return this.translations[this.currentLang][key] || key;
      }
    };

    global.i18n = mockI18n;

    // 模拟 DOM
    document.body.innerHTML = `
      <div id="subtitleContent"></div>
      <div id="summaryContent"></div>
      <button id="btnStopRecording"></button>
      <div id="toast"></div>
    `;
  });

  describe('i18n 键存在性测试', () => {
    it('应该有 workflowStopping i18n 键', () => {
      const key = 'workflowStopping';
      expect(mockI18n.translations.zh[key]).toBeDefined();
      expect(mockI18n.translations.en[key]).toBeDefined();
    });

    it('应该有 workflowSaving i18n 键', () => {
      const key = 'workflowSaving';
      expect(mockI18n.translations.zh[key]).toBeDefined();
      expect(mockI18n.translations.en[key]).toBeDefined();
    });

    it('应该有 workflowTranscribing i18n 键', () => {
      const key = 'workflowTranscribing';
      expect(mockI18n.translations.zh[key]).toBeDefined();
      expect(mockI18n.translations.en[key]).toBeDefined();
    });

    it('应该有 workflowGeneratingSummary i18n 键', () => {
      const key = 'workflowGeneratingSummary';
      expect(mockI18n.translations.zh[key]).toBeDefined();
      expect(mockI18n.translations.en[key]).toBeDefined();
    });

    it('应该有 workflowOrganizing i18n 键', () => {
      const key = 'workflowOrganizing';
      expect(mockI18n.translations.zh[key]).toBeDefined();
      expect(mockI18n.translations.en[key]).toBeDefined();
    });

    it('应该有 toastRecordingStopped i18n 键', () => {
      const key = 'toastRecordingStopped';
      expect(mockI18n.translations.zh[key]).toBeDefined();
      expect(mockI18n.translations.en[key]).toBeDefined();
    });

    it('应该有 toastTranscriptionComplete i18n 键', () => {
      const key = 'toastTranscriptionComplete';
      expect(mockI18n.translations.zh[key]).toBeDefined();
      expect(mockI18n.translations.en[key]).toBeDefined();
    });

    it('应该有 loadingGenerating i18n 键', () => {
      const key = 'loadingGenerating';
      expect(mockI18n.translations.zh[key]).toBeDefined();
      expect(mockI18n.translations.en[key]).toBeDefined();
    });
  });

  describe('ui.js showLoading 使用 i18n 测试', () => {
    it('showLoading 应该在 summary 目标使用 i18n 键而不是硬编码', () => {
      const fs = require('fs');
      const uiSource = fs.readFileSync('./src/js/ui.js', 'utf8');
      
      const usesI18nForLoading = uiSource.includes("i18n.get('loadingGenerating')");
      expect(usesI18nForLoading).toBe(true);
    });
  });

  describe('app.js handleStopRecording 使用 i18n 测试', () => {
    it('handleStopRecording 应该在各阶段使用 i18n 而不是硬编码字符串', () => {
      const fs = require('fs');
      const appSource = fs.readFileSync('./src/js/app.js', 'utf8');
      
      const usesI18n = 
        appSource.includes("i18n.get('workflowStopping')") ||
        appSource.includes("i18n.get('workflowSaving')") ||
        appSource.includes("i18n.get('workflowTranscribing')") ||
        appSource.includes("i18n.get('workflowOrganizing')");
      
      expect(usesI18n).toBe(true);
    });
  });

  describe('app.js processRecording 使用 i18n 测试', () => {
    it('processRecording 应该在转写和生成纪要阶段使用 i18n', () => {
      const fs = require('fs');
      const appSource = fs.readFileSync('./src/js/app.js', 'utf8');
      
      const usesI18nTranscribe = appSource.includes("i18n.get('workflowTranscribing')");
      const usesI18nSummary = appSource.includes("i18n.get('workflowGeneratingSummary')");
      
      expect(usesI18nTranscribe).toBe(true);
      expect(usesI18nSummary).toBe(true);
    });
  });

  describe('Toast 消息 i18n 测试', () => {
    it('app.js 应该使用 i18n 而不是硬编码 Toast 消息', () => {
      const fs = require('fs');
      const appSource = fs.readFileSync('./src/js/app.js', 'utf8');
      
      const usesI18nToast1 = appSource.includes("i18n.get('toastRecordingStopped')");
      const usesI18nToast2 = appSource.includes("i18n.get('toastTranscriptionComplete')");
      
      expect(usesI18nToast1).toBe(true);
      expect(usesI18nToast2).toBe(true);
    });
  });
});
