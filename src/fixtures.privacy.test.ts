/// <reference types="node" />
/**
 * The repo is public. The only personal data in the race files is the owner's name in the GPX
 * <metadata>, so every fixture GPX must be without it (task 01).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FIXTURES_DIR = join(import.meta.dirname, '..', 'fixtures');
const files = readdirSync(FIXTURES_DIR, { recursive: true, encoding: 'utf8' });
const gpxFiles = files.filter((f) => f.toLowerCase().endsWith('.gpx'));

describe('fixtures', () => {
  it('include the race files', () => {
    expect(files).toEqual(
      expect.arrayContaining(['trail-2024.fit', 'trail-2025.fit', 'trail-2024-head.gpx', 'trail-2025-head.gpx']),
    );
  });
});

describe.each(gpxFiles)('fixture %s', (file) => {
  it('has no metadata or author', () => {
    expect(readFileSync(join(FIXTURES_DIR, file), 'utf8')).not.toMatch(/<(metadata|author)\b/i);
  });
});
