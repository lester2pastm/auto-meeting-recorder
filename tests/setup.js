// Jest 测试设置文件

// 模拟 window.electronAPI
global.window.electronAPI = {
  saveAudio: jest.fn(),
  getAudio: jest.fn(),
  deleteAudio: jest.fn(),
  listAudioFiles: jest.fn(),
  exportAudio: jest.fn(),
  getAudioDirectory: jest.fn(),
  saveConfig: jest.fn(),
  loadConfig: jest.fn(),
  getDesktopCapturerSources: jest.fn()
};

// 模拟 IndexedDB
const mockIndexedDB = {
  open: jest.fn()
};
global.indexedDB = mockIndexedDB;

// 模拟 localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
global.localStorage = mockLocalStorage;

// 模拟 navigator.mediaDevices
global.navigator.mediaDevices = {
  getUserMedia: jest.fn(),
  getDisplayMedia: jest.fn()
};

// 模拟 AudioContext
global.AudioContext = jest.fn().mockImplementation(() => ({
  createAnalyser: jest.fn().mockReturnValue({
    frequencyBinCount: 128,
    getByteFrequencyData: jest.fn()
  }),
  createMediaStreamSource: jest.fn().mockReturnValue({
    connect: jest.fn()
  }),
  destination: {},
  sampleRate: 44100
}));

global.webkitAudioContext = global.AudioContext;

// 模拟 MediaRecorder
global.MediaRecorder = jest.fn().mockImplementation(() => ({
  start: jest.fn(),
  stop: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  ondataavailable: null,
  onstop: null,
  onpause: null,
  onresume: null,
  state: 'inactive'
}));

// 模拟 fetch
global.fetch = jest.fn();

// 清理函数
beforeEach(() => {
  jest.clearAllMocks();
});
