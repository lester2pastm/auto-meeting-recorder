const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadRecorderModule(overrides = {}) {
  const recorderPath = path.resolve(__dirname, '../../src/js/recorder.js');
  const recorderSource = fs.readFileSync(recorderPath, 'utf8');
  const module = { exports: {} };

  const context = vm.createContext({
    module,
    exports: module.exports,
    require,
    console,
    document,
    window,
    navigator,
    Blob,
    Uint8Array,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    MediaStream: class MediaStream {
      constructor(tracks = []) {
        this._tracks = tracks;
      }

      getTracks() {
        return this._tracks;
      }

      getAudioTracks() {
        return this._tracks.filter((track) => track.kind === 'audio');
      }

      getVideoTracks() {
        return this._tracks.filter((track) => track.kind === 'video');
      }
    },
    MediaRecorder: class FakeMediaRecorder {
      constructor() {
        this.ondataavailable = null;
        this.onstop = null;
        this.onerror = null;
      }

      start() {}
      stop() {}
      pause() {}
      resume() {}
    },
    updateRecordingTime: jest.fn(),
    appendAudioChunk: jest.fn(),
    getRecoveryMeta: jest.fn(() => null),
    clearRecoveryData: jest.fn(),
    saveTempRecording: jest.fn(),
    stopTempSaveTimer: jest.fn(),
    ...overrides
  });

  const script = new vm.Script(`${recorderSource}
module.exports = {
  startRecording,
  startStandardRecording,
  stopRecording,
  getRecordingState,
  stopAllStreams
};`);

  script.runInContext(context);

  return module.exports;
}

describe('Recorder cleanup regressions', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<div id="recordingTime"></div>';
  });

  test('Linux FFmpeg records without a second capture for the waveform and exposes no pause', async () => {
    const tempFile = '/tmp/recording.webm';
    navigator.mediaDevices = { getUserMedia: jest.fn() };
    window.electronAPI = {
      getPlatform: jest.fn().mockResolvedValue({ success: true, platform: 'linux', isLinux: true }),
      checkFFmpeg: jest.fn().mockResolvedValue({ success: true, available: true }),
      startFFmpegSystemAudio: jest.fn().mockResolvedValue({ success: true }),
      stopFFmpegRecording: jest.fn().mockResolvedValue({ success: true }),
      readAudioFile: jest.fn().mockResolvedValue({ success: true, data: new Uint8Array([1, 2, 3]) })
    };
    const recorder = loadRecorderModule({
      recoveryMeta: { tempFile },
      startRecoveryTracking: jest.fn().mockResolvedValue({ tempFile })
    });

    await recorder.startRecording(true);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(window.electronAPI.startFFmpegSystemAudio).toHaveBeenCalledWith(tempFile, null, null, true);
    expect(recorder.getRecordingState()).toMatchObject({ isRecording: true, canPause: false });
    expect((await recorder.stopRecording()).size).toBe(3);
  });

  test('startStandardRecording should keep system audio stream reachable for stopAllStreams cleanup', async () => {
    const micTrack = { kind: 'audio', stop: jest.fn() };
    const sysAudioTrack = { kind: 'audio', stop: jest.fn() };
    const sysVideoTrack = { kind: 'video', stop: jest.fn() };

    const microphoneStream = {
      getTracks: () => [micTrack]
    };
    const desktopStream = {
      getAudioTracks: () => [sysAudioTrack],
      getVideoTracks: () => [sysVideoTrack],
      getTracks: () => [sysAudioTrack, sysVideoTrack]
    };
    const mixedStream = { id: 'mixed-stream' };

    const audioContextInstance = {
      state: 'running',
      createMediaStreamSource: jest.fn(() => ({ connect: jest.fn() })),
      createGain: jest.fn(() => ({ connect: jest.fn() })),
      createMediaStreamDestination: jest.fn(() => ({ stream: mixedStream })),
      close: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined)
    };

    window.electronAPI = {
      getDesktopCapturerSources: jest.fn().mockResolvedValue({
        success: true,
        sources: [{ id: 'screen:1', name: 'Entire screen' }]
      })
    };

    navigator.mediaDevices = {
      getUserMedia: jest.fn()
        .mockResolvedValueOnce(microphoneStream)
        .mockResolvedValueOnce(desktopStream)
    };

    window.AudioContext = jest.fn(() => audioContextInstance);
    window.webkitAudioContext = window.AudioContext;

    const recorder = loadRecorderModule();

    await recorder.startStandardRecording();
    expect(recorder.getRecordingState().canPause).toBe(true);
    recorder.stopAllStreams();

    expect(micTrack.stop).toHaveBeenCalled();
    expect(sysAudioTrack.stop).toHaveBeenCalled();
    expect(sysVideoTrack.stop).toHaveBeenCalled();
  });

  test('startStandardRecording should fail fast when desktop capture does not provide a system audio track', async () => {
    const micTrack = { kind: 'audio', stop: jest.fn() };
    const sysVideoTrack = { kind: 'video', stop: jest.fn() };

    const microphoneStream = {
      getTracks: () => [micTrack]
    };
    const desktopStream = {
      getAudioTracks: () => [],
      getVideoTracks: () => [sysVideoTrack],
      getTracks: () => [sysVideoTrack]
    };

    const audioContextInstance = {
      state: 'running',
      createMediaStreamSource: jest.fn(() => ({ connect: jest.fn() })),
      createGain: jest.fn(() => ({ connect: jest.fn() })),
      createMediaStreamDestination: jest.fn(() => ({ stream: { id: 'mixed-stream' } })),
      close: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined)
    };

    window.electronAPI = {
      getDesktopCapturerSources: jest.fn().mockResolvedValue({
        success: true,
        sources: [{ id: 'screen:1', name: 'Entire screen' }]
      })
    };

    navigator.mediaDevices = {
      getUserMedia: jest.fn()
        .mockResolvedValueOnce(microphoneStream)
        .mockResolvedValueOnce(desktopStream)
    };

    window.AudioContext = jest.fn(() => audioContextInstance);
    window.webkitAudioContext = window.AudioContext;

    const recorder = loadRecorderModule();

    await expect(recorder.startStandardRecording()).rejects.toThrow('系统音频轨道');
    expect(micTrack.stop).toHaveBeenCalled();
    expect(sysVideoTrack.stop).toHaveBeenCalled();
  });

  test('startRecording should fail fast when recovery tracking cannot initialize', async () => {
    const micTrack = { kind: 'audio', stop: jest.fn() };
    const sysAudioTrack = { kind: 'audio', stop: jest.fn() };
    const sysVideoTrack = { kind: 'video', stop: jest.fn() };
    const microphoneStream = {
      getTracks: () => [micTrack]
    };
    const desktopStream = {
      getAudioTracks: () => [sysAudioTrack],
      getVideoTracks: () => [sysVideoTrack],
      getTracks: () => [sysAudioTrack, sysVideoTrack]
    };
    const mixedStream = { id: 'mixed-stream' };
    const audioContextInstance = {
      state: 'running',
      createMediaStreamSource: jest.fn(() => ({ connect: jest.fn() })),
      createGain: jest.fn(() => ({ connect: jest.fn() })),
      createMediaStreamDestination: jest.fn(() => ({ stream: mixedStream })),
      close: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined)
    };

    window.electronAPI = {
      getPlatform: jest.fn().mockResolvedValue({
        success: true,
        platform: 'win32',
        isLinux: false
      }),
      getDesktopCapturerSources: jest.fn().mockResolvedValue({
        success: true,
        sources: [{ id: 'screen:1', name: 'Entire screen' }]
      })
    };

    navigator.mediaDevices = {
      getUserMedia: jest.fn()
        .mockResolvedValueOnce(microphoneStream)
        .mockResolvedValueOnce(desktopStream)
    };

    window.AudioContext = jest.fn(() => audioContextInstance);
    window.webkitAudioContext = window.AudioContext;

    const recorder = loadRecorderModule({
      startRecoveryTracking: jest.fn().mockResolvedValue(null)
    });

    await expect(recorder.startRecording()).rejects.toThrow('恢复录音初始化失败');
  });
  test.each([true, false])('waits for the final chunk before reading the recording (write succeeds: %s)', async (writeSucceeds) => {
    const micTrack = { kind: 'audio', stop: jest.fn() };
    const sysAudioTrack = { kind: 'audio', stop: jest.fn() };
    const sysVideoTrack = { kind: 'video', stop: jest.fn() };
    const mixedStream = { id: 'mixed-stream' };
    const recorderInstances = [];
    let releaseWrite;
    let notifyWriteStarted;
    const writeStarted = new Promise(resolve => { notifyWriteStarted = resolve; });
    const finalWrite = new Promise((resolve, reject) => {
      releaseWrite = () => writeSucceeds ? resolve() : reject(new Error('Disk full'));
    });

    const microphoneStream = {
      getTracks: () => [micTrack]
    };
    const desktopStream = {
      getAudioTracks: () => [sysAudioTrack],
      getVideoTracks: () => [sysVideoTrack],
      getTracks: () => [sysAudioTrack, sysVideoTrack]
    };

    const audioContextInstance = {
      state: 'running',
      createMediaStreamSource: jest.fn(() => ({ connect: jest.fn() })),
      createGain: jest.fn(() => ({ connect: jest.fn() })),
      createMediaStreamDestination: jest.fn(() => ({ stream: mixedStream })),
      close: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined)
    };

    class FakeMediaRecorder {
      constructor() {
        this.ondataavailable = null;
        this.onstop = null;
        this.onerror = null;
        recorderInstances.push(this);
      }

      start() {}

      stop() {
        setTimeout(() => {
          this.ondataavailable({
            data: { size: 1, arrayBuffer: async () => Uint8Array.of(4).buffer }
          });
          if (typeof this.onstop === 'function') {
            this.onstop();
          }
        }, 0);
      }

      pause() {}
      resume() {}
    }

    window.electronAPI = {
      getDesktopCapturerSources: jest.fn().mockResolvedValue({
        success: true,
        sources: [{ id: 'screen:1', name: 'Entire screen' }]
      }),
      readAudioFile: jest.fn().mockResolvedValue({
        success: true,
        data: new Uint8Array([1, 2, 3, 4])
      })
    };

    navigator.mediaDevices = {
      getUserMedia: jest.fn()
        .mockResolvedValueOnce(microphoneStream)
        .mockResolvedValueOnce(desktopStream)
    };

    window.AudioContext = jest.fn(() => audioContextInstance);
    window.webkitAudioContext = window.AudioContext;

    const clearRecoveryData = jest.fn();
    const recorder = loadRecorderModule({
      MediaRecorder: FakeMediaRecorder,
      getRecoveryMeta: jest.fn(() => ({ tempFile: '/tmp/recovery.webm' })),
      clearRecoveryData,
      appendAudioChunk: jest.fn(() => {
        notifyWriteStarted();
        return finalWrite;
      })
    });

    await recorder.startStandardRecording();
    const stopPromise = recorder.stopRecording();
    await writeStarted;
    expect(window.electronAPI.readAudioFile).not.toHaveBeenCalled();
    releaseWrite();

    if (writeSucceeds) {
      const audioBlob = await stopPromise;
      expect(audioBlob).toBeInstanceOf(Blob);
      expect(audioBlob.size).toBe(4);
      expect(window.electronAPI.readAudioFile).toHaveBeenCalledWith('/tmp/recovery.webm');
    } else {
      await expect(stopPromise).rejects.toThrow('Disk full');
      expect(window.electronAPI.readAudioFile).not.toHaveBeenCalled();
    }
    expect(clearRecoveryData).not.toHaveBeenCalled();
    expect(recorderInstances).toHaveLength(1);
  });

  test('stopRecording should reject when the standard recorder cannot read the temp file after stop', async () => {
    const micTrack = { kind: 'audio', stop: jest.fn() };
    const sysAudioTrack = { kind: 'audio', stop: jest.fn() };
    const sysVideoTrack = { kind: 'video', stop: jest.fn() };
    const mixedStream = { id: 'mixed-stream' };

    const microphoneStream = {
      getTracks: () => [micTrack]
    };
    const desktopStream = {
      getAudioTracks: () => [sysAudioTrack],
      getVideoTracks: () => [sysVideoTrack],
      getTracks: () => [sysAudioTrack, sysVideoTrack]
    };

    const audioContextInstance = {
      state: 'running',
      createMediaStreamSource: jest.fn(() => ({ connect: jest.fn() })),
      createGain: jest.fn(() => ({ connect: jest.fn() })),
      createMediaStreamDestination: jest.fn(() => ({ stream: mixedStream })),
      close: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined)
    };

    class FakeMediaRecorder {
      constructor() {
        this.ondataavailable = null;
        this.onstop = null;
        this.onerror = null;
      }

      start() {}

      stop() {
        setTimeout(() => {
          if (typeof this.onstop === 'function') {
            this.onstop();
          }
        }, 0);
      }

      pause() {}
      resume() {}
    }

    window.electronAPI = {
      getDesktopCapturerSources: jest.fn().mockResolvedValue({
        success: true,
        sources: [{ id: 'screen:1', name: 'Entire screen' }]
      }),
      readAudioFile: jest.fn().mockResolvedValue({
        success: false,
        error: 'disk unavailable'
      })
    };

    navigator.mediaDevices = {
      getUserMedia: jest.fn()
        .mockResolvedValueOnce(microphoneStream)
        .mockResolvedValueOnce(desktopStream)
    };

    window.AudioContext = jest.fn(() => audioContextInstance);
    window.webkitAudioContext = window.AudioContext;

    const recorder = loadRecorderModule({
      MediaRecorder: FakeMediaRecorder,
      getRecoveryMeta: jest.fn(() => ({ tempFile: '/tmp/recovery.webm' })),
      clearRecoveryData: jest.fn().mockResolvedValue(undefined)
    });

    await recorder.startStandardRecording();

    await expect(recorder.stopRecording()).rejects.toThrow('disk unavailable');
  });
});
