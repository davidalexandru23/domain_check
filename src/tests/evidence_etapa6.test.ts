import { describe, it, expect, vi } from "vitest";
import { collectAllEvidence } from "../server/modules/evidenceEngine.js";
import type { DnsRecordSet, IpProfile } from "../shared/types.js";

const emptyDns = (): DnsRecordSet => ({
  a: [], aaaa: [], ns: [], mx: [], txt: [], caa: [], ptr: {}, dnssec: false, ttl: {}, wildcard: false, zoneTransfer: "unknown", warnings: []
});

const mkProfile = (ip: string, asnOrg: string, asn: string = "12345"): IpProfile => ({
  ip, asn: { asn, org: asnOrg }, geo: { country: "RO", city: "Bucharest", lat: 0, lon: 0 },
  announcedPrefix: "192.0.2.0/24", networkName: "TEST-NET", rirAllocationOwner: asnOrg,
  ptr: [], providerType: "unknown", upstreams: [], peers: [], ixPresence: [], facilityPresence: [], sources: []
});

vi.mock("node:https", () => ({
  default: {
    request: (_o: any, cb: any) => {
      setTimeout(() => cb({ statusCode: 500, headers: {}, socket: { getPeerCertificate: () => ({}) }, on: (e: any, fn: any) => { if (e === "end") fn(); } }), 10);
      return { on: () => {}, end: () => {}, destroy: () => {} };
    }
  }
}));

describe("Etapa 6 - Historical / External Infrastructure Evidence", () => {

  it("1. historical IP -> domain via CT certificates", async () => {
    const candidate = await collectAllEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "ISP"),
      dnsResult: emptyDns(), httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100,
      ctCertificates: [
        { domain: "example.com", san: ["example.com", "www.example.com"], issuer: "Let's Encrypt", notBefore: "2024-01-01", notAfter: "2025-01-01" }
      ]
    });
    
    expect(candidate.evidence.ct.some(s => s.id === "CT_DOMAIN_CERT")).toBe(true);
    expect(candidate.evidence.ct.find(s => s.id === "CT_DOMAIN_CERT")?.type).toBe("supporting");
    // CT alone enables Application Operator inference at confidence 50
    expect(candidate.ownershipChain.applicationOperator.identity).toBe("example.com");
    expect(candidate.ownershipChain.applicationOperator.confidence).toBe(50);
  });

  it("2. historical ASN change detected", async () => {
    const candidate = await collectAllEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "ISP", "12345"),
      dnsResult: emptyDns(), httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100,
      historicalPrefixes: [
        { prefix: "192.0.2.0/24", origin: "12345", firstSeen: "2020-01-01", lastSeen: "2023-06-01" },
        { prefix: "192.0.2.0/24", origin: "67890", firstSeen: "2023-06-01", lastSeen: "2024-01-01" }
      ]
    });
    
    expect(candidate.evidence.historical.some(s => s.id === "HISTORICAL_ASN_CHANGE")).toBe(true);
    expect(candidate.evidence.historical.find(s => s.id === "HISTORICAL_ASN_CHANGE")?.type).toBe("neutral");
    expect(candidate.evidence.historical.find(s => s.id === "HISTORICAL_ASN_CHANGE")?.observedData).toContain("12345");
    expect(candidate.evidence.historical.find(s => s.id === "HISTORICAL_ASN_CHANGE")?.observedData).toContain("67890");
  });

  it("3. historical certificate -> hostname mapping via CT", async () => {
    const candidate = await collectAllEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "ISP"),
      dnsResult: emptyDns(), httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100,
      ctCertificates: [
        { domain: "api.example.com", san: ["api.example.com"], issuer: "DigiCert", notBefore: "2023-01-01", notAfter: "2024-01-01" },
        { domain: "cdn.example.com", san: ["cdn.example.com"], issuer: "DigiCert", notBefore: "2023-05-01", notAfter: "2024-05-01" }
      ]
    });
    
    const ctSignal = candidate.evidence.ct.find(s => s.id === "CT_DOMAIN_CERT");
    expect(ctSignal).toBeDefined();
    expect(ctSignal?.observedData).toContain("api.example.com");
  });

  it("4. current vs historical contradiction (ASN not in history)", async () => {
    const candidate = await collectAllEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "ISP", "99999"),
      dnsResult: emptyDns(), httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100,
      historicalPrefixes: [
        { prefix: "192.0.2.0/24", origin: "12345", firstSeen: "2020-01-01", lastSeen: "2024-01-01" }
      ]
    });
    
    expect(candidate.evidence.historical.some(s => s.id === "HISTORICAL_ASN_CONTRADICTION")).toBe(true);
    expect(candidate.evidence.historical.find(s => s.id === "HISTORICAL_ASN_CONTRADICTION")?.type).toBe("contradiction");
  });

  it("5. multiple historical origins -> neutral evidence, not verdict", async () => {
    const candidate = await collectAllEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "ISP", "12345"),
      dnsResult: emptyDns(), httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100,
      historicalPrefixes: [
        { prefix: "192.0.2.0/24", origin: "12345", firstSeen: "2020-01-01", lastSeen: "2022-01-01" },
        { prefix: "192.0.2.0/24", origin: "67890", firstSeen: "2022-01-01", lastSeen: "2023-01-01" },
        { prefix: "192.0.2.0/24", origin: "11111", firstSeen: "2023-01-01", lastSeen: "2024-01-01" }
      ]
    });
    
    const change = candidate.evidence.historical.find(s => s.id === "HISTORICAL_ASN_CHANGE");
    expect(change).toBeDefined();
    expect(change?.type).toBe("neutral"); // NOT supporting or contradiction
    expect(change?.description).toContain("3 different ASNs");
  });

  it("6. PeeringDB data fara a transforma facility presence in physical server location", async () => {
    const candidate = await collectAllEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "ISP"),
      dnsResult: emptyDns(), httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100,
      peeringDbInfo: {
        name: "RoEduNet",
        infoType: "Education/Research",
        ixPresence: ["RoNIX", "InterLAN"],
        facilityPresence: ["M247 Bucharest", "Nxdata Cluj"]
      }
    });
    
    const netSig = candidate.evidence.infrastructure.find(s => s.id === "PEERINGDB_NETWORK");
    expect(netSig).toBeDefined();
    expect(netSig?.type).toBe("supporting");
    
    const facSig = candidate.evidence.infrastructure.find(s => s.id === "PEERINGDB_FACILITIES");
    expect(facSig).toBeDefined();
    expect(facSig?.type).toBe("neutral"); // NOT supporting - facilities != server location
    expect(facSig?.description).toContain("does NOT confirm");
  });

  it("7. RPKI VALID", async () => {
    const candidate = await collectAllEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "ISP"),
      dnsResult: emptyDns(), httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100,
      rpkiStatus: "valid"
    });
    
    const rpki = candidate.evidence.bgp.find(s => s.id === "RPKI_STATUS");
    expect(rpki).toBeDefined();
    expect(rpki?.type).toBe("supporting");
    expect(rpki?.strength).toBe("medium");
  });

  it("8. RPKI INVALID -> strong contradiction", async () => {
    const candidate = await collectAllEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "ISP"),
      dnsResult: emptyDns(), httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100,
      rpkiStatus: "invalid"
    });
    
    const rpki = candidate.evidence.bgp.find(s => s.id === "RPKI_STATUS");
    expect(rpki).toBeDefined();
    expect(rpki?.type).toBe("contradiction");
    expect(rpki?.strength).toBe("strong");
  });

  it("9. RPKI UNKNOWN -> not added to bucket", async () => {
    const candidate = await collectAllEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "ISP"),
      dnsResult: emptyDns(), httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100,
      rpkiStatus: "unknown"
    });
    
    expect(candidate.evidence.bgp.find(s => s.id === "RPKI_STATUS")).toBeUndefined();
  });

  it("10. DNS alone does NOT establish Application Operator", async () => {
    const dns = emptyDns(); dns.a = ["192.0.2.1"];
    const candidate = await collectAllEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "ISP"),
      dnsResult: dns, httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100
    });
    
    expect(candidate.ownershipChain.applicationOperator.identity).toBe("UNKNOWN");
    expect(candidate.ownershipChain.applicationOperator.confidence).toBe(0);
  });
});
