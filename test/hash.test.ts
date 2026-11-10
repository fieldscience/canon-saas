import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashEntry } from '../src/ledger/hash.ts';
import { GENESIS, type EntryBody } from '../src/ledger/types.ts';

const base: EntryBody = {
  v: 1,
  seq: 1,
  at: '2026-11-10T00:00:00.000Z',
  type: 'decision.recorded',
  actor: 'user:synthetic-001',
  payload: { decision: 'approve', ref: 'REQ-SYN-001' },
  prev: GENESIS,
};

test('Key order does not change the hash @CE-LEDGER-002', () => {
  const a = { ...base, payload: { a: 1, b: 'x' } };
  const b = { ...base, payload: { b: 'x', a: 1 } };
  assert.equal(hashEntry(a), hashEntry(b));
});

test('A known entry hashes to a fixed value @CE-LEDGER-002', () => {
  const canonical =
    '{"actor":"user:synthetic-001","at":"2026-11-10T00:00:00.000Z","payload":{"decision":"approve","ref":"REQ-SYN-001"},' +
    `"prev":"${GENESIS}","seq":1,"type":"decision.recorded","v":1}`;
  const expected = createHash('sha256').update(canonical, 'utf8').digest('hex');
  assert.equal(hashEntry(base), expected);
  // The pinned vector: changing the serialization must break this test, never fork existing ledgers silently.
  assert.equal(hashEntry(base), '7f39e637aebbd4e797c9e491a706533ddec5b6aea20fc01e9f4d22ad7b769261');
});

test('every hashed field changes the hash @CE-LEDGER-002', () => {
  const h = hashEntry(base);
  const variants: EntryBody[] = [
    { ...base, seq: 2 },
    { ...base, at: '2026-11-10T00:00:01.000Z' },
    { ...base, type: 'decision.revoked' },
    { ...base, actor: 'user:synthetic-002' },
    { ...base, payload: { decision: 'reject', ref: 'REQ-SYN-001' } },
    { ...base, prev: '1'.repeat(64) },
  ];
  for (const v of variants) assert.notEqual(hashEntry(v), h);
});

test('a hash field on the input is ignored @CE-LEDGER-002', () => {
  assert.equal(hashEntry({ ...base, hash: 'x' } as EntryBody), hashEntry(base));
});
