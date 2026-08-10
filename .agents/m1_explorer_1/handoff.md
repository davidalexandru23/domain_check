# Handoff Report: Milestone 1 Type System & Data Contract Investigation

**Agent**: `m1_explorer_1`  
**Working Directory**: `/Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_1`  
**Target Delivery Path**: `/Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_1/handoff.md`  
**Date**: 2026-08-10  

---

## 1. Observation

Direct observations from examining the codebase and specification documents:

- **Reference Specifications**:
  - `ORIGINAL_REQUEST.md`: R1 (Evidence & Contradiction Engine with 0-100 scoring model), R2 (Separation of 7 Ownership Concepts & Confidences), R5 (UI Score Bars & Evidence Breakdown).
  - `PROJECT.md § Interface Contracts` (lines 60–148): Formally defines canonical interface contracts for `EvidenceSignal`, `OriginCandidateDetailed`, `DecoupledOwnershipModel`, `OwnershipConcept`, and `ScanResult`.
  - `spec_analysis.md` (lines 61–205): Specifies positive signal weights (+30 TLS SAN, +25 HTTP content, +20 Subdomain leak, +15 PTR, +10 ASN match, +5 Open port) and contradiction penalties (-30 CDN ASN, -25 Cloud WAF header, -20 Generic landing, -15 TLS mismatch, -15 MX infrastructure).

- **Existing Codebase Analysis**:
  - `src/shared/types.ts` (lines 249–271): `OriginCandidate` currently uses a 4-field structure `{ ip: string; source: string; provider: string; confidence: "high" | "medium" | "low" }`. `ScanResult` contains `ownership: OwnershipTimelineItem[]` and `origins: OriginCandidate[]`.
  - `src/server/scanner.ts`:
    - Line 118: `const [{ profile, ownership }, dnsResult, ...] = await Promise.all(...)`
    - Line 275: `ownership: [...ownership, ...ct.timeline]`
    - Line 198 & 259: `const origins: OriginCandidate[] = []; origins.push(...)`
  - `src/server/modules/infrastructure.ts`:
    - Lines 1–12: Imports `DnsRecordSet`, `HttpProfile`, `InfrastructureProvider`, `InfrastructureSupplyChain`, `IpProfile`, `IpSupplyChain`, `NetworkLeaseSignal`, `ProviderConfidence`, `SourceRef`, `UpstreamRelation`.
  - `src/client/main.tsx`:
    - Line 4: `import type { ActiveOptions, ScanJob, ScanMode, ScanResult } from "../shared/types";`
    - Lines 212–214 & 254–263: Consumes `result.origins` (reading `o.confidence === "high"`, `o.ip`, `o.provider`, `o.source`).

---

## 2. Logic Chain

1. **Premise 1**: M1 implementation (`src/server/engine/scoring.ts` and `src/server/engine/ownership.ts`) requires structured types for `EvidenceSignal`, `CandidateClassification`, `OriginCandidateDetailed`, `ConceptConfidence`, `OwnershipConcept`, `DecoupledOwnershipModel`, and `ScanResult`.
2. **Premise 2**: In `src/server/scanner.ts`, line 275 sets `ownership: [...ownership, ...ct.timeline]`, expecting `ownership` to be `OwnershipTimelineItem[]`. Therefore, changing `ScanResult.ownership` to `DecoupledOwnershipModel` directly would cause a TypeScript type error in `scanner.ts`.
3. **Reasoning 1**: To preserve backward compatibility without breaking existing server code, `ScanResult` must maintain `ownership: OwnershipTimelineItem[]` for legacy WHOIS timeline events, while introducing `decoupledOwnership?: DecoupledOwnershipModel` for the 7 decoupled ownership concepts.
4. **Premise 3**: In `src/client/main.tsx`, lines 212–214 and 257 map over `result.origins`, checking `confidence === "high"`, `ip`, `provider`, `source`.
5. **Reasoning 2**: `ScanResult` must preserve `origins: OriginCandidate[]` (populated alongside `candidates: OriginCandidateDetailed[]` in `scanner.ts`), and `OriginCandidateDetailed` should include optional compatibility fields (`source?: string`, `confidence?: "high" | "medium" | "low"`) so existing frontend and legacy functions can operate without compilation or runtime errors.
6. **Conclusion**: Adding the new interface definitions while preserving existing types and introducing optional/compatible properties guarantees 100% type safety and backward compatibility across all modules.

---

## 3. Caveats

- **Scope Boundary**: This investigation is read-only. Source files under `src/` were analyzed but not edited during this phase.
- **Assumptions Made**:
  - `EvidenceSignal` uses canonical type `"supporting" | "contradiction"` from `PROJECT.md`, with `EvidenceItem` provided as a type alias for `spec_analysis.md` compatibility.
  - `CandidateClassification` includes `"email-only"` to support MX infrastructure isolation (R3).
- **Alternative Interpretations**:
  - Renaming `ScanResult.ownership` to `decoupledOwnership` vs overwriting `ScanResult.ownership`: Overwriting `ownership` would require modifying `src/server/scanner.ts` simultaneously. Adding `decoupledOwnership` is safer and cleaner for modular implementation.

---

## 4. Conclusion

The type definitions for Milestone 1 are fully mapped out and ready for implementation. The proposed drop-in code patch for `src/shared/types.ts` has been documented in `/Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_1/analysis.md § 5`.

Summary of target interfaces:
- `EvidenceSignal` / `EvidenceItem`
- `CandidateClassification` / `ScoreClassification`
- `OriginCandidateDetailed`
- `ConceptConfidence` / `ConfidenceRating`
- `OwnershipConcept` / `OwnershipConceptType`
- `DecoupledOwnershipModel`
- `MxInfrastructureSummary` & `NarrativeVerdict`
- Refactored `ScanResult`

---

## 5. Verification Method

To independently verify the analysis and proposed type definitions:

1. **Inspect Analysis Report**:
   ```bash
   cat /Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_1/analysis.md
   ```
2. **Type Check Verification**:
   When `m1_implementer_1` applies the patch to `src/shared/types.ts`, execute:
   ```bash
   npx tsc --noEmit
   ```
   *Expected result*: Zero compilation errors across `src/shared/types.ts`, `src/server/scanner.ts`, `src/server/modules/infrastructure.ts`, `src/server/index.ts`, and `src/client/main.tsx`.

3. **Unit Test Verification**:
   Execute:
   ```bash
   npx vitest run
   ```
   *Expected result*: All unit tests in `src/tests/parsers.test.ts` pass cleanly.
