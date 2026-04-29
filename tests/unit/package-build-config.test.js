const packageJson = require('../../package.json');

describe('Package build config', () => {
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
