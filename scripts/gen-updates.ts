// Emits dist/updates.json — Mozilla's update manifest for the current
// package.json version. Run with `make updates` (Node strips the types).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildUpdatesManifest } from '../lib/dist.ts';

const pkgRaw: unknown = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
if (
  typeof pkgRaw !== 'object' ||
  pkgRaw === null ||
  !('version' in pkgRaw) ||
  typeof pkgRaw.version !== 'string'
) {
  throw new Error('package.json has no string version field');
}

const manifest = buildUpdatesManifest(pkgRaw.version);
const outDir = new URL('../dist/', import.meta.url);
await mkdir(outDir, { recursive: true });
const outFile = new URL('updates.json', outDir);
await writeFile(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${outFile.pathname} for version ${pkgRaw.version}`);
