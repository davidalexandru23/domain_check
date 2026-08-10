# Handoff Report — Technical Survey of Backend Codebase (`domain_check`)

## 1. Observation

- **Core Entry Point**: Express server at `src/server/index.ts` listening on `serverConfig.port` (5105). Validates API requests via Zod (`scanRequestSchema`, line 19).
- **Scanner Orchestrator**: `src/server/scanner.ts` executes `runScan()`, calling modules:
  - `src/server/modules/domain.ts`: RDAP (`https://rdap.org/domain/`) with WHOIS fallback (`whois.ripe.net`, `whois.arin.net`, `whois.rotld.ro`).
  - `src/server/modules/dns.ts`: DNS A, AAAA, NS, MX, TXT, SOA, CAA, PTR, DS, DKIM selectors, AXFR, CT subdomains, bruteforcing.
  - `src/server/modules/ip.ts`: `http://ip-api.com/json/`, RDAP IP, PeeringDB IP profiling.
  - `src/server/modules/http.ts`: HTTP status, headers, Wappalyzer signatures, favicon Murmur3 hash, sensitive file paths, vhosts, QUIC.
  - `src/server/modules/infrastructure.ts`: RIPE Stat (`https://stat.ripe.net/data/routing-status` and `asn-neighbours`), PeeringDB, network lease signals (`leaseSignalsFor`).
  - `src/server/modules/active.ts`: `nmap` execution, banner grabbing, `traceroute`/`tracert`, TLS JARM fingerprinting.
- **Current Origin Candidate Sieve (`src/server/scanner.ts` lines 197-269)**:
  ```ts
  const orgName = (profile.asn.org ?? profile.networkName ?? "").toLowerCase();
  const isCdn = cdnKeywords.some(kw => orgName.includes(kw));
  if (!isCdn && orgName) {
      let confidence: "high" | "medium" | "low" = orgName.includes("hosting") || orgName.includes("cloud") ? "high" : "medium";
      ...
      origins.push({ ip, source: sourceMsg, provider: profile.asn.org ?? profile.networkName ?? "Unknown", confidence });
  }
  ```
- **Shared Data Models (`src/shared/types.ts`)**:
  - `OriginCandidate`: `{ ip: string; source: string; provider: string; confidence: "high" | "medium" | "low" }`.
  - `InfrastructureProvider`: `{ role: ...; name: string; evidence: SourceRef[]; confidence: ProviderConfidence }`.
- **Existing Test Execution**:
  - `npm run test` (`vitest run`): 6 tests total. 5 passed, **1 failed**.
    - Verbatim failure: `AssertionError: expected 99 to be 30` at `src/tests/parsers.test.ts:10:30`.
  - `npm run typecheck` (`tsc --noEmit`): Passed with 0 errors.
  - `npm run server:build` (`tsc -p tsconfig.server.json`): Passed with 0 errors.

---

## 2. Logic Chain

1. **Observation 1 & 3**: `scanner.ts` (lines 197-269) calculates `origins` by checking if `orgName` includes `cdnKeywords`. If false, it assigns `"high"` or `"medium"` string confidence and does a basic TLS socket check.
2. **Logic Step A**: This binary string check fails Requirement R1, which demands a weighted 0-100 evidence-based scoring engine capturing both supporting signals (+30 TLS, +25 HTTP) and contradictions (-30 CDN signature).
3. **Observation 3**: In `src/shared/types.ts`, `InfrastructureSupplyChain` and `OriginCandidate` use a single coarse `confidence` enum (`"high" | "medium" | "low"`).
4. **Logic Step B**: This violates Requirement R2, which requires explicit separation between domain ownership, IP allocation, ASN operation, network operation, hosting provider, application origin IP, and physical location.
5. **Observation 1**: `scanner.ts` currently fetches HTTP, TLS, traceroute, and Nmap sequentially/in parallel for all hosts without staging candidate generation.
6. **Logic Step C**: This violates Requirement R4, which requires a multi-stage performance pipeline (Passive discovery → Candidate generation → Cheap enrichment → Scoring → Expensive verification strictly on top candidates).
7. **Observation 4**: Running `npm run test` reveals a failing unit test in `src/tests/parsers.test.ts:10` (`maxDepth` expected 30, received 99).
8. **Logic Step D**: The test suite requires fixing line 10 of `src/tests/parsers.test.ts` (or updating `scanner.ts` clamp logic), and expanding unit test coverage for the new evidence engine.

---

## 3. Caveats

- **External API Rate Limits**: IP-API (`ip-api.com`), RIPE Stat (`stat.ripe.net`), and PeeringDB APIs are unauthenticated HTTP endpoints. Active or large-scale scanning will be throttled if rate limits are exceeded.
- **OS Dependency**: Commands `nmap`, `traceroute` (or `tracert`), `dig`, and `whois` depend on OS binary availability. If `nmap` is missing, `scanner.ts` falls back to Node.js `tcpProbe`.
- **Project Boundary Constraint**: Investigation was strictly read-only. No source code modifications were performed in `src/`. All findings are documented in `.agents/explorer_1/analysis.md` and `.agents/explorer_1/handoff.md`.

---

## 4. Conclusion

The `domain_check` backend is a Node.js/TypeScript application built on Express and Zod, with robust network collection primitives (DNS, HTTP, TLS, WHOIS, RDAP, RIPE, PeeringDB, Nmap, Traceroute). 

However, its correlation engine is currently rudimentary (binary `!isCdn` string check, coarse `"high" | "medium" | "low"` confidence enums, conflated ownership roles, and un-staged execution). 

To achieve full compliance with requirements R1-R6:
1. Refactor `src/shared/types.ts` to model 0-100 evidence structures, supporting signals, contradictions, and explicit role confidences.
2. Implement an Evidence & Contradiction Engine module (`src/server/modules/scoring.ts`).
3. Refactor `runScan` in `src/server/scanner.ts` into a 5-stage pipeline with separate MX vs Web origin categorization.
4. Update UI in `src/client/main.tsx` and the Documentation view.
5. Resolve the failing test in `src/tests/parsers.test.ts`.

---

## 5. Verification Method

- **Inspect Survey Reports**:
  - `view_file` on `/Users/davidalexandru/Downloads/domain_check/.agents/explorer_1/analysis.md`
  - `view_file` on `/Users/davidalexandru/Downloads/domain_check/.agents/explorer_1/handoff.md`
- **TypeScript Typecheck Command**:
  - Run `npm run typecheck` in `/Users/davidalexandru/Downloads/domain_check`. Expected exit code: `0`.
- **Unit Test Command**:
  - Run `npm run test` in `/Users/davidalexandru/Downloads/domain_check`. Observe 6 tests (1 failing test in `src/tests/parsers.test.ts:10`).
- **Server Build Command**:
  - Run `npm run server:build` in `/Users/davidalexandru/Downloads/domain_check`. Expected exit code: `0`.
