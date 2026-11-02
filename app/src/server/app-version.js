// The app version: a short hash of the files the browser runs (every file under public/ except fonts/), so the
// service worker's cache changes with the app. Read once at startup.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const VERSION_LENGTH = 12;
const EXCLUDED_TOP_LEVEL_DIRECTORY_NAME = 'fonts';

// The first 12 hex characters of a sha256 over the path and the content of each file, sorted by path.
export function computeAppVersion(publicDirectory) {
  const hash = crypto.createHash('sha256');
  for (const relativePath of listVersionedFilePaths(publicDirectory)) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(publicDirectory, relativePath)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, VERSION_LENGTH);
}

// The relative paths (with / separators) of the files under the directory, sorted, without the top-level fonts.
function listVersionedFilePaths(publicDirectory) {
  const relativePaths = [];
  const visitDirectory = relativeDirectory => {
    const entries = fs.readdirSync(path.join(publicDirectory, relativeDirectory), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (relativePath !== EXCLUDED_TOP_LEVEL_DIRECTORY_NAME) visitDirectory(relativePath);
      } else if (entry.isFile()) {
        relativePaths.push(relativePath);
      }
    }
  };
  visitDirectory('');
  return relativePaths.sort();
}
