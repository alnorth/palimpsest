import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGES_DIR = path.join(__dirname, '..', 'packages');

// Rewrites every "@alnorth/*" range in pkgJson's dependency sections to a
// caret-pinned range matching that dependency's current version, per
// CLAUDE.md's Publishing convention. Mutates pkgJson in place; returns
// whether anything changed.
export function syncInternalDeps(pkgJson, versionsByName) {
  let changed = false;
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = pkgJson[section];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (!name.startsWith('@alnorth/')) continue;
      const version = versionsByName[name];
      if (!version) continue;
      const pinned = `^${version}`;
      if (deps[name] !== pinned) {
        deps[name] = pinned;
        changed = true;
      }
    }
  }
  return changed;
}

function main() {
  const packageDirs = fs
    .readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(PACKAGES_DIR, entry.name));

  const packageJsonsByPath = new Map();
  const versionsByName = {};
  for (const dir of packageDirs) {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    packageJsonsByPath.set(pkgPath, pkgJson);
    versionsByName[pkgJson.name] = pkgJson.version;
  }

  for (const [pkgPath, pkgJson] of packageJsonsByPath) {
    if (syncInternalDeps(pkgJson, versionsByName)) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n');
      console.log(`synced internal @alnorth/* deps in ${path.relative(process.cwd(), pkgPath)}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
