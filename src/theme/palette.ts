/**
 * Attempt colours, in assignment order. Based on Okabe–Ito (colour-blind safe), with
 * each colour shifted to mid luminance so it reads as a line on both the light and
 * the dark background. Vermillion is swapped for crimson and the pure orange and blue
 * are kept clear of the `behind` and `ahead` tokens. palette.test.ts checks all of it.
 */
export const ATTEMPT_PALETTE = [
  '#009e73', // bluish green
  '#c06c9b', // reddish purple
  '#0072b2', // blue
  '#b07c00', // dark gold
  '#2a9d9f', // teal
  '#b4404f', // crimson
  '#858000', // olive
  '#a0785a', // brown
] as const;

/** The first palette colour not in `used`; once all are taken, cycles by count. */
export function nextAttemptColor(used: string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  const free = ATTEMPT_PALETTE.find((c) => !taken.has(c));
  return free ?? ATTEMPT_PALETTE[used.length % ATTEMPT_PALETTE.length] ?? ATTEMPT_PALETTE[0];
}
