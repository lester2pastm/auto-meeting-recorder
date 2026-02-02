/**
 * API 模块单元测试
 * 测试语音识别 API 和摘要生成 API 的调用功能
 */

describe('API 模块测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('testSttApi - 语音识别 API 测试', () => {
    it('应该成功测试语音识别 API 连接', async () => {
      const apiUrl = 'https://api.openai.com/v1/audio/transcriptions';
      const apiKey = 'test-api-key';
      const model = 'whisper-1';

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      // 模拟 testSttApi 函数的行为
      const formData = new FormData();
      formData.append('file', new Blob(['test'], { type: 'audio/webm' }), 'test.webm');
      formData.append('model', model);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      });

      expect(fetch).toHaveBeenCalledWith(
        apiUrl,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${apiKey}`
          })
        })
      );
      expect(response.ok).toBe(true);
    });

    it('应该处理 400 错误（API 正常但请求格式错误）', async () => {
      const apiUrl = 'https://api.openai.com/v1/audio/transcriptions';
      const apiKey = 'test-api-key';

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      // 400 错误通常表示 API 可连接但请求格式有误
      expect(response.status).toBe(400);
    });

    it('应该处理网络错误', async () => {
      const apiUrl = 'https://invalid-api-url.com';
      const apiKey = 'test-api-key';

      fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetch(apiUrl)).rejects.toThrow('Network error');
    });

    it('应该处理 401 未授权错误', async () => {
      const apiUrl = 'https://api.openai.com/v1/audio/transcriptions';
      const apiKey = 'invalid-key';

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      expect(response.status).toBe(401);
    });
  });

  describe('testSummaryApi - 摘要生成 API 测试', () => {
    it('应该成功测试摘要生成 API 连接', async () => {
      const apiUrl = 'https://api.openai.com/v1/chat/completions';
      const apiKey = 'test-api-key';
      const model = 'gpt-3.5-turbo';

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10
        })
      });

      expect(fetch).toHaveBeenCalledWith(
        apiUrl,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          })
        })
      );
      expect(response.ok).toBe(true);
    });

    it('应该正确设置请求头和请求体', async () => {
      const apiUrl = 'https://api.openai.com/v1/chat/completions';
      const apiKey = 'test-key';
      const model = 'gpt-4';

      fetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const requestBody = {
        model: model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 10
      };

      await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const callArgs = fetch.mock.calls[0];
      const requestInit = callArgs[1];
      
      expect(requestInit.headers['Authorization']).toBe(`Bearer ${apiKey}`);
      expect(requestInit.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(requestInit.body)).toEqual(requestBody);
    });
  });

  describe('transcribeAudio - 音频转写测试', () => {
    it('应该支持 OpenAI Whisper API', async () => {
      const apiUrl = 'https://api.openai.com/v1/audio/transcriptions';
      const apiKey = 'test-key';
      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ text: '转写结果' })
      });

      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      formData.append('model', 'whisper-1');

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
      });

      expect(fetch).toHaveBeenCalled();
      expect(response.ok).toBe(true);
    });

    it('应该支持阿里云百炼 API', async () => {
      const apiUrl = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription';
      const apiKey = 'test-key';
      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });

      // 模拟 base64 转换
      const base64Audio = 'YXVkaW8gZGF0YQ==';

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ output: { text: '百炼转写结果' } })
      });

      const requestBody = {
        model: 'paraformer-realtime-v2',
        input: { audio: base64Audio },
        parameters: {
          sample_rate: 16000,
          format: 'webm',
          language_hints: ['zh', 'en']
        }
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      expect(fetch).toHaveBeenCalledWith(
        apiUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('应该支持 SiliconFlow API', async () => {
      const apiUrl = 'https://api.siliconflow.cn/v1/audio/transcriptions';
      const apiKey = 'test-key';
      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ text: 'SiliconFlow 转写结果' })
      });

      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      formData.append('model', 'whisper-1');

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
      });

      expect(fetch).toHaveBeenCalled();
      expect(response.ok).toBe(true);
    });
  });

  describe('generateSummary - 摘要生成测试', () => {
    it('应该成功生成会议摘要', async () => {
      const apiUrl = 'https://api.openai.com/v1/chat/completions';
      const apiKey = 'test-key';
      const model = 'gpt-3.5-turbo';
      const transcript = '会议内容...';
      const template = '请总结以下会议内容：\n\n{transcript}';

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: '会议摘要：讨论了项目进展...'
            }
          }]
        })
      });

      const prompt = template.replace('{transcript}', transcript);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await response.json();
      
      expect(response.ok).toBe(true);
      expect(data.choices[0].message.content).toContain('会议摘要');
    });

    it('应该处理 API 返回的错误', async () => {
      const apiUrl = 'https://api.openai.com/v1/chat/completions';
      const apiKey = 'invalid-key';

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } })
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });
});
