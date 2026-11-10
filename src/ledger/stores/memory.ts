import { LedgerError, type Entry, type LedgerStore, type RawRecord } from '../types.ts';

/** An in-memory store, for tests and embedding. Hands out copies, so callers cannot mutate what it holds. */
export class MemoryStore implements LedgerStore {
  readonly #entries: Entry[] = [];

  last(): Entry | undefined {
    const e = this.#entries.at(-1);
    return e && structuredClone(e);
  }

  write(entry: Entry): void {
    const expected = this.#entries.length + 1;
    if (entry.seq !== expected) {
      throw new LedgerError('sequence', `store refuses sequence ${entry.seq}; the next sequence is ${expected}`);
    }
    this.#entries.push(structuredClone(entry));
  }

  *read(): Iterable<RawRecord> {
    for (const e of this.#entries) yield { malformed: false, value: structuredClone(e) };
  }
}
