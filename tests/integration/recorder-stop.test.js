/**
 * Recorder 停止录音集成测试
 * 测试 stopRecording 是否正确返回 audioBlob
 * 这些测试验证异步回调的正确处理
 */

const TRANSCRIPT_STATUS = {
  PENDING: 'pending',
  TRANSCRIBING: 'transcribing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

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



  describe('Recording stop flow', () => {
    let mockAudioBlob;
    let savedMeetings = [];
    let processRecordingCalls = [];
    let savedMeetingBeforeProcess = null;
    let lastRecordingDurationValue = '00:00:00';
    let updateMeetingCalls = [];

    beforeEach(() => {
      jest.clearAllMocks();
      savedMeetings = [];
      processRecordingCalls = [];
      updateMeetingCalls = [];
      savedMeetingBeforeProcess = null;
      lastRecordingDurationValue = '00:00:00';
      mockAudioBlob = new Blob(['test audio data'], { type: 'audio/webm' });

      global.saveMeeting = jest.fn(async (meeting) => {
        savedMeetings.push(meeting);
        savedMeetingBeforeProcess = { ...meeting };
        return meeting;
      });

      global.updateMeeting = jest.fn(async (meetingId, updates) => {
        updateMeetingCalls.push({ meetingId, updates });
        const meeting = savedMeetings.find(m => m.id === meetingId);
        if (meeting) {
          Object.assign(meeting, updates);
        }
        return meeting;
      });

      global.getAllMeetings = jest.fn(async () => {
        return [...savedMeetings];
      });

      global.stopRecording = jest.fn(async () => {
        return mockAudioBlob;
      });

      global.updateRecordingButtons = jest.fn();
      global.showToast = jest.fn();
      global.getRecordingDuration = jest.fn(() => '00:05:30');

      global.setLastRecordingDuration = jest.fn((duration) => {
        lastRecordingDurationValue = duration;
      });

      global.getRecordingState = jest.fn(() => 'stopped');

      global.processRecording = jest.fn(async (audioBlob, meetingId) => {
        processRecordingCalls.push({ audioBlob, meetingId });
        // Simulate the actual behavior: call updateMeeting to update the record
        await global.updateMeeting(meetingId, {
          transcript: 'Transcribed text',
          summary: 'Meeting summary',
          transcriptStatus: TRANSCRIPT_STATUS.COMPLETED
        });
      });

      global.currentSettings = {
        sttApiUrl: 'https://test.api.com',
        sttApiKey: 'test-key',
        sttModel: 'test-model'
      };

      global.updateSubtitleContent = jest.fn();
      global.showLoading = jest.fn();
      global.hideLoading = jest.fn();
      global.lastRecordingDuration = lastRecordingDurationValue;
    });

    async function handleStopRecording() {
      try {
        const currentDuration = global.getRecordingDuration();
        global.setLastRecordingDuration(currentDuration);

        const audioBlob = await global.stopRecording();
        global.updateRecordingButtons(global.getRecordingState());

        if (audioBlob) {
          const meetingId = await saveEmptyMeetingRecord(audioBlob);
          global.showToast('录音已停止，正在转写...', 'info');
          await global.processRecording(audioBlob, meetingId);
        }
      } catch (error) {
        console.error('Failed to stop recording:', error);
        global.showToast('停止录音失败', 'error');
      }
    }

    async function saveEmptyMeetingRecord(audioBlob) {
      const meeting = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        duration: lastRecordingDurationValue,
        audioFile: audioBlob,
        transcript: '',
        summary: '',
        transcriptStatus: TRANSCRIPT_STATUS.PENDING
      };

      await global.saveMeeting(meeting);
      return meeting.id;
    }

    it('停止录音后应立即保存pending状态记录', async () => {
      await handleStopRecording();

      expect(savedMeetings.length).toBeGreaterThan(0);
      expect(savedMeetingBeforeProcess).not.toBeNull();
      expect(savedMeetingBeforeProcess.transcriptStatus).toBe(TRANSCRIPT_STATUS.PENDING);
      expect(savedMeetingBeforeProcess.transcript).toBe('');
      expect(savedMeetingBeforeProcess.summary).toBe('');
      expect(savedMeetingBeforeProcess.audioFile).toBeDefined();
      expect(savedMeetingBeforeProcess.duration).toBe('00:05:30');
      expect(savedMeetingBeforeProcess.id).toBeDefined();
      expect(savedMeetingBeforeProcess.date).toBeDefined();
    });

    it('processRecording should be called with audioBlob and meetingId', async () => {
      await handleStopRecording();

      expect(global.processRecording).toHaveBeenCalled();
      expect(processRecordingCalls.length).toBe(1);

      const call = processRecordingCalls[0];
      expect(call.audioBlob).toBe(mockAudioBlob);
      expect(call.meetingId).toBeDefined();

      const latest = savedMeetings[savedMeetings.length - 1];
      expect(call.meetingId).toBe(latest.id);
    });

    it('should show appropriate toast messages', async () => {
      await handleStopRecording();

      expect(global.showToast).toHaveBeenCalledWith(
        expect.stringContaining('停止'),
        'info'
      );
    });

    it('saveEmptyMeetingRecord should create meeting with correct structure', async () => {
      lastRecordingDurationValue = '00:10:45';
      const meetingId = await saveEmptyMeetingRecord(mockAudioBlob);

      expect(meetingId).toBeDefined();
      expect(savedMeetings.length).toBe(1);

      const meeting = savedMeetings[0];
      expect(meeting.id).toBe(meetingId);
      expect(meeting.transcriptStatus).toBe(TRANSCRIPT_STATUS.PENDING);
      expect(meeting.transcript).toBe('');
      expect(meeting.summary).toBe('');
      expect(meeting.audioFile).toBe(mockAudioBlob);
      expect(meeting.duration).toBe('00:10:45');
    });

    it('should update existing meeting record instead of creating duplicate', async () => {
      await handleStopRecording();

      // Verify only ONE meeting record exists (not duplicated)
      expect(savedMeetings.length).toBe(1);

      // Verify updateMeeting was called to update the existing record
      expect(global.updateMeeting).toHaveBeenCalled();
      expect(updateMeetingCalls.length).toBe(1);

      const updateCall = updateMeetingCalls[0];
      expect(updateCall.meetingId).toBe(savedMeetings[0].id);
      expect(updateCall.updates.transcriptStatus).toBe(TRANSCRIPT_STATUS.COMPLETED);
      expect(updateCall.updates.transcript).toBe('Transcribed text');

      // Verify the meeting record now has completed status
      const meeting = savedMeetings[0];
      expect(meeting.transcriptStatus).toBe(TRANSCRIPT_STATUS.COMPLETED);
      expect(meeting.transcript).toBe('Transcribed text');
      expect(meeting.summary).toBe('Meeting summary');
    });

    it('processRecording should call updateMeeting with correct meetingId and set completed status', async () => {
      await handleStopRecording();

      expect(processRecordingCalls.length).toBe(1);
      const processCall = processRecordingCalls[0];
      expect(processCall.meetingId).toBe(savedMeetings[0].id);

      // Verify updateMeeting was called with completed status
      expect(updateMeetingCalls.length).toBe(1);
      expect(updateMeetingCalls[0].updates.transcriptStatus).toBe(TRANSCRIPT_STATUS.COMPLETED);
    });
  });
});
