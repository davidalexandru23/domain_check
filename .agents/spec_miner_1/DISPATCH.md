## 2026-08-10T14:13:54Z
You are spec_miner_1 (teamwork_preview_spec_miner) for the domain_check project.
Working Directory: /Users/davidalexandru/Downloads/domain_check/.agents/spec_miner_1

Your objective is to mine, analyze, and document all specification requirements for the domain_check Correlation Engine refactoring.

Instructions:
1. Read the original request at: `/Users/davidalexandru/Downloads/domain_check/.agents/ORIGINAL_REQUEST.md`
2. Mine specifications from `ORIGINAL_REQUEST.md` and any existing documentation, comments, API specs, or reference files in `/Users/davidalexandru/Downloads/domain_check`.
3. Extract precise requirements and specifications for:
   - R1: Evidence & Contradiction Engine (scoring model 0-100, positive weights e.g. +30 TLS SAN, +25 HTTP content, negative contradictions e.g. -30 CDN signature, candidate ranking, breakdown structure).
   - R2: Separate Ownership Concepts & Confidences (Domain ownership, IP ownership, ASN ownership, Network operation, Hosting provider, Application origin, Physical location, separate confidence scores).
   - R3: Expanded Correlation Sources (DNS records A, AAAA, CNAME, MX, TXT; subdomain discovery; TLS SAN/Issuer; HTTP/Host-header fingerprinting; BGP/RIPE subleased/reseller detection; PTR; separate MX categorization).
   - R4: Multi-Stage Performance Pipeline (Stage 1 Passive discovery -> Stage 2 Candidate generation -> Stage 3 Cheap enrichment -> Stage 4 Candidate scoring -> Stage 5 Expensive verification -> Stage 6 Final ranking).
   - R5: Deliverables & UI Updates (Provider, ASN, Estimated Location, Classification e.g. likely-origin, cdn, shared-hosting, Supporting Evidence, Contradictions, human-readable explanations).
   - R6: Documentation Page (explaining search/scan methods, cross-referencing, evidence scoring).
   - Acceptance Criteria (direct-hosted domain, Cloudflare-proxied domain, separate MX infrastructure, UI 0-100 score rendering).
4. Write your specification breakdown to `/Users/davidalexandru/Downloads/domain_check/.agents/spec_miner_1/handoff.md` and `spec_analysis.md`.
5. Report back when complete with your handoff summary.
