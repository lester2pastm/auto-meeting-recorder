const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { load } = require('js-yaml');
const { version } = require('../package.json');

async function verifyManifest(directory, name, artifact, embeddedBlockMap) {
  const manifest = load(fs.readFileSync(path.join(directory, name), 'utf8'));
  assert.equal(manifest.version, version);
  assert.equal(manifest.files.length, 1);
  const [file] = manifest.files;
  assert.equal(file.url, artifact);
  const artifactPath = path.join(directory, artifact);
  const stat = fs.statSync(artifactPath);
  assert.equal(file.size, stat.size);
  if (embeddedBlockMap) {
    assert.ok(Number.isInteger(file.blockMapSize) && file.blockMapSize > 0 && file.blockMapSize + 4 < stat.size);
    const footer = Buffer.alloc(4);
    const handle = await fs.promises.open(artifactPath, 'r');
    try {
      const { bytesRead } = await handle.read(footer, 0, 4, stat.size - 4);
      assert.equal(bytesRead, 4);
      assert.equal(footer.readUInt32BE(), file.blockMapSize);
    } finally {
      await handle.close();
    }
  }
  const hash = createHash('sha512');
  for await (const chunk of fs.createReadStream(artifactPath)) hash.update(chunk);
  assert.equal(file.sha512, hash.digest('base64'));
  console.log(`Verified ${name} → ${artifact}`);
}

async function main() {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(process.argv[2], `v${version}`);
  const artifactNames = new Set();
  for (const directory of ['windows-installer', 'macos-installer', 'linux-x64-installer', 'linux-arm64-installer']) {
    for (const name of fs.readdirSync(path.join('artifacts', directory))) {
      assert.ok(!artifactNames.has(name), `Duplicate release asset ${name}`);
      artifactNames.add(name);
    }
  }
  const product = `AutoMeetingRecorder-${version}`;
  for (const name of [`${product}-win.exe`, `${product}-mac.dmg`, `${product}-linux-amd64.deb`, `${product}-linux-arm64.deb`]) {
    assert.ok(artifactNames.has(name), `Missing release asset ${name}`);
  }
  await verifyManifest('artifacts/linux-x64-installer', 'latest-linux.yml', `${product}-linux-x86_64.AppImage`, true);
  await verifyManifest('artifacts/linux-arm64-installer', 'latest-linux-arm64.yml', `${product}-linux-arm64.AppImage`, true);
  if (artifactNames.has('latest.yml')) {
    await verifyManifest('artifacts/windows-installer', 'latest.yml', `${product}-win.exe`, false);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
