# Scope: Milestone 1 — Core Engine Data Models, 7 Decoupled Ownership Concepts & 0-100 Evidence Scoring Model

## Architecture
- `src/shared/types.ts`: Core data structures (`EvidenceSignal`, `OriginCandidateDetailed`, `DecoupledOwnershipModel`, `ScanResult`, `CandidateClassification`).
- `src/server/engine/scoring.ts`: Deterministic 0-100 evidence scoring model $S = \max(0, \min(100, \sum P - \sum N))$.
- `src/server/engine/ownership.ts`: Decoupled 7 ownership concepts (Domain, IP Allocation, ASN Operation, Network Operation, Hosting Provider, Application Origin, Physical Location) with independent 0-100% confidence metrics.
- `src/tests/scoring.test.ts`: Unit tests for evidence scoring.
- `src/tests/ownership.test.ts`: Unit tests for 7 decoupled ownership concepts.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Evidence & Contradiction Scoring Model | Deterministic 0-100 score model with positive weights (+30 TLS SAN, +25 HTTP, +20 Subdomain, +15 PTR, +10 ASN) and contradiction penalties (-30 CDN ASN, -25 WAF, -20 Generic page, -15 Cert mismatch) | M1 | R1 |
| 2 | Decoupled 7 Ownership Concepts | Explicit separation of Domain Ownership, IP Allocation, ASN Ownership, Network Operation, Hosting Provider, Application Origin IP, and Physical Infrastructure Location with separate 0-100% confidence scores | M1 | R2 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Engine & Decoupled Ownership | `src/shared/types.ts`, `src/server/engine/scoring.ts`, `src/server/engine/ownership.ts`, unit tests | None | IN_PROGRESS |

## Interface Contracts
Defined in `PROJECT.md § Interface Contracts` and `spec_analysis.md`.
