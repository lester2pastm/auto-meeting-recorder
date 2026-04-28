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
    requestAnimationFrame: jest.fn(() => 1),
    cancelAnimationFrame: jest.fn(),
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
  stopAllStreams
};`);

  script.runInContext(context);

  return module.exports;
}

describe('Recorder cleanup regressions', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<div id="audioBars"></div><div id="recordingTime"></div>';
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
      createAnalyser: jest.fn(() => ({
        fftSize: 0,
        smoothingTimeConstant: 0,
        frequencyBinCount: 32,
        getByteTimeDomainData: jest.fn()
      })),
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

    const recorder = loadRecorderModule({
      initWaveform: jest.fn().mockResolvedValue(undefined)
    });

    await recorder.startStandardRecording();
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
      createAnalyser: jest.fn(() => ({
        fftSize: 0,
        smoothingTimeConstant: 0,
        frequencyBinCount: 32,
        getByteTimeDomainData: jest.fn()
      })),
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

    const recorder = loadRecorderModule({
      initWaveform: jest.fn().mockResolvedValue(undefined)
    });

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
      createAnalyser: jest.fn(() => ({
        fftSize: 0,
        smoothingTimeConstant: 0,
        frequencyBinCount: 32,
        getByteTimeDomainData: jest.fn()
      })),
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
      startRecoveryTracking: jest.fn().mockResolvedValue(null),
      initWaveform: jest.fn().mockResolvedValue(undefined)
    });

    await expect(recorder.startRecording()).rejects.toThrow('恢复录音初始化失败');
  });
});
