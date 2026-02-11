const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

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
}

// 应用就绪
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

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
    console.log('[Main] save-audio called:', { filename, blobType: typeof blob, blobLength: blob ? blob.length : 'null' });
    
    // 确保音频目录存在
    if (!fs.existsSync(AUDIO_DIR)) {
      console.log('[Main] Creating audio directory:', AUDIO_DIR);
      fs.mkdirSync(AUDIO_DIR, { recursive: true });
    }
    
    const filePath = path.join(AUDIO_DIR, filename);
    console.log('[Main] Saving to:', filePath);
    
    const buffer = Buffer.from(blob);
    console.log('[Main] Buffer created, size:', buffer.length);
    
    fs.writeFileSync(filePath, buffer);
    console.log('[Main] File saved successfully');
    
    return { success: true, filePath };
  } catch (error) {
    console.error('[Main] save-audio error:', error);
    return { success: false, error: error.message };
  }
});

// IPC 处理器：获取音频文件
ipcMain.handle('get-audio', async (event, filePathOrName) => {
  try {
    // 支持完整路径或文件名
    const filePath = path.isAbsolute(filePathOrName) ? filePathOrName : path.join(AUDIO_DIR, filePathOrName);
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      return { success: true, data: Array.from(buffer) };
    }
    return { success: false, error: 'File not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC 处理器：删除音频文件
ipcMain.handle('delete-audio', async (event, filePathOrName) => {
  try {
    // 支持完整路径或文件名
    const filePath = path.isAbsolute(filePathOrName) ? filePathOrName : path.join(AUDIO_DIR, filePathOrName);
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
    const sourcePath = path.join(AUDIO_DIR, filename);
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

// 辅助函数：获取默认的 PulseAudio 设备
async function getDefaultPulseAudioDevice(type = 'output') {
  try {
    const { stdout } = await execAsync('pacmd list-sources');
    const lines = stdout.split('\n');
    let currentSource = null;
    let defaultSource = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 查找源名称
      if (line.includes('name:')) {
        const nameMatch = line.match(/name:\s*<([^>]+)>/);
        if (nameMatch) {
          currentSource = nameMatch[1];
        }
      }
      
      // 查找默认标记
      if (line.includes('* index:') && currentSource) {
        defaultSource = currentSource;
      }
    }
    
    // 查找第一个 monitor 设备作为系统音频源
    if (type === 'output') {
      for (const line of lines) {
        if (line.includes('name:')) {
          const nameMatch = line.match(/name:\s*<([^>]+)>/);
          if (nameMatch && nameMatch[1].includes('.monitor')) {
            return nameMatch[1].replace('.monitor', '');
          }
        }
      }
    }
    
    // 查找第一个输入设备作为麦克风源
    if (type === 'input') {
      for (const line of lines) {
        if (line.includes('name:')) {
          const nameMatch = line.match(/name:\s*<([^>]+)>/);
          if (nameMatch) {
            const name = nameMatch[1];
            // 排除 monitor 设备
            if (!name.includes('.monitor') && name.includes('input')) {
              return name;
            }
          }
        }
      }
    }
    
    return defaultSource || 'default';
  } catch (error) {
    console.warn('Failed to get default PulseAudio device:', error.message);
    return 'default';
  }
}

// 在 Linux 下使用 ffmpeg 开始录制系统音频
ipcMain.handle('start-ffmpeg-system-audio', async (event, { outputPath, device = null }) => {
  if (!isLinux) {
    return { success: false, error: 'FFmpeg system audio recording is only supported on Linux' };
  }

  try {
    // 如果已有录制进程，先停止
    if (ffmpegSystemAudioProcess) {
      ffmpegSystemAudioProcess.kill('SIGTERM');
      ffmpegSystemAudioProcess = null;
    }

    // 如果没有指定设备，自动检测
    if (!device) {
      device = await getDefaultPulseAudioDevice('output');
      console.log('Auto-detected system audio device:', device);
    }

    // 构建 ffmpeg 命令录制系统音频
    // 使用 pulse 音频输入，录制系统输出（monitor）
    // 使用 astats 滤镜获取实时音量信息
    const monitorDevice = device.endsWith('.monitor') ? device : `${device}.monitor`;
    const args = [
      '-f', 'pulse',
      '-i', monitorDevice,         // 系统音频 monitor 设备
      '-filter_complex', '[0:a]astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level[aout]', // 使用 astats 获取实时 RMS 音量
      '-map', '[aout]',
      '-acodec', 'libopus',        // 使用 opus 编码
      '-b:a', '128k',              // 比特率
      '-ar', '48000',              // 采样率
      '-ac', '2',                  // 双声道
      '-y',                        // 覆盖已存在文件
      outputPath
    ];

    console.log('Starting ffmpeg system audio recording:', args.join(' '));

    ffmpegSystemAudioProcess = spawn('ffmpeg', args);
    
    let errorOutput = '';
    let lastRMSLevel = -70;  // 记录上一次的 RMS 音量
    
    ffmpegSystemAudioProcess.stderr.on('data', (data) => {
      const message = data.toString();
      errorOutput += message;
      
      // 解析 astats 音量信息 - RMS 电平
      const rmsMatch = message.match(/lavfi\.astats\.Overall\.RMS_level=([\-\d\.]+)/);
      
      if (rmsMatch) {
        const rmsLevel = parseFloat(rmsMatch[1]);
        lastRMSLevel = rmsLevel;
        
        // 发送音量信息到渲染进程
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('audio-level', {
            type: 'system',
            rms: rmsLevel,
            timestamp: Date.now()
          });
        }
      }
      
      // 只记录关键信息
      if (message.includes('Error') || message.includes('error')) {
        console.error('FFmpeg system audio error:', message);
      }
    });

    ffmpegSystemAudioProcess.on('error', (error) => {
      console.error('FFmpeg system audio process error:', error);
    });

    ffmpegSystemAudioProcess.on('exit', (code) => {
      console.log(`FFmpeg system audio process exited with code ${code}`);
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
    console.error('Failed to start ffmpeg system audio recording:', error);
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
    console.error('Error stopping ffmpeg recording:', error);
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

    console.log('Merging audio files:', args.join(' '));

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
            console.warn('Failed to clean up temp files:', e.message);
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
    console.error('Error merging audio files:', error);
    return { success: false, error: error.message };
  }
});

// 获取 PulseAudio 音频源列表（Linux）
ipcMain.handle('get-pulseaudio-sources', async () => {
  if (!isLinux) {
    return { success: true, sources: [] };
  }

  try {
    const { stdout } = await execAsync('pacmd list-sources | grep -E "name:|device.description:"');
    const lines = stdout.split('\n');
    const sources = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('name:')) {
        const nameMatch = line.match(/name:\s*<([^>]+)>/);
        const descMatch = lines[i + 1] && lines[i + 1].match(/device\.description\s*=\s*"([^"]+)"/);
        
        if (nameMatch) {
          sources.push({
            name: nameMatch[1],
            description: descMatch ? descMatch[1] : nameMatch[1]
          });
        }
      }
    }

    return { success: true, sources };
  } catch (error) {
    console.warn('Failed to get PulseAudio sources:', error.message);
    return { success: true, sources: [], error: error.message };
  }
});

// 读取音频文件（用于渲染进程获取录制完成的音频）
ipcMain.handle('read-audio-file', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found: ' + filePath };
    }
    
    const buffer = fs.readFileSync(filePath);
    // 返回 Array 以便序列化通过 IPC
    return { success: true, data: Array.from(buffer) };
  } catch (error) {
    console.error('Error reading audio file:', error);
    return { success: false, error: error.message };
  }
});

// 保存音频数据到指定路径（Linux 混合录制使用）
ipcMain.handle('save-audio-to-path', async (event, { data, filePath }) => {
  try {
    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const buffer = Buffer.from(data);
    fs.writeFileSync(filePath, buffer);
    return { success: true, filePath };
  } catch (error) {
    console.error('Error saving audio to path:', error);
    return { success: false, error: error.message };
  }
});

// 追加音频数据到指定路径（增量保存）
ipcMain.handle('append-audio-to-path', async (event, { data, filePath }) => {
  try {
    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const buffer = Buffer.from(data);
    // 使用追加模式写入文件
    fs.appendFileSync(filePath, buffer);
    return { success: true, filePath };
  } catch (error) {
    console.error('Error appending audio to path:', error);
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
    console.error('Error reading recovery meta:', error);
    return { success: false, error: error.message };
  }
});

// IPC: 写入恢复元数据
ipcMain.handle('write-recovery-meta', async (event, meta) => {
  try {
    fs.writeFileSync(RECOVERY_META_PATH, JSON.stringify(meta, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Error writing recovery meta:', error);
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
    console.error('Error deleting recovery meta:', error);
    return { success: false, error: error.message };
  }
});

// IPC: 检查文件是否存在
ipcMain.handle('file-exists', async (event, filePath) => {
  try {
    const exists = fs.existsSync(filePath);
    return { success: true, exists };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC: 删除文件
ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
