const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

const archiveName = 'sherpa-onnx-x-asr-1920ms-streaming-zipformer-transducer-zh-en-punct-int8-2026-06-05';
const downloadUrl = 'https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/assets/460926869';
const archiveSha256 = 'fdae310438a22e4acba3ae8280320d25365e66da269fcac2a906c98c51e705e4';
const modelFiles = ['encoder.int8.onnx', 'decoder.onnx', 'joiner.int8.onnx', 'tokens.txt'];
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets', 'local-asr');
const destination = path.join(assets, 'x-asr');
const run = promisify(execFile);

async function prepared() {
  try {
    if ((await fs.readFile(path.join(destination, 'model.sha256'), 'utf8')).trim() !== archiveSha256) return false;
    const files = await Promise.all(modelFiles.map((name) => fs.stat(path.join(destination, name))));
    return files.every((file) => file.isFile() && file.size > 0);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function prepareLocalAsr() {
  if (await prepared()) return;
  await fs.mkdir(assets, { recursive: true });
  const scratch = await fs.mkdtemp(path.join(assets, 'download-'));
  try {
    const cachedArchive = path.join(assets, archiveName + '.tar.bz2');
    const cached = await fs.access(cachedArchive).then(() => true, () => false);
    const archive = cached ? cachedArchive : path.join(scratch, 'model.tar.bz2');
    const extracted = path.join(scratch, 'x-asr');
    if (!cached) {
      console.log('Downloading the bundled X-ASR speech recognition model…');
      await run('curl', ['-fLsS', '--retry', '3', '--max-time', '600',
        '-H', 'Accept: application/octet-stream', '-o', archive, downloadUrl]);
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    if (hash.digest('hex') !== archiveSha256) throw new Error('X-ASR archive checksum mismatch');

    await fs.mkdir(extracted);
    await run('tar', [
      '-xf', archive, '-C', extracted, '--strip-components', '1',
      ...modelFiles.map((name) => archiveName + '/' + name)
    ]);
    await fs.copyFile(path.join(root, 'assets', 'x-asr-notice.txt'), path.join(extracted, 'NOTICE.txt'));
    await run('curl', ['-fLsS', '--max-time', '30', '-o', path.join(extracted, 'LICENSE.txt'),
      'https://www.apache.org/licenses/LICENSE-2.0.txt']);
    await fs.writeFile(path.join(extracted, 'model.sha256'), archiveSha256 + '\n');
    if (await prepared()) return;
    await fs.rm(destination, { recursive: true, force: true });
    try {
      await fs.rename(extracted, destination);
    } catch (error) {
      if (!(await prepared())) throw error;
    }
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }
}

if (require.main === module && ['linux', 'win32'].includes(process.platform)) {
  prepareLocalAsr().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = async ({ electronPlatformName, arch }) => {
  if (!['linux', 'win32'].includes(electronPlatformName)) return;
  const { Arch } = require('builder-util');
  const platform = electronPlatformName === 'win32' ? 'win' : 'linux';
  const nativePackage = 'sherpa-onnx-' + platform + '-' + Arch[arch];
  try {
    require.resolve(nativePackage + '/package.json');
  } catch {
    throw new Error('Missing ' + nativePackage + '. Install dependencies for the target OS and architecture.');
  }
  await prepareLocalAsr();
};
