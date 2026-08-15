import { describe, expect, it } from 'vitest';
import { syncInternalDeps } from './sync-internal-versions.mjs';

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
