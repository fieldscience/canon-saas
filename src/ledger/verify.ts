import { isJson } from './canonical.ts';
import { hashEntry } from './hash.ts';
import { FORMAT_VERSION, GENESIS, type Entry, type Head, type RawRecord, type VerifyResult } from './types.ts';

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Walks records from sequence 1 and reports the chain intact (CE-LEDGER-004) or the first break and why
 * (CE-LEDGER-005). With a checkpoint, an intact chain must still reach it with the same hash (CE-LEDGER-007).
 * Pure: reads nothing but its arguments.
 */
export function verifyEntries(records: Iterable<RawRecord>, checkpoint?: Head): VerifyResult {
  let expectedSeq = 1;
  let prev = GENESIS;
  let atCheckpoint: string | undefined;

  for (const record of records) {
    if (record.malformed) return broken(expectedSeq, 'malformed', record.detail);
    const entry = record.value;
    const shapeError = checkShape(entry);
    if (shapeError) return broken(expectedSeq, 'malformed', shapeError);
    const e = entry as Entry;
    if (e.seq !== expectedSeq) return broken(expectedSeq, 'sequence', `expected sequence ${expectedSeq}, found ${e.seq}`);
    if (e.prev !== prev) return broken(e.seq, 'previous-hash', `previous hash does not match entry ${e.seq - 1}'s hash`);
    const recomputed = hashEntry(e);
    if (recomputed !== e.hash) return broken(e.seq, 'hash', `stored hash ${e.hash} does not match recomputed ${recomputed}`);
    if (checkpoint && e.seq === checkpoint.seq) atCheckpoint = e.hash;
    prev = e.hash;
    expectedSeq++;
  }

  const head: Head = { seq: expectedSeq - 1, hash: prev };
  if (checkpoint && checkpoint.seq > 0) {
    if (atCheckpoint === undefined) {
      return broken(checkpoint.seq, 'truncated', `ledger ends at sequence ${head.seq}, before the recorded head at ${checkpoint.seq}`);
    }
    if (atCheckpoint !== checkpoint.hash) {
      return broken(checkpoint.seq, 'checkpoint', `entry ${checkpoint.seq} has hash ${atCheckpoint}, the recorded head has ${checkpoint.hash}`);
    }
  }
  return { ok: true, count: head.seq, head };
}

function broken(seq: number, reason: Exclude<VerifyResult, { ok: true }>['reason'], detail: string): VerifyResult {
  return { ok: false, seq, reason, detail };
}

/** Why a value is not a well-formed entry, or undefined when it is. */
function checkShape(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'record is not an object';
  const e = value as Record<string, unknown>;
  if (e.v !== FORMAT_VERSION) return `unknown format version ${JSON.stringify(e.v)}`;
  if (!Number.isSafeInteger(e.seq) || (e.seq as number) < 1) return 'seq is not a positive integer';
  for (const f of ['at', 'type', 'actor'] as const) {
    if (typeof e[f] !== 'string' || e[f] === '') return `${f} is not a non-empty string`;
  }
  if (!('payload' in e) || !isJson(e.payload)) return 'payload is not JSON data';
  if (typeof e.prev !== 'string' || !HEX64.test(e.prev)) return 'prev is not a sha256 hex string';
  if (typeof e.hash !== 'string' || !HEX64.test(e.hash)) return 'hash is not a sha256 hex string';
  return undefined;
}
