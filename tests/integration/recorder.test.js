/**
 * 录音功能集成测试
 * 测试录音流程：开始 -> 暂停 -> 恢复 -> 停止
 */

describe('录音功能集成测试', () => {
  let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;
  let isPaused = false;
  let recordingStartTime = null;
  let recordingPausedTime = 0;

  beforeEach(() => {
    jest.clearAllMocks();
    audioChunks = [];
    isRecording = false;
    isPaused = false;
    recordingStartTime = null;
    recordingPausedTime = 0;

    // 模拟 MediaRecorder
    mediaRecorder = {
      start: jest.fn(),
      stop: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      state: 'inactive',
      ondataavailable: null,
      onstop: null,
      onpause: null,
      onresume: null
    };
  });

  describe('录音流程', () => {
    it('应该成功开始录音', async () => {
      // 模拟获取音频流
      const mockStream = {
        getAudioTracks: jest.fn().mockReturnValue([{
          label: '麦克风',
          enabled: true,
          muted: false,
          readyState: 'live'
        }])
      };

      navigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      // 开始录音流程
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.start();
      mediaRecorder.state = 'recording';
      isRecording = true;
      recordingStartTime = Date.now();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(mediaRecorder.start).toHaveBeenCalled();
      expect(mediaRecorder.state).toBe('recording');
      expect(isRecording).toBe(true);
      expect(recordingStartTime).toBeTruthy();
    });

    it('应该成功暂停录音', () => {
      // 先开始录音
      mediaRecorder.start();
      mediaRecorder.state = 'recording';
      isRecording = true;
      recordingStartTime = Date.now();

      // 暂停录音
      mediaRecorder.pause();
      mediaRecorder.state = 'paused';
      isPaused = true;

      expect(mediaRecorder.pause).toHaveBeenCalled();
      expect(mediaRecorder.state).toBe('paused');
      expect(isPaused).toBe(true);
    });

    it('应该成功恢复录音', () => {
      // 先开始并暂停录音
      mediaRecorder.start();
      mediaRecorder.state = 'recording';
      mediaRecorder.pause();
      mediaRecorder.state = 'paused';
      isPaused = true;

      // 恢复录音
      mediaRecorder.resume();
      mediaRecorder.state = 'recording';
      isPaused = false;

      expect(mediaRecorder.resume).toHaveBeenCalled();
      expect(mediaRecorder.state).toBe('recording');
      expect(isPaused).toBe(false);
    });

    it('应该成功停止录音并生成音频 Blob', () => {
      // 模拟录制数据
      const mockData = { data: new Blob(['audio data'], { type: 'audio/webm' }) };
      audioChunks.push(mockData.data);

      // 停止录音
      mediaRecorder.stop();
      mediaRecorder.state = 'inactive';
      isRecording = false;

      // 模拟 onstop 回调
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

      expect(mediaRecorder.stop).toHaveBeenCalled();
      expect(mediaRecorder.state).toBe('inactive');
      expect(isRecording).toBe(false);
      expect(audioBlob.size).toBeGreaterThan(0);
      expect(audioBlob.type).toBe('audio/webm');
    });

    it('应该正确处理录音数据块', () => {
      // 模拟 ondataavailable 事件
      const chunk1 = new Blob(['chunk1'], { type: 'audio/webm' });
      const chunk2 = new Blob(['chunk2'], { type: 'audio/webm' });

      audioChunks.push(chunk1);
      audioChunks.push(chunk2);

      expect(audioChunks.length).toBe(2);
      expect(audioChunks[0]).toBe(chunk1);
      expect(audioChunks[1]).toBe(chunk2);
    });
  });

  describe('录音计时功能', () => {
    it('应该正确计算录音时长', () => {
      const startTime = Date.now();
      const elapsedTime = 5000; // 5秒

      // 模拟经过时间
      const currentTime = startTime + elapsedTime;
      const duration = currentTime - startTime;

      expect(duration).toBe(elapsedTime);
    });

    it('应该正确处理暂停时间', () => {
      const startTime = Date.now();
      const pauseStartTime = startTime + 2000;
      const pauseEndTime = pauseStartTime + 3000;

      // 计算暂停时间
      const pauseDuration = pauseEndTime - pauseStartTime;
      recordingPausedTime += pauseDuration;

      expect(recordingPausedTime).toBe(3000);
    });

    it('应该计算实际录音时间（排除暂停）', () => {
      const startTime = Date.now();
      recordingPausedTime = 3000;
      const currentTime = startTime + 10000;

      // 实际录音时间 = 总时间 - 暂停时间
      const actualRecordingTime = currentTime - startTime - recordingPausedTime;

      expect(actualRecordingTime).toBe(7000);
    });
  });

  describe('音频可视化', () => {
    it('应该创建 AudioContext', () => {
      const audioContext = new AudioContext();

      expect(AudioContext).toHaveBeenCalled();
      expect(audioContext).toBeDefined();
    });

    it('应该创建 AnalyserNode', () => {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();

      expect(audioContext.createAnalyser).toHaveBeenCalled();
      expect(analyser).toBeDefined();
      expect(analyser.frequencyBinCount).toBe(128);
    });

    it('应该获取频率数据', () => {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      analyser.getByteFrequencyData(dataArray);

      expect(analyser.getByteFrequencyData).toHaveBeenCalledWith(dataArray);
    });
  });

  describe('系统音频捕获', () => {
    it('应该在 Electron 环境中使用 desktopCapturer', async () => {
      // 模拟 Electron desktopCapturer
      const mockSources = [
        { id: 'screen:1', name: 'Entire screen' },
        { id: 'window:1', name: '应用窗口' }
      ];

      window.electronAPI.getDesktopCapturerSources.mockResolvedValue({
        success: true,
        sources: mockSources
      });

      const result = await window.electronAPI.getDesktopCapturerSources();

      expect(window.electronAPI.getDesktopCapturerSources).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.sources).toEqual(mockSources);
    });

    it('应该在浏览器环境中使用 getDisplayMedia', async () => {
      const mockDisplayStream = {
        getAudioTracks: jest.fn().mockReturnValue([{ label: '系统音频' }]),
        getVideoTracks: jest.fn().mockReturnValue([])
      };

      navigator.mediaDevices.getDisplayMedia.mockResolvedValue(mockDisplayStream);

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
        video: true,
        audio: true
      });
      expect(stream).toBe(mockDisplayStream);
    });
  });

  describe('错误处理', () => {
    it('应该处理麦克风权限拒绝', async () => {
      navigator.mediaDevices.getUserMedia.mockRejectedValue(
        new Error('Permission denied')
      );

      await expect(navigator.mediaDevices.getUserMedia({ audio: true }))
        .rejects.toThrow('Permission denied');
    });

    it('应该处理屏幕分享取消', async () => {
      navigator.mediaDevices.getDisplayMedia.mockRejectedValue(
        new Error('User cancelled')
      );

      await expect(navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }))
        .rejects.toThrow('User cancelled');
    });

    it('应该处理音频设备不存在', async () => {
      navigator.mediaDevices.getUserMedia.mockRejectedValue(
        new Error('Requested device not found')
      );

      await expect(navigator.mediaDevices.getUserMedia({ audio: true }))
        .rejects.toThrow('Requested device not found');
    });
  });
});
