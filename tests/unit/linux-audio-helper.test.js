const {
  detectAudioSystem,
  checkLinuxDependencies,
  resetDependencyCheck,
  parsePulseSourceList,
  chooseRecordingSources,
  getAlsaSourceLoadCandidates
} = require('../../electron/linux-audio-helper');

describe('Linux 音频系统检测', () => {
  let mockStore;
  let mockExec;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = {
      get: jest.fn(),
      set: jest.fn()
    };
    
    jest.mock('child_process', () => ({
      exec: jest.fn()
    }));
    
    const { exec } = require('child_process');
    mockExec = exec;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('detectAudioSystem', () => {
    it('在非 Linux 平台应返回 other', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const result = await detectAudioSystem();

      expect(result).toEqual({ type: 'other', available: false });

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it.skip('应检测 PulseAudio 系统', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockExec.mockResolvedValue({ stdout: '' });

      const result = await detectAudioSystem();

      expect(result.type).toBe('pulseaudio');
      expect(result.available).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it.skip('应检测 PipeWire 系统', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockExec.mockRejectedValueOnce(new Error('command not found'))
        .mockRejectedValueOnce(new Error('command not found'))
        .mockResolvedValue({ stdout: '' });

      const result = await detectAudioSystem();

      expect(result.type).toBe('pipewire');
      expect(result.available).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it.skip('当音频系统不可用时应返回 unknown', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockExec.mockRejectedValue(new Error('command not found'));

      const result = await detectAudioSystem();

      expect(result.type).toBe('unknown');
      expect(result.available).toBe(false);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('checkLinuxDependencies', () => {
    it('在非 Linux 平台应返回 hasDependencies: true', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const result = await checkLinuxDependencies(mockStore);

      expect(result.hasDependencies).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it.skip('当已提示过应跳过检测', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockStore.get.mockReturnValue(true);

      const result = await checkLinuxDependencies(mockStore);

      expect(result.hasDependencies).toBe(true);
      expect(mockStore.get).toHaveBeenCalledWith('linuxDependencyPrompted');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it.skip('当 PulseAudio 可用应返回音频系统类型', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockStore.get.mockReturnValue(false);
      mockExec.mockResolvedValue({ stdout: '' });

      const result = await checkLinuxDependencies(mockStore);

      expect(result.hasDependencies).toBe(true);
      expect(result.audioSystem).toBe('pulseaudio');
      expect(result.needsRemapSource).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it.skip('当 PipeWire 可用应返回音频系统类型', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockStore.get.mockReturnValue(false);
      mockExec.mockRejectedValueOnce(new Error('command not found'))
        .mockRejectedValueOnce(new Error('command not found'))
        .mockResolvedValue({ stdout: '' });

      const result = await checkLinuxDependencies(mockStore);

      expect(result.hasDependencies).toBe(true);
      expect(result.audioSystem).toBe('pipewire');
      expect(result.needsRemapSource).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it.skip('当音频系统不可用应返回安装命令', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockStore.get.mockReturnValue(false);
      mockExec.mockImplementation((cmd) => {
        if (cmd.includes('dpkg -l')) {
          return Promise.reject(new Error('no packages found'));
        }
        return Promise.reject(new Error('command not found'));
      });

      const result = await checkLinuxDependencies(mockStore);

      expect(result.hasDependencies).toBe(false);
      expect(result.missingDeps).toBeDefined();
      expect(result.missingDeps.length).toBeGreaterThan(0);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it.skip('当 FFmpeg 不可用时应添加到缺失依赖列表', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockStore.get.mockReturnValue(false);
      
      let callCount = 0;
      mockExec.mockImplementation((cmd) => {
        callCount++;
        if (cmd.includes('pulseaudio') || cmd.includes('libpulse')) {
          return Promise.resolve({ stdout: 'ii  pulseaudio', stderr: '' });
        }
        if (cmd.includes('ffmpeg')) {
          return Promise.reject(new Error('no packages found'));
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const result = await checkLinuxDependencies(mockStore);

      expect(result.hasDependencies).toBe(false);
      expect(result.missingDeps).toBeDefined();
      const ffmpegDep = result.missingDeps.find(d => d.name === 'FFmpeg');
      expect(ffmpegDep).toBeDefined();

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('resetDependencyCheck', () => {
    it('应清除提示标志', async () => {
      await resetDependencyCheck(mockStore);

      expect(mockStore.set).toHaveBeenCalledWith('linuxDependencyPrompted', false);
      expect(mockStore.set).toHaveBeenCalledTimes(1);
    });

    it('应返回成功', async () => {
      const result = await resetDependencyCheck(mockStore);

      expect(result.success).toBe(true);
    });
  });

  describe('parsePulseSourceList', () => {
    it('应解析 pactl list sources short 输出', () => {
      const stdout = [
        '0\talsa_output.platform-sound.stereo-fallback.monitor\tmodule-alsa-card.c\ts16le 2ch 44100Hz\tSUSPENDED',
        '1\tnoiseReduceSource\tmodule-echo-cancel.c\tfloat32le 1ch 48000Hz\tRUNNING'
      ].join('\n');

      expect(parsePulseSourceList(stdout)).toEqual([
        {
          id: '0',
          name: 'alsa_output.platform-sound.stereo-fallback.monitor',
          driver: 'module-alsa-card.c',
          sampleSpec: 's16le 2ch 44100Hz',
          state: 'SUSPENDED'
        },
        {
          id: '1',
          name: 'noiseReduceSource',
          driver: 'module-echo-cancel.c',
          sampleSpec: 'float32le 1ch 48000Hz',
          state: 'RUNNING'
        }
      ]);
    });
  });

  describe('chooseRecordingSources', () => {
    it('应在标准 PulseAudio 环境中选择麦克风和 monitor', () => {
      const sources = [
        { id: '0', name: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor', driver: 'module-alsa-card.c' },
        { id: '1', name: 'alsa_input.pci-0000_00_1f.3.analog-stereo', driver: 'module-alsa-card.c' }
      ];

      expect(chooseRecordingSources(sources)).toEqual({
        microphone: 'alsa_input.pci-0000_00_1f.3.analog-stereo',
        monitor: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor'
      });
    });

    it('应在 ARM 回声消除场景下回退到虚拟输入源和 monitor', () => {
      const sources = [
        { id: '0', name: 'alsa_output.platform-PHYT0006_00.stereo-fallback.monitor', driver: 'module-alsa-card.c' },
        { id: '1', name: 'noiseReduceSource', driver: 'module-echo-cancel.c' }
      ];

      expect(chooseRecordingSources(sources)).toEqual({
        microphone: 'noiseReduceSource',
        monitor: 'alsa_output.platform-PHYT0006_00.stereo-fallback.monitor'
      });
    });

    it('当没有 monitor 时应允许仅录制输入源', () => {
      const sources = [
        { id: '1', name: 'noiseReduceSource', driver: 'module-echo-cancel.c' }
      ];

      expect(chooseRecordingSources(sources)).toEqual({
        microphone: 'noiseReduceSource',
        monitor: null
      });
    });
  });

  describe('getAlsaSourceLoadCandidates', () => {
    it('应优先尝试 ARM 常见 ALSA 设备编号', () => {
      expect(getAlsaSourceLoadCandidates()).toEqual([
        'hw:0,0',
        'hw:1,0',
        'hw:0',
        'hw:1',
        'default'
      ]);
    });
  });
});
