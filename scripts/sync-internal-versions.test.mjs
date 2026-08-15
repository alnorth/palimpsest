import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main, syncInternalDeps } from './sync-internal-versions.mjs';

describe('syncInternalDeps', () => {
  it('rewrites a "*" range to the current caret-pinned version', () => {
    const pkg = { dependencies: { '@alnorth/palimpsest': '*' } };

    const changed = syncInternalDeps(pkg, { '@alnorth/palimpsest': '0.3.3' });

    expect(changed).toBe(true);
    expect(pkg.dependencies['@alnorth/palimpsest']).toBe('^0.3.3');
  });

  it('rewrites a stale caret range to match the current version', () => {
    const pkg = { dependencies: { '@alnorth/palimpsest': '^0.3.2' } };

    const changed = syncInternalDeps(pkg, { '@alnorth/palimpsest': '0.3.3' });

    expect(changed).toBe(true);
    expect(pkg.dependencies['@alnorth/palimpsest']).toBe('^0.3.3');
  });

  it('leaves an already-synced range untouched and reports no change', () => {
    const pkg = { dependencies: { '@alnorth/palimpsest': '^0.3.3' } };

    const changed = syncInternalDeps(pkg, { '@alnorth/palimpsest': '0.3.3' });

    expect(changed).toBe(false);
    expect(pkg.dependencies['@alnorth/palimpsest']).toBe('^0.3.3');
  });

  it('ignores external dependencies', () => {
    const pkg = { dependencies: { minisearch: '^7.2.0' } };

    const changed = syncInternalDeps(pkg, {});

    expect(changed).toBe(false);
    expect(pkg.dependencies.minisearch).toBe('^7.2.0');
  });

  it('leaves an @alnorth/* dependency alone when its version is unknown', () => {
    const pkg = { dependencies: { '@alnorth/unknown': '*' } };

    const changed = syncInternalDeps(pkg, {});

    expect(changed).toBe(false);
    expect(pkg.dependencies['@alnorth/unknown']).toBe('*');
  });

  it('syncs devDependencies and peerDependencies as well as dependencies', () => {
    const pkg = {
      devDependencies: { '@alnorth/palimpsest': '*' },
      peerDependencies: { '@alnorth/palimpsest': '*' },
    };

    const changed = syncInternalDeps(pkg, { '@alnorth/palimpsest': '0.3.3' });

    expect(changed).toBe(true);
    expect(pkg.devDependencies['@alnorth/palimpsest']).toBe('^0.3.3');
    expect(pkg.peerDependencies['@alnorth/palimpsest']).toBe('^0.3.3');
  });
});

describe('main', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePackage(name, contents) {
    const dir = path.join(tmpDir, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(contents, null, 2) + '\n');
    return dir;
  }

  function readPackage(name) {
    return JSON.parse(fs.readFileSync(path.join(tmpDir, name, 'package.json'), 'utf8'));
  }

  it('rewrites a "*" range on disk to match the dependency\'s own version', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-internal-versions-'));
    writePackage('core', { name: '@alnorth/palimpsest', version: '0.3.3' });
    writePackage('query', {
      name: '@alnorth/palimpsest-query',
      version: '0.3.3',
      dependencies: { '@alnorth/palimpsest': '*' },
    });

    main(tmpDir);

    expect(readPackage('query').dependencies['@alnorth/palimpsest']).toBe('^0.3.3');
  });

  it('resolves a dependency against its own version regardless of directory scan order', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-internal-versions-'));
    // "consumer" sorts before "dependency" alphabetically, so a single-pass
    // implementation that syncs while scanning (instead of collecting every
    // version first) would process the consumer before dependency's version
    // is known.
    writePackage('consumer', {
      name: '@alnorth/consumer',
      version: '1.0.0',
      dependencies: { '@alnorth/dependency': '*' },
    });
    writePackage('dependency', { name: '@alnorth/dependency', version: '2.5.0' });

    main(tmpDir);

    expect(readPackage('consumer').dependencies['@alnorth/dependency']).toBe('^2.5.0');
  });

  it('does not rewrite a package.json whose ranges are already synced', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-internal-versions-'));
    writePackage('core', { name: '@alnorth/palimpsest', version: '0.3.3' });
    const queryDir = writePackage('query', {
      name: '@alnorth/palimpsest-query',
      version: '0.3.3',
      dependencies: { '@alnorth/palimpsest': '^0.3.3' },
    });
    const before = fs.readFileSync(path.join(queryDir, 'package.json'), 'utf8');

    main(tmpDir);

    expect(fs.readFileSync(path.join(queryDir, 'package.json'), 'utf8')).toBe(before);
  });

  it('skips a packages/ subdirectory with no package.json instead of throwing', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-internal-versions-'));
    fs.mkdirSync(path.join(tmpDir, 'no-package-json'));
    writePackage('core', { name: '@alnorth/palimpsest', version: '0.3.3' });
    writePackage('query', {
      name: '@alnorth/palimpsest-query',
      version: '0.3.3',
      dependencies: { '@alnorth/palimpsest': '*' },
    });

    expect(() => main(tmpDir)).not.toThrow();
    expect(readPackage('query').dependencies['@alnorth/palimpsest']).toBe('^0.3.3');
  });
});
