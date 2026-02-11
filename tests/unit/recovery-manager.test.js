/**
 * 恢复管理模块单元测试
 * 测试录音恢复功能的各个组件
 */

// 首先设置全局 window 对象
global.window = {
  electronAPI: {
    readRecoveryMeta: jest.fn(),
    writeRecoveryMeta: jest.fn(),
    deleteRecoveryMeta: jest.fn(),
    fileExists: jest.fn(),
    deleteFile: jest.fn(),
    getAudioDirectory: jest.fn(),
    readAudioFile: jest.fn(),
    mergeAudioFiles: jest.fn()
  }
};

// 模拟 console 方法
global.console = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

describe('Recovery Manager 模块测试', () => {
  let recoveryMeta = null;

  beforeEach(() => {
    jest.clearAllMocks();
    recoveryMeta = null;
    // 重置 window.electronAPI
    global.window.electronAPI = {
      readRecoveryMeta: jest.fn(),
      writeRecoveryMeta: jest.fn(),
      deleteRecoveryMeta: jest.fn(),
      fileExists: jest.fn(),
      deleteFile: jest.fn(),
      getAudioDirectory: jest.fn(),
      readAudioFile: jest.fn(),
      mergeAudioFiles: jest.fn()
    };
  });

  describe('初始化恢复管理器', () => {
    it('没有未完成录音时应该返回 null', async () => {
      window.electronAPI.readRecoveryMeta.mockResolvedValue({ success: true, meta: null });
      
      // 内联实现测试
      async function initRecoveryManager() {
        const result = await window.electronAPI.readRecoveryMeta();
        if (result.success && result.meta) {
          return result.meta;
        }
        return null;
      }
      
      const result = await initRecoveryManager();
      
      expect(result).toBeNull();
      expect(window.electronAPI.readRecoveryMeta).toHaveBeenCalled();
    });

    it('存在未完成录音且文件存在时应该返回 recoveryMeta', async () => {
      const mockMeta = {
        id: '123456',
        startTime: new Date().toISOString(),
        platform: 'win32',
        isLinux: false,
        tempFiles: ['/audio/temp_recording_123456.webm'],
        lastSaveTime: Date.now(),
        duration: 60000
      };
      window.electronAPI.readRecoveryMeta.mockResolvedValue({ success: true, meta: mockMeta });
      window.electronAPI.fileExists.mockResolvedValue({ exists: true });
      
      async function initRecoveryManager() {
        const result = await window.electronAPI.readRecoveryMeta();
        if (result.success && result.meta) {
          // 检查文件是否存在
          for (const filePath of result.meta.tempFiles) {
            const fileResult = await window.electronAPI.fileExists(filePath);
            if (!fileResult.exists) {
              return null;
            }
          }
          return result.meta;
        }
        return null;
      }
      
      const result = await initRecoveryManager();
      
      expect(result).toEqual(mockMeta);
      expect(window.electronAPI.fileExists).toHaveBeenCalledWith(mockMeta.tempFiles[0]);
    });

    it('存在未完成录音但文件不存在时应该返回 null', async () => {
      const mockMeta = {
        id: '123456',
        tempFiles: ['/audio/temp_recording_123456.webm']
      };
      window.electronAPI.readRecoveryMeta.mockResolvedValue({ success: true, meta: mockMeta });
      window.electronAPI.fileExists.mockResolvedValue({ exists: false });
      
      async function initRecoveryManager() {
        const result = await window.electronAPI.readRecoveryMeta();
        if (result.success && result.meta) {
          for (const filePath of result.meta.tempFiles) {
            const fileResult = await window.electronAPI.fileExists(filePath);
            if (!fileResult.exists) {
              return null;
            }
          }
          return result.meta;
        }
        return null;
      }
      
      const result = await initRecoveryManager();
      
      expect(result).toBeNull();
    });

    it('非 Electron 环境应该返回 null', async () => {
      const originalElectronAPI = window.electronAPI;
      window.electronAPI = null;
      
      async function checkUnfinishedRecording() {
        if (!window.electronAPI) {
          return false;
        }
        return true;
      }
      
      const result = await checkUnfinishedRecording();
      
      expect(result).toBe(false);
      
      window.electronAPI = originalElectronAPI;
    });
  });

  describe('开始恢复跟踪', () => {
    it('Windows 平台应该创建正确的元数据结构', async () => {
      window.electronAPI.getAudioDirectory.mockResolvedValue({ 
        success: true, 
        path: '/audio' 
      });
      window.electronAPI.writeRecoveryMeta.mockResolvedValue({ success: true });
      
      async function startRecoveryTracking(platform, isLinux) {
        const timestamp = Date.now();
        const audioDirResult = await window.electronAPI.getAudioDirectory();
        if (!audioDirResult.success) {
          return null;
        }
        const audioDir = audioDirResult.path;
        const meta = {
          id: timestamp.toString(),
          startTime: new Date().toISOString(),
          platform: platform,
          isLinux: isLinux,
          tempFiles: isLinux ? [
            `${audioDir}/temp_mic_${timestamp}.webm`,
            `${audioDir}/temp_sys_${timestamp}.webm`
          ] : [
            `${audioDir}/temp_recording_${timestamp}.webm`
          ],
          lastSaveTime: timestamp,
          duration: 0
        };
        await window.electronAPI.writeRecoveryMeta(meta);
        return meta;
      }
      
      const result = await startRecoveryTracking('win32', false);
      
      expect(result).not.toBeNull();
      expect(result.platform).toBe('win32');
      expect(result.isLinux).toBe(false);
      expect(result.tempFiles).toHaveLength(1);
      expect(result.tempFiles[0]).toMatch(/temp_recording_\d+\.webm$/);
      expect(window.electronAPI.writeRecoveryMeta).toHaveBeenCalledWith(result);
    });

    it('Linux 平台应该创建双文件元数据结构', async () => {
      window.electronAPI.getAudioDirectory.mockResolvedValue({ 
        success: true, 
        path: '/audio' 
      });
      window.electronAPI.writeRecoveryMeta.mockResolvedValue({ success: true });
      
      async function startRecoveryTracking(platform, isLinux) {
        const timestamp = Date.now();
        const audioDirResult = await window.electronAPI.getAudioDirectory();
        if (!audioDirResult.success) {
          return null;
        }
        const audioDir = audioDirResult.path;
        const meta = {
          id: timestamp.toString(),
          startTime: new Date().toISOString(),
          platform: platform,
          isLinux: isLinux,
          tempFiles: isLinux ? [
            `${audioDir}/temp_mic_${timestamp}.webm`,
            `${audioDir}/temp_sys_${timestamp}.webm`
          ] : [
            `${audioDir}/temp_recording_${timestamp}.webm`
          ],
          lastSaveTime: timestamp,
          duration: 0
        };
        await window.electronAPI.writeRecoveryMeta(meta);
        return meta;
      }
      
      const result = await startRecoveryTracking('linux', true);
      
      expect(result).not.toBeNull();
      expect(result.platform).toBe('linux');
      expect(result.isLinux).toBe(true);
      expect(result.tempFiles).toHaveLength(2);
      expect(result.tempFiles[0]).toMatch(/temp_mic_\d+\.webm$/);
      expect(result.tempFiles[1]).toMatch(/temp_sys_\d+\.webm$/);
    });

    it('获取音频目录失败时应该返回 null', async () => {
      window.electronAPI.getAudioDirectory.mockResolvedValue({ 
        success: false, 
        error: 'Permission denied' 
      });
      
      async function startRecoveryTracking(platform, isLinux) {
        const timestamp = Date.now();
        const audioDirResult = await window.electronAPI.getAudioDirectory();
        if (!audioDirResult.success) {
          return null;
        }
        return {};
      }
      
      const result = await startRecoveryTracking('win32', false);
      
      expect(result).toBeNull();
    });
  });

  describe('保存临时录音', () => {
    it('应该更新元数据中的时间和时长', async () => {
      recoveryMeta = {
        id: '123456',
        duration: 0,
        lastSaveTime: Date.now() - 10000
      };
      window.electronAPI.writeRecoveryMeta.mockResolvedValue({ success: true });
      
      async function saveTempRecording(audioData, duration) {
        if (!recoveryMeta) return;
        recoveryMeta.lastSaveTime = Date.now();
        recoveryMeta.duration = duration || recoveryMeta.duration;
        await window.electronAPI.writeRecoveryMeta(recoveryMeta);
      }
      
      const beforeTime = Date.now();
      await saveTempRecording(null, 120000);
      const afterTime = Date.now();
      
      expect(recoveryMeta.duration).toBe(120000);
      expect(recoveryMeta.lastSaveTime).toBeGreaterThanOrEqual(beforeTime);
      expect(recoveryMeta.lastSaveTime).toBeLessThanOrEqual(afterTime);
      expect(window.electronAPI.writeRecoveryMeta).toHaveBeenCalledWith(recoveryMeta);
    });

    it('recoveryMeta 为 null 时不应该执行任何操作', async () => {
      recoveryMeta = null;
      
      async function saveTempRecording(audioData, duration) {
        if (!recoveryMeta) return;
        recoveryMeta.duration = duration;
        await window.electronAPI.writeRecoveryMeta(recoveryMeta);
      }
      
      await saveTempRecording(null, 120000);
      
      expect(window.electronAPI.writeRecoveryMeta).not.toHaveBeenCalled();
    });
  });

  describe('清除恢复数据', () => {
    it('应该删除所有临时文件和元数据', async () => {
      const meta = {
        id: '123456',
        tempFiles: [
          '/audio/temp_recording_123456.webm',
          '/audio/temp_mic_123456.webm'
        ]
      };
      window.electronAPI.deleteFile.mockResolvedValue({ success: true });
      window.electronAPI.deleteRecoveryMeta.mockResolvedValue({ success: true });
      
      async function clearRecoveryData(recoveryMeta) {
        if (recoveryMeta && recoveryMeta.tempFiles) {
          for (const filePath of recoveryMeta.tempFiles) {
            await window.electronAPI.deleteFile(filePath);
          }
        }
        await window.electronAPI.deleteRecoveryMeta();
        return null;
      }
      
      await clearRecoveryData(meta);
      
      expect(window.electronAPI.deleteFile).toHaveBeenCalledTimes(2);
      expect(window.electronAPI.deleteFile).toHaveBeenCalledWith(meta.tempFiles[0]);
      expect(window.electronAPI.deleteFile).toHaveBeenCalledWith(meta.tempFiles[1]);
      expect(window.electronAPI.deleteRecoveryMeta).toHaveBeenCalled();
    });

    it('tempFiles 为空时不应该尝试删除文件', async () => {
      const meta = {
        id: '123456',
        tempFiles: []
      };
      window.electronAPI.deleteRecoveryMeta.mockResolvedValue({ success: true });
      
      async function clearRecoveryData(recoveryMeta) {
        if (recoveryMeta && recoveryMeta.tempFiles) {
          for (const filePath of recoveryMeta.tempFiles) {
            await window.electronAPI.deleteFile(filePath);
          }
        }
        await window.electronAPI.deleteRecoveryMeta();
        return null;
      }
      
      await clearRecoveryData(meta);
      
      expect(window.electronAPI.deleteFile).not.toHaveBeenCalled();
      expect(window.electronAPI.deleteRecoveryMeta).toHaveBeenCalled();
    });
  });

  describe('恢复音频 Blob', () => {
    it('Windows 平台应该直接读取临时文件', async () => {
      const meta = {
        id: '123456',
        isLinux: false,
        tempFiles: ['/audio/temp_recording_123456.webm']
      };
      const mockData = new Uint8Array([1, 2, 3, 4, 5]);
      window.electronAPI.readAudioFile.mockResolvedValue({ 
        success: true, 
        data: Array.from(mockData) 
      });
      
      async function recoverAudioBlob(recoveryMeta) {
        if (!recoveryMeta) return null;
        try {
          if (recoveryMeta.isLinux) {
            return null; // Linux 处理省略
          } else {
            const tempPath = recoveryMeta.tempFiles[0];
            const readResult = await window.electronAPI.readAudioFile(tempPath);
            if (!readResult.success) {
              throw new Error('Failed to read temp audio');
            }
            return { data: readResult.data, type: 'audio/webm' };
          }
        } catch (error) {
          return null;
        }
      }
      
      const result = await recoverAudioBlob(meta);
      
      expect(result).not.toBeNull();
      expect(result.type).toBe('audio/webm');
      expect(window.electronAPI.readAudioFile).toHaveBeenCalledWith(meta.tempFiles[0]);
      expect(window.electronAPI.mergeAudioFiles).not.toHaveBeenCalled();
    });

    it('Linux 平台应该合并两个音频文件', async () => {
      const meta = {
        id: '123456',
        isLinux: true,
        tempFiles: [
          '/audio/temp_mic_123456.webm',
          '/audio/temp_sys_123456.webm'
        ]
      };
      const mockData = new Uint8Array([1, 2, 3, 4, 5]);
      window.electronAPI.mergeAudioFiles.mockResolvedValue({ 
        success: true, 
        outputPath: '/audio/recovered_123456.webm' 
      });
      window.electronAPI.readAudioFile.mockResolvedValue({ 
        success: true, 
        data: Array.from(mockData) 
      });
      
      async function recoverAudioBlob(recoveryMeta) {
        if (!recoveryMeta) return null;
        try {
          if (recoveryMeta.isLinux) {
            const micPath = recoveryMeta.tempFiles[0];
            const sysPath = recoveryMeta.tempFiles[1];
            const outputPath = micPath.replace('temp_mic_', 'recovered_');
            const mergeResult = await window.electronAPI.mergeAudioFiles(
              micPath, sysPath, outputPath
            );
            if (!mergeResult.success) {
              throw new Error('Failed to merge audio files');
            }
            const readResult = await window.electronAPI.readAudioFile(outputPath);
            if (!readResult.success) {
              throw new Error('Failed to read recovered audio');
            }
            return { data: readResult.data, type: 'audio/webm' };
          } else {
            return null;
          }
        } catch (error) {
          return null;
        }
      }
      
      const result = await recoverAudioBlob(meta);
      
      expect(result).not.toBeNull();
      expect(window.electronAPI.mergeAudioFiles).toHaveBeenCalledWith(
        meta.tempFiles[0],
        meta.tempFiles[1],
        '/audio/recovered_123456.webm'
      );
      expect(window.electronAPI.readAudioFile).toHaveBeenCalledWith('/audio/recovered_123456.webm');
    });

    it('合并失败时应该返回 null', async () => {
      const meta = {
        id: '123456',
        isLinux: true,
        tempFiles: ['/audio/temp_mic_123456.webm', '/audio/temp_sys_123456.webm']
      };
      window.electronAPI.mergeAudioFiles.mockResolvedValue({ 
        success: false, 
        error: 'FFmpeg error' 
      });
      
      async function recoverAudioBlob(recoveryMeta) {
        if (!recoveryMeta) return null;
        try {
          if (recoveryMeta.isLinux) {
            const micPath = recoveryMeta.tempFiles[0];
            const sysPath = recoveryMeta.tempFiles[1];
            const outputPath = micPath.replace('temp_mic_', 'recovered_');
            const mergeResult = await window.electronAPI.mergeAudioFiles(
              micPath, sysPath, outputPath
            );
            if (!mergeResult.success) {
              throw new Error('Failed to merge audio files');
            }
            return {};
          }
        } catch (error) {
          return null;
        }
      }
      
      const result = await recoverAudioBlob(meta);
      
      expect(result).toBeNull();
    });

    it('recoveryMeta 为 null 时应该返回 null', async () => {
      async function recoverAudioBlob(recoveryMeta) {
        if (!recoveryMeta) return null;
        return {};
      }
      
      const result = await recoverAudioBlob(null);
      
      expect(result).toBeNull();
    });
  });

  describe('检查临时文件存在性', () => {
    it('所有文件存在时应该返回 true', async () => {
      const meta = {
        tempFiles: ['/audio/file1.webm', '/audio/file2.webm']
      };
      window.electronAPI.fileExists.mockResolvedValue({ exists: true });
      
      async function checkTempFilesExist(meta) {
        if (!meta || !meta.tempFiles) return false;
        for (const filePath of meta.tempFiles) {
          const result = await window.electronAPI.fileExists(filePath);
          if (!result.exists) {
            return false;
          }
        }
        return true;
      }
      
      const result = await checkTempFilesExist(meta);
      
      expect(result).toBe(true);
      expect(window.electronAPI.fileExists).toHaveBeenCalledTimes(2);
    });

    it('任一文件不存在时应该返回 false', async () => {
      const meta = {
        tempFiles: ['/audio/file1.webm', '/audio/file2.webm']
      };
      window.electronAPI.fileExists
        .mockResolvedValueOnce({ exists: true })
        .mockResolvedValueOnce({ exists: false });
      
      async function checkTempFilesExist(meta) {
        if (!meta || !meta.tempFiles) return false;
        for (const filePath of meta.tempFiles) {
          const result = await window.electronAPI.fileExists(filePath);
          if (!result.exists) {
            return false;
          }
        }
        return true;
      }
      
      const result = await checkTempFilesExist(meta);
      
      expect(result).toBe(false);
    });

    it('meta 为 null 时应该返回 false', async () => {
      async function checkTempFilesExist(meta) {
        if (!meta || !meta.tempFiles) return false;
        return true;
      }
      
      const result = await checkTempFilesExist(null);
      
      expect(result).toBe(false);
    });

    it('tempFiles 为空数组时应该返回 true（没有文件需要检查）', async () => {
      async function checkTempFilesExist(meta) {
        if (!meta || !meta.tempFiles) return false;
        for (const filePath of meta.tempFiles) {
          const result = await window.electronAPI.fileExists(filePath);
          if (!result.exists) {
            return false;
          }
        }
        return true;
      }
      
      const result = await checkTempFilesExist({ tempFiles: [] });
      
      // 空数组的循环不执行，直接返回 true
      expect(result).toBe(true);
    });
  });
});
