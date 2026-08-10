# Detailed Type Analysis & Interface Specifications for Milestone 1

**Author**: m1_explorer_1  
**Date**: 2026-08-10  
**Target File**: `src/shared/types.ts`  
**Milestone**: M1 — Core Engine & Decoupled Ownership Data Models  

---

## 1. Executive Summary

This report presents a thorough investigation of the existing type system in `src/shared/types.ts`, its usage across the server (`src/server/scanner.ts`, `src/server/modules/infrastructure.ts`, `src/server/index.ts`) and client (`src/client/main.tsx`), and the exact interface additions and refactorings needed for Milestone 1.

The primary objective of Milestone 1 is to refactor the Origin / Hosting / Ownership Correlation Engine to move away from simplistic text confidence strings (`"high" | "medium" | "low"`) and conflated owner fields towards:
1. A **deterministic 0–100 Evidence & Contradiction Scoring Model** ($S = \max(0, \min(100, \sum P - \sum N))$).
2. **7 Decoupled Infrastructure Ownership Concepts** with independent 0–100% confidence ratings: Domain Ownership, IP Allocation, ASN Ownership, Network Operation, Hosting Provider, Application Origin IP, and Physical Location.
3. Expanded interfaces in `src/shared/types.ts` supporting full multi-stage pipeline tracking, MX email infrastructure isolation, and structured natural language narrative verdicts.

---

## 2. Analysis of Existing Codebase & Type Usages

### 2.1 Current `src/shared/types.ts` Structure
The current `src/shared/types.ts` contains basic OSINT structures:
- `DomainProfile`, `OwnershipTimelineItem` (WHOIS/CT timeline events).
- `DnsRecordSet` (standard DNS records).
- `IpProfile`, `AsnProfile`, `GeoPoint`, `UpstreamRelation`.
- `InfrastructureSupplyChain`, `IpSupplyChain`, `NetworkLeaseSignal`.
- `OriginCandidate`: basic 4-field type `{ ip: string; source: string; provider: string; confidence: "high" | "medium" | "low" }`.
- `ScanResult`: composite object representing scan findings.

### 2.2 Existing Code Usages & Dependencies
- **`src/server/scanner.ts`**:
  - Line 118 & Line 275: Extracts and constructs `ownership` as `OwnershipTimelineItem[]`.
  - Line 198 & Line 259: Constructs `origins` as `OriginCandidate[]`.
  - Returns `ScanResult`.
- **`src/server/modules/infrastructure.ts`**:
  - Imports `DnsRecordSet`, `HttpProfile`, `InfrastructureProvider`, `InfrastructureSupplyChain`, `IpProfile`, `IpSupplyChain`, `NetworkLeaseSignal`, `ProviderConfidence`, `SourceRef`, `UpstreamRelation`.
  - Defines infrastructure lease signals and calculates overall infrastructure supply chain verdict.
- **`src/client/main.tsx`**:
  - Imports `ScanResult`, `ScanJob`, `ScanMode`, `ActiveOptions`.
  - Renders `result.origins` table (`origin.ip`, `origin.provider`, `origin.confidence`, `origin.source`).
  - Accesses `result.origins.find(o => o.confidence === "high")` in its narrative text builder.
- **`src/tests/parsers.test.ts`**:
  - Tests `mergeOptions` and `classifyLeaseSignalsForTest`.

---

## 3. Mandatory Interface Definitions for Milestone 1

### 3.1 `EvidenceSignal` Interface
The `EvidenceSignal` model captures positive evidence and negative contradictions evaluated by the engine.

```typescript
export type EvidenceType = "supporting" | "contradiction";
export type EvidenceCategory =
  | "dns"
  | "tls"
  | "http"
  | "ptr"
  | "asn"
  | "waf"
  | "subdomain"
  | "mx"
  | "port";

export type EvidenceSignal = {
  id: string;             // Unique signal rule ID (e.g. "POS_TLS_SAN_MATCH", "NEG_CDN_ASN")
  type: EvidenceType;     // "supporting" (positive weight) or "contradiction" (negative penalty)
  category: EvidenceCategory;
  weight: number;         // Signed integer weight (+30, +25, +20, +15, +10, +5 or -30, -25, -20, -15)
  title: string;          // Human-readable title (e.g. "TLS SAN / CN Match")
  description: string;    // Detailed explanation of criterion
  observedData?: string;  // Verbatim observed data snippet (e.g. "SAN: *.example.com")
  source?: string;        // Originating module/probe (e.g. "tls-probe", "dns-resolver")
};

// Compatibility alias for specification references
export type EvidenceItem = EvidenceSignal;
```

#### Signal Weight Rules & Criteria Reference:

| Signal ID | Type | Category | Weight | Criterion / Trigger Condition |
|-----------|------|----------|--------|-------------------------------|
| `POS_TLS_SAN_MATCH` | `supporting` | `tls` | **+30** | TLS cert on candidate IP:443 contains target domain in SAN or CN. |
| `POS_HTTP_CONTENT_MATCH` | `supporting` | `http` | **+25** | Direct HTTP GET with target Host header matches HTML title or favicon hash. |
| `POS_SUBDOMAIN_LEAK` | `supporting` | `subdomain` | **+20** | Candidate IP discovered via non-proxied subdomain resolution. |
| `POS_PTR_DOMAIN_MATCH` | `supporting` | `ptr` | **+15** | PTR record for candidate IP contains target domain or org name. |
| `POS_HISTORICAL_IP` | `supporting` | `dns` | **+15** | IP historically associated with root domain before CDN adoption. |
| `POS_ASN_MATCH` | `supporting` | `asn` | **+10** | IP ASN operator or allocation owner matches domain registrant org. |
| `POS_NON_CDN_PORT_OPEN` | `supporting` | `port` | **+5** | Candidate IP has open backend ports (22, 8443, 8080, 3306). |
| `NEG_CDN_ASN` | `contradiction` | `asn` | **-30** | IP belongs to known CDN/WAF ASN (Cloudflare AS13335, Akamai AS20940, Fastly AS54113, etc.). |
| `NEG_CLOUD_WAF_HEADER` | `contradiction` | `waf` | **-25** | HTTP headers include WAF signatures (`Server: cloudflare`, `CF-RAY`, `x-amz-cf-id`). |
| `NEG_GENERIC_LANDING` | `contradiction` | `http` | **-20** | HTTP GET returns generic landing page (cPanel, Nginx default welcome). |
| `NEG_TLS_CERT_MISMATCH` | `contradiction` | `tls` | **-15** | TLS cert is self-signed, invalid, or unrelated third-party cert. |
| `NEG_MX_INFRASTRUCTURE` | `contradiction` | `mx` | **-15** | IP only resolves for MX exchange host and does not serve web application. |

---

### 3.2 `CandidateClassification` Union Type

```typescript
export type CandidateClassification =
  | "likely-origin"     // Score >= 70 & no CDN contradiction
  | "possible-origin"   // Score 40-69 & no CDN contradiction
  | "unverified-leak"   // Score 20-39 or unreachable active probe
  | "cdn-proxy"         // Contradiction NEG_CDN_ASN triggered
  | "shared-hosting"    // Contradiction NEG_GENERIC_LANDING triggered
  | "email-only";       // Pure MX host isolated from web origins

export type ScoreClassification = CandidateClassification; // Alias
```

---

### 3.3 `OriginCandidateDetailed` Interface

```typescript
export type OriginCandidateDetailed = {
  ip: string;
  domain: string;
  classification: CandidateClassification;
  score: number;                         // Clamped integer 0–100
  supportingSignals: EvidenceSignal[];    // Positive signals list
  contradictionSignals: EvidenceSignal[]; // Negative contradiction penalties list
  provider: string;                      // Hosting provider or ASN org name
  asn: string;                           // Autonomous System Number (e.g. "AS24940")
  location: string;                      // Geographic location (e.g. "Nuremberg, DE")
  rawSignals?: Record<string, any>;      // Raw probe responses
  explanation: string;                   // Natural language explanation of evaluation

  // Backward compatibility fields for legacy OriginCandidate interface
  source?: string;                       // e.g. "DNS Leak + TLS SAN Match"
  confidence?: "high" | "medium" | "low"; // Derived from score: >=70 "high", >=40 "medium", <40 "low"
};
```

---

### 3.4 `ConceptConfidence` & `OwnershipConcept` Interfaces

```typescript
export type ConfidenceRating = "high" | "medium" | "low" | "none";

export type ConceptConfidence = {
  score: number;            // 0–100 percentage
  rating: ConfidenceRating; // Categorical rating
  rationale: string;        // Reasoning behind confidence assignment
};

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
  label: string;             // Human-readable title (e.g. "Domain Ownership", "IP Allocation")
  identity: string;          // Extracted identity (e.g. "Example Registrant Ltd", "Hetzner Online GmbH")
  confidence: number;        // 0–100 percentage
  confidenceRating: ConfidenceRating;
  evidenceCount: number;     // Number of supporting evidence signals
  explanation: string;       // Detailed narrative explanation
  details?: Record<string, any>; // Concept-specific metadata (e.g. registrar, RIR, country, city, ASN)
};
```

---

### 3.5 `DecoupledOwnershipModel` Interface

Encapsulates all 7 decoupled infrastructure concepts as explicit properties:

```typescript
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

### 3.6 Auxiliary Deliverable Types (`MxInfrastructureSummary` & `NarrativeVerdict`)

```typescript
export type MxInfrastructureSummary = {
  domain: string;
  mxRecords: string[];
  ips: string[];
  providers: string[];
  isolatedFromWebOrigin: boolean;
};

export type NarrativeVerdict = {
  summary: string;
  classification: string;
  confidenceScore: number;
  explanation: string;
  keyEvidence: string[];
};
```

---

### 3.7 Refactored `ScanResult` Interface

```typescript
export type ScanResult = {
  // Metadata & Scan Job tracking fields
  id?: string;
  targetDomain?: string;
  timestamp?: string;
  status?: ScanStatus;
  progress?: number;
  currentStage?: string;
  stageName?: string;

  // Reconnaissance & Raw Data Collections (Preserved)
  domain: DomainProfile;
  ownership: OwnershipTimelineItem[];   // WHOIS/CT timeline events (Preserved for backward compatibility)
  dns: DnsRecordSet;
  ips: IpProfile[];
  network: NetworkHop[];
  ports: PortFinding[];
  banners: ServiceBanner[];
  tls: TlsProfile[];
  http: HttpProfile[];
  subdomains: string[];
  infrastructure: InfrastructureSupplyChain;
  risks: RiskFinding[];
  warnings: string[];
  origins: OriginCandidate[];           // Legacy origin candidate array (Preserved)

  // Refactored Engine Deliverables (Milestone 1)
  candidates?: OriginCandidateDetailed[];
  topOriginCandidate?: OriginCandidateDetailed;
  decoupledOwnership?: DecoupledOwnershipModel;
  mxInfrastructure?: MxInfrastructureSummary;
  narrativeVerdict?: NarrativeVerdict;
};
```

---

## 4. Backward Compatibility & Migration Assessment

### 4.1 Migration Strategy Matrix

| Component | Target Code | Invalidation Risk | Migration Strategy |
|-----------|-------------|-------------------|--------------------|
| `src/server/scanner.ts` | Uses `ownership: OwnershipTimelineItem[]` and `origins: OriginCandidate[]` | **LOW** | Preserve `ownership: OwnershipTimelineItem[]` alongside new `decoupledOwnership?: DecoupledOwnershipModel`. Populate both `candidates: OriginCandidateDetailed[]` and `origins: OriginCandidate[]` (derived from candidates). |
| `src/server/modules/infrastructure.ts` | Uses `ProviderConfidence` (`"high" | "medium" | "low"`) and `InfrastructureSupplyChain` | **NONE** | Keep existing supply chain types intact. The engine in `ownership.ts` will consume output from `infrastructure.ts` to compute 0-100% confidence ratings. |
| `src/client/main.tsx` | Reads `result.origins`, checking `o.confidence === "high"`, `o.ip`, `o.provider` | **NONE** | Legacy `origins` array remains populated in `ScanResult`. M3 will update `main.tsx` to render the new `OwnershipGrid` and `EvidenceBreakdown` components. |
| `src/tests/parsers.test.ts` | Tests `classifyLeaseSignalsForTest` | **NONE** | Standard test imports continue working unchanged. |

---

## 5. Implementation Code Patch for `src/shared/types.ts`

The following TypeScript block represents the complete, drop-in replacement additions for `src/shared/types.ts`:

```typescript
// Additions to src/shared/types.ts for Milestone 1

export type EvidenceType = "supporting" | "contradiction";
export type EvidenceCategory =
  | "dns"
  | "tls"
  | "http"
  | "ptr"
  | "asn"
  | "waf"
  | "subdomain"
  | "mx"
  | "port";

export type EvidenceSignal = {
  id: string;
  type: EvidenceType;
  category: EvidenceCategory;
  weight: number;
  title: string;
  description: string;
  observedData?: string;
  source?: string;
};

export type EvidenceItem = EvidenceSignal;

export type CandidateClassification =
  | "likely-origin"
  | "possible-origin"
  | "unverified-leak"
  | "cdn-proxy"
  | "shared-hosting"
  | "email-only";

export type ScoreClassification = CandidateClassification;

export type OriginCandidateDetailed = {
  ip: string;
  domain: string;
  classification: CandidateClassification;
  score: number;
  supportingSignals: EvidenceSignal[];
  contradictionSignals: EvidenceSignal[];
  provider: string;
  asn: string;
  location: string;
  rawSignals?: Record<string, any>;
  explanation: string;
  source?: string;
  confidence?: "high" | "medium" | "low";
};

export type ConfidenceRating = "high" | "medium" | "low" | "none";

export type ConceptConfidence = {
  score: number;
  rating: ConfidenceRating;
  rationale: string;
};

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
  confidence: number;
  confidenceRating: ConfidenceRating;
  evidenceCount: number;
  explanation: string;
  details?: Record<string, any>;
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

export type MxInfrastructureSummary = {
  domain: string;
  mxRecords: string[];
  ips: string[];
  providers: string[];
  isolatedFromWebOrigin: boolean;
};

export type NarrativeVerdict = {
  summary: string;
  classification: string;
  confidenceScore: number;
  explanation: string;
  keyEvidence: string[];
};
```

---

## 6. Verification Steps for Implementers

1. **Type Check Verification**: Run `npx tsc --noEmit` from the project root directory. Verify zero compilation errors occur.
2. **Unit Test Verification**: Run `npx vitest run` or `npm test` to ensure existing tests pass cleanly.
