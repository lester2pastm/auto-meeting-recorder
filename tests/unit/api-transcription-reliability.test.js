describe('transcribeAudioSegments reliability', () => {
  let api;
  let consoleLogSpy;
  let consoleErrorSpy;
  let realSetTimeout;
  let i18n;

  function createLargeAudioBlob() {
    const blob = new Blob([new Uint8Array(51 * 1024 * 1024)], { type: 'audio/webm' });
    if (typeof blob.arrayBuffer !== 'function') {
      blob.arrayBuffer = async () => new Uint8Array(51 * 1024 * 1024).buffer;
    }
    return blob;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    fetch.mockReset();

    realSetTimeout = global.setTimeout;
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    global.URL.createObjectURL = jest.fn(() => 'blob:test-audio');
    global.URL.revokeObjectURL = jest.fn();

    global.Audio = class MockAudio {
      constructor() {
        this.duration = 30;
        this.onloadedmetadata = null;
        this.onerror = null;
      }

      set src(value) {
        this._src = value;
        if (this.onloadedmetadata) {
          this.onloadedmetadata();
        }
      }
    };

    global.window = global.window || {};
    global.window.electronAPI = {
      splitAudioFile: jest.fn().mockResolvedValue({
        success: true,
        files: ['segment-1.webm']
      }),
      readAudioFile: jest.fn().mockResolvedValue({
        success: true,
        data: new Uint8Array([1, 2, 3])
      }),
      deleteFile: jest.fn().mockResolvedValue(null)
    };

    i18n = require('../../src/js/i18n');
    i18n.currentLang = 'zh';
    api = require('../../src/js/api');
  });

  afterEach(() => {
    jest.useRealTimers();
    if (global.setTimeout.mockRestore) {
      global.setTimeout.mockRestore();
    }
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('reports retry progress for retryable network segment failures with i18n-backed wording', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => (
      realSetTimeout(fn, 0, ...args)
    ));

    i18n.translations.zh.transcriptionRetryNetworkLabel = '自定义网络重试提示';
    i18n.translations.zh.transcriptionRetryProgressTemplate = '{label} - 第 {attempt}/{maxAttempts} 次';

    fetch
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ text: '转写成功' })
      });

    const result = await api.transcribeAudioSegments(
      createLargeAudioBlob(),
      'https://api.openai.com/v1/audio/transcriptions',
      'test-key',
      'whisper-1',
      '/tmp/audio.webm'
    );

    expect(result).toEqual({ success: true, text: '转写成功' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('自定义网络重试提示 - 第 2/3 次'));
  });

  test('returns i18n-backed exhausted timeout wording after retryable transcription retries are exhausted', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => (
      realSetTimeout(fn, 0, ...args)
    ));

    i18n.translations.zh.transcriptionRetryExhaustedTimeout = '自定义转写超时提示';

    fetch.mockRejectedValue(new Error('请求超时（300秒）'));

    const result = await api.transcribeAudioSegments(
      createLargeAudioBlob(),
      'https://api.openai.com/v1/audio/transcriptions',
      'test-key',
      'whisper-1',
      '/tmp/audio.webm'
    );

    expect(result).toEqual({ success: false, message: '自定义转写超时提示' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('returns i18n-backed exhausted network wording after retryable transcription retries are exhausted', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => (
      realSetTimeout(fn, 0, ...args)
    ));

    i18n.translations.zh.transcriptionRetryExhaustedNetwork = '自定义转写网络失败提示';

    fetch.mockRejectedValue(new Error('Failed to fetch'));

    const result = await api.transcribeAudioSegments(
      createLargeAudioBlob(),
      'https://api.openai.com/v1/audio/transcriptions',
      'test-key',
      'whisper-1',
      '/tmp/audio.webm'
    );

    expect(result).toEqual({ success: false, message: '自定义转写网络失败提示' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('routes oversized non-SiliconFlow audio through segmented transcription', async () => {
    const originalAudio = global.Audio;

    global.Audio = class MockLongAudio {
      constructor() {
        this.duration = 61 * 60;
        this.onloadedmetadata = null;
        this.onerror = null;
      }

      set src(value) {
        this._src = value;
        if (this.onloadedmetadata) {
          this.onloadedmetadata();
        }
      }
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ text: '分段转写成功' })
    });

    const result = await api.transcribeAudio(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
      'https://api.openai.com/v1/audio/transcriptions',
      'test-key',
      'whisper-1',
      '/tmp/audio.webm'
    );

    expect(result).toEqual({ success: true, text: '分段转写成功' });
    expect(global.window.electronAPI.splitAudioFile).toHaveBeenCalledWith('/tmp/audio.webm', expect.any(Object));
    expect(fetch).toHaveBeenCalledTimes(1);

    global.Audio = originalAudio;
  });
});
