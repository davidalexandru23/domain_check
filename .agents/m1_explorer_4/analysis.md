# Milestone 1 Remediation Analysis & Specification Report

**Author**: `m1_explorer_4`  
**Date**: 2026-08-10  
**Target Target Scope**: `src/server/engine/scoring.ts`, `src/server/engine/ownership.ts`, `src/shared/types.ts`  
**Purpose**: Complete, precise, line-by-line remediation specification for `m1_worker_2` to resolve all 6 empirical logic bugs identified by `m1_challenger_1`.

---

## 1. Executive Summary

Empirical review by `m1_challenger_1` uncovered 6 logic bugs and false-positive edge cases across the scoring and 7 decoupled ownership engines. This report provides the definitive root-cause analysis, exact code modifications (before vs. after), new utility functions, edge-case coverage, and unit test specifications required for `m1_worker_2` to fix all 6 issues cleanly without introducing regressions.

---

## 2. Detailed Bug Analysis & Code Remediation Plan

### Bug 1: `calculateAsnOperation` High Confidence Assigned to Fallback Strings

- **Affected File**: `src/server/engine/ownership.ts` (lines 164–211) & `src/server/engine/scoring.ts` (lines 320–321)
- **Root Cause**:
  In `scoring.ts`, default values for missing ASN and Provider fields are set to `"Unknown ASN"` and `"Unknown Provider"`.
  When passed into `computeDecoupledOwnership`, `calculateAsnOperation` checked `if (asnNum && orgName)`.
  Because `"Unknown ASN"` and `"Unknown Provider"` are non-empty strings, the condition evaluated to `true`, returning `confidence: 95` (high) for `identity: "ASUnknown ASN - Unknown Provider"`.
- **Required Helper Utilities**:
  Define validation helpers in `src/server/engine/ownership.ts` (or export from a shared section):
  ```typescript
  export function isValidAsnNum(asn: string | undefined | null): boolean {
    if (!asn) return false;
    const clean = asn.trim().replace(/^AS/i, "").trim();
    return /^\d+$/.test(clean) && parseInt(clean, 10) > 0;
  }

  export function isValidOrgName(org: string | undefined | null): boolean {
    if (!org) return false;
    const trimmed = org.trim();
    if (trimmed.length === 0) return false;
    return !/^(unknown|n\/a|none|unclassified|null|undefined)(\s+(provider|host|org|asn|owner))?$/i.test(trimmed);
  }
  ```
- **Remediation Specification (`src/server/engine/ownership.ts`)**:
  Replace the logic in `calculateAsnOperation`:
  ```typescript
  // BEFORE
  const rawAsn = ipProfile.asn?.asn || topCandidate?.asn;
  const orgName = ipProfile.asn?.org || topCandidate?.provider;
  const asnNum = rawAsn ? rawAsn.replace(/^AS/i, "") : undefined;

  if (asnNum && orgName) {
    const confidence = 95;
    return {
      concept: "asnOperation",
      label: "Autonomous System (ASN)",
      identity: `AS${asnNum} - ${orgName}`,
      confidence,
      ...
  ```
  ```typescript
  // AFTER
  const rawAsn = ipProfile.asn?.asn || topCandidate?.asn;
  const rawOrg = ipProfile.asn?.org || topCandidate?.provider;
  const cleanAsn = rawAsn ? rawAsn.trim().replace(/^AS/i, "").trim() : undefined;
  const validAsn = isValidAsnNum(cleanAsn) ? cleanAsn : undefined;
  const validOrg = isValidOrgName(rawOrg) ? rawOrg!.trim() : undefined;

  if (validAsn && validOrg) {
    const confidence = 95;
    return {
      concept: "asnOperation",
      label: "Autonomous System (ASN)",
      identity: `AS${validAsn} - ${validOrg}`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 2,
      explanation: `BGP routing table and RIR records confirm origin Autonomous System AS${validAsn} (${validOrg}).`,
      details: { asn: `AS${validAsn}`, orgName: validOrg }
    };
  }

  if (validAsn) {
    const confidence = 60;
    return {
      concept: "asnOperation",
      label: "Autonomous System (ASN)",
      identity: `AS${validAsn}`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 1,
      explanation: `Autonomous System number AS${validAsn} detected, but organization details could not be retrieved.`,
      details: { asn: `AS${validAsn}` }
    };
  }

  const confidence = 0;
  return {
    concept: "asnOperation",
    label: "Autonomous System (ASN)",
    identity: "Unknown ASN",
    confidence,
    confidenceRating: getConfidenceRating(confidence),
    evidenceCount: 0,
    explanation: "IP address is not associated with an observed BGP Autonomous System.",
    details: {}
  };
  ```

---

### Bug 2: `calculateHostingProvider` 50% Confidence for `"Unknown Provider"`

- **Affected File**: `src/server/engine/ownership.ts` (lines 283–346)
- **Root Cause**:
  `calculateHostingProvider` checked `if (providerName !== "Unknown Host")`. Since `scoreOriginCandidate` passed `"Unknown Provider"`, `"Unknown Provider" !== "Unknown Host"` evaluated to `true`, assigning `confidence: 50` (medium) to `"Unknown Provider"`.
- **Remediation Specification (`src/server/engine/ownership.ts`)**:
  Use `isValidOrgName(providerName)` to validate the hosting provider name before entering the 50% confidence block:
  ```typescript
  // BEFORE
  if (providerName !== "Unknown Host") {
    const confidence = 50;
    return {
      concept: "hostingProvider",
      label: "Hosting Provider",
      identity: providerName,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 1,
      explanation: `Hosting provider identified as ${providerName}.`,
      details: { category: "unknown" }
    };
  }
  ```
  ```typescript
  // AFTER
  if (isValidOrgName(providerName)) {
    const confidence = 50;
    return {
      concept: "hostingProvider",
      label: "Hosting Provider",
      identity: providerName,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 1,
      explanation: `Hosting provider identified as ${providerName}.`,
      details: { category: "unknown" }
    };
  }
  ```
  Additionally, for `isCdn` and `pType` branches, sanitize `providerName`:
  ```typescript
  const safeProvider = isValidOrgName(providerName) ? providerName : (isCdn ? "CDN / WAF Provider" : "Hosting Provider");
  ```

---

### Bug 3: False Positive Sublease Alerts from Minor String Formatting Differences

- **Affected File**: `src/server/engine/ownership.ts` (lines 213–281)
- **Root Cause**:
  `calculateNetworkOperation` checked `rirOwner.toLowerCase() !== asnOrg.toLowerCase()`.
  Real-world RDAP and BGP records often contain minor punctuation or legal suffix variations (e.g. `"Cloudflare, Inc."` vs `"Cloudflare Inc"` or `"Hetzner Online GmbH."` vs `"Hetzner Online GmbH"`). This caused legitimate direct network operations to be flagged as `Subleased Space` with 75% confidence.
- **Required Matching Utility**:
  Define `normalizeOrgName` and `areOrgsMatching` in `src/server/engine/ownership.ts`:
  ```typescript
  export function normalizeOrgName(name: string): string {
    if (!name) return "";
    let clean = name.toLowerCase();
    // Remove common legal entity suffixes
    clean = clean.replace(/\b(inc|incorporated|llc|l\.l\.c\.|gmbh|ltd|limited|corp|corporation|co|company|b\.v\.|bv|ag|sa|s\.a\.|pty|pte|srl|s\.r\.l\.|plc)\b/gi, "");
    // Strip all non-alphanumeric characters
    clean = clean.replace(/[^a-z0-9]/g, "");
    return clean.trim();
  }

  export function areOrgsMatching(org1?: string, org2?: string): boolean {
    if (!org1 || !org2) return false;
    const n1 = normalizeOrgName(org1);
    const n2 = normalizeOrgName(org2);
    if (!n1 || !n2) return false;
    if (n1 === n2) return true;
    if (n1.length >= 4 && n2.length >= 4) {
      if (n1.includes(n2) || n2.includes(n1)) return true;
    }
    return false;
  }
  ```
- **Remediation Specification (`src/server/engine/ownership.ts`)**:
  ```typescript
  // BEFORE
  const isSubleased = leaseSignal?.kind === "subleased" || (rirOwner && asnOrg && rirOwner.toLowerCase() !== asnOrg.toLowerCase());
  ```
  ```typescript
  // AFTER
  const hasValidRirOwner = isValidOrgName(rirOwner);
  const hasValidAsnOrg = isValidOrgName(asnOrg);
  const isSubleased =
    leaseSignal?.kind === "subleased" ||
    (hasValidRirOwner && hasValidAsnOrg && !areOrgsMatching(rirOwner, asnOrg));
  ```

---

### Bug 4: Positive ASN Match Awarded to WHOIS Privacy Proxy Entities

- **Affected File**: `src/server/engine/scoring.ts` (lines 175–184)
- **Root Cause**:
  `evaluateSignals` compared `input.registrantOrg` with `input.asnOrg` and `input.rirAllocationOwner` without checking whether `input.registrantOrg` is a privacy protection proxy (e.g. `"WhoisGuard Protected"`, `"Domains By Proxy, LLC"`).
  When privacy services matched between WHOIS and RIR records, `POS_ASN_MATCH` (+10 points) was erroneously awarded.
- **Required Privacy Utility**:
  Define `isPrivacyOrg` in `src/server/engine/scoring.ts`:
  ```typescript
  const PRIVACY_REGEX = /privacy|redacted|withheld|whoisguard|domains by proxy|contact privacy|select request|identity protection/i;

  export function isPrivacyOrg(org?: string): boolean {
    if (!org) return false;
    return PRIVACY_REGEX.test(org.trim());
  }
  ```
- **Remediation Specification (`src/server/engine/scoring.ts`)**:
  ```typescript
  // BEFORE
  if (
    input.registrantOrg &&
    ((input.asnOrg && input.asnOrg.toLowerCase().includes(input.registrantOrg.toLowerCase())) ||
      (input.rirAllocationOwner && input.rirAllocationOwner.toLowerCase().includes(input.registrantOrg.toLowerCase())))
  ) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_ASN_MATCH,
      observedData: `ASN/Allocation Org: ${input.asnOrg || input.rirAllocationOwner}`
    });
  }
  ```
  ```typescript
  // AFTER
  if (
    input.registrantOrg &&
    !isPrivacyOrg(input.registrantOrg) &&
    ((input.asnOrg && input.asnOrg.toLowerCase().includes(input.registrantOrg.toLowerCase())) ||
      (input.rirAllocationOwner && input.rirAllocationOwner.toLowerCase().includes(input.registrantOrg.toLowerCase())))
  ) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_ASN_MATCH,
      observedData: `ASN/Allocation Org: ${input.asnOrg || input.rirAllocationOwner}`
    });
  }
  ```

---

### Bug 5: Empty Domain String Triggers PTR Domain Match

- **Affected File**: `src/server/engine/scoring.ts` (lines 163–168)
- **Root Cause**:
  `input.ptrHostname.toLowerCase().includes(input.domain.toLowerCase())` evaluated to `true` when `input.domain` was `""`, because `anyString.includes("")` is always `true`.
- **Remediation Specification (`src/server/engine/scoring.ts`)**:
  ```typescript
  // BEFORE
  if (input.ptrHostname && input.ptrHostname.toLowerCase().includes(input.domain.toLowerCase())) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_PTR_DOMAIN_MATCH,
      observedData: `PTR: ${input.ptrHostname}`
    });
  }
  ```
  ```typescript
  // AFTER
  if (
    input.domain &&
    input.domain.trim().length > 0 &&
    input.ptrHostname &&
    input.ptrHostname.toLowerCase().includes(input.domain.trim().toLowerCase())
  ) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_PTR_DOMAIN_MATCH,
      observedData: `PTR: ${input.ptrHostname}`
    });
  }
  ```

---

### Bug 6: `evidenceCount` Calculation Discrepancy for Empty `supportingSignals`

- **Affected File**: `src/server/engine/ownership.ts` (line 366)
- **Root Cause**:
  `evidenceCount: topCandidate.supportingSignals?.length || 1` used logical OR `||`. When `supportingSignals` was an empty array `[]`, `0 || 1` evaluated to `1`.
- **Remediation Specification (`src/server/engine/ownership.ts`)**:
  ```typescript
  // BEFORE
  evidenceCount: topCandidate.supportingSignals?.length || 1,
  ```
  ```typescript
  // AFTER
  evidenceCount: topCandidate.supportingSignals?.length ?? 0,
  ```

---

## 3. Comprehensive Verification Matrix for `m1_worker_2`

After implementing the code changes above, `m1_worker_2` should run `npm run typecheck && npm test` and verify that the following assertions pass in test suite:

1. **ASN Operation Validation**:
   - Input `{ topCandidate: { asn: "Unknown ASN", provider: "Unknown Provider" } }` -> `model.asnOperation` returns `confidence: 0`, `identity: "Unknown ASN"`.
   - Input `{ topCandidate: { asn: "AS13335", provider: "Unknown Provider" } }` -> `model.asnOperation` returns `confidence: 60`, `identity: "AS13335"`.
   - Input `{ topCandidate: { asn: "AS13335", provider: "Cloudflare, Inc." } }` -> `model.asnOperation` returns `confidence: 95`, `identity: "AS13335 - Cloudflare, Inc."`.

2. **Hosting Provider Validation**:
   - Input `{ topCandidate: { provider: "Unknown Provider" } }` -> `model.hostingProvider` returns `confidence: 0`, `identity: "Unclassified Hosting Provider"`.
   - Input `{ topCandidate: { provider: "Hetzner Online GmbH" } }` -> `model.hostingProvider` returns `confidence: 50`, `identity: "Hetzner Online GmbH"`.

3. **Sublease Normalization**:
   - Input `{ rirAllocationOwner: "Cloudflare, Inc.", asn: { org: "Cloudflare Inc" } }` -> `model.networkOperation` returns `identity: "Direct Network Operation (AS13335)"`, `confidence: 90`.
   - Input `{ rirAllocationOwner: "Amazon.com, Inc.", asn: { org: "Netflix Inc" } }` -> `model.networkOperation` returns `identity: "Subleased Space (Netflix Inc on Amazon.com, Inc.)"`, `confidence: 75`.

4. **Privacy Proxy Scoring**:
   - Input `{ registrantOrg: "WhoisGuard Protected", rirAllocationOwner: "WhoisGuard Protected Inc" }` -> `evaluateSignals` does NOT include `POS_ASN_MATCH`.

5. **PTR Domain Match with Empty Domain**:
   - Input `{ domain: "", ptrHostname: "host.example.com" }` -> `evaluateSignals` does NOT include `POS_PTR_DOMAIN_MATCH`.

6. **Empty Supporting Signals Count**:
   - Input `{ topCandidate: { score: 50, supportingSignals: [] } }` -> `model.applicationOrigin.evidenceCount` equals `0`.

---

## 4. Architectural Summary

By implementing these 6 precise remediations, both `scoring.ts` and `ownership.ts` will strictly adhere to evidence-based principles, eliminating false-positive confidence scores on missing data, false sublease alerts on formatting differences, and bogus privacy correlations.
