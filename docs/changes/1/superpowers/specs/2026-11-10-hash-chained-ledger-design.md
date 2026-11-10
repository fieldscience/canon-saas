---
feature: 1
requirements: [CE-LEDGER-001, CE-LEDGER-002, CE-LEDGER-003, CE-LEDGER-004, CE-LEDGER-005, CE-LEDGER-006, CE-LEDGER-007, CE-LEDGER-008]
reference: []
---
# Hash-chained, append-only ledger — design

## 1. Purpose

The ledger is the engine's record of governance events: an agent opened a change, a gate passed, a person approved a decision. Its job is to make that record **tamper-evident**: anyone holding the ledger (and, ideally, a head recorded somewhere else) can prove that no entry was changed, removed, inserted or reordered since it was written. Every later Canon feature (decisions, gates, evidence packs, certification) writes here.

## 2. Engine rules this design follows

| Rule | How |
|---|---|
| Deterministic, no LLM calls | Pure functions for serialization, hashing and verification. Time comes from an injected clock and is stored in the entry, so recomputing a hash never reads the clock. |
| Self-hosted, air-gap capable | Node.js standard library only (`node:crypto`, `node:fs`). No runtime dependencies, no network calls. TypeScript runs through Node's built-in type stripping (Node ≥ 22.18), so there is no build step to ship. |
| Tool-agnostic | The ledger knows nothing about GitHub, Azure DevOps, GitLab or Jira. `type`, `actor` and `payload` are opaque. Adapters (later) translate tool events into appends. |
| No product logic in clients | All rules live in `src/ledger/`. Clients only call `append`, `head` and `verify`. |

## 3. Entry format (CE-LEDGER-001, CE-LEDGER-002)

```ts
interface Entry {
  v: 1;              // format version; part of the hash
  seq: number;       // 1, 2, 3, … (CE-LEDGER-001)
  at: string;        // ISO 8601 UTC from the injected clock
  type: string;      // non-empty, opaque, e.g. "decision.recorded"
  actor: string;     // non-empty, opaque, e.g. "user:…" or "agent:…"
  payload: Json;     // canonical JSON data (CE-LEDGER-006)
  prev: string;      // hash of entry seq-1; GENESIS (64 zeros) for seq 1
  hash: string;      // sha256 hex of canonical({v, seq, at, type, actor, payload, prev})
}
```

**Canonical serialization** (`src/ledger/canonical.ts`, CE-LEDGER-002): JSON with object keys sorted by UTF-16 code unit, no insignificant whitespace, strings escaped by `JSON.stringify`, numbers by ECMAScript `Number.prototype.toString` (which is what RFC 8785 specifies). It throws on anything outside canonical JSON data: `undefined`, functions, symbols, bigint, `NaN`/`±Infinity`, and objects whose prototype is not `Object.prototype` or `null` (so `Date`, `Map`, class instances are refused, CE-LEDGER-006). Cyclic structures are refused.

**Hash** (`src/ledger/hash.ts`): `sha256(utf8(canonical(body)))`, lowercase hex. A test vector pins the value for a fixed entry so any future change to serialization breaks a test instead of silently forking old ledgers.

## 4. Components

```
src/ledger/
  canonical.ts   canonical JSON (CE-LEDGER-002, CE-LEDGER-006)
  hash.ts        entry hashing, GENESIS (CE-LEDGER-002)
  types.ts       Entry, Head, VerifyResult, LedgerStore, LedgerError
  ledger.ts      Ledger: append, head, verify (CE-LEDGER-001, -004..-008)
  verify.ts      pure verifyEntries(entries, checkpoint?) (CE-LEDGER-004, -005, -007)
  stores/
    memory.ts    MemoryStore (CE-LEDGER-003)
    file.ts      FileStore, JSON Lines (CE-LEDGER-003, -005 "malformed")
src/index.ts     public exports
```

### 4.1 `LedgerStore` (the only port)

```ts
interface LedgerStore {
  last(): Entry | undefined;        // head entry, or undefined when empty
  write(entry: Entry): void;        // refuses unless entry.seq === (last()?.seq ?? 0) + 1
  read(): Iterable<RawRecord>;      // every stored record in order, for verify
}
```

`write` is the only mutation. There is no update or delete anywhere in the API. **CE-LEDGER-003**: each store checks the sequence before writing and throws `LedgerError("sequence")` without touching storage.

`read` yields `RawRecord`: either a parsed object or `{ malformed: true, line }`, so verification can report a torn or garbage record (CE-LEDGER-005 reason `malformed`) instead of crashing.

- **MemoryStore**: an array; `read` yields deep copies so a caller cannot mutate stored entries.
- **FileStore**: one canonical JSON entry per line (`.jsonl`). Opens with `appendFileSync` (O_APPEND) and `fsync`s after each write. On construction it scans the file once to find the last entry. A store whose last line is malformed refuses further writes until someone deals with it: appending after corruption would bury it.

One writing process per ledger file is assumed (CE-LEDGER-008 Notes). Synchronous file I/O means one process cannot interleave two appends.

### 4.2 `Ledger`

```ts
new Ledger(store: LedgerStore, opts?: { clock?: () => string })
ledger.append({ type, actor, payload, expectedHead? }): Entry
ledger.head(): Head            // { seq: 0, hash: GENESIS } when empty
ledger.verify(checkpoint?: Head): VerifyResult
```

`append` (CE-LEDGER-001):
1. Validate `type` and `actor` are non-empty strings and canonicalize `payload`; refuse with `LedgerError("invalid")` otherwise (CE-LEDGER-006). Validate the clock returned an ISO 8601 UTC string.
2. If `expectedHead` is given and differs from the current head hash, refuse with `LedgerError("conflict")` (CE-LEDGER-008).
3. Build the entry with `seq = head.seq + 1`, `prev = head.hash`, compute `hash`, `store.write(entry)`.

Every refusal happens before `store.write`, so nothing is recorded.

The default clock is `() => new Date().toISOString()`. Tests inject a fixed clock.

### 4.3 Verification (CE-LEDGER-004, CE-LEDGER-005, CE-LEDGER-007)

`verifyEntries(records, checkpoint?)` walks records in order, tracking `expectedSeq` (starting at 1) and `expectedPrev` (starting at GENESIS). For each record, the first failing check wins:

1. Not a well-formed entry (wrong field types, unknown `v`) → `malformed`.
2. `seq !== expectedSeq` → `sequence`.
3. `prev !== expectedPrev` → `previous-hash`.
4. Recomputed hash `!== hash` → `hash`.

It stops at the first break and returns `{ ok: false, seq, reason, detail }` (CE-LEDGER-005). If the walk completes it returns `{ ok: true, count, head }` (CE-LEDGER-004).

Given a `checkpoint` (CE-LEDGER-007), after the walk:
- intact chain shorter than `checkpoint.seq` → `{ ok: false, seq: checkpoint.seq, reason: "truncated" }`;
- the entry at `checkpoint.seq` has a different hash → `{ ok: false, seq: checkpoint.seq, reason: "checkpoint" }`.

A checkpoint of `{ seq: 0 }` always passes. Chain breaks are reported ahead of checkpoint failures.

Why check `prev` before `hash`: a forger who edits entry 3 and recomputes its hash leaves entry 3 internally consistent; the break shows at entry 4's `prev` (scenario "A rehashed forgery is caught by the next link"). An unhashed edit shows at entry 3 itself.

## 5. Errors

`LedgerError` carries a `code`: `invalid` (CE-LEDGER-006), `conflict` (CE-LEDGER-008), `sequence` (CE-LEDGER-003), `corrupt` (FileStore refusing to append after a malformed last line). Verification never throws for chain problems; it returns a result.

## 6. Testing

`node --test` (built in), tests in `test/**/*.test.ts`, every test titled with its requirement ID (`@CE-LEDGER-00n`), JUnit results written to `test-results/` by the built-in `junit` reporter. Each scenario in the delta has at least one test, run against both stores where storage matters. All data is synthetic.

## 7. Out of scope (see issue #1)

Signatures and key management; external anchoring or timestamping services; multi-process locking; database stores; a CLI or HTTP API; event-type semantics. Each is a later feature that builds on this interface.

## 8. Concerns walk

| # | Concern | Disposition |
|---|---|---|
| 1 | PHI and minimum necessary | n/a for the engine: payloads are opaque. Packs that carry regulated data decide what goes in a payload. Tests use synthetic data only. |
| 2 | Audit | The ledger is the audit record; every entry names its `actor` (CE-LEDGER-001, CE-LEDGER-006). |
| 3–7 | Member identity, client config, drug ID, benefit, eligibility | n/a: healthcare-specific, not part of the engine. |
| 8 | System of record | The ledger is the system of record for governance events; nothing else owns them. |
| 9 | Intake contracts | CE-LEDGER-006. |
| 10 | Idempotency and reprocessing | CE-LEDGER-008 (expected head). |
| 11 | Salesforce limits | n/a. |
| 12 | Error states and operator visibility | CE-LEDGER-005 names the first break and why. |
| 13 | Environment divergence | n/a: no environment-specific behavior or flags. |
| 14 | Partner obligations | n/a for #1. |
| 15 | Time | Time is injected and stored as ISO 8601 UTC; hashing never reads the clock (CE-LEDGER-002). |
| 16 | Access and secrets | n/a: no secrets; file permissions are the host's. |
| 17 | Legacy parity | n/a: new system. |
| 18 | Retention and deletion | No delete exists; entries are kept forever (CE-LEDGER-003 Notes). |
| 19 | UI states | n/a: no UI. |
| 20 | Determinism | CE-LEDGER-002, CE-LEDGER-006. |
| 21 | Air-gap | §2: standard library only, no network. |
| 22 | Tool-agnostic | §2: no tool logic in `src/ledger/`. |
| 23 | Tamper evidence | CE-LEDGER-003, -004, -005, -007. |
