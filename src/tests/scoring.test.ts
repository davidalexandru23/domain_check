import { describe, expect, it } from "vitest";
import {
  calculateScore,
  classifyCandidate,
  evaluateSignals,
  generateCandidateExplanation,
  scoreOriginCandidate,
  isPrivacyOrg,
  POSITIVE_SIGNALS,
  CONTRADICTION_SIGNALS
} from "../server/engine/scoring.js";

describe("Scoring Engine - Evidence Signal Evaluation & Constants", () => {
  it("defines correct positive weights for all 7 signals", () => {
    expect(POSITIVE_SIGNALS.POS_TLS_SAN_MATCH.weight).toBe(30);
    expect(POSITIVE_SIGNALS.POS_HTTP_CONTENT_MATCH.weight).toBe(25);
    expect(POSITIVE_SIGNALS.POS_SUBDOMAIN_LEAK.weight).toBe(20);
    expect(POSITIVE_SIGNALS.POS_PTR_DOMAIN_MATCH.weight).toBe(15);
    expect(POSITIVE_SIGNALS.POS_HISTORICAL_IP.weight).toBe(15);
    expect(POSITIVE_SIGNALS.POS_ASN_MATCH.weight).toBe(10);
    expect(POSITIVE_SIGNALS.POS_NON_CDN_PORT_OPEN.weight).toBe(5);
  });

  it("defines correct contradiction penalties for all 5 signals", () => {
    expect(CONTRADICTION_SIGNALS.NEG_CDN_ASN.weight).toBe(-30);
    expect(CONTRADICTION_SIGNALS.NEG_CLOUD_WAF_HEADER.weight).toBe(-25);
    expect(CONTRADICTION_SIGNALS.NEG_GENERIC_LANDING.weight).toBe(-20);
    expect(CONTRADICTION_SIGNALS.NEG_TLS_CERT_MISMATCH.weight).toBe(-15);
    expect(CONTRADICTION_SIGNALS.NEG_MX_INFRASTRUCTURE.weight).toBe(-15);
  });

  it("isPrivacyOrg identifies WHOIS privacy protection proxy orgs", () => {
    expect(isPrivacyOrg("WhoisGuard Protected")).toBe(true);
    expect(isPrivacyOrg("Domains By Proxy, LLC")).toBe(true);
    expect(isPrivacyOrg("Contact Privacy Inc.")).toBe(true);
    expect(isPrivacyOrg("Redacted for Privacy")).toBe(true);
    expect(isPrivacyOrg("Cloudflare, Inc.")).toBe(false);
    expect(isPrivacyOrg("Hetzner Online GmbH")).toBe(false);
    expect(isPrivacyOrg("")).toBe(false);
    expect(isPrivacyOrg(undefined)).toBe(false);
  });

  it("prevents empty domain string from triggering POS_PTR_DOMAIN_MATCH", () => {
    const { supporting } = evaluateSignals({
      ip: "1.2.3.4",
      domain: "",
      ptrHostname: "host.example.com"
    });
    expect(supporting.some((s) => s.id === "POS_PTR_DOMAIN_MATCH")).toBe(false);
  });
});

describe("Scoring Engine - Formula & Clamping", () => {
  it("clamps total score to maximum 100 when signals exceed 100", () => {
    const score = calculateScore(
      [
        { id: "1", type: "supporting", category: "tls", weight: 30, title: "T", description: "" },
        { id: "2", type: "supporting", category: "http", weight: 25, title: "H", description: "" },
        { id: "3", type: "supporting", category: "subdomain", weight: 20, title: "S", description: "" },
        { id: "4", type: "supporting", category: "ptr", weight: 15, title: "P", description: "" },
        { id: "5", type: "supporting", category: "dns", weight: 15, title: "D", description: "" },
        { id: "6", type: "supporting", category: "asn", weight: 10, title: "A", description: "" },
        { id: "7", type: "supporting", category: "port", weight: 5, title: "N", description: "" }
      ],
      []
    );
    expect(score).toBe(100);
  });

  it("clamps total score to minimum 0 when penalties exceed positive signals", () => {
    const score = calculateScore(
      [{ id: "1", type: "supporting", category: "subdomain", weight: 20, title: "S", description: "" }],
      [
        { id: "2", type: "contradiction", category: "asn", weight: -30, title: "C", description: "" },
        { id: "3", type: "contradiction", category: "waf", weight: -25, title: "W", description: "" }
      ]
    );
    expect(score).toBe(0);
  });
});

describe("Scoring Engine - Candidate Classifications & Decision Tree", () => {
  it("classifies direct-hosted origin server correctly (likely-origin >= 70)", () => {
    const candidate = scoreOriginCandidate({
      ip: "193.230.5.163",
      domain: "example.com",
      provider: "Hetzner Online GmbH",
      asn: "AS24940",
      location: "Germany",
      tlsSanMatch: true,
      httpContentMatch: true,
      discoveredViaSubdomain: true,
      subdomainName: "dev.example.com"
    });

    expect(candidate.score).toBe(75);
    expect(candidate.classification).toBe("likely-origin");
    expect(candidate.supportingSignals.length).toBe(3);
    expect(candidate.contradictionSignals.length).toBe(0);
    expect(candidate.explanation).toContain("likely origin server");
    expect(candidate.explanation).toContain("75/100");
  });

  it("classifies moderate candidate correctly (possible-origin 40-69)", () => {
    const candidate = scoreOriginCandidate({
      ip: "198.51.100.10",
      domain: "example.com",
      provider: "DigitalOcean",
      asn: "AS14061",
      location: "Frankfurt, DE",
      discoveredViaSubdomain: true,
      ptrHostname: "host.example.com",
      isHistoricalIp: true
    });

    expect(candidate.score).toBe(50);
    expect(candidate.classification).toBe("possible-origin");
    expect(candidate.supportingSignals.length).toBe(3);
    expect(candidate.explanation).toContain("possible origin server");
    expect(candidate.explanation).toContain("50/100");
  });

  it("classifies Cloudflare CDN proxy correctly (cdn-proxy)", () => {
    const candidate = scoreOriginCandidate({
      ip: "104.21.48.12",
      domain: "example.com",
      provider: "Cloudflare, Inc.",
      asn: "AS13335",
      isCdnAsn: true,
      httpWafHeaderDetected: true,
      discoveredViaSubdomain: true
    });

    expect(candidate.score).toBe(0);
    expect(candidate.classification).toBe("cdn-proxy");
    expect(candidate.contradictionSignals.length).toBe(2);
    expect(candidate.explanation).toContain("cdn-proxy");
    expect(candidate.explanation).toContain("Cloudflare");
  });

  it("classifies shared hosting landing page correctly (shared-hosting)", () => {
    const candidate = scoreOriginCandidate({
      ip: "198.51.100.45",
      domain: "example.com",
      provider: "Namecheap",
      discoveredViaSubdomain: true,
      httpGenericLandingPage: true,
      tlsCertMismatch: true
    });

    expect(candidate.score).toBe(0);
    expect(candidate.classification).toBe("shared-hosting");
    expect(candidate.explanation).toContain("shared-hosting");
  });

  it("classifies email-only MX server correctly (email-only)", () => {
    const candidate = scoreOriginCandidate({
      ip: "142.250.180.27",
      domain: "example.com",
      provider: "Google LLC",
      asn: "AS15169",
      isMxIpOnly: true,
      isHistoricalIp: true
    });

    expect(candidate.classification).toBe("email-only");
    expect(candidate.explanation).toContain("email-only");
    expect(candidate.explanation).toContain("mail exchange");
  });

  it("classifies unverified subdomain leak correctly (unverified-leak < 40)", () => {
    const candidate = scoreOriginCandidate({
      ip: "203.0.113.50",
      domain: "example.com",
      discoveredViaSubdomain: true,
      subdomainName: "old.example.com"
    });

    expect(candidate.score).toBe(20);
    expect(candidate.classification).toBe("unverified-leak");
    expect(candidate.explanation).toContain("unverified leak");
  });

  it("evaluates open non-CDN ports bonus (+5)", () => {
    const candidate = scoreOriginCandidate({
      ip: "198.51.100.99",
      domain: "example.com",
      discoveredViaSubdomain: true,
      openPorts: [22, 80, 443, 8443]
    });

    expect(candidate.score).toBe(25);
    expect(candidate.supportingSignals.some((s) => s.id === "POS_NON_CDN_PORT_OPEN")).toBe(true);
  });
});
