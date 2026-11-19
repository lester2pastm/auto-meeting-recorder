const { contextBridge, ipcRenderer, clipboard } = require('electron');

// 安全地暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  isDevMode: process.argv.includes('--dev'),
  localAsrSupported: ['linux', 'win32'].includes(process.platform) && ['x64', 'arm64'].includes(process.arch),
  localAsrFileDecoder: process.platform === 'linux',
  startLocalAsr: (sampleRate, live = false) => ipcRenderer.invoke('start-local-asr', { sampleRate, live }),
  writeLocalAsr: (samples, live = false) => ipcRenderer.invoke('write-local-asr', { samples, live }),
  finishLocalAsr: (live = false) => ipcRenderer.invoke('finish-local-asr', live),
  cancelLocalAsr: (live = false) => ipcRenderer.invoke('cancel-local-asr', live),
  transcribeLocalFile: (filePath) => ipcRenderer.invoke('transcribe-local-file', filePath),
  onLocalAsrText: (callback) => {
    ipcRenderer.on('local-asr-text', (event, data) => callback(data));
  },

  // 音频文件操作
  saveAudio: (blob, filename) => ipcRenderer.invoke('save-audio', { blob, filename }),
  getAudio: (filename) => ipcRenderer.invoke('get-audio', filename),
  deleteAudio: (filename) => ipcRenderer.invoke('delete-audio', filename),
  exportAudio: (filename, defaultPath) => ipcRenderer.invoke('export-audio', { filename, defaultPath }),
  getAudioDirectory: () => ipcRenderer.invoke('get-audio-directory'),

  // 配置操作
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  loadConfig: () => ipcRenderer.invoke('load-config'),

  copyText: (text) => {
    clipboard.writeText(text);
    return true;
  },

  // 屏幕分享源获取（用于系统音频录制）
  getDesktopCapturerSources: () => ipcRenderer.invoke('get-desktop-capturer-sources'),
  
  // 平台检测
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // FFmpeg 相关接口（Linux 系统音频录制）
  checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  checkLinuxDependencies: () => ipcRenderer.invoke('check-linux-dependencies'),
  startFFmpegSystemAudio: (outputPath, device, microphoneDevice, localAsr) => ipcRenderer.invoke('start-ffmpeg-system-audio', { outputPath, device, microphoneDevice, localAsr }),
  stopFFmpegRecording: () => ipcRenderer.invoke('stop-ffmpeg-recording'),
  mergeAudioFiles: (microphonePath, systemAudioPath, outputPath) => ipcRenderer.invoke('merge-audio-files', { microphonePath, systemAudioPath, outputPath }),
  getPulseAudioSources: () => ipcRenderer.invoke('get-pulseaudio-sources'),
  getAudioSourceOptions: () => ipcRenderer.invoke('get-audio-source-options'),
  checkPulseAudioInput: () => ipcRenderer.invoke('check-pulseaudio-input'),
  fixPulseAudioInput: (options) => ipcRenderer.invoke('fix-pulseaudio-input', options),
  splitAudioFile: (filePath, options) => ipcRenderer.invoke('split-audio-file', { filePath, options }),
  readAudioFile: (filePath) => ipcRenderer.invoke('read-audio-file', filePath),
  saveAudioToPath: (data, filePath) => ipcRenderer.invoke('save-audio-to-path', { data, filePath }),
  appendAudioToPath: (data, filePath) => ipcRenderer.invoke('append-audio-to-path', { data, filePath }),
  
  // 恢复管理相关接口
  readRecoveryMeta: () => ipcRenderer.invoke('read-recovery-meta'),
  writeRecoveryMeta: (meta) => ipcRenderer.invoke('write-recovery-meta', meta),
  deleteRecoveryMeta: () => ipcRenderer.invoke('delete-recovery-meta'),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),

  // HTTP 请求（通过主进程 Node.js https 模块，解决 fetch 大文件 500 问题）
  httpPost: (options) => ipcRenderer.invoke('http-post', options),

  // App Control
  onCheckRecordingStatus: (callback) => ipcRenderer.on('check-recording-status', callback),
  forceClose: () => ipcRenderer.send('force-close')
});
