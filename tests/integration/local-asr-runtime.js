const assert = require('assert/strict');
const { startLocalAsr } = require('../../electron/local-asr');

async function smoke() {
  const sampleRate = 16000;
  const job = startLocalAsr({ sampleRate });
  try {
    const firstWrite = job.write(Buffer.alloc(sampleRate * 4));
    const finished = job.finish();
    const ready = await job.ready;
    assert.equal(ready.success, true, ready.message);
    assert.equal(await firstWrite, true);
    const result = await finished;
    assert.equal(result.success, true, result.message);
    assert.equal(result.text, '');
    console.log('Bundled X-ASR loaded and decoded audio without API credentials.');
  } finally {
    job.cancel();
  }
}

smoke().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
