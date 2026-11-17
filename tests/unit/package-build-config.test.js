const packageJson = require('../../package.json');

describe('Package build config', () => {
  test.each(['win', 'linux'])('bundles the offline model and native worker on %s', (platform) => {
    expect(packageJson.build.beforePack).toBe('./scripts/prepare-local-asr.js');
    expect(packageJson.build[platform].extraResources).toContainEqual({
      from: 'assets/local-asr/x-asr', to: 'local-asr/x-asr'
    });
    expect(packageJson.build.asarUnpack).toEqual(expect.arrayContaining([
      'electron/local-asr-worker.js', 'node_modules/sherpa-onnx-*/**/*'
    ]));
  });

  test('builds both AppImage and deb for Linux', () => {
    expect(packageJson.build.linux.target).toEqual(
      expect.arrayContaining(['AppImage', 'deb'])
    );
  });

  test('uses a deb artifact name that includes architecture', () => {
    expect(packageJson.build.linux.artifactName).toBe(
      '${productName}-${version}-linux-${arch}.${ext}'
    );
  });

  test('provides author metadata required for deb maintainer fields', () => {
    expect(packageJson.author).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        email: expect.stringContaining('@')
      })
    );
  });
});
