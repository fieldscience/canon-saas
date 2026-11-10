# Canon Engine

Canon: governance for the Agentic Development Life Cycle. Agents do the work, people own the decisions, and Canon proves it.

This repo holds the engine. Its rules:

- **Deterministic.** No LLM calls. The same inputs give the same outputs on any machine.
- **Self-hosted and air-gap capable.** Node.js standard library only at run time; no network calls.
- **Tool-agnostic.** No GitHub, Azure DevOps, GitLab or Jira logic in the engine. Adapters translate tool events.
- **Domain-neutral.** Nothing software-specific in the core, so the same engine can govern hardware, devices or program work.
- **No product logic in clients.** Clients and plugins call the engine; rules live here.

## The ledger

A hash-chained, append-only record of governance events (`src/ledger/`). Each entry links to the previous one by SHA-256 over a canonical JSON serialization, so any change, removal, insertion or reordering is detectable.

```ts
import { Ledger, FileStore } from '@fieldscience/canon-engine';

const ledger = new Ledger(new FileStore('governance.jsonl'));
ledger.append({ type: 'decision.recorded', actor: 'person:synthetic-001', payload: { ref: 'REQ-SYN-001', decision: 'approve' } });

const head = ledger.head();          // record this somewhere else to detect truncation or a rewrite later
const result = ledger.verify(head);  // { ok: true, count, head } or { ok: false, seq, reason, detail }
```

Requirements: `docs/changes/1/requirements/reqs.md` (CE-LEDGER-001 to 008). Design: `docs/changes/1/superpowers/specs/`.

## Develop

Node ≥ 22.18 (TypeScript runs through Node's built-in type stripping; no build step).

```
npm ci
npm run typecheck
npm test
```

Every test is titled with the requirement ID it proves (`@CE-LEDGER-00n`). Canon (`/canon:*`, from `fieldscience/marketplace`) governs this repo; see `.canon.json`.
