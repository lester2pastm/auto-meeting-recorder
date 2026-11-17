const path = require('node:path');
const { spawn } = require('node:child_process');
const { OnlineRecognizer } = require('sherpa-onnx-node/streaming-asr.js');

const [, , modelDir, inputRate, filePath] = process.argv;
const sampleRate = Number(inputRate);
let decoder;
let recognizer;
let stream;
let pcmRemainder = Buffer.alloc(0);
let lastPreview = '';
const segments = [];

function send(message) {
  if (process.connected) process.send(message);
}

function report(final = false) {
  const text = recognizer.getResult(stream).text.trim();
  if (final) {
    if (text) segments.push(text);
    lastPreview = '';
    if (text && !filePath) send({ type: 'text', text, final: true });
  } else if (!filePath && text !== lastPreview) {
    lastPreview = text;
    send({ type: 'text', text, final: false });
  }
}

function decode(final = false) {
  let decoded = false;
  while (recognizer.isReady(stream)) {
    recognizer.decode(stream);
    decoded = true;
    if (!final && recognizer.isEndpoint(stream)) {
      report(true);
      recognizer.reset(stream);
    }
  }
  if (final || (decoded && !filePath)) report(final);
}

function accept(chunk) {
  const pcm = pcmRemainder.length ? Buffer.concat([pcmRemainder, chunk]) : chunk;
  const end = pcm.length - pcm.length % Float32Array.BYTES_PER_ELEMENT;
  pcmRemainder = Buffer.from(pcm.subarray(end));
  if (end === 0) return;
  const samples = new Float32Array(Uint8Array.from(pcm.subarray(0, end)).buffer);
  stream.acceptWaveform({ samples, sampleRate });
  decode();
}

function finish() {
  // Flush the last 1.92-second chunk when the recording ends mid-utterance.
  stream.acceptWaveform({ samples: new Float32Array(Math.ceil(sampleRate * 2.4)), sampleRate });
  stream.inputFinished();
  decode(true);
  send({ type: 'done', text: segments.join('\n') });
}

async function transcribeFile() {
  decoder = spawn('ffmpeg', [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe',
    '-i', filePath, '-map', '0:a:0', '-ac', '1', '-ar', String(sampleRate),
    '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1'
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let diagnostic = '';
  decoder.stderr.on('data', (chunk) => { diagnostic = (diagnostic + chunk).slice(-4096); });
  const exit = new Promise((resolve) => {
    decoder.once('error', (error) => resolve(error.message));
    decoder.once('close', (code) => resolve(code === 0 ? '' : (diagnostic.trim() || 'FFmpeg exit ' + code)));
  });
  for await (const chunk of decoder.stdout) accept(chunk);
  const error = await exit;
  if (error) throw new Error(error);
  finish();
}

function fail(error) {
  send({ type: 'error', message: error.message });
}

process.on('disconnect', () => {
  decoder?.kill();
  process.exit();
});

try {
  recognizer = new OnlineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: path.join(modelDir, 'encoder.int8.onnx'),
        decoder: path.join(modelDir, 'decoder.onnx'),
        joiner: path.join(modelDir, 'joiner.int8.onnx')
      },
      tokens: path.join(modelDir, 'tokens.txt'),
      modelType: 'zipformer2',
      provider: 'cpu',
      numThreads: 1
    },
    enableEndpoint: true,
    // Keep silence-based endpoints and give continuous speech more context.
    rule3MinUtteranceLength: 45,
    decodingMethod: 'modified_beam_search',
    maxActivePaths: 2
  });
  if (!recognizer.handle) throw new Error('Could not create the X-ASR recognizer');
  stream = recognizer.createStream();
  send({ type: 'ready' });
  if (filePath) {
    transcribeFile().catch(fail);
  } else {
    process.on('message', (message) => {
      try {
        if (message.type === 'audio') {
          accept(message.chunk);
          send({ type: 'consumed', id: message.id });
        } else if (message.type === 'finish') {
          finish();
        }
      } catch (error) {
        fail(error);
      }
    });
  }
} catch (error) {
  fail(error);
}
