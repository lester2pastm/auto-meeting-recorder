const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const util = require('util');
const Store = require('electron-store');

// 初始化配置存储
const store = new Store();

// 音频文件保存目录
const AUDIO_DIR = path.join(app.getPath('userData'), 'audio_files');

// 确保音频目录存在
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// 检测 Linux 系统依赖
async function checkLinuxDependencies() {
  if (process.platform !== 'linux') {
    return { hasDependencies: true };
  }

  const hasPrompted = store.get('linuxDependencyPrompted', false);
  if (hasPrompted) {
    return { hasDependencies: true };
  }

  const execPromise = util.promisify(exec);

  try {
    let packageManager = '';
    let installCommand = '';

    try {
      await execPromise('which dpkg');
      packageManager = 'apt';
      installCommand = 'sudo apt install xdg-desktop-portal xdg-desktop-portal-gtk ffmpeg';
      
      const { stdout } = await execPromise('dpkg -l | grep xdg-desktop-portal');
      if (stdout.includes('xdg-desktop-portal')) {
        return { hasDependencies: true };
      }
    } catch {
      try {
        await execPromise('which rpm');
        packageManager = 'dnf';
        installCommand = 'sudo dnf install xdg-desktop-portal xdg-desktop-portal-gtk ffmpeg';
        
        const { stdout } = await execPromise('rpm -q xdg-desktop-portal');
        if (stdout.includes('xdg-desktop-portal')) {
          return { hasDependencies: true };
        }
      } catch {
        try {
          await execPromise('which pacman');
          packageManager = 'pacman';
          installCommand = 'sudo pacman -S xdg-desktop-portal xdg-desktop-portal-gtk ffmpeg';
          
          const { stdout } = await execPromise('pacman -Q xdg-desktop-portal');
          if (stdout.includes('xdg-desktop-portal')) {
            return { hasDependencies: true };
          }
        } catch {
          packageManager = 'unknown';
          installCommand = '请查阅文档安装 xdg-desktop-portal、ffmpeg 和对应的后端包';
        }
      }
    }

    return {
      hasDependencies: false,
      packageManager,
      installCommand
    };
  } catch (error) {
    console.error('检测 Linux 依赖失败:', error);
    return {
      hasDependencies: false,
      packageManager: 'unknown',
      installCommand: '请查阅文档安装 xdg-desktop-portal、ffmpeg 和对应的后端包'
    };
  }
}

// 检查 ffmpeg 是否可用
async function checkFFmpeg() {
  if (process.platform !== 'linux') {
    return { available: false, reason: 'Not on Linux' };
  }

  const execPromise = util.promisify(exec);

  try {
    await execPromise('which ffmpeg');
    const { stdout } = await execPromise('ffmpeg -version');
    
    // 检查是否支持 pulse 或 pipewire
    const hasPulse = stdout.includes('--enable-libpulse');
    const hasPipeWire = stdout.includes('--enable-libpipewire');
    
    if (hasPulse || hasPipeWire) {
      return { 
        available: true, 
        audioInput: hasPulse ? 'pulse' : 'pipewire' 
      };
    } else {
      return { 
        available: false, 
        reason: 'FFmpeg does not support pulseaudio or pipewire' 
      };
    }
  } catch (error) {
    return { 
      available: false, 
      reason: 'FFmpeg not found or not executable' 
    };
  }
}

let remapSourceModuleIndex = null;
let ffmpegAudioProcess = null;
let ffmpegAudioFilePath = null;

async function setupPulseAudioRemapSource() {
  if (process.platform !== 'linux') {
    return { success: true, needsSetup: false };
  }

  const execPromise = util.promisify(exec);

  try {
    await execPromise('which pactl');
    await execPromise('pactl info');
  } catch {
    return { success: false, error: 'PulseAudio 不可用' };
  }

  try {
    // 首先检查是否已存在 Computer-sound 源
    const { stdout: sourcesOutput } = await execPromise('pactl list sources short');
    
    if (sourcesOutput.includes('Computer-sound')) {
      console.log('Computer-sound 源已存在');
      // 获取已存在源的 module index
      const { stdout: modulesOutput } = await execPromise('pactl list modules short');
      const lines = modulesOutput.split('\n');
      for (const line of lines) {
        if (line.includes('module-remap-source') && line.includes('Computer-sound')) {
          remapSourceModuleIndex = line.split('\t')[0];
          console.log('找到已存在的 remap-source module index:', remapSourceModuleIndex);
          break;
        }
      }
      return { success: true, needsSetup: false, deviceName: 'Computer-sound' };
    }

    let monitorName = null;

    try {
      const { stdout: monitorOutput } = await execPromise('pacmd list-sources | grep -B 1 analog-stereo.monitor | grep name:');
      
      const lines = monitorOutput.split('\n');
      
      if (lines.length <= 2) {
        const regex = /name:\s*<(.+)>/i;
        const match = monitorOutput.match(regex);
        
        if (match && match.length > 1) {
          monitorName = match[1];
          console.log('找到 monitor 源:', monitorName);
        }
      }
    } catch (error) {
      console.log('查找 analog-stereo.monitor 失败，尝试查找其他 monitor 源');
    }

    if (!monitorName) {
      const { stdout: allSources } = await execPromise('pactl list sources short');
      const monitorSources = allSources
        .split('\n')
        .filter(line => line.includes('.monitor'))
        .map(line => line.split('\t')[1]);
      
      if (monitorSources.length > 0) {
        monitorName = monitorSources[0];
        console.log('使用替代 monitor 源:', monitorName);
      } else {
        return { success: false, error: '未找到可用的 monitor 源' };
      }
    }

    console.log('创建 remap-source...');
    
    // 使用 exec 代替 spawn 以捕获 module index 输出
    const { stdout: moduleOutput } = await execPromise(
      `pactl load-module module-remap-source master=${monitorName} source_properties=device.description=Computer-sound`
    );
    
    remapSourceModuleIndex = moduleOutput.trim();
    console.log('remap-source 创建成功，module index:', remapSourceModuleIndex);
    
    // 验证源是否真正创建成功并可用了
    let retryCount = 0;
    const maxRetries = 10;
    const checkInterval = 500; // 500ms
    
    while (retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
      try {
        const { stdout: checkOutput } = await execPromise('pactl list sources short');
        if (checkOutput.includes('Computer-sound')) {
          console.log(`Computer-sound 源在第 ${retryCount + 1} 次检查时已可用`);
          
          // 额外等待确保 Chromium 能识别
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          return { 
            success: true, 
            needsSetup: true, 
            deviceName: 'Computer-sound',
            monitorName,
            moduleIndex: remapSourceModuleIndex
          };
        }
      } catch (checkError) {
        console.log(`第 ${retryCount + 1} 次检查失败:`, checkError.message);
      }
      
      retryCount++;
    }
    
    console.warn('警告: Computer-sound 源创建后未在预期时间内检测到');
    // 即使检测失败，也返回成功，因为模块已加载
    return { 
      success: true, 
      needsSetup: true, 
      deviceName: 'Computer-sound',
      monitorName,
      moduleIndex: remapSourceModuleIndex,
      warning: '源创建成功但验证超时'
    };
    
  } catch (error) {
    console.error('设置 PulseAudio remap-source 失败:', error);
    return { success: false, error: error.message };
  }
}

async function cleanupPulseAudioRemapSource() {
  if (process.platform !== 'linux') {
    return;
  }

  const execPromise = util.promisify(exec);

  try {
    const { stdout } = await execPromise('pactl list modules short');
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      if (line.includes('module-remap-source') && line.includes('Computer-sound')) {
        const moduleIndex = line.split('\t')[0];
        await execPromise(`pactl unload-module ${moduleIndex}`);
        console.log('已清理 remap-source 模块');
      }
    }
  } catch (error) {
    console.error('清理 remap-source 失败:', error);
  }
}

// 使用 ffmpeg 录制系统音频
async function startFFmpegAudioCapture(audioFilePath) {
  if (process.platform !== 'linux') {
    return { success: false, error: 'Not on Linux' };
  }

  const ffmpegCheck = await checkFFmpeg();
  if (!ffmpegCheck.available) {
    return { success: false, error: ffmpegCheck.reason };
  }

  const audioInput = ffmpegCheck.audioInput;
  
  try {
    // 确保目录存在
    const dir = path.dirname(audioFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 构建 ffmpeg 命令
    const args = [
      '-f', audioInput,
      '-i', 'default',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-f', 'webm',
      '-y',
      audioFilePath
    ];

    console.log('启动 ffmpeg 音频录制:', args.join(' '));

    // 启动 ffmpeg 进程
    ffmpegAudioProcess = spawn('ffmpeg', args);

    ffmpegAudioFilePath = audioFilePath;

    // 监听错误输出
    ffmpegAudioProcess.stderr.on('data', (data) => {
      console.log('FFmpeg stderr:', data.toString());
    });

    // 监听进程退出
    ffmpegAudioProcess.on('close', (code) => {
      console.log(`FFmpeg 进程退出，代码: ${code}`);
      ffmpegAudioProcess = null;
    });

    // 等待一小段时间确保进程启动成功
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (ffmpegAudioProcess && !ffmpegAudioProcess.killed) {
          resolve();
        } else {
          reject(new Error('FFmpeg 进程启动失败'));
        }
      }, 1000);

      ffmpegAudioProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    return { success: true, filePath: audioFilePath };
  } catch (error) {
    console.error('启动 ffmpeg 音频录制失败:', error);
    return { success: false, error: error.message };
  }
}

// 停止 ffmpeg 音频录制
async function stopFFmpegAudioCapture() {
  if (!ffmpegAudioProcess) {
    return { success: true, filePath: ffmpegAudioFilePath };
  }

  try {
    // 发送 'q' 命令让 ffmpeg 优雅退出
    ffmpegAudioProcess.stdin.write('q');
    
    // 等待进程退出
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (ffmpegAudioProcess) {
          ffmpegAudioProcess.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      ffmpegAudioProcess.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    const filePath = ffmpegAudioFilePath;
    ffmpegAudioProcess = null;
    ffmpegAudioFilePath = null;

    return { success: true, filePath };
  } catch (error) {
    console.error('停止 ffmpeg 音频录制失败:', error);
    return { success: false, error: error.message };
  }
}

// 合并音频文件（系统音频 + 麦克风音频）
async function mergeAudioFiles(systemAudioPath, micAudioPath, outputPath) {
  const execPromise = util.promisify(exec);

  try {
    // 确保目录存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 使用 ffmpeg 合并两个音频文件
    const args = [
      '-i', systemAudioPath,
      '-i', micAudioPath,
      '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]',
      '-map', '[aout]',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-y',
      outputPath
    ];

    console.log('合并音频文件:', args.join(' '));

    await execPromise(`ffmpeg ${args.join(' ')}`);

    return { success: true, filePath: outputPath };
  } catch (error) {
    console.error('合并音频文件失败:', error);
    return { success: false, error: error.message };
  }
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
  
  mainWindow = new BrowserWindow({
    width: targetWidth,
    height: targetHeight,
    x: x,
    y: y,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
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
app.whenReady().then(async () => {
  createWindow();

  // Linux 系统依赖检测
  const depCheck = await checkLinuxDependencies();
  if (!depCheck.hasDependencies && mainWindow) {
    setTimeout(() => {
      mainWindow.webContents.send('linux-dependency-missing', {
        installCommand: depCheck.installCommand,
        packageManager: depCheck.packageManager
      });
    }, 2000);
  }

  // Linux PulseAudio remap-source 设置
  if (process.platform === 'linux') {
    const remapSetup = await setupPulseAudioRemapSource();
    
    if (remapSetup.success && remapSetup.needsSetup) {
      setTimeout(() => {
        mainWindow.webContents.send('pulseaudio-remap-source-ready', {
          deviceName: remapSetup.deviceName,
          monitorName: remapSetup.monitorName
        });
      }, 1500);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 处理器：保存音频文件
ipcMain.handle('save-audio', async (event, { blob, filename }) => {
  try {
    const filePath = path.join(AUDIO_DIR, filename);
    const buffer = Buffer.from(blob);
    fs.writeFileSync(filePath, buffer);
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC 处理器：获取音频文件
ipcMain.handle('get-audio', async (event, filename) => {
  try {
    const filePath = path.join(AUDIO_DIR, filename);
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
ipcMain.handle('delete-audio', async (event, filename) => {
  try {
    const filePath = path.join(AUDIO_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC 处理器：获取所有音频文件列表
ipcMain.handle('list-audio-files', async () => {
  try {
    const files = fs.readdirSync(AUDIO_DIR);
    const audioFiles = files
      .filter(f => f.endsWith('.webm') || f.endsWith('.wav') || f.endsWith('.mp3'))
      .map(filename => {
        const filePath = path.join(AUDIO_DIR, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          size: stats.size,
          createdAt: stats.birthtime
        };
      });
    return { success: true, files: audioFiles };
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

// IPC 处理器：标记 Linux 依赖提示已显示
ipcMain.handle('dismiss-linux-dependency-warning', async () => {
  try {
    store.set('linuxDependencyPrompted', true);
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

// IPC 处理器：设置 PulseAudio remap-source
ipcMain.handle('setup-pulseaudio-remap-source', async () => {
  return await setupPulseAudioRemapSource();
});

// IPC 处理器：获取系统音频设备
ipcMain.handle('get-system-audio-devices', async () => {
  if (process.platform !== 'linux') {
    return { success: true, devices: [] };
  }

  try {
    const { stdout } = await execPromise('pactl list sources short');
    const lines = stdout.split('\n');
    const devices = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      
      const [index, name, description] = line.split('\t');
      
      if (name.includes('Computer-sound') || name.includes('.monitor')) {
        devices.push({
          index,
          name,
          description: description || name
        });
      }
    }

    return { success: true, devices };
  } catch (error) {
    console.error('获取系统音频设备失败:', error);
    return { success: false, error: error.message };
  }
});

// IPC 处理器：获取所有 PulseAudio 源的详细信息（用于诊断）
ipcMain.handle('get-pulseaudio-sources-detailed', async () => {
  if (process.platform !== 'linux') {
    return { success: true, sources: [] };
  }

  try {
    const { stdout } = await execPromise('pactl list sources');
    const sources = [];
    
    // 解析 PulseAudio 输出
    const sourceBlocks = stdout.split(/Source #\d+/).filter(block => block.trim());
    
    for (const block of sourceBlocks) {
      const nameMatch = block.match(/Name:\s*(.+)/);
      const descMatch = block.match(/Description:\s*(.+)/);
      const deviceMatch = block.match(/device\.string = "(.+)"/);
      
      if (nameMatch) {
        sources.push({
          name: nameMatch[1].trim(),
          description: descMatch ? descMatch[1].trim() : '',
          device: deviceMatch ? deviceMatch[1].trim() : ''
        });
      }
    }
    
    return { success: true, sources };
  } catch (error) {
    console.error('获取 PulseAudio 源详细信息失败:', error);
    return { success: false, error: error.message };
  }
});

// 应用退出时清理
app.on('before-quit', async () => {
  await cleanupPulseAudioRemapSource();
  if (ffmpegAudioProcess) {
    ffmpegAudioProcess.kill('SIGKILL');
  }
});

// IPC 处理器：检查 ffmpeg 可用性
ipcMain.handle('check-ffmpeg', async () => {
  return await checkFFmpeg();
});

// IPC 处理器：启动 ffmpeg 音频录制
ipcMain.handle('start-ffmpeg-audio-capture', async (event, audioFilePath) => {
  return await startFFmpegAudioCapture(audioFilePath);
});

// IPC 处理器：停止 ffmpeg 音频录制
ipcMain.handle('stop-ffmpeg-audio-capture', async () => {
  return await stopFFmpegAudioCapture();
});

// IPC 处理器：合并音频文件
ipcMain.handle('merge-audio-files', async (event, systemAudioPath, micAudioPath, outputPath) => {
  return await mergeAudioFiles(systemAudioPath, micAudioPath, outputPath);
});
