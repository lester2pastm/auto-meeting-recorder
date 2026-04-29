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
            content: '“项目推进同步”'
          }
        }]
      })
    });

    const result = await api.generateMeetingTitle(
      '会议纪要内容',
      'https://summary.example.com',
      'key',
      'gpt-4o-mini'
    );

    expect(result).toEqual({ success: true, title: '项目推进同步' });
  });

  test('retries retryable failures and returns a network message after exhausting retries', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => (
      realSetTimeout(fn, 0, ...args)
    ));

    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await api.generateMeetingTitle(
      '会议纪要内容',
      'https://summary.example.com',
      'key',
      'gpt-4o-mini'
    );

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(false);
    expect(result.message).toContain('网络');
  });

  test('skips empty summary input', async () => {
    const result = await api.generateMeetingTitle(
      '',
      'https://summary.example.com',
      'key',
      'gpt-4o-mini'
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, message: '缺少可用于生成标题的会议纪要' });
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
      '浼氳绾鍐呭',
      'https://summary.example.com',
      'key',
      'gpt-4o-mini'
    );

    expect(result).toEqual({ success: false, message: '生成的会议标题为空' });
  });

  test('handles non-Error rejection objects without throwing from catch', async () => {
    fetch.mockRejectedValueOnce({ code: 'E_ARM_PROVIDER' });

    const result = await api.generateMeetingTitle(
      '会议纪要内容',
      'https://summary.example.com',
      'key',
      'gpt-4o-mini'
    );

    expect(result).toEqual({ success: false, message: '请求失败，请稍后重试' });
  });
});
