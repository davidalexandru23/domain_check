# Handoff & Quality / Adversarial Review Report — Milestone 1

**Reviewer**: m1_reviewer_2  
**Role**: Reviewer & Adversarial Critic  
**Date**: 2026-08-10  
**Working Directory**: `/Users/davidalexandru/Downloads/domain_check/.agents/m1_reviewer_2`  
**Milestone**: M1 — Core Engine Data Models, 7 Decoupled Ownership Concepts & 0-100 Evidence Scoring Model  

---

## 1. Executive Summary & Verdict

**Verdict**: **APPROVE**

Milestone 1 delivers a robust, evidence-based correlation and scoring engine. The implementation strictly adheres to the data contracts specified in `PROJECT.md` and `SCOPE.md`. It eliminates conflated text confidence strings by introducing a deterministic $S = \max(0, \min(100, \sum P - \sum N))$ evidence scoring model and 7 decoupled infrastructure ownership concepts with independent 0–100% confidence metrics.

---

## 2. Observation

Direct observations and evidence gathered during review:

1. **`src/shared/types.ts`**:
   - Lines 253–262: Defined `EvidenceSignal` with `id`, `type` (`supporting` | `contradiction`), `category`, `weight`, `title`, `description`, `observedData`, `source`.
   - Lines 266–272: Defined `CandidateClassification` union: `"likely-origin" | "possible-origin" | "unverified-leak" | "cdn-proxy" | "shared-hosting" | "email-only"`.
   - Lines 276–291: Defined `OriginCandidateDetailed` with score, supporting/contradiction signal arrays, provider, ASN, location, explanation, and confidence.
   - Lines 301–329: Defined `OwnershipConcept` and `DecoupledOwnershipModel` covering all 7 infrastructure layers (`domainOwner`, `ipAllocation`, `asnOperation`, `networkOperation`, `hostingProvider`, `applicationOrigin`, `physicalLocation`).
   - Lines 362–390: Extended `ScanResult` while preserving 100% backward compatibility for legacy properties.

2. **`src/server/engine/scoring.ts`**:
   - Lines 35–92: Implemented catalog `POSITIVE_SIGNALS` with exact weights: `POS_TLS_SAN_MATCH` (+30), `POS_HTTP_CONTENT_MATCH` (+25), `POS_SUBDOMAIN_LEAK` (+20), `POS_PTR_DOMAIN_MATCH` (+15), `POS_HISTORICAL_IP` (+15), `POS_ASN_MATCH` (+10), `POS_NON_CDN_PORT_OPEN` (+5).
   - Lines 94–135: Implemented catalog `CONTRADICTION_SIGNALS` with exact penalties: `NEG_CDN_ASN` (-30), `NEG_CLOUD_WAF_HEADER` (-25), `NEG_GENERIC_LANDING` (-20), `NEG_TLS_CERT_MISMATCH` (-15), `NEG_MX_INFRASTRUCTURE` (-15).
   - Lines 227–232: Math formula $S = \max(0, \min(100, \sum P - \sum N))$ with rounding and clamping.
   - Lines 234–262: `classifyCandidate` strict decision tree evaluation precedence (`email-only` -> `cdn-proxy` -> `shared-hosting` -> `likely-origin` -> `possible-origin` -> `unverified-leak`).
   - Lines 264–304: `generateCandidateExplanation` generating human-readable narrative verdicts for each classification.

3. **`src/server/engine/ownership.ts`**:
   - Lines 30–48: `computeDecoupledOwnership` function computing independent metrics for all 7 concepts.
   - Lines 50–109: `calculateDomainOwnership` handling WHOIS/RDAP org (90-95%), privacy protection obfuscation (20%), registrar fallback (40%), and missing records (0%).
   - Lines 111–162: `calculateIpAllocation` decoupling RIR inetnum allocation owner (95%) from ASN organization inference (50%).
   - Lines 164–211: `calculateAsnOperation` tracking BGP origin Autonomous System (95% vs 60%).
   - Lines 213–281: `calculateNetworkOperation` detecting subleased networks (75%) and suballocated route objects (60%) vs direct operations (90%).
   - Lines 283–346: `calculateHostingProvider` classifying CDN/WAF (95%), Cloud (85%), Enterprise/ISP (80%), and generic providers (50%).
   - Lines 348–412: `calculateApplicationOrigin` deriving origin confidence from candidate score, while capping CDN-proxied origins at $\le 25\%$.
   - Lines 414–481: `calculatePhysicalLocation` distinguishing Anycast edge routing (30%) from physical datacenter facility presence (90%) and city/country GeoIP (80%).

4. **`src/tests/scoring.test.ts` & `src/tests/ownership.test.ts`**:
   - 17 total unit tests covering positive/negative signal catalog weights, mathematical upper/lower bounds clamping, all 6 classification branches, open ports bonus, explanation text generation, direct hosting benchmarks (`ici.ro`), CDN proxying (`Cloudflare`), subleasing (`Hetzner reseller`), WHOIS privacy protection, and empty/missing input resilience.

5. **Terminal Execution Outputs**:
   - `npm run typecheck` output: `tsc --noEmit` exited with code 0.
   - `npm test` output: All 7 test files (118 tests total) passed with code 0.

---

## 3. Logic Chain

1. **Requirements & Contract Verification**:
   The code was audited against `ORIGINAL_REQUEST.md` (R1 & R2), `PROJECT.md`, and `SCOPE.md`. All required types (`EvidenceSignal`, `OriginCandidateDetailed`, `DecoupledOwnershipModel`) match the specified property names and types without truncation or missing fields.

2. **Scoring Engine Robustness**:
   `calculateScore` correctly sums positive weights and subtracts contradiction weights. `Math.max(0, Math.min(100, Math.round(rawScore)))` guarantees the output is strictly clamped within $[0, 100]$. The classification precedence order ensures edge cases such as CDN proxies and email-only MX hosts override pure score threshold checks, preventing CDN IP addresses from being misclassified as origin servers.

3. **Decoupled Ownership Independence**:
   `computeDecoupledOwnership` calculates 7 separate `OwnershipConcept` objects. Each concept evaluates its own specific evidence source (WHOIS for domain owner, RIR/RDAP for IP allocation, BGP for ASN, lease signals for network operation, ASN/WAF for hosting provider, score/proxy status for origin, and GeoIP/facility for location). For CDN-proxied targets, hosting provider confidence remains high (95%) while application origin confidence is capped ($\le 25\%$), successfully proving concept decoupling.

4. **Adversarial & Integrity Review**:
   Source code was inspected for hardcoded outputs, dummy implementations, or shortcuts. All computations are dynamic functions of input objects. No integrity violations were detected.

5. **Build & Automated Verification**:
   Executing `npm run typecheck` and `npm test` in the workspace confirmed zero compilation errors and 100% test pass rate across 118 unit and end-to-end tests.

---

## 4. Quality & Adversarial Review Details

### Verified Claims
- `npm run typecheck` -> PASSED (0 errors)
- `npm test` -> PASSED (118/118 tests passed)
- Mathematical score bounds $[0, 100]$ -> VERIFIED in `src/tests/scoring.test.ts`
- 7 Decoupled Ownership concepts presence and independence -> VERIFIED in `src/tests/ownership.test.ts`
- CDN origin masking cap ($\le 25\%$) -> VERIFIED in `src/tests/ownership.test.ts`
- Subleased network detection (Hetzner reseller benchmark) -> VERIFIED in `src/tests/ownership.test.ts`

### Stress Test Results
| Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| Empty input `{}` to ownership engine | Return 0% confidence for all concepts with valid rationale strings | All 7 concepts returned 0% confidence without throwing errors | PASS |
| Candidate score > 100 (multiple positive signals) | Clamp score to exactly 100 | `calculateScore` returned 100 | PASS |
| Candidate score < 0 (heavy penalties) | Clamp score to exactly 0 | `calculateScore` returned 0 | PASS |
| Pure MX host with no web signals | Classify as `email-only` | `classifyCandidate` returned `email-only` | PASS |
| Cloudflare IP with TLS match | Classify as `cdn-proxy` due to CDN ASN penalty | `classifyCandidate` returned `cdn-proxy` | PASS |

### Findings & Coverage Gaps
- **Findings**: 0 Critical, 0 Major, 0 Minor.
- **Coverage Gaps**: None for Milestone 1 scope. (Scanner orchestration and UI components are scheduled for M2 and M3 respectively).

---

## 5. Caveats

No caveats. All M1 requirements, edge cases, type contracts, and unit tests have been thoroughly examined and verified.

---

## 6. Conclusion

Milestone 1 core engine data models, evidence scoring engine, and 7 decoupled ownership concept engine are complete, well-tested, robust, and fully conformant to specification. The implementation is approved without requested changes.

---

## 7. Verification Method

To independently re-verify:

1. **Run TypeScript Compiler**:
   ```bash
   npm run typecheck
   ```
   *Expected output*: Exits with code 0 (`tsc --noEmit`).

2. **Run Vitest Test Suite**:
   ```bash
   npm test
   ```
   *Expected output*: 7 test files passed, 118 tests passed, 0 failed.

3. **Inspect Implementation Files**:
   - `src/shared/types.ts`
   - `src/server/engine/scoring.ts`
   - `src/server/engine/ownership.ts`
   - `src/tests/scoring.test.ts`
   - `src/tests/ownership.test.ts`
