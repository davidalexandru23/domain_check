# Detailed Technical Analysis: Evidence Scoring Engine & Candidate Classification

**Module Target**: `src/server/engine/scoring.ts`  
**Test Suite Target**: `src/tests/scoring.test.ts`  
**Author**: `m1_explorer_2`  
**Date**: 2026-08-10  
**Milestone**: M1 (Core Engine & Decoupled Ownership)  

---

## 1. Executive Summary & Architectural Scope

The `domain_check` application is an Attack Surface Management (ASM) correlation engine designed to discover backend origin servers ("Origin Leaks") hidden behind CDN/WAF proxy layers (e.g. Cloudflare, Akamai, Fastly).

Historically, ASM engines have relied on ambiguous confidence strings (`"high" | "medium" | "low"`) and conflated domain registration with server hosting. The refactored correlation engine replaces this with a **deterministic 0–100 evidence-based scoring model**. 

`src/server/engine/scoring.ts` will serve as the core scoring and classification module. It takes raw multi-source correlation data for an IP candidate (DNS leaks, TLS SNI certificates, HTTP responses, PTR records, BGP ASN metadata, and port scans), evaluates positive evidence and negative contradictions, computes a clamped numeric score $S \in [0, 100]$, assigns an actionable `CandidateClassification`, and generates a natural-language narrative explanation.

---

## 2. Deterministic 0–100 Evidence Scoring Model Formula

### 2.1 Mathematical Formulation
For each IP candidate $i$, the total origin score $S_i$ is computed as:

$$S_i = \max\left(0, \min\left(100, \sum_{k} P_k - \sum_{m} N_m\right)\right)$$

Where:
- $\sum_{k} P_k$ is the sum of positive supporting signal weights ($P_k > 0$).
- $\sum_{m} N_m$ is the sum of negative contradiction signal penalty weights ($N_m > 0$, subtracted).

### 2.2 Mathematical Properties & Invariants
1. **Strict Boundedness**: $S_i \in [0, 100]$ for all possible inputs.
2. **Integer Output**: Scores are rounded to the nearest integer.
3. **Additive Independence**: Positive weights accumulate additively as additional independent evidence sources confirm origin status.
4. **Contradiction Penalty Override**: Strong negative signals (e.g., CDN ASN penalty -30) pull down candidate scores, preventing proxy IPs from being misclassified as physical origins regardless of passive DNS leaks.

### 2.3 Input Data Contract (`CandidateRawInput`)
To ensure type safety, `scoring.ts` expects raw candidate observations structured as follows:

```typescript
export type CandidateRawInput = {
  ip: string;
  domain: string;
  // DNS & Subdomain
  discoveredViaSubdomain?: boolean;
  subdomainName?: string;
  isHistoricalIp?: boolean;
  isMxIpOnly?: boolean;
  // PTR & ASN
  ptrHostname?: string;
  asnNumber?: string;
  asnOrg?: string;
  rirAllocationOwner?: string;
  registrantOrg?: string;
  // Active Probing Results
  tlsHandshakeSuccess?: boolean;
  tlsSanMatch?: boolean; // Target domain or wildcard in SAN/CN
  tlsCertMismatch?: boolean; // Self-signed / generic / untrusted domain cert
  httpProbeSuccess?: boolean;
  httpContentMatch?: boolean; // Matching title, body snippet, or favicon Murmur3
  httpWafHeaderDetected?: boolean; // Server: cloudflare, CF-Ray, etc.
  httpGenericLandingPage?: boolean; // Default cPanel, Nginx, Apache welcome page
  openPorts?: number[]; // e.g. [22, 80, 443, 8080]
  isCdnAsn?: boolean; // Belongs to Cloudflare, Akamai, Fastly, etc.
};
```

---

## 3. Positive Signals Matrix

The positive signal catalog rewards verifiable indicators that an IP directly serves the target application without proxying.

| Signal ID | Category | Weight | Title | Description | Trigger Condition |
|-----------|----------|--------|-------|-------------|-------------------|
| `POS_TLS_SAN_MATCH` | `tls` | **+30** | TLS SAN / CN Match | Direct TLS handshake on port 443 returns a certificate containing target domain or wildcard. | `tlsSanMatch === true` |
| `POS_HTTP_CONTENT_MATCH` | `http` | **+25** | HTTP Host-Header Content Match | Direct GET request with target `Host` header returns matching application title, favicon hash, or body content. | `httpContentMatch === true` |
| `POS_SUBDOMAIN_LEAK` | `subdomain` | **+20** | Subdomain DNS Leak | IP was discovered via non-proxied subdomain resolution (e.g. `dev.domain.com`, `direct.domain.com`). | `discoveredViaSubdomain === true` |
| `POS_PTR_DOMAIN_MATCH` | `ptr` | **+15** | Reverse DNS (PTR) Match | PTR hostname for the IP contains the target domain name or organization identifier. | `ptrHostname` matches target domain regex |
| `POS_HISTORICAL_IP` | `dns` | **+15** | Historical A Record Match | IP was historically associated with root domain before WAF adoption. | `isHistoricalIp === true` |
| `POS_ASN_MATCH` | `asn` | **+10** | In-House / Matching ASN | ASN org or RIR allocation owner matches domain registrant organization name. | `asnOrg` or `rirAllocationOwner` matches `registrantOrg` |
| `POS_NON_CDN_PORT_OPEN` | `http` | **+5** | Non-Standard Web Backend Port Open | IP has open backend ports typical for origin servers (e.g. 22 SSH, 8080, 8443, 3306 MySQL). | `openPorts` includes non-80/443 backend port |

---

## 4. Negative Contradiction Signals Matrix

Contradiction penalties prevent false positives when an IP displays traits of a CDN, generic shared host, WAF, or mail server.

| Signal ID | Category | Weight | Title | Description | Trigger Condition |
|-----------|----------|--------|-------|-------------|-------------------|
| `NEG_CDN_ASN` | `asn` | **-30** | CDN / WAF Autonomous System | IP belongs to a known CDN/WAF provider ASN (Cloudflare AS13335, Akamai AS20940, Fastly AS54113, Imperva AS19551, DDoS-Guard, etc.). | `isCdnAsn === true` |
| `NEG_CLOUD_WAF_HEADER` | `waf` | **-25** | Cloud WAF / Proxy Response Header | HTTP response headers contain WAF signatures (`Server: cloudflare`, `CF-Ray`, `X-Akamai-Transformed`, `x-amz-cf-id`). | `httpWafHeaderDetected === true` |
| `NEG_GENERIC_LANDING` | `http` | **-20** | Shared Hosting Default Landing Page | HTTP probe returns generic hosting welcome page (cPanel, Plesk, Nginx default) instead of target app. | `httpGenericLandingPage === true` |
| `NEG_TLS_CERT_MISMATCH` | `tls` | **-15** | TLS Certificate Mismatch | Direct TLS probe returns self-signed certificate or cert belonging to an unrelated domain. | `tlsCertMismatch === true` |
| `NEG_MX_INFRASTRUCTURE` | `mx` | **-15** | Email-Only MX Infrastructure | IP is strictly associated with MX mail exchange host and does not serve web app traffic. | `isMxIpOnly === true` |

---

## 5. Candidate Classification Logic & Decision Matrix

Each candidate IP is categorized into one of six standard `CandidateClassification` enum values defined in `src/shared/types.ts`:

```typescript
export type CandidateClassification =
  | "likely-origin"
  | "possible-origin"
  | "unverified-leak"
  | "cdn-proxy"
  | "shared-hosting"
  | "email-only";
```

### 5.1 Classification Rules & Evaluation Precedence
To resolve potential overlaps deterministically, classification logic follows strict evaluation precedence:

```
[Candidate Signals Evaluated]
             │
             ├── 1. Pure MX IP? (isMxIpOnly && no POS_TLS_SAN_MATCH && no POS_HTTP_CONTENT_MATCH)
             │      └── Tag: "email-only"
             │
             ├── 2. CDN/WAF Signal Present? (NEG_CDN_ASN || NEG_CLOUD_WAF_HEADER)
             │      └── Tag: "cdn-proxy"
             │
             ├── 3. Generic Landing Page & Low Score? (NEG_GENERIC_LANDING && score < 50)
             │      └── Tag: "shared-hosting"
             │
             ├── 4. Score >= 70?
             │      └── Tag: "likely-origin"
             │
             ├── 5. Score 40 to 69?
             │      └── Tag: "possible-origin"
             │
             └── 6. Fallback (Score < 40)
                    └── Tag: "unverified-leak"
```

### 5.2 Summary of Classification Criteria

| Classification | Score Condition | Mandatory Exclusions / Overrides | Description |
|----------------|-----------------|----------------------------------|-------------|
| `email-only` | Any | `isMxIpOnly === true` AND no active web match (`POS_TLS_SAN_MATCH`/`POS_HTTP_CONTENT_MATCH`). | MX mail server IP isolated from web origin pool. |
| `cdn-proxy` | Usually < 40 | `NEG_CDN_ASN` or `NEG_CLOUD_WAF_HEADER` triggered. | IP belongs to CDN/WAF reverse proxy layer. |
| `shared-hosting` | Usually < 40 | `NEG_GENERIC_LANDING` triggered without strong TLS/HTTP match overriding it. | Shared hosting server serving generic landing page. |
| `likely-origin` | **$S \ge 70$** | Cannot have `NEG_CDN_ASN` or `NEG_CLOUD_WAF_HEADER`. | High-confidence true origin server leak. |
| `possible-origin` | **$40 \le S \le 69$** | Cannot have `NEG_CDN_ASN` or `NEG_CLOUD_WAF_HEADER`. | Moderate confidence candidate requiring manual review. |
| `unverified-leak` | **$S < 40$** | No CDN or email-only overrides. | Passive leak indicator but active verification failed or unreachable. |

---

## 6. Narrative Explanation Generator Function

The narrative generator translates structured candidate scoring results into clear, human-readable explanations suitable for display in the React UI dashboard.

### 6.1 Function Signature
```typescript
export function generateCandidateExplanation(candidate: OriginCandidateDetailed): string
```

### 6.2 Generator Strategy & Composition Rules
The explanation string is constructed in 3 distinct segments:
1. **Verdict Header**: Primary classification statement with provider and IP context.
2. **Supporting Evidence Summary**: Key positive signals (+points) highlighted.
3. **Contradiction / Risk Warning**: Penalties or proxy protections (-points) noted.

### 6.3 Standard Templates by Classification

#### Case A: `likely-origin`
> *"Candidate IP 193.230.5.163 is classified as a likely origin server for example.com with a confidence score of 85/100 (Hetzner Online GmbH, AS24940, DE). Supporting evidence includes direct TLS SAN certificate match (+30), matching HTTP application content (+25), and subdomain DNS leak via dev.example.com (+20). No proxy or CDN contradictions were detected."*

#### Case B: `cdn-proxy`
> *"Candidate IP 104.21.48.12 is classified as a cdn-proxy with a confidence score of 0/100 (Cloudflare, Inc., AS13335, US). Strong contradiction signals were identified: CDN Autonomous System (-30) and Cloud WAF response headers (-25). This IP represents Cloudflare's reverse proxy layer and is not the physical origin server."*

#### Case C: `shared-hosting`
> *"Candidate IP 198.51.100.45 is classified as shared-hosting with a confidence score of 15/100 (Namecheap, AS22612, US). Although discovered via subdomain resolution (+20), HTTP probing returned a generic cPanel shared hosting landing page (-20) and a TLS certificate mismatch (-15)."*

#### Case D: `email-only`
> *"Candidate IP 142.250.180.27 is classified as email-only with a confidence score of 0/100 (Google LLC, AS15169, US). This IP is strictly associated with Google Workspace MX mail exchange hosts and does not serve web application origin traffic."*

---

## 7. Proposed Code Implementation Blueprint for `src/server/engine/scoring.ts`

Below is the complete, proposed implementation design for `src/server/engine/scoring.ts`:

```typescript
import { EvidenceSignal, OriginCandidateDetailed, CandidateClassification } from "../../shared/types.js";

export type CandidateRawInput = {
  ip: string;
  domain: string;
  provider?: string;
  asn?: string;
  location?: string;
  // Signals
  discoveredViaSubdomain?: boolean;
  subdomainName?: string;
  isHistoricalIp?: boolean;
  isMxIpOnly?: boolean;
  ptrHostname?: string;
  asnNumber?: string;
  asnOrg?: string;
  rirAllocationOwner?: string;
  registrantOrg?: string;
  tlsHandshakeSuccess?: boolean;
  tlsSanMatch?: boolean;
  tlsCertMismatch?: boolean;
  httpProbeSuccess?: boolean;
  httpContentMatch?: boolean;
  httpWafHeaderDetected?: boolean;
  httpGenericLandingPage?: boolean;
  openPorts?: number[];
  isCdnAsn?: boolean;
};

// Signal Definitions Catalog
export const POSITIVE_SIGNALS = {
  POS_TLS_SAN_MATCH: {
    id: "POS_TLS_SAN_MATCH",
    type: "supporting" as const,
    category: "tls" as const,
    weight: 30,
    title: "TLS SAN / CN Match",
    description: "Direct TLS probe on port 443 returned a certificate matching the target domain or wildcard."
  },
  POS_HTTP_CONTENT_MATCH: {
    id: "POS_HTTP_CONTENT_MATCH",
    type: "supporting" as const,
    category: "http" as const,
    weight: 25,
    title: "HTTP Host Content Match",
    description: "Direct HTTP request with target Host header returned matching application title or content."
  },
  POS_SUBDOMAIN_LEAK: {
    id: "POS_SUBDOMAIN_LEAK",
    type: "supporting" as const,
    category: "subdomain" as const,
    weight: 20,
    title: "Subdomain DNS Leak",
    description: "Candidate IP discovered via non-proxied subdomain resolution."
  },
  POS_PTR_DOMAIN_MATCH: {
    id: "POS_PTR_DOMAIN_MATCH",
    type: "supporting" as const,
    category: "ptr" as const,
    weight: 15,
    title: "Reverse DNS (PTR) Match",
    description: "Reverse DNS PTR record contains target domain or organization name."
  },
  POS_HISTORICAL_IP: {
    id: "POS_HISTORICAL_IP",
    type: "supporting" as const,
    category: "dns" as const,
    weight: 15,
    title: "Historical A Record Match",
    description: "IP was historically an A record for the domain prior to WAF adoption."
  },
  POS_ASN_MATCH: {
    id: "POS_ASN_MATCH",
    type: "supporting" as const,
    category: "asn" as const,
    weight: 10,
    title: "ASN / Allocation Match",
    description: "ASN operator or RIR allocation owner matches domain registrant organization."
  },
  POS_NON_CDN_PORT_OPEN: {
    id: "POS_NON_CDN_PORT_OPEN",
    type: "supporting" as const,
    category: "http" as const,
    weight: 5,
    title: "Non-CDN Port Open",
    description: "Backend origin ports (SSH 22, 8080, 8443, 3306) detected open."
  }
};

export const CONTRADICTION_SIGNALS = {
  NEG_CDN_ASN: {
    id: "NEG_CDN_ASN",
    type: "contradiction" as const,
    category: "asn" as const,
    weight: -30,
    title: "CDN / WAF Autonomous System",
    description: "IP belongs to a known CDN/WAF provider network (Cloudflare, Akamai, Fastly)."
  },
  NEG_CLOUD_WAF_HEADER: {
    id: "NEG_CLOUD_WAF_HEADER",
    type: "contradiction" as const,
    category: "waf" as const,
    weight: -25,
    title: "Cloud WAF / Proxy Response Header",
    description: "HTTP headers contain reverse proxy signatures (Server: cloudflare, CF-Ray)."
  },
  NEG_GENERIC_LANDING: {
    id: "NEG_GENERIC_LANDING",
    type: "contradiction" as const,
    category: "http" as const,
    weight: -20,
    title: "Shared Hosting Default Landing Page",
    description: "HTTP probe returned default hosting welcome page (cPanel, Nginx default)."
  },
  NEG_TLS_CERT_MISMATCH: {
    id: "NEG_TLS_CERT_MISMATCH",
    type: "contradiction" as const,
    category: "tls" as const,
    weight: -15,
    title: "TLS Certificate Mismatch",
    description: "Direct TLS probe returned self-signed or unrelated third-party certificate."
  },
  NEG_MX_INFRASTRUCTURE: {
    id: "NEG_MX_INFRASTRUCTURE",
    type: "contradiction" as const,
    category: "mx" as const,
    weight: -15,
    title: "Email-Only MX Infrastructure",
    description: "IP is strictly an MX mail exchange host and does not serve web application traffic."
  }
};

export function evaluateSignals(input: CandidateRawInput): {
  supporting: EvidenceSignal[];
  contradictions: EvidenceSignal[];
} {
  const supporting: EvidenceSignal[] = [];
  const contradictions: EvidenceSignal[] = [];

  // Positive Evaluations
  if (input.tlsSanMatch) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_TLS_SAN_MATCH,
      observedData: `TLS Certificate SAN match on ${input.ip}:443`
    });
  }
  if (input.httpContentMatch) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_HTTP_CONTENT_MATCH,
      observedData: `HTTP Host header response matched application fingerprint`
    });
  }
  if (input.discoveredViaSubdomain) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_SUBDOMAIN_LEAK,
      observedData: `Subdomain leak via ${input.subdomainName || input.domain}`
    });
  }
  if (input.ptrHostname && input.ptrHostname.toLowerCase().includes(input.domain.toLowerCase())) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_PTR_DOMAIN_MATCH,
      observedData: `PTR: ${input.ptrHostname}`
    });
  }
  if (input.isHistoricalIp) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_HISTORICAL_IP,
      observedData: `Historical DNS record match`
    });
  }
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
  if (input.openPorts && input.openPorts.some((p) => [22, 8080, 8443, 3306, 5432, 27017].includes(p))) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_NON_CDN_PORT_OPEN,
      observedData: `Open non-CDN ports: ${input.openPorts.filter((p) => p !== 80 && p !== 443).join(", ")}`
    });
  }

  // Contradiction Evaluations
  if (input.isCdnAsn) {
    contradictions.push({
      ...CONTRADICTION_SIGNALS.NEG_CDN_ASN,
      observedData: `ASN ${input.asnNumber || "CDN"} identified as Cloud/CDN Proxy`
    });
  }
  if (input.httpWafHeaderDetected) {
    contradictions.push({
      ...CONTRADICTION_SIGNALS.NEG_CLOUD_WAF_HEADER,
      observedData: `HTTP response headers contained WAF/Proxy signatures`
    });
  }
  if (input.httpGenericLandingPage) {
    contradictions.push({
      ...CONTRADICTION_SIGNALS.NEG_GENERIC_LANDING,
      observedData: `HTTP response matched generic hosting default landing page`
    });
  }
  if (input.tlsCertMismatch) {
    contradictions.push({
      ...CONTRADICTION_SIGNALS.NEG_TLS_CERT_MISMATCH,
      observedData: `TLS certificate mismatch or self-signed cert on ${input.ip}:443`
    });
  }
  if (input.isMxIpOnly) {
    contradictions.push({
      ...CONTRADICTION_SIGNALS.NEG_MX_INFRASTRUCTURE,
      observedData: `Pure MX exchange IP isolated from web origin pool`
    });
  }

  return { supporting, contradictions };
}

export function calculateScore(supporting: EvidenceSignal[], contradictions: EvidenceSignal[]): number {
  const positiveSum = supporting.reduce((acc, s) => acc + s.weight, 0);
  const negativeSum = contradictions.reduce((acc, c) => acc + Math.abs(c.weight), 0);
  const rawScore = positiveSum - negativeSum;
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

export function classifyCandidate(
  score: number,
  supporting: EvidenceSignal[],
  contradictions: EvidenceSignal[],
  isMxIpOnly?: boolean
): CandidateClassification {
  const hasWebMatch = supporting.some((s) => s.id === "POS_TLS_SAN_MATCH" || s.id === "POS_HTTP_CONTENT_MATCH");
  if (isMxIpOnly && !hasWebMatch) {
    return "email-only";
  }

  const hasCdnSignal = contradictions.some((c) => c.id === "NEG_CDN_ASN" || c.id === "NEG_CLOUD_WAF_HEADER");
  if (hasCdnSignal) {
    return "cdn-proxy";
  }

  const hasGenericLanding = contradictions.some((c) => c.id === "NEG_GENERIC_LANDING");
  if (hasGenericLanding && !hasWebMatch) {
    return "shared-hosting";
  }

  if (score >= 70) {
    return "likely-origin";
  } else if (score >= 40) {
    return "possible-origin";
  } else {
    return "unverified-leak";
  }
}

export function generateCandidateExplanation(candidate: OriginCandidateDetailed): string {
  const providerText = candidate.provider ? ` (${candidate.provider})` : "";
  const locationText = candidate.location ? `, ${candidate.location}` : "";
  const scoreText = `confidence score of ${candidate.score}/100`;

  let explanation = "";

  switch (candidate.classification) {
    case "email-only":
      explanation = `Candidate IP ${candidate.ip}${providerText} is classified as email-only with a ${scoreText}. This IP is strictly associated with mail exchange (MX) infrastructure and does not serve web application origin traffic.`;
      break;
    case "cdn-proxy":
      explanation = `Candidate IP ${candidate.ip}${providerText} is classified as a cdn-proxy with a ${scoreText}. Strong contradiction signals indicate this IP belongs to a CDN or Cloud WAF reverse proxy layer and is not the physical origin server.`;
      break;
    case "shared-hosting":
      explanation = `Candidate IP ${candidate.ip}${providerText} is classified as shared-hosting with a ${scoreText}. HTTP probing returned a default hosting landing page, indicating a shared server environment.`;
      break;
    case "likely-origin":
      explanation = `Candidate IP ${candidate.ip}${providerText}${locationText} is classified as a likely origin server for ${candidate.domain} with a high ${scoreText}. Multiple positive evidence signals directly confirm unproxied application origin status.`;
      break;
    case "possible-origin":
      explanation = `Candidate IP ${candidate.ip}${providerText}${locationText} is classified as a possible origin server with a moderate ${scoreText}. Partial positive signals were detected, but further verification is recommended.`;
      break;
    case "unverified-leak":
    default:
      explanation = `Candidate IP ${candidate.ip}${providerText} is classified as an unverified leak with a low ${scoreText}. Passive signals detected potential association, but active probing was inconclusive or unreachable.`;
      break;
  }

  if (candidate.supportingSignals && candidate.supportingSignals.length > 0) {
    const topSignals = candidate.supportingSignals.map((s) => `${s.title} (+${s.weight})`).join(", ");
    explanation += ` Key supporting factors: ${topSignals}.`;
  }

  if (candidate.contradictionSignals && candidate.contradictionSignals.length > 0) {
    const topPenalties = candidate.contradictionSignals.map((c) => `${c.title} (${c.weight})`).join(", ");
    explanation += ` Contradictions: ${topPenalties}.`;
  }

  return explanation;
}

export function scoreOriginCandidate(input: CandidateRawInput): OriginCandidateDetailed {
  const { supporting, contradictions } = evaluateSignals(input);
  const score = calculateScore(supporting, contradictions);
  const classification = classifyCandidate(score, supporting, contradictions, input.isMxIpOnly);

  const candidate: OriginCandidateDetailed = {
    ip: input.ip,
    domain: input.domain,
    classification,
    score,
    supportingSignals: supporting,
    contradictionSignals: contradictions,
    provider: input.provider || input.asnOrg || "Unknown Provider",
    asn: input.asn || input.asnNumber || "Unknown ASN",
    location: input.location || "Unknown Location",
    rawSignals: input
  };

  candidate.explanation = generateCandidateExplanation(candidate);
  return candidate;
}
```

---

## 8. Unit Test Strategy for `src/tests/scoring.test.ts`

The unit test suite will use `vitest` to validate every scoring edge case, signal evaluation, mathematical formula invariant, candidate classification rule, and narrative generator output.

### 8.1 Test Matrix & Test Cases

| Suite # | Test Scenario | Inputs / Signals | Expected Score | Expected Classification | Key Verification Assertions |
|---------|---------------|------------------|----------------|-------------------------|-----------------------------|
| **T1** | Direct-Hosted Domain (High Origin) | `tlsSanMatch` (+30), `httpContentMatch` (+25), `discoveredViaSubdomain` (+20) | **75** | `likely-origin` | `score === 75`, `classification === 'likely-origin'`, supportingSignals length === 3. |
| **T2** | Cloudflare-Proxied Domain | `isCdnAsn` (-30), `httpWafHeaderDetected` (-25), `discoveredViaSubdomain` (+20) | **0** (clamped from -35) | `cdn-proxy` | `score === 0`, `classification === 'cdn-proxy'`, contradictionSignals length === 2. |
| **T3** | Shared Hosting Default Page | `discoveredViaSubdomain` (+20), `httpGenericLandingPage` (-20), `tlsCertMismatch` (-15) | **0** (clamped from -15) | `shared-hosting` | `score === 0`, `classification === 'shared-hosting'`. |
| **T4** | Email-Only MX Infrastructure | `isMxIpOnly: true`, `isHistoricalIp` (+15), `isMxIpOnly` penalty (-15) | **0** | `email-only` | `classification === 'email-only'`, excluded from web origin candidate ranking. |
| **T5** | Score Clamping Upper Bound | All 7 positive signals active (+30+25+20+15+15+10+5 = +120) | **100** (clamped from 120) | `likely-origin` | `score === 100` (cannot exceed 100). |
| **T6** | Score Clamping Lower Bound | All 5 negative signals active (-30-25-20-15-15 = -105) | **0** (clamped from -105) | `cdn-proxy` | `score === 0` (cannot drop below 0). |
| **T7** | Moderate Candidate (Possible Origin) | `discoveredViaSubdomain` (+20), `ptrHostname` match (+15), `isHistoricalIp` (+15) | **50** | `possible-origin` | `score === 50`, `classification === 'possible-origin'`. |
| **T8** | Unverified Passive Leak | `discoveredViaSubdomain` (+20), no active probes successful | **20** | `unverified-leak` | `score === 20`, `classification === 'unverified-leak'`. |
| **T9** | Narrative Explanation Validation | Test each classification type output | N/A | Correct Text | Contains IP, domain, score string, classification name, and key factor details. |

### 8.2 Proposed Code Design for `src/tests/scoring.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import {
  calculateScore,
  classifyCandidate,
  evaluateSignals,
  generateCandidateExplanation,
  scoreOriginCandidate
} from "../server/engine/scoring.js";

describe("Scoring Engine - Formula & Clamping", () => {
  it("clamps total score to maximum 100", () => {
    const score = calculateScore(
      [
        { id: "1", type: "supporting", category: "tls", weight: 30, title: "T", description: "", observedData: "" },
        { id: "2", type: "supporting", category: "http", weight: 25, title: "H", description: "", observedData: "" },
        { id: "3", type: "supporting", category: "subdomain", weight: 20, title: "S", description: "", observedData: "" },
        { id: "4", type: "supporting", category: "ptr", weight: 15, title: "P", description: "", observedData: "" },
        { id: "5", type: "supporting", category: "dns", weight: 15, title: "D", description: "", observedData: "" },
        { id: "6", type: "supporting", category: "asn", weight: 10, title: "A", description: "", observedData: "" },
        { id: "7", type: "supporting", category: "http", weight: 5, title: "N", description: "", observedData: "" }
      ],
      []
    );
    expect(score).toBe(100);
  });

  it("clamps total score to minimum 0", () => {
    const score = calculateScore(
      [],
      [
        { id: "1", type: "contradiction", category: "asn", weight: -30, title: "C", description: "", observedData: "" },
        { id: "2", type: "contradiction", category: "waf", weight: -25, title: "W", description: "", observedData: "" }
      ]
    );
    expect(score).toBe(0);
  });
});

describe("Scoring Engine - Candidate Classifications", () => {
  it("classifies direct-hosted origin server correctly (likely-origin)", () => {
    const candidate = scoreOriginCandidate({
      ip: "193.230.5.163",
      domain: "example.com",
      provider: "Hetzner Online GmbH",
      asn: "AS24940",
      location: "Germany",
      tlsSanMatch: true,
      httpContentMatch: true,
      discoveredViaSubdomain: true,
      subdomainName: "dev.example.com"
    });

    expect(candidate.score).toBe(75);
    expect(candidate.classification).toBe("likely-origin");
    expect(candidate.supportingSignals.length).toBe(3);
    expect(candidate.contradictionSignals.length).toBe(0);
    expect(candidate.explanation).toContain("likely origin server");
    expect(candidate.explanation).toContain("75/100");
  });

  it("classifies Cloudflare CDN proxy correctly (cdn-proxy)", () => {
    const candidate = scoreOriginCandidate({
      ip: "104.21.48.12",
      domain: "example.com",
      provider: "Cloudflare, Inc.",
      asn: "AS13335",
      isCdnAsn: true,
      httpWafHeaderDetected: true,
      discoveredViaSubdomain: true
    });

    expect(candidate.score).toBe(0);
    expect(candidate.classification).toBe("cdn-proxy");
    expect(candidate.contradictionSignals.length).toBe(2);
    expect(candidate.explanation).toContain("cdn-proxy");
    expect(candidate.explanation).toContain("Cloudflare");
  });

  it("classifies shared hosting landing page correctly (shared-hosting)", () => {
    const candidate = scoreOriginCandidate({
      ip: "198.51.100.45",
      domain: "example.com",
      provider: "Namecheap",
      discoveredViaSubdomain: true,
      httpGenericLandingPage: true,
      tlsCertMismatch: true
    });

    expect(candidate.score).toBe(0);
    expect(candidate.classification).toBe("shared-hosting");
    expect(candidate.explanation).toContain("shared-hosting");
  });

  it("classifies email-only MX server correctly (email-only)", () => {
    const candidate = scoreOriginCandidate({
      ip: "142.250.180.27",
      domain: "example.com",
      provider: "Google LLC",
      asn: "AS15169",
      isMxIpOnly: true,
      isHistoricalIp: true
    });

    expect(candidate.classification).toBe("email-only");
    expect(candidate.explanation).toContain("email-only");
    expect(candidate.explanation).toContain("mail exchange");
  });

  it("classifies unverified subdomain leak correctly (unverified-leak)", () => {
    const candidate = scoreOriginCandidate({
      ip: "203.0.113.50",
      domain: "example.com",
      discoveredViaSubdomain: true,
      subdomainName: "old.example.com"
    });

    expect(candidate.score).toBe(20);
    expect(candidate.classification).toBe("unverified-leak");
  });
});
```

---

## 9. Conclusion & Implementation Guidance for Implementer

1. `src/server/engine/scoring.ts` should be created as a pure, deterministic engine module with zero side effects or asynchronous I/O calls.
2. All input data for scoring should be passed via `CandidateRawInput`.
3. Unit test coverage in `src/tests/scoring.test.ts` should achieve 100% path coverage for all 7 positive signals, 5 negative contradictions, 6 classifications, score clamping, and narrative generator templates.
