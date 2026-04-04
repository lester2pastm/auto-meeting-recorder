describe('API segmentation helpers', () => {
  let api;

  beforeEach(() => {
    jest.resetModules();
    global.window = global.window || {};
    api = require('../../src/js/api');
  });

  test('calculateSegmentCount should consider both size and duration limits', () => {
    expect(typeof api.calculateSegmentCount).toBe('function');
    expect(api.calculateSegmentCount(64.82, 70.58)).toBe(2);
    expect(api.calculateSegmentCount(10, 121)).toBe(3);
  });

  test('splitAudio should decode only once when known duration is provided', async () => {
    const decodeAudioData = jest.fn().mockResolvedValue({
      sampleRate: 16000,
      duration: 12,
      numberOfChannels: 1,
      length: 16000,
      getChannelData: jest.fn(() => new Float32Array(16000))
    });
    const close = jest.fn().mockResolvedValue(undefined);
    const createBuffer = jest.fn((numberOfChannels, length) => ({
      numberOfChannels,
      length,
      sampleRate: 16000,
      getChannelData: jest.fn(() => new Float32Array(length))
    }));
    const createMediaStreamDestination = jest.fn(() => ({ stream: {} }));
    const createBufferSource = jest.fn(() => {
      const sourceNode = {
        connect: jest.fn(),
        onended: null,
        buffer: null
      };
      sourceNode.start = jest.fn(() => {
        setTimeout(() => {
          if (typeof sourceNode.onended === 'function') {
            sourceNode.onended();
          }
        }, 0);
      });
      return sourceNode;
    });

    const audioContextFactory = jest
      .fn()
      .mockImplementationOnce(() => ({
        decodeAudioData,
        close
      }))
      .mockImplementation(() => ({
        createBuffer,
        createMediaStreamDestination,
        createBufferSource,
        close
      }));

    const offlineBufferSource = {
      connect: jest.fn(),
      start: jest.fn(),
      buffer: null
    };
    global.OfflineAudioContext = jest.fn(() => ({
      destination: {},
      createBufferSource: jest.fn(() => offlineBufferSource),
      startRendering: jest.fn().mockResolvedValue({
        numberOfChannels: 1,
        length: 16000,
        sampleRate: 16000
      })
    }));

    global.MediaRecorder = class MockMediaRecorder {
      constructor() {
        this.ondataavailable = null;
        this.onstop = null;
      }

      start() {
        if (this.ondataavailable) {
          this.ondataavailable({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }) });
        }
      }

      stop() {
        if (this.onstop) {
          this.onstop();
        }
      }
    };

    global.window.AudioContext = audioContextFactory;
    global.window.webkitAudioContext = audioContextFactory;
    global.AudioContext = audioContextFactory;

    const audioBlob = new Blob([new Uint8Array(2 * 1024 * 1024)], { type: 'audio/webm' });
    audioBlob.arrayBuffer = async () => new Uint8Array(2 * 1024 * 1024).buffer;
    await api.splitAudio(audioBlob, 1, 12);

    expect(decodeAudioData).toHaveBeenCalledTimes(1);
  });
});
