# Specification Analysis: domain_check Correlation Engine Refactoring

**Project**: domain_check — Origin / Hosting / Ownership Correlation Engine  
**Author**: spec_miner_1  
**Date**: 2026-08-10  
**Source Specifications**: `ORIGINAL_REQUEST.md`, existing codebase (`src/shared/types.ts`, `src/server/scanner.ts`, `src/server/modules/infrastructure.ts`, `src/client/main.tsx`).

---

## 1. Executive Summary

The `domain_check` project is an OSINT Attack Surface Management (ASM) tool designed to map a domain's hosting infrastructure, detect proxy/CDN layers (e.g. Cloudflare, Akamai, Fastly), and identify true application origin IPs ("Origin Leaks").

Currently, origin candidate confidence is represented using simple high/medium/low text strings (`"high" | "medium" | "low"`), and infrastructure ownership is partially conflated across ASN names and RDAP allocation owners.

This specification refactors the Correlation Engine to introduce:
1. An **Evidence & Contradiction Engine** with a deterministic 0–100 scoring model, positive signal weights, negative contradiction penalties, and structured explanations.
2. **7 Decoupled Ownership Concepts** with independent confidence metrics: Domain Ownership, IP Allocation, ASN Ownership, Network Operation, Hosting Provider, Application Origin IP, and Physical Location.
3. **Expanded Correlation Sources** including comprehensive DNS record types, subdomain permutations, active TLS SNI probes, HTTP host-header fingerprinting, BGP/RIPE subleased network detection, PTR cross-checks, and separate MX infrastructure isolation.
4. A **6-Stage Performance Pipeline** that bounds network overhead by delaying heavy active checks until top candidates are selected.
5. **Frontend UI Updates** displaying 0–100 evidence score bars, supporting factors (+weights), contradiction factors (-weights), ownership breakdowns, and human-readable narrative verdicts.
6. A **Secondary Documentation Page** in the React UI detailing scanner methods, cross-referencing algorithms, and evidence scoring rules.

---

## 2. Features Discovered & Mapped

### Features Discovered Table

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| F01 | Scoring | Evidence Scoring Engine | Calculates candidate origin IP confidence (0-100) using additive positive weights and negative contradiction penalties. | Candidate IP, TLS profile, HTTP profile, DNS records, ASN info | Score `0-100`, list of positive factors, list of contradictions | Clamped between `0` and `100`; fallback score `0` if unreachable | `ORIGINAL_REQUEST.md` R1 |
| F02 | Scoring | Contradiction Engine | Applies negative penalties when signals contradict origin status (e.g. CDN ASN, Cloud WAF headers, shared hosting generic pages). | IP ASN org, HTTP server headers, WAF signatures | Negative weight items (e.g. -30 CDN penalty) | Non-fatal; penalty deducted from total candidate score | `ORIGINAL_REQUEST.md` R1 |
| F03 | Scoring | Explanatory Narrative Generator | Generates auto-synthesized natural language explanation of how verdict & score were derived. | Candidate score breakdown, positive/negative signals, provider info | Human-readable text string | Returns fallback message if evidence list is empty | `ORIGINAL_REQUEST.md` R1, R5 |
| F04 | Ownership | Decoupled Ownership Matrix | Separates 7 distinct ownership/operation concepts into structured fields with independent confidence scores. | WHOIS/RDAP, RIPE Stat, PeeringDB, DNS, TLS | 7 distinct ownership objects each with `name`, `type`, `confidence` | Unknown fields populated as `"Unknown"` with `confidence: 0` | `ORIGINAL_REQUEST.md` R2 |
| F05 | Ownership | IP Allocation vs ASN Separation | Distinguishes RIR (RIPE/ARIN/APNIC) netblock allocation owner from BGP Autonomous System (ASN) operator. | RDAP inetnum owner, BGP origin ASN | `ipAllocationOwner`, `asnOwner` fields | Flagged as `subleased` / `reseller` signal if owners differ | `src/server/modules/infrastructure.ts` |
| F06 | Correlation | MX Infrastructure Isolation | Categorizes MX mail server infrastructure separately from Web Application origins to prevent false origin identification. | DNS MX records, resolved MX IPs | `mxInfrastructure` array tagged as `role: "email"` | Excluded from web application origin leak ranking | `ORIGINAL_REQUEST.md` R3, `src/shared/types.ts` |
| F07 | Correlation | TLS SNI Direct Probing | Performs active TLS handshake on port 443 of candidate IPs sending target domain as SNI host. | Candidate IP, target domain name | `certMatch` boolean, Subject CN, SAN list | Returns false on socket timeout or connection refused | `src/server/scanner.ts:233-255` |
| F08 | Correlation | HTTP Host-Header Probing | Sends HTTP GET requests to candidate IP with target domain `Host` header to verify origin web server response. | Candidate IP, target domain | HTTP status, title, favicon hash, WAF signature | Handles connection errors gracefully without breaking scan | `ORIGINAL_REQUEST.md` R3 |
| F09 | Correlation | Sublease & Reseller Detection | Cross-references RIR allocation, BGP origin ASN, and PeeringDB to identify subleased/delegated IP space. | IP profile, RIPE neighbours, PeeringDB net | `leaseSignal` kind (`subleased`, `suballocated`, `in-house`) | Soft warning added if RIPE/PeeringDB APIs fail | `src/server/modules/infrastructure.ts` |
| F10 | Pipeline | Multi-Stage Scanning Pipeline | Executes 6-stage pipeline: Passive -> Candidates -> Cheap Enrichment -> Preliminary Score -> Expensive Verification -> Final Ranking. | Target domain, Scan options | Progress events (0-100%), final `ScanResult` | Emits `stage: "failed"` on unrecoverable error | `ORIGINAL_REQUEST.md` R4 |
| F11 | UI | Evidence Breakdown Dashboard | React UI displaying numeric 0-100 scores, evidence lists (+/-), ownership breakdown cards, and narrative summary. | `ScanResult` object | Rendered React component hierarchy | Shows empty state placeholder if no scan data | `ORIGINAL_REQUEST.md` R5, `src/client/main.tsx` |
| F12 | UI / Docs | Interactive Documentation Page | Frontend tab explaining scan modes, active module controls, correlation logic, and scoring rules. | React state navigation | Full documentation view component | Renders statically without backend dependency | `ORIGINAL_REQUEST.md` R6 |

---

### Edge Cases Table

| # | Feature | Input | Observed / Required Behavior |
|---|---------|-------|-----------------------------|
| E01 | Evidence Scoring | IP belonging to Cloudflare (AS13335) with TLS certificate matching target domain | Contradiction penalty (-30) for CDN ASN applies, preventing Cloudflare proxy IP from being misclassified as the physical origin server. Score clamped at low level (<30). |
| E02 | Subdomain Leak | Subdomain `dev.example.com` resolving to non-CDN IP (e.g. Hetzner) returning matching TLS certificate for `example.com` | Positive weights (+30 TLS match + 20 Subdomain leak + 25 HTTP match) yield high origin score (85-100), flagging Hetzner IP as `likely-origin`. |
| E03 | MX Infrastructure | MX record `mail.example.com` pointing to `AS15169` (Google LLC) | IP categorized strictly under `email` infrastructure with `mxProvider: "Google Workspace"`. Excluded from web origin candidates. |
| E04 | Unresponsive IP | Candidate IP times out on port 443 and port 80 probing | Passive evidence (e.g. DNS leak +20) remains recorded, but active verification bonuses are omitted. Final score reflects lower confidence (~30-40, tagged `unverified-candidate`). |
| E05 | Shared Hosting | Candidate IP serves default cPanel / NGINX welcome page when probed with target Host header | Positive HTTP content match bonus (+25) is NOT awarded; negative contradiction (-20 generic landing page) is applied. |
| E06 | Missing WHOIS Data | Registrant WHOIS is redacted by privacy service (e.g. Withheld for Privacy ehf) | `domainOwner` set to `"Redacted (Privacy Protected)"` with `confidence: 10%`. Domain ownership score kept independent of IP hosting confidence. |
| E07 | Anycast IP | Target IP resolves to AWS CloudFront / Fastly Anycast range | System flags IP as `cdn-proxy` (`classification: "cdn-proxy"`), assigns penalty (-30), and sets `applicationOrigin` score to 0. |

---

## 3. R1: Evidence & Contradiction Engine Specification

### 3.1 Scoring Architecture & Model
Each IP candidate $i$ evaluated for origin status receives a total origin score $S_i \in [0, 100]$, calculated as:

$$S_i = \max\left(0, \min\left(100, \sum P_k - \sum N_m\right)\right)$$

where:
- $\sum P_k$ is the sum of positive supporting evidence weights.
- $\sum N_m$ is the sum of negative contradiction penalties.

### 3.2 Positive Supporting Signals Matrix

| Signal ID | Signal Name | Weight | Condition / Criterion | Source Data |
|-----------|-------------|--------|-----------------------|-------------|
| `POS_TLS_SAN_MATCH` | TLS SAN / CN Match | **+30** | Direct port 443 TLS connection to candidate IP returns certificate containing target domain or wildcard in SAN or CN. | Socket TLS handshake on `ip:443` |
| `POS_HTTP_CONTENT_MATCH` | HTTP Host-Header Content Match | **+25** | Direct GET to candidate IP with `Host: target.com` returns matching HTML title, favicon Murmur3 hash, or body content. | HTTP request to `ip:80/443` |
| `POS_SUBDOMAIN_LEAK` | Subdomain DNS Leak | **+20** | Candidate IP was discovered via non-proxied subdomain A/AAAA resolution (e.g. `dev.domain.com`, `direct.domain.com`, `mail.domain.com`). | DNS passive / active discovery |
| `POS_PTR_DOMAIN_MATCH` | PTR Record Match | **+15** | Reverse DNS (PTR) for candidate IP contains target domain name or org identifier. | PTR lookup |
| `POS_HISTORICAL_IP` | Historical A Record Match | **+15** | IP was historically associated with root domain before WAF/CDN adoption. | CT logs / DNS history |
| `POS_ASN_MATCH` | In-House / Matching ASN | **+10** | IP ASN operator or allocation owner matches domain registrant organization name. | RDAP / WHOIS / BGP |
| `POS_NON_CDN_PORT_OPEN` | Non-Standard Web Port | **+5** | Candidate IP has open ports typical for backend origin servers (e.g. 22 SSH, 8443, 8080, 3306 MySQL). | Nmap / Port scan |

### 3.3 Negative Contradictions Matrix (Penalties)

| Signal ID | Signal Name | Weight | Condition / Criterion | Source Data |
|-----------|-------------|--------|-----------------------|-------------|
| `NEG_CDN_ASN` | CDN / WAF Autonomous System | **-30** | Candidate IP belongs to known CDN/WAF provider ASN (Cloudflare AS13335, Akamai AS20940, Fastly AS54113, Imperva AS19551, Sucuri, DDoS-Guard). | BGP ASN / PeeringDB |
| `NEG_CLOUD_WAF_HEADER` | Cloud WAF / Proxy Response Header | **-25** | HTTP response headers include WAF signatures (e.g., `Server: cloudflare`, `CF-RAY`, `x-amz-cf-id`, `X-Akamai-Transformed`). | HTTP headers |
| `NEG_GENERIC_LANDING` | Shared Hosting Default Landing Page | **-20** | HTTP probe returns generic web host default page (e.g. "Welcome to cPanel", "Default NGINX page") instead of target application. | HTTP body / title |
| `NEG_TLS_CERT_MISMATCH` | TLS Certificate Mismatch / Default Cert | **-15** | Direct TLS probe returns self-signed, invalid, or unrelated third-party certificate not listing target domain. | Socket TLS handshake |
| `NEG_MX_INFRASTRUCTURE` | Pure Email Infrastructure | **-15** | Candidate IP only resolves for MX exchange host and does not serve web application traffic. | DNS MX records |

### 3.4 Candidate Ranking & Breakdown Structure
The engine will return candidate origin rankings structured as:

```typescript
export type ScoreClassification =
  | "likely-origin"      // Score >= 70 & no CDN contradiction
  | "possible-origin"    // Score 40-69 & no CDN contradiction
  | "unverified-leak"    // Score 20-39 or unreachable active probe
  | "cdn-proxy"          // Contradiction NEG_CDN_ASN triggered
  | "shared-hosting"     // Contradiction NEG_GENERIC_LANDING triggered
  | "email-only";        // Pure MX host

export type EvidenceItem = {
  id: string;
  type: "positive" | "negative";
  weight: number;
  label: string;
  description: string;
  source: string;
};

export type CandidateScoreBreakdown = {
  ip: string;
  providerName: string;
  asn: string;
  location: string;
  totalScore: number; // 0-100
  classification: ScoreClassification;
  supportingEvidence: EvidenceItem[];
  contradictions: EvidenceItem[];
  explanation: string;
};
```

---

## 4. R2: Separate Ownership Concepts & Confidences Specification

The refactored Correlation Engine explicitly decouples 7 infrastructure concepts into separate typed objects, each carrying its own independent confidence rating (0–100%):

```typescript
export type ConceptConfidence = {
  score: number; // 0 - 100
  rating: "high" | "medium" | "low" | "none";
  rationale: string;
};

export type DecoupledOwnershipModel = {
  // 1. Domain Ownership
  domainOwnership: {
    domain: string;
    registrantOrg?: string;
    registrar?: string;
    privacyDetected: boolean;
    confidence: ConceptConfidence;
  };

  // 2. IP Allocation / Ownership
  ipAllocation: {
    ip: string;
    rir: string; // RIPE, ARIN, APNIC, etc.
    allocationOwner: string;
    networkName: string;
    announcedPrefix: string;
    confidence: ConceptConfidence;
  };

  // 3. ASN Ownership
  asnOwnership: {
    asn: string;
    orgName: string;
    rir: string;
    confidence: ConceptConfidence;
  };

  // 4. Network Operation / BGP
  networkOperation: {
    originAsn: string;
    upstreamAsns: string[];
    isSubleased: boolean;
    isSuballocated: boolean;
    confidence: ConceptConfidence;
  };

  // 5. Hosting Provider
  hostingProvider: {
    name: string;
    category: "cloud" | "bare-metal" | "shared" | "cdn" | "isp" | "unknown";
    datacenterOrg?: string;
    confidence: ConceptConfidence;
  };

  // 6. Application Origin IP
  applicationOrigin: {
    likelyOriginIp?: string;
    candidateCount: number;
    topCandidateScore: number; // 0 - 100
    isProxiedByCdn: boolean;
    confidence: ConceptConfidence;
  };

  // 7. Physical Infrastructure Location
  physicalLocation: {
    country?: string;
    city?: string;
    lat?: number;
    lon?: number;
    facilityCount?: number;
    facilityNames?: string[];
    confidence: ConceptConfidence;
  };
};
```

### Confidence Calculation Formulas for Each Concept:
- **Domain Ownership Confidence**: 90% if WHOIS registrant org is unredacted and verified; 20% if WHOIS privacy detected.
- **IP Allocation Confidence**: 95% if RDAP inetnum object returns clear org name; 50% if fallback to ASN org.
- **ASN Ownership Confidence**: 95% if BGP WHOIS / PeeringDB matches ASN record.
- **Network Operation Confidence**: 90% if RIPE Stat routing status confirms origin AS; reduced to 60% if BGP origin mismatch observed (`suballocated`).
- **Hosting Provider Confidence**: 85% based on ASN & RIR allocation correlation.
- **Application Origin Confidence**: Matches `topCandidateScore` from R1 Evidence Engine.
- **Physical Location Confidence**: 80% if MaxMind GeoIP / PeeringDB facility data match; 40% if IP is Anycast.

---

## 5. R3: Expanded Correlation Sources Specification

### 5.1 DNS & Subdomain Correlation Matrix
- **DNS Records Queried**: `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `SOA`, `CAA`, `PTR`, `NS`, `DNSSEC`.
- **Subdomain Discovery Pipeline**:
  1. Passive Certificate Transparency (crt.sh) log harvesting.
  2. Active dictionary bruteforce (e.g. `dev`, `staging`, `mail`, `direct`, `backend`, `origin`, `api`, `vpn`, `test`, `admin`).
  3. DNS alterations/permutations (e.g. `dev-api`, `test-app`).
  4. AXFR Zone Transfer attempts on all primary nameservers.
- **DNS Leak Signals**: Any subdomain resolving to an IP address outside the primary domain's proxy subnet is marked as a candidate IP source with `POS_SUBDOMAIN_LEAK` (+20).

### 5.2 TLS Certificate Probing
- **Attributes Extracted**: Subject CN, Subject Alternative Names (SAN array), Issuer Organization, Validity dates.
- **Active TLS SNI Socket Probing**:
  - Connects to candidate `IP:443` using TLS socket with `servername: targetDomain`.
  - Verification check: Does returned certificate contain `targetDomain` or `*.targetDomain` in SAN list?
  - If match: Awards `POS_TLS_SAN_MATCH` (+30).
  - If cert is self-signed / generic / mismatch: Applies `NEG_TLS_CERT_MISMATCH` (-15).

### 5.3 HTTP / Host-Header Fingerprinting
- Direct GET request to candidate IP over HTTP (80) and HTTPS (443) setting `Host: targetDomain`.
- Signals evaluated:
  - **HTML Title & Favicon**: Calculates Murmur3 hash of `/favicon.ico` and compares HTML `<title>` against main domain page. Award `POS_HTTP_CONTENT_MATCH` (+25) if title/favicon matches.
  - **WAF / CDN Headers**: Detects `Server`, `CF-Ray`, `X-Cache`, `X-Served-By`. Apply `NEG_CLOUD_WAF_HEADER` (-25) if CDN WAF detected.
  - **Generic Landing Page**: Matches signatures for default cPanel, Plesk, Nginx, Apache welcome pages. Apply `NEG_GENERIC_LANDING` (-20) if generic.

### 5.4 BGP / RIPE & Subleased Reseller Detection
- **RIPE Stat Routing API**: Queries `https://stat.ripe.net/data/routing-status/data.json?resource={ip}`.
- **Sublease Check**: Compares RIR Allocation Owner vs ASN Owner:
  - If `rirAllocationOwner !== asnOrg` $\rightarrow$ flag as `subleased` network space.
  - If `observedOriginAsn !== enrichmentAsn` $\rightarrow$ flag as `suballocated` route object mismatch.

### 5.5 Separate MX Infrastructure Isolation
- **Rule**: MX exchange hostnames (e.g., `target-com.mail.protection.outlook.com`, `aspmx.l.google.com`) and their resolved IPv4/IPv6 addresses MUST be explicitly tagged with `role: "email"`.
- **Isolation Logic**: IPs that only originate from MX records are stored in `mxInfrastructure` and are NOT classified as application web origins (`classification: "email-only"`).

---

## 6. R4: Multi-Stage Performance Pipeline Specification

To ensure scalable execution and prevent rate-limiting or heavy socket consumption across hundreds of candidate subdomains/IPs, execution follows a 6-Stage Pipeline:

```
[Stage 1: Passive Discovery]
       │ (crt.sh, WHOIS, Root DNS)
       ▼
[Stage 2: Candidate Generation]
       │ (Subdomains, Historical A, MX, CNAMEs)
       ▼
[Stage 3: Cheap Enrichment]
       │ (DNS Resolve, PTR, ASN Lookups, GeoIP)
       ▼
[Stage 4: Preliminary Scoring]
       │ (Passive Weights + CDN ASN Penalties Filter)
       ▼
[Stage 5: Expensive Verification]  ◄── Only for Top N Candidates (max 10)
       │ (Active TLS SNI, HTTP Host Probing, Nmap)
       ▼
[Stage 6: Final Ranking & Verdict Synthesis]
       │ (Calculate 0-100 Scores, Decouple 7 Ownerships, Synthesize Narrative)
       ▼
[Output ScanResult]
```

### Stage Details:
1. **Stage 1 — Passive Discovery**: Fetch WHOIS/RDAP, root DNS records (`A`, `AAAA`, `NS`, `MX`, `TXT`, `SOA`), and Certificate Transparency logs (`crt.sh`). (Progress: 0–15%).
2. **Stage 2 — Candidate Generation**: Aggregate all hostnames (`domain`, subdomains, MX exchanges, CNAME targets). Deduplicate candidate host list. (Progress: 15–30%).
3. **Stage 3 — Cheap Enrichment**: Resolve candidate hostnames to IPv4/IPv6 addresses via standard asynchronous DNS resolution. Fetch BGP ASN info, RIR allocation owner, and GeoIP. (Progress: 30–50%).
4. **Stage 4 — Preliminary Scoring**: Evaluate passive evidence (+20 subdomain leak, +15 PTR match, +10 ASN match, -30 CDN ASN). Rank candidate IPs based on preliminary passive score. Select top $N$ candidates (default $N=10$) for Stage 5. (Progress: 50–65%).
5. **Stage 5 — Expensive Verification**: Execute heavy socket/network probes **only on the top candidates**:
   - TLS SNI Handshake on candidate `IP:443`.
   - HTTP GET with custom `Host` header on candidate `IP:80` and `IP:443`.
   - Nmap discrete port scan / banner grabbing (if `active-discovery` mode). (Progress: 65–85%).
6. **Stage 6 — Final Ranking & Verdict**: Compute final 0–100 score, build supporting evidence and contradiction lists, compute confidence for 7 ownership concepts, generate human-readable narrative, and return complete `ScanResult`. (Progress: 85–100%).

---

## 7. R5: Deliverables & UI Updates Specification

### 7.1 Updated Type Definitions (`src/shared/types.ts`)
The `ScanResult` interface and helper models will be updated to export:

```typescript
export type EvidenceItem = {
  id: string;
  type: "positive" | "negative";
  weight: number;
  label: string;
  description: string;
  source: string;
};

export type OriginCandidateDetailed = {
  ip: string;
  provider: string;
  asn: string;
  location: string;
  totalScore: number; // 0 - 100
  classification: ScoreClassification;
  supportingEvidence: EvidenceItem[];
  contradictions: EvidenceItem[];
  explanation: string;
};

export type ScanResultUpdated = ScanResult & {
  evidenceCandidates: OriginCandidateDetailed[];
  ownershipModel: DecoupledOwnershipModel;
  narrativeVerdict: string;
};
```

### 7.2 Frontend UI Component Mockup & Layout (`src/client/main.tsx`)

#### Key Visual Components to Add/Refactor:
1. **0–100 Numerical Score Indicator**:
   - Visual progress bar color-coded by score range:
     - 70–100: Emerald green (`#10b981`) — High Confidence Origin Leak
     - 40–69: Amber (`#f59e0b`) — Moderate Candidate
     - 0–39: Slate / Red (`#ef4444`) — Low Candidate / Proxied CDN
2. **Supporting Evidence vs Contradictions Breakdown Cards**:
   - **Supporting Signals Table**: Displays green badges (`+30`, `+25`, `+20`) with signal label, source, and description.
   - **Contradiction Penalties Table**: Displays red badges (`-30`, `-25`, `-20`) with penalty label, source, and description.
3. **Decoupled 7 Ownership Cards Grid**:
   - Grid displaying the 7 ownership concepts side by side, each showing the entity name, role, and independent confidence meter (e.g. Domain Owner: 20% [Privacy Protected], IP Allocation: 95% [Hetzner Online GmbH], ASN Owner: 95% [AS24940], Application Origin: 90% [193.230.5.163]).
4. **Human-Readable Narrative Verdict Box**:
   - Styled banner summarizing the engine's logical conclusion with highlighted key terms (e.g. **Origin Server**, **Cloudflare WAF**, **Hetzner Online**).

---

## 8. R6: Secondary Documentation Page Specification

A dedicated React view component (`Documentation.tsx` accessible via a header button) will be implemented to document scanner operations and scoring rules:

### Documentation Page Content Architecture:
1. **Section 1: Operational Scan Modes**:
   - Detailed explanation of `passive`, `controlled-active`, `active-discovery`, `network-map`, and `dns-only` modes.
2. **Section 2: Multi-Stage Scanning Pipeline**:
   - Stage-by-stage diagram and explanation (Stage 1 to Stage 6).
3. **Section 3: Decoupled Infrastructure Ownership Model**:
   - Definitions of Domain Ownership, IP Allocation, ASN Ownership, Network Operation, Hosting Provider, Application Origin, and Physical Location.
4. **Section 4: Evidence & Contradiction Engine Scoring Rules**:
   - Full reference table of positive weights (+30 TLS SAN, +25 HTTP content, +20 Subdomain leak, +15 PTR, +10 ASN match) and negative contradiction penalties (-30 CDN ASN, -25 Cloud WAF header, -20 Generic page, -15 TLS cert mismatch).
5. **Section 5: Cross-Referencing & Sublease Detection**:
   - Explanation of how RIR RDAP data is cross-referenced with BGP origin ASNs and PeeringDB to identify subleased networks and resellers.

---

## 9. Acceptance Criteria & Verification Matrix

| AC # | Criterion | Verification Target & Method | Expected Result |
|------|-----------|------------------------------|-----------------|
| **AC1** | Decoupled Ownership Concepts | Test unit `tests/parsers.test.ts` & `ScanResult` schema | Code distinguishes between domain owner (registrant), hosting provider, ASN owner, and origin IP without collapsing into a single owner string. |
| **AC2** | Direct-Hosted Domain Scenario | Test target `ici.ro` / direct server | Direct-hosted domain is scored ~85–100, classified as `likely-origin`, with direct provider narrative. |
| **AC3** | Cloudflare-Proxied Domain Scenario | Test target `cloudflare.com` / proxied domain | Proxied domain IP triggers `-30` CDN penalty, classified as `cdn-proxy`, score kept low (<30), and narrative explains proxy protection. |
| **AC4** | Separate MX Infrastructure Scenario | Test domain with Google Workspace / Office 365 MX | MX IP addresses are tagged `email-only` / `role: "email"` and excluded from web origin candidate ranking. |
| **AC5** | UI 0–100 Score & Evidence Rendering | Frontend visual check & test state | Dashboard UI displays numeric 0–100 progress score, positive/negative evidence breakdowns (+30/-30 tags), 7 concept confidences, and narrative summary. |

---
