# Milestone 1 Handoff Report — Empirical Challenger Review

## Verdict: REQUEST_CHANGES

Empirical verification of Milestone 1 scoring (`src/server/engine/scoring.ts`) and ownership (`src/server/engine/ownership.ts`) engines revealed **6 empirical flaws and logic bugs**, including false-positive high confidence claims on unpopulated candidate fields and false sublease detections on string formatting differences.

---

## 1. Observation

### Observation 1.1: High Confidence Assigned to "Unknown ASN" and "Unknown Provider"
- **File**: `src/server/engine/ownership.ts`, line 173 (`calculateAsnOperation`) and line 321 (`calculateHostingProvider`); `src/server/engine/scoring.ts`, line 320.
- **Command & Output**:
  Ran stress test `src/tests/stress_m1.test.ts`:
  ```json
  ASN Operation: {
    concept: 'asnOperation',
    label: 'Autonomous System (ASN)',
    identity: 'ASUnknown ASN - Unknown Provider',
    confidence: 95,
    confidenceRating: 'high',
    explanation: 'BGP routing table and RIR records confirm origin Autonomous System ASUnknown ASN (Unknown Provider).'
  }
  Hosting Provider: {
    concept: 'hostingProvider',
    label: 'Hosting Provider',
    identity: 'Unknown Provider',
    confidence: 50,
    confidenceRating: 'medium'
  }
  ```
- **Code Quote** (`src/server/engine/ownership.ts:173`):
  ```typescript
  if (asnNum && orgName) {
    const confidence = 95;
    return {
      concept: "asnOperation",
      identity: `AS${asnNum} - ${orgName}`,
      confidence,
      ...
  ```
  And `src/server/engine/scoring.ts:320-321`:
  ```typescript
  provider: input.provider || input.asnOrg || "Unknown Provider",
  asn: input.asn || input.asnNumber || "Unknown ASN",
  ```

### Observation 1.2: False Positive Sublease Detection from Minor String Differences
- **File**: `src/server/engine/ownership.ts`, line 224 (`calculateNetworkOperation`).
- **Command & Output**:
  Ran stress test with `rirAllocationOwner: "Cloudflare, Inc."` and `asn.org: "Cloudflare Inc"`:
  ```json
  Network Operation: {
    concept: 'networkOperation',
    label: 'Network Operation & Sublease',
    identity: 'Subleased Space (Cloudflare Inc on Cloudflare, Inc.)',
    confidence: 75,
    confidenceRating: 'high',
    explanation: "Subleased network space detected: Netblock allocated to 'Cloudflare, Inc.' but operated by 'Cloudflare Inc' (AS13335)."
  }
  ```
- **Code Quote** (`src/server/engine/ownership.ts:224`):
  ```typescript
  const isSubleased = leaseSignal?.kind === "subleased" || (rirOwner && asnOrg && rirOwner.toLowerCase() !== asnOrg.toLowerCase());
  ```

### Observation 1.3: Positive ASN Match Awarded to WHOIS Privacy Proxy Entities
- **File**: `src/server/engine/scoring.ts`, lines 175-184 (`evaluateSignals`).
- **Command & Output**:
  Passing `registrantOrg: "WhoisGuard Protected"` and `rirAllocationOwner: "WhoisGuard Protected Inc"` produced:
  ```typescript
  {
    id: 'POS_ASN_MATCH',
    type: 'supporting',
    category: 'asn',
    weight: 10,
    title: 'ASN / Allocation Match'
  }
  ```
- **Code Quote** (`src/server/engine/scoring.ts:175`):
  ```typescript
  if (
    input.registrantOrg &&
    ((input.asnOrg && input.asnOrg.toLowerCase().includes(input.registrantOrg.toLowerCase())) ||
      (input.rirAllocationOwner && input.rirAllocationOwner.toLowerCase().includes(input.registrantOrg.toLowerCase())))
  )
  ```

### Observation 1.4: Empty Domain String Triggers PTR Domain Match
- **File**: `src/server/engine/scoring.ts`, line 163 (`evaluateSignals`).
- **Code Quote**:
  ```typescript
  if (input.ptrHostname && input.ptrHostname.toLowerCase().includes(input.domain.toLowerCase()))
  ```
  When `input.domain` is `""`, `"".includes("")` evaluates to `true` for any non-empty `ptrHostname`, awarding +15 points.

### Observation 1.5: Discrepancy in `evidenceCount` Calculation
- **File**: `src/server/engine/ownership.ts`, line 366 (`calculateApplicationOrigin`).
- **Code Quote**:
  ```typescript
  evidenceCount: topCandidate.supportingSignals?.length || 1
  ```
  When `supportingSignals` is `[]`, `0 || 1` evaluates to `1` instead of `0`.

### Observation 1.6: Clamping & Signal Matrix Verification
- Commands: `npm run typecheck` passed (exit code 0). `npm test` passed 143/143 tests across 9 test files.
- Score clamping at 0 (min) and 100 (max) functions correctly under extreme positive (+10,000) and negative (-10,000) weights.

---

## 2. Logic Chain

1. **Unfiltered Fallbacks in `scoreOriginCandidate` -> False Confidence**:
   - `scoreOriginCandidate` sets missing ASN to `"Unknown ASN"` and missing provider to `"Unknown Provider"`.
   - When passed into `computeDecoupledOwnership`, `calculateAsnOperation` checks `if (asnNum && orgName)`. Since `"Unknown ASN"` and `"Unknown Provider"` are non-empty strings, the block executes and returns `confidence: 95` (high) for `ASUnknown ASN - Unknown Provider`.
   - Similarly, `calculateHostingProvider` checks `providerName !== "Unknown Host"`. `"Unknown Provider" !== "Unknown Host"` evaluates to `true`, returning `confidence: 50` (medium) for `"Unknown Provider"`.

2. **Naïve String Inequality -> False Sublease Alert**:
   - `calculateNetworkOperation` checks `rirOwner.toLowerCase() !== asnOrg.toLowerCase()`.
   - Real-world WHOIS/RDAP data frequently contains subtle punctuation variations (e.g., `"Cloudflare, Inc."` vs `"Cloudflare Inc"` or `"Hetzner Online GmbH."` vs `"Hetzner Online GmbH"`).
   - The strict string inequality flags these as subleased network space with 75% confidence, creating false positive alerts.

3. **Privacy Masking Missing Filter in ASN Match**:
   - `evaluateSignals` compares `registrantOrg` with `asnOrg` / `rirAllocationOwner`.
   - It does not exclude privacy proxy organizations (unlike `calculateDomainOwnership` in `ownership.ts` which uses `/privacy|redacted|withheld|whoisguard/i`).
   - If a privacy service appears in both WHOIS and RIR records, `evaluateSignals` grants +10 positive evidence score for domain ownership correlation when none exists.

---

## 3. Caveats

- All findings were verified empirically using automated Vitest test harnesses (`src/tests/stress_m1.test.ts`).
- No implementation files were modified, in compliance with review-only role boundaries.
- Pipeline orchestration (Milestone 2) and Frontend UI (Milestone 3) components were outside the scope of this Milestone 1 review.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

Milestone 1 core engine logic contains 6 identifiable flaws:
1. `calculateAsnOperation`: Must filter out placeholder strings (`"Unknown ASN"`, `"Unknown Provider"`, `"N/A"`) before returning 95% confidence.
2. `calculateHostingProvider`: Must check `providerName !== "Unknown Host" && providerName !== "Unknown Provider"`.
3. `calculateNetworkOperation`: Must normalize punctuation/suffixes (e.g., remove commas, periods, `Inc`, `GmbH`, `LLC`) before declaring a subleased network mismatch.
4. `evaluateSignals`: Must sanitize/exclude WHOIS privacy regex strings from `registrantOrg` before evaluating `POS_ASN_MATCH`.
5. `evaluateSignals`: Must ensure `input.domain` is non-empty (`input.domain.trim().length > 0`) before performing PTR `.includes()` check.
6. `calculateApplicationOrigin`: Fix `evidenceCount: topCandidate.supportingSignals?.length ?? 0`.

---

## 5. Verification Method

To independently verify these findings:

1. Execute test suite:
   ```bash
   npm run typecheck && npx vitest run src/tests/stress_m1.test.ts
   ```
2. Inspect stdout from `TEST BUG A` and `TEST BUG B` in `src/tests/stress_m1.test.ts` to observe:
   - `ASN Operation: identity: 'ASUnknown ASN - Unknown Provider', confidence: 95`
   - `Network Operation: identity: 'Subleased Space (Cloudflare Inc on Cloudflare, Inc.)', confidence: 75`
3. Inspect `src/server/engine/ownership.ts` lines 173 & 224, and `src/server/engine/scoring.ts` lines 163 & 175.
