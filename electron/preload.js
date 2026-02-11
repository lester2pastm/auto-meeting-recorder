const { contextBridge, ipcRenderer } = require('electron');

// 安全地暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 音频文件操作
  saveAudio: (blob, filename) => ipcRenderer.invoke('save-audio', { blob, filename }),
  getAudio: (filename) => ipcRenderer.invoke('get-audio', filename),
  deleteAudio: (filename) => ipcRenderer.invoke('delete-audio', filename),
  exportAudio: (filename, defaultPath) => ipcRenderer.invoke('export-audio', { filename, defaultPath }),
  getAudioDirectory: () => ipcRenderer.invoke('get-audio-directory'),

  // 配置操作
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  loadConfig: () => ipcRenderer.invoke('load-config'),

  // 屏幕分享源获取（用于系统音频录制）
  getDesktopCapturerSources: () => ipcRenderer.invoke('get-desktop-capturer-sources'),
  
  // 平台检测
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // FFmpeg 相关接口（Linux 系统音频录制）
  checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  startFFmpegSystemAudio: (outputPath, device) => ipcRenderer.invoke('start-ffmpeg-system-audio', { outputPath, device }),
  stopFFmpegRecording: () => ipcRenderer.invoke('stop-ffmpeg-recording'),
  mergeAudioFiles: (microphonePath, systemAudioPath, outputPath) => ipcRenderer.invoke('merge-audio-files', { microphonePath, systemAudioPath, outputPath }),
  getPulseAudioSources: () => ipcRenderer.invoke('get-pulseaudio-sources'),
  readAudioFile: (filePath) => ipcRenderer.invoke('read-audio-file', filePath),
  saveAudioToPath: (data, filePath) => ipcRenderer.invoke('save-audio-to-path', { data, filePath }),
  appendAudioToPath: (data, filePath) => ipcRenderer.invoke('append-audio-to-path', { data, filePath }),
  
  // 监听音频级别变化（用于波形可视化）
  onAudioLevel: (callback) => {
    ipcRenderer.on('audio-level', (event, data) => callback(data));
  },
  removeAudioLevelListener: () => {
    ipcRenderer.removeAllListeners('audio-level');
  },
  
  // 恢复管理相关接口
  readRecoveryMeta: () => ipcRenderer.invoke('read-recovery-meta'),
  writeRecoveryMeta: (meta) => ipcRenderer.invoke('write-recovery-meta', meta),
  deleteRecoveryMeta: () => ipcRenderer.invoke('delete-recovery-meta'),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath)
});
