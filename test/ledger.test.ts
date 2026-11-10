import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger/ledger.ts';
import { GENESIS, LedgerError, type Json } from '../src/ledger/types.ts';
import { fixedClock, STORES } from './helpers.ts';

const refused = (code: string) => (e: unknown) => e instanceof LedgerError && e.code === code;
const count = (l: Ledger) => l.head().seq;

for (const { name, make } of STORES) {
  test(`${name}: The first entry links to the genesis hash @CE-LEDGER-001`, () => {
    const ledger = new Ledger(make(), { clock: fixedClock() });
    const e = ledger.append({ type: 'decision.recorded', actor: 'user:synthetic-001', payload: { ref: 'REQ-SYN-001' } });
    assert.equal(count(ledger), 1);
    assert.equal(e.seq, 1);
    assert.equal(e.prev, GENESIS);
    assert.equal(e.prev, '0'.repeat(64));
    assert.equal(e.at, '2026-11-10T00:00:00.000Z');
  });

  test(`${name}: A later entry links to the head @CE-LEDGER-001`, () => {
    const ledger = new Ledger(make(), { clock: fixedClock() });
    for (let i = 0; i < 3; i++) ledger.append({ type: 'decision.recorded', actor: 'user:synthetic-001', payload: i });
    const h3 = ledger.head();
    assert.equal(h3.seq, 3);
    const e = ledger.append({ type: 'gate.passed', actor: 'agent:synthetic-bot', payload: null });
    assert.equal(e.seq, 4);
    assert.equal(e.prev, h3.hash);
    assert.deepEqual(ledger.head(), { seq: 4, hash: e.hash });
  });

  test(`${name}: A payload with a non-finite number is refused @CE-LEDGER-006`, () => {
    const ledger = new Ledger(make(), { clock: fixedClock() });
    ledger.append({ type: 'metric.recorded', actor: 'agent:synthetic-bot', payload: { score: 1 } });
    ledger.append({ type: 'metric.recorded', actor: 'agent:synthetic-bot', payload: { score: 2 } });
    assert.throws(() => ledger.append({ type: 'metric.recorded', actor: 'agent:synthetic-bot', payload: { score: Number.NaN } }), refused('invalid'));
    assert.equal(count(ledger), 2);
  });

  test(`${name}: An entry without an actor is refused @CE-LEDGER-006`, () => {
    const ledger = new Ledger(make(), { clock: fixedClock() });
    assert.throws(() => ledger.append({ type: 'decision.recorded', actor: '', payload: {} }), refused('invalid'));
    assert.equal(count(ledger), 0);
  });

  test(`${name}: an empty type, a non-JSON payload or a bad clock is refused @CE-LEDGER-006`, () => {
    const ledger = new Ledger(make(), { clock: fixedClock() });
    assert.throws(() => ledger.append({ type: '', actor: 'a', payload: {} }), refused('invalid'));
    assert.throws(() => ledger.append({ type: 't', actor: 'a', payload: { when: new Date(0) } as unknown as Json }), refused('invalid'));
    assert.throws(() => ledger.append({ type: 't', actor: 'a', payload: undefined as unknown as Json }), refused('invalid'));
    const local = new Ledger(make(), { clock: () => '2026-11-10 09:00' });
    assert.throws(() => local.append({ type: 't', actor: 'a', payload: {} }), refused('invalid'));
    assert.equal(count(ledger), 0);
    assert.equal(count(local), 0);
  });

  test(`${name}: An append against a stale head is refused @CE-LEDGER-008`, () => {
    const ledger = new Ledger(make(), { clock: fixedClock() });
    ledger.append({ type: 't', actor: 'a', payload: 1 });
    ledger.append({ type: 't', actor: 'a', payload: 2 });
    const h2 = ledger.head().hash;
    ledger.append({ type: 't', actor: 'other-client', payload: 3 });
    assert.throws(() => ledger.append({ type: 't', actor: 'a', payload: 4, expectedHead: h2 }), refused('conflict'));
    assert.equal(count(ledger), 3);
  });

  test(`${name}: an append naming the current head is accepted @CE-LEDGER-008`, () => {
    const ledger = new Ledger(make(), { clock: fixedClock() });
    const e1 = ledger.append({ type: 't', actor: 'a', payload: 1, expectedHead: GENESIS });
    const e2 = ledger.append({ type: 't', actor: 'a', payload: 2, expectedHead: e1.hash });
    assert.equal(e2.seq, 2);
  });
}

test('mutating the caller payload after append does not change the record @CE-LEDGER-001', () => {
  const ledger = new Ledger(STORES[0]!.make(), { clock: fixedClock() });
  const payload = { ref: 'REQ-SYN-001' };
  const e = ledger.append({ type: 't', actor: 'a', payload });
  payload.ref = 'changed';
  (e.payload as Record<string, string>).ref = 'changed too';
  assert.equal(ledger.verify().ok, true);
});
