# Handoff Report: Scoring Engine Requirements & Architecture

**Agent**: `m1_explorer_2`  
**Working Directory**: `/Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_2`  
**Date**: 2026-08-10  
**Target Files**: `src/server/engine/scoring.ts`, `src/tests/scoring.test.ts`  
**Analysis File**: `/Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_2/analysis.md`  

---

## 1. Observation

1. **Reference Specifications Reviewed**:
   - `ORIGINAL_REQUEST.md`: R1 (Evidence & Contradiction Engine with 0-100 score), R5 (UI evidence breakdown and narrative explanation).
   - `PROJECT.md`: Feature 1 (Evidence & Contradiction Scoring Model), Interface Contracts (`EvidenceSignal`, `OriginCandidateDetailed`, `CandidateClassification`).
   - `SCOPE.md`: Milestone 1 scope defining `src/server/engine/scoring.ts` and `src/tests/scoring.test.ts`.
   - `spec_analysis.md`: Section 3 (Scoring architecture & positive/negative signal tables), Section 3.4 (`ScoreClassification` & score breakdown).
   - `src/shared/types.ts`: `ScanResult`, `OriginCandidateDetailed`, `CandidateClassification`.

2. **Existing Code Base Structure**:
   - `src/shared/types.ts` contains `OriginCandidate` (legacy text confidence) and contracts for `OriginCandidateDetailed` with 0-100 score and supporting/contradiction signal arrays.
   - `src/tests/parsers.test.ts` shows unit test convention using `vitest` (`describe`, `it`, `expect`).
   - `src/server/engine/scoring.ts` does not exist yet and is scheduled for implementation in Milestone 1.

3. **Formula & Signal Matrix Requirements**:
   - Formula: $S = \max(0, \min(100, \sum P - \sum N))$.
   - Positive Signals (+Weights):
     - `POS_TLS_SAN_MATCH` (+30)
     - `POS_HTTP_CONTENT_MATCH` (+25)
     - `POS_SUBDOMAIN_LEAK` (+20)
     - `POS_PTR_DOMAIN_MATCH` (+15)
     - `POS_HISTORICAL_IP` (+15)
     - `POS_ASN_MATCH` (+10)
     - `POS_NON_CDN_PORT_OPEN` (+5)
   - Contradiction Signals (-Penalties):
     - `NEG_CDN_ASN` (-30)
     - `NEG_CLOUD_WAF_HEADER` (-25)
     - `NEG_GENERIC_LANDING` (-20)
     - `NEG_TLS_CERT_MISMATCH` (-15)
     - `NEG_MX_INFRASTRUCTURE` (-15)

4. **Candidate Classifications**:
   - `likely-origin` (Score $\ge 70$, no CDN proxy contradiction)
   - `possible-origin` (Score $40-69$, no CDN proxy contradiction)
   - `unverified-leak` (Score $< 40$, no CDN proxy contradiction)
   - `cdn-proxy` (`NEG_CDN_ASN` or `NEG_CLOUD_WAF_HEADER` active)
   - `shared-hosting` (`NEG_GENERIC_LANDING` active without high-confidence web match)
   - `email-only` (Pure MX host, `isMxIpOnly: true` without active web match)

---

## 2. Logic Chain

1. **From Observation 1 & 2**: The current codebase relies on legacy confidence strings (`"high" | "medium" | "low"`). To satisfy R1, `scoring.ts` must provide a deterministic function `scoreOriginCandidate(input: CandidateRawInput): OriginCandidateDetailed` that converts raw multi-source probes into numeric scores and typed signal lists.
2. **From Observation 3**: The scoring model $S = \max(0, \min(100, \sum P - \sum N))$ guarantees that positive signals (+120 max total) accumulate evidence while negative contradictions (-105 min total) pull scores down. Clamping ensures all scores remain within $0 \le S \le 100$.
3. **From Observation 4**: Simple score thresholds alone are insufficient to distinguish between a Cloudflare proxy (low score due to CDN penalty) and a pure MX mail server (low score due to MX role). Therefore, candidate classification requires a deterministic decision tree evaluated in strict order: Email-Only MX $\rightarrow$ CDN/WAF Proxy $\rightarrow$ Shared Hosting $\rightarrow$ Score Thresholds ($\ge 70 \rightarrow$ `likely-origin`, $40-69 \rightarrow$ `possible-origin`, $< 40 \rightarrow$ `unverified-leak`).
4. **From Observation 1 & 2**: The narrative generator function `generateCandidateExplanation(candidate: OriginCandidateDetailed): string` synthesizes natural language strings incorporating the classification, score, provider, location, and key supporting/contradiction factors to populate `candidate.explanation` for the React frontend UI (R5).
5. **From Observation 2 & 4**: A unit test suite in `src/tests/scoring.test.ts` using `vitest` will verify all formula edge cases (clamping at 0 and 100), all 6 candidate classifications, all 12 positive/negative signals, and narrative string generation.

---

## 3. Caveats

- **Active Probe Availability**: During passive-only scans, active verification signals (`POS_TLS_SAN_MATCH`, `POS_HTTP_CONTENT_MATCH`, `NEG_CLOUD_WAF_HEADER`) will be `undefined` or `false`. Passive leaks will naturally score around 20-50 (`unverified-leak` or `possible-origin`), which is by design until Stage 5 active verification runs.
- **Assumptions**: The scoring engine itself is pure and synchronous; network probe timeouts or missing WHOIS data are handled upstream in scanner modules before passing `CandidateRawInput` to `scoring.ts`.

---

## 4. Conclusion

`src/server/engine/scoring.ts` and `src/tests/scoring.test.ts` have a complete, unambiguous technical specification.
- The mathematical formula $S = \max(0, \min(100, \sum P - \sum N))$ is fully specified with 7 positive signals and 5 negative contradictions.
- The candidate classification decision tree resolves priority between `email-only`, `cdn-proxy`, `shared-hosting`, `likely-origin`, `possible-origin`, and `unverified-leak`.
- The human-readable narrative generator provides structured natural language summaries.
- A proposed code implementation and unit test strategy with 9 comprehensive test suites have been documented in `/Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_2/analysis.md`.

---

## 5. Verification Method

1. **Inspect Analysis Report**:
   - View `/Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_2/analysis.md` to confirm detailed signal matrices, mathematical formula, classification decision tree, proposed TypeScript code, and unit test strategy.
2. **Execute Unit Tests (Post-Implementation)**:
   - Run `npx vitest run src/tests/scoring.test.ts` after `implementer_1` writes `scoring.ts` and `scoring.test.ts`.
3. **Invalidation Conditions**:
   - If positive signal weights or contradiction penalties differ from the specified values (+30 TLS SAN, +25 HTTP, +20 Subdomain, +15 PTR, +15 Historical IP, +10 ASN, +5 Port; -30 CDN ASN, -25 WAF Header, -20 Generic Landing, -15 Cert Mismatch, -15 Email MX).
   - If candidate classification rules fail to evaluate CDN penalties before score thresholds.
