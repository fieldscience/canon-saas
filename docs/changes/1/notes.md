# Notes for 1

Committed summary of decisions. Verbatim notes stay in raw/, which is gitignored.

| Date | Who | Decision |
|---|---|---|
| 2026-11-10 | Darrin Brandon (Product) | First build is the hash-chained, append-only ledger, specced and built through the Canon flow. Engine rules: deterministic with no LLM calls; self-hosted and air-gap capable; tool-agnostic adapters; no product logic in clients. (Canon SaaS handoff.) |
| 2026-11-10 | Darrin Brandon (Product) | Build first and open a PR. The flow's approval stops (issue, extract, spec, plan) are collapsed into review of the delivering PR; every requirement stays `Decision: Proposed` until Darrin approves it there. |
| 2026-11-10 | Spec author's calls, for Darrin Brandon's review with the PR | Prefix `CE` (Canon Engine), category `LEDGER`; the repo is not yet in the marketplace prefix registry. CE-LEDGER-006, -007 and -008 come from the concerns walk (9/20, 23, 10), not from an owner statement. Language: TypeScript on Node ≥ 22.18 with built-in type stripping and no runtime dependencies, so the engine ships with no build step and no package fetch. Repo concerns 20–23 (determinism, air-gap, tool-agnostic, tamper evidence) added to `.canon.json`. |
| 2026-11-10 | Darrin Brandon (Product) | Canon may govern more than software (hardware and devices, government and intelligence work). The ledger stays domain-neutral: `type`, `actor` and `payload` are opaque, and nothing software-specific (commits, PRs, repos) is in the core; those belong in adapters and packs. |
