const path = require('path');

const {
  isPathInside,
  resolveManagedAudioPath,
  createManagedSplitOutputDir
} = require('../../electron/managed-paths');

describe('Managed path guards', () => {
  const audioDir = path.join(path.sep, 'app', 'audio_files');

  test('accepts absolute audio path inside managed audio directory', () => {
    const target = path.join(audioDir, '2026-03-26_10-00-00.webm');

    expect(resolveManagedAudioPath(audioDir, target)).toBe(target);
  });

  test('accepts relative audio filename and resolves it inside managed audio directory', () => {
    expect(resolveManagedAudioPath(audioDir, 'clip.webm')).toBe(
      path.join(audioDir, 'clip.webm')
    );
  });

  test('rejects traversal outside managed audio directory', () => {
    expect(() => resolveManagedAudioPath(audioDir, '../secret.txt')).toThrow('Access denied');
    expect(() => resolveManagedAudioPath(audioDir, path.join(path.sep, 'tmp', 'secret.txt'))).toThrow('Access denied');
  });

  test('correctly detects nested managed paths', () => {
    expect(isPathInside(audioDir, path.join(audioDir, 'segments', 'part_001.webm'))).toBe(true);
    expect(isPathInside(audioDir, path.join(path.sep, 'tmp', 'part_001.webm'))).toBe(false);
  });

  test('creates split output directories under the managed audio directory', () => {
    const targetDir = createManagedSplitOutputDir(audioDir, path.join(path.sep, 'Users', 'me', 'Desktop', 'meeting.wav'), 12345);

    expect(targetDir).toBe(path.join(audioDir, 'segments', 'meeting_segments_12345'));
    expect(isPathInside(audioDir, targetDir)).toBe(true);
  });
});
