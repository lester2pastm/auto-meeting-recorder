const fs = require('fs');
const path = require('path');

describe('GitHub workflow Linux dependencies', () => {
  test('ubuntu-22.04 arm64 build uses libasound2 instead of libasound2t64', () => {
    const workflowPath = path.resolve(__dirname, '../../.github/workflows/build.yml');
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('build-linux-arm64:');
    expect(workflow).toContain('runs-on: ubuntu-22.04');
    expect(workflow).toContain('libasound2 ');
    expect(workflow).not.toContain('libasound2t64');
  });
});
