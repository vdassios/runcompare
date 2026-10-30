/**
 * The sections that only render once there is an analysis, kept out of the first-load bundle.
 * The upload panel preloads them so they arrive while the worker is still parsing.
 */
export const loadRouteMap = () => import('./RouteMap');
export const loadLinkedCharts = () => import('./LinkedCharts');

export function preloadResultSections(): void {
  // Best effort: a failed preload is retried when the section first renders.
  loadRouteMap().catch(() => {});
  loadLinkedCharts().catch(() => {});
}
