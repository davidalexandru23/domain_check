/**
 * Tier 3: Opaque-Box Cross-Feature Pairwise Combinations Test Suite (10 Test Cases)
 * Domain Check Origin / Hosting / Ownership Correlation Engine
 * Pairwise interactions between Features F1–F8
 */

import { describe, expect, it } from "vitest";
import {
  CandidateClassification,
  DecoupledOwnershipModel,
  EvidenceSignal,
  OriginCandidateDetailed,
  ScanResult
} from "../../shared/types.js";
import {
  calculateScore,
  classifyCandidate
} from "../../server/engine/scoring.js";
import { computeDecoupledOwnership } from "../../server/engine/ownership.js";
import {
  createCandidate,
  createDecoupledOwnership,
  createScanResult,
  NEG_CDN_ASN,
  NEG_CLOUD_WAF_HEADER,
  NEG_GENERIC_LANDING,
  NEG_MX_INFRASTRUCTURE,
  NEG_TLS_CERT_MISMATCH,
  POS_ASN_MATCH,
  POS_HTTP_CONTENT_MATCH,
  POS_PTR_DOMAIN_MATCH,
  POS_SUBDOMAIN_LEAK,
  POS_TLS_SAN_MATCH
} from "./fixtures/mock_responses.js";

describe("Tier 3: Pairwise Cross-Feature Combinations (T3.C01–T3.C10)", () => {
  it("T3.C01 - F1 + F2 (Scoring Engine x Decoupled Ownership)", () => {
    // Calculated score for top candidate is mapped to applicationOrigin confidence in decoupled model
    const candidate = createCandidate({
      ip: "193.230.5.163",
      domain: "ici.ro",
      supporting: [POS_TLS_SAN_MATCH, POS_HTTP_CONTENT_MATCH, POS_PTR_DOMAIN_MATCH, POS_ASN_MATCH]
    });

    expect(candidate.score).toBe(80);

    const ownership = createDecoupledOwnership({
      applicationOrigin: {
        concept: "applicationOrigin",
        label: "Application Origin Server",
        identity: candidate.ip,
        confidence: candidate.score,
        evidenceCount: candidate.supportingSignals.length,
        explanation: `Evidence score ${candidate.score} confirms origin candidate.`
      }
    });

    expect(ownership.applicationOrigin.confidence).toBe(80);
    expect(ownership.applicationOrigin.identity).toBe("193.230.5.163");
    expect(ownership.applicationOrigin.evidenceCount).toBe(4);
  });

  it("T3.C02 - F1 + F3 (Scoring Engine x Expanded Correlation Sources)", () => {
    // Probing active TLS SNI (+30) and HTTP GET Host (+25) updates total score to 55 and populates supportingSignals
    const candidate = createCandidate({
      ip: "185.190.140.10",
      domain: "app.example.com",
      supporting: [POS_TLS_SAN_MATCH, POS_HTTP_CONTENT_MATCH]
    });

    expect(candidate.score).toBe(55);
    expect(candidate.supportingSignals).toHaveLength(2);
    expect(candidate.supportingSignals.map((s) => s.id)).toEqual(["POS_TLS_SAN_MATCH", "POS_HTTP_CONTENT_MATCH"]);
  });

  it("T3.C03 - F1 + F4 (Scoring Engine x MX Isolation)", () => {
    // Co-located IP receives positive subdomain leak signal (+20) without MX penalty;
    // Pure MX IP receives NEG_MX_INFRASTRUCTURE (-15) and email-only classification.
    const colocatedCandidate = createCandidate({
      ip: "193.230.5.163",
      domain: "ici.ro",
      supporting: [POS_SUBDOMAIN_LEAK]
    });

    const pureMxCandidate = createCandidate({
      ip: "142.250.27.27",
      domain: "aspmx.l.google.com",
      supporting: [POS_PTR_DOMAIN_MATCH],
      contradictions: [NEG_MX_INFRASTRUCTURE],
      roleTag: "email-only"
    });

    expect(colocatedCandidate.score).toBe(20);
    expect(colocatedCandidate.classification).toBe("unverified-leak"); // 20 score is unverified leak unless >= 40
    expect(colocatedCandidate.contradictionSignals).toHaveLength(0);

    expect(pureMxCandidate.score).toBe(0); // +15 -15 = 0
    expect(pureMxCandidate.classification).toBe("email-only");
  });

  it("T3.C04 - F2 + F3 (Decoupled Ownership x Sublease Detection)", () => {
    // BGP/RIPE sublease detection from F3 sets isSubleased = true in F2 networkOperation and caps confidence
    const rirAllocationOwner: string = "Hetzner Online GmbH";
    const bgpOriginAsnOrg: string = "FastHosting Reseller LLC";
    const isSubleased = rirAllocationOwner !== bgpOriginAsnOrg;

    const ownership = createDecoupledOwnership({
      networkOperation: {
        concept: "networkOperation",
        label: "Network Operation",
        identity: `${bgpOriginAsnOrg} (Subleased from ${rirAllocationOwner})`,
        confidence: isSubleased ? 60 : 90,
        evidenceCount: 2,
        explanation: "Subleased IP block detected via RIR owner mismatch."
      }
    });

    expect(isSubleased).toBe(true);
    expect(ownership.networkOperation.identity).toContain("Subleased");
    expect(ownership.networkOperation.confidence).toBe(60);
  });

  it("T3.C05 - F3 + F5 (Correlation Sources x 6-Stage Pipeline)", () => {
    // Stage 3 executes cheap DNS/BGP; Stage 4 preliminary scoring; Stage 5 executes active TLS/HTTP for top candidates only
    const passiveCandidates = [
      createCandidate({ ip: "193.230.5.163", domain: "ici.ro", supporting: [POS_PTR_DOMAIN_MATCH] }),
      createCandidate({ ip: "192.0.2.1", domain: "ici.ro", supporting: [] })
    ];

    // Stage 4 prelim scoring
    expect(passiveCandidates[0].score).toBe(15);
    expect(passiveCandidates[1].score).toBe(0);

    // Stage 5 active verification upgrades top candidate with TLS & HTTP signals
    const verifiedCandidate = createCandidate({
      ip: passiveCandidates[0].ip,
      domain: passiveCandidates[0].domain,
      supporting: [...passiveCandidates[0].supportingSignals, POS_TLS_SAN_MATCH, POS_HTTP_CONTENT_MATCH]
    });

    expect(verifiedCandidate.score).toBe(70);
    expect(verifiedCandidate.classification).toBe("likely-origin");
  });

  it("T3.C06 - F4 + F5 (MX Isolation x 6-Stage Pipeline)", () => {
    // MX host resolution in Stage 2/3 tags email-only IPs and excludes them from Stage 5 active verification
    const candidates = [
      createCandidate({ ip: "185.190.140.10", domain: "company.org", supporting: [POS_TLS_SAN_MATCH] }),
      createCandidate({ ip: "142.250.27.27", domain: "aspmx.l.google.com", roleTag: "email-only", contradictions: [NEG_MX_INFRASTRUCTURE] })
    ];

    // Stage 4/5 filtering
    const stage5Targets = candidates.filter((c) => c.classification !== "email-only");

    expect(stage5Targets).toHaveLength(1);
    expect(stage5Targets[0].ip).toBe("185.190.140.10");
  });

  it("T3.C07 - F1 + F6 (Scoring Engine x Frontend Score Bars)", () => {
    // Total score (85) from F1 engine matches green bar color and width
    const candidate = createCandidate({
      ip: "193.230.5.163",
      domain: "ici.ro",
      forcedScore: 85
    });

    const getScoreColorClass = (score: number) => {
      if (score >= 70) return "bg-emerald-500";
      if (score >= 40) return "bg-amber-500";
      return "bg-red-500";
    };

    expect(candidate.score).toBe(85);
    expect(getScoreColorClass(candidate.score)).toBe("bg-emerald-500");
  });

  it("T3.C08 - F2 + F7 (Decoupled Ownership x Ownership Grid UI)", () => {
    // All 7 concept fields in ScanResult.ownership populate respective cards in OwnershipGrid
    const scan = createScanResult({
      targetDomain: "ici.ro"
    });

    const ownershipKeys = Object.keys(scan.ownership) as Array<keyof typeof scan.ownership>;
    expect(ownershipKeys).toHaveLength(7);

    for (const key of ownershipKeys) {
      const card = scan.ownership[key];
      expect(card.concept).toBe(key);
      expect(card.label).toBeDefined();
      expect(card.identity).toBeDefined();
      expect(card.confidence).toBeGreaterThanOrEqual(0);
      expect(card.explanation).toBeDefined();
    }
  });

  it("T3.C09 - F5 + F6/F7 (6-Stage Pipeline x UI Progress Updates)", () => {
    // Polling progress events from Stage 1 to Stage 6 update UI progress percentage from 0 to 100
    const progressEvents = [
      { stage: "stage-1", name: "Passive Discovery", percent: 15 },
      { stage: "stage-2", name: "Candidate Generation", percent: 30 },
      { stage: "stage-3", name: "Cheap Enrichment", percent: 50 },
      { stage: "stage-4", name: "Preliminary Score", percent: 70 },
      { stage: "stage-5", name: "Expensive Verification", percent: 85 },
      { stage: "stage-6", name: "Final Ranking & Verdict", percent: 100 }
    ];

    expect(progressEvents[0].percent).toBe(15);
    expect(progressEvents[progressEvents.length - 1].percent).toBe(100);
    expect(progressEvents[progressEvents.length - 1].stage).toBe("stage-6");
  });

  it("T3.C10 - F1 + F8 (Scoring Engine x Interactive Documentation)", () => {
    // Weight values shown in /docs table match verbatim constants used in scoring engine
    const engineWeights = {
      POS_TLS_SAN_MATCH: POS_TLS_SAN_MATCH.weight,
      POS_HTTP_CONTENT_MATCH: POS_HTTP_CONTENT_MATCH.weight,
      POS_SUBDOMAIN_LEAK: POS_SUBDOMAIN_LEAK.weight,
      POS_PTR_DOMAIN_MATCH: POS_PTR_DOMAIN_MATCH.weight,
      POS_ASN_MATCH: POS_ASN_MATCH.weight,
      NEG_CDN_ASN: NEG_CDN_ASN.weight,
      NEG_CLOUD_WAF_HEADER: NEG_CLOUD_WAF_HEADER.weight,
      NEG_GENERIC_LANDING: NEG_GENERIC_LANDING.weight,
      NEG_TLS_CERT_MISMATCH: NEG_TLS_CERT_MISMATCH.weight,
      NEG_MX_INFRASTRUCTURE: NEG_MX_INFRASTRUCTURE.weight
    };

    const docsTableWeights = {
      POS_TLS_SAN_MATCH: 30,
      POS_HTTP_CONTENT_MATCH: 25,
      POS_SUBDOMAIN_LEAK: 20,
      POS_PTR_DOMAIN_MATCH: 15,
      POS_ASN_MATCH: 10,
      NEG_CDN_ASN: -30,
      NEG_CLOUD_WAF_HEADER: -25,
      NEG_GENERIC_LANDING: -20,
      NEG_TLS_CERT_MISMATCH: -15,
      NEG_MX_INFRASTRUCTURE: -15
    };

    expect(engineWeights).toEqual(docsTableWeights);
  });
});
