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
  handleTestSttApi,
  handleTestSummaryApi,
  handleRetryTranscription,
  handleRefreshSummary,
  processRecording,
  __setCurrentSettings: (settings) => { currentSettings = settings; },
  __setRetryTranscription: (fn) => { retryTranscription = fn; },
  __setRetryState: ({ meetingId, audioBlob, audioFilePath }) => {
    currentMeetingId = meetingId;
    currentAudioBlob = audioBlob;
    currentAudioFilePath = audioFilePath;
  }
};`);

  script.runInContext(context);

  return module.exports;
}

describe('App critical path regressions', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="subtitleContent">已有转写</div>
      <div id="summaryContent"></div>
      <button id="btnRetryTranscription" style="display: inline-flex;"></button>
      <button id="btnRefreshSummary"></button>
    `;
  });

  test('handleRetryTranscription should reuse retryTranscription workflow and close loading', async () => {
    const retryTranscription = jest.fn().mockResolvedValue({ allowed: true });
    const showLoading = jest.fn();
    const hideLoading = jest.fn();
    const showToast = jest.fn();

    const app = loadAppModule({
      retryTranscription,
      showLoading,
      hideLoading,
      showToast,
      i18n: null
    });

    const audioBlob = new Blob(['audio'], { type: 'audio/webm' });
    app.__setCurrentSettings({
      sttApiUrl: 'https://stt.example.com',
      sttApiKey: 'key',
      sttModel: 'whisper-1'
    });
    app.__setRetryTranscription(retryTranscription);
    app.__setRetryState({
      meetingId: 'meeting-1',
      audioBlob,
      audioFilePath: '/tmp/meeting-1.webm'
    });

    await app.handleRetryTranscription();

    expect(retryTranscription).toHaveBeenCalledWith(
      'meeting-1',
      audioBlob,
      '/tmp/meeting-1.webm'
    );
    expect(hideLoading).toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('转写完成'), 'success');
  });

  test('handleRefreshSummary should persist regenerated summary for the current meeting', async () => {
    const generateSummary = jest.fn().mockResolvedValue({
      success: true,
      summary: '新的会议纪要'
    });
    const updateSummaryContent = jest.fn();
    const updateMeeting = jest.fn().mockResolvedValue(undefined);
    const showToast = jest.fn();

    const app = loadAppModule({
      generateSummary,
      updateSummaryContent,
      updateMeeting,
      showToast,
      i18n: null
    });

    app.__setCurrentSettings({
      summaryApiUrl: 'https://summary.example.com',
      summaryApiKey: 'key',
      summaryModel: 'gpt-4o',
      summaryTemplate: 'template'
    });
    app.__setRetryState({
      meetingId: 'meeting-9',
      audioBlob: null,
      audioFilePath: null
    });

    await app.handleRefreshSummary();

    expect(generateSummary).toHaveBeenCalledWith(
      '已有转写',
      'template',
      'https://summary.example.com',
      'key',
      'gpt-4o'
    );
    expect(updateSummaryContent).toHaveBeenCalledWith('新的会议纪要');
    expect(updateMeeting).toHaveBeenCalledWith('meeting-9', {
      summary: '新的会议纪要'
    });
  });

  test('processRecording should not leave meeting in pending when stt config is missing', async () => {
    const updateMeeting = jest.fn().mockResolvedValue(undefined);
    const showToast = jest.fn();
    const hideLoading = jest.fn();
    const updateRecordingButtons = jest.fn();
    const getRecordingState = jest.fn(() => ({ isRecording: false }));

    const app = loadAppModule({
      updateMeeting,
      showToast,
      hideLoading,
      updateRecordingButtons,
      getRecordingState,
      i18n: null
    });

    app.__setCurrentSettings({
      sttApiUrl: '',
      sttApiKey: '',
      sttModel: 'whisper-1'
    });

    await app.processRecording(new Blob(['audio'], { type: 'audio/webm' }), 'meeting-pending');

    expect(updateMeeting).toHaveBeenCalledWith('meeting-pending', {
      transcriptStatus: 'failed'
    });
  });

  test('handleTestSttApi should persist settings to IndexedDB and file config after a successful test', async () => {
    document.body.innerHTML = `
      <input id="sttApiUrl" value="https://stt.example.com" />
      <input id="sttApiKey" value="stt-key" />
      <input id="sttModel" value="whisper-1" />
    `;

    const testSttApi = jest.fn().mockResolvedValue({ success: true, message: '连接成功' });
    const saveSettings = jest.fn().mockResolvedValue(undefined);
    const saveConfigToFile = jest.fn().mockResolvedValue(undefined);
    const showToast = jest.fn();
    window.electronAPI = {};

    const app = loadAppModule({
      testSttApi,
      saveSettings,
      saveConfigToFile,
      showToast,
      i18n: null
    });

    app.__setCurrentSettings({
      sttApiUrl: '',
      sttApiKey: '',
      sttModel: 'whisper-1'
    });

    await app.handleTestSttApi();

    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      sttApiUrl: 'https://stt.example.com',
      sttApiKey: 'stt-key',
      sttModel: 'whisper-1'
    }));
    expect(saveConfigToFile).toHaveBeenCalledWith(expect.objectContaining({
      sttApiUrl: 'https://stt.example.com',
      sttApiKey: 'stt-key',
      sttModel: 'whisper-1'
    }));
  });

  test('handleTestSummaryApi should persist settings to IndexedDB and file config after a successful test', async () => {
    document.body.innerHTML = `
      <input id="summaryApiUrl" value="https://summary.example.com" />
      <input id="summaryApiKey" value="summary-key" />
      <input id="summaryModel" value="gpt-4o" />
    `;

    const testSummaryApi = jest.fn().mockResolvedValue({ success: true, message: '连接成功' });
    const saveSettings = jest.fn().mockResolvedValue(undefined);
    const saveConfigToFile = jest.fn().mockResolvedValue(undefined);
    const showToast = jest.fn();
    window.electronAPI = {};

    const app = loadAppModule({
      testSummaryApi,
      saveSettings,
      saveConfigToFile,
      showToast,
      i18n: null
    });

    app.__setCurrentSettings({
      summaryApiUrl: '',
      summaryApiKey: '',
      summaryModel: 'gpt-3.5-turbo'
    });

    await app.handleTestSummaryApi();

    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      summaryApiUrl: 'https://summary.example.com',
      summaryApiKey: 'summary-key',
      summaryModel: 'gpt-4o'
    }));
    expect(saveConfigToFile).toHaveBeenCalledWith(expect.objectContaining({
      summaryApiUrl: 'https://summary.example.com',
      summaryApiKey: 'summary-key',
      summaryModel: 'gpt-4o'
    }));
  });
});
