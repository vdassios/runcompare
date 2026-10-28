/**
 * Errors the parsers throw for files the user dropped. Kept apart from index.ts so that fit.ts and
 * gpx.ts can throw them without an import cycle. Messages are user-facing.
 */

export class UnsupportedFileError extends Error {
  override readonly name = 'UnsupportedFileError';

  constructor(
    readonly fileName: string,
    reason?: string,
  ) {
    super(
      reason === undefined
        ? `"${fileName}" isn't a file RunCompare can read. Supported formats are FIT (.fit) and GPX (.gpx).`
        : `"${fileName}" can't be read: ${reason}.`,
    );
  }
}
