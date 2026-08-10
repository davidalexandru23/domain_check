# Handoff Report: Decoupled 7 Ownership Concepts Engine & Unit Test Strategy

**From**: m1_explorer_3  
**To**: parent (ff183762-c32f-4d20-831e-468e44882b94) / m1_orch / m1_implementer_2  
**Date**: 2026-08-10  
**Target Path**: `/Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_3/handoff.md`  

---

## 1. Observation

- **`ORIGINAL_REQUEST.md:21-23`**: R2 requirement explicitly calls for separating 7 infrastructure concepts (Domain ownership, IP ownership, ASN ownership, Network operation, Hosting provider, Application origin, and Physical location) with independent confidence metrics.
- **`PROJECT.md:100-118`**: Interface specification for `OwnershipConcept` (`concept`, `label`, `identity`, `confidence`, `evidenceCount`, `explanation`) and `DecoupledOwnershipModel`.
- **`spec_analysis.md:130-217`**: Confidence calculation rules for each of the 7 concepts (ranging from 0% to 100%).
- **`src/shared/types.ts:256-271`**: Current `ScanResult` interface lacks `DecoupledOwnershipModel` definitions.
- **`src/tests/parsers.test.ts:1-105`**: Project uses `vitest` (`import { describe, expect, it } from "vitest"`).

---

## 2. Logic Chain

1. **Problem**: Traditional ASM tools conflate domain registrant, BGP ASN operator, IP block owner, and CDN proxy into a single "owner" field, creating false attribution for proxied or co-located sites.
2. **Data Structure Strategy**: Defining `OwnershipConcept` with top-level uniform properties (`concept`, `label`, `identity`, `confidence`, `evidenceCount`, `explanation`) enables UI components (`OwnershipGrid.tsx`) to render consistent 0-100% confidence meters and explanation cards while maintaining detailed nested metadata (`details`).
3. **Decoupled Scoring Derivation**:
   - `domainOwner`: 90-95% for unredacted WHOIS org, 20% for privacy-redacted, 40% for registrar-only, 0% for unlisted.
   - `ipAllocation`: 95% for RDAP inetnum match, 50% for ASN org fallback, 0% for missing.
   - `asnOperation`: 95% for BGP WHOIS & PeeringDB match, 60% for ASN number only, 0% for missing.
   - `networkOperation`: 90% for direct operation, 75% for subleased netblock (`rirOwner !== asnOrg`), 60% for BGP origin mismatch.
   - `hostingProvider`: 95% for CDN/WAF proxy, 85% for Cloud/Bare-Metal, 80% for Enterprise/ISP, 20% for unclassified.
   - `applicationOrigin`: Equal to top candidate evidence score (e.g. 85%) for direct origin; capped at 25% for CDN-proxied targets.
   - `physicalLocation`: 90% for facility match, 80% for city+country, 60% for country, 30% for global Anycast edge.
4. **Unit Test Strategy**: Construct 6 comprehensive Vitest test cases in `src/tests/ownership.test.ts` validating direct hosting (`ici.ro`), CDN proxying (`Cloudflare`), subleasing (`Hetzner reseller`), WHOIS privacy protection, missing/empty input resilience, and output layout compliance.

---

## 3. Caveats

- **Read-Only Scope**: This report provides full architectural specifications, code designs, and unit test code blueprints. No source files were edited in this step.
- **Upstream Dependencies**: ASN, GeoIP, and RDAP enrichment depend on scanner module outputs (`IpProfile`, `DomainProfile`, `OriginCandidateDetailed`). Unit tests rely on mocked inputs mirroring scanner data shapes.

---

## 4. Conclusion

The specification for `src/server/engine/ownership.ts` and `src/tests/ownership.test.ts` is fully formulated and ready for implementation. It resolves all conflation issues by delivering 7 decoupled concepts with explicit 0-100% confidence scoring and natural language rationale strings.

The complete analysis report is located at:
`/Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_3/analysis.md`

---

## 5. Verification Method

To independently verify the implementation once written:

1. **Run Unit Tests**:
   ```bash
   npx vitest run src/tests/ownership.test.ts
   ```
   *Expected Result*: All 6 test cases pass without errors.

2. **Run TypeScript Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected Result*: Zero type errors across `src/shared/types.ts` and `src/server/engine/ownership.ts`.
