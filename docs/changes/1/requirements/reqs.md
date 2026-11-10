---
type: feature
issue: 1
parent:
owner:
ado:
requirements: [CE-LEDGER-001, CE-LEDGER-002, CE-LEDGER-003, CE-LEDGER-004, CE-LEDGER-005, CE-LEDGER-006, CE-LEDGER-007, CE-LEDGER-008]
reference: []
canonized:
prs: []
---
# Hash-chained, append-only ledger

## ADDED

### CE-LEDGER-001 <a id="ce-ledger-001"></a>
**Requirement:** When a client appends an entry, Canon Engine shall record it with a sequence number one greater than the head's and with the head's hash as its previous hash.

| Field | Value |
|---|---|
| Decision | Proposed |
| Kind | audit |
| Verify | test |
| Depends on | CE-LEDGER-002 |
| Blocked by | — |
| Supersedes | — |
| Source | — |
| Provenance | interviewed · authority: owner |
| Cites | owner: Darrin Brandon 2026-11-10; issue: #1; concern: 2 |
| How found | Stated by Darrin Brandon in the Canon SaaS handoff of 2026-11-10 ("First build: the hash-chained, append-only ledger") and restated in issue #1 "In scope". |
| Notes | The first entry has sequence 1 and a previous hash of 64 zeros (the genesis hash). The engine treats `type`, `actor` and `payload` as opaque; their meaning belongs to packs and adapters, never the ledger. |

```gherkin
@CE-LEDGER-001
Scenario: The first entry links to the genesis hash
  Given an empty ledger
  When a client appends an entry of type "decision.recorded" by actor "user:synthetic-001"
  Then the ledger holds 1 entry
  And the entry has sequence 1
  And the entry's previous hash is 64 zeros

@CE-LEDGER-001
Scenario: A later entry links to the head
  Given a ledger whose head has sequence 3 and hash H3
  When a client appends an entry of type "gate.passed" by actor "agent:synthetic-bot"
  Then the new entry has sequence 4
  And the new entry's previous hash is H3
```

### CE-LEDGER-002 <a id="ce-ledger-002"></a>
**Requirement:** Canon Engine shall compute each entry's hash as the SHA-256 of a canonical serialization of the entry's format version, sequence, time, type, actor, payload and previous hash, so that equal entries hash identically on any machine.

| Field | Value |
|---|---|
| Decision | Proposed |
| Kind | audit |
| Verify | test |
| Depends on | — |
| Blocked by | — |
| Supersedes | — |
| Source | — |
| Provenance | interviewed · authority: owner |
| Cites | owner: Darrin Brandon 2026-11-10; issue: #1; concern: 20; concern: 21 |
| How found | Stated by Darrin Brandon in the handoff of 2026-11-10 (engine rule: deterministic code, no LLM calls, air-gap capable) and issue #1 "In scope" (deterministic hashing). |
| Notes | The canonical serialization is JSON with object keys sorted by UTF-16 code unit, no whitespace, and ECMAScript number formatting, the subset of RFC 8785 (JCS) that the accepted payload types need. Key order in the caller's object never changes the hash. The time is supplied by an injected clock, so a hash never depends on when it is recomputed. |

```gherkin
@CE-LEDGER-002
Scenario: Key order does not change the hash
  Given two entries with sequence 1, time 2026-11-10T00:00:00.000Z, type "decision.recorded", actor "user:synthetic-001" and previous hash of 64 zeros
  And the first has payload {"a": 1, "b": "x"} and the second has payload {"b": "x", "a": 1}
  When Canon Engine hashes both
  Then both hashes are equal

@CE-LEDGER-002
Scenario: A known entry hashes to a fixed value
  Given the entry with format version 1, sequence 1, time 2026-11-10T00:00:00.000Z, type "decision.recorded", actor "user:synthetic-001", payload {"decision": "approve", "ref": "REQ-SYN-001"} and previous hash of 64 zeros
  When Canon Engine hashes it
  Then the hash equals the SHA-256 of its canonical serialization, recorded as a test vector
```

### CE-LEDGER-003 <a id="ce-ledger-003"></a>
**Requirement:** If a store is asked to write an entry whose sequence is not exactly one greater than its last entry's, then Canon Engine shall refuse the write and leave the store unchanged.

| Field | Value |
|---|---|
| Decision | Proposed |
| Kind | validation |
| Verify | test |
| Depends on | CE-LEDGER-001 |
| Blocked by | — |
| Supersedes | — |
| Source | — |
| Provenance | interviewed · authority: owner |
| Cites | owner: Darrin Brandon 2026-11-10; issue: #1; concern: 18; concern: 23 |
| How found | Stated by Darrin Brandon in the handoff of 2026-11-10 ("append-only ledger") and issue #1 "In scope" ("No update or delete"). |
| Notes | The ledger and its stores expose no update or delete operation; this requirement covers the only write path, so an existing sequence can never be overwritten. Retention: entries are never deleted by the engine (concern 18). Someone with raw disk access can still edit a file; CE-LEDGER-005 and CE-LEDGER-007 make that detectable. |

```gherkin
@CE-LEDGER-003
Scenario: Overwriting an existing sequence is refused
  Given a store holding entries 1 to 3
  When something asks the store to write an entry with sequence 2
  Then the write is refused
  And the store still holds the original entries 1 to 3

@CE-LEDGER-003
Scenario: Skipping a sequence is refused
  Given a store holding entries 1 to 3
  When something asks the store to write an entry with sequence 5
  Then the write is refused
  And the store still holds 3 entries
```

### CE-LEDGER-004 <a id="ce-ledger-004"></a>
**Requirement:** When verification is requested, Canon Engine shall report the ledger intact only if, from sequence 1 to the head, every entry's sequence is consecutive, its previous hash equals its predecessor's hash, and its hash recomputes to the stored value.

| Field | Value |
|---|---|
| Decision | Proposed |
| Kind | audit |
| Verify | test |
| Depends on | CE-LEDGER-002 |
| Blocked by | — |
| Supersedes | — |
| Source | — |
| Provenance | interviewed · authority: owner |
| Cites | owner: Darrin Brandon 2026-11-10; issue: #1; concern: 23 |
| How found | Stated by Darrin Brandon in the handoff of 2026-11-10 ("hash-chained") and issue #1 "In scope" ("Verify the whole chain"). |
| Notes | An intact report carries the entry count and the head's sequence and hash. An empty ledger is intact with count 0. Verification reads only the store; it needs no network. |

```gherkin
@CE-LEDGER-004
Scenario: An untouched ledger verifies intact
  Given a ledger with 5 appended entries
  When verification is requested
  Then the ledger is reported intact
  And the report gives count 5 and the head's sequence and hash
```

### CE-LEDGER-005 <a id="ce-ledger-005"></a>
**Requirement:** If verification finds an entry that breaks the chain, then Canon Engine shall report the ledger broken, naming the first breaking sequence number and the reason.

| Field | Value |
|---|---|
| Decision | Proposed |
| Kind | audit |
| Verify | test |
| Depends on | CE-LEDGER-004 |
| Blocked by | — |
| Supersedes | — |
| Source | — |
| Provenance | interviewed · authority: owner |
| Cites | owner: Darrin Brandon 2026-11-10; issue: #1; concern: 12; concern: 23 |
| How found | Stated by Darrin Brandon in the handoff of 2026-11-10 ("hash-chained, append-only") and issue #1 "In scope" ("naming the first broken entry and why"). The unwanted-behavior twin of CE-LEDGER-004. |
| Notes | Reasons: `sequence` (a gap, repeat or reorder; the reported sequence is the one expected at that position), `previous-hash` (does not link to the predecessor), `hash` (contents altered), `malformed` (a record that cannot be read as an entry, such as a torn last line in a file store). |

```gherkin
@CE-LEDGER-005
Scenario: An altered payload is caught
  Given a ledger with 5 appended entries
  And entry 3's payload has been edited on disk
  When verification is requested
  Then the ledger is reported broken at sequence 3 with reason "hash"

@CE-LEDGER-005
Scenario: A removed entry is caught
  Given a ledger with 5 appended entries
  And entry 3 has been removed on disk
  When verification is requested
  Then the ledger is reported broken at sequence 3 with reason "sequence"

@CE-LEDGER-005
Scenario: A rehashed forgery is caught by the next link
  Given a ledger with 5 appended entries
  And entry 3's payload has been edited and its hash recomputed on disk
  When verification is requested
  Then the ledger is reported broken at sequence 4 with reason "previous-hash"
```

### CE-LEDGER-006 <a id="ce-ledger-006"></a>
**Requirement:** If an append has an empty type, an empty actor, or a payload that is not canonical JSON data, then Canon Engine shall refuse the append and record nothing.

| Field | Value |
|---|---|
| Decision | Proposed |
| Kind | validation |
| Verify | test |
| Depends on | CE-LEDGER-002 |
| Blocked by | — |
| Supersedes | — |
| Source | — |
| Provenance | inferred · authority: concern |
| Cites | issue: #1; concern: 9; concern: 20 |
| How found | Raised by concerns 9 (intake contracts) and 20 (determinism) while extracting issue #1: a value with no canonical form, such as NaN, undefined or a Date object, would make a hash depend on the runtime. |
| Notes | Canonical JSON data is null, a boolean, a string, a finite number, an array of canonical JSON data, or a plain object whose values are canonical JSON data. An actor is required because "people own the decisions": every entry names who or what acted. A time from the clock that is not an ISO 8601 UTC string is refused the same way. |

```gherkin
@CE-LEDGER-006
Scenario: A payload with a non-finite number is refused
  Given a ledger with 2 appended entries
  When a client appends an entry of type "metric.recorded" by actor "agent:synthetic-bot" with payload {"score": NaN}
  Then the append is refused
  And the ledger still holds 2 entries

@CE-LEDGER-006
Scenario: An entry without an actor is refused
  Given an empty ledger
  When a client appends an entry of type "decision.recorded" with an empty actor
  Then the append is refused
  And the ledger holds 0 entries
```

### CE-LEDGER-007 <a id="ce-ledger-007"></a>
**Requirement:** When verification is given a previously recorded head, Canon Engine shall report the ledger broken unless the entry at that head's sequence has that head's hash.

| Field | Value |
|---|---|
| Decision | Proposed |
| Kind | audit |
| Verify | test |
| Depends on | CE-LEDGER-004 |
| Blocked by | — |
| Supersedes | — |
| Source | — |
| Provenance | inferred · authority: concern |
| Cites | issue: #1; concern: 23 |
| How found | Raised by concern 23 (tamper evidence) while extracting issue #1: a chain verifies only against itself, so someone who rewrites every entry from genesis, or truncates the tail, passes CE-LEDGER-004. Comparing with a head recorded elsewhere (a PR comment, a release note, an auditor's file) closes that gap. |
| Notes | Reasons: `truncated` (the ledger no longer reaches that sequence) and `checkpoint` (the entry there has a different hash). A head is the pair of sequence and hash that CE-LEDGER-004 reports. |

```gherkin
@CE-LEDGER-007
Scenario: A truncated ledger fails against a recorded head
  Given a ledger with 5 appended entries whose head was recorded as sequence 5 and hash H5
  And entries 4 and 5 have been removed on disk
  When verification is requested against the recorded head
  Then the ledger is reported broken at sequence 5 with reason "truncated"

@CE-LEDGER-007
Scenario: A rewritten ledger fails against a recorded head
  Given a ledger with 3 appended entries whose head was recorded as sequence 3 and hash H3
  And the whole ledger has been rewritten from genesis with a different entry 2
  When verification is requested against the recorded head
  Then the ledger is reported broken at sequence 3 with reason "checkpoint"
```

### CE-LEDGER-008 <a id="ce-ledger-008"></a>
**Requirement:** If an append names an expected head hash that differs from the current head's hash, then Canon Engine shall refuse the append and record nothing.

| Field | Value |
|---|---|
| Decision | Proposed |
| Kind | validation |
| Verify | test |
| Depends on | CE-LEDGER-001 |
| Blocked by | — |
| Supersedes | — |
| Source | — |
| Provenance | inferred · authority: concern |
| Cites | issue: #1; concern: 10 |
| How found | Raised by concern 10 (idempotency and reprocessing) while extracting issue #1: an adapter that retries after a timeout, or two writers that read the same head, must not both append on top of it unknowingly. |
| Notes | Naming an expected head is optional; without it the append goes on top of whatever the head is. One writing process per ledger file is assumed; a cross-process lock is out of scope for #1. |

```gherkin
@CE-LEDGER-008
Scenario: An append against a stale head is refused
  Given a ledger whose head has sequence 2 and hash H2
  And a client read that head, then another client appended entry 3
  When the first client appends an entry naming H2 as the expected head
  Then the append is refused
  And the ledger still holds 3 entries
```

## MODIFIED

## RETIRED
