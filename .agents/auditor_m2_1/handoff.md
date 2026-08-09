# Forensic Audit Report — Milestone M2 (Requirement R2: Subleased Infrastructure Fix)

**Work Product**: `src/server/modules/infrastructure.ts`, `src/server/modules/ip.ts`
**Profile**: General Project
**Integrity Mode**: Development (also meets Demo & Benchmark standards)
**Verdict**: **CLEAN**

---

## 1. Observation

A forensic integrity inspection was conducted on the Milestone M2 implementation in `src/server/modules/infrastructure.ts` and `src/server/modules/ip.ts`, as well as associated unit tests in `src/tests/parsers.test.ts`.

### 1.1 Direct Code Audit Findings
1. **`src/server/modules/infrastructure.ts`**:
   - Lines 15-23: `RipeRoutingStatus` interface updated to accept `origin?: string | number`, `less_specifics` origin, and `more_specifics` origin.
   - Lines 101-111: `fetchRipeForIp` explicitly converts RIPE Stat origin values using `String(origin.origin).replace(/^AS/i, "")`, robustly handling integer ASNs returned by RIPE Stat API (e.g., `3233`) without throwing runtime `TypeError` exceptions.
   - Lines 145-171: `leaseSignalsFor` contains generic signal classification rules for:
     - `in-house`: when domain owner matches ASN/allocation owner via `orgSimilar`.
     - `cdn-proxy` / `direct-provider`: for `cloud`, `cdn`, `enterprise`, and `isp` provider types or valid ASNs.
     - `subleased`: when RIR allocation owner differs from ASN owner.
     - `suballocated`: when observed BGP origin differs from enriched ASN.
     - `unknown`: default low-confidence signal when evidence is sparse.
   - No hardcoded target checks (e.g., `if (domain === "edu.gov.ro")`) or mock bypasses exist in this module.

2. **`src/server/modules/ip.ts`**:
   - Lines 42-50: `vcardProp` implements generic RFC-compliant jCard array property parsing (`entity.vcardArray?.[1]`), correctly searching for key names such as `"org"` or `"fn"`.
   - Lines 52-71: `rdapOrg` searches roles in priority order (`registrant`, `administrative`, `technical`), filters handles starting with `"ORG-"` or containing `"-MNT"` / `"version"`, inspects `remarks` description arrays for fallback organizational names, and defaults to `rdap.name ?? rdap.handle`.
   - No hardcoded provider names or dummy placeholders exist.

3. **`src/tests/parsers.test.ts`**:
   - Lines 126-142: Contains unit test verifying `classifyLeaseSignalsForTest` with enterprise/ISP provider data (AS3233 / ICI Bucuresti). The test uses mock fixtures inside test files, which is standard testing practice and does not affect production code.

### 1.2 Phase Results Summary
| Check | Status | Details |
|---|---|---|
| Hardcoded Output Check | **PASS** | Zero occurrences of target domain `edu.gov.ro` or specific provider strings in server modules. |
| Facade Implementation Check | **PASS** | Full, functional logic implemented for RDAP vCard parsing, ASN coercion, and lease signal inference. |
| Pre-populated Artifact Check | **PASS** | Workspace clean of pre-existing fake logs or attestation files. |
| Build Verification | **PASS** | `npm run server:build` compiled with exit code 0. |
| Behavioral Verification | **PASS** | All 54 vitest unit tests passed. Empirical node execution verified correct classification across enterprise, subleased, and in-house infrastructure. |
| Dependency Audit | **PASS** | No external dependencies circumverted core logic. |

---

## 2. Logic Chain

1. **Codebase Inspection**:
   Static analysis of `src/server/modules/infrastructure.ts` and `src/server/modules/ip.ts` showed no hardcoded returns, fake provider stubs, or domain-specific branching logic.
2. **Implementation Verification**:
   The fix handles the RIPE Stat API schema (where origin numbers are returned as integers rather than string prefixes) and RDAP jCard data structures (where entity names are nested within array tuples).
3. **Classification Logic**:
   The algorithm distinguishes between subleased network space (where allocation owner != ASN owner) and enterprise/ISP direct hosting (where ASN owner operating infrastructure matches provider type `enterprise` or `isp`, such as AS3233 / ICI Bucuresti).
4. **Empirical Execution**:
   Independent execution of node verification scripts confirmed:
   - Enterprise AS3233 infrastructure yields `Direct provider` with role provider `Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti`.
   - Mismatched allocation owner yields `Likely subleased network`.
   - Domain owner matching ASN owner yields `In-house infrastructure`.

---

## 3. Caveats

- RIPE Stat and RDAP live HTTP endpoints are network-dependent. In offline or firewalled environments, the module gracefully handles network failures by returning low-confidence fallback records without crashing.
- No caveats regarding code integrity.

---

## 4. Conclusion

**Verdict: CLEAN**

Milestone M2 (Requirement R2: Subleased Infrastructure Fix) passes forensic integrity verification with zero violations. The implementation is authentic, fully generalized, contains no hardcoded bypasses or facade routines, and passes all build and test requirements.

---

## 5. Verification Method

To independently verify this audit:

1. **Build Check**:
   ```bash
   npm run server:build
   ```
   *Expected result*: Exit code 0 (TypeScript compilation succeeded).

2. **Test Suite Check**:
   ```bash
   npm test
   ```
   *Expected result*: 54 passed unit tests across 7 test files.

3. **Empirical Supply Chain Verification**:
   ```bash
   node -e "
   import('./dist-server/server/modules/infrastructure.js').then(async (infModule) => {
     const profile = {
       ip: '193.230.5.163',
       ptr: ['edu.gov.ro'],
       asn: { asn: '3233', org: 'Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti' },
       geo: {},
       providerType: 'enterprise',
       landlord: 'Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti',
       rirAllocationOwner: 'Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti',
       networkName: 'ICI-NET',
       originAsn: '3233',
       announcedPrefix: '193.230.4.0 - 193.230.5.255',
       upstreams: [], peers: [], ixPresence: [], facilityPresence: [], sources: []
     };
     const res = await infModule.buildInfrastructureSupplyChain(undefined, { a: ['193.230.5.163'], ns: ['ns1.roedu.net'], mx: [{ exchange: 'mail.edu.ro', priority: 10 }], txt: [], cname: [], ptr: [] }, [profile], [], false, 5000);
     console.log('Verdict:', res.infrastructure.verdict);
   });
   "
   ```
   *Expected output*: `Verdict: Direct provider`.
