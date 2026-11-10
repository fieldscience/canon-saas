import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { Ledger } from '../src/ledger/ledger.ts';
import { FileStore } from '../src/ledger/stores/file.ts';
import { LedgerError, type Entry } from '../src/ledger/types.ts';
import { fixedClock, STORES, tempFile } from './helpers.ts';

const isSequence = (e: unknown) => e instanceof LedgerError && e.code === 'sequence';

function filled(make: () => import('../src/ledger/types.ts').LedgerStore) {
  const store = make();
  const ledger = new Ledger(store, { clock: fixedClock() });
  const entries: Entry[] = [];
  for (let i = 1; i <= 3; i++) entries.push(ledger.append({ type: 'gate.passed', actor: 'agent:synthetic-bot', payload: { n: i } }));
  return { store, entries };
}

for (const { name, make } of STORES) {
  test(`${name}: Overwriting an existing sequence is refused @CE-LEDGER-003`, () => {
    const { store, entries } = filled(make);
    const forged: Entry = { ...entries[1]!, payload: { n: 99 } };
    assert.throws(() => store.write(forged), isSequence);
    assert.deepEqual([...store.read()].map((r) => (r.malformed ? null : r.value)), entries);
  });

  test(`${name}: Skipping a sequence is refused @CE-LEDGER-003`, () => {
    const { store, entries } = filled(make);
    assert.throws(() => store.write({ ...entries[2]!, seq: 5 }), isSequence);
    assert.equal([...store.read()].length, 3);
  });

  test(`${name}: stored entries cannot be mutated through what the store returns @CE-LEDGER-003`, () => {
    const { store } = filled(make);
    const last = store.last()!;
    (last.payload as Record<string, number>).n = 99;
    for (const r of store.read()) if (!r.malformed) (r.value as Entry).seq = 42;
    assert.deepEqual(store.last()!.payload, { n: 3 });
    assert.equal(new Ledger(store).verify().ok, true);
  });
}

test('FileStore: a reopened file continues the chain @CE-LEDGER-003', () => {
  const path = tempFile();
  const clock = fixedClock();
  new Ledger(new FileStore(path), { clock }).append({ type: 't', actor: 'a', payload: 1 });
  const reopened = new Ledger(new FileStore(path), { clock });
  assert.equal(reopened.append({ type: 't', actor: 'a', payload: 2 }).seq, 2);
  assert.equal(reopened.verify().ok, true);
});

test('FileStore: refuses to append after a malformed last line @CE-LEDGER-003', () => {
  const path = tempFile();
  new Ledger(new FileStore(path), { clock: fixedClock() }).append({ type: 't', actor: 'a', payload: 1 });
  appendFileSync(path, '{"v":1,"seq":2,"at');
  const store = new FileStore(path);
  assert.throws(
    () => new Ledger(store).append({ type: 't', actor: 'a', payload: 2 }),
    (e: unknown) => e instanceof LedgerError && e.code === 'corrupt',
  );
});
