# Review & Handoff Report — Milestone M2 (Subleased Infrastructure Fix)

## Explicit Verdict: APPROVE

---

## 1. Observation

A detailed review was conducted on the changes implemented by Worker M2 for Milestone M2 (Requirement R2: Subleased Infrastructure Fix).

### Files Examined
1. `src/server/modules/infrastructure.ts`:
   - `RipeRoutingStatus` interface updated to allow numeric or string `origin` (`origin?: string | number`).
   - `fetchRipeForIp` updated to convert `origin.origin` to string via `String(origin.origin).replace(/^AS/i, "")` before stripping the `"AS"` prefix (lines 105-108).
   - `leaseSignalsFor` re-implemented (lines 145-171):
     - Calculates `ipOwner = ip.asn.org || ip.rirAllocationOwner || ip.networkName`.
     - Matches `domainOwner` and `ipOwner` using `orgSimilar` for `"in-house"` signal.
     - Infers `"direct-provider"` when `ip.providerType` is `"enterprise"`/`"isp"` or `ip.asn.asn` is set, even if `domainOwner` is undefined.
     - Adds `"subleased"` signal only when `rirAllocationOwner` and `asn.org` are both present and fail `orgSimilar`.
2. `src/server/modules/ip.ts`:
   - Added `vcardProp` helper (lines 42-50) to traverse jCard vCard array format safely (`entry[0] === propName` and `typeof entry[3] === "string"`).
   - Re-implemented `rdapOrg` (lines 52-71) to extract clean organization names from entity `org`/`fn` properties while skipping metadata tags (`ORG-*`, `-MNT`, `version`), falling back to description lines in `remarks`, and finally defaulting to `rdap.name ?? rdap.handle`.
3. `src/tests/parsers.test.ts`:
   - Added unit test verifying enterprise/ISP direct provider classification for AS3233 / ICI Bucuresti infrastructure (lines 126-142).
4. `scratch/test-m2-infrastructure-challenger.test.ts`:
   - Added 5 adversarial challenger tests covering numeric RIPE Stat origin values, string/null/zero origins, ICI Bucuresti direct-provider attribution, and subleased signal accuracy.

---

## 2. Logic Chain

1. **RIPE Stat ASN Conversion Fix**:
   - The RIPE Stat API returns integer ASN values (e.g. `3233`). Previously, calling `.replace()` directly on a number threw `TypeError: origin?.origin?.replace is not a function`.
   - Wrapping with `String(origin.origin)` before `.replace(/^AS/i, "")` ensures string or number inputs are normalized safely.
2. **RDAP jCard Parsing Fix**:
   - RDAP entity vCards present structured arrays where property values like `fn` or `org` reside in specific array indexes.
   - Using `vcardProp` to pull property values by key and filtering out maintainer handles (`-MNT`) or placeholder IDs (`ORG-...`) prevents junk metadata strings from contaminating allocation owner fields.
   - Description lines from `remarks` serve as a clean fallback when entity fields are obfuscated.
3. **Lease Signal Owner Inference**:
   - For TLDs like `.ro` where WHOIS domain owner privacy hides registrant details, `domainOwner` is often `undefined`.
   - Expanding `leaseSignalsFor` to inspect `ip.providerType` (`"enterprise"` or `"isp"`) or presence of `ip.asn.asn` enables correct classification as `"direct-provider"` (e.g., ICI Bucuresti AS3233 hosting `edu.gov.ro`) instead of defaulting to `"unknown"`.
   - Comparing `rirAllocationOwner` and `asn.org` via `orgSimilar` prevents false `"subleased"` warnings when allocation and ASN owner represent the same organization.

---

## 3. Integrity Verification

- **Hardcoded test outputs**: None found. Checked `src/server/modules/infrastructure.ts` and `src/server/modules/ip.ts` for any static targets (`edu.gov.ro`, `3233`, `ICI`). Zero hardcoded outputs exist in `src/server`.
- **Facade/Dummy implementations**: All functions contain real, generic parsing and classification logic.
- **Shortcuts / Bypasses**: No shortcuts taken. Full RDAP and RIPE Stat enrichment pipelines are preserved and functional.
- **Fabricated verification outputs**: Build and test execution results were independently reproduced and verified.

---

## 4. Adversarial Stress-Test Results

| Scenario | Expected Behavior | Actual Behavior | Result |
|----------|-------------------|-----------------|--------|
| Numeric ASN origin (`3233`) from RIPE API | Converts to string `"3233"`, no exception | `originAsn = "3233"`, no warning | PASS |
| Null / Undefined / Zero origin values | Returns `undefined` or `"0"`, gracefully handles | Handled without errors | PASS |
| `domainOwner` undefined (e.g., `.ro` WHOIS privacy) | Identifies hoster (AS3233) as `direct-provider` | `verdict = "Direct provider"`, `kind = "direct-provider"` | PASS |
| Matching allocation and ASN owner (`ICI Bucuresti`) | Suppresses `subleased` signal | No `subleased` signal emitted | PASS |
| Differing allocation and ASN owner | Emits `subleased` signal | `kind = "subleased"` emitted | PASS |
| Network failure / timeout during RIPE API call | Logged in `warnings`, scan completes | Safe fallback to IP profile data | PASS |

---

## 5. Caveats

- In offline test environments or network-restricted setups, live RIPE Stat and RDAP calls gracefully fall back to local IP profiles without failing the scan.
- Domain-level owner matching for `.ro` domains relies on DNS PTR or allocation owner data when domain WHOIS privacy is active.

---

## 6. Conclusion

Milestone M2 (Requirement R2) is completely and correctly implemented. All acceptance criteria, unit tests, build checks, and adversarial stress tests have passed with high quality and integrity.

**Verdict**: **APPROVE**

---

## 7. Verification Method

To independently verify this review:

1. **Build Check**:
   ```bash
   npm run server:build
   ```
   *Expected Output*: Exit code 0 (TypeScript compilation clean).

2. **Unit Test Suite**:
   ```bash
   npm test
   ```
   *Expected Output*: Exit code 0 (31 passed across 4 test files).

3. **Challenger Test Suite**:
   ```bash
   npx vitest run scratch/test-m2-infrastructure-challenger.test.ts
   ```
   *Expected Output*: Exit code 0 (5 passed).
