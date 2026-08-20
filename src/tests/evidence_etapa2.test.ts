import { describe, it, expect } from "vitest";
import { collectAllEvidence } from "../server/modules/evidenceEngine.js";
import type { DnsRecordSet, IpProfile, HttpProfile, TlsProfile } from "../shared/types.js";

const emptyDns = (): DnsRecordSet => ({
  a: [], aaaa: [], ns: [], mx: [], txt: [], caa: [], ptr: {}, dnssec: false, ttl: {}, wildcard: false, zoneTransfer: "unknown", warnings: []
});

const defaultIpProfile = (): IpProfile => ({
  ip: "192.0.2.1",
  asn: { asn: "12345", org: "Hosting Provider Inc" },
  geo: { country: "US", city: "New York", lat: 0, lon: 0 },
  announcedPrefix: "192.0.2.0/24",
  networkName: "HOSTING-NET",
  rirAllocationOwner: "RIR Holder LLC",
  ptr: [],
  providerType: "cloud",
  upstreams: [],
  peers: [],
  ixPresence: [],
  facilityPresence: [],
  sources: []
});

describe("Etapa 2 - Evidence Engine", () => {
  it("HTTP timeout results in neutral weak evidence, not contradiction", async () => {
    const candidate = await collectAllEvidence({
      domain: "example.com",
      ip: "192.0.2.1",
      ipProfile: defaultIpProfile(),
      dnsResult: emptyDns(),
      httpResults: [{ url: "http://192.0.2.1", redirects: [], headers: {}, cookies: [], technologies: [] }], // Empty HTTP implies timeout/failure
      tlsResults: [],
      ports: [],
      mxIps: [],
      subdomainHosts: [],
      timeoutMs: 1000
    });
    
    expect(candidate.evidence.http.length).toBe(1);
    expect(candidate.evidence.http[0].type).toBe("neutral");
    expect(candidate.evidence.http[0].strength).toBe("weak");
    expect(candidate.classification).toBe("unrelated");
  });

  it("Independent evidence buckets sum to HIGH CONFIDENCE", async () => {
    const dns = emptyDns();
    dns.a = ["192.0.2.1"];
    const candidate = await collectAllEvidence({
      domain: "example.com",
      ip: "192.0.2.1",
      ipProfile: defaultIpProfile(),
      dnsResult: dns, // 1st independent source (DNS)
      httpResults: [],
      tlsResults: [{ host: "192.0.2.1", san: ["example.com"] }], // 2nd independent source (TLS)
      ports: [],
      mxIps: [],
      subdomainHosts: [],
      timeoutMs: 1000
    });
    
    expect(candidate.classification).toBe("direct web origin");
    expect(candidate.confidenceRating).toBe("HIGH CONFIDENCE");
  });

  it("Web vs Email separation (MX IP)", async () => {
    const dns = emptyDns();
    const candidate = await collectAllEvidence({
      domain: "example.com",
      ip: "192.0.2.1",
      ipProfile: defaultIpProfile(),
      dnsResult: dns,
      httpResults: [],
      tlsResults: [],
      ports: [],
      mxIps: ["192.0.2.1"],
      subdomainHosts: [],
      timeoutMs: 1000
    });
    
    expect(candidate.classification).toBe("email-only");
    expect(candidate.evidence.mx.length).toBe(1);
    expect(candidate.evidence.mx[0].type).toBe("contradiction");
  });

  it("RIR Holder != ASN Operator logic", async () => {
    const ipProfile = defaultIpProfile();
    ipProfile.rirAllocationOwner = "Company A";
    ipProfile.asn.org = "Company B";
    const candidate = await collectAllEvidence({
      domain: "example.com",
      ip: "192.0.2.1",
      ipProfile,
      dnsResult: emptyDns(),
      httpResults: [],
      tlsResults: [],
      ports: [],
      mxIps: [],
      subdomainHosts: [],
      timeoutMs: 1000
    });
    
    expect(candidate.ownershipChain.rirAllocation.identity).toBe("Company A");
    expect(candidate.ownershipChain.asnOperation.identity).toBe("Company B");
    // Probable customer is a separate inference
    expect(candidate.ownershipChain.probableCustomer.identity).toBe("UNKNOWN");
  });
});
