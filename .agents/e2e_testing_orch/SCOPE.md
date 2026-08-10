# Scope: Milestone 0 — E2E Testing Suite Track

## Architecture & Strategy
- **Approach**: Opaque-box, requirement-driven E2E test suite targeting features F1–F8 defined in `PROJECT.md` and `ORIGINAL_REQUEST.md`.
- **Framework**: Vitest (`npm test` / `npx vitest run src/tests/e2e`).
- **Location**: `src/tests/e2e/`
- **Infrastructure Specs**: Documented in `TEST_INFRA.md`.

## Feature Inventory & Test Coverage Goals
| # | Feature | Tier 1 (Coverage) | Tier 2 (Boundaries) | Tier 3 (Combinations) | Tier 4 (Real-World) |
|---|---------|-------------------|---------------------|-----------------------|---------------------|
| F1 | Evidence & Contradiction Scoring | ≥5 test cases | ≥5 test cases | Pairwise interaction | Included |
| F2 | Decoupled 7 Ownership Concepts | ≥5 test cases | ≥5 test cases | Pairwise interaction | Included |
| F3 | Expanded Correlation Sources | ≥5 test cases | ≥5 test cases | Pairwise interaction | Included |
| F4 | MX Email Infrastructure Isolation | ≥5 test cases | ≥5 test cases | Pairwise interaction | Scenario test |
| F5 | 6-Stage Multi-Stage Pipeline | ≥5 test cases | ≥5 test cases | Pairwise interaction | Included |
| F6 | UI Score Bars & Evidence Breakdown | ≥5 test cases | ≥5 test cases | Pairwise interaction | Included |
| F7 | UI 7 Ownership Grid & Narrative | ≥5 test cases | ≥5 test cases | Pairwise interaction | Included |
| F8 | Interactive Documentation Page | ≥5 test cases | ≥5 test cases | Pairwise interaction | Included |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E-M1 | Test Infrastructure & Philosophy | `TEST_INFRA.md` & directory structure setup | None | IN_PROGRESS |
| E2E-M2 | Tier 1 & Tier 2 Test Cases | Feature coverage & boundary/edge test cases | E2E-M1 | PLANNED |
| E2E-M3 | Tier 3 & Tier 4 Test Cases | Pairwise combinations & real-world scenarios | E2E-M2 | PLANNED |
| E2E-M4 | Verification & TEST_READY.md | Iteration gate loop & publish `TEST_READY.md` | E2E-M3 | PLANNED |

## Interface Contracts
- **Runner**: `npx vitest run src/tests/e2e`
- **Output Artifact**: `TEST_READY.md` published at project root and `.agents/e2e_testing_orch/TEST_READY.md`.
