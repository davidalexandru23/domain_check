# Forensic Audit Handoff Report — Milestone 1

**Work Product**: Milestone 1 Core Engine & Decoupled Ownership
**Auditor**: `m1_auditor_1`
**Integrity Mode**: `development` (per `ORIGINAL_REQUEST.md`)
**Verdict**: **CLEAN**

---

## 1. Observation

### Audited Source & Test Files
- `src/shared/types.ts` (411 lines): Type definitions for `EvidenceSignal`, `OriginCandidateDetailed`, `DecoupledOwnershipModel`, `OwnershipConcept`, `ScanResult`, etc.
- `src/server/engine/scoring.ts` (332 lines): Evidence signal catalog (`POSITIVE_SIGNALS`, `CONTRADICTION_SIGNALS`), signal evaluation (`evaluateSignals`), scoring formula (`calculateScore`), candidate classification (`classifyCandidate`), explanation generator (`generateCandidateExplanation`), and entry point `scoreOriginCandidate`.
- `src/server/engine/ownership.ts` (482 lines): Implementation of `computeDecoupledOwnership` calculating 7 decoupled ownership concepts (`domainOwner`, `ipAllocation`, `asnOperation`, `networkOperation`, `hostingProvider`, `applicationOrigin`, `physicalLocation`).
- `src/tests/scoring.test.ts` (175 lines): 11 unit tests covering positive signal weights, contradiction penalties, clamping logic (0-100), classifications, and candidate scoring.
- `src/tests/ownership.test.ts` (238 lines): 6 unit tests covering direct hosting benchmarks, CDN origin decoupling, reseller/subleased network detection, WHOIS privacy protection, missing inputs, and valid 7-concept structure verification.

### Empirical Execution Results
1. `npm run typecheck`
   - Command: `tsc --noEmit`
   - Exit code: `0` (Success, no TypeScript errors)
2. `npm test`
   - Command: `vitest run`
   - Result: `7 passed (7 test files), 118 passed (118 tests), 1.17s duration`

---

## 2. Logic Chain

1. **Genuine Implementation Verification (No Facades or Hardcoding)**:
   - `calculateScore()` at `src/server/engine/scoring.ts:227-232` computes scores mathematically:
     `positiveSum - negativeSum`, clamped to `[0, 100]` using `Math.max(0, Math.min(100, Math.round(rawScore)))`.
   - `evaluateSignals()` dynamically evaluates input signals against positive and contradiction definitions without hardcoded lookup tables or static return shortcuts.
   - `computeDecoupledOwnership()` at `src/server/engine/ownership.ts:30-48` invokes separate calculation logic for each of the 7 ownership concepts based on WHOIS, RDAP, BGP, and GeoIP inputs.

2. **Deterministic Formula $S = \max(0, \min(100, \sum P - \sum N))$**:
   - Confirmed in `src/server/engine/scoring.ts`:
     - Positive weights sum: TLS SAN (+30), HTTP content match (+25), Subdomain leak (+20), PTR match (+15), Historical IP (+15), ASN match (+10), Non-CDN open port (+5).
     - Contradiction penalties sum: CDN ASN (-30), Cloud WAF header (-25), Generic landing page (-20), TLS cert mismatch (-15), MX infrastructure (-15).
   - Math is strictly executed and clamped as required by R1 and feature specifications.

3. **7 Decoupled Ownership Concepts Calculation**:
   - Confirmed in `src/server/engine/ownership.ts`:
     - Explicitly differentiates `domainOwner`, `ipAllocation`, `asnOperation`, `networkOperation`, `hostingProvider`, `applicationOrigin`, and `physicalLocation`.
     - Demonstrates decoupling: For Cloudflare-proxied targets, `hostingProvider` returns Cloudflare with 95% confidence, while `applicationOrigin` returns masked status with ≤25% confidence, preventing conflation.

4. **Unit Test Validity**:
   - Tests in `src/tests/scoring.test.ts` and `src/tests/ownership.test.ts` invoke exported production functions directly and assert against expected return structures and bounds.

---

## 3. Caveats

- **Scope Scope**: This audit specifically covered Milestone 1 deliverables (`src/shared/types.ts`, `src/server/engine/scoring.ts`, `src/server/engine/ownership.ts`, and corresponding unit tests).
- **Subsequent Milestones**: Scanner network modules (`dns.ts`, `tls.ts`, `http.ts`, `bgp.ts`), the 6-stage pipeline (`pipeline.ts`), and frontend UI components belong to M2 and M3 and were not audited for M1 completeness.

---

## 4. Conclusion

Milestone 1 work product passes all forensic integrity checks.
- Implementation is authentic, genuine, and free of hardcoded shortcuts or facades.
- Deterministic score math and 7-concept decoupled ownership models function as specified.
- Type checks and unit tests run and pass clean.
- **Verdict**: **CLEAN**

---

## 5. Verification Method

To independently verify this audit:
1. Run type check:
   ```bash
   npm run typecheck
   ```
2. Run test suite:
   ```bash
   npm test
   ```
3. Inspect `src/server/engine/scoring.ts` lines 227-232 and `src/server/engine/ownership.ts` lines 30-48 to verify implementation of scoring formula and decoupled ownership calculations.
