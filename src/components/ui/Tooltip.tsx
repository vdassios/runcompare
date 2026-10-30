/**
 * A hint shown on hover or keyboard focus, for non-interactive text such as a value whose
 * meaning needs a sentence. The wrapper itself becomes focusable and is described by the hint.
 */
import { useId, type ReactNode } from 'react';
import { FOCUS_RING } from './Button';

export interface TooltipProps {
  content: ReactNode;
  /** Which edge of the trigger the hint lines up with; use 'end' near the right of the screen. */
  align?: 'start' | 'end';
  children: ReactNode;
}

export function Tooltip({ content, align = 'start', children }: TooltipProps) {
  const id = useId();
  return (
    <span tabIndex={0} aria-describedby={id} className={`group relative inline-flex rounded ${FOCUS_RING}`}>
      {children}
      {/* `hidden`, not `invisible`: a hidden hint must not widen the page at 390 px. */}
      <span
        role="tooltip"
        id={id}
        className={`absolute top-full z-20 mt-1 hidden w-max max-w-[16rem] rounded-md border border-border bg-surface px-2 py-1 text-xs text-text shadow-md group-focus-within:block group-hover:block ${align === 'end' ? 'right-0' : 'left-0'}`}
      >
        {content}
      </span>
    </span>
  );
}
