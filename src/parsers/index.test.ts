/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Activity } from '../model/types';
import { parseGpx } from './gpx';
import { parseFile, UnsupportedFileError } from './index';

// Detection is what's under test here; the GPX parser itself is task 04's.
vi.mock('./gpx', () => ({ parseGpx: vi.fn(() => ({ source: 'gpx' }) as Activity) }));

const FIXTURES_DIR = join(import.meta.dirname, '..', '..', 'fixtures');

function readFixture(name: string): ArrayBuffer {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name))).buffer;
}

const encodeText = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe('parseFile', () => {
  it('detects FIT by content, whatever the extension', () => {
    const activity = parseFile(readFixture('trail-2024.fit'), 'race.txt');
    expect(activity.source).toBe('fit');
    expect(activity.fileName).toBe('race.txt');
    expect(activity.t.length).toBe(25_735);
  });

  it('hands GPX text to parseGpx, whatever the extension', () => {
    const bytes = readFixture('trail-2025-head.gpx');
    expect(parseFile(bytes, 'track.fit').source).toBe('gpx');
    expect(parseGpx).toHaveBeenLastCalledWith(new TextDecoder().decode(bytes), 'track.fit');
  });

  it('accepts GPX without an XML declaration, after a BOM and whitespace', () => {
    parseFile(encodeText('﻿ \n\t<gpx version="1.1"></gpx>'), 'bare.gpx');
    expect(parseGpx).toHaveBeenLastCalledWith(' \n\t<gpx version="1.1"></gpx>', 'bare.gpx');
  });

  it('rejects anything else with a message naming the file and the formats', () => {
    const random = new Uint8Array([0x8f, 0x13, 0x00, 0xe2, 0x5a, 0x9c, 0x41, 0x07, 0xd3, 0x6e, 0xb8, 0x22, 0x71, 0x0f]);
    expect(() => parseFile(random.buffer, 'noise.bin')).toThrow(UnsupportedFileError);
    expect(() => parseFile(random.buffer, 'noise.bin')).toThrow(/"noise\.bin".*FIT.*GPX/);
    expect(() => parseFile(encodeText('{"type": "DeviceLog"}'), 'log.json')).toThrow(UnsupportedFileError);
    expect(() => parseFile(new ArrayBuffer(0), 'empty.fit')).toThrow(UnsupportedFileError);
  });
});
