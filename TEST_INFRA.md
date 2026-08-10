# E2E Test Infra: domain_check Correlation Engine

## Test Philosophy
- **Opaque-box & Requirement-Driven**: Tests are designed directly from user requirements (`ORIGINAL_REQUEST.md`) and contract specifications (`PROJECT.md`, `spec_analysis.md`).
- **No Implementation Coupling**: Tests exercise published data contracts (`ScanResult`, `OriginCandidateDetailed`, `DecoupledOwnershipModel`, `EvidenceSignal`) and user-facing features without relying on internal function implementations.
- **Methodology**: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory & Test Coverage Requirements

| # | Feature | Requirement Source | Tier 1 (Coverage) | Tier 2 (Boundaries) | Tier 3 (Pairwise) |
|---|---------|---------------------|:-----------------:|:------------------:|:-----------------:|
| F1 | Evidence & Contradiction Engine (0-100 Score) | R1 | 5 test cases | 5 test cases | ✓ |
| F2 | Decoupled 7 Ownership Concepts & Confidences | R2 | 5 test cases | 5 test cases | ✓ |
| F3 | Expanded Correlation Sources (DNS, TLS, HTTP, BGP) | R3 | 5 test cases | 5 test cases | ✓ |
| F4 | MX Email Infrastructure Isolation | R3 | 5 test cases | 5 test cases | ✓ |
| F5 | 6-Stage Performance Pipeline | R4 | 5 test cases | 5 test cases | ✓ |
| F6 | Frontend UI Score Bars & Evidence Breakdown | R5 | 5 test cases | 5 test cases | ✓ |
| F7 | Frontend UI 7 Ownership Grid & Narrative Verdict | R5 | 5 test cases | 5 test cases | ✓ |
| F8 | Interactive Documentation Page (`/docs`) | R6 | 5 test cases | 5 test cases | ✓ |

## Test Architecture
- **Runner**: Vitest (`npx vitest run src/tests/e2e`)
- **Invocation Command**: `npm test` or `npx vitest run src/tests/e2e`
- **Location**: `src/tests/e2e/`
  - `src/tests/e2e/tier1_features.test.ts` (Tier 1: Feature Coverage)
  - `src/tests/e2e/tier2_boundaries.test.ts` (Tier 2: Boundary & Corner Cases)
  - `src/tests/e2e/tier3_combinations.test.ts` (Tier 3: Cross-Feature Combinations)
  - `src/tests/e2e/tier4_scenarios.test.ts` (Tier 4: Real-World Scenarios)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Key Requirements / Characteristics | Expected Behavior |
|---|----------|------------------------------------|-------------------|
| 1 | Direct-Hosted Domain | Single origin IP, TLS SAN match (+30), HTTP content match (+25), PTR match (+15), no CDN penalties | Score 85–100, classified as `likely-origin`, domainOwner & applicationOrigin high confidence |
| 2 | Cloudflare-Proxied Domain | Proxied via AS13335, CF-Ray headers, TLS cert issued by Cloudflare | Trigger `-30` CDN ASN penalty, classified as `cdn-proxy`, origin score <30, narrative explains proxy |
| 3 | Separate MX Infrastructure | Web traffic on origin/CDN, MX pointing to Google Workspace (`aspmx.l.google.com`) | MX IPs tagged `email-only` / `role: "email"`, excluded from web origin ranking, `isolatedFromWebOrigin: true` |
| 4 | Shared Hosting Domain | Candidate IP returns cPanel/Nginx default landing page when probed with Host header | Trigger `-20` generic landing penalty, classified as `shared-hosting`, origin score penalized |
| 5 | Subleased / Reseller IP Space | RIR allocation owner (e.g. Hetzner) differs from ASN operator or customer org | Flagged as subleased/reseller, networkOperation confidence reflects delegation status |

## Coverage Thresholds
- Tier 1: 40 test cases (8 features × 5 cases)
- Tier 2: 40 test cases (8 features × 5 cases)
- Tier 3: 10 test cases (covering major pairwise interactions)
- Tier 4: 5 realistic application scenario tests
- **Total Minimum Test Count: 95 test cases**
