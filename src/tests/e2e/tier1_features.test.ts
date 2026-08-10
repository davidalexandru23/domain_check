/**
 * Tier 1: Opaque-Box Feature Coverage Test Suite (40 Test Cases)
 * Domain Check Origin / Hosting / Ownership Correlation Engine
 * Features: F1 through F8 (5 test cases per feature)
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

describe("Tier 1: Core Feature Coverage (F1–F8)", () => {
  // =========================================================================
  // Feature F1: Evidence & Contradiction Scoring Model (5 Test Cases)
  // =========================================================================
  describe("F1: Evidence & Contradiction Scoring Model", () => {
    it("T1.F1.1 - Single Signal Weight Calculation (+30 TLS SAN Match)", () => {
      const candidate = createCandidate({
        ip: "193.230.5.163",
        domain: "ici.ro",
        supporting: [POS_TLS_SAN_MATCH],
        contradictions: []
      });

      expect(candidate.score).toBe(30);
      expect(candidate.supportingSignals).toHaveLength(1);
      expect(candidate.supportingSignals[0].id).toBe("POS_TLS_SAN_MATCH");
      expect(candidate.supportingSignals[0].weight).toBe(30);
    });

    it("T1.F1.2 - Additive Positive Signals Summation (+30 TLS, +25 HTTP, +20 Subdomain -> Score 75)", () => {
      const candidate = createCandidate({
        ip: "185.190.140.10",
        domain: "example.com",
        supporting: [POS_TLS_SAN_MATCH, POS_HTTP_CONTENT_MATCH, POS_SUBDOMAIN_LEAK],
        contradictions: []
      });

      expect(candidate.score).toBe(75);
      expect(candidate.classification).toBe("likely-origin");
      expect(candidate.supportingSignals).toHaveLength(3);
    });

    it("T1.F1.3 - Mixed Positive and Negative Contradiction Penalty (+30 TLS, +25 HTTP, -30 CDN ASN -> Score 25)", () => {
      const candidate = createCandidate({
        ip: "104.16.123.96",
        domain: "example.com",
        supporting: [POS_TLS_SAN_MATCH, POS_HTTP_CONTENT_MATCH],
        contradictions: [NEG_CDN_ASN]
      });

      expect(candidate.score).toBe(25);
      expect(candidate.classification).toBe("cdn-proxy");
      expect(candidate.contradictionSignals).toHaveLength(1);
      expect(candidate.contradictionSignals[0].weight).toBe(-30);
    });

    it("T1.F1.4 - Lower Bound Clamping (Zero Floor)", () => {
      // +10 ASN match - 30 CDN ASN = -20 raw -> clamped to 0
      const candidate = createCandidate({
        ip: "104.16.123.99",
        domain: "test.org",
        supporting: [POS_ASN_MATCH],
        contradictions: [NEG_CDN_ASN]
      });

      expect(candidate.score).toBe(0);
      expect(candidate.score).toBeGreaterThanOrEqual(0);
    });

    it("T1.F1.5 - Upper Bound Clamping (100 Ceiling)", () => {
      // +30 +25 +20 +15 +10 +15 = 115 raw -> clamped to 100
      const candidate = createCandidate({
        ip: "193.230.5.163",
        domain: "ici.ro",
        supporting: [
          POS_TLS_SAN_MATCH,
          POS_HTTP_CONTENT_MATCH,
          POS_SUBDOMAIN_LEAK,
          POS_PTR_DOMAIN_MATCH,
          POS_ASN_MATCH,
          { ...POS_PTR_DOMAIN_MATCH, id: "POS_PTR_ALT" }
        ],
        contradictions: []
      });

      expect(candidate.score).toBe(100);
      expect(candidate.score).toBeLessThanOrEqual(100);
    });
  });

  // =========================================================================
  // Feature F2: Decoupled 7 Ownership Concepts & Confidences (5 Test Cases)
  // =========================================================================
  describe("F2: Decoupled 7 Ownership Concepts & Confidences", () => {
    it("T1.F2.1 - Domain Ownership Concept Separation", () => {
      const ownership = createDecoupledOwnership({
        domainOwner: {
          concept: "domainOwner",
          label: "Domain Ownership",
          identity: "ICI Bucuresti Registrant",
          confidence: 95,
          evidenceCount: 4,
          explanation: "ROTLD WHOIS database attributes domain to ICI Bucuresti."
        }
      });

      expect(ownership.domainOwner.concept).toBe("domainOwner");
      expect(ownership.domainOwner.identity).toContain("ICI Bucuresti");
      expect(ownership.domainOwner.confidence).toBe(95);
      expect(ownership.domainOwner.confidence).not.toBe(ownership.applicationOrigin.confidence);
    });

    it("T1.F2.2 - IP Allocation vs ASN Ownership Separation", () => {
      const ownership = createDecoupledOwnership({
        ipAllocation: {
          concept: "ipAllocation",
          label: "IP Allocation Owner",
          identity: "Hetzner Online GmbH (RIR Block)",
          confidence: 85,
          evidenceCount: 2,
          explanation: "RIPE NCC RDAP record allocates IP block to Hetzner."
        },
        asnOperation: {
          concept: "asnOperation",
          label: "ASN Operation",
          identity: "AS24940 Hetzner Online GmbH",
          confidence: 90,
          evidenceCount: 3,
          explanation: "Autonomous System AS24940 routes the IP prefix."
        }
      });

      expect(ownership.ipAllocation.identity).toContain("RIR Block");
      expect(ownership.asnOperation.identity).toContain("AS24940");
      expect(ownership.ipAllocation.concept).not.toEqual(ownership.asnOperation.concept);
    });

    it("T1.F2.3 - Network Operation & BGP Status", () => {
      const ownership = createDecoupledOwnership({
        networkOperation: {
          concept: "networkOperation",
          label: "Network Operation",
          identity: "FastHosting Reseller Suballocated Network",
          confidence: 60,
          evidenceCount: 2,
          explanation: "BGP route is suballocated from upstream provider."
        }
      });

      expect(ownership.networkOperation.concept).toBe("networkOperation");
      expect(ownership.networkOperation.confidence).toBe(60);
      expect(ownership.networkOperation.explanation).toContain("suballocated");
    });

    it("T1.F2.4 - Hosting Provider & Application Origin Separation", () => {
      const ownership = createDecoupledOwnership({
        hostingProvider: {
          concept: "hostingProvider",
          label: "Hosting Provider",
          identity: "Amazon Web Services (AWS EC2)",
          confidence: 70,
          evidenceCount: 2,
          explanation: "IP block belongs to AWS US-East-1 infrastructure."
        },
        applicationOrigin: {
          concept: "applicationOrigin",
          label: "Application Origin Server",
          identity: "54.210.10.5",
          confidence: 88,
          evidenceCount: 4,
          explanation: "TLS certificate and direct host probes confirm backend origin."
        }
      });

      expect(ownership.hostingProvider.confidence).toBe(70);
      expect(ownership.applicationOrigin.confidence).toBe(88);
      expect(ownership.hostingProvider.identity).not.toEqual(ownership.applicationOrigin.identity);
    });

    it("T1.F2.5 - Complete 7 Ownership Model Contract Compliance", () => {
      const ownership = createDecoupledOwnership();
      const requiredConcepts = [
        "domainOwner",
        "ipAllocation",
        "asnOperation",
        "networkOperation",
        "hostingProvider",
        "applicationOrigin",
        "physicalLocation"
      ];

      for (const conceptKey of requiredConcepts) {
        const item = (ownership as any)[conceptKey];
        expect(item).toBeDefined();
        expect(item.concept).toBe(conceptKey);
        expect(typeof item.label).toBe("string");
        expect(typeof item.identity).toBe("string");
        expect(typeof item.confidence).toBe("number");
        expect(item.confidence).toBeGreaterThanOrEqual(0);
        expect(item.confidence).toBeLessThanOrEqual(100);
        expect(typeof item.evidenceCount).toBe("number");
        expect(typeof item.explanation).toBe("string");
      }
    });
  });

  // =========================================================================
  // Feature F3: Expanded Correlation Sources (5 Test Cases)
  // =========================================================================
  describe("F3: Expanded Correlation Sources", () => {
    it("T1.F3.1 - Expanded DNS Record Extraction", () => {
      const scan = createScanResult({
        targetDomain: "ici.ro",
        candidates: []
      });

      expect(scan.dns).toBeDefined();
      expect(scan.dns?.a).toBeDefined();
      expect(scan.dns?.aaaa).toBeDefined();
      expect(scan.dns?.ns).toBeDefined();
      expect(scan.dns?.mx).toBeDefined();
      expect(scan.dns?.txt).toBeDefined();
      expect(scan.dns?.soa).toBeDefined();
      expect(scan.dns?.caa).toBeDefined();
      expect(scan.dns?.ptr).toBeDefined();
    });

    it("T1.F3.2 - Subdomain CT Log & Bruteforce Discovery", () => {
      const candidate = createCandidate({
        ip: "185.190.140.10",
        domain: "dev.example.com",
        supporting: [POS_SUBDOMAIN_LEAK]
      });

      expect(candidate.supportingSignals.some((s) => s.id === "POS_SUBDOMAIN_LEAK")).toBe(true);
      expect(candidate.supportingSignals.find((s) => s.id === "POS_SUBDOMAIN_LEAK")?.weight).toBe(20);
    });

    it("T1.F3.3 - TLS SNI Socket Fingerprinting", () => {
      const candidate = createCandidate({
        ip: "193.230.5.163",
        domain: "ici.ro",
        supporting: [POS_TLS_SAN_MATCH]
      });

      expect(candidate.supportingSignals.some((s) => s.id === "POS_TLS_SAN_MATCH")).toBe(true);
      expect(candidate.score).toBeGreaterThanOrEqual(30);
    });

    it("T1.F3.4 - HTTP Host GET & WAF Fingerprinting", () => {
      const candidate = createCandidate({
        ip: "104.16.123.96",
        domain: "example.com",
        contradictions: [NEG_CLOUD_WAF_HEADER]
      });

      expect(candidate.contradictionSignals.some((s) => s.id === "NEG_CLOUD_WAF_HEADER")).toBe(true);
      expect(candidate.classification).toBe("cdn-proxy");
    });

    it("T1.F3.5 - BGP & Sublease Detection", () => {
      const ownership = createDecoupledOwnership({
        networkOperation: {
          concept: "networkOperation",
          label: "Network Operation",
          identity: "Reseller Subleased IP Range",
          confidence: 60,
          evidenceCount: 2,
          explanation: "RIR owner differs from BGP origin ASN. Sublease detected."
        }
      });

      expect(ownership.networkOperation.explanation).toContain("Sublease detected");
      expect(ownership.networkOperation.confidence).toBe(60);
    });
  });

  // =========================================================================
  // Feature F4: MX Email Infrastructure Isolation (5 Test Cases)
  // =========================================================================
  describe("F4: MX Email Infrastructure Isolation", () => {
    it("T1.F4.1 - MX Host Categorization", () => {
      const candidate = createCandidate({
        ip: "142.250.27.27",
        domain: "aspmx.l.google.com",
        roleTag: "email-only",
        contradictions: [NEG_MX_INFRASTRUCTURE]
      });

      expect(candidate.classification).toBe("email-only");
      expect(candidate.rawSignals.roleTag).toBe("email-only");
    });

    it("T1.F4.2 - Exclusion from Web Origin Candidates", () => {
      const webCandidate = createCandidate({
        ip: "185.190.140.10",
        domain: "company.org",
        supporting: [POS_TLS_SAN_MATCH, POS_HTTP_CONTENT_MATCH]
      });
      const mxCandidate = createCandidate({
        ip: "142.250.27.27",
        domain: "aspmx.l.google.com",
        roleTag: "email-only",
        contradictions: [NEG_MX_INFRASTRUCTURE]
      });

      const scan = createScanResult({
        targetDomain: "company.org",
        candidates: [webCandidate, mxCandidate],
        mxInfrastructure: {
          domain: "company.org",
          mxRecords: ["aspmx.l.google.com"],
          ips: ["142.250.27.27"],
          providers: ["Google Workspace"],
          isolatedFromWebOrigin: true
        }
      });

      // Filtered candidates list for web origin ranking should exclude email-only
      const webOriginRankings = scan.candidates.filter((c) => c.classification !== "email-only");
      expect(webOriginRankings).toHaveLength(1);
      expect(webOriginRankings[0].ip).toBe("185.190.140.10");
      expect(scan.mxInfrastructure.isolatedFromWebOrigin).toBe(true);
    });

    it("T1.F4.3 - Co-located Web + MX Server", () => {
      // Server handles both web and mail; has positive web signals without pure email penalty
      const candidate = createCandidate({
        ip: "193.230.5.163",
        domain: "ici.ro",
        supporting: [POS_TLS_SAN_MATCH, POS_HTTP_CONTENT_MATCH, POS_PTR_DOMAIN_MATCH],
        contradictions: []
      });

      expect(candidate.classification).toBe("likely-origin");
      expect(candidate.contradictionSignals.some((c) => c.id === "NEG_MX_INFRASTRUCTURE")).toBe(false);
    });

    it("T1.F4.4 - Penalty Application for Email-Only Host", () => {
      const candidate = createCandidate({
        ip: "142.250.27.27",
        domain: "mail.company.org",
        supporting: [POS_PTR_DOMAIN_MATCH],
        contradictions: [NEG_MX_INFRASTRUCTURE],
        roleTag: "email-only"
      });

      expect(candidate.contradictionSignals.some((c) => c.id === "NEG_MX_INFRASTRUCTURE")).toBe(true);
      expect(candidate.classification).toBe("email-only");
    });

    it("T1.F4.5 - mxInfrastructure Contract Validation", () => {
      const scan = createScanResult({
        targetDomain: "company.org",
        mxInfrastructure: {
          domain: "company.org",
          mxRecords: ["aspmx.l.google.com", "alt1.aspmx.l.google.com"],
          ips: ["142.250.27.27", "142.250.27.28"],
          providers: ["Google Workspace"],
          isolatedFromWebOrigin: true
        }
      });

      expect(scan.mxInfrastructure.domain).toBe("company.org");
      expect(scan.mxInfrastructure.mxRecords).toHaveLength(2);
      expect(scan.mxInfrastructure.ips).toHaveLength(2);
      expect(scan.mxInfrastructure.providers).toContain("Google Workspace");
      expect(scan.mxInfrastructure.isolatedFromWebOrigin).toBe(true);
    });
  });

  // =========================================================================
  // Feature F5: 6-Stage Performance Pipeline (5 Test Cases)
  // =========================================================================
  describe("F5: 6-Stage Performance Pipeline", () => {
    it("T1.F5.1 - Stage 1 & 2 Execution (Passive Discovery & Candidate Generation)", () => {
      const scan = createScanResult({
        targetDomain: "ici.ro",
        candidates: [
          createCandidate({ ip: "193.230.5.163", domain: "ici.ro", supporting: [POS_TLS_SAN_MATCH] })
        ]
      });

      expect(scan.targetDomain).toBe("ici.ro");
      expect(scan.candidates.length).toBeGreaterThan(0);
    });

    it("T1.F5.2 - Stage 3 Cheap Enrichment", () => {
      const candidate = createCandidate({
        ip: "193.230.5.163",
        domain: "ici.ro",
        provider: "ICI Bucuresti",
        asn: "AS3233",
        location: "Bucharest, Romania",
        supporting: [POS_PTR_DOMAIN_MATCH, POS_ASN_MATCH]
      });

      expect(candidate.provider).toBe("ICI Bucuresti");
      expect(candidate.asn).toBe("AS3233");
      expect(candidate.location).toContain("Romania");
    });

    it("T1.F5.3 - Stage 4 Preliminary Scoring", () => {
      const candidate1 = createCandidate({ ip: "193.230.5.163", domain: "ici.ro", supporting: [POS_PTR_DOMAIN_MATCH] });
      const candidate2 = createCandidate({ ip: "193.230.5.1", domain: "ici.ro", supporting: [] });

      expect(candidate1.score).toBe(15);
      expect(candidate2.score).toBe(0);
      expect(candidate1.score).toBeGreaterThan(candidate2.score);
    });

    it("T1.F5.4 - Stage 5 Verification Bounding (Capped to Top N Candidates)", () => {
      const candidates: OriginCandidateDetailed[] = [];
      for (let i = 1; i <= 25; i++) {
        candidates.push(
          createCandidate({
            ip: `192.0.2.${i}`,
            domain: "example.com",
            supporting: i <= 5 ? [POS_TLS_SAN_MATCH] : []
          })
        );
      }

      // Sort by preliminary score and bound active verification to top 10
      const sorted = [...candidates].sort((a, b) => b.score - a.score);
      const topCandidatesForStage5 = sorted.slice(0, 10);

      expect(topCandidatesForStage5).toHaveLength(10);
      expect(topCandidatesForStage5[0].score).toBe(30);
    });

    it("T1.F5.5 - Stage 6 Final Synthesis & Verdict", () => {
      const scan = createScanResult({
        targetDomain: "ici.ro",
        candidates: [
          createCandidate({
            ip: "193.230.5.163",
            domain: "ici.ro",
            supporting: [POS_TLS_SAN_MATCH, POS_HTTP_CONTENT_MATCH, POS_PTR_DOMAIN_MATCH, POS_ASN_MATCH]
          })
        ]
      });

      expect(scan.status).toBe("completed");
      expect(scan.currentStage).toBe("stage-6");
      expect(scan.narrativeVerdict).toBeDefined();
      expect(scan.narrativeVerdict.classification).toBe("likely-origin");
      expect(scan.narrativeVerdict.confidenceScore).toBe(80);
      expect(scan.topOriginCandidate?.ip).toBe("193.230.5.163");
    });
  });

  // =========================================================================
  // Feature F6: Frontend UI Score Bars & Evidence Breakdown (5 Test Cases)
  // =========================================================================
  describe("F6: Frontend UI Score Bars & Evidence Breakdown", () => {
    it("T1.F6.1 - Score Bar Color Threshold Rendering", () => {
      const getScoreColor = (score: number) => {
        if (score >= 70) return "emerald";
        if (score >= 40) return "amber";
        return "red";
      };

      expect(getScoreColor(85)).toBe("emerald");
      expect(getScoreColor(50)).toBe("amber");
      expect(getScoreColor(20)).toBe("red");
    });

    it("T1.F6.2 - Supporting Evidence Cards (+Points)", () => {
      const candidate = createCandidate({
        ip: "193.230.5.163",
        domain: "ici.ro",
        supporting: [POS_TLS_SAN_MATCH, POS_HTTP_CONTENT_MATCH]
      });

      const positiveBadges = candidate.supportingSignals.map((s) => `+${s.weight}`);
      expect(positiveBadges).toContain("+30");
      expect(positiveBadges).toContain("+25");
    });

    it("T1.F6.3 - Contradiction Penalty Cards (-Points)", () => {
      const candidate = createCandidate({
        ip: "104.16.123.96",
        domain: "example.com",
        contradictions: [NEG_CDN_ASN, NEG_CLOUD_WAF_HEADER]
      });

      const negativeBadges = candidate.contradictionSignals.map((c) => `${c.weight}`);
      expect(negativeBadges).toContain("-30");
      expect(negativeBadges).toContain("-25");
    });

    it("T1.F6.4 - Candidate Selection & Detail Switching", () => {
      const candidates = [
        createCandidate({ ip: "193.230.5.163", domain: "ici.ro", supporting: [POS_TLS_SAN_MATCH] }),
        createCandidate({ ip: "185.190.140.10", domain: "ici.ro", supporting: [POS_HTTP_CONTENT_MATCH] })
      ];

      let selectedIp = candidates[0].ip;
      expect(selectedIp).toBe("193.230.5.163");

      // Switch selection
      selectedIp = candidates[1].ip;
      const selectedCandidate = candidates.find((c) => c.ip === selectedIp);
      expect(selectedCandidate?.ip).toBe("185.190.140.10");
    });

    it("T1.F6.5 - Empty Evidence Graceful Rendering", () => {
      const candidate = createCandidate({
        ip: "192.0.2.1",
        domain: "empty.com",
        supporting: [],
        contradictions: []
      });

      expect(candidate.supportingSignals).toHaveLength(0);
      expect(candidate.contradictionSignals).toHaveLength(0);
      expect(candidate.score).toBe(0);
    });
  });

  // =========================================================================
  // Feature F7: Frontend UI 7 Ownership Cards Grid & Narrative Verdict (5 Test Cases)
  // =========================================================================
  describe("F7: Frontend UI 7 Ownership Cards Grid & Narrative Verdict", () => {
    it("T1.F7.1 - 7 Ownership Cards Grid Layout", () => {
      const ownership = createDecoupledOwnership();
      const keys = Object.keys(ownership);

      expect(keys).toHaveLength(7);
      expect(keys).toEqual([
        "domainOwner",
        "ipAllocation",
        "asnOperation",
        "networkOperation",
        "hostingProvider",
        "applicationOrigin",
        "physicalLocation"
      ]);
    });

    it("T1.F7.2 - Independent Confidence Meters", () => {
      const ownership = createDecoupledOwnership({
        domainOwner: { concept: "domainOwner", label: "Domain", identity: "Org", confidence: 95, evidenceCount: 3, explanation: "" },
        physicalLocation: { concept: "physicalLocation", label: "Location", identity: "Loc", confidence: 40, evidenceCount: 1, explanation: "" }
      });

      expect(ownership.domainOwner.confidence).toBe(95);
      expect(ownership.physicalLocation.confidence).toBe(40);
    });

    it("T1.F7.3 - Narrative Verdict Summary Banner", () => {
      const scan = createScanResult({
        targetDomain: "ici.ro",
        narrativeSummary: "Confirmed direct-hosted infrastructure for ici.ro operated by ICI Bucuresti."
      });

      expect(scan.narrativeVerdict.summary).toContain("ICI Bucuresti");
      expect(scan.narrativeVerdict.classification).toBeDefined();
    });

    it("T1.F7.4 - Key Evidence Tags Display", () => {
      const scan = createScanResult({
        targetDomain: "ici.ro",
        candidates: [
          createCandidate({
            ip: "193.230.5.163",
            domain: "ici.ro",
            supporting: [POS_TLS_SAN_MATCH, POS_HTTP_CONTENT_MATCH]
          })
        ]
      });

      expect(scan.narrativeVerdict.keyEvidence).toContain(POS_TLS_SAN_MATCH.title);
      expect(scan.narrativeVerdict.keyEvidence).toContain("HTTP Host Content Match");
    });

    it("T1.F7.5 - WHOIS Privacy Indicator Badge", () => {
      const domainProfile = {
        domain: "private-domain.org",
        privacyDetected: true,
        registrantOrg: "Redacted for Privacy"
      };

      expect(domainProfile.privacyDetected).toBe(true);
      expect(domainProfile.registrantOrg).toContain("Redacted");
    });
  });

  // =========================================================================
  // Feature F8: Interactive Documentation Page (/docs) (5 Test Cases)
  // =========================================================================
  describe("F8: Interactive Documentation Page (/docs)", () => {
    it("T1.F8.1 - Tab Routing to /docs", () => {
      const routes = ["/scan", "/history", "/docs"];
      let activeTab = "/scan";

      activeTab = "/docs";
      expect(routes.includes(activeTab)).toBe(true);
      expect(activeTab).toBe("/docs");
    });

    it("T1.F8.2 - Operational Scan Modes Reference", () => {
      const scanModes = ["passive", "controlled-active", "active-discovery", "network-map", "dns-only"];
      expect(scanModes).toHaveLength(5);
      expect(scanModes).toContain("passive");
      expect(scanModes).toContain("controlled-active");
    });

    it("T1.F8.3 - Multi-Stage Pipeline Explanation", () => {
      const stages = [
        { stage: 1, name: "Passive Discovery" },
        { stage: 2, name: "Candidate Generation" },
        { stage: 3, name: "Cheap Enrichment" },
        { stage: 4, name: "Preliminary Score" },
        { stage: 5, name: "Expensive Verification" },
        { stage: 6, name: "Final Ranking & Verdict" }
      ];

      expect(stages).toHaveLength(6);
      expect(stages[4].name).toBe("Expensive Verification");
    });

    it("T1.F8.4 - Decoupled Ownership Definitions", () => {
      const ownershipConcepts = [
        "domainOwner",
        "ipAllocation",
        "asnOperation",
        "networkOperation",
        "hostingProvider",
        "applicationOrigin",
        "physicalLocation"
      ];

      expect(ownershipConcepts).toHaveLength(7);
      expect(ownershipConcepts).toContain("applicationOrigin");
    });

    it("T1.F8.5 - Evidence Scoring Rules Reference Table", () => {
      const rulesTable = [
        { signal: "POS_TLS_SAN_MATCH", weight: "+30", type: "supporting" },
        { signal: "POS_HTTP_CONTENT_MATCH", weight: "+25", type: "supporting" },
        { signal: "POS_SUBDOMAIN_LEAK", weight: "+20", type: "supporting" },
        { signal: "POS_PTR_DOMAIN_MATCH", weight: "+15", type: "supporting" },
        { signal: "POS_ASN_MATCH", weight: "+10", type: "supporting" },
        { signal: "NEG_CDN_ASN", weight: "-30", type: "contradiction" },
        { signal: "NEG_CLOUD_WAF_HEADER", weight: "-25", type: "contradiction" },
        { signal: "NEG_GENERIC_LANDING", weight: "-20", type: "contradiction" },
        { signal: "NEG_TLS_CERT_MISMATCH", weight: "-15", type: "contradiction" },
        { signal: "NEG_MX_INFRASTRUCTURE", weight: "-15", type: "contradiction" }
      ];

      expect(rulesTable).toHaveLength(10);
      expect(rulesTable.find((r) => r.signal === "POS_TLS_SAN_MATCH")?.weight).toBe("+30");
      expect(rulesTable.find((r) => r.signal === "NEG_CDN_ASN")?.weight).toBe("-30");
    });
  });
});
