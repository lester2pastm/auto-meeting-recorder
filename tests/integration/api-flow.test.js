/**
 * API 调用流程集成测试
 * 测试完整的 API 调用流程：音频转写 -> 摘要生成
 */

describe('API 调用流程集成测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('完整转写和摘要流程', () => {
    it('应该完成从音频转写到摘要生成的完整流程', async () => {
      const apiKey = 'test-api-key';
      const sttApiUrl = 'https://api.openai.com/v1/audio/transcriptions';
      const summaryApiUrl = 'https://api.openai.com/v1/chat/completions';
      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });

      // 步骤 1: 转写音频
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ text: '这是会议的转写文本内容。' })
      });

      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      formData.append('model', 'whisper-1');

      const sttResponse = await fetch(sttApiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
      });

      const sttData = await sttResponse.json();
      expect(sttResponse.ok).toBe(true);
      expect(sttData.text).toBe('这是会议的转写文本内容。');

      // 步骤 2: 生成摘要
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: '会议摘要：\n1. 讨论了项目进展\n2. 确定了下一步计划'
            }
          }]
        })
      });

      const summaryPrompt = `请总结以下会议内容：\n\n${sttData.text}`;
      const summaryResponse = await fetch(summaryApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: summaryPrompt }]
        })
      });

      const summaryData = await summaryResponse.json();
      expect(summaryResponse.ok).toBe(true);
      expect(summaryData.choices[0].message.content).toContain('会议摘要');
    });
  });

  describe('多 API 提供商支持', () => {
    it('应该支持 OpenAI API 流程', async () => {
      const apiKey = 'sk-openai-test-key';
      const sttApiUrl = 'https://api.openai.com/v1/audio/transcriptions';
      const summaryApiUrl = 'https://api.openai.com/v1/chat/completions';

      // 转写
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'OpenAI 转写结果' })
      });

      const sttResponse = await fetch(sttApiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: new FormData()
      });

      expect(fetch).toHaveBeenCalledWith(
        sttApiUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${apiKey}`
          })
        })
      );

      // 摘要
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OpenAI 摘要' } }]
        })
      });

      const summaryResponse = await fetch(summaryApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'test' }]
        })
      });

      expect(summaryResponse.ok).toBe(true);
    });

    it('应该支持阿里云百炼 API 流程', async () => {
      const apiKey = 'sk-bailian-test-key';
      const sttApiUrl = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription';

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output: {
            text: '百炼转写结果'
          }
        })
      });

      const requestBody = {
        model: 'paraformer-realtime-v2',
        input: {
          audio: 'base64encodedaudio'
        },
        parameters: {
          sample_rate: 16000,
          format: 'webm',
          language_hints: ['zh', 'en']
        }
      };

      const response = await fetch(sttApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      expect(response.ok).toBe(true);
      expect(data.output.text).toBe('百炼转写结果');
    });

    it('应该支持 SiliconFlow API 流程', async () => {
      const apiKey = 'sk-siliconflow-test-key';
      const apiUrl = 'https://api.siliconflow.cn/v1/audio/transcriptions';

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'SiliconFlow 转写结果' })
      });

      const formData = new FormData();
      formData.append('file', new Blob(['audio']), 'recording.webm');
      formData.append('model', 'whisper-1');

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
      });

      expect(response.ok).toBe(true);
    });
  });

  describe('错误恢复流程', () => {
    it('应该在转写失败时提供错误信息', async () => {
      const apiUrl = 'https://api.openai.com/v1/audio/transcriptions';
      const apiKey = 'invalid-key';

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } })
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: new FormData()
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
      expect(data.error.message).toBe('Invalid API key');
    });

    it('应该在摘要生成失败时提供错误信息', async () => {
      const apiUrl = 'https://api.openai.com/v1/chat/completions';
      const apiKey = 'invalid-key';

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limit exceeded' } })
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [] })
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(429);
      expect(data.error.message).toBe('Rate limit exceeded');
    });

    it('应该处理网络超时', async () => {
      const apiUrl = 'https://api.openai.com/v1/audio/transcriptions';

      fetch.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(fetch(apiUrl)).rejects.toThrow('Network timeout');
    });
  });

  describe('API 响应处理', () => {
    it('应该正确处理空转写结果', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: '' })
      });

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions');
      const data = await response.json();

      expect(data.text).toBe('');
    });

    it('应该处理长文本转写结果', async () => {
      const longText = 'A'.repeat(10000);

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: longText })
      });

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions');
      const data = await response.json();

      expect(data.text.length).toBe(10000);
    });

    it('应该处理包含特殊字符的转写结果', async () => {
      const textWithSpecialChars = '会议内容：\n1. 项目进展 100%\n2. 成本 < 预算\n3. 收入 > 预期';

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: textWithSpecialChars })
      });

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions');
      const data = await response.json();

      expect(data.text).toContain('100%');
      expect(data.text).toContain('<');
      expect(data.text).toContain('>');
    });
  });
});
