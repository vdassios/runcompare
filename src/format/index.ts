/** Every value shown to the user goes through this module. Inputs are SI. */
export { defaultUnits, splitLength, METRES_PER_FOOT, METRES_PER_MILE } from './units';
export { formatDelta, formatDuration, parseDuration } from './duration';
export { MINUS, NO_VALUE, formatNumber } from './number';
export {
  fillTemplate,
  formatDistance,
  formatElevation,
  formatPace,
  formatPercent,
  formatQuantity,
  formatTemp,
  formatVam,
} from './quantity';
