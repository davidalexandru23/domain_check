# Changes Report — Milestone 1 Implementation

**Author**: m1_worker_1  
**Date**: 2026-08-10  
**Milestone**: M1 — Core Engine Data Models, 7 Decoupled Ownership Concepts & 0-100 Evidence Scoring Model  

---

## 1. Summary of Changes

Milestone 1 refactors the Domain / Origin / Hosting / Ownership Correlation Engine to eliminate hardcoded/conflated text confidence strings and replace them with a deterministic 0–100 evidence scoring model and 7 decoupled ownership concepts with independent 0–100% confidence metrics.

---

## 2. Files Modified & Created

### 2.1 `src/shared/types.ts` (Modified)
- **Purpose**: Add data contracts and interface definitions for Milestone 1 while preserving complete backward compatibility with legacy types (`OriginCandidate`, `ScanResult`).
- **Added Interfaces**:
  - `EvidenceSignal` & `EvidenceItem` (Captures supporting and contradiction evidence with category, signed weight, title, description, observedData).
  - `CandidateClassification` & `ScoreClassification` (`"likely-origin" | "possible-origin" | "unverified-leak" | "cdn-proxy" | "shared-hosting" | "email-only"`).
  - `OriginCandidateDetailed` (Comprehensive candidate representation including score, supporting/contradiction signal lists, provider, ASN, location, rawSignals, explanation).
  - `ConceptConfidence` & `ConfidenceRating` (`"high" | "medium" | "low" | "none"`).
  - `OwnershipConcept` & `OwnershipConceptType` (Card model representing individual ownership layer with label, identity, confidence, evidenceCount, explanation, details).
  - `DecoupledOwnershipModel` (Structure containing all 7 decoupled ownership concepts).
  - `MxInfrastructureSummary` & `NarrativeVerdict` (Auxiliary models for MX isolation summary and natural language scan verdict).
- **Updated `ScanResult`**:
  - Added optional fields: `id`, `targetDomain`, `timestamp`, `status`, `progress`, `currentStage`, `stageName`, `candidates`, `topOriginCandidate`, `decoupledOwnership`, `ownershipModel`, `mxInfrastructure`, `narrativeVerdict`.

### 2.2 `src/server/engine/scoring.ts` (Created)
- **Purpose**: Pure, deterministic evidence scoring engine module ($S = \max(0, \min(100, \sum P - \sum N))$).
- **Exported Signals Catalogs**:
  - `POSITIVE_SIGNALS`: `POS_TLS_SAN_MATCH` (+30), `POS_HTTP_CONTENT_MATCH` (+25), `POS_SUBDOMAIN_LEAK` (+20), `POS_PTR_DOMAIN_MATCH` (+15), `POS_HISTORICAL_IP` (+15), `POS_ASN_MATCH` (+10), `POS_NON_CDN_PORT_OPEN` (+5).
  - `CONTRADICTION_SIGNALS`: `NEG_CDN_ASN` (-30), `NEG_CLOUD_WAF_HEADER` (-25), `NEG_GENERIC_LANDING` (-20), `NEG_TLS_CERT_MISMATCH` (-15), `NEG_MX_INFRASTRUCTURE` (-15).
- **Exported Engine Functions**:
  - `evaluateSignals(input: CandidateRawInput)`: Evaluates raw candidate observations and extracts positive/negative signals.
  - `calculateScore(supporting, contradictions)`: Computes clamped score $S \in [0, 100]$.
  - `classifyCandidate(score, supporting, contradictions, isMxIpOnly)`: Follows strict decision tree evaluation precedence (`email-only` -> `cdn-proxy` -> `shared-hosting` -> `likely-origin` -> `possible-origin` -> `unverified-leak`).
  - `generateCandidateExplanation(candidate)`: Generates structured, natural-language explanations.
  - `scoreOriginCandidate(input)`: Composite convenience function returning full `OriginCandidateDetailed`.

### 2.3 `src/server/engine/ownership.ts` (Created)
- **Purpose**: Decouples 7 infrastructure ownership concepts into separate objects with independent 0–100% confidence scores and rationale strings.
- **Exported Function**: `computeDecoupledOwnership(input: OwnershipCalculationInput): DecoupledOwnershipModel`.
- **7 Decoupled Concepts**:
  1. `domainOwner`: WHOIS/RDAP registrant attribution with privacy detection penalty (90–95% unredacted org vs 20% privacy protected).
  2. `ipAllocation`: RIR inetnum allocation owner vs ASN org inference (95% direct RIR vs 50% inferred).
  3. `asnOperation`: BGP Autonomous System announcement operator (95% verified vs 60% ASN only).
  4. `networkOperation`: BGP routing topology and subleased/reseller netblock detection (75% subleased, 60% suballocated, 90% direct operation).
  5. `hostingProvider`: Commercial hosting infrastructure classification (95% CDN/WAF, 85% Cloud, 80% Enterprise/ISP).
  6. `applicationOrigin`: True origin server status vs CDN masking (derived from origin score, capped at <=25% when behind CDN).
  7. `physicalLocation`: Datacenter facility and GeoIP location (90% facility confirmed, 80% city/country, 30% Anycast edge penalty).

### 2.4 `src/tests/scoring.test.ts` (Created)
- **Purpose**: Comprehensive Vitest unit test suite covering scoring constants, signal evaluation, mathematical clamping upper (100) / lower (0) bounds, classification decision tree, open ports bonus, and narrative generation templates.

### 2.5 `src/tests/ownership.test.ts` (Created)
- **Purpose**: Comprehensive Vitest unit test suite verifying all 7 decoupled ownership concepts, direct hosting benchmark (`ici.ro`), CDN proxying (`Cloudflare`), subleasing (`Hetzner reseller`), WHOIS privacy protection, missing input resilience, and confidence metrics.

### 2.6 Minor Adjustments for Repository Type & Test Consistency
- `src/server/scanner.ts`: Fixed `maxDepth` clamping upper bound to 30.
- `src/tests/e2e/tier2_boundaries.test.ts`: Added missing `ScanResult` import and string type annotation for `scanMode`.
- `src/tests/e2e/tier3_combinations.test.ts`: Added string type annotation for string comparison variables.

---

## 3. Verification Results

- **`npm run typecheck`**: Passed with 0 errors.
- **`npm test`**: Passed 7 test files (118 tests total) with 0 failures.
