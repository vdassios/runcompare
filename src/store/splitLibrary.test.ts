// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PRO_10K_SPLIT_SET, PRO_SPLIT_SET } from '../test/fixtures';
import { SPLIT_LIBRARY_KEY, deleteSplitSet, listSplitSets, saveSplitSet } from './splitLibrary';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it('saves, lists, replaces by name and deletes', () => {
  expect(listSplitSets()).toEqual([]);
  expect(saveSplitSet(PRO_SPLIT_SET)).toBe(true);
  expect(saveSplitSet(PRO_10K_SPLIT_SET)).toBe(true);
  expect(listSplitSets().map((s) => s.name)).toEqual(['Pro', 'Pro 10K']);

  const faster = { ...PRO_SPLIT_SET, markers: [{ distance: 54_000, time: 5 * 3600 }] };
  saveSplitSet(faster);
  expect(listSplitSets()).toEqual([faster, PRO_10K_SPLIT_SET]);

  expect(deleteSplitSet('Pro')).toBe(true);
  expect(listSplitSets()).toEqual([PRO_10K_SPLIT_SET]);
});

it('stores a versioned {version, sets} document', () => {
  saveSplitSet(PRO_10K_SPLIT_SET);
  expect(JSON.parse(localStorage.getItem(SPLIT_LIBRARY_KEY)!)).toEqual({ version: 1, sets: [PRO_10K_SPLIT_SET] });
});

it('ignores unreadable documents and invalid entries', () => {
  localStorage.setItem(SPLIT_LIBRARY_KEY, '{not json');
  expect(listSplitSets()).toEqual([]);
  localStorage.setItem(SPLIT_LIBRARY_KEY, JSON.stringify({ version: 2, sets: [PRO_10K_SPLIT_SET] }));
  expect(listSplitSets()).toEqual([]);
  const broken = { ...PRO_SPLIT_SET, markers: [{ distance: 10, time: 'soon' }] };
  const unordered = { ...PRO_SPLIT_SET, markers: [...PRO_SPLIT_SET.markers].reverse() };
  localStorage.setItem(SPLIT_LIBRARY_KEY, JSON.stringify({ version: 1, sets: [broken, unordered, PRO_10K_SPLIT_SET] }));
  expect(listSplitSets()).toEqual([PRO_10K_SPLIT_SET]);
});

it('reads as empty and reports failed writes when localStorage throws', () => {
  const denied = () => {
    throw new Error('denied');
  };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
  expect(listSplitSets()).toEqual([]);
  expect(saveSplitSet(PRO_SPLIT_SET)).toBe(false);
  expect(deleteSplitSet('Pro')).toBe(false);
});
