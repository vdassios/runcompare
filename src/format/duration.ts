import { MINUS, NO_VALUE } from './number';

/**
 * `h:mm:ss` or `m:ss`, rounded to the second. Negatives always get a minus;
 * `sign` adds a plus to positives.
 * 25734 → "7:08:54"; 545 with sign → "+9:05"; -42 → "−0:42".
 */
export function formatDuration(s: number, opts: { sign?: boolean } = {}): string {
  if (!Number.isFinite(s)) return NO_VALUE;
  const total = Math.round(Math.abs(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const ss = String(sec).padStart(2, '0');
  const body = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  if (total === 0) return body;
  if (s < 0) return MINUS + body;
  return opts.sign ? `+${body}` : body;
}

/** A time delta: always signed, and zero is "±0:00". Positive means behind. */
export function formatDelta(s: number): string {
  if (!Number.isFinite(s)) return NO_VALUE;
  return Math.round(Math.abs(s)) === 0 ? '±0:00' : formatDuration(s, { sign: true });
}

const LAST_PART = /^\d+(\.\d+)?$/;
const INT_PART = /^\d+$/;

/**
 * Parses "1:02:00", "30:00", "45" (seconds) and "2:05:30.5". The leading part is
 * unbounded ("60:00" is 3600); later parts must be below 60. Returns null for
 * anything else.
 */
export function parseDuration(text: string): number | null {
  const parts = text.trim().split(':');
  if (parts.length > 3) return null;
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? '';
    const isLast = i === parts.length - 1;
    if (!(isLast ? LAST_PART : INT_PART).test(part)) return null;
    const value = Number(part);
    if (i > 0 && value >= 60) return null;
    total = total * 60 + value;
  }
  return total;
}
