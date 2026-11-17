const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const files = ['encoder.int8.onnx', 'decoder.onnx', 'joiner.int8.onnx', 'tokens.txt'];
const supported = ['linux', 'win32'].includes(process.platform) && ['x64', 'arm64'].includes(process.arch);
const failure = (message) => ({ success: false, message });

function unpacked(file) {
  return file.replace(/\.asar(?=[\\/])/, '.asar.unpacked');
}

function startLocalAsr({ resourcesPath, sampleRate, filePath = '', onText = () => {} }) {
  if (!supported) throw new Error('Local speech recognition is unavailable on this platform');
  const modelDir = resourcesPath
    ? path.join(resourcesPath, 'local-asr', 'x-asr')
    : path.resolve(__dirname, '..', 'assets', 'local-asr', 'x-asr');
  if (!files.every((file) => fs.existsSync(path.join(modelDir, file)))) {
    throw new Error('找不到内置 X-ASR 模型 / Bundled X-ASR model is missing');
  }

  const nativePackage = 'sherpa-onnx-' + (process.platform === 'win32' ? 'win' : 'linux') + '-' + process.arch;
  const nativeDir = unpacked(path.dirname(require.resolve(nativePackage + '/package.json')));
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  if (process.platform === 'linux') {
    env.LD_LIBRARY_PATH = [nativeDir, env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter);
  }
  const child = fork(unpacked(path.join(__dirname, 'local-asr-worker.js')), [
    modelDir, String(sampleRate), filePath
  ], { env, serialization: 'advanced', stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });

  let resolveReady;
  let resolveResult;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const result = new Promise((resolve) => { resolveResult = resolve; });
  const pending = new Map();
  let nextId = 0;
  let buffered = 0;
  let workerReady = false;
  let settled = false;
  let stderr = '';
  const startup = setTimeout(() => settle(failure('X-ASR initialization timed out')), 15000);

  function settle(outcome) {
    if (settled) return;
    settled = true;
    clearTimeout(startup);
    resolveReady(outcome);
    resolveResult(outcome);
    for (const { resolve } of pending.values()) resolve(false);
    pending.clear();
    if (child.connected) child.disconnect();
    if (!outcome.success && child.exitCode === null) {
      const stop = setTimeout(() => child.kill(), 2000);
      stop.unref();
      child.once('exit', () => clearTimeout(stop));
    }
  }

  function send(message) {
    if (settled) return;
    if (!workerReady) {
      // Keep the first audio chunks in order while the model initializes.
      ready.then((outcome) => {
        if (outcome.success) send(message);
      });
      return;
    }
    if (child.connected) {
      child.send(message, (error) => {
        if (error) settle(failure(error.message));
      });
    }
  }

  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4096); });
  child.on('error', (error) => settle(failure(error.message)));
  child.on('exit', (code) => settle(failure(stderr.trim() || 'X-ASR worker exited: ' + code)));
  child.on('message', (message) => {
    if (settled) return;
    if (message.type === 'ready') {
      workerReady = true;
      clearTimeout(startup);
      resolveReady({ success: true });
    } else if (message.type === 'text') {
      onText({ text: message.text, final: message.final });
    } else if (message.type === 'consumed') {
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        buffered -= entry.bytes;
        entry.resolve(true);
      }
    } else if (message.type === 'done') {
      settle({ success: true, text: message.text });
    } else if (message.type === 'error') {
      settle(failure(message.message));
    }
  });

  return {
    ready,
    result,
    write(chunk) {
      if (settled) return Promise.resolve(false);
      buffered += chunk.length;
      if (buffered > sampleRate * 4 * 8) {
        settle(failure('X-ASR could not keep up with live audio'));
        return Promise.resolve(false);
      }
      const id = ++nextId;
      return new Promise((resolve) => {
        pending.set(id, { resolve, bytes: chunk.length });
        send({ type: 'audio', id, chunk });
      });
    },
    finish() {
      send({ type: 'finish' });
      const timeout = setTimeout(() => settle(failure('X-ASR did not finish the audio stream')), 15000);
      return result.finally(() => clearTimeout(timeout));
    },
    cancel() { settle(failure('Local speech recognition cancelled')); }
  };
}

module.exports = { startLocalAsr, supported };
