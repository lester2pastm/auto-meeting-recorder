describe('Main process IPC handler validation', () => {
  let handlers;
  let fsMock;

  function loadMainModule() {
    jest.resetModules();
    handlers = {};

    fsMock = {
      existsSync: jest.fn((targetPath) => targetPath === '/mock/userData/audio_files'),
      mkdirSync: jest.fn(),
      unlinkSync: jest.fn(),
      readFileSync: jest.fn(),
      writeFileSync: jest.fn(),
      copyFileSync: jest.fn(),
      rmSync: jest.fn(),
      appendFileSync: jest.fn()
    };

    jest.doMock('fs', () => fsMock);
    jest.doMock('electron-store', () => jest.fn(() => ({})));
    jest.doMock('child_process', () => ({
      spawn: jest.fn(() => ({ on: jest.fn(), stderr: { on: jest.fn() }, stdout: { on: jest.fn() }, kill: jest.fn() })),
      exec: jest.fn()
    }));
    jest.doMock('util', () => ({
      promisify: jest.fn(() => jest.fn())
    }));
    jest.doMock('../../electron/linux-audio-helper', () => ({
      checkLinuxDependencies: jest.fn(),
      parsePulseSourceList: jest.fn(() => []),
      chooseRecordingSources: jest.fn(() => ({})),
      getAlsaSourceLoadCandidates: jest.fn(() => [])
    }));
    jest.doMock('electron', () => {
      const browserWindowInstance = {
        loadFile: jest.fn(),
        on: jest.fn(),
        close: jest.fn(),
        focus: jest.fn(),
        isMinimized: jest.fn(() => false),
        restore: jest.fn(),
        webContents: {
          openDevTools: jest.fn(),
          send: jest.fn(),
          session: {
            setPermissionRequestHandler: jest.fn()
          }
        }
      };

      return {
        app: {
          getPath: jest.fn(() => '/mock/userData'),
          requestSingleInstanceLock: jest.fn(() => true),
          whenReady: jest.fn(() => Promise.resolve()),
          on: jest.fn(),
          quit: jest.fn()
        },
        BrowserWindow: Object.assign(
          jest.fn(() => browserWindowInstance),
          { getAllWindows: jest.fn(() => [browserWindowInstance]) }
        ),
        ipcMain: {
          handle: jest.fn((channel, handler) => {
            handlers[channel] = handler;
          }),
          on: jest.fn()
        },
        dialog: {},
        desktopCapturer: {},
        screen: {
          getPrimaryDisplay: jest.fn(() => ({
            workAreaSize: { width: 1400, height: 900 }
          }))
        }
      };
    });

    require('../../electron/main.js');
  }

  beforeEach(() => {
    loadMainModule();
  });

  test('file-exists should reject null file paths', async () => {
    const result = await handlers['file-exists']({}, null);

    expect(result).toEqual({
      success: false,
      error: 'Invalid file path'
    });
  });

  test('delete-file should reject traversal attempts before touching the filesystem', async () => {
    const result = await handlers['delete-file']({}, '../secret.txt');

    expect(result).toEqual({
      success: false,
      error: 'Access denied'
    });
    expect(fsMock.unlinkSync).not.toHaveBeenCalled();
  });
});
