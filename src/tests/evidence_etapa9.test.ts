import { describe, it, expect } from "vitest";
import { collectAllEvidence } from "../server/modules/evidenceEngine.js";
import type { DnsRecordSet } from "../shared/types.js";
import type { EvidenceInput } from "../server/modules/evidenceEngine.js";

const emptyDns: DnsRecordSet = {
  a: [], aaaa: [], ns: [], mx: [], txt: [], caa: [], ptr: {}, dnssec: false, ttl: {}, wildcard: false, zoneTransfer: "unknown", warnings: []
};

const baseInput = (ip: string, overrides: Partial<EvidenceInput> = {}): EvidenceInput => ({
  domain: "example.com",
  ip,
  dnsResult: emptyDns,
  httpResults: [],
  tlsResults: [],
  ports: [],
  mxIps: [],
  subdomainHosts: [],
  timeoutMs: 1000,
  ...overrides
});

describe("Etapa 9 - Candidate Ranking & Heuristics", () => {
  it("Candidate A > Candidate B if A has more strong evidence", async () => {
    // Candidate A: DNS + TLS
    const candidateA = await collectAllEvidence(baseInput("1.1.1.1", {
      dnsResult: { ...emptyDns, a: ["1.1.1.1"] },
      tlsResults: [{ port: 443, host: "1.1.1.1", version: "TLS 1.2", cipher: "AES", valid: true, san: ["example.com"], issuer: "CA", validFrom: "", validTo: "", technologies: [] } as any]
    }));

    // Candidate B: DNS only
    const candidateB = await collectAllEvidence(baseInput("2.2.2.2", {
      dnsResult: { ...emptyDns, a: ["2.2.2.2"] }
    }));

    expect(candidateA.confidences.origin).toBeGreaterThan(candidateB.confidences.origin);
    expect(candidateA.confidenceRating).toBe("HIGH CONFIDENCE");
    expect(candidateB.confidenceRating).toBe("MEDIUM CONFIDENCE");
  });

  it("Insufficient evidence -> LOW CONFIDENCE and Missing Evidence", async () => {
    const candidate = await collectAllEvidence(baseInput("3.3.3.3", {
      subdomainHosts: ["dev.example.com"]
    }));

    expect(candidate.classification).toBe("possible origin");
    expect(candidate.confidenceRating).toBe("LOW CONFIDENCE");
    expect(candidate.missingEvidence?.length).toBeGreaterThan(0);
    expect(candidate.missingEvidence).toContain("direct TLS confirmation");
  });

  it("Double counting prevention for independent sources", async () => {
    const candidate = await collectAllEvidence(baseInput("4.4.4.4", {
      tlsResults: [{ port: 443, host: "4.4.4.4", version: "TLS 1.2", cipher: "AES", valid: true, san: ["example.com"], issuer: "CA", validFrom: "", validTo: "", technologies: [] } as any],
      httpResults: [{ port: 443, url: "https://4.4.4.4", status: 200, title: "example.com title", technologies: [], headers: {} } as any]
    }));

    expect(candidate.confidenceRating).toBe("MEDIUM CONFIDENCE");
    expect(candidate.classification).toBe("probable origin");
  });
});
