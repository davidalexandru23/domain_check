# Handoff Report — Milestone 1 Review

**Reviewer**: m1_reviewer_1_rep  
**Date**: 2026-08-10  
**Working Directory**: `/Users/davidalexandru/Downloads/domain_check/.agents/m1_reviewer_1_rep`  
**Milestone**: M1 — Core Engine Data Models, 7 Decoupled Ownership Concepts & 0-100 Evidence Scoring Model  

---

## Review Summary

**Verdict**: **APPROVE**

---

## 1. Observation

Direct observations from examining code and executing verification commands:

1. **`src/shared/types.ts`**:
   - Lines 240–262: Defines `EvidenceType` (`"supporting" | "contradiction"`), `EvidenceCategory`, and `EvidenceSignal` with `id`, `type`, `category`, `weight`, `title`, `description`, and `observedData`.
   - Lines 266–291: Defines `CandidateClassification` (`"likely-origin" | "possible-origin" | "unverified-leak" | "cdn-proxy" | "shared-hosting" | "email-only"`) and `OriginCandidateDetailed` with `score` (0-100), `supportingSignals`, `contradictionSignals`, `provider`, `asn`, `location`, `rawSignals`, `explanation`, and `confidence`.
   - Lines 293–329: Defines `OwnershipConceptType` (all 7 concepts: `domainOwner`, `ipAllocation`, `asnOperation`, `networkOperation`, `hostingProvider`, `applicationOrigin`, `physicalLocation`), `OwnershipConcept`, and `DecoupledOwnershipModel`.
   - Lines 362–390: Preserves legacy `ScanResult` schema while extending it with optional M1 attributes (`candidates`, `topOriginCandidate`, `decoupledOwnership`, `ownershipModel`, `mxInfrastructure`, `narrativeVerdict`).

2. **`src/server/engine/scoring.ts`**:
   - Lines 35–91: `POSITIVE_SIGNALS` catalog defines exact positive weights:
     - `POS_TLS_SAN_MATCH`: +30
     - `POS_HTTP_CONTENT_MATCH`: +25
     - `POS_SUBDOMAIN_LEAK`: +20
     - `POS_PTR_DOMAIN_MATCH`: +15
     - `POS_HISTORICAL_IP`: +15
     - `POS_ASN_MATCH`: +10
     - `POS_NON_CDN_PORT_OPEN`: +5
   - Lines 94–135: `CONTRADICTION_SIGNALS` catalog defines exact contradiction penalties:
     - `NEG_CDN_ASN`: -30
     - `NEG_CLOUD_WAF_HEADER`: -25
     - `NEG_GENERIC_LANDING`: -20
     - `NEG_TLS_CERT_MISMATCH`: -15
     - `NEG_MX_INFRASTRUCTURE`: -15
   - Lines 227–232: `calculateScore` implements $S = \max(0, \min(100, \sum P - \sum N))$:
     ```typescript
     const positiveSum = supporting.reduce((acc, s) => acc + s.weight, 0);
     const negativeSum = contradictions.reduce((acc, c) => acc + Math.abs(c.weight), 0);
     const rawScore = positiveSum - negativeSum;
     return Math.max(0, Math.min(100, Math.round(rawScore)));
     ```
   - Lines 234–262: `classifyCandidate` evaluates classification decision tree (`email-only` -> `cdn-proxy` -> `shared-hosting` -> `likely-origin` (>=70) -> `possible-origin` (40-69) -> `unverified-leak` (<40)).
   - Lines 264–304: `generateCandidateExplanation` generates human-readable rationales with key supporting factors and contradictions breakdown.

3. **`src/server/engine/ownership.ts`**:
   - Lines 30–48: `computeDecoupledOwnership` calculates all 7 decoupled ownership concepts independently.
   - Lines 50–109: `calculateDomainOwnership` (WHOIS/RDAP registrant vs privacy protection penalty: 90-95% unredacted vs 20% privacy).
   - Lines 111–162: `calculateIpAllocation` (RIR inetnum allocation vs ASN org inference: 95% RIR vs 50% inferred).
   - Lines 164–211: `calculateAsnOperation` (BGP AS announcement operator: 95% verified vs 60% ASN only).
   - Lines 213–281: `calculateNetworkOperation` (Subleased reseller vs suballocated vs direct operation: 75% subleased, 60% suballocated, 90% direct).
   - Lines 283–346: `calculateHostingProvider` (CDN/WAF 95%, Cloud 85%, ISP 80%).
   - Lines 348–412: `calculateApplicationOrigin` (Direct origin score vs CDN proxied max 25% confidence).
   - Lines 414–481: `calculatePhysicalLocation` (Facility confirmed 90%, GeoIP city 80%, Global Anycast edge 30%).

4. **`src/tests/scoring.test.ts` & `src/tests/ownership.test.ts`**:
   - `scoring.test.ts` includes 11 unit tests covering positive weights, contradiction penalties, score clamping bounds (0 to 100), all 6 classification paths, open port bonuses (+5), and narrative generation.
   - `ownership.test.ts` includes 6 comprehensive unit tests benchmarking direct hosting (`ici.ro`), CDN proxying (`Cloudflare`), subleasing (`Hetzner reseller`), WHOIS privacy protection, empty input resilience, and confidence metrics.

5. **Terminal Execution Outputs**:
   - **`npm run typecheck`**:
     ```
     > domain-asm-osint@1.0.0 typecheck
     > tsc --noEmit
     ```
     Exit code: 0.
   - **`npm test`**:
     ```
     RUN  v2.1.9 /Users/davidalexandru/Downloads/domain_check

     ✓ src/tests/e2e/tier4_scenarios.test.ts (5 tests) 4ms
     ✓ src/tests/scoring.test.ts (11 tests) 4ms
     ✓ src/tests/e2e/tier2_boundaries.test.ts (40 tests) 10ms
     ✓ src/tests/e2e/tier1_features.test.ts (40 tests) 10ms
     ✓ src/tests/e2e/tier3_combinations.test.ts (10 tests) 5ms
     ✓ src/tests/ownership.test.ts (6 tests) 7ms
     ✓ src/tests/parsers.test.ts (6 tests) 2ms

     Test Files  7 passed (7)
          Tests  118 passed (118)
     ```
     Exit code: 0.

---

## 2. Logic Chain

1. **Verification of Data Contracts (`src/shared/types.ts`)**:
   - Compared definitions against `PROJECT.md § Interface Contracts` and `SCOPE.md`. All required interfaces (`EvidenceSignal`, `OriginCandidateDetailed`, `OwnershipConcept`, `DecoupledOwnershipModel`) match the specifications exactly.
   - Verified that existing legacy properties on `ScanResult` are preserved, ensuring zero breaking changes for existing modules.

2. **Verification of Scoring Engine (`src/server/engine/scoring.ts`)**:
   - Re-computed raw mathematical formulas for signal weights. All positive weights (+30, +25, +20, +15, +15, +10, +5) and contradiction penalties (-30, -25, -20, -15, -15) match `PROJECT.md Feature 1` specifications.
   - Confirmed clamping function `Math.max(0, Math.min(100, Math.round(rawScore)))` guarantees $S \in [0, 100]$.
   - Evaluated candidate classification decision tree logic: `isMxIpOnly` -> `cdn-proxy` -> `shared-hosting` -> score threshold checks (>=70 `likely-origin`, 40-69 `possible-origin`, <40 `unverified-leak`).

3. **Verification of Decoupled Ownership Engine (`src/server/engine/ownership.ts`)**:
   - Inspected individual calculation logic for all 7 concepts (`domainOwner`, `ipAllocation`, `asnOperation`, `networkOperation`, `hostingProvider`, `applicationOrigin`, `physicalLocation`).
   - Verified that confidence metrics for each concept are calculated independently (e.g. `hostingProvider` confidence for Cloudflare is 95%, while `applicationOrigin` confidence is capped at <= 25% when behind a CDN).
   - Confirmed robust fallback handling when input objects are missing or partial.

4. **Adversarial Integrity & Criticism Check**:
   - Checked for integrity violations: NO hardcoded test results, NO dummy/facade implementations, NO shortcuts, NO self-certifying tricks.
   - All signal evaluations in `evaluateSignals` and ownership calculations in `computeDecoupledOwnership` process real input attributes dynamically.

5. **Terminal Build & Test Verification**:
   - Ran `npm run typecheck` — passed with 0 errors.
   - Ran `npm test` — passed all 118 unit and E2E tests across 7 test files.

---

## 3. Verified Claims

- [x] **Mathematical Formula $S = \max(0, \min(100, \sum P - \sum N))$**: Verified in `src/server/engine/scoring.ts:227` and tested in `src/tests/scoring.test.ts:32` → PASS
- [x] **Positive Weights (+30, +25, +20, +15, +15, +10, +5)**: Verified in `src/server/engine/scoring.ts:35` and tested in `src/tests/scoring.test.ts:13` → PASS
- [x] **Contradiction Penalties (-30, -25, -20, -15, -15)**: Verified in `src/server/engine/scoring.ts:94` and tested in `src/tests/scoring.test.ts:23` → PASS
- [x] **7 Decoupled Ownership Concepts**: Verified in `src/server/engine/ownership.ts:30` and tested in `src/tests/ownership.test.ts:213` → PASS
- [x] **Independent Confidence Metrics & Explanations**: Verified in `src/server/engine/ownership.ts` and tested in `src/tests/ownership.test.ts:78` → PASS
- [x] **TypeScript Type Safety (`npm run typecheck`)**: Verified via terminal command `tsc --noEmit` → PASS (0 errors)
- [x] **Unit Test Pass Rate (`npm test`)**: Verified via terminal command `vitest run` → PASS (118 tests passed)

---

## 4. Coverage Gaps

- No coverage gaps identified for Milestone 1. All specified core engine data models, scoring logic, decoupled ownership calculations, and unit tests are complete and verified.

---

## 5. Unverified Items

- None. All implementation details and test cases were independently executed and verified.

---

## 6. Caveats

- No caveats. Milestone 1 implementation satisfies all functional and non-functional requirements without qualification.

---

## 7. Conclusion

Milestone 1 implementation is of high quality, type-safe, genuine, mathematically exact, and fully tested. The verdict is **APPROVE**.

---

## 8. Verification Method

To independently re-verify this review:
1. Run TypeScript type checker:
   ```bash
   npm run typecheck
   ```
   *Expected result*: Exit code 0, 0 errors.
2. Run Vitest test suite:
   ```bash
   npm test
   ```
   *Expected result*: 7 test files passed, 118 tests passed, 0 failures.
3. Inspect source files:
   - `src/shared/types.ts`
   - `src/server/engine/scoring.ts`
   - `src/server/engine/ownership.ts`
   - `src/tests/scoring.test.ts`
   - `src/tests/ownership.test.ts`
