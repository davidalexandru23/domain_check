# Milestone 1 Handoff Report — Empirical Verification & Verdict

## 1. Observation

### Execution Summary & Test Results
- Ran `npm run typecheck`: Completed with **0 errors**.
- Ran `npm test`: Executed Vitest across **9 test files**, **143 tests passed**, 0 failures.
  - `src/tests/scoring.test.ts` (11 tests passed)
  - `src/tests/ownership.test.ts` (6 tests passed)
  - `src/tests/empirical_m1_verification.test.ts` (12 tests passed)
  - `src/tests/stress_m1.test.ts` (13 tests passed)
  - `src/tests/e2e/tier1_features.test.ts` (40 tests passed)
  - `src/tests/e2e/tier2_boundaries.test.ts` (40 tests passed)
  - `src/tests/e2e/tier3_combinations.test.ts` (10 tests passed)
  - `src/tests/e2e/tier4_scenarios.test.ts` (5 tests passed)
  - `src/tests/parsers.test.ts` (6 tests passed)

### Empirical Verification of Required Scenarios
1. **Direct-Hosted Domain (`ici.ro`)**:
   - `scoreOriginCandidate`: Score = 75–100, Classification = `likely-origin`, Confidence = `high`.
   - `computeDecoupledOwnership`: High confidence across all 7 concepts (`domainOwner` 90%, `ipAllocation` 95%, `asnOperation` 95%, `networkOperation` 90%, `hostingProvider` 80%, `applicationOrigin` 85%, `physicalLocation` 90%).
2. **Cloudflare-Proxied Domain (`cloudflare.com`)**:
   - `scoreOriginCandidate`: Evaluates `-30` CDN ASN penalty and `-25` WAF header penalty. Correctly classifies candidate as `cdn-proxy`.
   - `computeDecoupledOwnership`: Hosting provider identity set to `Cloudflare, Inc. (CDN / WAF)` with 95% confidence; Application Origin confidence is capped at <= 25% (`Behind CDN Proxy — Origin Masked`); Physical Location set to `Global Anycast Edge` (30% confidence).
3. **Separate MX Infrastructure (`Google Workspace` / `Outlook`)**:
   - `scoreOriginCandidate`: Evaluates `-15` MX penalty. Classified as `email-only` when no web match (`POS_TLS_SAN_MATCH` or `POS_HTTP_CONTENT_MATCH`) is present.
   - Web matches on MX IP bypass `email-only` routing to prevent false-positive mail server isolation when a server hosts both web and email.
4. **Subleased Reseller Network Detection (`Hetzner Reseller`)**:
   - `computeDecoupledOwnership`: Network operation flags `Subleased Space (FastHost Reseller Ltd on Hetzner Online GmbH)` when RIR netblock owner differs from ASN operator name. Confidence set to 75%.

---

## 2. Logic Chain

1. **Scoring Engine Model Verification**:
   - The formula $S = \max(0, \min(100, \sum P - \sum N))$ is implemented deterministically in `calculateScore()`.
   - Positive weights: `POS_TLS_SAN_MATCH` (+30), `POS_HTTP_CONTENT_MATCH` (+25), `POS_SUBDOMAIN_LEAK` (+20), `POS_PTR_DOMAIN_MATCH` (+15), `POS_HISTORICAL_IP` (+15), `POS_ASN_MATCH` (+10), `POS_NON_CDN_PORT_OPEN` (+5). Total positive sum = 120, clamped to 100.
   - Contradiction penalties: `NEG_CDN_ASN` (-30), `NEG_CLOUD_WAF_HEADER` (-25), `NEG_GENERIC_LANDING` (-20), `NEG_TLS_CERT_MISMATCH` (-15), `NEG_MX_INFRASTRUCTURE` (-15).
   - Clamping logic guarantees output $S \in [0, 100]$.

2. **Classification Decision Tree**:
   - Candidates with CDN signals (`NEG_CDN_ASN` or `NEG_CLOUD_WAF_HEADER`) are routed to `cdn-proxy` regardless of intermediate positive scores.
   - Candidates marked `isMxIpOnly` without web signals are classified as `email-only`.
   - Generic landing page contradiction without web signals yields `shared-hosting`.
   - Uncontradicted candidates map cleanly: $\ge 70 \implies \text{likely-origin}$, $40\text{--}69 \implies \text{possible-origin}$, $< 40 \implies \text{unverified-leak}$.

3. **Decoupled Ownership Model**:
   - Explicitly returns 7 independent `OwnershipConcept` objects with labels, identities, confidence values (0–100%), confidence ratings, evidence counts, explanations, and details.
   - Successfully decouples hosting provider identity/confidence from application origin identity/confidence (proven in CDN tests).

---

## 3. Caveats

1. **String Inclusion Asymmetry in ASN Matching**: In `scoring.ts` line 177, `asnOrg.toLowerCase().includes(registrantOrg.toLowerCase())` is a one-way substring check. If `registrantOrg` contains extra tokens not in `asnOrg`, the signal evaluates to false. This does not cause errors and is acceptable for M1 scope.
2. **Sublease String Case Difference**: `ownership.ts` compares `rirOwner.toLowerCase() !== asnOrg.toLowerCase()`. String normalization handles case differences, but punctuation differences (e.g. `Inc.` vs `Inc`) will trigger sublease mode if `leaseSignals` is omitted. In full pipeline execution (M2), `leaseSignals` from BGP module provides explicit classification.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 1 scoring (`src/server/engine/scoring.ts`) and ownership engines (`src/server/engine/ownership.ts`) meet all requirements specified in `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `SCOPE.md`. Edge cases (direct-hosted domains, CDN proxies, MX infrastructure, and subleased reseller networks) are empirically verified and mathematically stable.

---

## 5. Verification Method

To independently verify this evaluation, run the following commands from `/Users/davidalexandru/Downloads/domain_check`:

```bash
npm run typecheck
npx vitest run src/tests/empirical_m1_verification.test.ts
npm test
```
