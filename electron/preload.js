const { contextBridge, ipcRenderer } = require('electron');

// 安全地暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 音频文件操作
  saveAudio: (blob, filename) => ipcRenderer.invoke('save-audio', { blob, filename }),
  getAudio: (filename) => ipcRenderer.invoke('get-audio', filename),
  deleteAudio: (filename) => ipcRenderer.invoke('delete-audio', filename),
  listAudioFiles: () => ipcRenderer.invoke('list-audio-files'),
  exportAudio: (filename, defaultPath) => ipcRenderer.invoke('export-audio', { filename, defaultPath }),
  getAudioDirectory: () => ipcRenderer.invoke('get-audio-directory'),

  // 配置操作
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  loadConfig: () => ipcRenderer.invoke('load-config'),

  // 屏幕分享源获取（用于系统音频录制）
  getDesktopCapturerSources: () => ipcRenderer.invoke('get-desktop-capturer-sources'),

  // PulseAudio remap-source 相关
  setupPulseAudioRemapSource: () => ipcRenderer.invoke('setup-pulseaudio-remap-source'),
  getSystemAudioDevices: () => ipcRenderer.invoke('get-system-audio-devices'),
  getPulseAudioSourcesDetailed: () => ipcRenderer.invoke('get-pulseaudio-sources-detailed'),
  onPulseAudioRemapSourceReady: (callback) => 
    ipcRenderer.on('pulseaudio-remap-source-ready', (event, data) => callback(data)),

  // ffmpeg 相关
  checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  startFFmpegAudioCapture: (audioFilePath) => ipcRenderer.invoke('start-ffmpeg-audio-capture', audioFilePath),
  stopFFmpegAudioCapture: () => ipcRenderer.invoke('stop-ffmpeg-audio-capture'),
  mergeAudioFiles: (systemAudioPath, micAudioPath, outputPath) => 
    ipcRenderer.invoke('merge-audio-files', systemAudioPath, micAudioPath, outputPath),

  // Linux 依赖警告相关
  dismissLinuxDependencyWarning: () => ipcRenderer.invoke('dismiss-linux-dependency-warning'),
  onLinuxDependencyMissing: (callback) => ipcRenderer.on('linux-dependency-missing', (event, data) => callback(data)),
});
