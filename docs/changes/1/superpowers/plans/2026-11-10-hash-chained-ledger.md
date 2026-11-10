---
feature: 1
requirements: [CE-LEDGER-001, CE-LEDGER-002, CE-LEDGER-003, CE-LEDGER-004, CE-LEDGER-005, CE-LEDGER-006, CE-LEDGER-007, CE-LEDGER-008]
reference: []
approved:            # "<name> <YYYY-MM-DD>" once the developer approves; build refuses an empty value
---
# Hash-chained, append-only ledger Implementation Plan

**Goal:** Build the ledger described in `../specs/2026-11-10-hash-chained-ledger-design.md`.

**Architecture:** Pure canonical-JSON and hashing functions; a `Ledger` over one `LedgerStore` port; memory and JSON Lines file stores; a pure verifier. Node standard library only.

**Tech stack:** TypeScript (erasable syntax only) run by Node ≥ 22.18 type stripping; `node:test`; `typescript` as the only dev dependency, for `npm run typecheck`.

Every test is titled with `@<ID>` (jest preset in `.canon.json`). Each task is test-first: write the failing test, run it, implement, run it green.

## Task 1: Project scaffold
- `package.json` (`type: module`, `engines.node >=22.18`, scripts `test`, `test:ci` with the junit reporter to `test-results/junit.xml`, `typecheck`), `tsconfig.json` (`noEmit`, `erasableSyntaxOnly`, `allowImportingTsExtensions`, strict), `.gitignore` adds `node_modules/` and `test-results/`.
- CI workflow `.github/workflows/test.yml`: typecheck, `npm run test:ci`, upload `canon-test-results`.
- Requirements: none (scaffold).

## Task 2: Canonical JSON (CE-LEDGER-002, CE-LEDGER-006)
- Tests `test/canonical.test.ts`: key order independence; nested objects and arrays; number formatting; refusal of NaN, Infinity, undefined, function, bigint, Date, Map, class instance, cycles.
- Implement `src/ledger/canonical.ts`.

## Task 3: Entry hashing (CE-LEDGER-002)
- Tests `test/hash.test.ts`: payload key order gives equal hashes; fixed test vector; any field change changes the hash.
- Implement `src/ledger/types.ts`, `src/ledger/hash.ts`.

## Task 4: Stores refuse out-of-sequence writes (CE-LEDGER-003)
- Tests `test/stores.test.ts`, run against MemoryStore and FileStore: overwrite of seq 2 refused, skip to seq 5 refused, store unchanged; FileStore reopens and continues; FileStore refuses to append after a malformed last line.
- Implement `src/ledger/stores/memory.ts`, `src/ledger/stores/file.ts`.

## Task 5: Append (CE-LEDGER-001, CE-LEDGER-006, CE-LEDGER-008)
- Tests `test/ledger.test.ts`: genesis link; later link; invalid type/actor/payload/clock refused with nothing recorded; stale expected head refused; matching expected head accepted.
- Implement `src/ledger/ledger.ts`.

## Task 6: Verify (CE-LEDGER-004, CE-LEDGER-005, CE-LEDGER-007)
- Tests `test/verify.test.ts`, against the FileStore with on-disk tampering: intact; altered payload → `hash` at 3; removed entry → `sequence` at 4; rehashed forgery → `previous-hash` at 4; reordered entries; torn last line → `malformed`; truncated vs recorded head → `truncated`; rewritten from genesis → `checkpoint`; empty ledger intact.
- Implement `src/ledger/verify.ts`, `src/index.ts`.

## Task 7: Check and hand off
- Run `npm run typecheck`, `npm run test:ci`, then `canon check` (must exit 0 or 2). Stop and hand off to `/canon:close`.
