const { app, BrowserWindow, ipcMain, dialog, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// 初始化配置存储
const store = new Store();

// 音频文件保存目录
const AUDIO_DIR = path.join(app.getPath('userData'), 'audio_files');

// 确保音频目录存在
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
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
