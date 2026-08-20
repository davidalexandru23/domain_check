import { describe, it, expect } from "vitest";
import { collectAllEvidence } from "../server/modules/evidenceEngine.js";

describe("Etapa 11 - Web/Email Candidate Separation & Ranking", () => {
  it("Outputs explanations in Romanian", async () => {
    const input = {
      domain: "example.com",
      ip: "1.1.1.1",
      dnsResult: { a: ["1.1.1.1"], aaaa: [], ns: [], mx: [], txt: [], caa: [], ptr: {}, dnssec: false, ttl: {}, wildcard: false, zoneTransfer: "unknown", warnings: [] },
      tlsResults: [{ port: 443, host: "1.1.1.1", version: "TLS 1.2", cipher: "AES", valid: true, san: ["example.com"], issuer: "CA", validFrom: "", validTo: "", technologies: [] } as any],
      httpResults: [],
      ports: [],
      subdomainHosts: [],
      mxIps: [],
      timeoutMs: 1000,
      ipProfile: null as any,
      ctCertificates: [],
      peeringDbInfo: undefined,
      rpkiStatus: "unknown",
      historicalPrefixes: []
    } as any;
    const candidateA = await collectAllEvidence(input);
    
    expect(candidateA.explanation).toContain("susțin puternic clasificarea ca direct web origin");
    expect(candidateA.explanation).toContain("Au fost identificate 2 surse independente");
  });
});
