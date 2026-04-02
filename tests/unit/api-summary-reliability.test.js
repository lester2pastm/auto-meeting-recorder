describe('generateSummary reliability', () => {
  let api;
  let consoleErrorSpy;
  let realSetTimeout;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    fetch.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    api = require('../../src/js/api');
    realSetTimeout = global.setTimeout;
  });

  afterEach(() => {
    jest.useRealTimers();
    if (global.setTimeout.mockRestore) {
      global.setTimeout.mockRestore();
    }
    consoleErrorSpy.mockRestore();
  });

  test('retries retryable failures with bounded backoff and reports progress', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => (
      realSetTimeout(fn, 0, ...args)
    ));

    const onProgress = jest.fn();

    fetch
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Too many requests' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: '最终纪要'
            }
          }]
        })
      });

    const summaryPromise = api.generateSummary(
      '会议转录',
      '# 模板\n{transcript}',
      'https://api.openai.com/v1/chat/completions',
      'test-key',
      'gpt-4',
      onProgress
    );

    const result = await summaryPromise;
    const timeoutDelays = setTimeout.mock.calls.map((call) => call[1]);

    expect(result).toEqual({ success: true, summary: '最终纪要' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(timeoutDelays).toEqual(expect.arrayContaining([1000, 2000]));
    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('正在重试'));
    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('第 3 次'));
  });

  test('does not retry non-retryable 4xx failures', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API key' } })
    });

    const result = await api.generateSummary(
      '会议转录',
      '# 模板',
      'https://api.openai.com/v1/chat/completions',
      'bad-key'
    );

    expect(result).toEqual({ success: false, message: 'Invalid API key' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('treats timeout aborts as retryable and returns a timeout message after exhausting retries', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => (
      realSetTimeout(fn, 0, ...args)
    ));

    fetch.mockImplementation((url, options) => new Promise((resolve, reject) => {
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';

      const signal = options && options.signal;
      if (signal) {
        signal.addEventListener('abort', () => reject(error), { once: true });
      }
    }));

    const summaryPromise = api.generateSummary(
      '会议转录',
      '# 模板',
      'https://api.openai.com/v1/chat/completions',
      'test-key'
    );

    const result = await summaryPromise;

    expect(result.success).toBe(false);
    expect(result.message).toContain('请求超时');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('reports network retry progress with specific wording', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => (
      realSetTimeout(fn, 0, ...args)
    ));

    const i18n = require('../../src/js/i18n');
    i18n.translations.zh.summaryRetryNetworkLabel = '自定义网络连接提示';

    const onProgress = jest.fn();

    fetch
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: '最终纪要'
            }
          }]
        })
      });

    await api.generateSummary(
      '会议转录',
      '# 模板',
      'https://api.openai.com/v1/chat/completions',
      'test-key',
      'gpt-4',
      onProgress
    );

    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('自定义网络连接提示'));
    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('正在重试'));
  });

  test('reports timeout retry progress with specific wording', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => (
      realSetTimeout(fn, 0, ...args)
    ));

    const onProgress = jest.fn();

    fetch
      .mockRejectedValueOnce(new Error('请求超时（15秒）'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: '最终纪要'
            }
          }]
        })
      });

    await api.generateSummary(
      '会议转录',
      '# 模板',
      'https://api.openai.com/v1/chat/completions',
      'test-key',
      'gpt-4',
      onProgress
    );

    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('请求超时'));
    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('正在重试'));
  });

  test('returns a clearer timeout message after retries are exhausted', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => (
      realSetTimeout(fn, 0, ...args)
    ));

    const i18n = require('../../src/js/i18n');
    i18n.translations.zh.summaryRetryExhaustedTimeout = '自定义超时失败提示';

    fetch.mockRejectedValue(new Error('请求超时（15秒）'));

    const result = await api.generateSummary(
      '会议转录',
      '# 模板',
      'https://api.openai.com/v1/chat/completions',
      'test-key'
    );

    expect(result).toEqual({
      success: false,
      message: '自定义超时失败提示'
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('uses a longer summary timeout for longer transcripts', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => (
      realSetTimeout(fn, 0, ...args)
    ));

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: '最终纪要'
          }
        }]
      })
    });

    const transcript = '会议转录'.repeat(2000);

    const result = await api.generateSummary(
      transcript,
      '# 模板',
      'https://api.openai.com/v1/chat/completions',
      'test-key'
    );

    const timeoutDelays = setTimeout.mock.calls.map((call) => call[1]);

    expect(result).toEqual({ success: true, summary: '最终纪要' });
    expect(timeoutDelays).toContain(55000);
  });

  test('returns i18n-backed network exhausted message after retries are exhausted', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => (
      realSetTimeout(fn, 0, ...args)
    ));

    const i18n = require('../../src/js/i18n');
    i18n.translations.zh.summaryRetryExhaustedNetwork = '自定义网络失败提示';

    fetch.mockRejectedValue(new Error('Failed to fetch'));

    const result = await api.generateSummary(
      '会议转录',
      '# 模板',
      'https://api.openai.com/v1/chat/completions',
      'test-key'
    );

    expect(result).toEqual({
      success: false,
      message: '自定义网络失败提示'
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
