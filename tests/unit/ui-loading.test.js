describe('UI loading state targeting', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    document.body.innerHTML = `
      <div id="toast"></div>
      <div id="detailContent"></div>
      <div id="subtitleContent"><div class="content-text">现有转写内容</div></div>
      <div id="summaryContent"><div class="content-text">现有纪要内容</div></div>
      <button id="summaryTab" class="tab-button"></button>
      <div id="summaryTabBadge"></div>
    `;
    global.i18n = null;
    window.electronAPI = undefined;
    global.getAudioFile = jest.fn();
    global.exportAudioFile = jest.fn();
    global.URL.createObjectURL = jest.fn(() => 'blob:test-audio');
    document.execCommand = jest.fn();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: {
        writeText: jest.fn().mockResolvedValue(undefined)
      }
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('summary-only loading should not overwrite transcript content', () => {
    const ui = require('../../src/js/ui');

    expect(typeof ui.showLoading).toBe('function');

    ui.showLoading('正在生成纪要...', { summary: true, transcript: false });

    expect(document.getElementById('subtitleContent').textContent).toContain('现有转写内容');
    expect(document.getElementById('summaryContent').textContent).toContain('生成中');
  });

  test('showLoading should allow a stage-specific summary message', () => {
    const ui = require('../../src/js/ui');

    ui.showLoading('正在识别录音内容...', {
      transcript: true,
      summary: true,
      summaryMessage: '转写完成后自动生成纪要...'
    });

    expect(document.getElementById('subtitleContent').textContent).toContain('正在识别录音内容');
    expect(document.getElementById('summaryContent').textContent).toContain('转写完成后自动生成纪要');
  });

  test('showToast should reset the auto-hide timer for consecutive messages', () => {
    const ui = require('../../src/js/ui');

    expect(typeof ui.showToast).toBe('function');

    ui.showToast('第一条提示', 'info');
    jest.advanceTimersByTime(2000);
    ui.showToast('第二条提示', 'success');

    jest.advanceTimersByTime(1500);

    const toast = document.getElementById('toast');
    expect(toast.classList.contains('show')).toBe(true);
    expect(toast.textContent).toContain('第二条提示');

    jest.advanceTimersByTime(1500);
    expect(toast.classList.contains('show')).toBe(false);
  });

  test('showToast should support warning messages without rendering undefined', () => {
    const ui = require('../../src/js/ui');

    ui.showToast('未识别到有效语音，会议记录已保存', 'warning');

    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('未识别到有效语音，会议记录已保存');
    expect(toast.innerHTML).not.toContain('undefined');
    expect(toast.classList.contains('warning')).toBe(true);
  });

  test('copyToClipboard should prefer Electron clipboard bridge when available', async () => {
    window.electronAPI = {
      copyText: jest.fn().mockResolvedValue(undefined)
    };

    const ui = require('../../src/js/ui');

    expect(typeof ui.copyToClipboard).toBe('function');

    await ui.copyToClipboard('会议纪要内容');

    expect(window.electronAPI.copyText).toHaveBeenCalledWith('会议纪要内容');
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(document.getElementById('toast').textContent).toContain('复制成功');
  });

  test('meeting detail should show retranscribing state inline', async () => {
    const ui = require('../../src/js/ui');

    expect(typeof ui.renderMeetingDetail).toBe('function');

    await ui.renderMeetingDetail({
      id: 'meeting-1',
      date: '2026-03-18T12:00:00.000Z',
      duration: '00:05:00',
      audioFile: new Blob(['audio'], { type: 'audio/webm' }),
      transcript: '',
      summary: '',
      transcriptStatus: 'transcribing'
    });

    expect(document.getElementById('detailTranscriptContent_meeting-1').textContent).toContain('正在重新转写');

    const refreshBtn = document.getElementById('btnRefreshTranscript_meeting-1');
    expect(refreshBtn).not.toBeNull();
    expect(refreshBtn.disabled).toBe(true);
    expect(refreshBtn.classList.contains('btn-loading')).toBe(true);
  });

  test('meeting detail should show summary regeneration state inline', async () => {
    const ui = require('../../src/js/ui');

    await ui.renderMeetingDetail({
      id: 'meeting-2',
      date: '2026-03-18T12:00:00.000Z',
      duration: '00:05:00',
      audioFile: new Blob(['audio'], { type: 'audio/webm' }),
      transcript: '现有转写',
      summary: '',
      summaryStatus: 'generating'
    });

    expect(document.getElementById('detailSummaryContent_meeting-2').textContent).toContain('正在重新生成纪要');

    const refreshBtn = document.getElementById('btnRefreshSummary_meeting-2');
    expect(refreshBtn).not.toBeNull();
    expect(refreshBtn.disabled).toBe(true);
    expect(refreshBtn.classList.contains('btn-loading')).toBe(true);
  });

  test('meeting detail should revoke the previous audio object URL before rendering a new one', async () => {
    const ui = require('../../src/js/ui');
    global.URL.createObjectURL = jest
      .fn()
      .mockReturnValueOnce('blob:first-audio')
      .mockReturnValueOnce('blob:second-audio');
    global.URL.revokeObjectURL = jest.fn();

    await ui.renderMeetingDetail({
      id: 'meeting-3',
      date: '2026-03-18T12:00:00.000Z',
      duration: '00:05:00',
      audioFile: new Blob(['audio-1'], { type: 'audio/webm' }),
      transcript: '第一次',
      summary: '第一次纪要'
    });

    await ui.renderMeetingDetail({
      id: 'meeting-4',
      date: '2026-03-18T12:05:00.000Z',
      duration: '00:03:00',
      audioFile: new Blob(['audio-2'], { type: 'audio/webm' }),
      transcript: '第二次',
      summary: '第二次纪要'
    });

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-audio');
  });

  test('cleanupDetailAudioPreview should revoke the active detail audio object URL', async () => {
    const ui = require('../../src/js/ui');
    global.URL.createObjectURL = jest.fn(() => 'blob:active-audio');
    global.URL.revokeObjectURL = jest.fn();

    await ui.renderMeetingDetail({
      id: 'meeting-5',
      date: '2026-03-18T12:10:00.000Z',
      duration: '00:02:00',
      audioFile: new Blob(['audio-3'], { type: 'audio/webm' }),
      transcript: '关闭前',
      summary: '关闭前纪要'
    });

    ui.cleanupDetailAudioPreview();

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:active-audio');
  });

  test('updateRecordingButtons should hide pause and resume controls on Linux while recording', () => {
    document.body.innerHTML = `
      <button id="btnStartRecording" style="display: inline-flex;"></button>
      <button id="btnPauseRecording" style="display: none;"></button>
      <button id="btnResumeRecording" style="display: none;"></button>
      <button id="btnStopRecording" style="display: none;"></button>
      <div id="audioBars"></div>
      <div id="recordingIndicator"></div>
    `;
    document.body.dataset.platform = 'linux';

    const ui = require('../../src/js/ui');

    ui.updateRecordingButtons({
      isRecording: true,
      isPaused: false
    });

    expect(document.getElementById('btnStartRecording').style.display).toBe('none');
    expect(document.getElementById('btnPauseRecording').style.display).toBe('none');
    expect(document.getElementById('btnResumeRecording').style.display).toBe('none');
    expect(document.getElementById('btnStopRecording').style.display).toBe('inline-flex');
  });
});
