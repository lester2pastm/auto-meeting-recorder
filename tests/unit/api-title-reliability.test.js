describe('generateMeetingTitle reliability', () => {
  let api;
  let consoleErrorSpy;
  let realSetTimeout;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    fetch.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../../src/js/meeting-title');
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

  test('returns sanitized title text on success', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: '### Title: Project Sync'
          }
        }]
      })
    });

    const result = await api.generateMeetingTitle(
      'meeting summary',
      'https://summary.example.com',
      'key',
      'gpt-4o-mini'
    );

    expect(result).toEqual({ success: true, title: 'Project Sync' });
  });

  test('strips think blocks from title responses before returning the title', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: '<think>reasoning trace</think>\n### Title: Sprint Sync'
          }
        }]
      })
    });

    const result = await api.generateMeetingTitle(
      'meeting summary',
      'https://summary.example.com',
      'key',
      'gpt-4o-mini'
    );

    expect(result).toEqual({ success: true, title: 'Sprint Sync' });
  });

  test('disables thinking for DeepSeek-compatible title requests', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: 'Project Sync'
          }
        }]
      })
    });

    await api.generateMeetingTitle(
      'meeting summary',
      'https://api.deepseek.com/chat/completions',
      'key',
      'deepseek-v4-flash'
    );

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.thinking).toEqual({ type: 'disabled' });
    expect(requestBody.reasoning_effort).toBeUndefined();
    expect(requestBody.reasoning).toBeUndefined();
  });

  test('disables thinking for DeepSeek models even through third-party gateways', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: 'Project Sync'
          }
        }]
      })
    });

    await api.generateMeetingTitle(
      'meeting summary',
      'https://gateway.example.com/v1/chat/completions',
      'key',
      'deepseek-v4-flash'
    );

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.thinking).toEqual({ type: 'disabled' });
  });

  test('disables thinking for GLM title requests', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: 'Project Sync'
          }
        }]
      })
    });

    await api.generateMeetingTitle(
      'meeting summary',
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      'key',
      'glm-4.7'
    );

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.thinking).toEqual({ type: 'disabled' });
    expect(requestBody.reasoning_effort).toBeUndefined();
    expect(requestBody.reasoning).toBeUndefined();
  });

  test('does not add thinking controls for standard non-reasoning title requests', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: 'Sprint Sync'
          }
        }]
      })
    });

    await api.generateMeetingTitle(
      'meeting summary',
      'https://api.openai.com/v1/chat/completions',
      'key',
      'gpt-4o-mini'
    );

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.thinking).toBeUndefined();
    expect(requestBody.reasoning_effort).toBeUndefined();
    expect(requestBody.reasoning).toBeUndefined();
  });

  test('disables reasoning for OpenAI title requests', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: 'Sprint Sync'
          }
        }]
      })
    });

    await api.generateMeetingTitle(
      'meeting summary',
      'https://api.openai.com/v1/chat/completions',
      'key',
      'o4-mini'
    );

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.reasoning_effort).toBe('none');
    expect(requestBody.thinking).toBeUndefined();
    expect(requestBody.reasoning).toBeUndefined();
  });

  test('disables reasoning for OpenRouter title requests', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: 'Sprint Sync'
          }
        }]
      })
    });

    await api.generateMeetingTitle(
      'meeting summary',
      'https://openrouter.ai/api/v1/chat/completions',
      'key',
      'openai/o4-mini'
    );

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.reasoning).toEqual({ effort: 'none' });
    expect(requestBody.reasoning_effort).toBeUndefined();
    expect(requestBody.thinking).toBeUndefined();
  });

  test('disables thinking for DashScope Qwen title requests', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: 'Sprint Sync'
          }
        }]
      })
    });

    await api.generateMeetingTitle(
      'meeting summary',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      'key',
      'qwen3.5-plus'
    );

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.enable_thinking).toBe(false);
    expect(requestBody.thinking).toBeUndefined();
    expect(requestBody.reasoning).toBeUndefined();
    expect(requestBody.reasoning_effort).toBeUndefined();
  });

  test('disables thinking for DashScope qwen-plus title requests', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: 'Sprint Sync'
          }
        }]
      })
    });

    await api.generateMeetingTitle(
      'meeting summary',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      'key',
      'qwen-plus-2025-04-28'
    );

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.enable_thinking).toBe(false);
  });

  test('disables thinking for DashScope GLM title requests', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: 'Sprint Sync'
          }
        }]
      })
    });

    await api.generateMeetingTitle(
      'meeting summary',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      'key',
      'glm-5'
    );

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.enable_thinking).toBe(false);
    expect(requestBody.thinking).toBeUndefined();
  });

  test('disables thinking for DashScope MiniMax title requests', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: 'Sprint Sync'
          }
        }]
      })
    });

    await api.generateMeetingTitle(
      'meeting summary',
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      'key',
      'MiniMax-M2.5'
    );

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.enable_thinking).toBe(false);
    expect(requestBody.extra_body).toBeUndefined();
  });

  test('splits reasoning away from content for MiniMax title requests', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: 'Sprint Sync'
          }
        }]
      })
    });

    await api.generateMeetingTitle(
      'meeting summary',
      'https://api.minimaxi.com/v1/chat/completions',
      'key',
      'MiniMax-M2.7'
    );

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.extra_body).toEqual({ reasoning_split: true });
    expect(requestBody.thinking).toBeUndefined();
    expect(requestBody.reasoning).toBeUndefined();
    expect(requestBody.reasoning_effort).toBeUndefined();
  });

  test('retries retryable failures and returns a message after exhausting retries', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => (
      realSetTimeout(fn, 0, ...args)
    ));

    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await api.generateMeetingTitle(
      'meeting summary',
      'https://summary.example.com',
      'key',
      'gpt-4o-mini'
    );

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(false);
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  test('skips empty summary input', async () => {
    const result = await api.generateMeetingTitle(
      '',
      'https://summary.example.com',
      'key',
      'gpt-4o-mini'
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(typeof result.message).toBe('string');
  });

  test('treats empty sanitized title as a failure result', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: '""'
          }
        }]
      })
    });

    const result = await api.generateMeetingTitle(
      'meeting summary',
      'https://summary.example.com',
      'key',
      'gpt-4o-mini'
    );

    expect(result.success).toBe(false);
    expect(typeof result.message).toBe('string');
  });

  test('handles non-Error rejection objects without throwing from catch', async () => {
    fetch.mockRejectedValueOnce({ code: 'E_ARM_PROVIDER' });

    const result = await api.generateMeetingTitle(
      'meeting summary',
      'https://summary.example.com',
      'key',
      'gpt-4o-mini'
    );

    expect(result.success).toBe(false);
    expect(typeof result.message).toBe('string');
  });
});
