import { describe, expect, it } from 'vitest';
import type { Quantity, QuantityKind } from '../model/types';
import {
  MINUS,
  defaultUnits,
  fillTemplate,
  formatDelta,
  formatDistance,
  formatDuration,
  formatElevation,
  formatNumber,
  formatPace,
  formatPercent,
  formatQuantity,
  formatTemp,
  formatVam,
  parseDuration,
  splitLength,
} from './index';

describe('splitLength', () => {
  it('is 1 km or 1 mi', () => {
    expect(splitLength('metric')).toBe(1000);
    expect(splitLength('imperial')).toBe(1609.344);
  });
});

describe('defaultUnits', () => {
  it.each([
    ['en-US', 'imperial'],
    ['en-us', 'imperial'],
    ['en_US', 'imperial'],
    ['en-LR', 'imperial'],
    ['my', 'imperial'],
    ['my-MM', 'imperial'],
    ['en-GB', 'metric'],
    ['en', 'metric'],
    ['el-GR', 'metric'],
    ['fr', 'metric'],
    ['', 'metric'],
  ] as const)('%s → %s', (lang, units) => {
    expect(defaultUnits(lang)).toBe(units);
  });
});

describe('formatNumber', () => {
  it('groups en-GB style and uses a true minus', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(-1234.5, 1)).toBe(`${MINUS}1,234.5`);
    expect(formatNumber(-0.001)).toBe('0');
    expect(formatNumber(NaN)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(25734)).toBe('7:08:54');
    expect(formatDuration(26279)).toBe('7:17:59');
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(59.6)).toBe('1:00');
    expect(formatDuration(0)).toBe('0:00');
  });
  it('handles signs', () => {
    expect(formatDuration(545, { sign: true })).toBe('+9:05');
    expect(formatDuration(545)).toBe('9:05');
    expect(formatDuration(-42)).toBe(`${MINUS}0:42`);
    expect(formatDuration(-42, { sign: true })).toBe(`${MINUS}0:42`);
    expect(formatDuration(-0.4, { sign: true })).toBe('0:00');
    expect(formatDuration(-3725)).toBe(`${MINUS}1:02:05`);
  });
  it('shows a dash for non-finite input', () => {
    expect(formatDuration(NaN)).toBe('—');
    expect(formatDuration(Infinity)).toBe('—');
  });
});

describe('formatDelta', () => {
  it('is always signed', () => {
    expect(formatDelta(545)).toBe('+9:05');
    expect(formatDelta(-42)).toBe(`${MINUS}0:42`);
    expect(formatDelta(0)).toBe('±0:00');
    expect(formatDelta(0.4)).toBe('±0:00');
    expect(formatDelta(-0.4)).toBe('±0:00');
    expect(formatDelta(NaN)).toBe('—');
  });
});

describe('formatDistance', () => {
  it('formats metric and imperial', () => {
    expect(formatDistance(54128, 'metric')).toBe('54.13 km');
    expect(formatDistance(54128, 'imperial')).toBe('33.63 mi');
    expect(formatDistance(1609.344, 'imperial', { decimals: 0 })).toBe('1 mi');
    expect(formatDistance(1234567, 'metric', { decimals: 1 })).toBe('1,234.6 km');
    expect(formatDistance(-500, 'metric')).toBe(`${MINUS}0.50 km`);
    expect(formatDistance(NaN, 'metric')).toBe('—');
  });
});

describe('formatPace', () => {
  it('formats per km and per mile', () => {
    expect(formatPace(0.312, 'metric')).toBe('5:12 /km');
    expect(formatPace(0.312, 'imperial')).toBe('8:22 /mi');
    expect(formatPace(0.35996, 'metric')).toBe('6:00 /km');
  });
  it('shows a dash for non-finite and non-positive input', () => {
    expect(formatPace(NaN, 'metric')).toBe('—');
    expect(formatPace(Infinity, 'metric')).toBe('—');
    expect(formatPace(0, 'metric')).toBe('—');
    expect(formatPace(-0.3, 'imperial')).toBe('—');
  });
});

describe('formatElevation', () => {
  it('formats metres and feet', () => {
    expect(formatElevation(2780, 'metric')).toBe('2,780 m');
    expect(formatElevation(2780, 'imperial')).toBe('9,121 ft');
    expect(formatElevation(-12, 'metric')).toBe(`${MINUS}12 m`);
    expect(formatElevation(NaN, 'imperial')).toBe('—');
  });
});

describe('formatVam', () => {
  it('formats metres and feet per hour', () => {
    expect(formatVam(812, 'metric')).toBe('812 m/h');
    expect(formatVam(812, 'imperial')).toBe('2,664 ft/h');
    expect(formatVam(NaN, 'metric')).toBe('—');
  });
});

describe('formatTemp', () => {
  it('formats Celsius and Fahrenheit', () => {
    expect(formatTemp(12, 'metric')).toBe('12 °C');
    expect(formatTemp(12, 'imperial')).toBe('54 °F');
    expect(formatTemp(-5, 'metric')).toBe(`${MINUS}5 °C`);
    expect(formatTemp(-40, 'imperial')).toBe(`${MINUS}40 °F`);
    expect(formatTemp(NaN, 'metric')).toBe('—');
  });
});

describe('formatPercent', () => {
  it('formats fractions with at most one decimal', () => {
    expect(formatPercent(0.053)).toBe('5.3%');
    expect(formatPercent(0.12)).toBe('12%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(-0.051)).toBe(`${MINUS}5.1%`);
    expect(formatPercent(NaN)).toBe('—');
  });
  it('handles signs', () => {
    expect(formatPercent(0.053, { sign: true })).toBe('+5.3%');
    expect(formatPercent(-0.053, { sign: true })).toBe(`${MINUS}5.3%`);
    expect(formatPercent(0, { sign: true })).toBe('0%');
  });
});

describe('formatQuantity and fillTemplate', () => {
  const cases: Record<QuantityKind, [Quantity, string, string]> = {
    distance: [{ kind: 'distance', value: 3000 }, '3.00 km', '1.86 mi'],
    elevation: [{ kind: 'elevation', value: 120 }, '120 m', '394 ft'],
    pace: [{ kind: 'pace', value: 0.312 }, '5:12 /km', '8:22 /mi'],
    duration: [{ kind: 'duration', value: 125 }, '2:05', '2:05'],
    delta: [{ kind: 'delta', value: -42 }, `${MINUS}0:42`, `${MINUS}0:42`],
    percent: [{ kind: 'percent', value: 0.083 }, '8.3%', '8.3%'],
    count: [{ kind: 'count', value: 1234 }, '1,234', '1,234'],
  };

  it.each(Object.entries(cases))('formats %s', (_kind, [q, metric, imperial]) => {
    expect(formatQuantity(q, 'metric')).toBe(metric);
    expect(formatQuantity(q, 'imperial')).toBe(imperial);
  });

  it('fills every quantity kind into a template', () => {
    const values = Object.fromEntries(Object.entries(cases).map(([k, [q]]) => [k, q]));
    const template = Object.keys(cases)
      .map((k) => `${k}={${k}}`)
      .join('; ');
    expect(fillTemplate(template, values, 'metric')).toBe(
      `distance=3.00 km; elevation=120 m; pace=5:12 /km; duration=2:05; delta=${MINUS}0:42; percent=8.3%; count=1,234`,
    );
    expect(fillTemplate(template, values, 'imperial')).toBe(
      `distance=1.86 mi; elevation=394 ft; pace=8:22 /mi; duration=2:05; delta=${MINUS}0:42; percent=8.3%; count=1,234`,
    );
  });

  it('leaves unknown placeholders and repeats known ones', () => {
    const values = { gain: { kind: 'delta', value: 30 } } satisfies Record<string, Quantity>;
    expect(fillTemplate('{gain} then {gain}, {missing}', values, 'metric')).toBe('+0:30 then +0:30, {missing}');
    expect(fillTemplate('no placeholders', {}, 'metric')).toBe('no placeholders');
  });
});

describe('parseDuration', () => {
  it.each([
    ['1:02:00', 3720],
    ['30:00', 1800],
    ['45', 45],
    ['2:05:30.5', 7530.5],
    ['60:00', 3600],
    ['0:00', 0],
    ['  7:08:54  ', 25734],
    ['90', 90],
    ['1:05.25', 65.25],
  ])('%s → %s', (text, seconds) => {
    expect(parseDuration(text)).toBe(seconds);
  });

  it.each(['', '   ', 'abc', '1:2:3:4', '1:60:00', '1:00:60', '-5', '1.5:00', '1::00', ':30', '30:', '1:2a', '1e3'])(
    'rejects %j',
    (text) => {
      expect(parseDuration(text)).toBeNull();
    },
  );
});
