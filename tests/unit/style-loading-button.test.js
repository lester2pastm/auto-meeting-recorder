const fs = require('fs');
const path = require('path');

describe('loading button styles', () => {
  test('should define the loading button spinner rules only once', () => {
    const cssPath = path.resolve(__dirname, '../../src/css/style.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect((css.match(/\.btn-loading \.btn-content\s*\{/g) || [])).toHaveLength(1);
    expect((css.match(/\.btn-loading::after\s*\{/g) || [])).toHaveLength(1);
    expect((css.match(/\.btn-loading\.btn-danger::after\s*\{/g) || [])).toHaveLength(1);
  });
});
