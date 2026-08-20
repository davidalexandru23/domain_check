import { describe, it, expect, vi } from "vitest";
import { collectAllEvidence } from "../server/modules/evidenceEngine.js";
import type { DnsRecordSet, IpProfile } from "../shared/types.js";

const emptyDns = (): DnsRecordSet => ({
  a: [], aaaa: [], ns: [], mx: [], txt: [], caa: [], ptr: {}, dnssec: false, ttl: {}, wildcard: false, zoneTransfer: "unknown", warnings: []
});

const defaultIpProfile = (ip: string, asnOrg: string = "Hosting Provider Inc"): IpProfile => ({
  ip,
  asn: { asn: "12345", org: asnOrg },
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

vi.mock("node:https", () => ({
  default: {
    request: (options: any, callback: any) => {
      const isMatch = options.servername === "example.com";
      const is403 = options.hostname === "192.0.2.403";
      
      const mockCert = {
        subjectaltname: isMatch ? "DNS:example.com, DNS:www.example.com" : "DNS:wrong.com"
      };

      const res = {
        statusCode: is403 ? 403 : 200,
        headers: { server: "nginx" },
        socket: {
          getPeerCertificate: () => mockCert
        },
        on: (event: string, cb: any) => {
          if (event === "data" && !is403) {
            cb("<title>example.com</title>");
          }
          if (event === "end") {
            cb();
          }
        }
      };

      setTimeout(() => callback(res), 10);

      return {
        on: (event: string, cb: any) => {},
        end: () => {},
        destroy: () => {}
      };
    }
  }
}));

describe("Etapa 3 - Web Origin Attribution Independence Correction", () => {
  it("1. aceeasi proba SNI+Host nu produce doua familii independente", async () => {
    // We only provide subdomain (medium strength, not an independent strong source)
    // The active probe will match both TLS and HTTP, but they come from the same provenance.
    const candidate = await collectAllEvidence({
      domain: "example.com",
      ip: "192.0.2.10",
      ipProfile: defaultIpProfile("192.0.2.10"),
      dnsResult: emptyDns(),
      httpResults: [],
      tlsResults: [],
      ports: [],
      mxIps: [],
      subdomainHosts: ["app.example.com"],
      timeoutMs: 1000
    });
    
    // 1 strong source (Direct Network Probe) -> MEDIUM CONFIDENCE
    expect(candidate.classification).toBe("probable origin");
    expect(candidate.confidenceRating).toBe("MEDIUM CONFIDENCE");
    expect(candidate.evidence.tls.some(s => s.id === "TLS_SNI_MATCH")).toBe(true);
    expect(candidate.evidence.http.some(s => s.id === "HTTP_HOST_TITLE_MATCH")).toBe(true);
  });

  it("2. SAN+SNI din aceeasi conexiune nu dubleaza confidence", async () => {
    // We provide SAN match (passive) and SNI match (active)
    const candidate = await collectAllEvidence({
      domain: "example.com",
      ip: "192.0.2.10",
      ipProfile: defaultIpProfile("192.0.2.10"),
      dnsResult: emptyDns(),
      httpResults: [],
      tlsResults: [{ host: "192.0.2.10", san: ["example.com"], issuer: "Let's Encrypt", validFrom: "", validTo: "" }],
      ports: [],
      mxIps: [],
      subdomainHosts: ["app.example.com"],
      timeoutMs: 1000
    });
    
    // Both are TLS matches but from same normalized source type ("Direct Network Probe")
    expect(candidate.classification).toBe("probable origin");
    expect(candidate.confidenceRating).toBe("MEDIUM CONFIDENCE");
  });

  it("3. DNS+TLS produce doua familii independente (HIGH CONFIDENCE)", async () => {
    const dns = emptyDns();
    dns.a = ["192.0.2.10"]; // DNS Direct = 1 strong source
    const candidate = await collectAllEvidence({
      domain: "example.com",
      ip: "192.0.2.10",
      ipProfile: defaultIpProfile("192.0.2.10"),
      dnsResult: dns,
      httpResults: [],
      tlsResults: [], // active probe will match TLS via SNI = 2nd strong source
      ports: [],
      mxIps: [],
      subdomainHosts: [],
      timeoutMs: 1000
    });
    
    expect(candidate.classification).toBe("direct web origin");
    expect(candidate.confidenceRating).toBe("HIGH CONFIDENCE");
  });

  it("4. DNS+HTTP produce doua familii independente", async () => {
    // We mock the HTTP response passively to simulate DNS + HTTP without TLS
    const dns = emptyDns();
    dns.a = ["192.0.2.15"]; 
    const candidate = await collectAllEvidence({
      domain: "other.com", // domain not matching example.com to avoid active TLS match in our simple mock
      ip: "192.0.2.15",
      ipProfile: defaultIpProfile("192.0.2.15"),
      dnsResult: dns,
      httpResults: [{ url: "http://192.0.2.15", status: 200, title: "other.com", headers: {}, redirects: [], cookies: [], technologies: [] }],
      tlsResults: [],
      ports: [],
      mxIps: [],
      subdomainHosts: [],
      timeoutMs: 1000
    });
    
    // The active probe will fail TLS SNI (since mock only matches example.com)
    // But we have DNS strong + Passive HTTP strong = 2 sources!
    expect(candidate.classification).toBe("direct web origin");
    expect(candidate.confidenceRating).toBe("HIGH CONFIDENCE");
  });

  it("5. 403 nu este tratat ca origin contradiction puternica", async () => {
    const candidate = await collectAllEvidence({
      domain: "example.com",
      ip: "192.0.2.403", // Triggers 403 in mock
      ipProfile: defaultIpProfile("192.0.2.403"),
      dnsResult: emptyDns(),
      httpResults: [],
      tlsResults: [],
      ports: [],
      mxIps: [],
      subdomainHosts: ["app.example.com"],
      timeoutMs: 1000
    });
    
    // TLS matches but HTTP gives 403. No contradiction is added for HTTP. 
    // 1 strong source (TLS active probe) -> probable origin
    expect(candidate.classification).toBe("probable origin");
    expect(candidate.evidence.http.find(s => s.type === "contradiction")).toBeUndefined();
  });

  it("6. TLS mismatch singur nu clasifica automat shared hosting", async () => {
    const dns = emptyDns();
    dns.a = ["192.0.2.55"]; // Direct DNS
    const candidate = await collectAllEvidence({
      domain: "otherdomain.com", // Will cause TLS mismatch
      ip: "192.0.2.55",
      ipProfile: defaultIpProfile("192.0.2.55"),
      dnsResult: dns,
      httpResults: [],
      tlsResults: [{ host: "192.0.2.55", san: ["wrong.com"], issuer: "Let's Encrypt", validFrom: "", validTo: "" }],
      ports: [],
      mxIps: [],
      subdomainHosts: [],
      timeoutMs: 1000
    });
    
    // It has DNS direct (1 source), but TLS mismatched (medium contradiction).
    // Medium contradiction doesn't force shared hosting.
    expect(candidate.classification).toBe("probable origin");
    expect(candidate.evidence.tls.find(s => s.id === "TLS_MISMATCH")?.strength).toBe("medium");
  });
});
