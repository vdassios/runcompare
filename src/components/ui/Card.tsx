/** The surface every dashboard section sits on. `title` renders as the section's h2. */
import type { ReactNode } from 'react';

export interface CardProps {
  title?: ReactNode;
  /** Right-aligned next to the title, e.g. a section's own controls. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ title, actions, className = '', children }: CardProps) {
  return (
    <div className={`min-w-0 rounded-lg border border-border bg-surface p-4 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
