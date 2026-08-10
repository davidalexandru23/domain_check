# Architectural Analysis & Specification: Decoupled 7 Ownership Concepts Engine & Unit Testing Strategy

**Module**: `src/server/engine/ownership.ts` & `src/tests/ownership.test.ts`  
**Author**: m1_explorer_3  
**Date**: 2026-08-10  
**Status**: Completed Analysis  

---

## 1. Executive Summary & Problem Context

In traditional Attack Surface Management (ASM) tools, infrastructure ownership is frequently conflated into a single text field (e.g. labeling an entire asset as simply `"Cloudflare"` or `"Hetzner"`). This conflation leads to critical inaccuracies:
- A domain fronted by Cloudflare CDN may actually be owned by a private corporation, hosted on Hetzner origin servers in Germany, with domain registration handled by Namecheap.
- Labeling the asset as `"Cloudflare"` misrepresents the domain registrant, hides the physical hosting provider, and confuses CDN edge operation with origin server ownership.

The **Decoupled 7 Ownership Concepts Engine** (`src/server/engine/ownership.ts`) solves this by explicitly separating infrastructure intelligence into 7 distinct operational and legal layers, each assigned an independent **0–100% confidence rating** and a detailed **human-readable rationale string**.

---

## 2. Shared Data Contracts (`src/shared/types.ts`)

To ensure seamless frontend rendering in `OwnershipGrid.tsx` and full backend compatibility with `ScanResult`, the data structures define both a **uniform card interface** for UI rendering and **rich concept metadata**.

### 2.1 Interface Specification

```typescript
export type OwnershipConceptType =
  | "domainOwner"
  | "ipAllocation"
  | "asnOperation"
  | "networkOperation"
  | "hostingProvider"
  | "applicationOrigin"
  | "physicalLocation";

export type OwnershipConcept = {
  concept: OwnershipConceptType;
  label: string;
  identity: string;
  confidence: number; // 0–100%
  evidenceCount: number;
  explanation: string;
  details?: {
    // Concept 1: Domain
    registrantOrg?: string;
    registrar?: string;
    privacyDetected?: boolean;

    // Concept 2: IP Allocation
    ip?: string;
    rir?: string;
    allocationOwner?: string;
    networkName?: string;
    announcedPrefix?: string;

    // Concept 3: ASN Operation
    asn?: string;
    orgName?: string;

    // Concept 4: Network Operation
    originAsn?: string;
    upstreamAsns?: string[];
    isSubleased?: boolean;
    isSuballocated?: boolean;

    // Concept 5: Hosting Provider
    category?: "cloud" | "bare-metal" | "shared" | "cdn" | "isp" | "unknown";
    datacenterOrg?: string;

    // Concept 6: Application Origin
    likelyOriginIp?: string;
    candidateCount?: number;
    topCandidateScore?: number;
    isProxiedByCdn?: boolean;

    // Concept 7: Physical Location
    country?: string;
    city?: string;
    coordinates?: { lat?: number; lon?: number };
    facilities?: string[];
  };
};

export type DecoupledOwnershipModel = {
  domainOwner: OwnershipConcept;
  ipAllocation: OwnershipConcept;
  asnOperation: OwnershipConcept;
  networkOperation: OwnershipConcept;
  hostingProvider: OwnershipConcept;
  applicationOrigin: OwnershipConcept;
  physicalLocation: OwnershipConcept;
};
```

---

## 3. Decoupled 7 Ownership Concepts Specification & Algorithms

Below is the detailed specification for each of the 7 decoupled ownership concepts, including field mappings, confidence algorithms, and human-readable rationale templates.

### Concept 1: Domain Ownership (`domainOwner`)
- **Label**: `"Domain Ownership"`
- **Scope**: Identifies the legal registrant organization or entity holding the domain name.
- **Fields**:
  - `identity`: Registrant Organization (e.g. `"Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti"`), or `"Redacted (Privacy Protected)"`, or `"Registered via [Registrar]"`.
  - `confidence`: 0–100%
  - `evidenceCount`: Number of WHOIS/RDAP sources verified.
- **Confidence Algorithm**:
  1. **Unredacted Registrant Org Present (Confidence: 90%–95%)**:
     - Condition: `domain.registrantOrg` exists and does not match privacy regex (`/privacy|redacted|withheld|whoisguard|contact privacy/i`).
     - Score: `90%` base (`95%` if `domain.sources.length >= 2`).
     - Rationale: `"Domain registrant organization explicitly verified via WHOIS/RDAP as '${domain.registrantOrg}'."`
  2. **Privacy Service Detected (Confidence: 20%)**:
     - Condition: `domain.privacyDetected === true` OR `domain.registrantOrg` matches privacy regex.
     - Score: `20%`.
     - Rationale: `"Domain registration WHOIS data is obfuscated by a privacy protection service. Identity cannot be directly attributed."`
  3. **Registrar Only Discovered (Confidence: 40%)**:
     - Condition: `domain.registrantOrg` missing, but `domain.registrar` is known.
     - Score: `40%`.
     - Rationale: `"Domain registrar identified as '${domain.registrar}', but registrant organization details are omitted from public WHOIS."`
  4. **No WHOIS Data (Confidence: 0%)**:
     - Score: `0%`.
     - Rationale: `"No public WHOIS or RDAP domain registration records were obtainable."`

---

### Concept 2: IP Allocation (`ipAllocation`)
- **Label**: `"IP Allocation (RIR)"`
- **Scope**: Tracks the Regional Internet Registry (RIPE NCC, ARIN, APNIC, LACNIC, AFRINIC) inetnum/netblock allocation owner.
- **Fields**:
  - `identity`: `allocationOwner` + `networkName` (e.g. `"Hetzner Online GmbH (HETZNER-NET)"`).
  - `confidence`: 0–100%
  - `evidenceCount`: RIR RDAP data records count.
- **Confidence Algorithm**:
  1. **Direct RIR inetnum Owner Discovered (Confidence: 95%)**:
     - Condition: `ipProfile.rirAllocationOwner` present from RDAP query.
     - Score: `95%`.
     - Rationale: `"RIR (${rir}) RDAP inetnum allocation confirms netblock owner is '${allocationOwner}' with prefix ${prefix}."`
  2. **Inferred from ASN Org (Confidence: 50%)**:
     - Condition: `rirAllocationOwner` missing, but `ipProfile.asn.org` is known.
     - Score: `50%`.
     - Rationale: `"Direct RIR inetnum allocation record missing; allocation inferred from Autonomous System organization '${asnOrg}'."`
  3. **No Allocation Data (Confidence: 0%)**:
     - Score: `0%`.
     - Rationale: `"No RIR allocation or RDAP netblock record was found for IP ${ip}."`

---

### Concept 3: ASN Operation (`asnOperation`)
- **Label**: `"Autonomous System (ASN)"`
- **Scope**: Identifies the Autonomous System Number and operating entity announcing BGP routes for the target IP.
- **Fields**:
  - `identity`: `AS${asn} - ${orgName}` (e.g. `"AS3233 - Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti"`).
  - `confidence`: 0–100%
  - `evidenceCount`: BGP routing table & PeeringDB sources.
- **Confidence Algorithm**:
  1. **Verified ASN & Org Name (Confidence: 95%)**:
     - Condition: Both ASN number and Org Name present in BGP enrichment.
     - Score: `95%`.
     - Rationale: `"BGP routing table and RIR records confirm origin Autonomous System AS${asn} (${orgName})."`
  2. **ASN Number Only (Confidence: 60%)**:
     - Condition: ASN number present, Org Name unverified.
     - Score: `60%`.
     - Rationale: `"Autonomous System number AS${asn} detected, but organization details could not be retrieved."`
  3. **No BGP Route (Confidence: 0%)**:
     - Score: `0%`.
     - Rationale: `"Target IP address is not observed in global BGP routing tables."`

---

### Concept 4: Network Operation & Sublease (`networkOperation`)
- **Label**: `"Network Operation & Sublease"`
- **Scope**: Detects BGP routing topology, upstream provider relations, and subleased or suballocated IP space discrepancies (e.g., reseller operating on a parent provider's netblock).
- **Fields**:
  - `identity`: Network mode (e.g. `"Direct Network Operation (AS3233)"` or `"Subleased Network Space (HostReseller on Hetzner)"`).
  - `confidence`: 0–100%
  - `evidenceCount`: Number of routing hop and lease signals.
- **Confidence Algorithm**:
  1. **Subleased Network Space Detected (Confidence: 75%)**:
     - Condition: `rirAllocationOwner !== asnOrg` OR `leaseSignal.kind === "subleased"`.
     - Score: `75%`.
     - Rationale: `"Subleased network space detected: Netblock allocated to '${rirAllocationOwner}' but operated by '${asnOrg}' (AS${asn})."`
  2. **Suballocated BGP Origin Mismatch (Confidence: 60%)**:
     - Condition: `observedOriginAsn !== expectedAsn` OR `leaseSignal.kind === "suballocated"`.
     - Score: `60%`.
     - Rationale: `"BGP origin AS mismatch detected (${originAsn} vs announcement), indicating suballocated route object."`
  3. **Direct Network Operation (Confidence: 90%)**:
     - Condition: Origin AS matches allocation owner, no sublease signals.
     - Score: `90%`.
     - Rationale: `"Direct network operation by AS${asn} with ${upstreamCount} verified upstream provider(s). No subleasing observed."`
  4. **No Routing Data (Confidence: 0%)**:
     - Score: `0%`.
     - Rationale: `"Insufficient routing topology data to determine network operation status."`

---

### Concept 5: Hosting Provider (`hostingProvider`)
- **Label**: `"Hosting Provider"`
- **Scope**: Classifies the commercial hosting infrastructure (CDN, Cloud, Bare-Metal, ISP, Shared).
- **Fields**:
  - `identity`: Provider Name & Category (e.g. `"Cloudflare CDN (CDN / WAF)"` or `"ICI Bucuresti (Enterprise / ISP)"`).
  - `confidence`: 0–100%
  - `evidenceCount`: Provider fingerprint signals (HTTP headers, ASN, PTR).
- **Confidence Algorithm**:
  1. **CDN / Reverse Proxy Provider (Confidence: 95%)**:
     - Condition: IP ASN matches known CDN list (AS13335, AS20940, AS54113, etc.) OR candidate classification is `"cdn-proxy"`.
     - Score: `95%`.
     - Rationale: `"Reverse proxy / CDN hosting provider identified as ${name} based on ASN and HTTP header fingerprinting."`
  2. **Major Cloud / Bare-Metal Host (Confidence: 85%)**:
     - Condition: ASN/RDAP matches Cloud/Hosting provider (AWS AS16509, GCP AS15169, Hetzner AS24940, OVH AS16276, DigitalOcean AS14061).
     - Score: `85%`.
     - Rationale: `"Infrastructure hosted on ${name} (${category}) with verified ASN and RDAP correlation."`
  3. **Institutional / Enterprise ISP (Confidence: 80%)**:
     - Condition: ASN providerType is `"enterprise"` or `"isp"`.
     - Score: `80%`.
     - Rationale: `"Direct enterprise/institutional infrastructure hosted by ${name}."`
  4. **Unclassified Host (Confidence: 20%)**:
     - Score: `20%`.
     - Rationale: `"Hosting provider could not be definitively classified from public ASN or HTTP signatures."`

---

### Concept 6: Application Origin (`applicationOrigin`)
- **Label**: `"Application Origin IP"`
- **Scope**: Evaluates true origin server status vs CDN proxy masking.
- **Fields**:
  - `identity`: Likely Origin IP & Score (e.g. `"193.230.5.163 (Origin Server, Score: 85/100)"` or `"Behind CDN Proxy (Cloudflare) — Origin Masked"`).
  - `confidence`: 0–100% (Directly derived from top candidate's evidence score).
  - `evidenceCount`: Total origin candidate evidence count.
- **Confidence Algorithm**:
  1. **High-Confidence Unproxied Origin (Confidence = candidate.score, e.g. 70%–100%)**:
     - Condition: Top candidate score >= 40 AND top candidate is NOT CDN-proxied.
     - Score: `topCandidate.score` (e.g. `85%`).
     - Rationale: `"True application origin IP identified as ${ip} with high confidence (${score}/100) based on ${signalCount} supporting evidence signals."`
  2. **Behind CDN Proxy (Confidence: Math.min(score, 25)%)**:
     - Condition: Target is fronted by CDN (`classification === "cdn-proxy"` or CDN penalty triggered).
     - Score: `Math.min(topCandidate.score, 25)` (e.g. `15%–25%`).
     - Rationale: `"Application traffic is fronted by ${provider || 'CDN Proxy'}. Direct origin server IP is masked from public discovery."`
  3. **Unverified Candidate (Confidence = candidate.score, e.g. 20%–39%)**:
     - Condition: Candidate discovered but active probing unreachable or low evidence.
     - Score: `topCandidate.score`.
     - Rationale: `"Potential origin IP candidate ${ip} discovered with low confidence (${score}/100)."`
  4. **No Candidates Found (Confidence: 0%)**:
     - Score: `0%`.
     - Rationale: `"No origin candidate IPs were detected for the target domain."`

---

### Concept 7: Physical Infrastructure Location (`physicalLocation`)
- **Label**: `"Physical Infrastructure Location"`
- **Scope**: Identifies geographic country, city, GPS coordinates, and datacenter facilities.
- **Fields**:
  - `identity`: Location String (e.g. `"Bucharest, Romania (NXDATA-1 Bucharest)"` or `"Global Anycast Edge"`).
  - `confidence`: 0–100%
  - `evidenceCount`: GeoIP & PeeringDB data points.
- **Confidence Algorithm**:
  1. **Datacenter Facility Match (Confidence: 90%)**:
     - Condition: Unicast IP with city, country, and PeeringDB facility presence.
     - Score: `90%`.
     - Rationale: `"Physical datacenter facility confirmed at ${city}, ${country} (${facilities.join(', ')})."`
  2. **City & Country Match (Confidence: 80%)**:
     - Condition: GeoIP returns city and country.
     - Score: `80%`.
     - Rationale: `"GeoIP database and RIR records locate server infrastructure in ${city}, ${country}."`
  3. **Country Only Match (Confidence: 60%)**:
     - Condition: GeoIP returns country only.
     - Score: `60%`.
     - Rationale: `"Country-level location verified as ${country}, city precision unavailable."`
  4. **Anycast Location Penalty (Confidence: 30%)**:
     - Condition: IP is Anycast (Cloudflare / Fastly CDN).
     - Score: `30%`.
     - Rationale: `"IP uses Anycast BGP routing across multiple global edge locations; physical location does not represent the origin server."`
  5. **No GeoIP Data (Confidence: 0%)**:
     - Score: `0%`.
     - Rationale: `"No geographic or facility location data available for target IP."`

---

## 4. Engine Module Architecture Design (`src/server/engine/ownership.ts`)

The engine module will export `computeDecoupledOwnership` which accepts a flexible input object containing domain, IP profile, candidate, and infrastructure data.

### Function Signature Blueprint

```typescript
import {
  DecoupledOwnershipModel,
  DomainProfile,
  IpProfile,
  OriginCandidateDetailed,
  InfrastructureSupplyChain,
  OwnershipConcept
} from "../../shared/types.js";

export type OwnershipCalculationInput = {
  domain?: Partial<DomainProfile>;
  topCandidate?: Partial<OriginCandidateDetailed>;
  candidates?: Array<Partial<OriginCandidateDetailed>>;
  ipProfile?: Partial<IpProfile>;
  infrastructure?: Partial<InfrastructureSupplyChain>;
};

/**
 * Calculates the 7 decoupled ownership concepts with independent 0-100% confidence scores.
 */
export function computeDecoupledOwnership(
  input: OwnershipCalculationInput
): DecoupledOwnershipModel {
  const domain = input.domain || {};
  const topCandidate = input.topCandidate;
  const candidates = input.candidates || (topCandidate ? [topCandidate] : []);
  const ipProfile = input.ipProfile || {};
  const infrastructure = input.infrastructure || {};

  return {
    domainOwner: calculateDomainOwnership(domain),
    ipAllocation: calculateIpAllocation(ipProfile, topCandidate),
    asnOperation: calculateAsnOperation(ipProfile, topCandidate),
    networkOperation: calculateNetworkOperation(ipProfile, infrastructure),
    hostingProvider: calculateHostingProvider(ipProfile, topCandidate),
    applicationOrigin: calculateApplicationOrigin(topCandidate, candidates),
    physicalLocation: calculatePhysicalLocation(ipProfile, topCandidate)
  };
}
```

---

## 5. Unit Testing Strategy (`src/tests/ownership.test.ts`)

The test suite will use **Vitest** to verify all calculation logic, confidence formulas, rationale strings, and decoupling invariants across 6 core scenarios.

### 5.1 Test Scenarios Overview

| Scenario # | Test Case Name | Input Characteristics | Key Invariant Asserted |
|------------|----------------|----------------------|-----------------------|
| **TS01** | Direct-Hosted Enterprise Domain (`ici.ro`) | Unredacted WHOIS, IP `193.230.5.163`, AS3233, score 85 | High confidence across all 7 concepts; `applicationOrigin.confidence === 85%`; no CDN penalty. |
| **TS02** | CDN-Proxied Domain (Cloudflare) | Proxied domain, AS13335 Cloudflare, score 20 (`cdn-proxy`) | `hostingProvider.confidence === 95%` (CDN) while `applicationOrigin.confidence <= 25%`. Explicit concept decoupling. |
| **TS03** | Subleased / Reseller Network | RIR owner "Hetzner Online" vs ASN org "Reseller Host SRL" | `networkOperation.identity` contains `"Subleased"`; `confidence === 75%`; rationale explains discrepancy. |
| **TS04** | WHOIS Privacy Protection | `privacyDetected: true`, registrant `"Withheld for Privacy ehf"` | `domainOwner.confidence === 20%`; rationale cites privacy obfuscation; IP hosting confidence unaffected. |
| **TS05** | Missing Data & Fault Resilience | Empty `{}` input object | Zero crash / runtime exception; all 7 concepts return fallback structures with `confidence === 0%`. |
| **TS06** | Complete Model Layout Verification | Standard input | Output object possesses exact keys for all 7 concepts; all confidences in `[0, 100]` integer range. |

---

## 6. Implementation Code Blueprints

### 6.1 `src/server/engine/ownership.ts` Full Reference Code

```typescript
import {
  DecoupledOwnershipModel,
  DomainProfile,
  IpProfile,
  OriginCandidateDetailed,
  InfrastructureSupplyChain,
  OwnershipConcept
} from "../../shared/types.js";

export type OwnershipCalculationInput = {
  domain?: Partial<DomainProfile>;
  topCandidate?: Partial<OriginCandidateDetailed>;
  candidates?: Array<Partial<OriginCandidateDetailed>>;
  ipProfile?: Partial<IpProfile>;
  infrastructure?: Partial<InfrastructureSupplyChain>;
};

const CDN_ASNS = new Set([
  "13335", "20940", "54113", "19551", "16625", "132892", "30633"
]);

export function computeDecoupledOwnership(
  input: OwnershipCalculationInput
): DecoupledOwnershipModel {
  const domain = input.domain || {};
  const topCandidate = input.topCandidate;
  const candidates = input.candidates || (topCandidate ? [topCandidate] : []);
  const ipProfile = input.ipProfile || {};
  const infrastructure = input.infrastructure || {};

  return {
    domainOwner: calculateDomainOwnership(domain),
    ipAllocation: calculateIpAllocation(ipProfile, topCandidate),
    asnOperation: calculateAsnOperation(ipProfile, topCandidate),
    networkOperation: calculateNetworkOperation(ipProfile, infrastructure),
    hostingProvider: calculateHostingProvider(ipProfile, topCandidate),
    applicationOrigin: calculateApplicationOrigin(topCandidate, candidates),
    physicalLocation: calculatePhysicalLocation(ipProfile, topCandidate)
  };
}

function calculateDomainOwnership(domain: Partial<DomainProfile>): OwnershipConcept {
  const org = domain.registrantOrg?.trim();
  const registrar = domain.registrar?.trim();
  const privacy = domain.privacyDetected || (org ? /privacy|redacted|withheld|whoisguard/i.test(org) : false);
  const evidenceCount = domain.sources?.length || (org ? 1 : 0);

  if (org && !privacy) {
    const confidence = (domain.sources?.length || 1) >= 2 ? 95 : 90;
    return {
      concept: "domainOwner",
      label: "Domain Ownership",
      identity: org,
      confidence,
      evidenceCount,
      explanation: `Domain registrant organization explicitly verified via WHOIS/RDAP as '${org}'.`,
      details: { registrantOrg: org, registrar, privacyDetected: false }
    };
  }

  if (privacy) {
    return {
      concept: "domainOwner",
      label: "Domain Ownership",
      identity: "Redacted (Privacy Protected)",
      confidence: 20,
      evidenceCount,
      explanation: "Domain registration WHOIS data is obfuscated by a privacy protection service. Identity cannot be directly attributed.",
      details: { registrantOrg: org, registrar, privacyDetected: true }
    };
  }

  if (registrar) {
    return {
      concept: "domainOwner",
      label: "Domain Ownership",
      identity: `Registered via ${registrar} (Registrant Hidden)`,
      confidence: 40,
      evidenceCount: 1,
      explanation: `Domain registrar identified as '${registrar}', but registrant organization details are omitted from public WHOIS.`,
      details: { registrar, privacyDetected: false }
    };
  }

  return {
    concept: "domainOwner",
    label: "Domain Ownership",
    identity: "Unknown Domain Owner",
    confidence: 0,
    evidenceCount: 0,
    explanation: "No public WHOIS or RDAP domain registration records were obtainable.",
    details: { privacyDetected: false }
  };
}

function calculateIpAllocation(
  ipProfile: Partial<IpProfile>,
  topCandidate?: Partial<OriginCandidateDetailed>
): OwnershipConcept {
  const ip = ipProfile.ip || topCandidate?.ip || "Unknown IP";
  const rirOwner = ipProfile.rirAllocationOwner || ipProfile.landlord;
  const netName = ipProfile.networkName;
  const prefix = ipProfile.announcedPrefix;
  const rir = ipProfile.asn?.rir || "RIR";
  const evidenceCount = ipProfile.sources?.length || 1;

  if (rirOwner) {
    const identity = netName ? `${rirOwner} (${netName})` : rirOwner;
    return {
      concept: "ipAllocation",
      label: "IP Allocation (RIR)",
      identity,
      confidence: 95,
      evidenceCount,
      explanation: `RIR (${rir}) RDAP inetnum allocation confirms netblock owner is '${rirOwner}'${prefix ? ' [' + prefix + ']' : ''}.`,
      details: { ip, rir, allocationOwner: rirOwner, networkName: netName, announcedPrefix: prefix }
    };
  }

  if (ipProfile.asn?.org) {
    return {
      concept: "ipAllocation",
      label: "IP Allocation (RIR)",
      identity: `${ipProfile.asn.org} (Inferred from ASN)`,
      confidence: 50,
      evidenceCount: 1,
      explanation: `Direct RIR inetnum allocation record missing; allocation inferred from Autonomous System organization '${ipProfile.asn.org}'.`,
      details: { ip, rir, allocationOwner: ipProfile.asn.org }
    };
  }

  return {
    concept: "ipAllocation",
    label: "IP Allocation (RIR)",
    identity: "Unknown IP Allocation",
    confidence: 0,
    evidenceCount: 0,
    explanation: `No RIR allocation or RDAP netblock record was found for IP ${ip}.`,
    details: { ip }
  };
}

function calculateAsnOperation(
  ipProfile: Partial<IpProfile>,
  topCandidate?: Partial<OriginCandidateDetailed>
): OwnershipConcept {
  const rawAsn = ipProfile.asn?.asn || topCandidate?.asn;
  const orgName = ipProfile.asn?.org || topCandidate?.provider;
  const asnNum = rawAsn ? rawAsn.replace(/^AS/i, "") : undefined;

  if (asnNum && orgName) {
    return {
      concept: "asnOperation",
      label: "Autonomous System (ASN)",
      identity: `AS${asnNum} - ${orgName}`,
      confidence: 95,
      evidenceCount: 2,
      explanation: `BGP routing table and RIR records confirm origin Autonomous System AS${asnNum} (${orgName}).`,
      details: { asn: `AS${asnNum}`, orgName }
    };
  }

  if (asnNum) {
    return {
      concept: "asnOperation",
      label: "Autonomous System (ASN)",
      identity: `AS${asnNum}`,
      confidence: 60,
      evidenceCount: 1,
      explanation: `Autonomous System number AS${asnNum} detected, but organization details could not be retrieved.`,
      details: { asn: `AS${asnNum}` }
    };
  }

  return {
    concept: "asnOperation",
    label: "Autonomous System (ASN)",
    identity: "Unknown ASN",
    confidence: 0,
    evidenceCount: 0,
    explanation: "IP address is not associated with an observed BGP Autonomous System.",
    details: {}
  };
}

function calculateNetworkOperation(
  ipProfile: Partial<IpProfile>,
  infrastructure: Partial<InfrastructureSupplyChain>
): OwnershipConcept {
  const rawAsn = ipProfile.asn?.asn || ipProfile.originAsn;
  const asnNum = rawAsn ? rawAsn.replace(/^AS/i, "") : undefined;
  const rirOwner = ipProfile.rirAllocationOwner;
  const asnOrg = ipProfile.asn?.org;
  const upstreams = ipProfile.upstreams || [];

  const leaseSignal = infrastructure.ipChains?.[0]?.leaseSignals?.[0];
  const isSubleased = leaseSignal?.kind === "subleased" || (rirOwner && asnOrg && rirOwner.toLowerCase() !== asnOrg.toLowerCase());
  const isSuballocated = leaseSignal?.kind === "suballocated";

  if (isSubleased && rirOwner && asnOrg) {
    return {
      concept: "networkOperation",
      label: "Network Operation & Sublease",
      identity: `Subleased Space (${asnOrg} on ${rirOwner})`,
      confidence: 75,
      evidenceCount: 2,
      explanation: `Subleased network space detected: Netblock allocated to '${rirOwner}' but operated by '${asnOrg}' (AS${asnNum || 'Unknown'}).`,
      details: { originAsn: asnNum ? `AS${asnNum}` : undefined, isSubleased: true }
    };
  }

  if (isSuballocated) {
    return {
      concept: "networkOperation",
      label: "Network Operation & Sublease",
      identity: `Suballocated Route Mismatch (AS${asnNum || 'Unknown'})`,
      confidence: 60,
      evidenceCount: 2,
      explanation: `BGP origin AS mismatch detected for AS${asnNum || 'Unknown'}, indicating suballocated route object.`,
      details: { originAsn: asnNum ? `AS${asnNum}` : undefined, isSuballocated: true }
    };
  }

  if (asnNum) {
    const upstreamList = upstreams.map(u => u.asn).join(", ");
    return {
      concept: "networkOperation",
      label: "Network Operation & Sublease",
      identity: `Direct Network Operation (AS${asnNum})`,
      confidence: 90,
      evidenceCount: 1 + upstreams.length,
      explanation: `Direct network operation by AS${asnNum}${upstreamList ? ' with upstreams [' + upstreamList + ']' : ''}. No subleasing observed.`,
      details: { originAsn: `AS${asnNum}`, upstreamAsns: upstreams.map(u => u.asn), isSubleased: false, isSuballocated: false }
    };
  }

  return {
    concept: "networkOperation",
    label: "Network Operation & Sublease",
    identity: "Unknown Network Operation",
    confidence: 0,
    evidenceCount: 0,
    explanation: "Insufficient routing topology data to determine network operation status.",
    details: {}
  };
}

function calculateHostingProvider(
  ipProfile: Partial<IpProfile>,
  topCandidate?: Partial<OriginCandidateDetailed>
): OwnershipConcept {
  const asnNum = (ipProfile.asn?.asn || topCandidate?.asn || "").replace(/^AS/i, "");
  const providerName = topCandidate?.provider || ipProfile.asn?.org || "Unknown Host";
  const isCdn = CDN_ASNS.has(asnNum) || topCandidate?.classification === "cdn-proxy";

  if (isCdn) {
    return {
      concept: "hostingProvider",
      label: "Hosting Provider",
      identity: `${providerName} (CDN / WAF)`,
      confidence: 95,
      evidenceCount: 2,
      explanation: `Reverse proxy / CDN hosting provider identified as ${providerName} based on ASN and HTTP header fingerprinting.`,
      details: { category: "cdn" }
    };
  }

  const pType = ipProfile.providerType;
  if (pType === "cloud" || pType === "enterprise" || pType === "isp") {
    const category = pType === "cloud" ? "cloud" : "isp";
    return {
      concept: "hostingProvider",
      label: "Hosting Provider",
      identity: `${providerName} (${category.toUpperCase()})`,
      confidence: pType === "cloud" ? 85 : 80,
      evidenceCount: 2,
      explanation: `Infrastructure hosted on ${providerName} (${category}) with verified ASN and RDAP correlation.`,
      details: { category }
    };
  }

  if (providerName !== "Unknown Host") {
    return {
      concept: "hostingProvider",
      label: "Hosting Provider",
      identity: providerName,
      confidence: 50,
      evidenceCount: 1,
      explanation: `Hosting provider identified as ${providerName}.`,
      details: { category: "unknown" }
    };
  }

  return {
    concept: "hostingProvider",
    label: "Hosting Provider",
    identity: "Unclassified Hosting Provider",
    confidence: 0,
    evidenceCount: 0,
    explanation: "Hosting provider could not be classified.",
    details: { category: "unknown" }
  };
}

function calculateApplicationOrigin(
  topCandidate?: Partial<OriginCandidateDetailed>,
  candidates: Array<Partial<OriginCandidateDetailed>> = []
): OwnershipConcept {
  const candidateCount = candidates.length;
  const topScore = topCandidate?.totalScore ?? topCandidate?.score ?? 0;
  const isCdn = topCandidate?.classification === "cdn-proxy" ||
    topCandidate?.contradictionSignals?.some(s => s.id === "NEG_CDN_ASN") ||
    (topCandidate?.asn && CDN_ASNS.has(topCandidate.asn.replace(/^AS/i, "")));

  if (topCandidate?.ip && !isCdn && topScore >= 40) {
    return {
      concept: "applicationOrigin",
      label: "Application Origin IP",
      identity: `${topCandidate.ip} (Origin Server, Score: ${topScore}/100)`,
      confidence: topScore,
      evidenceCount: topCandidate.supportingSignals?.length || 1,
      explanation: `True application origin IP identified as ${topCandidate.ip} with high confidence (${topScore}/100) based on supporting evidence signals.`,
      details: { likelyOriginIp: topCandidate.ip, candidateCount, topCandidateScore: topScore, isProxiedByCdn: false }
    };
  }

  if (isCdn) {
    const cdnConf = Math.min(topScore, 25);
    const provider = topCandidate?.provider || "CDN Proxy";
    return {
      concept: "applicationOrigin",
      label: "Application Origin IP",
      identity: `Behind CDN Proxy (${provider}) — Origin Masked`,
      confidence: cdnConf,
      evidenceCount: candidates.length,
      explanation: `Application traffic is fronted by ${provider}. Direct origin server IP is masked from public discovery.`,
      details: { candidateCount, topCandidateScore: topScore, isProxiedByCdn: true }
    };
  }

  if (topCandidate?.ip) {
    return {
      concept: "applicationOrigin",
      label: "Application Origin IP",
      identity: `${topCandidate.ip} (Unverified Leak, Score: ${topScore}/100)`,
      confidence: topScore,
      evidenceCount: 1,
      explanation: `Potential origin IP candidate ${topCandidate.ip} discovered with low confidence (${topScore}/100).`,
      details: { likelyOriginIp: topCandidate.ip, candidateCount, topCandidateScore: topScore, isProxiedByCdn: false }
    };
  }

  return {
    concept: "applicationOrigin",
    label: "Application Origin IP",
    identity: "No Origin Candidates Discovered",
    confidence: 0,
    evidenceCount: 0,
    explanation: "No web application origin candidate IPs were detected during scanning.",
    details: { candidateCount: 0, topCandidateScore: 0, isProxiedByCdn: false }
  };
}

function calculatePhysicalLocation(
  ipProfile: Partial<IpProfile>,
  topCandidate?: Partial<OriginCandidateDetailed>
): OwnershipConcept {
  const geo = ipProfile.geo || {};
  const facilities = ipProfile.facilityPresence || [];
  const asnNum = (ipProfile.asn?.asn || topCandidate?.asn || "").replace(/^AS/i, "");
  const isAnycast = CDN_ASNS.has(asnNum) || topCandidate?.classification === "cdn-proxy";

  if (isAnycast) {
    const locStr = geo.city ? `${geo.city}, ${geo.country || 'Global'}` : (geo.country || 'Global');
    return {
      concept: "physicalLocation",
      label: "Physical Infrastructure Location",
      identity: `${locStr} (Global Anycast Edge)`,
      confidence: 30,
      evidenceCount: 1,
      explanation: "IP uses Anycast BGP routing across multiple global edge locations; physical location does not represent the origin server.",
      details: { country: geo.country, city: geo.city, coordinates: { lat: geo.lat, lon: geo.lon }, facilities }
    };
  }

  if (geo.city && geo.country) {
    const hasFac = facilities.length > 0;
    const facStr = hasFac ? ` (${facilities.join(", ")})` : "";
    return {
      concept: "physicalLocation",
      label: "Physical Infrastructure Location",
      identity: `${geo.city}, ${geo.country}${facStr}`,
      confidence: hasFac ? 90 : 80,
      evidenceCount: hasFac ? facilities.length + 1 : 1,
      explanation: hasFac
        ? `Physical datacenter facility confirmed at ${geo.city}, ${geo.country} (${facilities.join(", ")}).`
        : `GeoIP location verified as ${geo.city}, ${geo.country}.`,
      details: { country: geo.country, city: geo.city, coordinates: { lat: geo.lat, lon: geo.lon }, facilities }
    };
  }

  if (geo.country) {
    return {
      concept: "physicalLocation",
      label: "Physical Infrastructure Location",
      identity: geo.country,
      confidence: 60,
      evidenceCount: 1,
      explanation: `Country-level location verified as ${geo.country}, city precision unavailable.`,
      details: { country: geo.country, coordinates: { lat: geo.lat, lon: geo.lon } }
    };
  }

  return {
    concept: "physicalLocation",
    label: "Physical Infrastructure Location",
    identity: "Unknown Physical Location",
    confidence: 0,
    evidenceCount: 0,
    explanation: "No geographic or facility location data available for target IP.",
    details: {}
  };
}
```

---

### 6.2 `src/tests/ownership.test.ts` Full Reference Code

```typescript
import { describe, expect, it } from "vitest";
import { computeDecoupledOwnership } from "../server/engine/ownership.js";

describe("Decoupled 7 Ownership Concepts Engine", () => {
  it("calculates high-confidence direct hosting infrastructure (ici.ro benchmark)", () => {
    const model = computeDecoupledOwnership({
      domain: {
        domain: "ici.ro",
        registrantOrg: "Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti",
        registrar: "RO-TLD",
        privacyDetected: false,
        sources: [{ name: "whois", confidence: "high" }, { name: "rdap", confidence: "high" }]
      },
      topCandidate: {
        ip: "193.230.5.163",
        provider: "ICI Bucuresti",
        asn: "AS3233",
        location: "Bucharest, Romania",
        score: 85,
        totalScore: 85,
        classification: "likely-origin",
        supportingSignals: [
          { id: "POS_TLS_SAN_MATCH", type: "supporting", category: "tls", weight: 30, title: "TLS SAN Match", description: "", observedData: "ici.ro" },
          { id: "POS_HTTP_CONTENT_MATCH", type: "supporting", category: "http", weight: 25, title: "HTTP Title Match", description: "", observedData: "ICI Bucuresti" },
          { id: "POS_SUBDOMAIN_LEAK", type: "supporting", category: "subdomain", weight: 20, title: "Subdomain Leak", description: "", observedData: "www.ici.ro" }
        ],
        contradictionSignals: []
      },
      ipProfile: {
        ip: "193.230.5.163",
        rirAllocationOwner: "Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti",
        networkName: "ICI-NET",
        announcedPrefix: "193.230.5.0/24",
        asn: { asn: "3233", org: "Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti", rir: "RIPE" },
        providerType: "enterprise",
        geo: { country: "Romania", city: "Bucharest", lat: 44.4323, lon: 26.1063 },
        facilityPresence: ["NXDATA-1 Bucharest"],
        sources: [{ name: "ripe", confidence: "high" }]
      }
    });

    // 1. Domain Ownership
    expect(model.domainOwner.confidence).toBe(95);
    expect(model.domainOwner.identity).toContain("ICI Bucuresti");

    // 2. IP Allocation
    expect(model.ipAllocation.confidence).toBe(95);
    expect(model.ipAllocation.identity).toContain("ICI Bucuresti");

    // 3. ASN Operation
    expect(model.asnOperation.confidence).toBe(95);
    expect(model.asnOperation.identity).toBe("AS3233 - Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti");

    // 4. Network Operation
    expect(model.networkOperation.confidence).toBe(90);
    expect(model.networkOperation.identity).toBe("Direct Network Operation (AS3233)");

    // 5. Hosting Provider
    expect(model.hostingProvider.confidence).toBe(80);
    expect(model.hostingProvider.identity).toContain("ICI Bucuresti");

    // 6. Application Origin
    expect(model.applicationOrigin.confidence).toBe(85);
    expect(model.applicationOrigin.identity).toContain("193.230.5.163");
    expect(model.applicationOrigin.details?.isProxiedByCdn).toBe(false);

    // 7. Physical Location
    expect(model.physicalLocation.confidence).toBe(90);
    expect(model.physicalLocation.identity).toContain("Bucharest, Romania");
    expect(model.physicalLocation.identity).toContain("NXDATA-1 Bucharest");
  });

  it("decouples CDN hosting provider from masked application origin (Cloudflare proxied)", () => {
    const model = computeDecoupledOwnership({
      domain: {
        domain: "example-cdn.com",
        registrantOrg: "Withheld for Privacy ehf",
        privacyDetected: true,
        sources: [{ name: "whois", confidence: "low" }]
      },
      topCandidate: {
        ip: "104.16.123.96",
        provider: "Cloudflare, Inc.",
        asn: "AS13335",
        location: "San Francisco, US",
        score: 20,
        totalScore: 20,
        classification: "cdn-proxy",
        supportingSignals: [],
        contradictionSignals: [
          { id: "NEG_CDN_ASN", type: "contradiction", category: "asn", weight: -30, title: "CDN ASN Penalty", description: "IP belongs to Cloudflare AS13335", observedData: "AS13335" }
        ]
      },
      ipProfile: {
        ip: "104.16.123.96",
        rirAllocationOwner: "Cloudflare, Inc.",
        asn: { asn: "13335", org: "Cloudflare, Inc.", rir: "ARIN" },
        providerType: "cdn",
        geo: { country: "United States", city: "San Francisco" }
      }
    });

    // Domain Owner: Privacy protected -> 20%
    expect(model.domainOwner.confidence).toBe(20);
    expect(model.domainOwner.identity).toContain("Privacy Protected");

    // Hosting Provider: Cloudflare CDN -> 95%
    expect(model.hostingProvider.confidence).toBe(95);
    expect(model.hostingProvider.identity).toContain("Cloudflare, Inc. (CDN / WAF)");

    // Application Origin: Proxied -> max 20%
    expect(model.applicationOrigin.confidence).toBeLessThanOrEqual(25);
    expect(model.applicationOrigin.identity).toContain("Behind CDN Proxy");
    expect(model.applicationOrigin.details?.isProxiedByCdn).toBe(true);

    // Physical Location: Anycast -> 30%
    expect(model.physicalLocation.confidence).toBe(30);
    expect(model.physicalLocation.identity).toContain("Anycast");

    // Decoupling Verification: CDN hosting confidence (95%) is distinct from Application Origin (20%)
    expect(model.hostingProvider.confidence).not.toBe(model.applicationOrigin.confidence);
  });

  it("detects subleased reseller network space", () => {
    const model = computeDecoupledOwnership({
      domain: { domain: "reseller-hosted.com", registrantOrg: "Acme Shop SRL" },
      ipProfile: {
        ip: "195.201.10.5",
        rirAllocationOwner: "Hetzner Online GmbH",
        asn: { asn: "24940", org: "Hosting Reseller SRL", rir: "RIPE" },
        providerType: "enterprise",
        geo: { country: "Germany", city: "Falkenstein" }
      },
      infrastructure: {
        ipChains: [
          {
            ip: "195.201.10.5",
            providerRole: "hosting",
            allocation: { allocationOwner: "Hetzner Online GmbH" },
            leaseSignals: [
              { kind: "subleased", message: "Netblock allocated to Hetzner Online GmbH but operated by Hosting Reseller SRL", confidence: "high", evidence: [] }
            ],
            upstreams: [],
            peers: [],
            ixPresence: [],
            facilityPresence: [],
            confidence: "high"
          }
        ],
        roleProviders: [],
        verdict: "Likely subleased network",
        confidence: "high",
        evidence: [],
        warnings: []
      }
    });

    expect(model.ipAllocation.identity).toContain("Hetzner Online GmbH");
    expect(model.networkOperation.confidence).toBe(75);
    expect(model.networkOperation.identity).toContain("Subleased Space (Hosting Reseller SRL on Hetzner Online GmbH)");
    expect(model.networkOperation.explanation).toContain("Subleased network space detected");
  });

  it("handles missing/empty inputs without runtime errors", () => {
    const model = computeDecoupledOwnership({});

    expect(model.domainOwner.confidence).toBe(0);
    expect(model.ipAllocation.confidence).toBe(0);
    expect(model.asnOperation.confidence).toBe(0);
    expect(model.networkOperation.confidence).toBe(0);
    expect(model.hostingProvider.confidence).toBe(0);
    expect(model.applicationOrigin.confidence).toBe(0);
    expect(model.physicalLocation.confidence).toBe(0);

    expect(model.domainOwner.explanation).toBeTruthy();
    expect(model.applicationOrigin.explanation).toBeTruthy();
  });

  it("validates all 7 concepts are present and carry valid confidence ranges", () => {
    const model = computeDecoupledOwnership({});
    const keys = Object.keys(model) as Array<keyof typeof model>;

    expect(keys).toHaveLength(7);
    expect(keys).toEqual([
      "domainOwner",
      "ipAllocation",
      "asnOperation",
      "networkOperation",
      "hostingProvider",
      "applicationOrigin",
      "physicalLocation"
    ]);

    for (const key of keys) {
      const concept = model[key];
      expect(concept.confidence).toBeGreaterThanOrEqual(0);
      expect(concept.confidence).toBeLessThanOrEqual(100);
      expect(typeof concept.label).toBe("string");
      expect(typeof concept.identity).toBe("string");
      expect(typeof concept.explanation).toBe("string");
    }
  });
});
```

---

## 7. Next Steps & Implementation Handoff

1. **`src/shared/types.ts` Update**: Implement `OwnershipConcept` and `DecoupledOwnershipModel` interfaces.
2. **`src/server/engine/ownership.ts` Creation**: Write `computeDecoupledOwnership` and helper functions.
3. **`src/tests/ownership.test.ts` Creation**: Write Vitest unit test suite and verify via `npm run test` or `npx vitest run src/tests/ownership.test.ts`.
