/**
 * Getting files in: a large drop zone with what the app does while there are no attempts, then a
 * compact "Add files" button. Also shows parsing/analysing progress and dismissible file errors.
 */
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useStore, type AppState } from '../store/useStore';
import { Button } from './ui';

const STATUS_TEXT: Partial<Record<AppState['status'], string>> = {
  parsing: 'Parsing files…',
  analyzing: 'Analysing…',
};

export function UploadPanel() {
  const hasAttempts = useStore((s) => s.attempts.length > 0);
  const status = useStore((s) => s.status);
  const errors = useStore((s) => s.errors);
  const addFiles = useStore((s) => s.addFiles);
  const dismissError = useStore((s) => s.dismissError);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (files: FileList | null) => {
    if (files && files.length > 0) void addFiles([...files]);
  };
  const statusText = STATUS_TEXT[status];

  const picker = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept=".fit,.gpx"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        add(e.currentTarget.files);
        e.currentTarget.value = ''; // so picking the same file again still fires
      }}
    />
  );
  const choose = () => inputRef.current?.click();

  return (
    <div className="flex flex-col gap-3">
      {hasAttempts ? (
        <DropTarget onFiles={add} className="flex flex-wrap items-center gap-3 rounded-lg">
          {picker}
          <Button variant="primary" onClick={choose}>
            Add files
          </Button>
          <span className="text-sm text-muted">or drop FIT/GPX files here</span>
          <StatusLine text={statusText} />
        </DropTarget>
      ) : (
        <DropTarget
          onFiles={add}
          className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-border bg-surface px-4 py-12 text-center sm:py-16"
        >
          {picker}
          <p className="text-lg font-semibold">Drop your race files here</p>
          <Button variant="primary" onClick={choose}>
            Choose files
          </Button>
          <StatusLine text={statusText} />
          <div className="flex max-w-xl flex-col gap-2 text-sm text-muted">
            <p>
              Add two or more recordings of the same race or route. RunCompare lines them up by position on the course
              and shows where you gained or lost time, and why: climbs, pace, heart rate and stops.
            </p>
            <p className="font-medium text-text">Files never leave your browser.</p>
            <p>Supported formats: FIT (.fit) and GPX (.gpx).</p>
          </div>
        </DropTarget>
      )}
      {errors.length > 0 && (
        <ul className="flex flex-col gap-2">
          {errors.map((message, i) => (
            <li
              key={`${i}:${message}`}
              role="alert"
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <span className="min-w-0 break-words">{message}</span>
              <Button variant="ghost" size="sm" aria-label={`Dismiss: ${message}`} onClick={() => dismissError(i)}>
                Dismiss
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusLine({ text }: { text: string | undefined }) {
  return (
    <p role="status" className="text-sm text-muted empty:hidden">
      {text}
    </p>
  );
}

function DropTarget({
  onFiles,
  className,
  children,
}: {
  onFiles(files: FileList): void;
  className: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const stop = (e: DragEvent) => {
    e.preventDefault(); // required for the drop event to fire
    e.stopPropagation();
  };
  return (
    <div
      data-testid="drop-zone"
      className={`${className} ${over ? 'outline outline-2 outline-offset-2 outline-accent' : ''}`}
      onDragOver={(e) => {
        stop(e);
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        stop(e);
        setOver(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      {children}
    </div>
  );
}
