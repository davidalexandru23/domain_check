# Project: domain_check — Origin / Hosting / Ownership Correlation Engine Refactoring

## Architecture
The application is a full-stack domain intelligence scanner.
- **Frontend**: React 19 + Vite 7 + Tailwind CSS 3.4 + lucide-react icons (`src/client/main.tsx`). Single-page dashboard with polling-based real-time updates and tabbed views (`/scan`, `/history`, `/docs`).
- **Backend**: Node.js ES Modules + Express v5.1.0 + TypeScript (`src/server/index.ts`, `src/server/scanner.ts`). Native OS process orchestration (`nmap`, `traceroute`, `dig`, `whois`) + active socket/HTTP probes.
- **Shared Data Contracts**: TypeScript interface definitions in `src/shared/types.ts` defining `ScanResult`, `OriginCandidateDetailed`, `DecoupledOwnershipModel`, and `EvidenceSignal`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Evidence & Contradiction Scoring Model | Deterministic 0-100 score model $S = \max(0, \min(100, \sum P - \sum N))$ with positive weights (+30 TLS SAN, +25 HTTP, +20 Subdomain, +15 PTR, +10 ASN) and contradiction penalties (-30 CDN ASN, -25 WAF, -20 Generic page, -15 Cert mismatch) | M1 | R1 |
| 2 | Decoupled 7 Ownership Concepts | Explicit separation of Domain Ownership, IP Allocation, ASN Ownership, Network Operation, Hosting Provider, Application Origin IP, and Physical Infrastructure Location with separate 0-100% confidence scores | M1 | R2 |
| 3 | Expanded Correlation Sources | Expanded DNS (A, AAAA, CNAME, MX, TXT, SOA, CAA, PTR), CT log + bruteforce subdomain discovery, TLS SNI IP:443 probing, HTTP Host GET & WAF fingerprinting, BGP/RIPE subleased network detection | M2 | R3 |
| 4 | MX Email Infrastructure Isolation | Categorize MX mail servers under `email-only` classification tag and exclude them from web application origin candidate pool | M2 | R3 |
| 5 | 6-Stage Multi-Stage Performance Pipeline | 6-stage execution: Stage 1 Passive Discovery -> Stage 2 Candidate Gen -> Stage 3 Cheap Enrichment -> Stage 4 Preliminary Score -> Stage 5 Expensive Verification (Top 10 candidates only) -> Stage 6 Final Ranking & Verdict Synthesis | M2 | R4 |
| 6 | Frontend UI Score Bars & Evidence Breakdown | Visual 0-100 score bars, supporting evidence (+points) and contradiction (-points) breakdown cards for each origin candidate | M3 | R5 |
| 7 | Frontend UI 7 Ownership Cards Grid & Narrative Verdict | Render 7 decoupled ownership concept cards grid with independent confidence bars and human-readable narrative verdict | M3 | R5 |
| 8 | Interactive Documentation Page | Frontend `/docs` interactive view documenting scan methods, cross-referencing logic, 6-stage pipeline, and 0-100 evidence scoring rules table | M3 | R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | E2E Testing Suite Track | Opaque-box E2E test infra & test cases (Tiers 1-4) -> Publish `TEST_READY.md` | None | PLANNED |
| M1 | Core Engine & Decoupled Ownership | `src/shared/types.ts`, scoring engine, 7 decoupled ownership model calculation | None | PLANNED |
| M2 | Correlation Sources & 6-Stage Pipeline | `src/server/scanner.ts`, expanded DNS/TLS/HTTP/BGP sources, MX isolation, 6-stage pipeline | M1 | PLANNED |
| M3 | Frontend UI & Documentation Page | `src/client/main.tsx`, `src/client/components/Docs.tsx`, UI components, routing/tabs | M1, M2 | PLANNED |
| M_FINAL | Final E2E Test & Hardening | Pass 100% E2E test suite (Phase 1) + Tier 5 Adversarial Coverage Hardening (Phase 2) | M0, M1, M2, M3 | PLANNED |

## Code Layout
```
src/
├── shared/
│   └── types.ts                    # Shared interfaces (ScanResult, EvidenceSignal, DecoupledOwnershipModel)
├── server/
│   ├── index.ts                    # Express server entry point & API router
│   ├── scanner.ts                  # Multi-stage scanner orchestrator
│   ├── engine/
│   │   ├── scoring.ts              # Evidence & contradiction 0-100 scoring logic
│   │   ├── ownership.ts            # Decoupled 7-concept ownership calculation
│   │   └── pipeline.ts             # 6-stage pipeline coordinator
│   └── modules/
│       ├── dns.ts                  # Expanded DNS & subdomain discovery
│       ├── tls.ts                  # TLS SNI & cert inspection
│       ├── http.ts                 # HTTP Host probing & WAF fingerprinting
│       └── bgp.ts                  # BGP / RIPE ASN & sublease detection
├── client/
│   ├── main.tsx                    # Main React entry & tab routing (/scan, /history, /docs)
│   └── components/
│       ├── EvidenceBreakdown.tsx   # Score bars, + / - evidence breakdown
│       ├── OwnershipGrid.tsx       # 7 ownership concept cards
│       └── Docs.tsx                # Interactive documentation page
└── tests/
    ├── scoring.test.ts             # Unit tests for scoring engine
    ├── ownership.test.ts           # Unit tests for decoupled ownership
    └── e2e/                        # E2E test suite (Tiers 1-4)
```

## Interface Contracts

### 1. `EvidenceSignal` Interface
```typescript
export type EvidenceSignal = {
  id: string;
  type: "supporting" | "contradiction";
  category: "dns" | "tls" | "http" | "ptr" | "asn" | "waf" | "subdomain" | "mx";
  weight: number; // positive (e.g. +30) or negative (e.g. -30)
  title: string;
  description: string;
  observedData: string;
};
```

### 2. `OriginCandidateDetailed` Interface
```typescript
export type CandidateClassification =
  | "likely-origin"
  | "possible-origin"
  | "unverified-leak"
  | "cdn-proxy"
  | "shared-hosting"
  | "email-only";

export type OriginCandidateDetailed = {
  ip: string;
  domain: string;
  classification: CandidateClassification;
  score: number; // Clamped 0–100
  supportingSignals: EvidenceSignal[];
  contradictionSignals: EvidenceSignal[];
  provider: string;
  asn: string;
  location: string;
  rawSignals: Record<string, any>;
};
```

### 3. `DecoupledOwnershipModel` Interface
```typescript
export type OwnershipConcept = {
  concept: "domainOwner" | "ipAllocation" | "asnOperation" | "networkOperation" | "hostingProvider" | "applicationOrigin" | "physicalLocation";
  label: string;
  identity: string;
  confidence: number; // 0–100%
  evidenceCount: number;
  explanation: string;
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

### 4. `ScanResult` Interface
```typescript
export type ScanResult = {
  id: string;
  targetDomain: string;
  timestamp: string;
  status: "pending" | "scanning" | "completed" | "failed";
  progress: number;
  currentStage: string;
  stageName: string;
  candidates: OriginCandidateDetailed[];
  topOriginCandidate?: OriginCandidateDetailed;
  ownership: DecoupledOwnershipModel;
  mxInfrastructure: {
    domain: string;
    mxRecords: string[];
    ips: string[];
    providers: string[];
    isolatedFromWebOrigin: boolean;
  };
  narrativeVerdict: {
    summary: string;
    classification: string;
    confidenceScore: number;
    explanation: string;
    keyEvidence: string[];
  };
};
```
