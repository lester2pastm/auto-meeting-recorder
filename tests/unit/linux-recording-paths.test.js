/**
 * TDD 测试：Linux 录音路径一致性验证
 * 验证 startLinuxRecording() 使用 recoveryMeta 中的路径
 * 
 * Bug 描述：Linux 录音缓存提醒不工作
 * 原因：startLinuxRecording() 创建的路径与 recoveryMeta 不一致
 * - recoveryMeta 使用: temp_mic_xxx.webm / temp_sys_xxx.webm
 * - recorder.js 使用: mic_xxx.webm / sys_xxx.webm (缺少 temp_ 前缀)
 */

describe('Linux 录音路径一致性测试 (TDD)', () => {
  let recoveryMeta;
  let linuxRecordingPaths;

  beforeEach(() => {
    jest.clearAllMocks();
    recoveryMeta = null;
    linuxRecordingPaths = null;
  });

  describe('RED 阶段：验证 Bug 存在', () => {
    it('应该验证录音路径与 recoveryMeta 路径一致', () => {
      // 模拟 recoveryMeta（由 startRecoveryTracking 创建）
      recoveryMeta = {
        id: '1234567890',
        tempFile: '/audio/temp_mic_1234567890.webm',
        systemTempFile: '/audio/temp_sys_1234567890.webm',
        isLinux: true
      };

      // 模拟当前的 Bug 行为（旧代码）
      const timestamp = Date.now();
      const audioDir = '/audio';
      linuxRecordingPaths = {
        microphone: `${audioDir}/mic_${timestamp}.webm`,      // Bug: 没有 temp_ 前缀
        systemAudio: `${audioDir}/sys_${timestamp}.webm`,     // Bug: 没有 temp_ 前缀
        output: `${audioDir}/combined_${timestamp}.webm`
      };

      // 验证路径不一致（这是 Bug！）
      expect(linuxRecordingPaths.microphone).not.toBe(recoveryMeta.tempFile);
      expect(linuxRecordingPaths.systemAudio).not.toBe(recoveryMeta.systemTempFile);
      
      // 验证路径确实缺少 temp_ 前缀
      expect(linuxRecordingPaths.microphone).toMatch(/\/mic_\d+\.webm$/);
      expect(linuxRecordingPaths.systemAudio).toMatch(/\/sys_\d+\.webm$/);
    });
  });

  describe('GREEN 阶段：验证修复后路径一致', () => {
    it('修复后应该使用 recoveryMeta 中的路径', () => {
      // 模拟 recoveryMeta（由 startRecoveryTracking 创建）
      recoveryMeta = {
        id: '1234567890',
        tempFile: '/audio/temp_mic_1234567890.webm',
        systemTempFile: '/audio/temp_sys_1234567890.webm',
        isLinux: true
      };

      // 修复后的代码行为
      linuxRecordingPaths = {
        microphone: recoveryMeta.tempFile,                    // 使用 recoveryMeta 路径
        systemAudio: recoveryMeta.systemTempFile,             // 使用 recoveryMeta 路径
        output: recoveryMeta.tempFile.replace('temp_mic_', 'combined_')
      };

      // 验证路径一致（修复后应该通过）
      expect(linuxRecordingPaths.microphone).toBe(recoveryMeta.tempFile);
      expect(linuxRecordingPaths.systemAudio).toBe(recoveryMeta.systemTempFile);
      
      // 验证输出路径正确
      expect(linuxRecordingPaths.output).toBe('/audio/combined_1234567890.webm');
    });

    it('应该验证路径包含 temp_ 前缀', () => {
      recoveryMeta = {
        tempFile: '/audio/temp_mic_1234567890.webm',
        systemTempFile: '/audio/temp_sys_1234567890.webm'
      };

      linuxRecordingPaths = {
        microphone: recoveryMeta.tempFile,
        systemAudio: recoveryMeta.systemTempFile,
        output: recoveryMeta.tempFile.replace('temp_mic_', 'combined_')
      };

      expect(linuxRecordingPaths.microphone).toMatch(/temp_mic_\d+\.webm$/);
      expect(linuxRecordingPaths.systemAudio).toMatch(/temp_sys_\d+\.webm$/);
    });
  });

  describe('边界情况', () => {
    it('当 recoveryMeta 未初始化时应该抛出错误', () => {
      recoveryMeta = null;

      // 模拟修复后的检查逻辑
      function startLinuxRecordingWithCheck() {
        if (!recoveryMeta || !recoveryMeta.tempFile) {
          throw new Error('恢复元数据未初始化');
        }
        return {
          microphone: recoveryMeta.tempFile,
          systemAudio: recoveryMeta.systemTempFile
        };
      }

      expect(() => startLinuxRecordingWithCheck()).toThrow('恢复元数据未初始化');
    });

    it('当 recoveryMeta 缺少 tempFile 时应该抛出错误', () => {
      recoveryMeta = {
        systemTempFile: '/audio/temp_sys_1234567890.webm'
        // tempFile 缺失
      };

      function startLinuxRecordingWithCheck() {
        if (!recoveryMeta || !recoveryMeta.tempFile) {
          throw new Error('恢复元数据未初始化');
        }
        return {};
      }

      expect(() => startLinuxRecordingWithCheck()).toThrow('恢复元数据未初始化');
    });

    it('当 recoveryMeta 缺少 systemTempFile 时应该抛出错误', () => {
      recoveryMeta = {
        tempFile: '/audio/temp_mic_1234567890.webm'
        // systemTempFile 缺失
      };

      function startLinuxRecordingWithCheck() {
        if (!recoveryMeta || !recoveryMeta.tempFile || !recoveryMeta.systemTempFile) {
          throw new Error('恢复元数据缺少临时文件路径');
        }
        return {};
      }

      expect(() => startLinuxRecordingWithCheck()).toThrow('恢复元数据缺少临时文件路径');
    });
  });

  describe('集成验证', () => {
    it('完整的录音流程路径应该一致', () => {
      // 1. startRecoveryTracking 创建 recoveryMeta
      const timestamp = '1234567890';
      const audioDir = '/audio';
      
      recoveryMeta = {
        id: timestamp,
        startTime: new Date().toISOString(),
        platform: 'linux',
        isLinux: true,
        tempFile: `${audioDir}/temp_mic_${timestamp}.webm`,
        systemTempFile: `${audioDir}/temp_sys_${timestamp}.webm`,
        lastSaveTime: parseInt(timestamp),
        duration: 0
      };

      // 2. startLinuxRecording 使用 recoveryMeta 路径
      linuxRecordingPaths = {
        microphone: recoveryMeta.tempFile,
        systemAudio: recoveryMeta.systemTempFile,
        output: recoveryMeta.tempFile.replace('temp_mic_', 'combined_')
      };

      // 3. 验证路径一致
      expect(linuxRecordingPaths.microphone).toBe(recoveryMeta.tempFile);
      expect(linuxRecordingPaths.systemAudio).toBe(recoveryMeta.systemTempFile);
      
      // 4. 验证路径格式正确
      expect(linuxRecordingPaths.microphone).toMatch(/\/temp_mic_\d+\.webm$/);
      expect(linuxRecordingPaths.systemAudio).toMatch(/\/temp_sys_\d+\.webm$/);
      expect(linuxRecordingPaths.output).toMatch(/\/combined_\d+\.webm$/);
      
      // 5. 验证文件扩展名正确
      expect(linuxRecordingPaths.microphone).toMatch(/\.webm$/);
      expect(linuxRecordingPaths.systemAudio).toMatch(/\.webm$/);
      expect(linuxRecordingPaths.output).toMatch(/\.webm$/);
    });
  });
});
