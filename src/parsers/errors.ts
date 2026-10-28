/**
 * Errors the parsers throw for files the app can't read. The message is shown to the user.
 */
export class UnsupportedFileError extends Error {
  override name = 'UnsupportedFileError';
}
