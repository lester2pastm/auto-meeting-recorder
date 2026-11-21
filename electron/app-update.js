const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { load } = require('js-yaml');
const semver = require('semver');

const RELEASES = 'https://github.com/lester2pastm/auto-meeting-recorder/releases';
const LATEST = 'https://api.github.com/repos/lester2pastm/auto-meeting-recorder/releases/latest';
const INTERVAL = 4 * 60 * 60 * 1000;
const RETRY_DELAY = 10 * 60 * 1000;

function readUpdateConfig(resourcesPath) {
  try {
    return load(fs.readFileSync(path.join(resourcesPath, 'app-update.yml'), 'utf8')) || {};
  } catch {
    return {};
  }
}

function isNewStable(version, current) {
  return semver.valid(version) && !semver.prerelease(version) && semver.gt(version, current);
}

function sameCandidate(first, second) {
  return first?.version === second?.version && first?.url === second?.url
    && first?.size === second?.size && first?.sha512 === second?.sha512;
}

function isTransientNetworkError(error) {
  if (error.statusCode) return [408, 500, 502, 503, 504].includes(error.statusCode);
  const code = error.code || error.cause?.code;
  const chromiumCode = /net::(ERR_[A-Z_]+)/.exec(error.cause?.message || error.message)?.[1];
  return ['AbortError', 'TimeoutError'].includes(error.name)
    || ['EAI_AGAIN', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETDOWN', 'ENETUNREACH',
      'EHOSTUNREACH', 'ERR_STREAM_PREMATURE_CLOSE', 'UND_ERR_SOCKET', 'UPDATE_DOWNLOAD_INTERRUPTED'].includes(code)
    || ['ERR_FAILED', 'ERR_ABORTED', 'ERR_TIMED_OUT', 'ERR_CONNECTION_CLOSED', 'ERR_CONNECTION_RESET',
      'ERR_CONNECTION_REFUSED', 'ERR_CONNECTION_ABORTED', 'ERR_CONNECTION_TIMED_OUT', 'ERR_CONNECTION_FAILED',
      'ERR_INTERNET_DISCONNECTED', 'ERR_NETWORK_CHANGED', 'ERR_NAME_NOT_RESOLVED', 'ERR_ADDRESS_UNREACHABLE',
      'ERR_EMPTY_RESPONSE', 'ERR_CONTENT_LENGTH_MISMATCH', 'ERR_INCOMPLETE_CHUNKED_ENCODING'].includes(chromiumCode);
}

async function checkRelease(net, current, platform, arch, image) {
  const response = await net.fetch(LATEST, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Object.assign(new Error('Release check failed'), { statusCode: response.status });
  const release = await response.json();
  const version = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : null;
  if (release.draft || release.prerelease || !isNewStable(version, current)) return null;
  const suffix = {
    linux: image ? (arch === 'x64' ? '-linux-x86_64.AppImage' : '-linux-arm64.AppImage')
      : (arch === 'x64' ? '-linux-amd64.deb' : '-linux-arm64.deb'),
    darwin: '-mac.dmg',
    win32: '-win.exe'
  }[platform];
  const available = Boolean(suffix && Array.isArray(release.assets)
    && release.assets.some(asset => asset?.name === `AutoMeetingRecorder-${version}${suffix}`));
  return { version, available };
}

async function verifyFile(file, sha512) {
  const hash = createHash('sha512');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  if (hash.digest('base64') !== sha512) throw Object.assign(new Error('Invalid update checksum'), { code: 'ERR_CHECKSUM_MISMATCH' });
}

function createAppUpdate({ app, net, shell, store, publish, platform = process.platform,
  arch = process.arch, imagePath = process.env.APPIMAGE, resourcesPath = process.resourcesPath,
  getUpdater = mode => {
    const { AppImageUpdater, NsisUpdater } = require('electron-updater');
    return mode === 'appimage' ? new AppImageUpdater() : new NsisUpdater();
  } }) {
  const config = app.isPackaged ? readUpdateConfig(resourcesPath) : {};
  const image = platform === 'linux' && path.isAbsolute(imagePath || '') ? imagePath : null;
  const publishers = [].concat(config.publisherName || []).filter(name => typeof name === 'string' && name.trim());
  const mode = !app.isPackaged ? 'disabled' : config.provider && image ? 'appimage'
    : config.provider && platform === 'win32' && arch === 'x64' ? 'nsis' : 'manual';
  const updater = ['appimage', 'nsis'].includes(mode) ? getUpdater(mode) : null;
  const manualInstall = mode === 'nsis' && !publishers.length;
  const current = app.getVersion();
  let state = { mode, manualInstall, status: 'idle', automatic: store.get('automaticUpdates', true), busy: true };
  let candidate;
  let downloaded;
  let checking;
  let activeDownload;
  let timer;
  let retried = false;
  let downloadRetry = 'unused';
  let stopped = false;
  const fullDownload = updater?.httpExecutor && require('./update-download').createUpdateDownload({
    directory: path.join(app.getPath('userData'), `${mode}-downloads`),
    fetch: (url, options) => updater.netSession.fetch(url, options),
    verifyFile
  });

  if (fullDownload) {
    // The pinned updater uses this method for full downloads. NSIS web installers are disabled below.
    const downloadFull = updater.httpExecutor.download.bind(updater.httpExecutor);
    updater.httpExecutor.download = (url, destination, options) => {
      if (activeDownload) activeDownload.full = true;
      return fullDownload.download(activeDownload?.candidate, url, destination, options, downloadFull);
    };
  }

  function set(patch) {
    state = { ...state, ...patch };
    publish(state);
  }

  function schedule(delay) {
    clearTimeout(timer);
    if (stopped || !state.automatic || mode === 'disabled') return;
    const retryDownload = downloadRetry === 'scheduled';
    timer = setTimeout(() => {
      if (retryDownload) downloadRetry = 'used';
      else if (delay === INTERVAL) downloadRetry = 'unused';
      void check();
    }, retryDownload ? Math.min(delay, RETRY_DELAY) : delay);
  }

  function failure(error) {
    if (error.statusCode === 403 || error.statusCode === 429) return 'limited';
    if (error.code === 'ENOSPC') return 'space';
    if (error.code === 'ERR_UPDATER_INVALID_SIGNATURE' || error.code === 'ERR_CHECKSUM_MISMATCH') return 'integrity';
    if (error.statusCode === 404 || error.code === 'ENOENT' || error.code?.includes('CHANNEL_FILE')) return 'feed';
    return 'network';
  }

  async function readCandidate() {
    if (!updater) return checkRelease(net, current, platform, arch, image);
    const result = await updater.checkForUpdates();
    const info = result?.updateInfo;
    if (!result?.isUpdateAvailable || !isNewStable(info?.version, current)) return null;
    const suffix = mode === 'appimage' ? '.appimage' : '.exe';
    const file = info.files?.find(asset => asset.url.toLowerCase().endsWith(suffix));
    if (!file?.sha512) return { version: info.version, available: false };
    return { version: info.version, available: true, sha512: file.sha512, url: file.url, size: file.size };
  }

  async function selectCandidate(next) {
    const pending = activeDownload;
    const obsolete = downloaded;
    if (!sameCandidate(candidate, next)) downloadRetry = 'unused';
    candidate = next;
    downloaded = null;
    if (pending) {
      pending.token.cancel();
      await pending.promise;
    }
    if (fullDownload) {
      await fullDownload.discardExcept(next);
      if (obsolete) await fs.promises.rm(obsolete, { force: true });
    }
  }

  if (updater) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    updater.disableDifferentialDownload = mode === 'nsis';
    updater.on('error', () => {});
    updater.on('download-progress', ({ percent }) => {
      if (state.status === 'downloading' && activeDownload?.candidate === candidate) {
        set({ progress: Math.round(percent) });
      }
    });
  }

  function check() {
    if (stopped || mode === 'disabled') return;
    if (checking) return checking;
    if ((!fullDownload && activeDownload) || ['ready', 'installing'].includes(state.status)) {
      schedule(INTERVAL);
      return;
    }
    const pending = activeDownload;
    if (!pending) set({ status: 'checking', version: null, error: null });
    checking = readCandidate().then(async result => {
      if (stopped) return;
      retried = false;
      if (!pending || !sameCandidate(pending.candidate, result)) {
        await selectCandidate(result);
        set({ status: !result ? 'current' : result.available ? 'available' : 'unavailable', version: result?.version });
      }
      schedule(INTERVAL);
    }).catch(error => {
      const reason = failure(error);
      if (!pending || pending.candidate !== candidate) set({ status: 'error', error: reason });
      schedule(reason === 'network' && !retried ? RETRY_DELAY : INTERVAL);
      retried = !retried;
    }).finally(() => {
      checking = null;
      maybeDownload();
    });
    return checking;
  }

  function download() {
    if (stopped || !updater || activeDownload || state.status !== 'available' || state.busy) return;
    if (downloadRetry === 'scheduled') {
      downloadRetry = 'used';
      schedule(INTERVAL);
    }
    const { CancellationToken } = require('electron-updater');
    const attempt = { candidate, token: new CancellationToken() };
    activeDownload = attempt;
    attempt.promise = (async () => {
      try {
        const offset = fullDownload ? fullDownload.offset(attempt.candidate) : null;
        updater.disableDifferentialDownload = mode === 'nsis' || offset !== null;
        set({ status: 'downloading', progress: offset ? Math.floor(offset / attempt.candidate.size * 100) : 0, error: null });
        const [file] = await updater.downloadUpdate(attempt.token);
        if (candidate !== attempt.candidate) {
          if (fullDownload && file) await fs.promises.rm(file, { force: true });
          return;
        }
        downloaded = file;
        set({ status: 'ready' });
      } catch (error) {
        if (!stopped && candidate === attempt.candidate) {
          const reason = failure(error);
          set({ status: 'error', error: reason });
          if (attempt.full && state.automatic && downloadRetry === 'unused' && isTransientNetworkError(error)) {
            downloadRetry = 'scheduled';
            schedule(RETRY_DELAY);
          }
        }
      } finally {
        attempt.token.dispose();
        activeDownload = null;
      }
    })();
    return attempt.promise;
  }

  function maybeDownload() {
    if (state.automatic && !checking) void download();
  }

  async function install(canQuit, permitQuit) {
    if (!updater || checking || state.status !== 'ready' || state.busy || !canQuit()) return false;
    const expected = candidate;
    let stage;
    let handedOff = false;
    let confirmed = false;
    set({ status: 'installing', error: null });
    try {
      const fresh = await readCandidate();
      confirmed = true;
      if (!fresh || !sameCandidate(fresh, expected)) {
        await selectCandidate(fresh);
        set({ status: fresh?.available ? 'available' : fresh ? 'unavailable' : 'current', version: fresh?.version });
        maybeDownload();
        return false;
      }
      if (image) {
        // Stage beside the running image so a failed copy cannot remove the old app.
        const target = fs.realpathSync(image);
        stage = await fs.promises.mkdtemp(path.join(path.dirname(target), '.amr-update-'));
        const staged = path.join(stage, 'app.AppImage');
        await fs.promises.copyFile(downloaded, staged);
        await verifyFile(staged, expected.sha512);
        await fs.promises.chmod(staged, fs.statSync(target).mode & 0o777);
        if (state.busy || !canQuit()) return false;
        fs.renameSync(staged, target);
        app.relaunch({ execPath: image, args: process.argv.slice(1) });
      } else {
        await verifyFile(downloaded, expected.sha512);
        if (manualInstall) {
          if (state.busy || !canQuit()) return false;
          if (await shell.openPath(downloaded)) set({ status: 'ready', error: 'install' });
          return false;
        }
        if (await updater.verifyUpdateCodeSignature(publishers, downloaded) !== null) {
          throw Object.assign(new Error('Invalid publisher'), { code: 'ERR_UPDATER_INVALID_SIGNATURE' });
        }
        if (state.busy || !canQuit()) return false;
        if (!updater.install(true, true)) {
          set({ status: 'ready', error: 'install' });
          return false;
        }
      }
      permitQuit();
      handedOff = true;
      app.quit();
      return true;
    } catch (error) {
      const reason = failure(error);
      const message = !confirmed && !error.statusCode && isTransientNetworkError(error) ? 'installNetwork'
        : ['network', 'feed'].includes(reason) ? 'install' : reason;
      set({ status: reason === 'integrity' ? 'error' : 'ready', error: message });
      return false;
    } finally {
      if (stage) await fs.promises.rm(stage, { recursive: true, force: true }).catch(() => {});
      if (!handedOff && state.status === 'installing') set({ status: 'ready' });
    }
  }

  return {
    check, download, install,
    getState: () => state,
    start: () => schedule(5000),
    stop() {
      stopped = true;
      clearTimeout(timer);
      activeDownload?.token.cancel();
    },
    openRelease: () => mode !== 'disabled' && shell.openExternal(RELEASES),
    setBusy(busy) {
      if (typeof busy === 'boolean' && busy !== state.busy) set({ busy });
      maybeDownload();
    },
    setAutomatic(automatic) {
      if (typeof automatic !== 'boolean' || mode === 'disabled') return;
      store.set('automaticUpdates', automatic);
      set({ automatic });
      schedule(5000);
      maybeDownload();
    }
  };
}

module.exports = { createAppUpdate };
