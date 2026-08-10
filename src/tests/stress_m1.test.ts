import { describe, expect, it } from "vitest";
import {
  calculateScore,
  classifyCandidate,
  evaluateSignals,
  scoreOriginCandidate
} from "../server/engine/scoring.js";
import { computeDecoupledOwnership } from "../server/engine/ownership.js";

describe("Milestone 1 Stress Test Harness - Scoring Engine", () => {
  describe("1. Score Clamping & Extreme Weights", () => {
    it("clamps extreme positive weight sums (+10000) to 100", () => {
      const score = calculateScore(
        [{ id: "S1", type: "supporting", category: "dns", weight: 10000, title: "Extreme Pos", description: "" }],
        []
      );
      expect(score).toBe(100);
    });

    it("clamps extreme negative weight sums (-10000) to 0", () => {
      const score = calculateScore(
        [],
        [{ id: "C1", type: "contradiction", category: "asn", weight: -10000, title: "Extreme Neg", description: "" }]
      );
      expect(score).toBe(0);
    });

    it("handles mixed extreme weights correctly (+500, -450 => 50)", () => {
      const score = calculateScore(
        [{ id: "S1", type: "supporting", category: "dns", weight: 500, title: "Pos", description: "" }],
        [{ id: "C1", type: "contradiction", category: "asn", weight: -450, title: "Neg", description: "" }]
      );
      expect(score).toBe(50);
    });

    it("handles zero weights without error", () => {
      const score = calculateScore(
        [{ id: "S1", type: "supporting", category: "dns", weight: 0, title: "Zero Pos", description: "" }],
        [{ id: "C1", type: "contradiction", category: "asn", weight: 0, title: "Zero Neg", description: "" }]
      );
      expect(score).toBe(0);
    });
  });

  describe("2. Complex Signal Combinations", () => {
    it("handles CDN ASN + TLS SAN match (CDN penalty overrides classification)", () => {
      const candidate = scoreOriginCandidate({
        ip: "104.16.1.1",
        domain: "example.com",
        isCdnAsn: true,
        asn: "AS13335",
        tlsSanMatch: true
      });
      // Supporting: +30, Contradiction: -30 => score 0
      expect(candidate.score).toBe(0);
      expect(candidate.classification).toBe("cdn-proxy");
    });

    it("handles pure MX IP with HTTP match (HTTP match prevents email-only classification)", () => {
      const candidate = scoreOriginCandidate({
        ip: "192.0.2.1",
        domain: "example.com",
        isMxIpOnly: true,
        httpContentMatch: true
      });
      // Supporting: +25, Contradiction: -15 => score 10
      expect(candidate.score).toBe(10);
      // Because hasWebMatch is true, it is NOT email-only. Score < 40 => unverified-leak
      expect(candidate.classification).toBe("unverified-leak");
    });

    it("handles pure MX IP with TLS SAN match + subdomain leak (high web evidence)", () => {
      const candidate = scoreOriginCandidate({
        ip: "192.0.2.1",
        domain: "example.com",
        isMxIpOnly: true,
        tlsSanMatch: true,
        discoveredViaSubdomain: true,
        httpContentMatch: true
      });
      // Supporting: 30 + 20 + 25 = 75, Contradiction: -15 => score 60
      expect(candidate.score).toBe(60);
      expect(candidate.classification).toBe("possible-origin");
    });

    it("checks WHOIS privacy org matching RIR allocation owner (privacy orgs filtered out)", () => {
      const candidate = scoreOriginCandidate({
        ip: "192.0.2.10",
        domain: "example.com",
        registrantOrg: "WhoisGuard Protected",
        rirAllocationOwner: "WhoisGuard Protected Inc"
      });
      // POS_ASN_MATCH should NOT match privacy protection proxy
      const posAsnMatch = candidate.supportingSignals.find((s) => s.id === "POS_ASN_MATCH");
      expect(posAsnMatch).toBeUndefined();
      expect(candidate.score).toBe(0);
    });

    it("handles empty domain string in evaluateSignals (empty domain does NOT match PTR)", () => {
      const { supporting } = evaluateSignals({
        ip: "192.0.2.1",
        domain: "",
        ptrHostname: "host.example.com"
      });
      // empty string domain should not trigger POS_PTR_DOMAIN_MATCH
      const ptrSignal = supporting.find((s) => s.id === "POS_PTR_DOMAIN_MATCH");
      expect(ptrSignal).toBeUndefined();
    });
  });

  describe("3. Edge Cases in 7 Decoupled Ownership Calculations", () => {
    it("TEST BUG A: Default candidate values (Unknown ASN & Unknown Provider) in calculateAsnOperation", () => {
      const candidate = scoreOriginCandidate({
        ip: "192.0.2.1",
        domain: "example.com"
      });
      // candidate.asn is "Unknown ASN", candidate.provider is "Unknown Provider"
      expect(candidate.asn).toBe("Unknown ASN");
      expect(candidate.provider).toBe("Unknown Provider");

      const model = computeDecoupledOwnership({
        topCandidate: candidate
      });

      // Let's inspect what asnOperation produced:
      console.log("ASN Operation for default candidate:", model.asnOperation);
      console.log("Hosting Provider for default candidate:", model.hostingProvider);
      expect(model.asnOperation.confidence).toBe(0);
      expect(model.hostingProvider.confidence).toBe(0);
    });

    it("TEST BUG B: Minor string formatting difference between rirAllocationOwner and asn.org", () => {
      const model = computeDecoupledOwnership({
        ipProfile: {
          ip: "192.0.2.1",
          rirAllocationOwner: "Cloudflare, Inc.",
          asn: { asn: "13335", org: "Cloudflare Inc", rir: "ARIN" }
        }
      });

      console.log("Network Operation for minor string diff:", model.networkOperation);
      expect(model.networkOperation.identity).toBe("Direct Network Operation (AS13335)");
      expect(model.networkOperation.confidence).toBe(90);
    });

    it("TEST BUG C: Candidate with score >= 40 but empty supportingSignals", () => {
      const model = computeDecoupledOwnership({
        topCandidate: {
          ip: "192.0.2.1",
          domain: "example.com",
          score: 50,
          classification: "possible-origin",
          supportingSignals: [],
          contradictionSignals: []
        }
      });

      console.log("Application Origin for empty supportingSignals:", model.applicationOrigin);
      expect(model.applicationOrigin.evidenceCount).toBe(0);
    });

    it("verifies all 7 concepts are returned with valid structures for completely empty input", () => {
      const model = computeDecoupledOwnership({});
      const concepts = [
        model.domainOwner,
        model.ipAllocation,
        model.asnOperation,
        model.networkOperation,
        model.hostingProvider,
        model.applicationOrigin,
        model.physicalLocation
      ];

      for (const concept of concepts) {
        expect(concept).toBeDefined();
        expect(typeof concept.concept).toBe("string");
        expect(typeof concept.label).toBe("string");
        expect(typeof concept.identity).toBe("string");
        expect(typeof concept.confidence).toBe("number");
        expect(concept.confidence).toBeGreaterThanOrEqual(0);
        expect(concept.confidence).toBeLessThanOrEqual(100);
        expect(typeof concept.explanation).toBe("string");
      }
    });
  });
});
