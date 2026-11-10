import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync } from 'node:fs';
import { hashEntry } from '../src/ledger/hash.ts';
import { Ledger } from '../src/ledger/ledger.ts';
import { MemoryStore } from '../src/ledger/stores/memory.ts';
import { FileStore } from '../src/ledger/stores/file.ts';
import { verifyEntries } from '../src/ledger/verify.ts';
import { GENESIS, type EntryBody } from '../src/ledger/types.ts';
import { fileLedger, fixedClock, readLines, reopen, tempFile, writeLines } from './helpers.ts';

test('An untouched ledger verifies intact @CE-LEDGER-004', () => {
  const { path, ledger } = fileLedger(5);
  const head = ledger.head();
  assert.deepEqual(reopen(path).verify(), { ok: true, count: 5, head });
  assert.equal(head.seq, 5);
});

test('an empty ledger verifies intact with count 0 @CE-LEDGER-004', () => {
  assert.deepEqual(new Ledger(new MemoryStore()).verify(), { ok: true, count: 0, head: { seq: 0, hash: GENESIS } });
});

test('verifying twice gives the same result @CE-LEDGER-004', () => {
  const { path } = fileLedger(3);
  assert.deepEqual(reopen(path).verify(), reopen(path).verify());
});

test('An altered payload is caught @CE-LEDGER-005', () => {
  const { path } = fileLedger(5);
  const lines = readLines(path);
  lines[2]!.payload = { ref: 'REQ-SYN-003', decision: 'reject' };
  writeLines(path, lines);
  assert.deepEqual(pick(reopen(path).verify()), { ok: false, seq: 3, reason: 'hash' });
});

test('A removed entry is caught @CE-LEDGER-005', () => {
  const { path } = fileLedger(5);
  const lines = readLines(path);
  lines.splice(2, 1);
  writeLines(path, lines);
  assert.deepEqual(pick(reopen(path).verify()), { ok: false, seq: 3, reason: 'sequence' });
});

test('A rehashed forgery is caught by the next link @CE-LEDGER-005', () => {
  const { path } = fileLedger(5);
  const lines = readLines(path);
  const e3 = lines[2]!;
  e3.payload = { ref: 'REQ-SYN-003', decision: 'reject' };
  e3.hash = hashEntry(e3 as unknown as EntryBody);
  writeLines(path, lines);
  assert.deepEqual(pick(reopen(path).verify()), { ok: false, seq: 4, reason: 'previous-hash' });
});

test('reordered entries are caught @CE-LEDGER-005', () => {
  const { path } = fileLedger(5);
  const lines = readLines(path);
  [lines[1], lines[2]] = [lines[2]!, lines[1]!];
  writeLines(path, lines);
  assert.deepEqual(pick(reopen(path).verify()), { ok: false, seq: 2, reason: 'sequence' });
});

test('an inserted entry is caught @CE-LEDGER-005', () => {
  const { path } = fileLedger(3);
  const lines = readLines(path);
  lines.splice(1, 0, { ...lines[1]! });
  writeLines(path, lines);
  assert.deepEqual(pick(reopen(path).verify()), { ok: false, seq: 3, reason: 'sequence' });
});

test('a torn last line is reported malformed, not thrown @CE-LEDGER-005', () => {
  const { path } = fileLedger(2);
  appendFileSync(path, '{"v":1,"seq":3');
  assert.deepEqual(pick(reopen(path).verify()), { ok: false, seq: 3, reason: 'malformed' });
});

test('records of the wrong shape are reported malformed @CE-LEDGER-005', () => {
  const ok = (value: unknown) => ({ malformed: false as const, value });
  for (const bad of [null, [], 'x', { v: 2 }, { v: 1, seq: 1.5 }, { v: 1, seq: 1, at: '', type: 't', actor: 'a', payload: 1, prev: GENESIS, hash: GENESIS }]) {
    assert.deepEqual(pick(verifyEntries([ok(bad)])), { ok: false, seq: 1, reason: 'malformed' });
  }
});

test('A truncated ledger fails against a recorded head @CE-LEDGER-007', () => {
  const { path, ledger } = fileLedger(5);
  const h5 = ledger.head();
  writeLines(path, readLines(path).slice(0, 3));
  assert.equal(reopen(path).verify().ok, true, 'the truncated chain is internally consistent');
  assert.deepEqual(pick(reopen(path).verify(h5)), { ok: false, seq: 5, reason: 'truncated' });
});

test('A rewritten ledger fails against a recorded head @CE-LEDGER-007', () => {
  const { path, ledger } = fileLedger(3);
  const h3 = ledger.head();
  // Rewrite from genesis with a different entry 2: a fully consistent forgery.
  const forgedPath = tempFile();
  const forged = new Ledger(new FileStore(forgedPath), { clock: fixedClock() });
  forged.append({ type: 'decision.recorded', actor: 'person:synthetic-001', payload: { ref: 'REQ-SYN-001', decision: 'approve' } });
  forged.append({ type: 'decision.recorded', actor: 'person:synthetic-001', payload: { ref: 'REQ-SYN-002', decision: 'reject' } });
  forged.append({ type: 'decision.recorded', actor: 'person:synthetic-001', payload: { ref: 'REQ-SYN-003', decision: 'approve' } });
  assert.equal(forged.verify().ok, true, 'the forgery is internally consistent');
  copyFileSync(forgedPath, path);
  assert.equal(reopen(path).verify().ok, true);
  assert.deepEqual(pick(reopen(path).verify(h3)), { ok: false, seq: 3, reason: 'checkpoint' });
});

test('an earlier recorded head still matches after more appends @CE-LEDGER-007', () => {
  const { path, ledger } = fileLedger(3);
  const h3 = ledger.head();
  ledger.append({ type: 'gate.passed', actor: 'agent:synthetic-bot', payload: {} });
  assert.equal(reopen(path).verify(h3).ok, true);
  assert.equal(reopen(path).verify({ seq: 0, hash: GENESIS }).ok, true);
});

function pick(r: ReturnType<Ledger['verify']>) {
  return r.ok ? { ok: true } : { ok: false, seq: r.seq, reason: r.reason };
}

