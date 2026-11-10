import { appendFileSync, closeSync, existsSync, fsyncSync, openSync, readFileSync } from 'node:fs';
import { canonicalize } from '../canonical.ts';
import { LedgerError, type Entry, type LedgerStore, type RawRecord } from '../types.ts';

/**
 * A local file store: one canonical JSON entry per line (JSON Lines), opened for append only and fsynced after
 * every write. Assumes one writing process per file.
 */
export class FileStore implements LedgerStore {
  readonly path: string;
  #last: Entry | undefined;
  #count = 0;
  #corrupt: string | undefined;

  constructor(path: string) {
    this.path = path;
    for (const record of this.read()) {
      this.#count++;
      if (record.malformed) {
        this.#corrupt = record.detail;
        this.#last = undefined;
      } else {
        this.#corrupt = undefined;
        this.#last = record.value as Entry;
      }
    }
  }

  last(): Entry | undefined {
    if (this.#corrupt) throw new LedgerError('corrupt', `${this.path}: last record is malformed (${this.#corrupt}); verify the ledger`);
    return this.#last && structuredClone(this.#last);
  }

  write(entry: Entry): void {
    if (this.#corrupt) throw new LedgerError('corrupt', `${this.path}: last record is malformed (${this.#corrupt}); refusing to append after it`);
    const expected = (this.#last?.seq ?? 0) + 1;
    if (entry.seq !== expected || this.#count !== entry.seq - 1) {
      throw new LedgerError('sequence', `store refuses sequence ${entry.seq}; the next sequence is ${expected}`);
    }
    const line = canonicalize(entry) + '\n';
    const fd = openSync(this.path, 'a');
    try {
      appendFileSync(fd, line, 'utf8');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    this.#last = structuredClone(entry);
    this.#count++;
  }

  *read(): Iterable<RawRecord> {
    if (!existsSync(this.path)) return;
    const text = readFileSync(this.path, 'utf8');
    if (text === '') return;
    const lines = text.split('\n');
    // A complete file ends with a newline, so the final element is empty. Anything else is a torn last write.
    const torn = lines.pop();
    let n = 0;
    for (const line of lines) {
      n++;
      yield parse(line, n);
    }
    if (torn !== undefined && torn !== '') yield { malformed: true, detail: `line ${n + 1} is incomplete` };
  }
}

function parse(line: string, n: number): RawRecord {
  try {
    return { malformed: false, value: JSON.parse(line) };
  } catch {
    return { malformed: true, detail: `line ${n} is not JSON` };
  }
}
