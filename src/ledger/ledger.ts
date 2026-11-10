import { canonicalize } from './canonical.ts';
import { hashEntry } from './hash.ts';
import { verifyEntries } from './verify.ts';
import { FORMAT_VERSION, GENESIS, LedgerError, type Entry, type Head, type Json, type LedgerStore, type VerifyResult } from './types.ts';

export type Clock = () => string;

export interface AppendInput {
  /** What happened, e.g. "decision.recorded". Opaque to the engine. */
  type: string;
  /** Who or what acted, e.g. "person:…" or "agent:…". Opaque to the engine. */
  actor: string;
  /** Canonical JSON data. Opaque to the engine. */
  payload: Json;
  /** When set, the append is refused unless this is the current head's hash (CE-LEDGER-008). */
  expectedHead?: string;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

/** A hash-chained, append-only ledger over one store. */
export class Ledger {
  readonly #store: LedgerStore;
  readonly #clock: Clock;

  constructor(store: LedgerStore, options: { clock?: Clock } = {}) {
    this.#store = store;
    this.#clock = options.clock ?? (() => new Date().toISOString());
  }

  /** The current head; { seq: 0, hash: GENESIS } when empty. */
  head(): Head {
    const last = this.#store.last();
    return last ? { seq: last.seq, hash: last.hash } : { seq: 0, hash: GENESIS };
  }

  /**
   * Records the next entry, linked to the head (CE-LEDGER-001). Every refusal happens before the store is
   * written, so a refused append records nothing (CE-LEDGER-006, CE-LEDGER-008).
   */
  append(input: AppendInput): Entry {
    const { type, actor, payload, expectedHead } = input;
    if (typeof type !== 'string' || type === '') throw new LedgerError('invalid', 'type must be a non-empty string');
    if (typeof actor !== 'string' || actor === '') throw new LedgerError('invalid', 'actor must be a non-empty string');
    // Canonicalize to validate, then store a parsed copy so later mutation of the caller's object cannot reach it.
    const stored = JSON.parse(canonicalize(payload)) as Json;
    const at = this.#clock();
    if (typeof at !== 'string' || !ISO_UTC.test(at)) throw new LedgerError('invalid', `clock returned ${JSON.stringify(at)}, not an ISO 8601 UTC time`);

    const head = this.head();
    if (expectedHead !== undefined && expectedHead !== head.hash) {
      throw new LedgerError('conflict', `expected head ${expectedHead}, current head is ${head.hash} at sequence ${head.seq}`);
    }
    const body = { v: FORMAT_VERSION, seq: head.seq + 1, at, type, actor, payload: stored, prev: head.hash };
    const entry: Entry = { ...body, hash: hashEntry(body) };
    this.#store.write(entry);
    return structuredClone(entry);
  }

  /** Verifies the whole chain, optionally against a head recorded earlier (CE-LEDGER-004, -005, -007). */
  verify(checkpoint?: Head): VerifyResult {
    return verifyEntries(this.#store.read(), checkpoint);
  }
}
