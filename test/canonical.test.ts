import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize } from '../src/ledger/canonical.ts';
import { LedgerError } from '../src/ledger/types.ts';

test('object keys are sorted by code unit at every depth @CE-LEDGER-002', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [true, null], c: 'x' } }), '{"a":{"c":"x","d":[true,null]},"b":1}');
  assert.equal(canonicalize({ b: 'x', a: 1 }), canonicalize({ a: 1, b: 'x' }));
  // Code-unit order, not locale: uppercase sorts before lowercase, and a surrogate pair before U+FFFD.
  assert.equal(canonicalize({ a: 1, B: 2 }), '{"B":2,"a":1}');
  assert.equal(canonicalize({ '�': 1, '\u{1F600}': 2 }), '{"\u{1F600}":2,"�":1}');
});

test('numbers use ECMAScript formatting @CE-LEDGER-002', () => {
  assert.equal(canonicalize([1, 1.5, -0, 1e21, 1e-7, 100]), '[1,1.5,0,1e+21,1e-7,100]');
});

test('strings are escaped as JSON @CE-LEDGER-002', () => {
  assert.equal(canonicalize('a"b\\c\n\u0001é'), '"a\\"b\\\\c\\n\\u0001é"');
});

for (const [name, value] of [
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['undefined', undefined],
  ['a function', () => 1],
  ['a bigint', 1n],
  ['a symbol', Symbol('s')],
  ['a Date', new Date(0)],
  ['a Map', new Map()],
  ['a class instance', new (class Thing {})()],
  ['a nested undefined', { a: { b: undefined } }],
  ['a sparse array', [1, , 3]],
] as [string, unknown][]) {
  test(`${name} is not canonical JSON data @CE-LEDGER-006`, () => {
    assert.throws(() => canonicalize(value), (e: unknown) => e instanceof LedgerError && e.code === 'invalid');
  });
}

test('a cycle is not canonical JSON data @CE-LEDGER-006', () => {
  const a: Record<string, unknown> = {};
  a.self = a;
  assert.throws(() => canonicalize(a), (e: unknown) => e instanceof LedgerError && e.code === 'invalid');
});

test('a repeated, non-cyclic reference is allowed @CE-LEDGER-006', () => {
  const shared = { x: 1 };
  assert.equal(canonicalize({ a: shared, b: shared }), '{"a":{"x":1},"b":{"x":1}}');
});

test('a null-prototype object is plain data @CE-LEDGER-002', () => {
  const o = Object.create(null);
  o.k = 'v';
  assert.equal(canonicalize(o), '{"k":"v"}');
});
