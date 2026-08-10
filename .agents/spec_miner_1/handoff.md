# Handoff Report — Correlation Engine Specification Mining

**Agent**: spec_miner_1  
**Role**: Specification Miner  
**Project**: domain_check — Correlation Engine Refactoring  
**Date**: 2026-08-10  
**Target Handoff File**: `/Users/davidalexandru/Downloads/domain_check/.agents/spec_miner_1/handoff.md`

---

## 1. Observation

Direct code and specification observations extracted from `/Users/davidalexandru/Downloads/domain_check/.agents/ORIGINAL_REQUEST.md` and the existing codebase (`src/shared/types.ts`, `src/server/scanner.ts`, `src/server/modules/infrastructure.ts`, `src/client/main.tsx`, `src/tests/parsers.test.ts`):

1. **Current Candidate Confidence Model**:
   - In `src/shared/types.ts:249-254`, `OriginCandidate` uses qualitative confidence values:
     ```typescript
     export type OriginCandidate = {
       ip: string;
       source: string;
       provider: string;
       confidence: "high" | "medium" | "low";
     };
     ```
   - In `src/server/scanner.ts:228-256`, confidence assignment uses simplistic heuristic logic without numerical weights:
     ```typescript
     let confidence: "high" | "medium" | "low" = orgName.includes("hosting") || orgName.includes("cloud") ? "high" : "medium";
     if (certMatch) {
       confidence = "high";
       sourceMsg = "DNS Leak + TLS Certificat Confirmat (100%)";
     }
     ```

2. **Current Infrastructure Ownership Conflation**:
   - In `src/shared/types.ts:170-184`, `InfrastructureSupplyChain` combines ownership into a single top-level `domainOwner` string and `verdict`:
     ```typescript
     export type InfrastructureSupplyChain = {
       domainOwner?: string;
       roleProviders: InfrastructureProvider[];
       ipChains: IpSupplyChain[];
       verdict: ...;
       confidence: ProviderConfidence;
     };
     ```
   - `ORIGINAL_REQUEST.md:21-22` explicitly requires separating Domain ownership, IP ownership, ASN ownership, Network operation, Hosting provider, Application origin, and Physical location into 7 distinct fields with separate confidence metrics.

3. **Expanded Correlation & MX Isolation Needs**:
   - In `src/server/scanner.ts:205-217`, MX exchange IPs are fetched and merged into `candidateIps` alongside subdomain IPs without explicitly categorizing them as mail infrastructure.
   - `ORIGINAL_REQUEST.md:24-25` explicitly states: *"MX infrastructure must be categorized separately from web origins."*

4. **Multi-Stage Performance Pipeline**:
   - In `src/server/scanner.ts:117-194`, network calls (DNS resolve, HTTP collection, TLS inspection, Nmap port scans) run in broad loops across all subdomains and IPs without active probing gatekeeper stages.
   - `ORIGINAL_REQUEST.md:27-28` requires a 6-stage pipeline: Passive discovery → Candidate generation → Cheap enrichment → Candidate scoring → Expensive verification (top candidates only) → Final ranking.

5. **UI & Documentation Requirements**:
   - In `src/client/main.tsx:207-265`, results render a qualitative string narrative and simple tables.
   - `ORIGINAL_REQUEST.md:30-35` requires 0–100 score rendering, supporting evidence lists (+weights), contradiction lists (-weights), decoupled ownership confidences, and an interactive documentation page detailing search parameters, cross-referencing logic, and evidence scoring rules.

---

## 2. Logic Chain

1. **Observation 1 & 2 $\rightarrow$ R1 & R2 Engine Requirements**:
   - Replacing qualitative `"high" | "medium" | "low"` strings with a deterministic 0–100 numerical scoring engine allows mathematically objective candidate ranking.
   - Decoupling ownership into 7 distinct concepts prevents misleading user outputs where an IP owner (e.g. Hetzner) or CDN operator (e.g. Cloudflare) is mislabeled as the domain owner (e.g. Registrant Org).

2. **Observation 3 $\rightarrow$ R3 Correlation Engine Enhancement**:
   - By creating a separate `email-only` classification tag for MX infrastructure, mail servers (e.g. Google Workspace, Microsoft 365) are cleanly isolated from web application origin leaks.
   - Adding active TLS SNI probes (`IP:443`) and HTTP GET requests with custom `Host` headers allows verification of backend origin servers bypassing front-facing WAFs.

3. **Observation 4 $\rightarrow$ R4 Multi-Stage Performance Pipeline**:
   - Running expensive TLS handshakes and HTTP probes against hundreds of candidate IPs is inefficient and slow.
   - Staging the pipeline into Passive $\rightarrow$ Candidates $\rightarrow$ Cheap Enrichment $\rightarrow$ Preliminary Score $\rightarrow$ Expensive Verification (Top 10 candidates only) $\rightarrow$ Final Ranking guarantees fast response times while preserving deep active probing capabilities for true origin candidates.

4. **Observation 5 $\rightarrow$ R5 & R6 UI & Documentation Deliverables**:
   - Updating `ScanResult` types to export `evidenceCandidates`, `ownershipModel`, and `narrativeVerdict` provides the frontend React application with structured data required for 0–100 score bars, positive/negative evidence breakdowns, and narrative summaries.
   - Adding a dedicated `/docs` component fulfills R6 by documenting scan modes, cross-referencing algorithms, and scoring rules for transparency.

---

## 3. Caveats

1. **Passive API Rate Limits**:
   - Public Certificate Transparency logs (`crt.sh`) and RIPE Stat APIs may occasionally throttle requests or time out. The pipeline must gracefully degrade and rely on local DNS bruteforcing and WHOIS fallback when APIs fail.
2. **Active Probing Limitations**:
   - Direct socket probes (`IP:443` TLS handshake and `Host` header HTTP GET) require open network connectivity. Firewalled origin servers blocking non-WAF IPs may return connection timeouts, resulting in lower active scores while retaining passive evidence signals.
3. **Read-Only Scope**:
   - As `spec_miner_1`, this analysis is strictly read-only and documents specifications in `spec_analysis.md` and `handoff.md`. Code changes will be executed by downstream implementation agents (`implementer_1`).

---

## 4. Conclusion

The specification mining for the `domain_check` Correlation Engine refactoring is complete. The detailed specification breakdown (`spec_analysis.md`) provides exact schemas, scoring weights (+30/-30 matrices), 7 decoupled ownership interfaces, a 6-stage performance pipeline design, UI component specifications, documentation requirements, and acceptance criteria test cases.

Key specification highlights ready for implementation:
- **R1**: Evidence Engine with score formula $S = \max(0, \min(100, \sum P - \sum N))$, supporting weights (+30 TLS SAN, +25 HTTP, +20 Subdomain, +15 PTR, +10 ASN), and contradiction penalties (-30 CDN ASN, -25 Cloud WAF header, -20 Generic page, -15 Cert mismatch).
- **R2**: Decoupled 7 ownership concepts (Domain, IP Allocation, ASN, Network Operation, Hosting Provider, Application Origin, Physical Location) with independent confidence metrics.
- **R3**: Expanded correlation across DNS records, TLS SNI, HTTP Host header, BGP/RIPE subleases, PTR, and separate MX email infrastructure isolation.
- **R4**: 6-stage multi-stage pipeline limiting active expensive probes to top candidates.
- **R5**: UI dashboard showing 0–100 score bar, positive/negative evidence lists, ownership grid, and narrative verdict.
- **R6**: Frontend documentation view explaining scan parameters, cross-referencing, and scoring tables.

---

## 5. Verification Method

To independently verify that the upcoming implementation conforms to these mined specifications, run the following verification steps:

1. **Unit Test Suite Execution**:
   Run the test command from the repository root:
   ```bash
   npm test
   ```
   *Expected outcome*: Vitest unit tests pass, verifying option clamping, lease signal classifications, evidence scoring calculations, and MX infrastructure isolation.

2. **TypeScript Compilation Check**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected outcome*: Zero compilation errors across `src/shared/types.ts`, `src/server/`, and `src/client/`.

3. **Scenario Functional Verification**:
   - **Direct-Hosted Domain Test** (`ici.ro` / direct server): Verifies score is 70-100, tagged `likely-origin`, with direct provider narrative.
   - **Cloudflare-Proxied Domain Test** (`cloudflare.com`): Verifies `-30` CDN penalty applies, tagged `cdn-proxy`, preventing CDN IP from being identified as physical origin.
   - **Separate MX Infrastructure Test**: Verifies MX IP addresses are isolated under `email-only` / `role: "email"` and excluded from web origin candidates.

4. **UI Visual Inspection**:
   Build and start the application:
   ```bash
   npm run build && npm run start:prod
   ```
   Open dashboard in browser (`http://localhost:5105`), run a scan, and verify:
   - 0–100 numerical score bar rendered.
   - Supporting evidence (+weights) and Contradiction (-weights) cards displayed.
   - 7 Decoupled Ownership Cards Grid rendered with independent confidences.
   - Secondary "Documentation & Parameters" page accessible and populated.
