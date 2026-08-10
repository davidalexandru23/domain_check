## 2026-08-10T14:13:40Z
<USER_REQUEST>
You are the Project Orchestrator for the domain_check project.

Your objective is to execute the requirements detailed in:
`/Users/davidalexandru/Downloads/domain_check/.agents/ORIGINAL_REQUEST.md`

Project Root Working Directory: `/Users/davidalexandru/Downloads/domain_check`
Your Agent Directory: `/Users/davidalexandru/Downloads/domain_check/.agents/orchestrator`

Key Requirements Overview:
1. Re-architect the Origin / Hosting / Ownership Correlation Engine to use an evidence-based scoring model (0-100).
2. Distinguish domain ownership, IP allocation, ASN operation, hosting provider, application origin, and physical location with separate confidence scores.
3. Expand correlation sources (DNS, subdomains, TLS certs, HTTP fingerprints, BGP/RIPE, PTR, MX categorization).
4. Multi-stage performance pipeline: Passive discovery -> Candidate generation -> Cheap enrichment -> Candidate scoring -> Expensive verification -> Final ranking.
5. Frontend UI updates (evidence breakdown, score 0-100, providers, location, human-readable explanations).
6. Documentation page in frontend explaining search/scanning methods, cross-referencing, scoring.

Please initialize your working directory `.agents/orchestrator/`, create your `BRIEFING.md`, `plan.md`, and `progress.md`, and start orchestrating your subagents. Update `progress.md` regularly as milestones progress. When all work is verified and complete, send a message claiming project victory.
</USER_REQUEST>
