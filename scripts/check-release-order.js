const assert = require('assert/strict');
const fs = require('fs');
const semver = require('semver');

const tag = process.argv[2];
assert.match(tag, /^v\d+\.\d+\.\d+$/);
assert.ok(semver.valid(tag), `Invalid release tag ${tag}`);

const pages = JSON.parse(fs.readFileSync(0, 'utf8'));
assert.ok(Array.isArray(pages) && pages.length && pages.every(Array.isArray), 'Expected GitHub release pages');

for (const release of pages.flat()) {
  if (release.draft || release.prerelease) continue;
  const published = semver.valid(release.tag_name);
  if (published && !semver.prerelease(published) && semver.gte(published, tag)) {
    throw new Error(`Cannot publish ${tag} as Latest because ${release.tag_name} is already published`);
  }
}
