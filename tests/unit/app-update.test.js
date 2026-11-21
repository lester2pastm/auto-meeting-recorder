const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');
const { EventEmitter } = require('events');
const { createAppUpdate } = require('../../electron/app-update');

global.TextDecoder ||= require('util').TextDecoder;
global.AbortController = require('vm').runInThisContext('AbortController');

let fixture;
const hash = value => createHash('sha512').update(value).digest('base64');

beforeEach(() => { fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'amr-update-test-')); });
afterEach(() => { fs.rmSync(fixture, { recursive: true, force: true }); });

function environment({ platform = 'linux', automatic = false, signed = false, resumable = false, configured = true } = {}) {
  if (configured) fs.writeFileSync(path.join(fixture, 'app-update.yml'), `provider: github\n${signed ? 'publisherName: [AMR]' : ''}`);
  const image = path.join(fixture, 'project.AppImage');
  const downloaded = path.join(fixture, platform === 'win32' ? 'download.exe' : 'download');
  fs.writeFileSync(image, 'old');
  fs.writeFileSync(downloaded, 'new');
  const file = { url: platform === 'linux' ? 'new.AppImage' : 'new.exe', size: 3, sha512: hash('new') };
  const updater = Object.assign(new EventEmitter(), {
    checkForUpdates: jest.fn().mockResolvedValue({ isUpdateAvailable: true, updateInfo: { version: '2.10.0', files: [file] } }),
    downloadUpdate: jest.fn().mockResolvedValue([downloaded]),
    verifyUpdateCodeSignature: jest.fn().mockResolvedValue(null),
    install: jest.fn().mockReturnValue(true)
  });
  if (resumable) updater.httpExecutor = { download: jest.fn() };
  const app = { isPackaged: true, getVersion: () => '2.9.0', getPath: () => fixture, quit: jest.fn(), relaunch: jest.fn() };
  const net = { fetch: jest.fn() };
  const shell = { openPath: jest.fn().mockResolvedValue('') };
  const publish = jest.fn();
  const manager = createAppUpdate({
    app, net, shell, platform, arch: 'x64', imagePath: image, resourcesPath: fixture, getUpdater: () => updater,
    store: { get: () => automatic, set: jest.fn() }, publish
  });
  return { manager, app, net, shell, updater, image, downloaded, file, publish };
}

function waitForStatus(publish, status) {
  return new Promise(resolve => publish.mockImplementation(state => {
    if (state.status === status) resolve(state);
  }));
}

test('coalesces checks and waits until idle before auto-downloading a Linux AppImage', async () => {
  const { manager, updater } = environment({ automatic: true });
  const first = manager.check();
  expect(manager.check()).toBe(first);
  await first;
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(updater.disableDifferentialDownload).toBe(false);
  expect(updater.downloadUpdate).not.toHaveBeenCalled();
  manager.setBusy(false);
  await new Promise(resolve => require('timers').setImmediate(resolve));
  expect(manager.getState().status).toBe('ready');
  manager.stop();
});

test('revalidates the AppImage and replaces it only when the window can still quit', async () => {
  const { manager, updater, app, image } = environment();
  manager.setBusy(false);
  await manager.check();
  await manager.download();
  const permitQuit = jest.fn();
  const canQuit = jest.fn().mockReturnValueOnce(true).mockReturnValue(false);
  expect(await manager.install(canQuit, permitQuit)).toBe(false);
  expect(fs.readFileSync(image, 'utf8')).toBe('old');
  expect(manager.getState().status).toBe('ready');
  expect(await manager.install(() => true, permitQuit)).toBe(true);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(3);
  expect(fs.readFileSync(image, 'utf8')).toBe('new');
  expect(permitQuit).toHaveBeenCalledTimes(1);
  expect(app.relaunch).toHaveBeenCalledWith(expect.objectContaining({ execPath: image }));
  expect(app.quit).toHaveBeenCalledTimes(1);
});

test('preserves the old AppImage if the cached download is tampered with or withdrawn', async () => {
  const { manager, updater, image, downloaded, app } = environment();
  manager.setBusy(false);
  await manager.check();
  await manager.download();
  fs.writeFileSync(downloaded, 'changed');
  expect(await manager.install(() => true, jest.fn())).toBe(false);
  expect(manager.getState().error).toBe('integrity');
  await manager.check();
  await manager.download();
  updater.checkForUpdates.mockResolvedValue({ isUpdateAvailable: false });
  expect(await manager.install(() => true, jest.fn())).toBe(false);
  expect(manager.getState().status).toBe('current');
  expect(fs.readFileSync(image, 'utf8')).toBe('old');
  expect(app.quit).not.toHaveBeenCalled();
});

test('keeps an update ready and explains that install needs a connection when offline', async () => {
  const { manager, updater, image, app } = environment();
  manager.setBusy(false);
  await manager.check();
  await manager.download();
  updater.checkForUpdates.mockRejectedValueOnce(new Error('net::ERR_INTERNET_DISCONNECTED'));
  expect(await manager.install(() => true, jest.fn())).toBe(false);
  expect(manager.getState()).toMatchObject({ status: 'ready', error: 'installNetwork', version: '2.10.0' });
  expect(fs.readFileSync(image, 'utf8')).toBe('old');
  expect(app.quit).not.toHaveBeenCalled();
  expect(await manager.install(() => true, jest.fn())).toBe(true);
  expect(app.quit).toHaveBeenCalledTimes(1);
});

test('signed Windows full updates require the trusted publisher and restart through NSIS', async () => {
  const { manager, updater, app, shell, downloaded } = environment({ platform: 'win32', signed: true });
  expect(updater.disableDifferentialDownload).toBe(true);
  expect(manager.getState().manualInstall).toBe(false);
  manager.setBusy(false);
  await manager.check();
  await manager.download();
  updater.verifyUpdateCodeSignature.mockResolvedValue('Wrong publisher');
  expect(await manager.install(() => true, jest.fn())).toBe(false);
  expect(manager.getState().error).toBe('integrity');
  expect(updater.install).not.toHaveBeenCalled();
  expect(app.quit).not.toHaveBeenCalled();

  await manager.check();
  await manager.download();
  updater.verifyUpdateCodeSignature.mockResolvedValue(null);
  expect(await manager.install(() => true, jest.fn())).toBe(true);
  expect(updater.verifyUpdateCodeSignature).toHaveBeenLastCalledWith(['AMR'], downloaded);
  expect(updater.install).toHaveBeenCalledWith(true, true);
  expect(app.quit).toHaveBeenCalledTimes(1);
  expect(shell.openPath).not.toHaveBeenCalled();
});

test('unsigned Windows opens a verified installer only on request and while idle', async () => {
  const { manager, updater, app, shell, downloaded } = environment({ platform: 'win32' });
  manager.setBusy(false);
  await manager.check();
  await manager.download();
  expect(manager.getState()).toMatchObject({ mode: 'nsis', status: 'ready', manualInstall: true });
  expect(shell.openPath).not.toHaveBeenCalled();
  const permitQuit = jest.fn();
  const busyBeforeOpen = jest.fn().mockReturnValueOnce(true).mockReturnValue(false);
  expect(await manager.install(busyBeforeOpen, permitQuit)).toBe(false);
  expect(shell.openPath).not.toHaveBeenCalled();
  expect(await manager.install(() => true, permitQuit)).toBe(false);
  expect(shell.openPath).toHaveBeenCalledWith(downloaded);
  expect(manager.getState().status).toBe('ready');
  expect(permitQuit).not.toHaveBeenCalled();
  expect(app.quit).not.toHaveBeenCalled();
  expect(updater.install).not.toHaveBeenCalled();

  fs.writeFileSync(downloaded, 'changed');
  expect(await manager.install(() => true, permitQuit)).toBe(false);
  expect(manager.getState()).toMatchObject({ status: 'error', error: 'integrity' });
  expect(shell.openPath).toHaveBeenCalledTimes(1);
});

test('uses the saved full download, then cancels it and tries differential when a new release appears', async () => {
  const { manager, updater, file } = environment({ resumable: true });
  const directory = path.join(fixture, 'appimage-downloads');
  const identity = JSON.stringify(['2.10.0', file.url, file.size, file.sha512]);
  const partial = path.join(directory, createHash('sha256').update(identity).digest('hex') + '.part');
  fs.mkdirSync(directory);
  fs.writeFileSync(partial, '');
  let token;
  updater.downloadUpdate.mockImplementationOnce(cancellation => {
    token = cancellation;
    return new Promise((_, reject) => token.onCancel(() => reject(new Error('Cancelled'))));
  });
  manager.setBusy(false);
  await manager.check();
  const ongoing = manager.download();
  expect(updater.disableDifferentialDownload).toBe(true);
  await manager.check();
  expect(token.cancelled).toBe(false);
  updater.checkForUpdates.mockResolvedValue({
    isUpdateAvailable: true, updateInfo: { version: '2.11.0', files: [file] }
  });
  await manager.check();
  await ongoing;
  expect(token.cancelled).toBe(true);
  expect(fs.existsSync(partial)).toBe(false);
  expect(manager.getState()).toMatchObject({ status: 'available', version: '2.11.0' });
  await manager.download();
  expect(updater.disableDifferentialDownload).toBe(false);
});

test.each([
  ['linux', false], ['linux', true], ['win32', false], ['win32', true]
])('%s rechecks before retrying a full download (newer release: %s)', async (platform, newer) => {
  jest.useFakeTimers();
  const { manager, updater, downloaded, file, publish } = environment({ platform, automatic: true, resumable: true });
  const windows = platform === 'win32';
  const broken = async function* () {
    yield Buffer.from('n');
    throw new Error('net::ERR_CONNECTION_RESET');
  };
  updater.netSession = {
    fetch: jest.fn().mockResolvedValueOnce({ status: 200, headers: new Map([['content-length', '3']]), body: broken() })
      .mockResolvedValue(newer ? { status: 200, headers: new Map([['content-length', '3']]), body: [Buffer.from('new')] }
        : { status: 206, headers: new Map([['content-length', '2'], ['content-range', 'bytes 1-2/3']]), body: [Buffer.from('ew')] })
  };
  const downloadModes = [];
  updater.downloadUpdate.mockImplementation(async cancellationToken => {
    downloadModes.push(updater.disableDifferentialDownload);
    return [await updater.httpExecutor.download(`https://example.com/${file.url}`, downloaded, { cancellationToken })];
  });
  try {
    await manager.check();
    const failed = waitForStatus(publish, 'error');
    manager.setBusy(false);
    expect(await failed).toMatchObject({ error: 'network' });
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 10 * 60 * 1000);
    if (newer) updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true, updateInfo: { version: '2.11.0', files: [file] }
    });

    jest.advanceTimersByTime(10 * 60 * 1000 - 1);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    const ready = waitForStatus(publish, 'ready');
    jest.advanceTimersByTime(1);
    expect(await ready).toMatchObject({ version: newer ? '2.11.0' : '2.10.0' });
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(downloadModes).toEqual([windows, windows || !newer]);
    expect(updater.netSession.fetch.mock.calls[1][1].headers.Range).toBe(newer ? undefined : 'bytes=1-');
    expect(fs.readdirSync(path.join(fixture, windows ? 'nsis-downloads' : 'appimage-downloads'))).toEqual([]);
  } finally {
    manager.stop();
    jest.useRealTimers();
  }
});

test.each([
  [new Error('net::ERR_INTERNET_DISCONNECTED'), 2],
  [Object.assign(new Error('Insufficient space'), { code: 'ENOSPC' }), 1],
  [Object.assign(new Error('Bad checksum'), { code: 'ERR_CHECKSUM_MISMATCH' }), 1]
])('does not repeatedly short-retry full downloads after %s', async (error, checks) => {
  jest.useFakeTimers();
  const { manager, updater, downloaded, publish } = environment({ automatic: true, resumable: true });
  updater.netSession = { fetch: jest.fn().mockRejectedValue(error) };
  updater.downloadUpdate.mockImplementation(async cancellationToken => {
    return [await updater.httpExecutor.download('https://example.com/new.AppImage', downloaded, { cancellationToken })];
  });
  try {
    await manager.check();
    const failed = waitForStatus(publish, 'error');
    manager.setBusy(false);
    await failed;
    if (checks === 2) {
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 10 * 60 * 1000);
      const failedAgain = waitForStatus(publish, 'error');
      jest.advanceTimersByTime(10 * 60 * 1000);
      await failedAgain;
    }
    jest.advanceTimersByTime(10 * 60 * 1000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(checks);
  } finally {
    manager.stop();
    jest.useRealTimers();
  }
});

test('Windows builds without packaged update configuration still check official releases', async () => {
  const { manager, updater, net } = environment({ platform: 'win32', configured: false });
  net.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ tag_name: 'v2.10.0', assets: [{ name: 'AutoMeetingRecorder-2.10.0-win.exe' }] })
  });
  const signal = global.AbortSignal;
  global.AbortSignal = { timeout: jest.fn() };
  try {
    await manager.check();
  } finally {
    global.AbortSignal = signal;
  }
  expect(manager.getState()).toMatchObject({ mode: 'manual', status: 'available', version: '2.10.0' });
  expect(updater.checkForUpdates).not.toHaveBeenCalled();
});
