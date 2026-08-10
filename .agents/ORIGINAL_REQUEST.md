# Original User Request

## 2026-08-10T14:13:32Z

<USER_REQUEST>
# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Execution delegated to teamwork_preview

Re-architect the Origin / Hosting / Ownership Correlation Engine to use a sophisticated evidence-based scoring model (0-100), explicitly distinguishing between domain ownership, IP allocation, ASN operation, hosting provider, and physical location.

Working directory: /Users/davidalexandru/Downloads/domain_check
Integrity mode: development

## Requirements

### R1. Implement Evidence & Contradiction Engine
For each IP candidate, build an evidence structure capturing supporting signals (e.g. +30 TLS SAN match, +25 HTTP content match) and contradictions (e.g. -30 CDN signature). The final classification must not be a simple guess, but an explainable ranking of candidates with a detailed breakdown of evidence.

### R2. Separate Ownership Concepts & Confidences
Differentiate explicitly between: Domain ownership, IP ownership, ASN ownership, Network operation, Hosting provider, Application origin, and Physical infrastructure location. Confidence must be calculated separately for each (e.g., domainOwner confidence vs. originIp confidence).

### R3. Expand Correlation Sources
Correlate data across: expanded DNS records (A, AAAA, CNAME, MX, TXT, etc.), controlled subdomain discovery, TLS certificates (SAN, Issuer), HTTP/Host-header fingerprinting, BGP/RIPE discrepancies (subleased/reseller detection), and Reverse DNS (PTR). MX infrastructure must be categorized separately from web origins.

### R4. Multi-Stage Performance Pipeline
Implement a staged pipeline to prevent scanning the entire internet: Passive discovery → Candidate generation → Cheap enrichment → Candidate scoring → Expensive verification (only for top candidates) → Final ranking.

### R5. Deliverables & UI Updates
Provide a detailed architectural refactoring. The final output (including the frontend UI) must display the full context: Provider, ASN, Estimated Location, Classification (e.g. likely-origin, cdn, shared-hosting), detailed Supporting Evidence, Contradictions, and a human-readable explanation of the conclusion.

### R6. Documentation Page
Implement a secondary documentation page in the frontend that explicitly explains every search and scanning method, how the data points are cross-referenced, and how the evidence scoring system works.

## Acceptance Criteria

### Verification & Testing
- [ ] Code successfully distinguishes between domain ownership, hosting, and origin IP without conflating them into a single "owner" field.
- [ ] The engine correctly handles and explains a direct-hosted domain (high confidence origin).
- [ ] The engine correctly handles and explains a Cloudflare-proxied domain (detects CDN, doesn't claim CDN IP is the physical server).
- [ ] The engine correctly handles a domain with separate MX provider infrastructure.
- [ ] The UI successfully renders the new detailed evidence breakdown and score (0-100) instead of the old high/medium/low system.
</USER_REQUEST>
