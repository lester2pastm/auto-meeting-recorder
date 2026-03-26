const path = require('path');

function normalizePath(targetPath) {
  return path.normalize(path.resolve(targetPath));
}

function isPathInside(parentPath, candidatePath) {
  const normalizedParent = normalizePath(parentPath);
  const normalizedCandidate = normalizePath(candidatePath);
  const relativePath = path.relative(normalizedParent, normalizedCandidate);

  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function resolveManagedAudioPath(audioDir, filePathOrName) {
  if (!filePathOrName || typeof filePathOrName !== 'string') {
    throw new Error('Invalid file path');
  }

  const candidatePath = path.isAbsolute(filePathOrName)
    ? filePathOrName
    : path.join(audioDir, filePathOrName);

  const normalizedCandidate = normalizePath(candidatePath);
  if (!isPathInside(audioDir, normalizedCandidate)) {
    throw new Error('Access denied');
  }

  return normalizedCandidate;
}

function createManagedSplitOutputDir(audioDir, sourcePath, timestamp = Date.now()) {
  const sourceName = path.basename(sourcePath, path.extname(sourcePath));
  return path.join(audioDir, 'segments', `${sourceName}_segments_${timestamp}`);
}

module.exports = {
  isPathInside,
  resolveManagedAudioPath,
  createManagedSplitOutputDir
};
