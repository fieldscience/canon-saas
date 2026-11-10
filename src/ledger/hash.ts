import { createHash } from 'node:crypto';
import { canonicalize } from './canonical.ts';
import type { EntryBody } from './types.ts';

/** SHA-256, lowercase hex, of the canonical serialization of an entry's body (CE-LEDGER-002). */
export function hashEntry(body: EntryBody): string {
  const { v, seq, at, type, actor, payload, prev } = body;
  return createHash('sha256').update(canonicalize({ v, seq, at, type, actor, payload, prev }), 'utf8').digest('hex');
}
