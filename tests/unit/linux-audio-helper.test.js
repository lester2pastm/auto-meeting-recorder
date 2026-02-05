const { detectAudioSystem, checkLinuxDependencies, resetDependencyCheck } = require('../../electron/linux-audio-helper');

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

    it('当音频系统不可用时应返回 unknown', async () => {
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

    it('当音频系统不可用应返回安装命令', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockStore.get.mockReturnValue(false);
      mockExec.mockRejectedValue(new Error('command not found'));

      const result = await checkLinuxDependencies(mockStore);

      expect(result.hasDependencies).toBe(false);
      expect(result.packageManager).toBeDefined();
      expect(result.installCommand).toBeDefined();

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
});
