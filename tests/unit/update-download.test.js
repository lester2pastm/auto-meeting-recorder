const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');
const { runInThisContext } = require('vm');
global.TextDecoder ||= require('util').TextDecoder;
const { CancellationToken } = require('electron-updater');
const { createUpdateDownload } = require('../../electron/update-download');

const hash = data => createHash('sha512').update(data).digest('base64');
const release = (version, data) => ({
  version, available: true, url: `app-${version}.AppImage`, size: data.length, sha512: hash(data)
});
const original = release('2.8.5', 'abcdef');
const url = 'https://example.com/app.AppImage';
let root;
let destination;
let options;

function response(status, chunks = [], headers = {}, interrupted = false) {
  const values = async function* () {
    for (const chunk of chunks) yield Buffer.from(chunk);
    if (interrupted) throw new Error('Connection interrupted');
  };
  return {
    status, url,
    headers: { get: key => headers[key] ?? null },
    body: Object.assign(values(), { cancel: async () => {} })
  };
}

function downloader(fetch) {
  return createUpdateDownload({
    directory: path.join(root, 'parts'), fetch,
    verifyFile: async (file, digest) => {
      if (hash(fs.readFileSync(file)) !== digest) {
        throw Object.assign(new Error('Bad checksum'), { code: 'ERR_CHECKSUM_MISMATCH' });
      }
    }
  });
}

async function savePartial(candidate = original) {
  const client = downloader(jest.fn().mockResolvedValue(response(200, ['abc'], {}, true)));
  await expect(client.download(candidate, url, destination, options)).rejects.toThrow('Connection interrupted');
  expect(client.offset(candidate)).toBe(3);
  expect(fs.existsSync(destination)).toBe(false);
}

beforeAll(() => {
  global.AbortController = runInThisContext('AbortController');
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'amr-update-download-'));
  destination = path.join(root, 'finished.AppImage');
  options = { cancellationToken: new CancellationToken(), onProgress: jest.fn() };
});

afterEach(() => {
  options.cancellationToken.dispose();
  fs.rmSync(root, { recursive: true, force: true });
});

test('continues an interrupted full package after restarting the downloader', async () => {
  await savePartial();
  const fetch = jest.fn().mockResolvedValue(response(206, ['def'], { 'content-range': 'bytes 3-5/6', 'content-length': '3' }));
  const client = downloader(fetch);
  await client.discardExcept(original);
  expect(client.offset(original)).toBe(3);
  await client.download(original, url, destination, options);
  expect(fetch.mock.calls[0][1].headers.Range).toBe('bytes=3-');
  expect(options.onProgress).toHaveBeenCalledWith(expect.objectContaining({ percent: 50, transferred: 3 }));
  expect(fs.readFileSync(destination, 'utf8')).toBe('abcdef');
  expect(client.offset(original)).toBeNull();
});

test.each([
  release('2.8.6', 'ghijkl'),
  release('2.8.5', 'ghijkl')
])('removes old bytes when the release identity changes to %j', async next => {
  await savePartial();
  const client = downloader();
  await client.discardExcept(next);
  expect(client.offset(original)).toBeNull();
  expect(client.offset(next)).toBeNull();
});

test('remembers the full download route even if the connection fails before the first byte', async () => {
  const fetch = jest.fn().mockRejectedValue(new Error('Connection interrupted'));
  await expect(downloader(fetch).download(original, url, destination, options)).rejects.toThrow('Connection interrupted');
  expect(downloader().offset(original)).toBe(0);
});

test.each([
  [416, {}],
  [206, { 'content-range': 'bytes 2-5/6' }]
])('starts at zero when the requested range is unusable (%i)', async (status, headers) => {
  await savePartial();
  const fetch = jest.fn()
    .mockResolvedValueOnce(response(status, [], headers))
    .mockResolvedValueOnce(response(200, ['abcdef']));
  await downloader(fetch).download(original, url, destination, options);
  expect(fetch.mock.calls.map(([, request]) => request.headers.Range)).toEqual(['bytes=3-', undefined]);
  expect(fs.readFileSync(destination, 'utf8')).toBe('abcdef');
});

test('replaces previous bytes when the server ignores the range', async () => {
  await savePartial();
  const fetch = jest.fn().mockResolvedValue(response(200, ['abcdef']));
  await downloader(fetch).download(original, url, destination, options);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fs.readFileSync(destination, 'utf8')).toBe('abcdef');
});

test('discards a corrupted package after appending the remaining bytes', async () => {
  await savePartial();
  const fetch = jest.fn().mockResolvedValue(response(206, ['ghi'], { 'content-range': 'bytes 3-5/6' }));
  const client = downloader(fetch);
  await expect(client.download(original, url, destination, options)).rejects.toMatchObject({ code: 'ERR_CHECKSUM_MISMATCH' });
  expect(client.offset(original)).toBeNull();
  expect(fs.existsSync(destination)).toBe(false);
});
