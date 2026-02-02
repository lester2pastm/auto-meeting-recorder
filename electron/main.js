const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
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
  // 只在 Linux 平台检测
  if (process.platform !== 'linux') {
    return { hasDependencies: true };
  }

  // 检查是否已经提示过
  const hasPrompted = store.get('linuxDependencyPrompted', false);
  if (hasPrompted) {
    return { hasDependencies: true };
  }

  const execPromise = util.promisify(exec);

  try {
    // 检测 xdg-desktop-portal 是否安装
    await execPromise('which xdg-desktop-portal');
    return { hasDependencies: true };
  } catch (error) {
    // 检测具体是哪个 portal 后端可用
    let installCommand = '';
    let packageManager = '';

    try {
      await execPromise('which apt');
      packageManager = 'apt';
      installCommand = 'sudo apt install xdg-desktop-portal xdg-desktop-portal-gtk';
    } catch {
      try {
        await execPromise('which dnf');
        packageManager = 'dnf';
        installCommand = 'sudo dnf install xdg-desktop-portal xdg-desktop-portal-gtk';
      } catch {
        try {
          await execPromise('which pacman');
          packageManager = 'pacman';
          installCommand = 'sudo pacman -S xdg-desktop-portal xdg-desktop-portal-gtk';
        } catch {
          packageManager = 'unknown';
          installCommand = '请查阅文档安装 xdg-desktop-portal 和对应的后端包';
        }
      }
    }

    return {
      hasDependencies: false,
      packageManager,
      installCommand
    };
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
    // 延迟显示提示，等待窗口加载完成
    setTimeout(() => {
      mainWindow.webContents.send('linux-dependency-missing', {
        installCommand: depCheck.installCommand,
        packageManager: depCheck.packageManager
      });
    }, 2000);
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
