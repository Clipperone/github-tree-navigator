/**
 * Reads the version from package.json and writes it into manifest.json.
 * Invoked automatically by the npm `version` lifecycle hook so that
 * both files always stay in sync after running `npm version patch|minor|major`.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const pkg      = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

manifest.version = pkg.version;
writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

console.log(`[sync-version] manifest.json version → ${pkg.version}`);
