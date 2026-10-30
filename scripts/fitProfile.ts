/**
 * Vite plugin: replaces @garmin/fitsdk's 1 MB profile.js (every FIT message and type) with one
 * holding only the messages parseFit reads. Messages missing from the profile decode as unknown
 * and are dropped (the decoder's includeUnknownData defaults to false), exactly as proprietary
 * messages already are.
 */
import type { Plugin } from 'vite';

// Keep in step with what src/parsers/fit.ts reads. fileId stays because the tests' Encoder writes it,
// hr feeds the decoder's mergeHeartRates, and the developer messages let it skip developer fields.
const KEEP = new Set(['fileId', 'record', 'lap', 'session', 'hr', 'developerDataId', 'fieldDescription']);

interface Field {
  type: string;
  subFields: { type: string }[];
}
interface Message {
  name: string;
  fields: Record<string, Field>;
}
interface Profile {
  messages: Record<string, Message>;
  types: Record<string, unknown>;
  [key: string]: unknown;
}

export function fitProfile(): Plugin {
  return {
    name: 'fit-profile',
    enforce: 'pre',
    async load(id) {
      if (!/@garmin[\\/]fitsdk[\\/]src[\\/]profile\.js$/.test(id)) return null;
      const full = ((await import(/* @vite-ignore */ id)) as { default: Profile }).default;
      const messages = Object.fromEntries(Object.entries(full.messages).filter(([, m]) => KEEP.has(m.name)));
      const used = new Set<string>();
      for (const m of Object.values(messages))
        for (const f of Object.values(m.fields)) {
          used.add(f.type);
          for (const s of f.subFields) used.add(s.type);
        }
      const types = Object.fromEntries(Object.entries(full.types).filter(([name]) => used.has(name)));
      return `export default ${JSON.stringify({ ...full, messages, types })};`;
    },
  };
}
