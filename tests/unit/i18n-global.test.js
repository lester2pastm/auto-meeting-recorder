describe('i18n global exposure', () => {
  beforeEach(() => {
    jest.resetModules();
    global.window = global.window || {};
    delete global.window.i18n;
  });

  test('attaches the shared i18n instance to window for non-CommonJS browser consumers', () => {
    const i18n = require('../../src/js/i18n');

    expect(global.window.i18n).toBe(i18n);
  });
});
