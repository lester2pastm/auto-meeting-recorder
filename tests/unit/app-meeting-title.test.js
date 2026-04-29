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
  handleRefreshSummary,
  generateMeetingSummary,
  __setCurrentSettings: (settings) => { currentSettings = settings; },
  __setRetryState: ({ meetingId, audioBlob, audioFilePath }) => {
    currentMeetingId = meetingId;
    currentAudioBlob = audioBlob;
    currentAudioFilePath = audioFilePath;
  }
};`);

  script.runInContext(context);

  return module.exports;
}

describe('meeting title generation in app flows', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="subtitleContent">已有转写</div>
      <div id="summaryContent"></div>
      <button id="btnRefreshSummary"></button>
    `;
  });

  test('generateMeetingSummary persists title metadata after summary success', async () => {
    const generateSummary = jest.fn().mockResolvedValue({
      success: true,
      summary: '本周完成项目排期与责任分工。'
    });
    const generateMeetingTitle = jest.fn().mockResolvedValue({
      success: true,
      title: '项目排期对齐'
    });
    const updateMeeting = jest.fn().mockResolvedValue(undefined);

    const app = loadAppModule({
      generateSummary,
      generateMeetingTitle,
      updateMeeting,
      updateSummaryContent: jest.fn(),
      showToast: jest.fn(),
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      updateRecordingButtons: jest.fn(),
      getRecordingState: jest.fn(() => ({ isRecording: false })),
      i18n: null
    });

    app.__setCurrentSettings({
      summaryApiUrl: 'https://summary.example.com',
      summaryApiKey: 'key',
      summaryModel: 'gpt-4o',
      summaryTemplate: 'template'
    });

    await app.generateMeetingSummary('转写内容', new Blob(['audio']), 'meeting-1');

    expect(generateMeetingTitle).toHaveBeenCalledWith(
      '本周完成项目排期与责任分工。',
      'https://summary.example.com',
      'key',
      'gpt-4o',
      expect.any(Function)
    );
    expect(updateMeeting).toHaveBeenCalledWith('meeting-1', expect.objectContaining({
      title: '项目排期对齐',
      titleStatus: 'completed',
      titleSource: 'ai'
    }));
  });

  test('generateMeetingSummary skips title api when summary generation fails', async () => {
    const generateSummary = jest.fn().mockResolvedValue({
      success: false,
      message: 'summary failed'
    });
    const generateMeetingTitle = jest.fn();

    const app = loadAppModule({
      generateSummary,
      generateMeetingTitle,
      updateMeeting: jest.fn().mockResolvedValue(undefined),
      saveMeeting: jest.fn().mockResolvedValue(undefined),
      showToast: jest.fn(),
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      updateRecordingButtons: jest.fn(),
      getRecordingState: jest.fn(() => ({ isRecording: false })),
      i18n: null
    });

    app.__setCurrentSettings({
      summaryApiUrl: 'https://summary.example.com',
      summaryApiKey: 'key',
      summaryModel: 'gpt-4o',
      summaryTemplate: 'template'
    });

    await app.generateMeetingSummary('转写内容', new Blob(['audio']), 'meeting-2');

    expect(generateMeetingTitle).not.toHaveBeenCalled();
  });

  test('generateMeetingSummary persists failed title metadata when title api returns blank success payload', async () => {
    const generateSummary = jest.fn().mockResolvedValue({
      success: true,
      summary: '需要会议标题的纪要内容'
    });
    const generateMeetingTitle = jest.fn().mockResolvedValue({
      success: true,
      title: '   '
    });
    const updateMeeting = jest.fn().mockResolvedValue(undefined);

    const app = loadAppModule({
      generateSummary,
      generateMeetingTitle,
      updateMeeting,
      updateSummaryContent: jest.fn(),
      showToast: jest.fn(),
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      updateRecordingButtons: jest.fn(),
      getRecordingState: jest.fn(() => ({ isRecording: false })),
      i18n: null
    });

    app.__setCurrentSettings({
      summaryApiUrl: 'https://summary.example.com',
      summaryApiKey: 'key',
      summaryModel: 'gpt-4o',
      summaryTemplate: 'template'
    });

    await app.generateMeetingSummary('转写内容', new Blob(['audio']), 'meeting-empty-title');

    expect(updateMeeting).toHaveBeenCalledWith('meeting-empty-title', expect.objectContaining({
      titleStatus: 'failed',
      titleSource: 'fallback',
      titleError: '生成的会议标题为空'
    }));
  });

  test('handleRefreshSummary regenerates title for the current meeting after summary refresh', async () => {
    const generateSummary = jest.fn().mockResolvedValue({
      success: true,
      summary: '新的会议纪要'
    });
    const generateMeetingTitle = jest.fn().mockResolvedValue({
      success: true,
      title: '新的会议标题'
    });
    const updateMeeting = jest.fn().mockResolvedValue(undefined);
    const updateSummaryContent = jest.fn();

    const app = loadAppModule({
      generateSummary,
      generateMeetingTitle,
      updateMeeting,
      updateSummaryContent,
      showToast: jest.fn(),
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

    expect(updateSummaryContent).toHaveBeenCalledWith('新的会议纪要');
    expect(generateMeetingTitle).toHaveBeenCalledWith(
      '新的会议纪要',
      'https://summary.example.com',
      'key',
      'gpt-4o'
    );
    expect(updateMeeting).toHaveBeenCalledWith('meeting-9', expect.objectContaining({
      summary: '新的会议纪要',
      title: '新的会议标题',
      titleStatus: 'completed'
    }));
  });
});
