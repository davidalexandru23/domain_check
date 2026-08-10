/**
 * Tier 4: Real-World Workload Scenarios Test Suite (5 Test Cases)
 * Domain Check Origin / Hosting / Ownership Correlation Engine
 * End-to-End Infrastructure Scenarios:
 * 1. Direct-Hosted Domain (ici.ro)
 * 2. Cloudflare-Proxied Domain (example.com with Hetzner origin leak)
 * 3. Separate MX Email Infrastructure (company.org with Google Workspace)
 * 4. Shared Hosting Domain (smallbiz.org on cPanel node)
 * 5. Subleased / Reseller IP Space (reseller-app.net on Hetzner block)
 */

import { describe, expect, it } from "vitest";
import {
  CandidateClassification,
  DecoupledOwnershipModel,
  EvidenceSignal,
  OriginCandidateDetailed,
  ScanResult
} from "../../shared/types.js";
import {
  calculateScore,
  classifyCandidate
} from "../../server/engine/scoring.js";
import { computeDecoupledOwnership } from "../../server/engine/ownership.js";
import {
  createCandidate,
  createDecoupledOwnership,
  createScanResult,
  NEG_CDN_ASN,
  NEG_CLOUD_WAF_HEADER,
  NEG_GENERIC_LANDING,
  NEG_MX_INFRASTRUCTURE,
  NEG_TLS_CERT_MISMATCH,
  POS_ASN_MATCH,
  POS_HTTP_CONTENT_MATCH,
  POS_PTR_DOMAIN_MATCH,
  POS_SUBDOMAIN_LEAK,
  POS_TLS_SAN_MATCH,
  SCENARIO_CLOUDFLARE_PROXIED,
  SCENARIO_DIRECT_HOSTED,
  SCENARIO_SEPARATE_MX,
  SCENARIO_SHARED_HOSTING,
  SCENARIO_SUBLEASED_IP
} from "./fixtures/mock_responses.js";

describe("Tier 4: Real-World Workload Scenarios (T4.S01–T4.S05)", () => {
  // =========================================================================
  // Scenario 1: Direct-Hosted Domain Scenario (ici.ro)
  // =========================================================================
  it("T4.S01 - Direct-Hosted Domain Scenario (ici.ro)", () => {
    const directCandidate = createCandidate({
      ip: SCENARIO_DIRECT_HOSTED.ip,
      domain: SCENARIO_DIRECT_HOSTED.domain,
      provider: SCENARIO_DIRECT_HOSTED.provider,
      asn: SCENARIO_DIRECT_HOSTED.asn,
      location: SCENARIO_DIRECT_HOSTED.location,
      supporting: SCENARIO_DIRECT_HOSTED.supporting,
      contradictions: SCENARIO_DIRECT_HOSTED.contradictions
    });

    expect(directCandidate.score).toBe(80);
    expect(directCandidate.classification).toBe("likely-origin");
    expect(directCandidate.supportingSignals).toHaveLength(4);
    expect(directCandidate.contradictionSignals).toHaveLength(0);

    const scan = createScanResult({
      targetDomain: SCENARIO_DIRECT_HOSTED.domain,
      candidates: [directCandidate],
      ownership: {
        domainOwner: {
          concept: "domainOwner",
          label: "Domain Ownership",
          identity: "Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti",
          confidence: 95,
          evidenceCount: 4,
          explanation: "ROTLD WHOIS database attributes domain to ICI Bucuresti."
        },
        applicationOrigin: {
          concept: "applicationOrigin",
          label: "Application Origin Server",
          identity: SCENARIO_DIRECT_HOSTED.ip,
          confidence: directCandidate.score,
          evidenceCount: 4,
          explanation: "TLS SAN and HTTP GET probes confirm direct origin hosting."
        }
      },
      narrativeSummary: "Confirmed direct-hosted infrastructure for ici.ro operated by ICI Bucuresti."
    });

    expect(scan.topOriginCandidate?.ip).toBe("193.230.5.163");
    expect(scan.ownership.domainOwner.confidence).toBeGreaterThanOrEqual(90);
    expect(scan.ownership.applicationOrigin.confidence).toBeGreaterThanOrEqual(80);
    expect(scan.narrativeVerdict.summary).toContain("ICI Bucuresti");
  });

  // =========================================================================
  // Scenario 2: Cloudflare-Proxied Domain Scenario
  // =========================================================================
  it("T4.S02 - Cloudflare-Proxied Domain Scenario (example.com with origin leak)", () => {
    const cdnCandidate = createCandidate({
      ip: SCENARIO_CLOUDFLARE_PROXIED.cdnIp,
      domain: SCENARIO_CLOUDFLARE_PROXIED.domain,
      provider: SCENARIO_CLOUDFLARE_PROXIED.cdnProvider,
      asn: SCENARIO_CLOUDFLARE_PROXIED.cdnAsn,
      supporting: [],
      contradictions: SCENARIO_CLOUDFLARE_PROXIED.cdnContradictions
    });

    const originLeakCandidate = createCandidate({
      ip: SCENARIO_CLOUDFLARE_PROXIED.originLeakIp,
      domain: SCENARIO_CLOUDFLARE_PROXIED.domain,
      provider: SCENARIO_CLOUDFLARE_PROXIED.originProvider,
      asn: SCENARIO_CLOUDFLARE_PROXIED.originAsn,
      supporting: SCENARIO_CLOUDFLARE_PROXIED.originSupporting,
      contradictions: []
    });

    expect(cdnCandidate.score).toBe(0);
    expect(cdnCandidate.classification).toBe("cdn-proxy");

    expect(originLeakCandidate.score).toBe(75);
    expect(originLeakCandidate.classification).toBe("likely-origin");

    const scan = createScanResult({
      targetDomain: SCENARIO_CLOUDFLARE_PROXIED.domain,
      candidates: [originLeakCandidate, cdnCandidate],
      ownership: {
        hostingProvider: {
          concept: "hostingProvider",
          label: "Hosting Provider",
          identity: "Cloudflare Anycast CDN Proxy",
          confidence: 95,
          evidenceCount: 3,
          explanation: "Public traffic proxied via Cloudflare network."
        },
        applicationOrigin: {
          concept: "applicationOrigin",
          label: "Application Origin Server",
          identity: SCENARIO_CLOUDFLARE_PROXIED.originLeakIp,
          confidence: originLeakCandidate.score,
          evidenceCount: 3,
          explanation: "Subdomain DNS leak dev.example.com revealed Hetzner backend origin IP."
        }
      },
      narrativeSummary: "Target is proxied by Cloudflare CDN. Unverified origin leak candidate discovered at 185.190.140.10 (Hetzner)."
    });

    expect(scan.topOriginCandidate?.ip).toBe("185.190.140.10");
    expect(scan.topOriginCandidate?.classification).toBe("likely-origin");
    expect(scan.narrativeVerdict.summary).toContain("Cloudflare");
  });

  // =========================================================================
  // Scenario 3: Separate MX Infrastructure Scenario
  // =========================================================================
  it("T4.S03 - Separate MX Infrastructure Scenario (company.org)", () => {
    const webCandidate = createCandidate({
      ip: "104.16.123.96",
      domain: SCENARIO_SEPARATE_MX.domain,
      provider: "Cloudflare",
      contradictions: [NEG_CDN_ASN]
    });

    const mxCandidate = createCandidate({
      ip: SCENARIO_SEPARATE_MX.mxIp,
      domain: SCENARIO_SEPARATE_MX.mxExchange,
      provider: SCENARIO_SEPARATE_MX.mxProvider,
      asn: SCENARIO_SEPARATE_MX.mxAsn,
      roleTag: "email-only",
      contradictions: SCENARIO_SEPARATE_MX.mxContradictions
    });

    expect(mxCandidate.classification).toBe("email-only");

    const scan = createScanResult({
      targetDomain: SCENARIO_SEPARATE_MX.domain,
      candidates: [webCandidate, mxCandidate],
      mxInfrastructure: {
        domain: SCENARIO_SEPARATE_MX.domain,
        mxRecords: [SCENARIO_SEPARATE_MX.mxExchange],
        ips: [SCENARIO_SEPARATE_MX.mxIp],
        providers: [SCENARIO_SEPARATE_MX.mxProvider],
        isolatedFromWebOrigin: true
      },
      narrativeSummary: "Email traffic handled by Google Workspace MX infrastructure, completely isolated from web origin."
    });

    // Exclude email-only from web candidates pool
    const webOriginPool = scan.candidates.filter((c) => c.classification !== "email-only");
    expect(webOriginPool).toHaveLength(1);
    expect(webOriginPool[0].ip).toBe("104.16.123.96");
    expect(scan.mxInfrastructure.isolatedFromWebOrigin).toBe(true);
    expect(scan.mxInfrastructure.providers).toContain("Google LLC / Google Workspace");
  });

  // =========================================================================
  // Scenario 4: Shared Hosting Domain Scenario
  // =========================================================================
  it("T4.S04 - Shared Hosting Domain Scenario (smallbiz.org)", () => {
    const sharedCandidate = createCandidate({
      ip: SCENARIO_SHARED_HOSTING.ip,
      domain: SCENARIO_SHARED_HOSTING.domain,
      provider: SCENARIO_SHARED_HOSTING.provider,
      asn: SCENARIO_SHARED_HOSTING.asn,
      supporting: SCENARIO_SHARED_HOSTING.supporting,
      contradictions: SCENARIO_SHARED_HOSTING.contradictions
    });

    // +20 -20 -15 = -15 -> clamped to 0
    expect(sharedCandidate.score).toBe(0);
    expect(sharedCandidate.classification).toBe("shared-hosting");
    expect(sharedCandidate.contradictionSignals.some((c) => c.id === "NEG_GENERIC_LANDING")).toBe(true);
    expect(sharedCandidate.contradictionSignals.some((c) => c.id === "NEG_TLS_CERT_MISMATCH")).toBe(true);

    const scan = createScanResult({
      targetDomain: SCENARIO_SHARED_HOSTING.domain,
      candidates: [sharedCandidate],
      ownership: {
        hostingProvider: {
          concept: "hostingProvider",
          label: "Hosting Provider",
          identity: "DigitalOcean Shared Web Hosting",
          confidence: 80,
          evidenceCount: 2,
          explanation: "Candidate IP serves default cPanel welcome page; shared hosting environment."
        }
      },
      narrativeSummary: "Candidate IP 192.241.150.10 is a shared hosting server returning generic landing page contradiction."
    });

    expect(scan.candidates[0].classification).toBe("shared-hosting");
    expect(scan.narrativeVerdict.summary).toContain("shared hosting");
  });

  // =========================================================================
  // Scenario 5: Subleased / Reseller IP Space Scenario
  // =========================================================================
  it("T4.S05 - Subleased / Reseller IP Space Scenario (reseller-app.net)", () => {
    const candidate = createCandidate({
      ip: SCENARIO_SUBLEASED_IP.ip,
      domain: SCENARIO_SUBLEASED_IP.domain,
      provider: `${SCENARIO_SUBLEASED_IP.bgpOriginAsnOrg} (Subleased)`,
      asn: "AS24940",
      supporting: [POS_TLS_SAN_MATCH, POS_HTTP_CONTENT_MATCH]
    });

    expect(candidate.score).toBe(55);

    const ownership = createDecoupledOwnership({
      ipAllocation: {
        concept: "ipAllocation",
        label: "IP Allocation Owner",
        identity: SCENARIO_SUBLEASED_IP.rirOwner,
        confidence: 90,
        evidenceCount: 2,
        explanation: "RIPE NCC allocation block assigned to Hetzner Online GmbH."
      },
      networkOperation: {
        concept: "networkOperation",
        label: "Network Operation",
        identity: `${SCENARIO_SUBLEASED_IP.bgpOriginAsnOrg} (Subleased Network)`,
        confidence: SCENARIO_SUBLEASED_IP.expectedNetworkConfidence,
        evidenceCount: 2,
        explanation: SCENARIO_SUBLEASED_IP.explanation
      }
    });

    const scan = createScanResult({
      targetDomain: SCENARIO_SUBLEASED_IP.domain,
      candidates: [candidate],
      ownership,
      narrativeSummary: "Origin hosted on subleased/reseller network FastHosting Reseller LLC operating on Hetzner parent IP space."
    });

    expect(scan.ownership.ipAllocation.identity).toContain("Hetzner");
    expect(scan.ownership.networkOperation.identity).toContain("FastHosting Reseller");
    expect(scan.ownership.networkOperation.confidence).toBe(60);
    expect(scan.ownership.networkOperation.explanation).toContain("subleased");
    expect(scan.narrativeVerdict.summary).toContain("subleased");
  });
});
