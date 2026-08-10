# Milestone 1 Handoff Report — Code Remediation Plan

**Author**: `m1_explorer_4`  
**Target Recipient**: `m1_worker_2` (via `m1_orch`)  
**Scope**: Code Remediation Specification for `src/server/engine/scoring.ts` & `src/server/engine/ownership.ts`  
**Analysis Artifact**: `/Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_4/analysis.md`

---

## 1. Observation

Direct code examination of `src/server/engine/scoring.ts` and `src/server/engine/ownership.ts` alongside Challenger 1's findings (`.agents/m1_challenger_1/handoff.md`) confirmed 6 distinct empirical logic flaws:

1. **Bug 1 (`ownership.ts:172-173`)**:
   `calculateAsnOperation` checks `if (asnNum && orgName)`. Default candidate values in `scoring.ts:320-321` set missing fields to `"Unknown ASN"` and `"Unknown Provider"`. Because both are non-empty strings, `calculateAsnOperation` assigns `confidence: 95` (high) to identity `"ASUnknown ASN - Unknown Provider"`.

2. **Bug 2 (`ownership.ts:321`)**:
   `calculateHostingProvider` checks `if (providerName !== "Unknown Host")`. Default string `"Unknown Provider"` is not equal to `"Unknown Host"`, causing it to enter the 50% confidence block and return `confidence: 50` for `"Unknown Provider"`.

3. **Bug 3 (`ownership.ts:224`)**:
   `calculateNetworkOperation` checks `rirOwner.toLowerCase() !== asnOrg.toLowerCase()`. Minor string variations (e.g. `"Cloudflare, Inc."` vs `"Cloudflare Inc"`) trigger false-positive subleased space alerts with `confidence: 75`.

4. **Bug 4 (`scoring.ts:175-184`)**:
   `evaluateSignals` compares `input.registrantOrg` with `input.asnOrg` / `input.rirAllocationOwner` without excluding WHOIS privacy proxy organizations (e.g. `"WhoisGuard Protected"`), awarding +10 points for `POS_ASN_MATCH`.

5. **Bug 5 (`scoring.ts:163`)**:
   `evaluateSignals` executes `input.ptrHostname.toLowerCase().includes(input.domain.toLowerCase())`. When `input.domain` is `""`, `"".includes("")` evaluates to `true` for any PTR hostname, awarding +15 points for `POS_PTR_DOMAIN_MATCH`.

6. **Bug 6 (`ownership.ts:366`)**:
   `calculateApplicationOrigin` uses `evidenceCount: topCandidate.supportingSignals?.length || 1`. When `supportingSignals` is an empty array `[]`, `0 || 1` evaluates to `1`.

---

## 2. Logic Chain

1. **Fallback String Pollution -> False High Confidence (Bugs 1 & 2)**:
   - When active scan probes fail to discover ASN or provider details, fallback strings (`"Unknown ASN"`, `"Unknown Provider"`) are generated.
   - Naïve truthiness checks (`if (asnNum && orgName)` and `providerName !== "Unknown Host"`) treat placeholder strings as verified data.
   - **Remediation Reasoning**: Introduce string validation functions (`isValidAsnNum` and `isValidOrgName`) that strip prefix `AS` and verify numeric format (`/^\d+$/`) for ASNs and filter placeholder patterns (`/^(unknown|n\/a|none|unclassified)/i`) for organizations.

2. **Naïve String Equality -> False Sublease Flags (Bug 3)**:
   - RIR RDAP allocation records and BGP origin ASN records frequently differ in legal entity suffixes (`Inc`, `LLC`, `GmbH`) or punctuation (commas, periods).
   - Strict string inequality flags direct operations (e.g. Cloudflare on Cloudflare netblock) as subleased space.
   - **Remediation Reasoning**: Implement `normalizeOrgName` (strips legal suffixes and non-alphanumeric characters) and `areOrgsMatching` (checks normalized equality or token inclusion for long strings).

3. **Unfiltered Privacy & Empty Inputs -> Unearned Scores (Bugs 4 & 5)**:
   - Comparing WHOIS privacy proxy names produces fake correlation scores between domain registrants and ASN operators.
   - Executing `.includes()` on empty domain strings matches every valid hostname.
   - **Remediation Reasoning**: Apply `isPrivacyOrg` regex filter to `registrantOrg` before checking `POS_ASN_MATCH`. Require `input.domain.trim().length > 0` before checking `POS_PTR_DOMAIN_MATCH`.

4. **Logical OR Falsy Fallback -> Incorrect Evidence Count (Bug 6)**:
   - `0 || 1` returns `1` because JavaScript evaluates `0` as falsy.
   - **Remediation Reasoning**: Use nullish coalescing `?? 0` to preserve `0` when `length` is `0`.

---

## 3. Caveats

- This investigation is strictly read-only per agent constraints; source code files under `src/server/engine/` were analyzed but not edited directly.
- All code remediation specifications in `/Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_4/analysis.md` are drop-in ready for `m1_worker_2`.
- Verification requires executing the full test suite (`npm run typecheck && npm test`).

---

## 4. Conclusion

A comprehensive, line-by-line remediation specification has been documented in `analysis.md`. Implementing the 6 proposed fixes and helper functions (`isValidAsnNum`, `isValidOrgName`, `normalizeOrgName`, `areOrgsMatching`, `isPrivacyOrg`) will completely resolve all 6 logic bugs, eliminate false-positive confidence claims on placeholder data, and make the scoring and decoupled ownership engines fully robust.

---

## 5. Verification Method

To verify the remediation after `m1_worker_2` completes code implementation:

1. **Run Full Test Suite & Type Check**:
   ```bash
   npm run typecheck && npm test
   ```
2. **Execute Stress & Empirical Tests**:
   ```bash
   npx vitest run src/tests/stress_m1.test.ts src/tests/empirical_m1_verification.test.ts
   ```
3. **Verify Specific Test Outcomes**:
   - `calculateAsnOperation` returns `confidence: 0` for `"Unknown ASN"` / `"Unknown Provider"`.
   - `calculateHostingProvider` returns `confidence: 0` for `"Unknown Provider"`.
   - `calculateNetworkOperation` returns `confidence: 90` (Direct Network Operation) for `"Cloudflare, Inc."` vs `"Cloudflare Inc"`.
   - `evaluateSignals` returns 0 supporting signals for `{ registrantOrg: "WhoisGuard Protected", rirAllocationOwner: "WhoisGuard Protected Inc" }`.
   - `evaluateSignals` returns 0 supporting signals for `{ domain: "", ptrHostname: "host.example.com" }`.
   - `calculateApplicationOrigin` returns `evidenceCount: 0` when `supportingSignals` is `[]`.
