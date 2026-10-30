/**
 * Baseline and split-set editor (PLAN §1.3, §5.7, §6.3): add a pro's splits or a target time to the
 * comparison, keep a library of saved sets, and choose between a course and a distance baseline.
 */
import { Card } from '../ui';
import { BaselinePicker } from './BaselinePicker';
import { Editor } from './Editor';

export function SplitSetEditor() {
  return (
    <Card title="Split sets and baseline">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Editor />
        <div className="border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <BaselinePicker />
        </div>
      </div>
    </Card>
  );
}
