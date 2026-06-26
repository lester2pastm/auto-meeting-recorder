/**
 * api.js 流式上传优化测试
 *
 * P0-2: dispatchTranscriptionViaIPC 应该传文件路径而非二进制数据
 * P0-3: 百炼请求应走主进程构造（文件路径免去渲染进程全量读取）
 */

describe('API streaming optimization', () => {
  let api;
  let consoleLogSpy;
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

    global.URL.createObjectURL = jest.fn(() => 'blob:test-audio');
    global.URL.revokeObjectURL = jest.fn();

    if (typeof TextEncoder === 'undefined') {
      global.TextEncoder = require('util').TextEncoder;
    }

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

    global.isElectron = () => true;

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
  });

  describe('dispatchTranscriptionViaIPC should pass filePath to main process', () => {
    test('passes filePath to httpPost when audioFilePath is available, avoiding rendering-process binary copy', async () => {
      const httpPost = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: JSON.stringify({ text: 'via file path' })
      });

      global.window.electronAPI = {
        httpPost
      };

      const audioBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
      if (typeof audioBlob.arrayBuffer !== 'function') {
        audioBlob.arrayBuffer = async () => new Uint8Array([1, 2, 3]).buffer;
      }
      const filePath = '/path/to/audio.webm';

      const result = await api.transcribeAudio(
        audioBlob,
        'https://api.openai.com/v1/audio/transcriptions',
        'test-key',
        'whisper-1',
        filePath
      );

      expect(result).toEqual({ success: true, text: 'via file path' });
      expect(httpPost).toHaveBeenCalledTimes(1);

      const httpPostCall = httpPost.mock.calls[0][0];
      expect(httpPostCall.filePath).toBe(filePath);
      expect(httpPostCall.url).toBe('https://api.openai.com/v1/audio/transcriptions');
      expect(httpPostCall.headers['Authorization']).toBe('Bearer test-key');

      // binary body SHOULD NOT be sent when filePath is available
      expect(httpPostCall.body).toBeUndefined();
    });

    test('falls back to binary body when audioFilePath is not available', async () => {
      const httpPost = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: JSON.stringify({ text: 'via binary' })
      });

      global.window.electronAPI = {
        httpPost
      };

      const audioBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
      if (typeof audioBlob.arrayBuffer !== 'function') {
        audioBlob.arrayBuffer = async () => new Uint8Array([1, 2, 3]).buffer;
      }

      const result = await api.transcribeAudio(
        audioBlob,
        'https://api.openai.com/v1/audio/transcriptions',
        'test-key',
        'whisper-1',
        null
      );

      expect(result).toEqual({ success: true, text: 'via binary' });
      expect(httpPost).toHaveBeenCalledTimes(1);

      const httpPostCall = httpPost.mock.calls[0][0];
      expect(httpPostCall.filePath).toBeUndefined();
      expect(httpPostCall.body).toBeDefined();
    });
  });

  describe('transcribeAudioSegments should always use main-process splitting', () => {
    test('uses splitAudioFile IPC for oversized audio even on non-Linux platforms', async () => {
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

      const httpPost = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: JSON.stringify({ text: 'segmented transcript' })
      });

      global.window.electronAPI = {
        httpPost,
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

      const result = await api.transcribeAudio(
        createLargeAudioBlob(),
        'https://api.openai.com/v1/audio/transcriptions',
        'test-key',
        'whisper-1',
        '/tmp/audio.webm'
      );

      expect(result).toEqual({ success: true, text: 'segmented transcript' });

      // splitAudioFile should have been called (not the PCM splitAudio fallback)
      expect(global.window.electronAPI.splitAudioFile).toHaveBeenCalledWith(
        '/tmp/audio.webm',
        expect.any(Object)
      );

      // httpPost should receive filePath, not binary body
      const httpPostCalls = httpPost.mock.calls;
      httpPostCalls.forEach((call) => {
        expect(call[0].filePath).toBeDefined();
        expect(call[0].body).toBeUndefined();
      });

      global.Audio = originalAudio;
    });

    test('does not fall back to PCM-based splitAudio when splitAudioFile fails', async () => {
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

      global.window.electronAPI = {
        httpPost: jest.fn(),
        splitAudioFile: jest.fn().mockRejectedValue(new Error('ffmpeg not found')),
        readAudioFile: jest.fn(),
        deleteFile: jest.fn()
      };

      const result = await api.transcribeAudio(
        createLargeAudioBlob(),
        'https://api.openai.com/v1/audio/transcriptions',
        'test-key',
        'whisper-1',
        '/tmp/audio.webm'
      );

      // Should return an error rather than falling back to PCM-based splitting
      expect(result.success).toBe(false);

      // splitAudioFile was called (it failed, but was attempted)
      expect(global.window.electronAPI.splitAudioFile).toHaveBeenCalled();

      // httpPost was never called (no fallback to PCM path)
      expect(global.window.electronAPI.httpPost).not.toHaveBeenCalled();

      global.Audio = originalAudio;
    });

    test('releases segment blob references after each segment is processed', async () => {
      const readAudioFile = jest.fn()
        .mockResolvedValueOnce({
          success: true,
          data: new Uint8Array(new Array(1024 * 1024).fill(1))
        })
        .mockResolvedValueOnce({
          success: true,
          data: new Uint8Array(new Array(1024 * 1024).fill(2))
        });

      const httpPost = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: JSON.stringify({ text: 'segment 1' })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: JSON.stringify({ text: 'segment 2' })
        });

      global.window.electronAPI = {
        httpPost,
        splitAudioFile: jest.fn().mockResolvedValue({
          success: true,
          files: ['seg-1.webm', 'seg-2.webm']
        }),
        readAudioFile,
        deleteFile: jest.fn().mockResolvedValue(null)
      };

      const result = await api.transcribeAudioSegments(
        createLargeAudioBlob(),
        'https://api.openai.com/v1/audio/transcriptions',
        'test-key',
        'whisper-1',
        '/tmp/audio.webm'
      );

      expect(result.success).toBe(true);
      expect(result.text).toBe('segment 1\n\nsegment 2');

      // Each segment was read once
      expect(readAudioFile).toHaveBeenCalledTimes(2);

      // Temporary segment files were cleaned up
      expect(global.window.electronAPI.deleteFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('dispatchTranscriptionRequest integrates filePath-aware dispatch', () => {
    test('passes audioFilePath to dispatchTranscriptionViaIPC for segment uploads', async () => {
      const httpPost = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: JSON.stringify({ text: 'single segment' })
      });

      global.window.electronAPI = {
        httpPost,
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

      const audioFilePath = '/userData/audio_files/segment_test.webm';

      const result = await api.transcribeAudioSegments(
        createLargeAudioBlob(),
        'https://api.siliconflow.cn/v1/audio/transcriptions',
        'test-key',
        'whisper-1',
        audioFilePath
      );

      expect(result.success).toBe(true);

      // httpPost was called with filePath pointing to the segment file
      const httpPostCall = httpPost.mock.calls[0][0];
      expect(httpPostCall.filePath).toBe('segment-1.webm');
      expect(httpPostCall.headers['Authorization']).toBe('Bearer test-key');
    });
  });
});
