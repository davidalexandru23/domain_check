# Milestone 1 Code Remediation Changes Report — `m1_worker_2`

## Overview
Implemented 6 code remediations across `src/server/engine/ownership.ts` and `src/server/engine/scoring.ts` to resolve empirical bugs identified in Challenger 1's review and Explorer 4's remediation plan. All changes maintain strict data integrity, eliminate false-positive confidence scores on placeholder data, prevent false sublease detections on minor formatting variations, and filter out WHOIS privacy proxies and empty domain matches.

---

## Summary of Modified Files

| File | Changes Made |
|---|---|
| `src/server/engine/ownership.ts` | Added `isValidAsnNum`, `isValidOrgName`, `normalizeOrgName`, `areOrgsMatching`. Updated `calculateAsnOperation`, `calculateHostingProvider`, `calculateNetworkOperation`, and `calculateApplicationOrigin`. |
| `src/server/engine/scoring.ts` | Added `isPrivacyOrg` filter. Updated `evaluateSignals` (`POS_ASN_MATCH` and `POS_PTR_DOMAIN_MATCH`). |
| `src/tests/ownership.test.ts` | Added unit tests for `isValidAsnNum`, `isValidOrgName`, `normalizeOrgName`, `areOrgsMatching`. |
| `src/tests/scoring.test.ts` | Added unit tests for `isPrivacyOrg` and empty domain validation in `evaluateSignals`. |
| `src/tests/stress_m1.test.ts` | Updated harness assertions to align with remediated engine behavior. |

---

## Detailed Code Remediations

### 1. `src/server/engine/ownership.ts`

- **Helper Functions Added**:
  - `isValidAsnNum(asn: string | undefined | null): boolean`: Strips `AS` prefix, trims whitespace, and tests `/^\d+$/` with numeric range check `> 0`.
  - `isValidOrgName(org: string | undefined | null): boolean`: Filters out placeholder strings matching `/^(unknown|n\/a|none|unclassified|null|undefined)/i`.
  - `normalizeOrgName(name: string): string`: Strips legal entity suffixes (`Inc`, `LLC`, `GmbH`, `Ltd`, `Corp`, `Co`, `B.V.`, `AG`, `SA`, `S.R.L.`, `Pty`, `Pte`, `Plc`) and non-alphanumeric characters (`/[^a-z0-9]/g`).
  - `areOrgsMatching(org1?: string, org2?: string): boolean`: Compares normalized organization names and checks substring containment for long strings (length >= 4).

- **`calculateAsnOperation`**:
  - Validates ASN number using `isValidAsnNum(cleanAsn)` and organization name using `isValidOrgName(rawOrg)`.
  - Only assigns `confidence: 95` when both ASN number and organization name are valid.
  - Returns `confidence: 60` if only ASN number is valid.
  - Falls through to `confidence: 0` (`"Unknown ASN"`) when input is invalid or a placeholder.

- **`calculateHostingProvider`**:
  - Validates provider name using `isValidOrgName(providerName)` before assigning `confidence: 50`.
  - Falls through to `confidence: 0` (`"Unclassified Hosting Provider"`) when `providerName` is a placeholder (e.g. `"Unknown Host"`, `"Unknown Provider"`).
  - Sanitizes provider names for CDN and Cloud/Enterprise/ISP classifications.

- **`calculateNetworkOperation`**:
  - Validates both `rirOwner` and `asnOrg` using `isValidOrgName`.
  - Uses `areOrgsMatching(rirOwner, asnOrg)` to avoid declaring subleased space on minor string formatting differences (e.g., `"Cloudflare, Inc."` vs `"Cloudflare Inc"`).
  - Returns `confidence: 90` (Direct Network Operation) when organizations match.

- **`calculateApplicationOrigin`**:
  - Fixed `evidenceCount` calculation to use nullish coalescing `topCandidate.supportingSignals?.length ?? 0`, ensuring an empty array `[]` returns `0` instead of `1`.

---

### 2. `src/server/engine/scoring.ts`

- **`isPrivacyOrg` Filter**:
  - Implemented `isPrivacyOrg(org?: string | null): boolean` matching `/privacy|redacted|withheld|whoisguard|domains by proxy|contact privacy|select request|identity protection/i`.

- **`evaluateSignals` (`POS_ASN_MATCH`)**:
  - Added `!isPrivacyOrg(input.registrantOrg)` check before comparing WHOIS registrant organization with `asnOrg` or `rirAllocationOwner`. Prevents privacy proxies (e.g., `"WhoisGuard Protected"`) from receiving +10 positive ASN match points.

- **`evaluateSignals` (`POS_PTR_DOMAIN_MATCH`)**:
  - Added domain validation `input.domain && input.domain.trim().length > 0` before calling `.includes()`. Prevents empty domain strings (`""`) from matching any PTR hostname (+15 points).

---

## Verification & Test Results

1. **Type Check**:
   ```bash
   npm run typecheck
   ```
   Output: Exit code 0, 0 errors (`tsc --noEmit`).

2. **Unit & E2E Test Suite**:
   ```bash
   npm test
   ```
   Output: Exit code 0, 149 / 149 tests passed across 9 test files:
   - `src/tests/scoring.test.ts` (13 tests) — PASS
   - `src/tests/ownership.test.ts` (10 tests) — PASS
   - `src/tests/empirical_m1_verification.test.ts` (12 tests) — PASS
   - `src/tests/stress_m1.test.ts` (13 tests) — PASS
   - `src/tests/parsers.test.ts` (6 tests) — PASS
   - `src/tests/e2e/tier1_features.test.ts` (40 tests) — PASS
   - `src/tests/e2e/tier2_boundaries.test.ts` (40 tests) — PASS
   - `src/tests/e2e/tier3_combinations.test.ts` (10 tests) — PASS
   - `src/tests/e2e/tier4_scenarios.test.ts` (5 tests) — PASS
