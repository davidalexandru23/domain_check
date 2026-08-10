import { describe, expect, it } from "vitest";
import {
  computeDecoupledOwnership,
  isValidAsnNum,
  isValidOrgName,
  normalizeOrgName,
  areOrgsMatching
} from "../server/engine/ownership.js";

describe("Decoupled Ownership Helper Utilities", () => {
  it("isValidAsnNum correctly validates ASNs and strips prefixes", () => {
    expect(isValidAsnNum("AS13335")).toBe(true);
    expect(isValidAsnNum("13335")).toBe(true);
    expect(isValidAsnNum("  as24940 ")).toBe(true);
    expect(isValidAsnNum("Unknown ASN")).toBe(false);
    expect(isValidAsnNum("AS0")).toBe(false);
    expect(isValidAsnNum("")).toBe(false);
    expect(isValidAsnNum(undefined)).toBe(false);
  });

  it("isValidOrgName filters out placeholder strings", () => {
    expect(isValidOrgName("Cloudflare, Inc.")).toBe(true);
    expect(isValidOrgName("Hetzner Online GmbH")).toBe(true);
    expect(isValidOrgName("Unknown Provider")).toBe(false);
    expect(isValidOrgName("Unknown ASN")).toBe(false);
    expect(isValidOrgName("Unknown Host")).toBe(false);
    expect(isValidOrgName("N/A")).toBe(false);
    expect(isValidOrgName("None")).toBe(false);
    expect(isValidOrgName("Unclassified")).toBe(false);
    expect(isValidOrgName("")).toBe(false);
    expect(isValidOrgName(undefined)).toBe(false);
  });

  it("normalizeOrgName strips legal entity suffixes and non-alphanumeric characters", () => {
    expect(normalizeOrgName("Cloudflare, Inc.")).toBe("cloudflare");
    expect(normalizeOrgName("Cloudflare Inc")).toBe("cloudflare");
    expect(normalizeOrgName("Hetzner Online GmbH.")).toBe("hetzneronline");
    expect(normalizeOrgName("Amazon.com, Inc.")).toBe("amazoncom");
  });

  it("areOrgsMatching matches organizations with minor formatting differences", () => {
    expect(areOrgsMatching("Cloudflare, Inc.", "Cloudflare Inc")).toBe(true);
    expect(areOrgsMatching("Hetzner Online GmbH.", "Hetzner Online GmbH")).toBe(true);
    expect(areOrgsMatching("Amazon.com, Inc.", "Netflix Inc")).toBe(false);
    expect(areOrgsMatching("Unknown Provider", "Cloudflare Inc")).toBe(false);
  });
});

describe("Decoupled 7 Ownership Concepts Engine", () => {
  it("calculates high-confidence direct hosting infrastructure (ici.ro benchmark)", () => {
    const model = computeDecoupledOwnership({
      domain: {
        domain: "ici.ro",
        registrantOrg: "Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti",
        registrar: "RO-TLD",
        privacyDetected: false,
        sources: [{ name: "whois", confidence: "high" }, { name: "rdap", confidence: "high" }]
      },
      topCandidate: {
        ip: "193.230.5.163",
        domain: "ici.ro",
        provider: "ICI Bucuresti",
        asn: "AS3233",
        location: "Bucharest, Romania",
        score: 85,
        classification: "likely-origin",
        supportingSignals: [
          { id: "POS_TLS_SAN_MATCH", type: "supporting", category: "tls", weight: 30, title: "TLS SAN Match", description: "", observedData: "ici.ro" },
          { id: "POS_HTTP_CONTENT_MATCH", type: "supporting", category: "http", weight: 25, title: "HTTP Title Match", description: "", observedData: "ICI Bucuresti" },
          { id: "POS_SUBDOMAIN_LEAK", type: "supporting", category: "subdomain", weight: 20, title: "Subdomain Leak", description: "", observedData: "www.ici.ro" }
        ],
        contradictionSignals: [],
        explanation: "Likely origin server"
      },
      ipProfile: {
        ip: "193.230.5.163",
        ptr: ["edu.gov.ro"],
        rirAllocationOwner: "Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti",
        networkName: "ICI-NET",
        announcedPrefix: "193.230.5.0/24",
        asn: { asn: "3233", org: "Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti", rir: "RIPE" },
        providerType: "enterprise",
        geo: { country: "Romania", city: "Bucharest", lat: 44.4323, lon: 26.1063 },
        facilityPresence: ["NXDATA-1 Bucharest"],
        sources: [{ name: "ripe", confidence: "high" }],
        upstreams: [],
        peers: [],
        ixPresence: []
      }
    });

    // 1. Domain Ownership
    expect(model.domainOwner.confidence).toBe(95);
    expect(model.domainOwner.identity).toContain("ICI Bucuresti");

    // 2. IP Allocation
    expect(model.ipAllocation.confidence).toBe(95);
    expect(model.ipAllocation.identity).toContain("ICI Bucuresti");

    // 3. ASN Operation
    expect(model.asnOperation.confidence).toBe(95);
    expect(model.asnOperation.identity).toBe("AS3233 - Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti");

    // 4. Network Operation
    expect(model.networkOperation.confidence).toBe(90);
    expect(model.networkOperation.identity).toBe("Direct Network Operation (AS3233)");

    // 5. Hosting Provider
    expect(model.hostingProvider.confidence).toBe(80);
    expect(model.hostingProvider.identity).toContain("ICI Bucuresti");

    // 6. Application Origin
    expect(model.applicationOrigin.confidence).toBe(85);
    expect(model.applicationOrigin.identity).toContain("193.230.5.163");
    expect(model.applicationOrigin.details?.isProxiedByCdn).toBe(false);

    // 7. Physical Location
    expect(model.physicalLocation.confidence).toBe(90);
    expect(model.physicalLocation.identity).toContain("Bucharest, Romania");
    expect(model.physicalLocation.identity).toContain("NXDATA-1 Bucharest");
  });

  it("decouples CDN hosting provider from masked application origin (Cloudflare proxied)", () => {
    const model = computeDecoupledOwnership({
      domain: {
        domain: "example-cdn.com",
        registrantOrg: "Withheld for Privacy ehf",
        privacyDetected: true,
        sources: [{ name: "whois", confidence: "low" }]
      },
      topCandidate: {
        ip: "104.16.123.96",
        domain: "example-cdn.com",
        provider: "Cloudflare, Inc.",
        asn: "AS13335",
        location: "San Francisco, US",
        score: 20,
        classification: "cdn-proxy",
        supportingSignals: [],
        contradictionSignals: [
          { id: "NEG_CDN_ASN", type: "contradiction", category: "asn", weight: -30, title: "CDN ASN Penalty", description: "IP belongs to Cloudflare AS13335", observedData: "AS13335" }
        ],
        explanation: "CDN proxy"
      },
      ipProfile: {
        ip: "104.16.123.96",
        ptr: [],
        rirAllocationOwner: "Cloudflare, Inc.",
        asn: { asn: "13335", org: "Cloudflare, Inc.", rir: "ARIN" },
        providerType: "cdn",
        geo: { country: "United States", city: "San Francisco" },
        upstreams: [],
        peers: [],
        ixPresence: [],
        facilityPresence: [],
        sources: []
      }
    });

    // Domain Owner: Privacy protected -> 20%
    expect(model.domainOwner.confidence).toBe(20);
    expect(model.domainOwner.identity).toContain("Privacy Protected");

    // Hosting Provider: Cloudflare CDN -> 95%
    expect(model.hostingProvider.confidence).toBe(95);
    expect(model.hostingProvider.identity).toContain("Cloudflare, Inc. (CDN / WAF)");

    // Application Origin: Proxied -> max 25%
    expect(model.applicationOrigin.confidence).toBeLessThanOrEqual(25);
    expect(model.applicationOrigin.identity).toContain("Behind CDN Proxy");
    expect(model.applicationOrigin.details?.isProxiedByCdn).toBe(true);

    // Physical Location: Anycast -> 30%
    expect(model.physicalLocation.confidence).toBe(30);
    expect(model.physicalLocation.identity).toContain("Anycast");

    // Decoupling Verification: CDN hosting confidence (95%) is distinct from Application Origin (20%)
    expect(model.hostingProvider.confidence).not.toBe(model.applicationOrigin.confidence);
  });

  it("detects subleased reseller network space (Hetzner reseller)", () => {
    const model = computeDecoupledOwnership({
      domain: { domain: "reseller-hosted.com", registrantOrg: "Acme Shop SRL", privacyDetected: false, sources: [] },
      ipProfile: {
        ip: "195.201.10.5",
        ptr: [],
        rirAllocationOwner: "Hetzner Online GmbH",
        asn: { asn: "24940", org: "Hosting Reseller SRL", rir: "RIPE" },
        providerType: "enterprise",
        geo: { country: "Germany", city: "Falkenstein" },
        upstreams: [],
        peers: [],
        ixPresence: [],
        facilityPresence: [],
        sources: []
      },
      infrastructure: {
        ipChains: [
          {
            ip: "195.201.10.5",
            providerRole: "hosting",
            allocation: { allocationOwner: "Hetzner Online GmbH" },
            leaseSignals: [
              { kind: "subleased", message: "Netblock allocated to Hetzner Online GmbH but operated by Hosting Reseller SRL", confidence: "high", evidence: [] }
            ],
            upstreams: [],
            peers: [],
            ixPresence: [],
            facilityPresence: [],
            confidence: "high"
          }
        ],
        roleProviders: [],
        verdict: "Likely subleased network",
        confidence: "high",
        evidence: [],
        warnings: []
      }
    });

    expect(model.ipAllocation.identity).toContain("Hetzner Online GmbH");
    expect(model.networkOperation.confidence).toBe(75);
    expect(model.networkOperation.identity).toContain("Subleased Space (Hosting Reseller SRL on Hetzner Online GmbH)");
    expect(model.networkOperation.explanation).toContain("Subleased network space detected");
  });

  it("handles WHOIS privacy protection correctly", () => {
    const model = computeDecoupledOwnership({
      domain: {
        domain: "private-domain.com",
        registrantOrg: "WhoisGuard Protected",
        privacyDetected: true,
        sources: [{ name: "whois", confidence: "medium" }]
      }
    });

    expect(model.domainOwner.confidence).toBe(20);
    expect(model.domainOwner.confidenceRating).toBe("low");
    expect(model.domainOwner.identity).toBe("Redacted (Privacy Protected)");
    expect(model.domainOwner.explanation).toContain("privacy protection service");
  });

  it("handles missing/empty inputs without runtime errors", () => {
    const model = computeDecoupledOwnership({});

    expect(model.domainOwner.confidence).toBe(0);
    expect(model.ipAllocation.confidence).toBe(0);
    expect(model.asnOperation.confidence).toBe(0);
    expect(model.networkOperation.confidence).toBe(0);
    expect(model.hostingProvider.confidence).toBe(0);
    expect(model.applicationOrigin.confidence).toBe(0);
    expect(model.physicalLocation.confidence).toBe(0);

    expect(model.domainOwner.explanation).toBeTruthy();
    expect(model.applicationOrigin.explanation).toBeTruthy();
  });

  it("validates all 7 concepts are present and carry valid confidence ranges", () => {
    const model = computeDecoupledOwnership({});
    const keys = Object.keys(model) as Array<keyof typeof model>;

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

    for (const key of keys) {
      const concept = model[key];
      expect(concept.confidence).toBeGreaterThanOrEqual(0);
      expect(concept.confidence).toBeLessThanOrEqual(100);
      expect(typeof concept.label).toBe("string");
      expect(typeof concept.identity).toBe("string");
      expect(typeof concept.explanation).toBe("string");
    }
  });
});
