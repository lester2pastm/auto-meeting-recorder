const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, screen, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { spawn, exec, execFile } = require('child_process');
const { promisify } = require('util');
const { createAppUpdate } = require('./app-update');
const { startLocalAsr, supported: localAsrSupported } = require('./local-asr');
const {
  checkLinuxDependencies,
  parsePulseSourceList,
  chooseRecordingSources,
  getAlsaSourceLoadCandidates
} = require('./linux-audio-helper');
const {
  resolveManagedAudioPath,
  createManagedSplitOutputDir
} = require('./managed-paths');

// 初始化配置存储
const store = new Store();

// 平台检测
const isLinux = process.platform === 'linux';
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// 音频录制进程（Linux 下使用 ffmpeg）
let ffmpegSystemAudioProcess = null;
let recordingStartTime = null;
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// 音频文件保存目录
const AUDIO_DIR = path.join(app.getPath('userData'), 'audio_files');
const AUDIO_FILE_TYPES = {
  '.webm': 'audio/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac'
};

// 确保音频目录存在
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

const PID_FILE = path.join(app.getPath('userData'), 'ffmpeg_recording.pid');

async function cleanupOrphanFFmpeg() {
  if (!isLinux) return;
  try {
    if (!fs.existsSync(PID_FILE)) return;
    const pidContent = fs.readFileSync(PID_FILE, 'utf8').trim();
    const pid = parseInt(pidContent, 10);
    if (!pid) {
      fs.unlinkSync(PID_FILE);
      return;
    }
    try {
      const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (cmdline.includes('ffmpeg')) {
        process.kill(pid, 'SIGKILL');
        safeLog(`Cleaned up orphan FFmpeg process (PID: ${pid})`);
      }
    } catch (e) {
    }
    fs.unlinkSync(PID_FILE);
  } catch (e) {
  }
}

let mainWindow;
let localAsrSession = null;
let appUpdate;
let updateFrameGeneration = 0;

function beginLocalAsr(sender, sampleRate, filePath = '', live = false) {
  if (localAsrSession) throw new Error('Local speech recognition is already running');
  const job = startLocalAsr({
    resourcesPath: app.isPackaged ? process.resourcesPath : null,
    sampleRate,
    filePath,
    onText: (data) => {
      if (live && !sender.isDestroyed()) sender.send('local-asr-text', data);
    }
  });
  const session = { sender, job, live };
  localAsrSession = session;
  return session;
}

function cancelLocalAsr(sender, live = localAsrSession?.live) {
  if (!localAsrSession || localAsrSession.sender !== sender) return;
  if (localAsrSession.live !== live) return;
  localAsrSession.job.cancel();
  localAsrSession = null;
}

ipcMain.handle('start-local-asr', async ({ sender }, { sampleRate, live }) => {
  try {
    if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
      throw new Error('Invalid ASR sample rate');
    }
    const session = beginLocalAsr(sender, sampleRate, '', live === true);
    if (session.live) return { success: true };
    const result = await session.job.ready;
    if (!result.success && localAsrSession === session) localAsrSession = null;
    return result;
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('write-local-asr', ({ sender }, { samples, live }) => {
  if (!localAsrSession || localAsrSession.sender !== sender || localAsrSession.live !== live
      || !(samples instanceof Float32Array) || samples.length > 65536) {
    return false;
  }
  const pcm = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  return localAsrSession.job.write(pcm);
});

ipcMain.handle('finish-local-asr', async ({ sender }, live) => {
  const session = localAsrSession;
  if (!session || session.sender !== sender || session.live !== live) return null;
  try {
    return await session.job.finish();
  } finally {
    if (localAsrSession === session) localAsrSession = null;
  }
});

ipcMain.handle('cancel-local-asr', ({ sender }, live) => cancelLocalAsr(sender, live === true));

ipcMain.handle('transcribe-local-file', async ({ sender }, filePath) => {
  let session;
  try {
    if (!isLinux) throw new Error('Local file decoding is unavailable on this platform');
    const file = fs.realpathSync(resolveManagedAudioPath(AUDIO_DIR, filePath));
    const managed = resolveManagedAudioPath(fs.realpathSync(AUDIO_DIR), file);
    session = beginLocalAsr(sender, 16000, managed);
    return await session.job.result;
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    if (session && localAsrSession === session) localAsrSession = null;
  }
});

// 安全日志函数，完全避免 EPIPE 错误
// 由于 Electron 打包后可能出现 stdout 管道问题，直接禁用日志
function safeLog() {}
function safeError() {}
function safeWarn() {}

function normalizeBinaryPayload(data) {
  if (!data) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }

  if (Array.isArray(data)) {
    return Buffer.from(data);
  }

  throw new Error('Unsupported audio payload type');
}

function audioFilePayload(buffer, filePath) {
  const ownsBuffer = buffer.byteOffset === 0 && buffer.byteLength === buffer.buffer.byteLength;
  return {
    success: true,
    data: ownsBuffer ? new Uint8Array(buffer.buffer) : new Uint8Array(buffer),
    type: AUDIO_FILE_TYPES[path.extname(filePath).toLowerCase()]
  };
}

function createWindow() {
  // 获取主屏幕尺寸
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  
  // 计算窗口尺寸为屏幕的70%，保持宽高比
  const targetWidth = Math.round(screenWidth * 0.7);
  const targetHeight = Math.round(targetWidth * 900 / 1400); // 保持原宽高比 1400:900
  
  // 计算居中位置
  const x = Math.round((screenWidth - targetWidth) / 2);
  const y = Math.round((screenHeight - targetHeight) / 2);
  
  // 根据平台选择图标（开发模式下统一使用 PNG，打包时使用平台特定格式）
  let iconPath;
  const isDev = process.argv.includes('--dev');
  if (isDev) {
    // 开发模式下统一使用 PNG，避免 ICO 兼容性问题
    iconPath = path.join(__dirname, '..', 'assets', 'icons', 'icon.png');
  } else if (isWindows) {
    iconPath = path.join(__dirname, '..', 'assets', 'icons', 'icon.ico');
  } else if (isMac) {
    iconPath = path.join(__dirname, '..', 'assets', 'icons', 'icon.icns');
  } else {
    iconPath = path.join(__dirname, '..', 'assets', 'icons', 'icon.png');
  }
  
  mainWindow = new BrowserWindow({
    width: targetWidth,
    height: targetHeight,
    x: x,
    y: y,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // 开发模式下禁用 webSecurity 以允许 IndexedDB 在 file:// 协议下工作
      webSecurity: !isDev
    }
  });

  const sender = mainWindow.webContents;
  if (appUpdate) {
    sender.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
      if (!inPlace && isMainFrame) {
        updateFrameGeneration++;
        appUpdate.setBusy(true);
      }
    });
  }
  sender.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch((error) => safeWarn('Could not open summary link:', error.message));
    }
    return { action: 'deny' };
  });

  // 加载应用
  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
  mainWindow.on('closed', () => {
    cancelLocalAsr(sender);
    updateFrameGeneration++;
    appUpdate?.setBusy(true);
  });

  // 开发模式下打开开发者工具
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // 处理屏幕分享权限请求
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true); // 允许媒体权限
    } else {
      callback(false);
    }
  });

  // 处理窗口关闭事件
  mainWindow.on('close', (e) => {
    if (willQuit) {
      return;
    }
    e.preventDefault();
    mainWindow.webContents.send('check-recording-status');
  });
}

let willQuit = false;

function registerUpdateHandlers() {
  appUpdate = createAppUpdate({
    app, net, shell, store,
    publish: state => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app-update-state', state);
    }
  });
  const isCurrentWindow = event => mainWindow && !mainWindow.isDestroyed()
    && event.sender === mainWindow.webContents && event.senderFrame === event.sender.mainFrame;
  const handlers = {
    state: () => appUpdate.getState(),
    check: () => appUpdate.check(),
    download: () => appUpdate.download(),
    release: () => appUpdate.openRelease(),
    automatic: (_event, enabled) => appUpdate.setAutomatic(enabled),
    busy: (_event, busy) => appUpdate.setBusy(busy),
    install: event => {
      const generation = updateFrameGeneration;
      return appUpdate.install(
        () => !willQuit && generation === updateFrameGeneration && isCurrentWindow(event)
          && !ffmpegSystemAudioProcess && !localAsrSession,
        () => { willQuit = true; }
      );
    }
  };
  for (const [action, handler] of Object.entries(handlers)) {
    ipcMain.handle(`app-update-${action}`, (event, value) => {
      if (!isCurrentWindow(event)) return;
      return handler(event, value);
    });
  }
  app.on('will-quit', appUpdate.stop);
  appUpdate.start();
}

// IPC 处理器：强制关闭应用
ipcMain.on('force-close', () => {
  willQuit = true;
  if (mainWindow) {
    mainWindow.close();
  }
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  // 应用就绪
  app.whenReady().then(async () => {
    await cleanupOrphanFFmpeg();
    if (app.isPackaged) registerUpdateHandlers();
    else ipcMain.handle('app-update-state', () => ({ mode: 'disabled' }));
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

// 所有窗口关闭
app.on('window-all-closed', () => {
  // 停止所有正在运行的 FFmpeg 进程
  if (ffmpegSystemAudioProcess) {
    try {
      ffmpegSystemAudioProcess.kill('SIGTERM');
    } catch (e) {
      // 忽略错误
    }
    ffmpegSystemAudioProcess = null;
  }

  try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch (e) {}
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 处理器：保存音频文件
ipcMain.handle('save-audio', async (event, { blob, filename }) => {
  try {
    safeLog('[Main] save-audio called:', { filename, blobType: typeof blob, blobLength: blob ? blob.length : 'null' });
    
    // 确保音频目录存在
    if (!fs.existsSync(AUDIO_DIR)) {
      safeLog('[Main] Creating audio directory:', AUDIO_DIR);
      fs.mkdirSync(AUDIO_DIR, { recursive: true });
    }
    
    const filePath = resolveManagedAudioPath(AUDIO_DIR, filename);
    safeLog('[Main] Saving to:', filePath);
    
    const buffer = normalizeBinaryPayload(blob);
    safeLog('[Main] Buffer created, size:', buffer.length);
    
    fs.writeFileSync(filePath, buffer);
    safeLog('[Main] File saved successfully');
    
    return { success: true, filePath };
  } catch (error) {
    safeError('[Main] save-audio error:', error);
    return { success: false, error: error.message };
  }
});

// IPC 处理器：获取音频文件
ipcMain.handle('get-audio', async (event, filePathOrName) => {
  try {
    const filePath = resolveManagedAudioPath(AUDIO_DIR, filePathOrName);
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      return audioFilePayload(buffer, filePath);
    }
    return { success: false, error: 'File not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC 处理器：删除音频文件
ipcMain.handle('delete-audio', async (event, filePathOrName) => {
  try {
    const filePath = resolveManagedAudioPath(AUDIO_DIR, filePathOrName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC 处理器：保存配置
ipcMain.handle('save-config', async (event, config) => {
  try {
    store.set('config', config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC 处理器：加载配置
ipcMain.handle('load-config', async () => {
  try {
    const config = store.get('config', null);
    return { success: true, config };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC 处理器：导出音频文件
ipcMain.handle('export-audio', async (event, { filename, defaultPath }) => {
  try {
    const sourcePath = resolveManagedAudioPath(AUDIO_DIR, filename);
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: 'Source file not found' };
    }

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultPath || filename,
      filters: [
        { name: 'Audio Files', extensions: ['webm', 'wav', 'mp3'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (filePath) {
      fs.copyFileSync(sourcePath, filePath);
      return { success: true, filePath };
    }
    return { success: false, error: 'User cancelled' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC 处理器：获取音频目录路径
ipcMain.handle('get-audio-directory', async () => {
  return { success: true, path: AUDIO_DIR };
});

// IPC 处理器：获取屏幕分享源（用于获取系统音频）
ipcMain.handle('get-desktop-capturer-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 } // 不需要缩略图
    });
    return { 
      success: true, 
      sources: sources.map(source => ({
        id: source.id,
        name: source.name,
        display_id: source.display_id
      }))
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 检测平台
ipcMain.handle('get-platform', async () => {
  return { 
    success: true, 
    platform: process.platform,
    isLinux: isLinux,
    isWindows: isWindows,
    isMac: isMac
  };
});

// 获取应用版本
ipcMain.handle('get-app-version', async () => {
  return { 
    success: true, 
    version: app.getVersion()
  };
});

// 检查 ffmpeg 是否可用
ipcMain.handle('check-ffmpeg', async () => {
  try {
    const { stdout } = await execAsync('ffmpeg -version');
    const version = stdout.split('\n')[0];
    return { success: true, available: true, version };
  } catch (error) {
    return { success: true, available: false, error: error.message };
  }
});

// 检查 Linux 系统依赖（统一检测音频系统和 FFmpeg）
ipcMain.handle('check-linux-dependencies', async () => {
  try {
    const result = await checkLinuxDependencies(store);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 辅助函数：获取默认的 PulseAudio 设备
async function getDefaultPulseAudioDevice(type = 'output') {
  try {
    const { stdout } = await execAsync('pactl list sources short');
    const sources = parsePulseSourceList(stdout);
    const selected = chooseRecordingSources(sources);

    if (type === 'output') {
      return selected.monitor || 'default';
    }

    if (type === 'input') {
      return selected.microphone || 'default';
    }

    return 'default';
  } catch (error) {
      safeWarn('Failed to get default PulseAudio device:', error.message);
    return 'default';
  }
}

// 在 Linux 下使用 ffmpeg 开始录制系统音频
ipcMain.handle('start-ffmpeg-system-audio', async (event, { outputPath, device = null, microphoneDevice: preferredMicrophoneDevice = null, localAsr = false }) => {
  if (!isLinux) {
    return { success: false, error: 'FFmpeg system audio recording is only supported on Linux' };
  }

  let speechSession;
  try {
    outputPath = resolveManagedAudioPath(AUDIO_DIR, outputPath);
    // 如果已有录制进程，先停止
    if (ffmpegSystemAudioProcess) {
      ffmpegSystemAudioProcess.kill('SIGTERM');
      ffmpegSystemAudioProcess = null;
    }

    const { stdout } = await execAsync('pactl list sources short');
    const sources = parsePulseSourceList(stdout);
    const selected = chooseRecordingSources(sources);

    const monitorDevice = device
      ? (device.endsWith('.monitor') ? device : `${device}.monitor`)
      : selected.monitor;
    const microphoneDevice = preferredMicrophoneDevice || selected.microphone;

    let args = null;

    if (microphoneDevice && monitorDevice) {
      args = [
        '-f', 'pulse',
        '-i', microphoneDevice,
        '-f', 'pulse',
        '-i', monitorDevice,
        '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=2[aout]',
        '-map', '[aout]',
        '-acodec', 'libopus',
        '-b:a', '128k',
        '-ar', '48000',
        '-ac', '2',
        '-y',
        outputPath
      ];
    } else if (microphoneDevice) {
      args = [
        '-f', 'pulse',
        '-i', microphoneDevice,
        '-acodec', 'libopus',
        '-b:a', '128k',
        '-ar', '48000',
        '-ac', '1',
        '-y',
        outputPath
      ];
    } else if (monitorDevice) {
      args = [
        '-f', 'pulse',
        '-i', monitorDevice,
        '-acodec', 'libopus',
        '-b:a', '128k',
        '-ar', '48000',
        '-ac', '2',
        '-y',
        outputPath
      ];
    } else {
      throw new Error('未检测到可用的 PulseAudio 输入源或 monitor 源');
    }

    if (localAsr && localAsrSupported) {
      try {
        speechSession = beginLocalAsr(event.sender, 16000, '', true);
      } catch (error) {
        safeWarn('Could not start live transcription:', error.message);
      }
    }
    if (speechSession) {
      let input = '0:a:0';
      const filter = args.indexOf('-filter_complex');
      if (filter !== -1) {
        args[filter + 1] += ';[aout]asplit=2[record][speech]';
        args[args.indexOf('-map') + 1] = '[record]';
        input = '[speech]';
      }
      args.push('-map', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1');
    }

    safeLog('Starting ffmpeg mixed audio recording:', args.join(' '));

    const recordingProcess = spawn('ffmpeg', args);
    ffmpegSystemAudioProcess = recordingProcess;
    if (speechSession) {
      recordingProcess.stdout.on('data', (chunk) => speechSession.job.write(chunk));
    }
    
    let errorOutput = '';
    const MAX_ERROR_OUTPUT = 102400; // 100KB
    
    ffmpegSystemAudioProcess.stderr.on('data', (data) => {
      const message = data.toString();
      
      // 限制日志缓冲区大小，避免内存溢出
      if (errorOutput.length + message.length > MAX_ERROR_OUTPUT) {
        errorOutput = errorOutput.slice(-MAX_ERROR_OUTPUT / 2) + message;
      } else {
        errorOutput += message;
      }
      
      // 只记录关键信息
      if (message.includes('Error') || message.includes('error')) {
          safeError('FFmpeg system audio error:', message);
      }
    });

    ffmpegSystemAudioProcess.on('error', (error) => {
      try {
        safeError('FFmpeg system audio process error:', error);
      } catch (e) {}
    });

    recordingProcess.on('close', (code) => {
      safeLog(`FFmpeg system audio process exited with code ${code}`);
      if (ffmpegSystemAudioProcess === recordingProcess) {
        ffmpegSystemAudioProcess = null;
        try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch (e) {}
      }
    });

    // 等待 ffmpeg 启动
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('FFmpeg failed to start within 5 seconds'));
      }, 5000);

      const checkStarted = () => {
        if (ffmpegSystemAudioProcess === recordingProcess && recordingProcess.pid) {
          clearTimeout(timeout);
          try {
            fs.writeFileSync(PID_FILE, String(recordingProcess.pid));
          } catch (e) {}
          resolve();
        }
      };
      
      setTimeout(checkStarted, 500);
    });

    return { success: true, pid: recordingProcess.pid };
  } catch (error) {
    if (speechSession) cancelLocalAsr(event.sender);
    safeError('Failed to start ffmpeg system audio recording:', error);
    return { success: false, error: error.message };
  }
});

// 停止 ffmpeg 音频录制
ipcMain.handle('stop-ffmpeg-recording', async () => {
  try {
    const recordingProcess = ffmpegSystemAudioProcess;
    if (!recordingProcess) {
      return { success: false, error: 'FFmpeg 录音进程已退出' };
    }

    const code = await new Promise((resolve) => {
      const timeout = setTimeout(() => recordingProcess.kill('SIGKILL'), 3000);
      recordingProcess.once('close', (code) => {
        clearTimeout(timeout);
        resolve(code);
      });

      recordingProcess.stdin.once('error', () => recordingProcess.kill('SIGTERM'));
      recordingProcess.stdin.write('q');
    });

    if (code !== 0) {
      return { success: false, error: 'FFmpeg 未能正常结束录音，请尝试恢复临时文件' };
    }
    return { success: true, results: { systemAudio: true } };
  } catch (error) {
    safeError('Error stopping ffmpeg recording:', error);
    return { success: false, error: error.message };
  }
});

// 合并音频文件（使用 ffmpeg）
ipcMain.handle('merge-audio-files', async (event, { microphonePath, systemAudioPath, outputPath }) => {
  if (!isLinux) {
    return { success: false, error: 'Audio merging via FFmpeg is only supported on Linux' };
  }

  try {
    // 检查输入文件是否存在
    if (!fs.existsSync(microphonePath)) {
      return { success: false, error: 'Microphone audio file not found' };
    }
    if (!fs.existsSync(systemAudioPath)) {
      return { success: false, error: 'System audio file not found' };
    }

    // 使用 ffmpeg 合并音频
    // 使用 amix 滤镜将两个音频混合
    const args = [
      '-i', microphonePath,
      '-i', systemAudioPath,
      '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=3[aout]',
      '-map', '[aout]',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-ar', '48000',
      '-y',
      outputPath
    ];

    safeLog('Merging audio files:', args.join(' '));

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);
      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          // 清理临时文件
          try {
            fs.unlinkSync(microphonePath);
            fs.unlinkSync(systemAudioPath);
          } catch (e) {
            safeWarn('Failed to clean up temp files:', e.message);
          }
          resolve({ success: true, outputPath });
        } else {
          reject(new Error(`FFmpeg merge failed with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`Failed to start FFmpeg: ${error.message}`));
      });
    });
  } catch (error) {
    safeError('Error merging audio files:', error);
    return { success: false, error: error.message };
  }
});

// 获取 PulseAudio 音频源列表（Linux）
ipcMain.handle('get-pulseaudio-sources', async () => {
  if (!isLinux) {
    return { success: true, sources: [] };
  }

  try {
    const { stdout } = await execAsync('pactl list sources short');
    const sources = parsePulseSourceList(stdout).map(source => ({
      name: source.name,
      description: source.name,
      driver: source.driver,
      state: source.state
    }));

    return { success: true, sources, selected: chooseRecordingSources(parsePulseSourceList(stdout)) };
  } catch (error) {
    safeWarn('Failed to get PulseAudio sources:', error.message);
    return { success: true, sources: [], error: error.message };
  }
});

ipcMain.handle('get-audio-source-options', async () => {
  if (!isLinux) {
    return {
      success: true,
      platform: process.platform,
      microphoneSources: [],
      systemSources: [],
      recommendedMicSource: null,
      recommendedSystemSource: null
    };
  }

  try {
    const { stdout } = await execAsync('pactl list sources short');
    const parsedSources = parsePulseSourceList(stdout);
    const selected = chooseRecordingSources(parsedSources);

    const microphoneSources = parsedSources
      .filter(source => source.name && !source.name.includes('.monitor'))
      .map(source => ({
        id: source.name,
        label: source.name,
        description: source.name,
        driver: source.driver,
        state: source.state
      }));

    const systemSources = parsedSources
      .filter(source => source.name && source.name.includes('.monitor'))
      .map(source => ({
        id: source.name,
        label: source.name,
        description: source.name,
        driver: source.driver,
        state: source.state
      }));

    const preferredSystem = systemSources.find(source => !source.id.includes('echo-cancel.monitor')) || systemSources[0] || null;

    return {
      success: true,
      platform: process.platform,
      microphoneSources,
      systemSources,
      recommendedMicSource: selected.microphone,
      recommendedSystemSource: preferredSystem ? preferredSystem.id : selected.monitor
    };
  } catch (error) {
    return {
      success: true,
      platform: process.platform,
      microphoneSources: [],
      systemSources: [],
      recommendedMicSource: null,
      recommendedSystemSource: null,
      error: error.message
    };
  }
});

// 检测 PulseAudio 是否有可用的输入设备（麦克风）
ipcMain.handle('check-pulseaudio-input', async () => {
  if (!isLinux) {
    return { success: true, hasInput: true };
  }

  try {
    const { stdout } = await execAsync('pactl list sources short');
    const lines = stdout.split('\n');

    // 检查是否有非 monitor 的输入设备
    for (const line of lines) {
      if (line.trim()) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const sourceName = parts[1];
          // monitor 设备是输出设备，不是输入设备
          if (!sourceName.includes('.monitor')) {
            return { success: true, hasInput: true };
          }
        }
      }
    }

    return { success: true, hasInput: false };
  } catch (error) {
    safeWarn('Failed to check PulseAudio input:', error.message);
    return { success: true, hasInput: false, error: error.message };
  }
});

// 尝试自动修复 PulseAudio 输入设备（加载 module-alsa-source）
ipcMain.handle('fix-pulseaudio-input', async (event, { device = 'hw:0', sourceName = 'mic' } = {}) => {
  if (!isLinux) {
    return { success: false, error: 'Only supported on Linux' };
  }

  try {
    const { stdout: sourceOutput } = await execAsync('pactl list sources short');
    const selected = chooseRecordingSources(parsePulseSourceList(sourceOutput));
    if (selected.microphone) {
      return { success: true, alreadyAvailable: true, sourceName: selected.microphone };
    }

    // 先检查是否已经加载了 module-alsa-source
    const { stdout: listOutput } = await execAsync('pactl list modules short');
    if (listOutput.includes('module-alsa-source')) {
      safeLog('module-alsa-source already loaded');
      return { success: true, alreadyLoaded: true };
    }

    const candidates = [device, ...getAlsaSourceLoadCandidates()]
      .filter(Boolean)
      .filter((candidate, index, list) => list.indexOf(candidate) === index);

    let lastError = null;

    for (const candidate of candidates) {
      try {
        const loadCmd = `pactl load-module module-alsa-source device=${candidate} source_name=${sourceName}`;
        safeLog('Loading PulseAudio module:', loadCmd);
        const { stdout } = await execAsync(loadCmd);
        const moduleIndex = stdout.trim();
        return { success: true, moduleIndex, device: candidate };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('无法加载 module-alsa-source');
  } catch (error) {
    safeWarn('Failed to fix PulseAudio input:', error.message);
    return { success: false, error: error.message };
  }
});

// 读取音频文件（用于渲染进程获取录制完成的音频）
ipcMain.handle('read-audio-file', async (event, filePath) => {
  try {
    const managedFilePath = resolveManagedAudioPath(AUDIO_DIR, filePath);

    try {
      await fs.promises.access(managedFilePath);
    } catch {
      return { success: false, error: 'File not found: ' + managedFilePath };
    }
    
    const buffer = await fs.promises.readFile(managedFilePath);
    return audioFilePayload(buffer, managedFilePath);
  } catch (error) {
    safeError('Error reading audio file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('split-audio-file', async (event, { filePath, options = {} }) => {
  let targetDir;
  try {
    const managedSourcePath = resolveManagedAudioPath(AUDIO_DIR, filePath);

    if (!fs.existsSync(managedSourcePath)) {
      return { success: false, error: 'File not found: ' + managedSourcePath };
    }

    let segmentDuration = Number(options.segmentDuration);
    if (options.segmentDuration === null) {
      // Some WebM recordings lack duration metadata. Scan audio packets without decoding.
      const { stdout } = await execFileAsync('ffmpeg', [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1',
        '-i', managedSourcePath, '-map', '0:a:0', '-c', 'copy', '-f', 'null', '-'
      ]);
      const lastTime = [...stdout.matchAll(/^out_time_us=(\d+)\r?$/gm)].at(-1);
      const duration = Number(lastTime?.[1]) / 1e6;
      const segmentCount = Math.max(Number(options.segmentCount) || 1, Math.ceil(duration / (55 * 60)));
      segmentDuration = duration / segmentCount;
    }
    if (!Number.isFinite(segmentDuration) || segmentDuration <= 0) {
      throw new Error('Invalid audio segment duration');
    }
    const sourceExtension = path.extname(managedSourcePath).toLowerCase();
    const copyCodec = Object.hasOwn(AUDIO_FILE_TYPES, sourceExtension);
    const outputExtension = {
      '.aac': '.m4a',
      '.oga': '.ogg',
      '.opus': '.ogg'
    }[sourceExtension] || (copyCodec ? sourceExtension : '.webm');
    const targetPrefix = createManagedSplitOutputDir(AUDIO_DIR, managedSourcePath);
    fs.mkdirSync(path.dirname(targetPrefix), { recursive: true });
    targetDir = fs.mkdtempSync(`${targetPrefix}-`);
    const outputPattern = `segment_%06d${outputExtension}`;
    const args = [
      '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-i', managedSourcePath,
      '-map', '0:a:0',
      '-c', copyCodec ? 'copy' : 'libopus',
      '-f', 'segment',
      '-segment_time', String(segmentDuration),
      '-reset_timestamps', '1',
      '-y',
      outputPattern
    ];

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args, { cwd: targetDir });
      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderr || `FFmpeg split failed with code ${code}`));
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });
    });

    const files = fs.readdirSync(targetDir)
      .filter((name) => name.endsWith(outputExtension))
      .sort()
      .map((name) => path.join(targetDir, name));

    if (files.length === 0) {
      throw new Error('No split audio segments created');
    }

    return { success: true, files };
  } catch (error) {
    if (targetDir) {
      try {
        fs.rmSync(targetDir, { recursive: true, force: true });
      } catch (cleanupError) {
        safeWarn('Error cleaning up audio segments:', cleanupError);
      }
    }
    safeError('Error splitting audio file:', error);
    return { success: false, error: error.message };
  }
});

// 保存音频数据到指定路径（Linux 混合录制使用）
ipcMain.handle('save-audio-to-path', async (event, { data, filePath }) => {
  try {
    const managedFilePath = resolveManagedAudioPath(AUDIO_DIR, filePath);
    // 确保目录存在
    const dir = path.dirname(managedFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const buffer = normalizeBinaryPayload(data);
    fs.writeFileSync(managedFilePath, buffer);
    return { success: true, filePath: managedFilePath };
  } catch (error) {
    safeError('Error saving audio to path:', error);
    return { success: false, error: error.message };
  }
});

// 追加音频数据到指定路径（增量保存）
ipcMain.handle('append-audio-to-path', async (event, { data, filePath }) => {
  try {
    const managedFilePath = resolveManagedAudioPath(AUDIO_DIR, filePath);
    // 确保目录存在
    const dir = path.dirname(managedFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const buffer = normalizeBinaryPayload(data);
    // 使用追加模式写入文件
    fs.appendFileSync(managedFilePath, buffer);
    return { success: true, filePath: managedFilePath };
  } catch (error) {
    safeError('Error appending audio to path:', error);
    return { success: false, error: error.message };
  }
});

// IPC 处理器：通过 Node.js https 模块发送 HTTP POST 请求
// 解决 fetch API 在发送大文件 multipart/form-data 时与 SiliconFlow 服务端不兼容的问题
// 支持 filePath 参数进行流式上传，避免渲染进程侧全量复制二进制数据
ipcMain.handle('http-post', async (event, options) => {
  const { url, headers, body, filePath, timeout = 600000, model, filename, fileType } = options;

  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? require('https') : require('http');

      const responseHandler = (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString();
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage || '',
            body: responseBody,
            headers: res.headers
          });
        });
      };

      const errorHandler = (error) => {
        resolve({
          ok: false,
          status: 0,
          statusText: error.message || 'Network error',
          body: '',
          headers: {}
        });
      };

      if (filePath) {
        const managedFilePath = resolveManagedAudioPath(AUDIO_DIR, filePath);

        if (!fs.existsSync(managedFilePath)) {
          resolve({
            ok: false,
            status: 0,
            statusText: 'File not found: ' + filePath,
            body: '',
            headers: {}
          });
          return;
        }

        const fileStats = fs.statSync(managedFilePath);
        const contentType = AUDIO_FILE_TYPES[path.extname(managedFilePath).toLowerCase()]
          || (typeof fileType === 'string' && /^audio\/[\w.+-]+$/.test(fileType) ? fileType : 'application/octet-stream');
        const uploadFilename = (filename || path.basename(managedFilePath)).replace(/["\r\n]/g, '_');

        const boundary = '----FormBoundary' + Math.random().toString(36).substring(2, 17);
        const crlf = '\r\n';

        const preamble =
          '--' + boundary + crlf +
          'Content-Disposition: form-data; name="file"; filename="' + uploadFilename + '"' + crlf +
          'Content-Type: ' + contentType + crlf +
          crlf;

        const postamble =
          crlf +
          '--' + boundary + crlf +
          'Content-Disposition: form-data; name="model"' + crlf +
          crlf +
          (model || 'whisper-1') + crlf +
          '--' + boundary + '--' + crlf;

        const preambleBuffer = Buffer.from(preamble, 'utf-8');
        const postambleBuffer = Buffer.from(postamble, 'utf-8');
        const contentLength = preambleBuffer.length + fileStats.size + postambleBuffer.length;

        const allHeaders = {
          ...headers,
          'Content-Type': 'multipart/form-data; boundary=' + boundary,
          'Content-Length': String(contentLength)
        };

        const reqOptions = {
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: 'POST',
          headers: allHeaders,
          timeout: timeout
        };

        const req = httpModule.request(reqOptions, responseHandler);
        req.on('error', errorHandler);
        req.on('timeout', () => {
          req.destroy();
          resolve({
            ok: false,
            status: 0,
            statusText: '\u8bf7\u6c42\u8d85\u65f6\uff08' + (timeout / 1000) + '\u79d2\uff09',
            body: '',
            headers: {}
          });
        });

        req.write(preambleBuffer);

        const fileStream = fs.createReadStream(managedFilePath, { highWaterMark: 64 * 1024 });
        req.on('close', () => fileStream.destroy());
        fileStream.on('error', (err) => {
          req.destroy(err);
        });
        fileStream.on('end', () => {
          req.write(postambleBuffer, () => {
            req.end();
          });
        });
        fileStream.pipe(req, { end: false });

        return;
      }

      const bodyBuffer = normalizeBinaryPayload(body);
      const allHeaders = {
        ...headers,
        'Content-Length': String(bodyBuffer.length)
      };

      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: allHeaders,
        timeout: timeout
      };

      const req = httpModule.request(reqOptions, responseHandler);
      req.on('error', errorHandler);
      req.on('timeout', () => {
        req.destroy();
        resolve({
          ok: false,
          status: 0,
          statusText: '\u8bf7\u6c42\u8d85\u65f6\uff08' + (timeout / 1000) + '\u79d2\uff09',
          body: '',
          headers: {}
        });
      });

      req.write(bodyBuffer);
      req.end();
    } catch (error) {
      resolve({
        ok: false,
        status: 0,
        statusText: error.message || 'Request failed',
        body: '',
        headers: {}
      });
    }
  });
});

// 恢复管理相关 IPC
const RECOVERY_META_FILE = 'recovery_meta.json';
const RECOVERY_META_PATH = path.join(app.getPath('userData'), RECOVERY_META_FILE);

// IPC: 读取恢复元数据
ipcMain.handle('read-recovery-meta', async () => {
  try {
    if (fs.existsSync(RECOVERY_META_PATH)) {
      const data = fs.readFileSync(RECOVERY_META_PATH, 'utf8');
      return { success: true, meta: JSON.parse(data) };
    }
    return { success: true, meta: null };
  } catch (error) {
    safeError('Error reading recovery meta:', error);
    return { success: false, error: error.message };
  }
});

// IPC: 写入恢复元数据
ipcMain.handle('write-recovery-meta', async (event, meta) => {
  try {
    fs.writeFileSync(RECOVERY_META_PATH, JSON.stringify(meta, null, 2));
    return { success: true };
  } catch (error) {
    safeError('Error writing recovery meta:', error);
    return { success: false, error: error.message };
  }
});

// IPC: 删除恢复元数据
ipcMain.handle('delete-recovery-meta', async () => {
  try {
    if (fs.existsSync(RECOVERY_META_PATH)) {
      fs.unlinkSync(RECOVERY_META_PATH);
    }
    return { success: true };
  } catch (error) {
    safeError('Error deleting recovery meta:', error);
    return { success: false, error: error.message };
  }
});

// IPC: 检查文件是否存在
ipcMain.handle('file-exists', async (event, filePath) => {
  try {
    const managedFilePath = resolveManagedAudioPath(AUDIO_DIR, filePath);
    const exists = fs.existsSync(managedFilePath);
    return { success: true, exists };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC: 删除文件
ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    const managedFilePath = resolveManagedAudioPath(AUDIO_DIR, filePath);
    if (fs.existsSync(managedFilePath)) {
      fs.unlinkSync(managedFilePath);
      const parentDir = path.dirname(managedFilePath);
      if (path.dirname(parentDir) === path.join(AUDIO_DIR, 'segments')) {
        try {
          fs.rmdirSync(parentDir);
        } catch (error) {
          if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') throw error;
        }
      }
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
