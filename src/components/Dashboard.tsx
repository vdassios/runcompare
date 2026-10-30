/**
 * The page frame: the header bar, then every section in PLAN §6 order in one column, capped at
 * `max-w-7xl` with a 16 px gutter on phones. Sections that render nothing take no space.
 */
import { Suspense, lazy, type ComponentType } from 'react';
import { AttemptList } from './AttemptList';
import { ClimbsTable } from './ClimbsTable';
import { Header } from './Header';
import { InsightsPanel } from './InsightsPanel';
import { RouteMap } from './RouteMap';
import { SplitSetEditor } from './SplitSetEditor';
import { SplitsTable } from './SplitsTable';
import { SummaryCards } from './SummaryCards';
import { UploadPanel } from './UploadPanel';
import { useStore } from '../store/useStore';

// ECharts is most of the bundle, so the charts load as their own chunk. `lazy` fetches on first
// render, so sections marked `needsAnalysis` mount only once there is an analysis to show.
const LinkedCharts = lazy(() => import('./LinkedCharts').then((m) => ({ default: m.LinkedCharts })));

/** Tests find sections by `data-section`. */
const SECTIONS: readonly { name: string; Component: ComponentType; needsAnalysis?: boolean }[] = [
  { name: 'upload-panel', Component: UploadPanel },
  { name: 'attempt-list', Component: AttemptList },
  { name: 'split-set-editor', Component: SplitSetEditor },
  { name: 'summary-cards', Component: SummaryCards },
  { name: 'route-map', Component: RouteMap },
  { name: 'linked-charts', Component: LinkedCharts, needsAnalysis: true },
  { name: 'splits-table', Component: SplitsTable },
  { name: 'climbs-table', Component: ClimbsTable },
  { name: 'insights-panel', Component: InsightsPanel },
];

const COLUMN = 'mx-auto w-full max-w-7xl px-4 md:px-6';

export function Dashboard() {
  const hasAnalysis = useStore((s) => s.analysis !== null);
  return (
    <div className="min-h-screen bg-background text-text">
      <div data-section="header" className="border-b border-border bg-surface">
        <div className={COLUMN}>
          <Header />
        </div>
      </div>
      <main className={`${COLUMN} flex flex-col gap-6 py-6`}>
        {SECTIONS.map(({ name, Component, needsAnalysis }) => (
          <section key={name} data-section={name} className="min-w-0 empty:hidden">
            {(hasAnalysis || !needsAnalysis) && (
              <Suspense fallback={null}>
                <Component />
              </Suspense>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
