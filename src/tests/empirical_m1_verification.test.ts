import { describe, expect, it } from "vitest";
import {
  calculateScore,
  classifyCandidate,
  evaluateSignals,
  generateCandidateExplanation,
  scoreOriginCandidate,
  POSITIVE_SIGNALS,
  CONTRADICTION_SIGNALS
} from "../server/engine/scoring.js";
import { computeDecoupledOwnership } from "../server/engine/ownership.js";

describe("Empirical Adversarial M1 Verification - Edge Case Test Suite", () => {
  // Scenario 1: Direct-hosted domain (ici.ro) classification & score
  describe("Scenario 1: Direct-Hosted Domain (ici.ro)", () => {
    it("evaluates max positive score clamping when all 7 positive signals fire", () => {
      const candidate = scoreOriginCandidate({
        ip: "193.230.5.163",
        domain: "ici.ro",
        provider: "ICI Bucuresti",
        asn: "AS3233",
        asnOrg: "Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti",
        rirAllocationOwner: "Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti",
        registrantOrg: "ICI Bucuresti",
        location: "Bucharest, Romania",
        tlsSanMatch: true, // +30
        httpContentMatch: true, // +25
        discoveredViaSubdomain: true, // +20
        subdomainName: "www.ici.ro",
        ptrHostname: "host.ici.ro", // +15
        isHistoricalIp: true, // +15
        openPorts: [22, 80, 443, 8080] // +5
        // Total raw = 110 (without ASN match due to string includes asymmetry, or 120 with it)
      });

      expect(candidate.score).toBe(100);
      expect(candidate.classification).toBe("likely-origin");
      expect(candidate.confidence).toBe("high");
      expect(candidate.explanation).toContain("likely origin server");
    });

    it("handles boundary score threshold 70 (likely-origin) vs 69 (possible-origin)", () => {
      // 70 points: TLS SAN (+30) + HTTP Content (+25) + PTR (+15) = 70
      const score70 = scoreOriginCandidate({
        ip: "193.230.5.163",
        domain: "ici.ro",
        tlsSanMatch: true,
        httpContentMatch: true,
        ptrHostname: "ici.ro"
      });
      expect(score70.score).toBe(70);
      expect(score70.classification).toBe("likely-origin");

      // 69 points: TLS SAN (+30) + HTTP Content (+25) + ASN (+10) + Open port (+5) - Cert mismatch (-15) = 55
      // Let's make exactly 69 if possible, or 65 vs 70 boundary
      const score65 = scoreOriginCandidate({
        ip: "193.230.5.163",
        domain: "ici.ro",
        tlsSanMatch: true,
        httpContentMatch: true,
        asnOrg: "ICI Bucuresti",
        registrantOrg: "ICI Bucuresti"
      });
      // +30 + 25 + 10 = 65
      expect(score65.score).toBe(65);
      expect(score65.classification).toBe("possible-origin");
    });

    it("verifies 7 decoupled ownership concepts for direct-hosted domain", () => {
      const model = computeDecoupledOwnership({
        domain: {
          domain: "ici.ro",
          registrantOrg: "ICI Bucuresti",
          registrar: "RO-TLD",
          privacyDetected: false,
          sources: [{ name: "rdap", confidence: "high" }]
        },
        topCandidate: scoreOriginCandidate({
          ip: "193.230.5.163",
          domain: "ici.ro",
          provider: "ICI Bucuresti",
          asn: "AS3233",
          location: "Bucharest, RO",
          tlsSanMatch: true,
          httpContentMatch: true
        }),
        ipProfile: {
          ip: "193.230.5.163",
          rirAllocationOwner: "ICI Bucuresti",
          asn: { asn: "3233", org: "ICI Bucuresti" },
          providerType: "enterprise",
          geo: { country: "Romania", city: "Bucharest" }
        }
      });

      expect(model.domainOwner.confidence).toBe(90);
      expect(model.ipAllocation.confidence).toBe(95);
      expect(model.asnOperation.confidence).toBe(95);
      expect(model.networkOperation.confidence).toBe(90);
      expect(model.hostingProvider.confidence).toBe(80);
      expect(model.applicationOrigin.confidence).toBe(55); // score of top candidate: 30+25 = 55
      expect(model.physicalLocation.confidence).toBe(80);
    });
  });

  // Scenario 2: Cloudflare-proxied domain classification & CDN penalty
  describe("Scenario 2: Cloudflare-Proxied Domain (cloudflare.com)", () => {
    it("applies CDN penalties (-30 CDN ASN, -25 WAF Header) overriding positive signals", () => {
      const candidate = scoreOriginCandidate({
        ip: "104.16.132.229",
        domain: "cloudflare.com",
        provider: "Cloudflare, Inc.",
        asn: "AS13335",
        asnNumber: "13335",
        isCdnAsn: true, // -30
        httpWafHeaderDetected: true, // -25
        tlsSanMatch: true, // +30
        httpContentMatch: true // +25
      });

      // Raw score = (30 + 25) - (30 + 25) = 0
      expect(candidate.score).toBe(0);
      expect(candidate.classification).toBe("cdn-proxy");
      expect(candidate.contradictionSignals).toHaveLength(2);
      expect(candidate.supportingSignals).toHaveLength(2);
      expect(candidate.explanation).toContain("cdn-proxy");
    });

    it("ensures CDN classification occurs even when positive signals yield score > 0", () => {
      const candidate = scoreOriginCandidate({
        ip: "104.16.132.229",
        domain: "cloudflare.com",
        provider: "Cloudflare, Inc.",
        asn: "AS13335",
        isCdnAsn: true, // -30
        tlsSanMatch: true, // +30
        httpContentMatch: true, // +25
        discoveredViaSubdomain: true, // +20
        ptrHostname: "cloudflare.com" // +15
      });

      // Raw score = (30 + 25 + 20 + 15) - 30 = 60
      expect(candidate.score).toBe(60);
      // Even though score is 60 (which normally maps to possible-origin), CDN contradiction forces classification to cdn-proxy!
      expect(candidate.classification).toBe("cdn-proxy");
    });

    it("verifies decoupled ownership caps application origin confidence at max 25 for CDN proxy", () => {
      const topCand = scoreOriginCandidate({
        ip: "104.16.132.229",
        domain: "cloudflare.com",
        provider: "Cloudflare, Inc.",
        asn: "AS13335",
        isCdnAsn: true,
        httpWafHeaderDetected: true,
        tlsSanMatch: true,
        httpContentMatch: true
      });

      const model = computeDecoupledOwnership({
        topCandidate: topCand,
        ipProfile: {
          ip: "104.16.132.229",
          asn: { asn: "13335", org: "Cloudflare, Inc." },
          providerType: "cdn",
          geo: { country: "United States", city: "San Francisco" }
        }
      });

      expect(model.hostingProvider.identity).toContain("Cloudflare, Inc. (CDN / WAF)");
      expect(model.hostingProvider.confidence).toBe(95);
      expect(model.applicationOrigin.confidence).toBeLessThanOrEqual(25);
      expect(model.applicationOrigin.identity).toContain("Behind CDN Proxy");
      expect(model.physicalLocation.identity).toContain("Global Anycast Edge");
      expect(model.physicalLocation.confidence).toBe(30);
    });
  });

  // Scenario 3: Separate MX provider infrastructure (Google Workspace, Outlook) email-only isolation
  describe("Scenario 3: Separate MX Infrastructure (Google Workspace / Outlook)", () => {
    it("isolates pure MX exchange IP as email-only when no web matches exist", () => {
      const candidate = scoreOriginCandidate({
        ip: "142.250.180.27",
        domain: "company.com",
        provider: "Google LLC",
        asn: "AS15169",
        isMxIpOnly: true,
        isHistoricalIp: true // +15 DNS historical
      });

      // Score = 15 - 15 = 0
      expect(candidate.score).toBe(0);
      expect(candidate.classification).toBe("email-only");
      expect(candidate.explanation).toContain("strictly associated with mail exchange (MX) infrastructure");
    });

    it("does not classify as email-only if web match (TLS SAN / HTTP Content) is present on MX IP", () => {
      const candidate = scoreOriginCandidate({
        ip: "142.250.180.27",
        domain: "company.com",
        provider: "Google LLC",
        asn: "AS15169",
        isMxIpOnly: true, // -15
        tlsSanMatch: true, // +30 web match!
        httpContentMatch: true // +25 web match!
      });

      // Score = 30 + 25 - 15 = 40
      expect(candidate.score).toBe(40);
      // Because hasWebMatch is true, it is NOT email-only, but rather possible-origin!
      expect(candidate.classification).toBe("possible-origin");
    });
  });

  // Scenario 4: Subleased reseller network detection (Hetzner reseller)
  describe("Scenario 4: Subleased Reseller Network (Hetzner Reseller)", () => {
    it("detects subleased network space when RIR owner and ASN operator mismatch", () => {
      const model = computeDecoupledOwnership({
        ipProfile: {
          ip: "195.201.10.5",
          rirAllocationOwner: "Hetzner Online GmbH",
          asn: { asn: "24940", org: "FastHost Reseller Ltd" }
        }
      });

      expect(model.ipAllocation.identity).toContain("Hetzner Online GmbH");
      expect(model.asnOperation.identity).toBe("AS24940 - FastHost Reseller Ltd");
      expect(model.networkOperation.identity).toBe("Subleased Space (FastHost Reseller Ltd on Hetzner Online GmbH)");
      expect(model.networkOperation.confidence).toBe(75);
    });

    it("handles case-insensitive match for RIR owner and ASN operator to prevent false positive sublease", () => {
      const model = computeDecoupledOwnership({
        ipProfile: {
          ip: "195.201.10.5",
          rirAllocationOwner: "HETZNER ONLINE GMBH",
          asn: { asn: "24940", org: "Hetzner Online GmbH" }
        }
      });

      // Since toLowerCase() matches, it should NOT be subleased space!
      expect(model.networkOperation.identity).toBe("Direct Network Operation (AS24940)");
      expect(model.networkOperation.confidence).toBe(90);
    });
  });

  // Adversarial edge cases & string handling check
  describe("Adversarial Edge Cases & Boundary Stress Testing", () => {
    it("tests ASN match signal when registrantOrg is substring of asnOrg vs vice-versa", () => {
      // Case A: registrantOrg ("ICI") is inside asnOrg ("ICI Bucuresti")
      const candidateA = scoreOriginCandidate({
        ip: "1.1.1.1",
        domain: "test.com",
        registrantOrg: "ICI",
        asnOrg: "ICI Bucuresti"
      });
      expect(candidateA.supportingSignals.some(s => s.id === "POS_ASN_MATCH")).toBe(true);

      // Case B: registrantOrg ("ICI Bucuresti Romania") contains asnOrg ("ICI Bucuresti")
      const candidateB = scoreOriginCandidate({
        ip: "1.1.1.1",
        domain: "test.com",
        registrantOrg: "ICI Bucuresti Romania",
        asnOrg: "ICI Bucuresti"
      });
      // In scoring.ts line 177: asnOrg.toLowerCase().includes(registrantOrg.toLowerCase())
      // "ICI Bucuresti".includes("ICI Bucuresti Romania") -> FALSE!
      // Let's document this behavior empirically!
      const hasAsnMatchInB = candidateB.supportingSignals.some(s => s.id === "POS_ASN_MATCH");
      // Record result: false
      expect(hasAsnMatchInB).toBe(false);
    });

    it("verifies negative weight math in calculateScore uses Math.abs(c.weight)", () => {
      const score = calculateScore(
        [{ id: "1", type: "supporting", category: "tls", weight: 30, title: "T", description: "" }],
        [{ id: "2", type: "contradiction", category: "asn", weight: -30, title: "C", description: "" }]
      );
      // 30 - |-30| = 0
      expect(score).toBe(0);
    });
  });
});
