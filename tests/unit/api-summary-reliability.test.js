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

  test.each([
    ['https://api.deepseek.com/v1/chat/completions', 'deepseek-v4-flash', { thinking: { type: 'disabled' } }],
    ['https://api.deepseek.com/v1/chat/completions', 'deepseek-flash', { thinking: { type: 'disabled' } }],
    ['https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', 'qwen3.5-plus', { enable_thinking: false }],
    ['https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', 'deepseek-v4-flash-0731', { enable_thinking: false }],
    ['https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', 'qwen3-235b-a22b-thinking-2507', {}],
    ['https://gateway.example.com/v1/chat/completions', 'deepseek-v4-flash', {}]
  ])('uses matching summary and connection controls for %s with %s', async (url, model, controls) => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '完整纪要' }, finish_reason: 'stop' }] })
    });

    await api.generateSummary('会议转录', '# 模板', url, 'test-key', model);
    await api.testSummaryApi(url, 'test-key', model);

    const summaryBody = JSON.parse(fetch.mock.calls[0][1].body);
    const connectionBody = JSON.parse(fetch.mock.calls[1][1].body);
    expect(summaryBody).toEqual({
      model, messages: expect.any(Array), max_tokens: 2000, temperature: 0.7, ...controls
    });
    expect(connectionBody).toEqual({ model, messages: expect.any(Array), max_tokens: 10, ...controls });
  });

  test('reports an invalid model or parameter as a failed summary connection test', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Unsupported parameter' } })
    });

    const result = await api.testSummaryApi('https://api.deepseek.com/v1/chat/completions', 'test-key', 'deepseek-v4-flash');
    expect(result).toEqual({ success: false, message: '连接失败: Unsupported parameter' });
  });

  test.each([
    ['length', '半篇纪要', '达到模型输出上限'],
    ['length', '', '达到模型输出上限'],
    ['stop', '  \n ', '未返回会议纪要正文'],
    ['stop', null, '未返回会议纪要正文']
  ])('rejects incomplete or empty output (%s, %j)', async (finishReason, content, message) => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ finish_reason: finishReason, message: { content } }] })
    });

    const result = await api.generateSummary('会议转录', '# 模板', 'https://api.example.com/v1/chat/completions', 'test-key');

    expect(result).toEqual({ success: false, message: expect.stringContaining(message) });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test.each([[27000, 150000], [50000, 180000]])(
    'uses 4000 output tokens and a %i-character transcript gets %i ms through body reading',
    async (length, timeout) => {
      jest.useFakeTimers();
      const onProgress = jest.fn();
      fetch.mockImplementationOnce(async (url, { signal }) => ({
        ok: true,
        json: () => new Promise((resolve, reject) => {
          const error = new Error('The operation was aborted.');
          error.name = 'AbortError';
          signal.addEventListener('abort', () => reject(error), { once: true });
        })
      })).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '重试成功' } }] })
      });

      const result = api.generateSummary('会'.repeat(length), '# 模板',
        'https://api.example.com/v1/chat/completions', 'test-key', 'test-model', onProgress);
      await new Promise((resolve) => realSetTimeout(resolve, 0));
      expect(JSON.parse(fetch.mock.calls[0][1].body).max_tokens).toBe(4000);

      jest.advanceTimersByTime(timeout - 1);
      expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
      jest.advanceTimersByTime(1);
      expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
      await new Promise((resolve) => realSetTimeout(resolve, 0));
      expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('请求超时'));
      jest.advanceTimersByTime(1000);
      await expect(result).resolves.toEqual({ success: true, summary: '重试成功' });
    }
  );

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
