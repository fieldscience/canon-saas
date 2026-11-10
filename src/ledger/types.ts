/** Canonical JSON data: the only values a payload may hold (CE-LEDGER-006). */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The current entry format version. It is part of every hash (CE-LEDGER-002). */
export const FORMAT_VERSION = 1 as const;

/** The previous hash of entry 1 (CE-LEDGER-001). */
export const GENESIS = '0'.repeat(64);

/** One ledger record. Domain-neutral: type, actor and payload are opaque to the engine. */
export interface Entry {
  v: typeof FORMAT_VERSION;
  seq: number;
  at: string;
  type: string;
  actor: string;
  payload: Json;
  prev: string;
  hash: string;
}

/** The fields a hash covers: everything but the hash itself. */
export type EntryBody = Omit<Entry, 'hash'>;

/** A ledger's tip. An empty ledger's head is { seq: 0, hash: GENESIS }. */
export interface Head {
  seq: number;
  hash: string;
}

/** What a store hands back for verification: a parsed record, or one it could not parse. */
export type RawRecord = { malformed: false; value: unknown } | { malformed: true; detail: string };

/** The only port between the ledger and storage. There is no update or delete (CE-LEDGER-003). */
export interface LedgerStore {
  /** The last entry written, or undefined when empty. */
  last(): Entry | undefined;
  /** Writes the next entry. Refuses unless entry.seq is exactly one more than last()'s. */
  write(entry: Entry): void;
  /** Every stored record, in storage order. */
  read(): Iterable<RawRecord>;
}

export type BreakReason = 'malformed' | 'sequence' | 'previous-hash' | 'hash' | 'truncated' | 'checkpoint';

export type VerifyResult =
  | { ok: true; count: number; head: Head }
  | { ok: false; seq: number; reason: BreakReason; detail: string };

export type LedgerErrorCode = 'invalid' | 'conflict' | 'sequence' | 'corrupt';

export class LedgerError extends Error {
  readonly code: LedgerErrorCode;
  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}
