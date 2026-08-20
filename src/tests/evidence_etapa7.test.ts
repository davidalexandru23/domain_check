import { describe, it, expect } from "vitest";
import { collectMxEvidence } from "../server/modules/evidenceEngine.js";
import type { DnsRecordSet, IpProfile } from "../shared/types.js";

const emptyDns = (): DnsRecordSet => ({
  a: [], aaaa: [], ns: [], mx: [], txt: [], caa: [], ptr: {}, dnssec: false, ttl: {}, wildcard: false, zoneTransfer: "unknown", warnings: []
});

const mkProfile = (ip: string, asnOrg: string, asn: string = "12345", ptrs: string[] = []): IpProfile => ({
  ip, asn: { asn, org: asnOrg }, geo: { country: "RO", city: "Bucharest", lat: 0, lon: 0 },
  announcedPrefix: "192.0.2.0/24", networkName: "TEST-NET", rirAllocationOwner: asnOrg,
  ptr: ptrs, providerType: "unknown", upstreams: [], peers: [], ixPresence: [], facilityPresence: [], sources: []
});

describe("Etapa 7 - Email / MX Attribution", () => {
  it("1. MX -> IP -> provider with specific PTR (Google)", async () => {
    const candidate = await collectMxEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "Google LLC", "15169", ["mail.google.com"]),
      dnsResult: emptyDns(), httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100
    }, "aspmx.l.google.com", 10);
    
    expect(candidate.ownershipChain.emailProvider.identity).toBe("Google Workspace");
    expect(candidate.ownershipChain.emailProvider.confidence).toBe(90);
  });

  it("2. MX -> IP -> provider with specific PTR (Microsoft)", async () => {
    const candidate = await collectMxEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "Microsoft Corporation", "8075", ["mail.protection.outlook.com"]),
      dnsResult: emptyDns(), httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100
    }, "example-com.mail.protection.outlook.com", 0);
    
    expect(candidate.ownershipChain.emailProvider.identity).toBe("Microsoft Exchange Online");
    expect(candidate.ownershipChain.emailProvider.confidence).toBe(90);
  });

  it("3. MX -> IP -> fallback to network operator", async () => {
    const candidate = await collectMxEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "Local ISP", "12345"),
      dnsResult: emptyDns(), httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100
    }, "mail.example.com", 10);
    
    expect(candidate.ownershipChain.emailProvider.identity).toBe("Local ISP");
    expect(candidate.ownershipChain.emailProvider.confidence).toBe(70);
  });

  it("4. SPF provider correlation", async () => {
    const dns = emptyDns();
    dns.txt = ["v=spf1 include:_spf.google.com ~all"];
    const candidate = await collectMxEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "Google LLC", "15169"),
      dnsResult: dns, httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100
    }, "aspmx.l.google.com", 10);
    
    expect(candidate.evidence.dns.some(s => s.id === "SPF_RECORD")).toBe(true);
    expect(candidate.evidence.dns.find(s => s.id === "SPF_RECORD")?.observedData).toContain("v=spf1");
  });

  it("5. DMARC correlation", async () => {
    const dns = emptyDns();
    dns.txt = ["_dmarc: v=DMARC1; p=reject;"];
    const candidate = await collectMxEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: mkProfile("192.0.2.1", "ISP"),
      dnsResult: dns, httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100
    }, "mail.example.com", 10);
    
    expect(candidate.evidence.dns.some(s => s.id === "DMARC_RECORD")).toBe(true);
  });

  it("6. RIR != BGP for MX -> Allocation mismatch", async () => {
    const profile = mkProfile("192.0.2.1", "ASN Org", "12345");
    profile.rirAllocationOwner = "Different Org";
    const candidate = await collectMxEvidence({
      domain: "example.com", ip: "192.0.2.1", ipProfile: profile,
      dnsResult: emptyDns(), httpResults: [], tlsResults: [], ports: [], mxIps: [], subdomainHosts: [], timeoutMs: 100
    }, "mail.example.com", 10);
    
    expect(candidate.ownershipChain.networkOperation.identity).toBe("UNKNOWN");
    expect(candidate.ownershipChain.networkOperation.explanation).toContain("Allocation/operator mismatch");
  });

});
