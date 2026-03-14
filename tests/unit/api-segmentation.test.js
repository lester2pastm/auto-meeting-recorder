describe('API segmentation helpers', () => {
  let api;

  beforeEach(() => {
    jest.resetModules();
    global.window = global.window || {};
    api = require('../../src/js/api');
  });

  test('calculateSegmentCount should consider both size and duration limits', () => {
    expect(typeof api.calculateSegmentCount).toBe('function');
    expect(api.calculateSegmentCount(64.82, 70.58)).toBe(2);
    expect(api.calculateSegmentCount(10, 121)).toBe(3);
  });
});
