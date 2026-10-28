/** A small inline label: a file kind, a status, an "estimated" marker. */
import type { ReactNode } from 'react';

export interface BadgeProps {
  tone?: 'neutral' | 'accent' | 'estimated';
  children: ReactNode;
}

const TONES: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'border-border text-muted',
  accent: 'border-accent/40 bg-accent/10 text-accent',
  estimated: 'border-estimated/40 bg-estimated/10 text-estimated',
};

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-xs font-medium leading-none ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
