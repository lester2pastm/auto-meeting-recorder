const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAppModule(overrides = {}) {
  const appPath = path.resolve(__dirname, '../../src/js/app.js');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const module = { exports: {} };

  const context = vm.createContext({
    module,
    exports: module.exports,
    require,
    console,
    document,
    window,
    Blob,
    Date,
    setTimeout,
    clearTimeout,
    localStorage: window.localStorage,
    TranscriptionManager: class {
      canTranscribe() {
        return true;
      }

      recordTranscriptionTime() {}
    },
    ...overrides
  });

  const script = new vm.Script(`${appSource}
module.exports = {
  processRecording,
  generateMeetingSummary,
  updateRecordingWorkflowState,
  __setCurrentSettings: (settings) => { currentSettings = settings; },
  __setGenerateMeetingSummary: (fn) => { generateMeetingSummary = fn; },
  __setSaveMeetingRecord: (fn) => { saveMeetingRecord = fn; }
};`);

  script.runInContext(context);

  return module.exports;
}

describe('Workflow stage messages', () => {
  let mockI18n;

  beforeEach(() => {
    jest.resetModules();

    mockI18n = {
      currentLang: 'zh',
      translations: {
        zh: {
          workflowStopping: '正在停止录音...',
          workflowSaving: '正在保存录音...',
          workflowTranscribing: '正在转写...',
          workflowTranscribingDetail: '正在识别录音内容...',
          workflowSummaryPending: '转写完成后自动生成纪要...',
          workflowPreparingSummary: '正在整理转写内容...',
          workflowGeneratingSummary: '正在生成会议纪要...',
          workflowOrganizing: '正在整理录音...',
          toastRecordingStopped: '录音已停止，正在转写...',
          toastTranscriptionComplete: '转写完成，正在生成纪要...',
          loadingGenerating: '生成中...'
        },
        en: {
          workflowStopping: 'Stopping recording...',
          workflowSaving: 'Saving recording...',
          workflowTranscribing: 'Transcribing...',
          workflowTranscribingDetail: 'Recognizing recording...',
          workflowSummaryPending: 'Summary will generate after transcription...',
          workflowPreparingSummary: 'Preparing transcript for summary...',
          workflowGeneratingSummary: 'Generating meeting summary...',
          workflowOrganizing: 'Organizing recording...',
          toastRecordingStopped: 'Recording stopped, transcribing...',
          toastTranscriptionComplete: 'Transcription complete, generating summary...',
          loadingGenerating: 'Generating...'
        }
      },
      get(key) {
        return this.translations[this.currentLang][key] || key;
      }
    };

    document.body.innerHTML = `
      <div id="subtitleContent"></div>
      <div id="summaryContent"></div>
      <button id="btnStopRecording"></button>
      <div id="toast"></div>
    `;
  });

  it('should define the finer-grained workflow message keys', () => {
    expect(mockI18n.translations.zh.workflowTranscribingDetail).toBeDefined();
    expect(mockI18n.translations.en.workflowTranscribingDetail).toBeDefined();
    expect(mockI18n.translations.zh.workflowSummaryPending).toBeDefined();
    expect(mockI18n.translations.en.workflowSummaryPending).toBeDefined();
    expect(mockI18n.translations.zh.workflowPreparingSummary).toBeDefined();
    expect(mockI18n.translations.en.workflowPreparingSummary).toBeDefined();
  });

  it('processRecording should propagate transcription and summary-waiting loading messages', async () => {
    const showLoading = jest.fn();
    const hideLoading = jest.fn();
    const updateMeeting = jest.fn().mockResolvedValue(undefined);
    const transcribeAudio = jest.fn().mockResolvedValue({
      success: true,
      text: '这是转写结果'
    });
    const updateSubtitleContent = jest.fn();
    const updateRecordingButtons = jest.fn();
    const getRecordingState = jest.fn(() => ({ isRecording: false }));
    const generateMeetingSummary = jest.fn().mockResolvedValue(undefined);
    const showToast = jest.fn();

    const app = loadAppModule({
      i18n: mockI18n,
      showLoading,
      hideLoading,
      updateMeeting,
      transcribeAudio,
      updateSubtitleContent,
      updateRecordingButtons,
      getRecordingState,
      showToast
    });

    app.__setCurrentSettings({
      sttApiUrl: 'https://stt.example.com',
      sttApiKey: 'stt-key',
      sttModel: 'whisper-1',
      summaryApiUrl: 'https://summary.example.com',
      summaryApiKey: 'summary-key',
      summaryModel: 'gpt-4o',
      summaryTemplate: 'template'
    });
    app.__setGenerateMeetingSummary(generateMeetingSummary);

    await app.processRecording(new Blob(['audio'], { type: 'audio/webm' }), 'meeting-1');

    expect(showLoading).toHaveBeenNthCalledWith(1, '正在识别录音内容...', {
      transcript: true,
      summary: true,
      summaryMessage: '转写完成后自动生成纪要...'
    });
    expect(showLoading).toHaveBeenNthCalledWith(2, '正在整理转写内容...', {
      transcript: false,
      summary: true
    });
    expect(updateSubtitleContent).toHaveBeenCalledWith('这是转写结果');
    expect(generateMeetingSummary).toHaveBeenCalledWith(
      '这是转写结果',
      expect.any(Blob),
      'meeting-1'
    );
  });

  it('processRecording should forward transcription retry progress to the transcript loading state', async () => {
    const showLoading = jest.fn();
    const hideLoading = jest.fn();
    const updateMeeting = jest.fn().mockResolvedValue(undefined);
    const transcribeAudio = jest.fn().mockImplementation(async (
      audioBlob,
      apiUrl,
      apiKey,
      model,
      audioFilePath,
      onProgress
    ) => {
      onProgress('分段转写失败，正在重试（第 2 次，共 3 次）...');
      return {
        success: true,
        text: '这是转写结果'
      };
    });
    const updateSubtitleContent = jest.fn();
    const updateRecordingButtons = jest.fn();
    const getRecordingState = jest.fn(() => ({ isRecording: false }));
    const generateMeetingSummary = jest.fn().mockResolvedValue(undefined);
    const showToast = jest.fn();

    const app = loadAppModule({
      i18n: mockI18n,
      showLoading,
      hideLoading,
      updateMeeting,
      transcribeAudio,
      updateSubtitleContent,
      updateRecordingButtons,
      getRecordingState,
      showToast
    });

    app.__setCurrentSettings({
      sttApiUrl: 'https://stt.example.com',
      sttApiKey: 'stt-key',
      sttModel: 'whisper-1',
      summaryApiUrl: 'https://summary.example.com',
      summaryApiKey: 'summary-key',
      summaryModel: 'gpt-4o',
      summaryTemplate: 'template'
    });
    app.__setGenerateMeetingSummary(generateMeetingSummary);

    await app.processRecording(new Blob(['audio'], { type: 'audio/webm' }), 'meeting-1');

    expect(transcribeAudio).toHaveBeenCalledWith(
      expect.any(Blob),
      'https://stt.example.com',
      'stt-key',
      'whisper-1',
      null,
      expect.any(Function)
    );
    expect(showLoading).toHaveBeenNthCalledWith(2, '分段转写失败，正在重试（第 2 次，共 3 次）...', {
      transcript: true,
      summary: true,
      summaryMessage: '转写完成后自动生成纪要...'
    });
    expect(updateSubtitleContent).toHaveBeenCalledWith('这是转写结果');
  });

  it('generateMeetingSummary should target the summary loading message only', async () => {
    const showLoading = jest.fn();
    const generateSummary = jest.fn().mockResolvedValue({
      success: true,
      summary: '这是纪要结果'
    });
    const updateSummaryContent = jest.fn();
    const saveMeetingRecord = jest.fn().mockResolvedValue(undefined);
    const showToast = jest.fn();

    const app = loadAppModule({
      i18n: mockI18n,
      showLoading,
      generateSummary,
      updateSummaryContent,
      showToast
    });

    app.__setCurrentSettings({
      summaryApiUrl: 'https://summary.example.com',
      summaryApiKey: 'summary-key',
      summaryModel: 'gpt-4o',
      summaryTemplate: 'template'
    });
    app.__setSaveMeetingRecord(saveMeetingRecord);

    await app.generateMeetingSummary('这是转写结果', new Blob(['audio'], { type: 'audio/webm' }), 'meeting-2');

    expect(showLoading).toHaveBeenCalledWith('正在生成会议纪要...', {
      transcript: false,
      summary: true
    });
    expect(generateSummary).toHaveBeenCalledWith(
      '这是转写结果',
      'template',
      'https://summary.example.com',
      'summary-key',
      'gpt-4o',
      expect.any(Function)
    );
    expect(updateSummaryContent).toHaveBeenCalledWith('这是纪要结果');
    expect(saveMeetingRecord).toHaveBeenCalledWith(
      '这是转写结果',
      '这是纪要结果',
      expect.any(Blob),
      'meeting-2'
    );
  });

  it('generateMeetingSummary should forward retry progress to the summary loading state', async () => {
    const showLoading = jest.fn();
    const generateSummary = jest.fn().mockImplementation(async (
      transcript,
      template,
      apiUrl,
      apiKey,
      model,
      onProgress
    ) => {
      onProgress('摘要生成失败，正在重试（第 2 次，共 3 次）...');
      return {
        success: true,
        summary: '这是纪要结果'
      };
    });
    const updateSummaryContent = jest.fn();
    const saveMeetingRecord = jest.fn().mockResolvedValue(undefined);
    const showToast = jest.fn();

    const app = loadAppModule({
      i18n: mockI18n,
      showLoading,
      generateSummary,
      updateSummaryContent,
      showToast
    });

    app.__setCurrentSettings({
      summaryApiUrl: 'https://summary.example.com',
      summaryApiKey: 'summary-key',
      summaryModel: 'gpt-4o',
      summaryTemplate: 'template'
    });
    app.__setSaveMeetingRecord(saveMeetingRecord);

    await app.generateMeetingSummary('这是转写结果', new Blob(['audio'], { type: 'audio/webm' }), 'meeting-3');

    expect(generateSummary).toHaveBeenCalledWith(
      '这是转写结果',
      'template',
      'https://summary.example.com',
      'summary-key',
      'gpt-4o',
      expect.any(Function)
    );
    expect(showLoading).toHaveBeenNthCalledWith(2, '摘要生成失败，正在重试（第 2 次，共 3 次）...', {
      transcript: false,
      summary: true
    });
    expect(updateSummaryContent).toHaveBeenCalledWith('这是纪要结果');
    expect(saveMeetingRecord).toHaveBeenCalledWith(
      '这是转写结果',
      '这是纪要结果',
      expect.any(Blob),
      'meeting-3'
    );
  });
});
