# Handoff Report: Opaque-Box E2E Test Suite Specification & Implementation Plan (Tiers 1-4)

**Agent**: explorer_e2e_1 (teamwork_preview_explorer)  
**Target Path**: `/Users/davidalexandru/Downloads/domain_check/.agents/explorer_e2e_1/handoff.md`  
**Date**: 2026-08-10  

---

## 1. Observation

### 1.1 Direct Source Evidence
The following files and parameters were inspected:

1. **`ORIGINAL_REQUEST.md`** (Lines 18–35):
   - **R1 (Evidence Engine)**: "For each IP candidate, build an evidence structure capturing supporting signals (e.g. +30 TLS SAN match, +25 HTTP content match) and contradictions (e.g. -30 CDN signature)."
   - **R2 (Decoupled Ownership)**: "Differentiate explicitly between: Domain ownership, IP ownership, ASN ownership, Network operation, Hosting provider, Application origin, and Physical infrastructure location."
   - **R3 (Correlation Sources)**: "Correlate data across: expanded DNS records... TLS certificates... HTTP/Host-header fingerprinting... BGP/RIPE discrepancies... MX infrastructure must be categorized separately."
   - **R4 (Multi-Stage Pipeline)**: "Implement a staged pipeline... Passive discovery -> Candidate generation -> Cheap enrichment -> Candidate scoring -> Expensive verification... -> Final ranking."
   - **R5 & R6 (Deliverables, UI & Docs)**: "UI must display full context... secondary documentation page in the frontend that explicitly explains every search and scanning method."

2. **`PROJECT.md`** (Lines 9–20 & Lines 53–57):
   - Inventory lists 8 core features:
     - **F1**: Evidence & Contradiction Scoring Model (0-100 Score $S = \max(0, \min(100, \sum P - \sum N))$).
     - **F2**: Decoupled 7 Ownership Concepts & Confidences.
     - **F3**: Expanded Correlation Sources (DNS, TLS SNI, HTTP Host, BGP/RIPE).
     - **F4**: MX Email Infrastructure Isolation.
     - **F5**: 6-Stage Multi-Stage Performance Pipeline.
     - **F6**: Frontend UI Score Bars & Evidence Breakdown.
     - **F7**: Frontend UI 7 Ownership Grid & Narrative Verdict.
     - **F8**: Interactive Documentation Page (`/docs`).
   - Test directory layout: `src/tests/e2e/`.

3. **`TEST_INFRA.md`** (Lines 8–39):
   - Mandates opaque-box & requirement-driven testing.
   - Prescribes four test files under `src/tests/e2e/`:
     - `src/tests/e2e/tier1_features.test.ts` (40 test cases: 8 features × 5 cases)
     - `src/tests/e2e/tier2_boundaries.test.ts` (40 test cases: 8 features × 5 cases)
     - `src/tests/e2e/tier3_combinations.test.ts` (10 pairwise test cases)
     - `src/tests/e2e/tier4_scenarios.test.ts` (5 real-world scenario tests)
   - Total required test cases: **95 test cases**.

4. **`package.json`** (Lines 15, 41):
   - `"test": "vitest run"`
   - `vitest`: `^2.1.0`

5. **`src/shared/types.ts`**:
   - `ScanResult`, `OriginCandidateDetailed`, `DecoupledOwnershipModel`, `EvidenceSignal`, `ScanMode`.

---

## 2. Logic Chain

From the observed requirements, contract specifications, and test infrastructure guidelines:
1. **Opaque-Box Testing Strategy**: Tests must interface exclusively with published data contracts (`ScanResult`, `OriginCandidateDetailed`, `DecoupledOwnershipModel`, `EvidenceItem`/`EvidenceSignal`) and exported top-level engine functions / Express server APIs. No private implementation internals will be assumed.
2. **Determinism & Mocking**: Active scanning involves network operations (DNS queries, TLS handshakes, HTTP GET requests, RDAP/RIPE REST endpoints). To guarantee fast, offline, and reproducible test execution under `npx vitest run src/tests/e2e`, all network interfaces will be exercised using deterministic mock fixtures and local test helpers.
3. **Structured Test Allocation**:
   - **Tier 1 (40 tests)**: Verifies core functionality for features F1 through F8 (5 tests per feature).
   - **Tier 2 (40 tests)**: Verifies boundary value conditions, error modes, score clamping, WHOIS privacy, and edge cases for features F1 through F8 (5 tests per feature).
   - **Tier 3 (10 tests)**: Verifies cross-feature interactions using pairwise combinations.
   - **Tier 4 (5 tests)**: Verifies end-to-end real-world infrastructure scenarios (Direct-Hosted, Cloudflare-Proxied, Separate MX, Shared Hosting, Subleased IP).

---

## 3. Explicit E2E Test Suite Specification & Implementation Plan

### 3.1 Test Directory & File Structure
```
src/tests/e2e/
├── fixtures/
│   ├── mock_responses.ts       # Standard mock payloads for DNS, TLS, HTTP, BGP
│   └── scenario_fixtures.ts    # Synthetic data for Tier 4 real-world workloads
├── helpers/
│   └── test_runner.ts          # Vitest helpers for executing engine & API scans
├── tier1_features.test.ts      # Tier 1: Feature Coverage (40 test cases)
├── tier2_boundaries.test.ts    # Tier 2: Boundary & Corner Cases (40 test cases)
├── tier3_combinations.test.ts  # Tier 3: Cross-Feature Combinations (10 test cases)
└── tier4_scenarios.test.ts     # Tier 4: Real-World Scenarios (5 test cases)
```

---

### 3.2 Tier 1: Feature Coverage Specifications (40 Test Cases)

#### Feature F1: Evidence & Contradiction Scoring Model (5 Test Cases)
- **`T1.F1.1` - Single Signal Weight Calculation**: Input 1 positive signal (`POS_TLS_SAN_MATCH` +30). Assert candidate `score = 30`.
- **`T1.F1.2` - Additive Positive Signals Summation**: Input `POS_TLS_SAN_MATCH` (+30), `POS_HTTP_CONTENT_MATCH` (+25), and `POS_SUBDOMAIN_LEAK` (+20). Assert total `score = 75` and `classification = "likely-origin"`.
- **`T1.F1.3` - Mixed Positive and Negative Contradiction Penalty**: Input `POS_TLS_SAN_MATCH` (+30), `POS_HTTP_CONTENT_MATCH` (+25), and `NEG_CDN_ASN` (-30). Assert total `score = 25` and `classification = "cdn-proxy"`.
- **`T1.F1.4` - Lower Bound Clamping (Zero Floor)**: Input negative signals exceeding positive signals (e.g. +10 ASN match - 30 CDN ASN = -20). Assert `score` clamps to exact `0`.
- **`T1.F1.5` - Upper Bound Clamping (100 Ceiling)**: Input positive signals totaling 120 (+30, +25, +20, +15, +15, +10, +5). Assert `score` clamps to exact `100`.

#### Feature F2: Decoupled 7 Ownership Concepts & Confidences (5 Test Cases)
- **`T1.F2.1` - Domain Ownership Concept Separation**: Assert `domainOwnership` object contains `domain`, `registrantOrg`, `privacyDetected`, and independent `confidence` (0-100%).
- **`T1.F2.2` - IP Allocation vs ASN Ownership Separation**: Input IP with RIR owner "Hetzner" and ASN owner "Hetzner Online GmbH". Assert `ipAllocation.allocationOwner` and `asnOwnership.orgName` are distinct typed fields.
- **`T1.F2.3` - Network Operation & BGP Status**: Input IP route data. Assert `networkOperation` includes `originAsn`, `isSubleased`, and independent `confidence`.
- **`T1.F2.4` - Hosting Provider & Application Origin Separation**: Assert `hostingProvider` (e.g. AWS) and `applicationOrigin` (e.g. 54.210.10.5) carry independent confidence scores and classifications.
- **`T1.F2.5` - Complete 7 Ownership Model Contract Compliance**: Validate that `ScanResult.ownership` contains all 7 concepts (`domainOwner`, `ipAllocation`, `asnOperation`, `networkOperation`, `hostingProvider`, `applicationOrigin`, `physicalLocation`) with labels, identities, confidence numbers, and evidence counts.

#### Feature F3: Expanded Correlation Sources (5 Test Cases)
- **`T1.F3.1` - Expanded DNS Record Extraction**: Input DNS mock returning A, AAAA, CNAME, MX, TXT, SOA, CAA, PTR. Assert all record types present in `ScanResult.dns`.
- **`T1.F3.2` - Subdomain CT Log & Bruteforce Discovery**: Input CT log records (`dev.example.com`). Assert candidate IP discovered via subdomain inherits `POS_SUBDOMAIN_LEAK` (+20).
- **`T1.F3.3` - TLS SNI Socket Fingerprinting**: Input matching TLS certificate on port 443. Assert `POS_TLS_SAN_MATCH` (+30) added to supporting evidence.
- **`T1.F3.4` - HTTP Host GET & WAF Fingerprinting**: Input HTTP probe with `Server: cloudflare`. Assert `NEG_CLOUD_WAF_HEADER` (-25) added to contradiction penalties.
- **`T1.F3.5` - BGP & Sublease Detection**: Input RIR owner mismatch vs origin ASN. Assert `networkOperation.isSubleased = true`.

#### Feature F4: MX Email Infrastructure Isolation (5 Test Cases)
- **`T1.F4.1` - MX Host Categorization**: Input MX record `aspmx.l.google.com`. Assert resolved IP classified with tag `email-only` / `role: "email"`.
- **`T1.F4.2` - Exclusion from Web Origin Candidates**: Input pure MX IP `142.250.27.27`. Assert IP is omitted from `candidates` web origin leak ranking.
- **`T1.F4.3` - Co-located Web + MX Server**: Input IP serving both port 80 HTTP and MX exchange. Assert IP is evaluated for web origin without pure email penalty.
- **`T1.F4.4` - Penalty Application for Email-Only Host**: Input candidate IP matching MX exchange only. Assert `NEG_MX_INFRASTRUCTURE` (-15) penalty applied if candidate is evaluated.
- **`T1.F4.5` - `mxInfrastructure` Contract Validation**: Assert `ScanResult.mxInfrastructure` populates `domain`, `mxRecords`, `ips`, `providers`, and `isolatedFromWebOrigin: true`.

#### Feature F5: 6-Stage Performance Pipeline (5 Test Cases)
- **`T1.F5.1` - Stage 1 & 2 Execution**: Assert Stage 1 (Passive Discovery) and Stage 2 (Candidate Gen) collect root DNS and subdomains.
- **`T1.F5.2` - Stage 3 Cheap Enrichment**: Assert Stage 3 resolves DNS, PTR, and ASN profiles without executing active port scans.
- **`T1.F5.3` - Stage 4 Preliminary Scoring**: Assert Stage 4 ranks candidate IPs using preliminary passive scores.
- **`T1.F5.4` - Stage 5 Verification Bounding**: Input 25 candidate IPs. Assert Stage 5 limits expensive active TLS/HTTP probes to top N (N <= 10) candidates.
- **`T1.F5.5` - Stage 6 Final Synthesis & Verdict**: Assert Stage 6 outputs final 0-100 scores, 7 ownership confidences, and natural language narrative verdict.

#### Feature F6: Frontend UI Score Bars & Evidence Breakdown (5 Test Cases)
- **`T1.F6.1` - Score Bar Color Threshold Rendering**: Test UI rendering of score 85 (emerald green), 50 (amber), and 20 (red).
- **`T1.F6.2` - Supporting Evidence Cards (+Points)**: Test rendering of supporting evidence list showing positive badges (e.g. `+30`, `+25`).
- **`T1.F6.3` - Contradiction Penalty Cards (-Points)**: Test rendering of contradiction penalties list showing negative badges (e.g. `-30`, `-25`).
- **`T1.F6.4` - Candidate Selection & Detail Switching**: Test UI state update when selecting candidate IP from ranking list.
- **`T1.F6.5` - Empty Evidence Graceful Rendering**: Test UI rendering when candidate has 0 supporting or 0 contradiction signals.

#### Feature F7: Frontend UI 7 Ownership Cards Grid & Narrative Verdict (5 Test Cases)
- **`T1.F7.1` - 7 Ownership Cards Grid Layout**: Assert UI renders grid with 7 distinct cards for Domain, IP, ASN, Network, Hosting, Origin, and Location.
- **`T1.F7.2` - Independent Confidence Meters**: Assert each card displays progress meter corresponding to its concept confidence score (0-100%).
- **`T1.F7.3` - Narrative Verdict Summary Banner**: Assert UI renders narrative summary banner highlighting key verdict conclusions.
- **`T1.F7.4` - Key Evidence Tags Display**: Assert narrative verdict box renders clickable/highlighted key evidence tags.
- **`T1.F7.5` - WHOIS Privacy Indicator Badge**: Assert domain ownership card displays privacy badge when `privacyDetected = true`.

#### Feature F8: Interactive Documentation Page (`/docs`) (5 Test Cases)
- **`T8.F8.1` - Tab Routing to `/docs`**: Assert clicking Docs tab changes active view to Documentation component.
- **`T8.F8.2` - Operational Scan Modes Reference**: Assert documentation view renders details for passive, controlled-active, active-discovery, network-map, and dns-only modes.
- **`T8.F8.3` - Multi-Stage Pipeline Explanation**: Assert documentation view renders step-by-step description of Stages 1-6.
- **`T8.F8.4` - Decoupled Ownership Definitions**: Assert documentation view explains the 7 ownership concepts.
- **`T8.F8.5` - Evidence Scoring Rules Reference Table**: Assert documentation renders reference table listing positive weights (+30, +25, +20, +15, +10) and negative penalties (-30, -25, -20, -15).

---

### 3.3 Tier 2: Boundary & Corner Case Specifications (40 Test Cases)

#### Feature F1 Boundaries (5 Test Cases)
- **`T2.B1.1` - Net Zero Score (0 Positive, 0 Negative)**: Unreachable IP with no DNS leaks -> Total score 0, classification `unverified-leak`.
- **`T2.B1.2` - Maximum Positive Score Clamping**: Score sum = 120 -> Clamped at 100, `likely-origin`.
- **`T2.B1.3` - Equal Positive and Negative Weights**: +30 TLS match - 30 CDN ASN = 0 net score -> Clamped at 0.
- **`T2.B1.4` - Classification Boundary Thresholds**:
  - Score = 70 -> `likely-origin`
  - Score = 69 -> `possible-origin`
  - Score = 40 -> `possible-origin`
  - Score = 39 -> `unverified-leak`
- **`T2.B1.5` - CDN Contradiction Override**: Candidate with score 75 having `NEG_CDN_ASN` (-30) -> Reclassified from `likely-origin` to `cdn-proxy`.

#### Feature F2 Boundaries (5 Test Cases)
- **`T2.B2.1` - Redacted WHOIS Privacy Service**: `domainOwner` registrant redacted -> Confidence = 10-20%, identity = "Redacted (Privacy Protected)".
- **`T2.B2.2` - Unannounced IP Address**: IP without BGP route -> `asnOperation` identity = "Unannounced / No BGP Route", confidence = 0%.
- **`T2.B2.3` - RFC 1918 Private IP Range**: IP = `10.0.0.1` -> `ipAllocation` flagged as "RFC 1918 Private Address", scan skips active network probes.
- **`T2.B2.4` - Anycast IP Network**: IP = `1.1.1.1` (Cloudflare Anycast) -> `physicalLocation` confidence = 40%, explanation = "Global Anycast Network".
- **`T2.B2.5` - Conflicting Ownership Strings**: RIR allocation owner "Hetzner" vs BGP origin AS "AWS" -> `networkOperation` flagged `suballocated`, confidence reduced to 60%.

#### Feature F3 Boundaries (5 Test Cases)
- **`T2.B3.1` - Zero Subdomains Discovered**: CT log & DNS yield 0 subdomains -> Scanner proceeds with root domain without throwing exception.
- **`T2.B3.2` - TLS Port 443 Timeout**: Connection to candidate `IP:443` times out (3000ms) -> TLS check marked unverified, `POS_TLS_SAN_MATCH` omitted, scan completes.
- **`T2.B3.3` - Wildcard Certificate Match**: Cert SAN `*.example.com` matched against candidate target `app.example.com` -> `POS_TLS_SAN_MATCH` (+30) awarded.
- **`T2.B3.4` - HTTP 301/302 Loop or 500 Error**: HTTP probe returns status 500 or redirect loop -> Error signature recorded gracefully without crashing pipeline.
- **`T2.B3.5` - PTR Returning Multiple Hostnames**: PTR lookup returns 3 hostnames -> Cross-checks all 3 for target domain match.

#### Feature F4 Boundaries (5 Test Cases)
- **`T2.B4.1` - Domain with Zero MX Records**: Domain has no MX records -> `mxInfrastructure.mxRecords = []`, `isolatedFromWebOrigin = true`.
- **`T2.B4.2` - Self-Hosted Mail (MX = Root A Record)**: MX points directly to web origin IP -> `isolatedFromWebOrigin = false`.
- **`T2.B4.3` - MX Host Resolving to 10+ IPs**: MX exchange resolves to 12 IPv4 addresses -> All 12 tagged `email-only` and excluded from origin candidates pool.
- **`T2.B4.4` - Invalid/Malformed MX Hostname**: MX hostname = `0 .` -> Handled gracefully as empty MX set.
- **`T2.B4.5` - Third-Party Email Provider**: MX = `*.mail.protection.outlook.com` -> Provider recognized as "Microsoft 365 Email".

#### Feature F5 Boundaries (5 Test Cases)
- **`T2.B5.1` - Extreme Candidate Generation (100+ IPs)**: 120 candidate IPs generated -> Stage 5 verification strictly capped to top 10 candidates.
- **`T2.B5.2` - Rate-Limiting Policy Execution**: `rateLimit = 500ms` -> Pipeline enforces minimum 500ms delay between active requests.
- **`T2.B5.3` - Stage 1 Primary DNS Failure**: Unresolvable domain name -> Pipeline emits `status: "failed"` with clean error message.
- **`T2.B5.4` - Passive Mode Pipeline Skip**: `mode = "passive"` -> Stage 5 active probes skipped entirely, Stage 4 scores promoted to final.
- **`T2.B5.5` - Concurrent Scan Job Isolation**: 5 parallel scans running simultaneously -> Store maintains complete isolation without cross-contamination.

#### Feature F6 Boundaries (5 Test Cases)
- **`T2.B6.1` - Candidate Score = 0 Rendering**: Score 0 -> Score bar renders 0% width with slate/red styling.
- **`T2.B6.2` - Candidate Score = 100 Rendering**: Score 100 -> Score bar renders 100% width with emerald green styling.
- **`T2.B6.3` - Zero Supporting Evidence Items**: Candidate has 0 positive items -> Renders "No supporting evidence observed".
- **`T2.B6.4` - Zero Contradiction Penalty Items**: Candidate has 0 negative items -> Renders "No contradiction penalties applied".
- **`T2.B6.5` - Text Overflow Prevention**: Very long provider name string -> Renders with CSS truncation (`truncate`) without breaking grid layout.

#### Feature F7 Boundaries (5 Test Cases)
- **`T2.B7.1` - 0% Concept Confidence Rendering**: Concept confidence = 0% -> Card renders "0% - None" badge.
- **`T2.B7.2` - 100% Concept Confidence Rendering**: Concept confidence = 100% -> Card renders "100% - High" badge.
- **`T2.B7.3` - Narrative Key Evidence Tag List (10+ Tags)**: 12 key evidence items -> UI renders scrollable/expandable tag container.
- **`T2.B7.4` - Fully Unknown Ownership Model**: All 7 concepts "Unknown" -> Renders gracefully with placeholder badges.
- **`T2.B7.5` - HTML Character Escaping in Narrative**: Narrative text containing `<script>` or `&` -> Escaped safely in React DOM.

#### Feature F8 Boundaries (5 Test Cases)
- **`T2.B8.1` - Unknown Documentation Tab Navigation**: Navigating to non-existent tab route -> Defaults safely to `/scan` or documentation index.
- **`T2.B8.2` - Complete Scoring Table Verification**: All 7 positive signals and 5 negative penalties rendered with exact weight labels.
- **`T2.B8.3` - Search/Filter Rules Table**: Filtering docs search input by "TLS" -> Filters table to show `POS_TLS_SAN_MATCH` and `NEG_TLS_CERT_MISMATCH`.
- **`T2.B8.4` - Mobile Viewport Responsiveness**: Viewport width 375px -> Documentation grid collapses cleanly to single column.
- **`T2.B8.5` - Offline Component Rendering**: Documentation component renders without requiring backend API state.

---

### 3.4 Tier 3: Cross-Feature Pairwise Combinations (10 Test Cases)

1. **`T3.C01` - F1 + F2 (Scoring Engine x Decoupled Ownership)**:
   - *Test*: Origin candidate score (e.g. 90) computed by F1 engine is mapped directly to `applicationOrigin.confidence` (90%) in F2 `DecoupledOwnershipModel`.
2. **`T3.C02` - F1 + F3 (Scoring Engine x Expanded Correlation Sources)**:
   - *Test*: Probing active TLS SNI (`+30`) and HTTP GET Host content (`+25`) from F3 updates the total score in F1 to 55 and populates `supportingSignals`.
3. **`T3.C03` - F1 + F4 (Scoring Engine x MX Isolation)**:
   - *Test*: IP serving both web and MX traffic receives `POS_SUBDOMAIN_LEAK` (+20) without triggering `NEG_MX_INFRASTRUCTURE` (-15), while pure MX IP triggers `NEG_MX_INFRASTRUCTURE` (-15) and classification `email-only`.
4. **`T3.C04` - F2 + F3 (Decoupled Ownership x Sublease Detection)**:
   - *Test*: BGP/RIPE sublease detection from F3 (`rirAllocationOwner !== asnOrg`) sets `isSubleased = true` in F2 `networkOperation` and caps confidence at 60%.
5. **`T3.C05` - F3 + F5 (Correlation Sources x 6-Stage Pipeline)**:
   - *Test*: Cheap DNS/BGP sources execute in Stage 3, preliminary scoring occurs in Stage 4, and expensive active TLS/HTTP probes from F3 are executed in Stage 5 for top candidates only.
6. **`T3.C06` - F4 + F5 (MX Isolation x 6-Stage Pipeline)**:
   - *Test*: MX host resolution occurs in Stage 2/3 and MX isolation removes `email-only` IPs from top candidates before Stage 5 active verification probes execute.
7. **`T3.C07` - F1 + F6 (Scoring Engine x Frontend Score Bars)**:
   - *Test*: Total score (e.g. 85) from F1 engine rendered in React UI `EvidenceBreakdown` matches emerald green color band and 85% progress width.
8. **`T3.C08` - F2 + F7 (Decoupled Ownership x Ownership Grid UI)**:
   - *Test*: All 7 concept fields in `ScanResult.ownership` populate their respective cards in `OwnershipGrid` with matching label, identity, confidence, and explanation.
9. **`T3.C09` - F5 + F6/F7 (6-Stage Pipeline x UI Progress Updates)**:
   - *Test*: SSE/polling progress events from Stage 1 to Stage 6 update frontend progress bar from 0% to 100% and render complete results upon completion.
10. **`T3.C10` - F1 + F8 (Scoring Engine x Interactive Documentation)**:
    - *Test*: Scoring weights displayed in `/docs` rule table match verbatim the weight constants defined in the F1 scoring engine (+30, +25, +20, +15, +10, -30, -25, -20, -15).

---

### 3.5 Tier 4: Real-World Application Scenarios (5 Test Cases)

1. **`T4.S01` - Direct-Hosted Domain Scenario (`ici.ro`)**:
   - *Setup*: Direct server IP `193.230.5.163`. TLS Subject CN `ici.ro` (`POS_TLS_SAN_MATCH` +30), HTTP title match (`POS_HTTP_CONTENT_MATCH` +25), PTR match `edu.gov.ro`/`ici.ro` (`POS_PTR_DOMAIN_MATCH` +15), ASN 3233 ICI Bucuresti (`POS_ASN_MATCH` +10). No CDN penalties.
   - *Assertions*: Candidate score = 80 (>=70). Classification = `likely-origin`. `domainOwner` confidence = 90%+, `applicationOrigin` confidence = 80%+. Narrative verdict explicitly cites direct infrastructure hosting by ICI Bucuresti.

2. **`T4.S02` - Cloudflare-Proxied Domain Scenario**:
   - *Setup*: Root A record resolves to `104.16.123.96` (AS13335 Cloudflare). HTTP probe returns `Server: cloudflare` & `CF-Ray` (`NEG_CLOUD_WAF_HEADER` -25). ASN is Cloudflare (`NEG_CDN_ASN` -30). Subdomain `dev.example.com` leaks IP `185.190.140.10` (Hetzner).
   - *Assertions*: Cloudflare IP `104.16.123.96` score = 0, classified as `cdn-proxy`. Narrative explains proxy protection. Hetzner leak IP `185.190.140.10` score = 85, classified as `likely-origin` leak candidate.

3. **`T4.S03` - Separate MX Infrastructure Scenario**:
   - *Setup*: Web traffic on CDN. MX records point to `aspmx.l.google.com` resolving to `142.250.27.27` (AS15169 Google LLC). HTTP probe on port 443 to Google IP times out/refused.
   - *Assertions*: Google IP `142.250.27.27` tagged `email-only` / `role: "email"`, excluded from web origin candidate ranking (`isolatedFromWebOrigin = true`). `mxInfrastructure` lists Google MX records and providers.

4. **`T4.S04` - Shared Hosting Domain Scenario**:
   - *Setup*: IP `192.241.150.10` (DigitalOcean). HTTP probe with `Host: smallbiz.org` returns default cPanel welcome page ("Welcome to cPanel") (`NEG_GENERIC_LANDING` -20). TLS cert mismatch (`NEG_TLS_CERT_MISMATCH` -15). Subdomain DNS leak (`POS_SUBDOMAIN_LEAK` +20).
   - *Assertions*: Net score = 0-25. Classified as `shared-hosting`. Narrative verdict explains shared hosting default landing page contradiction.

5. **`T4.S05` - Subleased / Reseller IP Space Scenario**:
   - *Setup*: Candidate IP `195.201.50.20`. RIR RDAP allocation owner is `Hetzner Online GmbH`, but BGP origin ASN org is `FastHosting Reseller LLC` and PeeringDB records indicate subleased space.
   - *Assertions*: `networkOperation.isSubleased = true`. `networkOperation` confidence = 60%. Narrative verdict highlights reseller/subleased network operation.

---

## 4. Caveats

1. **Read-Only Scope**: This report is an architectural test suite specification and plan. No test code files under `src/tests/e2e/` have been modified or created by this agent.
2. **Network Mocking Requirement**: Tier 4 tests model real-world scenarios (`ici.ro`, Cloudflare, Google MX, Hetzner subleased). When `implementer_e2e_1` implements these tests, active network sockets (DNS, TLS, HTTP, BGP) MUST use Vitest mocks (`vi.spyOn` or mock handlers) so `npm test` runs deterministically offline without flakiness or external API dependencies.
3. **Frontend Component Isolation**: UI test cases in Tiers 1-3 (F6, F7, F8) test React components (`EvidenceBreakdown`, `OwnershipGrid`, `Docs`) via pure props or Vitest jsdom rendering to guarantee fast unit/E2E test suite execution.

---

## 5. Conclusion

The specification for the opaque-box E2E test suite covering Tiers 1, 2, 3, and 4 is fully detailed, structured, and aligned with all requirements in `ORIGINAL_REQUEST.md`, `PROJECT.md`, `spec_analysis.md`, and `TEST_INFRA.md`.

- **Total Test Count**: **95 Test Cases**
  - **Tier 1**: 40 Test Cases (Features F1–F8)
  - **Tier 2**: 40 Test Cases (Boundaries & Edge Cases for F1–F8)
  - **Tier 3**: 10 Test Cases (Cross-Feature Pairwise Combinations)
  - **Tier 4**: 5 Test Cases (Real-World Scenarios)
- **Target Test Files**:
  - `src/tests/e2e/tier1_features.test.ts`
  - `src/tests/e2e/tier2_boundaries.test.ts`
  - `src/tests/e2e/tier3_combinations.test.ts`
  - `src/tests/e2e/tier4_scenarios.test.ts`

The implementation plan is actionable, complete, and ready for immediate execution by implementation agents (`implementer_e2e_1` or `implementer_1`).

---

## 6. Verification Method

To verify this plan independently:

1. **Verify File Location & Content**:
   ```bash
   ls -la /Users/davidalexandru/Downloads/domain_check/.agents/explorer_e2e_1/handoff.md
   ```
2. **Verify Test Suite Execution Command**:
   ```bash
   npx vitest run src/tests/e2e
   ```
   or
   ```bash
   npm test
   ```
3. **Invalidation Conditions**:
   - Total test count across Tiers 1-4 is less than 95.
   - Any of the 8 features (F1-F8) lacks 5 Tier 1 and 5 Tier 2 test cases.
   - Tier 4 omits any of the 5 required real-world scenarios (Direct-Hosted, Cloudflare-Proxied, Separate MX, Shared Hosting, Subleased IP).
   - Test files are placed outside `src/tests/e2e/`.
