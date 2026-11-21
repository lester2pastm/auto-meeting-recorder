const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { setTimeout, clearTimeout } = require('timers');

const WRITE_PART = fs.constants.O_WRONLY | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW || 0);

function createUpdateDownload({ directory, fetch, verifyFile }) {
  const files = fs.promises;

  function partialPath(candidate) {
    if (!candidate?.available || !Number.isSafeInteger(candidate.size) || candidate.size <= 0) return null;
    const identity = JSON.stringify([candidate.version, candidate.url, candidate.size, candidate.sha512]);
    const key = createHash('sha256').update(identity).digest('hex');
    return path.join(directory, `${key}.part`);
  }

  function offset(candidate) {
    const partial = partialPath(candidate);
    if (!partial) return null;
    try {
      const entry = fs.lstatSync(partial);
      return entry.isFile() && entry.size <= candidate.size ? entry.size : null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function discardExcept(candidate) {
    const keep = partialPath(candidate);
    const entries = await files.readdir(directory).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of entries) {
      const file = path.join(directory, entry);
      if (/^[a-f0-9]{64}\.part$/.test(entry) && file !== keep) await files.rm(file, { force: true });
    }
  }

  async function download(candidate, url, destination, options, fallback) {
    const partial = partialPath(candidate);
    if (!partial) return fallback(url, destination, options);
    const source = new URL(url);
    const local = source.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname);
    if (source.protocol !== 'https:' && !local) throw new Error('Invalid update download URL');

    const controller = new AbortController();
    const abort = () => controller.abort();
    const token = options.cancellationToken;
    token.onCancel(abort);
    try {
      controller.signal.throwIfAborted();
      await files.mkdir(directory, { recursive: true, mode: 0o700 });
      let written = offset(candidate);
      if (written === null) {
        // Record that full download was selected even if the connection fails before the first byte.
        const marker = await files.open(partial, WRITE_PART | fs.constants.O_TRUNC, 0o600);
        await marker.close();
        written = 0;
      }
      let percent = -1;
      const size = candidate.size;
      function progress() {
        const next = Math.floor(written / size * 100);
        if (percent === next) return;
        percent = next;
        options.onProgress?.({ percent, total: size, transferred: written });
      }

      if (written < size) {
        const timeout = setTimeout(abort, 60000);
        const request = async start => {
          timeout.refresh();
          const headers = { ...options.headers, ...(start ? { Range: `bytes=${start}-` } : {}) };
          const response = await fetch(source.href, { headers, signal: controller.signal });
          if (response.url && !local && new URL(response.url).protocol !== 'https:') {
            await response.body?.cancel();
            throw new Error('Invalid update download redirect');
          }
          return response;
        };
        try {
          let response = await request(written);
          if (written && (response.status === 416 ||
            (response.status === 206 && response.headers.get('content-range') !== `bytes ${written}-${size - 1}/${size}`))) {
            await response.body?.cancel();
            written = 0;
            response = await request(0);
          }
          if (response.status === 200) written = 0;
          else if (!written || response.status !== 206) {
            await response.body?.cancel();
            throw Object.assign(new Error('Update download failed'), { statusCode: response.status });
          }
          const length = response.headers.get('content-length');
          if (!response.body || (length !== null && Number(length) !== size - written)) {
            await response.body?.cancel();
            throw new Error('Unexpected update download size');
          }
          const file = await files.open(partial, WRITE_PART | (written ? fs.constants.O_APPEND : fs.constants.O_TRUNC), 0o600);
          try {
            progress();
            for await (const chunk of response.body) {
              timeout.refresh();
              controller.signal.throwIfAborted();
              if (written + chunk.byteLength > size) throw new Error('Update download exceeds expected size');
              await file.writeFile(chunk);
              written += chunk.byteLength;
              progress();
            }
          } finally {
            await file.close();
          }
          if (written !== size) {
            throw Object.assign(new Error('Incomplete update download'), { code: 'UPDATE_DOWNLOAD_INTERRUPTED' });
          }
        } finally {
          clearTimeout(timeout);
        }
      }

      await verifyFile(partial, candidate.sha512);
      controller.signal.throwIfAborted();
      try {
        await files.rename(partial, destination);
      } catch (error) {
        if (error.code !== 'EXDEV') throw error;
        await files.copyFile(partial, destination);
        controller.signal.throwIfAborted();
        await files.rm(partial);
      }
      return destination;
    } catch (error) {
      if (error.code === 'ERR_CHECKSUM_MISMATCH') await files.rm(partial, { force: true });
      throw error;
    } finally {
      abort();
      token.removeListener('cancel', abort);
    }
  }

  return { offset, discardExcept, download };
}

module.exports = { createUpdateDownload };
