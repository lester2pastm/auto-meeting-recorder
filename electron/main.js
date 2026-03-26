const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
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

// 音频文件保存目录
const AUDIO_DIR = path.join(app.getPath('userData'), 'audio_files');

// 确保音频目录存在
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

let mainWindow;

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

  if (data instanceof Uint8Array) {
    return Buffer.from(data);
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

  // 加载应用
  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

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
  app.whenReady().then(() => {
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
      return { success: true, data: new Uint8Array(buffer) };
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
ipcMain.handle('start-ffmpeg-system-audio', async (event, { outputPath, device = null, microphoneDevice: preferredMicrophoneDevice = null }) => {
  if (!isLinux) {
    return { success: false, error: 'FFmpeg system audio recording is only supported on Linux' };
  }

  try {
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
        '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=2,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level[aout]',
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
        '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
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
        '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
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

    safeLog('Starting ffmpeg mixed audio recording:', args.join(' '));

    ffmpegSystemAudioProcess = spawn('ffmpeg', args);
    
    let errorOutput = '';
    const MAX_ERROR_OUTPUT = 102400; // 100KB
    let lastAudioLevelSend = 0;
    const AUDIO_LEVEL_INTERVAL = 150;
    
    ffmpegSystemAudioProcess.stderr.on('data', (data) => {
      const message = data.toString();
      
      // 限制日志缓冲区大小，避免内存溢出
      if (errorOutput.length + message.length > MAX_ERROR_OUTPUT) {
        errorOutput = errorOutput.slice(-MAX_ERROR_OUTPUT / 2) + message;
      } else {
        errorOutput += message;
      }
      
      // 解析 astats 音量信息 - RMS 电平
      const rmsMatch = message.match(/lavfi\.astats\.Overall\.RMS_level=([\-\d\.]+)/);
      
      if (rmsMatch) {
        const rmsLevel = parseFloat(rmsMatch[1]);
        
        // 节流发送音量信息，避免 IPC 消息过载
        const now = Date.now();
        if (now - lastAudioLevelSend >= AUDIO_LEVEL_INTERVAL) {
          lastAudioLevelSend = now;
          
          if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('audio-level', {
              type: 'system',
              rms: rmsLevel,
              timestamp: now
            });
          }
        }
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

    ffmpegSystemAudioProcess.on('exit', (code) => {
      safeLog(`FFmpeg system audio process exited with code ${code}`);
      ffmpegSystemAudioProcess = null;
    });

    // 等待 ffmpeg 启动
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('FFmpeg failed to start within 5 seconds'));
      }, 5000);

      const checkStarted = () => {
        if (ffmpegSystemAudioProcess && ffmpegSystemAudioProcess.pid) {
          clearTimeout(timeout);
          resolve();
        }
      };
      
      setTimeout(checkStarted, 500);
    });

    return { success: true, pid: ffmpegSystemAudioProcess.pid };
  } catch (error) {
    safeError('Failed to start ffmpeg system audio recording:', error);
    return { success: false, error: error.message };
  }
});

// 停止 ffmpeg 音频录制
ipcMain.handle('stop-ffmpeg-recording', async () => {
  try {
    const results = {
      systemAudio: false
    };

    const stopPromises = [];

    // 停止系统音频录制
    if (ffmpegSystemAudioProcess) {
      const systemAudioPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => {
          // 超时后强制终止
          try {
            ffmpegSystemAudioProcess.kill('SIGKILL');
          } catch (e) {}
          results.systemAudio = true;
          ffmpegSystemAudioProcess = null;
          resolve();
        }, 3000);

        ffmpegSystemAudioProcess.on('exit', () => {
          clearTimeout(timeout);
          results.systemAudio = true;
          ffmpegSystemAudioProcess = null;
          resolve();
        });

        // 发送 'q' 命令优雅地停止 ffmpeg
        try {
          ffmpegSystemAudioProcess.stdin.write('q');
        } catch (e) {
          // 如果 stdin 已关闭，直接 kill
          ffmpegSystemAudioProcess.kill('SIGTERM');
        }
      });
      stopPromises.push(systemAudioPromise);
    }

    // 等待所有录制进程停止
    if (stopPromises.length > 0) {
      await Promise.all(stopPromises);
    }

    return { success: true, results };
  } catch (error) {
    safeError('Error stopping ffmpeg recording:', error);
    return { success: false, error: error.message };
  }
});

// 合并音频文件（使用 ffmpeg）
ipcMain.handle('merge-audio-files', async (event, { microphonePath, systemAudioPath, outputPath }) => {
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
    return { success: true, data: new Uint8Array(buffer) };
  } catch (error) {
    safeError('Error reading audio file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('split-audio-file', async (event, { filePath, options = {} }) => {
  try {
    const managedSourcePath = resolveManagedAudioPath(AUDIO_DIR, filePath);

    if (!fs.existsSync(managedSourcePath)) {
      return { success: false, error: 'File not found: ' + managedSourcePath };
    }

    const segmentCount = Math.max(1, options.segmentCount || 1);
    const segmentDuration = Math.max(1, Math.ceil(options.segmentDuration || 1));
    const sourceName = path.basename(managedSourcePath, path.extname(managedSourcePath));
    const targetDir = createManagedSplitOutputDir(AUDIO_DIR, managedSourcePath);

    fs.mkdirSync(targetDir, { recursive: true });

    const outputPattern = path.join(targetDir, `${sourceName}_%03d.webm`);
    const args = [
      '-i', managedSourcePath,
      '-vn',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-ar', '48000',
      '-f', 'segment',
      '-segment_time', String(segmentDuration),
      '-reset_timestamps', '1',
      '-y',
      outputPattern
    ];

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);
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
      .filter((name) => name.endsWith('.webm'))
      .sort()
      .slice(0, segmentCount)
      .map((name) => path.join(targetDir, name));

    if (files.length === 0) {
      return { success: false, error: 'No split audio segments created' };
    }

    return { success: true, files };
  } catch (error) {
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
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
