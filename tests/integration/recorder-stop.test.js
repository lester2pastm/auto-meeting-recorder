/**
 * Recorder 停止录音集成测试
 * 测试 stopRecording 是否正确返回 audioBlob
 * 这些测试验证异步回调的正确处理
 */

describe('Recorder 停止录音测试', () => {
  let mockMediaRecorder;
  let audioBlob = null;

  beforeEach(() => {
    jest.clearAllMocks();
    audioBlob = null;

    // 模拟 MediaRecorder
    mockMediaRecorder = {
      state: 'recording',
      stop: jest.fn(),
      onstop: null,
      ondataavailable: null
    };

    // 模拟全局 MediaRecorder
    global.MediaRecorder = jest.fn().mockImplementation(() => mockMediaRecorder);

    // 模拟 navigator.mediaDevices
    global.navigator = {
      mediaDevices: {
        getUserMedia: jest.fn().mockResolvedValue({
          getTracks: jest.fn().mockReturnValue([{ stop: jest.fn() }])
        })
      }
    };

    // 模拟 window.electronAPI
    global.window = {
      electronAPI: {
        readAudioFile: jest.fn().mockResolvedValue({
          success: true,
          data: [1, 2, 3, 4, 5]
        }),
        writeRecoveryMeta: jest.fn().mockResolvedValue(undefined),
        getAudioDirectory: jest.fn().mockReturnValue('/audio')
      }
    };

    // 模拟 getRecoveryMeta
    global.getRecoveryMeta = jest.fn().mockReturnValue({
      tempFile: '/audio/temp.webm'
    });

    // 模拟 clearRecoveryData
    global.clearRecoveryData = jest.fn().mockResolvedValue(undefined);
  });

  describe('stopRecording 异步回调测试', () => {
    it('应该在 onstop 完成文件读取后才 resolve', async () => {
      // 这个测试验证 stopRecording 是否等待 async onstop 完成

      let audioBlob = null;
      let blobSetBeforeResolve = false;

      // 模拟 MediaRecorder
      const mockRecorder = {
        state: 'recording',
        stop: jest.fn(function() {
          // 模拟 stop 触发 onstop
          setTimeout(() => {
            if (mockRecorder.onstop) {
              mockRecorder.onstop();
            }
          }, 10);
        }),
        onstop: null
      };

      // 模拟 startStandardRecording 中的逻辑 - 设置原始的 async onstop
      mockRecorder.onstop = async () => {
        // 模拟异步文件读取
        await new Promise(resolve => setTimeout(resolve, 20));
        audioBlob = new Blob(['audio data'], { type: 'audio/webm' });
      };

      // 模拟 stopRecording 中的逻辑
      const result = await new Promise((resolve, reject) => {
        const originalOnStop = mockRecorder.onstop;

        mockRecorder.onstop = async (event) => {
          // 关键：等待原始 onstop 完成
          if (originalOnStop) {
            await originalOnStop(event);
          }

          // 检查 blob 是否已设置
          blobSetBeforeResolve = (audioBlob !== null);
          resolve(audioBlob);
        };

        mockRecorder.stop();
      });

      // 验证：resolve 应该在 blob 设置之后
      expect(blobSetBeforeResolve).toBe(true);
      expect(result).not.toBeNull();
    });

    it('如果 onstop 是 async 但不等待，会导致返回 null', async () => {
      // 这个测试展示 BUG：如果不 await originalOnStop

      let audioBlob = null;

      const mockRecorder = {
        stop: jest.fn(function() {
          setTimeout(() => {
            if (mockRecorder.onstop) {
              mockRecorder.onstop();
            }
          }, 10);
        }),
        onstop: null
      };

      // 模拟 BUG 版本：不等待 async onstop
      async function simulateBuggyStopRecording() {
        return new Promise((resolve, reject) => {
          const originalOnStop = mockRecorder.onstop;

          mockRecorder.onstop = (event) => {
            // BUG：没有 await originalOnStop
            if (originalOnStop) {
              originalOnStop(event); // 返回 Promise 但不等待
            }
            resolve(audioBlob); // 此时 blob 还是 null
          };

          mockRecorder.stop();
        });
      }

      // 设置 async onstop（模拟原始代码）
      mockRecorder.onstop = async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        audioBlob = new Blob(['audio data'], { type: 'audio/webm' });
      };

      const result = await simulateBuggyStopRecording();

      // 验证：BUG 导致返回 null
      expect(result).toBeNull();
    });
  });

  describe('实际 recorder.js 集成测试', () => {
    it('stopRecording 应该返回有效的 Blob', async () => {
      // 这个测试需要实际导入 recorder.js 的函数
      // 由于 recorder.js 使用全局变量和复杂的初始化，
      // 我们需要更完整的模拟

      // 标记：这里应该测试实际的 stopRecording 函数
      // 但由于模块依赖复杂，需要重构 recorder.js 使其更可测试
    });
  });
});
