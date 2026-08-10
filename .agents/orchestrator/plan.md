# Execution Plan — domain_check

## Objective
Re-architect the Origin / Hosting / Ownership Correlation Engine to use an evidence-based scoring model (0-100), explicitly distinguishing between domain ownership, IP allocation, ASN operation, hosting provider, application origin, and physical location.

## Phases

### Phase 0: Survey & Discovery
- Dispatch 2 `teamwork_preview_explorer` and 1 `teamwork_preview_spec_miner` in parallel.
- Explorer 1: Inspect backend correlation engine, existing data models, correlation sources, and build/test tools.
- Explorer 2: Inspect frontend structure, UI components, state management, router, and documentation/help system.
- Spec Miner 1: Mine precise technical requirements, data models, evidence weights, and pipeline stages from `ORIGINAL_REQUEST.md` and codebase specs.

### Phase 1: Architecture & Decomposition
- Synthesize survey reports into `PROJECT.md` at project root.
- Define Architecture, Feature Inventory, Code Layout, Interface Contracts, and Milestone Decomposition.

### Phase 2: Dual Track Execution
- **E2E Testing Track**: Build comprehensive opaque-box test suite across 4 Tiers (Feature coverage, Boundary/Corner, Pairwise combinations, Real-world scenarios) -> Publish `TEST_READY.md`.
- **Implementation Track**:
  - Milestone 1: Evidence & Contradiction Scoring Model (0-100) & Ownership Concept Separation (Domain, IP, ASN, Provider, Origin, Location).
  - Milestone 2: Multi-Stage Pipeline (Passive -> Candidate Gen -> Cheap Enrichment -> Candidate Scoring -> Expensive Verification -> Final Ranking) & Expanded Sources (DNS, SAN/Issuer, HTTP fingerprinting, BGP/RIPE subleased, PTR, MX categorization).
  - Milestone 3: Frontend UI Evidence Breakdown & Method Explanation Documentation Page.

### Phase 3: Final E2E Verification & Adversarial Hardening
- Phase 1: Verify 100% E2E test suite pass across all Tiers.
- Phase 2: Adversarial Coverage Hardening (Tier 5) with Challenger -> Worker -> Reviewer -> Forensic Auditor.

### Phase 4: Project Victory Claim
- Report complete results to parent and human reporter.
