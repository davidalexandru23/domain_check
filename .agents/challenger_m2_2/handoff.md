# Milestone M2 (Requirement R2: Subleased Infrastructure Fix) — Adversarial Stress Test Report & Verdict

## Verdict: APPROVE

---

## 1. Observation

### 1.1 Target Functions & Files Inspected
- `src/server/modules/ip.ts`:
  - `vcardProp` (lines 42-50): extracts property values from RDAP entity jCard array (`vcardArray[1]`), validating entry structure (`Array.isArray(entry) && entry[0] === propName && typeof entry[3] === "string"`).
  - `rdapOrg` (lines 52-71): iterates entity roles (`registrant`, `administrative`, `technical`), filters handles starting with `"ORG-"`, maintainer tags containing `"-MNT"`, and `"version"` strings. Falls back to `remarks` description array filtering out `"filtered"`, and finally defaults to `rdap.name ?? rdap.handle`.
  - `getIpProfile` (lines 73-131): wraps RDAP fetch and `rdapOrg` in `try/catch` to gracefully convert errors into `SourceRef` low-confidence notes without crashing.
- `src/server/modules/infrastructure.ts`:
  - `fetchRipeForIp` (lines 101-111): extracts origins converting `origin.origin` via `String(origin.origin).replace(/^AS/i, "")` for integer, string, or mixed origin types returned by RIPE Stat API.
  - `leaseSignalsFor` (lines 145-171): classifies network leasing relationships (`in-house`, `direct-provider`, `cdn-proxy`, `subleased`, `suballocated`, `unknown`) considering ISP/Enterprise infrastructure owners (e.g., AS3233 / ICI Bucuresti) and matching domain vs allocation owners using `orgSimilar`.

### 1.2 Build & Test Verification Executed
1. **Server Build Command**:
   ```bash
   npm run server:build
   ```
   *Output*: Exit code 0 (`tsc -p tsconfig.server.json` compiled with 0 errors).

2. **Full Test Suite Execution**:
   ```bash
   npm test
   ```
   *Output*: Exit code 0 (7 test files passed, 54/54 unit tests passing).

3. **Empirical Adversarial Test Suite Created**:
   - `scratch/test-m2-adversarial-challenger.test.ts` (15 edge-case tests covering missing entities, malformed roles, non-string origin numbers, weird WHOIS/vCard structures, and lease signal edge cases).

---

## 2. Logic Chain

1. **RIPE Stat Integer Origin Safety**:
   - Observation: RIPE Stat API returns integer AS numbers (e.g. `origins: [{ origin: 3233 }]`).
   - Logic: Calling `.replace(/^AS/i, "")` directly on a number throws `TypeError: origin?.origin?.replace is not a function`.
   - Verification: `fetchRipeForIp` casts `origin.origin` with `String(origin.origin)` prior to regex replacement. Empirical test `handles numeric origin numbers (integer, float, zero) from RIPE Stat API` confirmed string conversion to `"3233"` with zero warnings or exceptions.

2. **RDAP Entity & vCard Structure Robustness**:
   - Observation: RDAP jCard responses can omit `entities`, present `entities: []`, or include malformed role values (`roles: []`, `roles: undefined`, `roles: null`).
   - Logic: `vcardProp` checks `Array.isArray(entity.vcardArray?.[1])` and `typeof entry[3] === "string"`. If roles or vCard data are missing or corrupt, `rdapOrg` safely falls back to `remarks` descriptions or `rdap.name ?? rdap.handle`.
   - Verification: Empirical tests 1.1–1.7 confirmed that empty entities, unknown roles, missing text properties, and non-array remarks do not throw uncaught exceptions or crash the process.

3. **Subleased Infrastructure Signal Accuracy (Target `edu.gov.ro` / AS3233)**:
   - Observation: Requirement R2 specifies that target `edu.gov.ro` (hosted on AS3233 - ICI Bucuresti) must be identified as an organizational provider rather than failing or showing `unknown` / false `subleased`.
   - Logic: `leaseSignalsFor` includes `"enterprise"` and `"isp"` provider types in `direct-provider` signal creation when `ipOwner` operates the infrastructure. `orgSimilar` compares clean strings (`"ICI Bucuresti"`) across `rirAllocationOwner` and `asn.org`, preventing false `subleased` signals when RIR and ASN records name the same institution.
   - Verification: Unit test `detects enterprise/ISP direct hosting provider infrastructure (e.g. AS3233 ICI Bucuresti)` and full supply chain execution confirmed verdict `"Direct provider"` with zero false `subleased` warnings.

---

## 3. Caveats

1. **vCard Property Single-Match Limitation**:
   - In `rdapOrg`, `vcardProp(entity, "fn")` returns only the first matching `fn` entry in `vcardArray`. If an entity has multiple `fn` entries where the first is `"AS3233-MNT"` and the second is `"ICI Bucuresti"`, `vcardProp` returns `"AS3233-MNT"`, causing `rdapOrg` to reject the entity and rely on `remarks` or network handle fallback. This is non-critical because standard RDAP feeds either place the organizational name in `org`/`fn` or fall back cleanly to `remarks` or `rdap.name`.

2. **Case Sensitivity in Maintainer Filtering**:
   - The regex check `!fn.includes("-MNT")` in `rdapOrg` is case-sensitive. If an RDAP feed uses lowercase `-mnt`, it will not be filtered out by `!fn.includes("-MNT")`. In real-world RIPE/ARIN/APNIC RDAP feeds, maintainer handles are uppercase.

---

## 4. Conclusion

Milestone M2 (Requirement R2: Subleased Infrastructure Fix) passes all empirical adversarial stress tests. Server compilation succeeds without TypeScript errors, all unit tests pass, edge cases in RDAP/WHOIS and RIPE Stat APIs degrade gracefully, and target infrastructure attributions (including `edu.gov.ro` / AS3233 ICI Bucuresti) function accurately as direct infrastructure providers.

**Verdict: APPROVE**

---

## 5. Verification Method

To independently verify this verdict:

1. **Run Server Build**:
   ```bash
   npm run server:build
   ```
   *Expected Result*: Process completes with exit code 0.

2. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   *Expected Result*: All 7 test files pass (54 passed tests).

3. **Inspect Adversarial Challenger Test Suite**:
   View `/Users/davidalexandru/Downloads/domain_check/scratch/test-m2-adversarial-challenger.test.ts`.
