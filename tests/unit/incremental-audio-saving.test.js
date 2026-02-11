const fs = require('fs');
const path = require('path');

describe('Incremental Audio Saving', () => {
  const testDir = path.join(__dirname, '..', 'temp-test');
  const testFile = path.join(testDir, 'test_append.webm');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('应该能够追加音频数据到文件', () => {
    const chunk1 = Buffer.from([0x01, 0x02, 0x03]);
    const chunk2 = Buffer.from([0x04, 0x05, 0x06]);

    fs.appendFileSync(testFile, chunk1);
    fs.appendFileSync(testFile, chunk2);

    const result = fs.readFileSync(testFile);
    expect(result).toEqual(Buffer.concat([chunk1, chunk2]));
    expect(result.length).toBe(6);
  });

  test('多次追加后文件大小应该正确', () => {
    const chunkSize = 100 * 1024;
    const chunkCount = 10;

    for (let i = 0; i < chunkCount; i++) {
      const chunk = Buffer.alloc(chunkSize, i);
      fs.appendFileSync(testFile, chunk);
    }

    const stats = fs.statSync(testFile);
    expect(stats.size).toBe(chunkSize * chunkCount);
  });

  test('追加到不存在的文件应该创建文件', () => {
    const chunk = Buffer.from([0x01, 0x02, 0x03]);
    const newFile = path.join(testDir, 'new_file.webm');

    fs.appendFileSync(newFile, chunk);

    expect(fs.existsSync(newFile)).toBe(true);
    const result = fs.readFileSync(newFile);
    expect(result).toEqual(chunk);

    fs.unlinkSync(newFile);
  });
});
