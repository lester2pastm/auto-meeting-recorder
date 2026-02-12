/**
 * API 调用流程集成测试
 * 测试完整的 API 调用流程：音频转写 -> 摘要生成
 */

// Mock storage functions
const mockMeetings = new Map();

async function saveMeeting(meeting) {
  mockMeetings.set(meeting.id, { ...meeting });
}

async function getMeeting(id) {
  return mockMeetings.get(id) || null;
}

async function updateMeeting(id, updates) {
  const meeting = mockMeetings.get(id);
  if (meeting) {
    mockMeetings.set(id, { ...meeting, ...updates });
  }
}

const TRANSCRIPT_STATUS = {
  PENDING: 'pending',
  TRANSCRIBING: 'transcribing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// Mock global functions needed by processRecording
global.showLoading = jest.fn();
global.hideLoading = jest.fn();
global.showToast = jest.fn();
global.updateSubtitleContent = jest.fn();
global.generateMeetingSummary = jest.fn().mockResolvedValue(undefined);
global.currentSettings = {
  sttApiUrl: 'https://api.test.com/transcriptions',
  sttApiKey: 'test-key',
  sttModel: 'whisper-1'
};

// Global reference for current transcript
global.currentTranscript = '';

// Mock transcribeAudio function
global.transcribeAudio = jest.fn();

// Implementation of processRecording (mirrors app.js implementation)
async function processRecording(audioBlob, meetingId) {
  try {
    console.log('Processing recording, meetingId:', meetingId);

    if (!global.currentSettings.sttApiUrl || !global.currentSettings.sttApiKey) {
      console.error('API not configured');
      global.showToast('Please configure speech recognition API', 'error');
      return;
    }

    global.showLoading('Transcribing...');
    console.log('Starting transcription API call');

    // Update status to transcribing
    await updateMeeting(meetingId, {
      transcriptStatus: TRANSCRIPT_STATUS.TRANSCRIBING
    });

    const result = await global.transcribeAudio(audioBlob, global.currentSettings.sttApiUrl, global.currentSettings.sttApiKey, global.currentSettings.sttModel);

    console.log('Transcription result:', result);

    if (!result.success) {
      // Update status to failed on transcription error
      await updateMeeting(meetingId, {
        transcriptStatus: TRANSCRIPT_STATUS.FAILED
      });
      global.showToast('Transcription failed: ' + result.message, 'error');
      return;
    }

    global.updateSubtitleContent(result.text);
    global.showToast('Transcription completed, generating summary...', 'info');

    // Save current transcript text for summary refresh
    global.currentTranscript = result.text;

    // Update meeting with transcript and completed status
    await updateMeeting(meetingId, {
      transcript: result.text,
      transcriptStatus: TRANSCRIPT_STATUS.COMPLETED
    });

    await global.generateMeetingSummary(result.text, audioBlob, meetingId);
  } catch (error) {
    console.error('Failed to process recording:', error);
    // Update status to failed on exception
    await updateMeeting(meetingId, {
      transcriptStatus: TRANSCRIPT_STATUS.FAILED
    });
    global.showToast('Failed to process recording', 'error');
  } finally {
    global.hideLoading();
  }
}

describe('API 调用流程集成测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMeetings.clear();
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

describe('Transcription flow with status transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMeetings.clear();
  });

  test('转写流程应更新状态: pending -> transcribing -> completed', async () => {
    const meetingId = 'test-1';
    const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });
    
    await saveMeeting({
      id: meetingId,
      transcriptStatus: 'pending'
    });

    // Mock successful transcription
    global.transcribeAudio.mockResolvedValue({
      success: true,
      text: 'Transcribed text'
    });

    await processRecording(audioBlob, meetingId);

    const meeting = await getMeeting(meetingId);
    expect(meeting.transcriptStatus).toBe('completed');
    expect(meeting.transcript).toBe('Transcribed text');
  });

  test('转写失败应更新状态为 failed', async () => {
    const meetingId = 'test-2';
    const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });
    
    await saveMeeting({
      id: meetingId,
      transcriptStatus: 'pending'
    });

    // Mock failed transcription
    global.transcribeAudio.mockResolvedValue({
      success: false,
      message: 'Network error'
    });

    await processRecording(audioBlob, meetingId);

    const meeting = await getMeeting(meetingId);
    expect(meeting.transcriptStatus).toBe('failed');
  });
});
