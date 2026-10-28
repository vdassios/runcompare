import type { ComponentType } from 'react';
import { AttemptList } from './AttemptList';
import { ClimbsTable } from './ClimbsTable';
import { Header } from './Header';
import { InsightsPanel } from './InsightsPanel';
import { LinkedCharts } from './LinkedCharts';
import { RouteMap } from './RouteMap';
import { SplitSetEditor } from './SplitSetEditor';
import { SplitsTable } from './SplitsTable';
import { SummaryCards } from './SummaryCards';
import { UploadPanel } from './UploadPanel';

/** Sections in PLAN §6 order. Tests find sections by `data-section`. */
const SECTIONS: readonly { name: string; Component: ComponentType }[] = [
  { name: 'header', Component: Header },
  { name: 'upload-panel', Component: UploadPanel },
  { name: 'attempt-list', Component: AttemptList },
  { name: 'split-set-editor', Component: SplitSetEditor },
  { name: 'summary-cards', Component: SummaryCards },
  { name: 'route-map', Component: RouteMap },
  { name: 'linked-charts', Component: LinkedCharts },
  { name: 'splits-table', Component: SplitsTable },
  { name: 'climbs-table', Component: ClimbsTable },
  { name: 'insights-panel', Component: InsightsPanel },
];

export function Dashboard() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
      {SECTIONS.map(({ name, Component }) => (
        <section key={name} data-section={name}>
          <Component />
        </section>
      ))}
    </main>
  );
}
