# Technical Survey & Backend Architecture Analysis

## 1. Executive Summary

This report presents a technical survey of the `domain_check` (Domain ASM OSINT) backend codebase. The objective is to evaluate the existing system architecture, data models, Origin/Hosting/Ownership correlation mechanisms, external integrations, test suites, and identify necessary architectural changes to fulfill requirements R1 through R6.

---

## 2. Technology Stack & Execution Environment

- **Programming Language**: TypeScript (Node.js ES Modules, `"type": "module"`).
- **Backend Framework**: Express v5.1.0 with Node.js HTTP server and native WebSockets (`ws` v8.18.0).
- **Runtime & Execution**: `tsx` v4.19.0 for development watch mode (`npm run dev`), `tsc` v5.7.0 for compilation (`tsconfig.json`, `tsconfig.server.json`).
- **Validation**: Zod v3.25.0 (`scanRequestSchema` in `src/server/index.ts`).
- **OS-Level Tool Integrations**: Native `child_process.spawn` for `nmap`, `traceroute`/`tracert`, `dig` (for DNSSEC and AXFR), and `whois` (with RIPE, ARIN, RoTLD fallbacks).
- **Frontend Stack**: React 19.2.8, Vite 7.0.0, Tailwind CSS 3.4.17, Lucide React 0.468.0, and IndexedDB storage (`domain_asm_db`).
- **Build & Test Commands**:
  - `npm run test`: Vitest v2.1.0 (`vitest run`).
  - `npm run typecheck`: `tsc --noEmit`.
  - `npm run build`: `tsc --noEmit && vite build && tsc -p tsconfig.server.json`.
  - `npm run server:build`: `tsc -p tsconfig.server.json`.
  - `npm run dev`: `tsx watch src/server/index.ts`.
  - `npm run start:prod`: `node dist-server/server/index.js` (Port 5105).

---

## 3. Directory Layout & Module Structure

```
/Users/davidalexandru/Downloads/domain_check/
├── src/
│   ├── client/
│   │   ├── main.tsx          # Single-file React application (UI & dashboard)
│   │   └── styles.css        # Tailwind CSS styles & UI classes
│   ├── server/
│   │   ├── config.ts         # Environment settings & default ActiveOptions
│   │   ├── index.ts          # Express HTTP API & WebSocket server
│   │   ├── scanner.ts        # Core scan pipeline orchestrator (runScan)
│   │   ├── store.ts          # In-memory scan job store (scanStore)
│   │   ├── utils.ts          # Execution helpers, rate-limiting, normalization
│   │   └── modules/
│   │       ├── active.ts     # Port scanning (nmap/tcpProbe), banner grabbing, traceroute, TLS fingerprinting
│   │       ├── dns.ts        # Deep DNS resolution, subdomain bruteforce, AXFR, DKIM, takeover checks
│   │       ├── domain.ts     # RDAP domain lookups & WHOIS fallback parsing
│   │       ├── http.ts       # HTTP profiling, tech signatures, favicon hashing, sensitive path probing, vhosts
│   │       ├── infrastructure.ts # BGP routing status (RIPE Stat), PeeringDB, network lease signals, supply chain
│   │       ├── ip.ts         # IP-API geolocation, IP RDAP, PeeringDB IP profiling
│   │       └── passive.ts    # Certificate Transparency scraping (crt.sh)
│   ├── shared/
│   │   └── types.ts          # Shared TypeScript interfaces and domain models
│   └── tests/
│       └── parsers.test.ts   # Vitest unit tests for options and lease signals
├── test-domain.ts            # Ad-hoc test script for getDomainProfile
├── test-e2e.ts               # Ad-hoc test script for runScan
├── test-hash.ts              # Ad-hoc test script for MurmurHash3
├── test-jarm.ts              # Ad-hoc test script for TLS hashing
├── test-schema.ts            # Ad-hoc test script for Zod schema validation
├── test-whois.ts             # Ad-hoc test script for WHOIS fallback
├── index.html                # Vite HTML template
├── package.json              # Package manifest
├── tsconfig.json             # Client TypeScript configuration
├── tsconfig.server.json      # Server TypeScript configuration
└── vite.config.ts            # Vite bundler configuration
```

---

## 4. Architectural Survey of the Correlation Engine & Data Flow

### 4.1 Current Data Flow Pipeline (`src/server/scanner.ts`)

1. **Reconnaissance Phase**:
   - `getDomainProfile` (`domain.ts`): Queries `https://rdap.org/domain/{target}`. If missing, falls back to native `whois` queries against `whois.ripe.net`, `whois.arin.net`, and `whois.rotld.ro`.
   - `getDnsDeepScan` (`dns.ts`): Resolves A, AAAA, NS, MX, TXT, DMARC (`_dmarc.{domain}`), SOA, CAA, PTR, and DS records (`dig +short DS`).
   - `probeDkimSelectors` (`dns.ts`): Tests selectors `default`, `google`, `selector1`, `mail`, `dkim`.
   - `collectCtSubdomains` (`passive.ts`): Fetches SSL certificates from `https://crt.sh/?q=%.{target}&output=json`.
   - `discoverSubdomains` (`dns.ts`): Wordlist resolution (`www`, `mail`, `api`, `direct`, `origin`, etc.).
   - `probeAxfr` (`dns.ts`): Probes nameservers with `dig AXFR`.

2. **IP Profiling Phase**:
   - Resolves IPs for the primary domain, discovered subdomains, and MX exchange hosts using `dns.resolve4`.
   - Calls `getIpProfile` (`ip.ts`) for each unique IP:
     - `http://ip-api.com/json/{ip}` for country, city, coordinates, AS number, and org.
     - `https://rdap.org/ip/{ip}` for RIR allocation owner (`rirAllocationOwner`) and network name.
     - `dns.reverse(ip)` for PTR hostnames.
     - `https://www.peeringdb.com/api/net?asn={asn}` for PeeringDB metadata.

3. **HTTP & TLS Posture Phase**:
   - `collectHttp` (`http.ts`): Requests HTTP/HTTPS endpoints for top hosts. Evaluates headers, cookies, Wappalyzer signatures (WordPress, React, Vue, Next.js, PHP, Express, Nginx, Apache, Cloudflare), `favicon.ico` MurmurHash3 hash, sensitive file paths (`/.env`, `/.git/config`), vhost responses (`internal.{domain}`, `localhost`), and QUIC UDP/443 probe.
   - `inspectTls` (`http.ts`): Connects via TLS socket to extract certificate validity, issuer, subject, and Subject Alternative Names (SAN).

4. **Infrastructure Supply Chain Mapping (`infrastructure.ts`)**:
   - Enriches IPs via RIPE Stat API (`https://stat.ripe.net/data/routing-status` and `asn-neighbours`).
   - Evaluates `leaseSignalsFor(ip, domainOwner)`:
     - `in-house`: Domain owner matches ASN/allocation owner.
     - `cdn-proxy` / `direct-provider`: Based on `providerType` (`cloud`, `cdn`, `enterprise`, `isp`).
     - `subleased`: RIR allocation owner differs from ASN owner.
     - `suballocated`: Observed BGP origin differs from IP enrichment ASN.
   - Synthesizes `verdict`: `"In-house infrastructure"`, `"Direct provider"`, `"CDN/proxy provider"`, `"Hosted by reseller"`, `"Likely subleased network"`, or `"Unknown, insufficient public evidence"`.

5. **Legacy Origin Candidate Filtering (`scanner.ts` lines 197-269)**:
   - Gathers IP candidates from DNS A records, subdomains, and MX records.
   - Checks if ASN org or network name contains known CDN keywords (`cloudflare`, `akamai`, `fastly`, `incapsula`, `sucuri`, `imperva`, `ddos-guard`).
   - If NOT a CDN, flags IP as origin candidate with binary confidence (`"high"` if org contains `"hosting"`/`"cloud"` or TLS cert matches; otherwise `"medium"`).
   - Produces `OriginCandidate`: `{ ip: string; source: string; provider: string; confidence: "high" | "medium" | "low" }`.

---

## 5. Identification of Architectural Deficiencies & Requirement Gaps

### Gap 1: Absence of Evidence & Contradiction Scoring Engine (R1 Violation)
- **Current State**: Candidate IPs are filtered by a simple string check (`!isCdn`). Confidence is a coarse enum (`"high" | "medium" | "low"`).
- **Required State**: An explicit 0-100 numerical scoring engine. For each candidate IP, positive evidence (e.g. +30 TLS SAN match, +25 HTTP content/title match, +20 PTR match) and negative contradictions (e.g. -30 CDN signature, -40 Cloudflare IP range, -20 MX-only infrastructure) must be computed with a detailed breakdown of evidence strings.

### Gap 2: Conflation of Ownership Concepts (R2 Violation)
- **Current State**: `InfrastructureSupplyChain` merges domain owner, hosting, and ASN into a single top-level `confidence: ProviderConfidence`.
- **Required State**: Explicit separate confidence scores and metadata for:
  - `domainOwner` confidence
  - `originIp` confidence
  - `ipOwnership` / IP allocation
  - `asnOwnership` / ASN operation
  - `hostingProvider` / Infra operator
  - `physicalLocation` (Geo, DC, PeeringDB facility)
  - `applicationOrigin` vs `emailInfrastructure`

### Gap 3: Fragmented & Mixed Correlation Sources (R3 Violation)
- **Current State**: MX infrastructure IPs are mixed into candidate origin IPs without separate categorization. Subdomain discovery, TLS SAN inspection, BGP/RIPE discrepancies, and PTR lookups are executed in isolated steps without unified cross-referencing.
- **Required State**: Systematically cross-reference expanded DNS (A, AAAA, CNAME, MX, TXT, SOA), TLS SAN & Issuer, HTTP Host-headers & fingerprints, PTR reverse DNS, and BGP/RIPE reseller/sublease signals. Categorize MX infrastructure separately from web origins.

### Gap 4: Missing Multi-Stage Performance Pipeline (R4 Violation)
- **Current State**: Scans execute heavy network lookups in flat parallel/sequential loops without candidate funneling.
- **Required State**: Implement a 5-stage pipeline:
  1. Passive Discovery
  2. Candidate Generation
  3. Cheap Enrichment (DNS, PTR, ASN)
  4. Candidate Scoring (0-100 initial ranking)
  5. Expensive Verification (TLS socket probes, HTTP header probes strictly for top candidates)

### Gap 5: UI & Documentation Inefficiencies (R5 & R6 Violation)
- **Current State**:
  - `main.tsx` renders a single paragraph narrative (lines 207-240) and `"high" | "medium" | "low"` tables.
  - `Documentation` component in `main.tsx` (lines 306-404) explains search checkboxes, but lacks technical documentation on scoring models, cross-referencing, and scanning mechanisms.
- **Required State**:
  - UI must display: Provider, ASN, Estimated Location, Classification (likely-origin, cdn, shared-hosting), Supporting Evidence breakdown, Contradiction breakdown, 0-100 score, and human-readable explanations.
  - Frontend Documentation page detailing all search & scan methods, cross-referencing logic, and evidence scoring weights.

---

## 6. Test Suite & Code Integrity Evaluation

### Unit Test Execution
Running `npm run test` executes `vitest run` against `src/tests/parsers.test.ts`.
- **Current Result**: 6 total tests; 5 passed, **1 failed**.
- **Failure Detail**:
  - Location: `src/tests/parsers.test.ts:10:30`
  - Expected `options.maxDepth` to be `30`, but received `99`.
  - Cause: `scanner.ts:36` clamps `maxDepth` using `Math.min(Math.max(0, merged.maxDepth), 10000)`, whereas the test expected it to be clamped to `30`.

### Typecheck & Server Build
- `npm run typecheck` (`tsc --noEmit`) passes cleanly with **0 errors**.
- `npm run server:build` (`tsc -p tsconfig.server.json`) compiles server code cleanly to `dist-server/`.

---

## 7. Strategic Recommendations for Implementation

1. **Refactor Shared Types (`src/shared/types.ts`)**:
   - Define `EvidenceItem` `{ type: "supporting" | "contradiction"; scoreDelta: number; signal: string; detail: string; source: SourceRef }`.
   - Update `OriginCandidate` to include `score: number` (0-100), `classification: "likely-origin" | "cdn" | "shared-hosting" | "unknown"`, `supportingEvidence: EvidenceItem[]`, `contradictions: EvidenceItem[]`, `explanation: string`.
   - Extend `OwnershipProfile` to separate domain ownership, IP allocation, ASN operation, hosting provider, application origin, and physical location.

2. **Build Evidence Scoring Engine (`src/server/modules/scoring.ts`)**:
   - Implement rule-based scoring function evaluating positive signals (+30 TLS SAN, +25 HTTP response match, +20 PTR match, +15 direct A record) and negative signals (-40 Cloudflare/CDN IP range, -30 CDN server header, -20 MX-only host).
   - Ensure score is clamped between 0 and 100 with clear evidence trails.

3. **Implement Staged Pipeline in `scanner.ts`**:
   - Implement 5-stage pipeline to optimize network throughput and prevent scanning unnecessary targets.

4. **Update Unit Test Suite**:
   - Resolve the discrepancy in `parsers.test.ts` regarding `maxDepth` clamping and add comprehensive unit tests for the evidence scoring engine.
