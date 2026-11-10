import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/ledger/stores/file.ts';
import { MemoryStore } from '../src/ledger/stores/memory.ts';
import { Ledger } from '../src/ledger/ledger.ts';
import type { LedgerStore } from '../src/ledger/types.ts';

/** A clock that ticks one second per call from 2026-11-10T00:00:00.000Z. Synthetic and deterministic. */
export function fixedClock(): () => string {
  let t = Date.parse('2026-11-10T00:00:00.000Z');
  return () => {
    const s = new Date(t).toISOString();
    t += 1000;
    return s;
  };
}

export function tempFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'canon-ledger-')), 'ledger.jsonl');
}

export const STORES: { name: string; make: () => LedgerStore }[] = [
  { name: 'MemoryStore', make: () => new MemoryStore() },
  { name: 'FileStore', make: () => new FileStore(tempFile()) },
];

/** A file-backed ledger with n synthetic entries. */
export function fileLedger(n: number): { path: string; ledger: Ledger } {
  const path = tempFile();
  const ledger = new Ledger(new FileStore(path), { clock: fixedClock() });
  for (let i = 1; i <= n; i++) {
    ledger.append({ type: 'decision.recorded', actor: 'person:synthetic-001', payload: { ref: `REQ-SYN-00${i}`, decision: 'approve' } });
  }
  return { path, ledger };
}

/** The file's lines as parsed objects. */
export function readLines(path: string): Record<string, unknown>[] {
  return readFileSync(path, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
}

export function writeLines(path: string, records: unknown[]): void {
  writeFileSync(path, records.map((r) => JSON.stringify(r) + '\n').join(''));
}

/** Reopens a file ledger, as a verifier with only the file would. */
export function reopen(path: string): Ledger {
  return new Ledger(new FileStore(path));
}
