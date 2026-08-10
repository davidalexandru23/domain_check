## 2026-08-10T14:15:15Z
You are m1_explorer_2.
Working Directory: /Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_2

Read the following reference documents:
1. /Users/davidalexandru/Downloads/domain_check/.agents/ORIGINAL_REQUEST.md
2. /Users/davidalexandru/Downloads/domain_check/.agents/orchestrator/PROJECT.md
3. /Users/davidalexandru/Downloads/domain_check/.agents/m1_orch/SCOPE.md
4. /Users/davidalexandru/Downloads/domain_check/.agents/spec_miner_1/spec_analysis.md
5. Existing code: /Users/davidalexandru/Downloads/domain_check/src/shared/types.ts

Investigate the requirements for `src/server/engine/scoring.ts` and `src/tests/scoring.test.ts`.
Specifically focus on:
- Deterministic 0-100 evidence scoring model formula: $S = \max(0, \min(100, \sum P - \sum N))$.
- Positive signals matrix (+30 TLS SAN, +25 HTTP content, +20 Subdomain leak, +15 PTR match, +15 Historical IP, +10 ASN match, +5 Non-CDN port open).
- Negative contradiction signals matrix (-30 CDN ASN, -25 Cloud WAF header, -20 Generic landing page, -15 TLS cert mismatch, -15 Email-only MX).
- Candidate classification logic (`likely-origin`, `possible-origin`, `unverified-leak`, `cdn-proxy`, `shared-hosting`, `email-only`).
- Human-readable narrative explanation generator function.
- Unit test strategy in `src/tests/scoring.test.ts`.

Write your detailed analysis report to `/Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_2/analysis.md` and deliver a handoff report at `/Users/davidalexandru/Downloads/domain_check/.agents/m1_explorer_2/handoff.md`.
