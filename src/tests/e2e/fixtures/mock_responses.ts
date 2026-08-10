/**
 * Mock Responses & Test Fixture Generators for Opaque-Box E2E Testing
 * Domain Check Origin / Hosting / Ownership Correlation Engine
 */

import {
  CandidateClassification,
  DecoupledOwnershipModel,
  EvidenceCategory,
  EvidenceSignal,
  EvidenceType,
  MxInfrastructureSummary,
  NarrativeVerdict,
  OriginCandidateDetailed,
  OwnershipConcept,
  OwnershipConceptType,
  ScanResult
} from "../../../shared/types.js";
import {
  calculateScore as realCalculateScore,
  classifyCandidate as realClassifyCandidate,
  CONTRADICTION_SIGNALS,
  POSITIVE_SIGNALS,
  scoreOriginCandidate
} from "../../../server/engine/scoring.js";
import { computeDecoupledOwnership } from "../../../server/engine/ownership.js";

// Re-export standard type aliases for backward compatibility
export type {
  CandidateClassification,
  DecoupledOwnershipModel,
  EvidenceCategory,
  EvidenceSignal,
  OriginCandidateDetailed,
  OwnershipConcept,
  OwnershipConceptType,
  ScanResult
};
export type SignalType = EvidenceType;

// Re-export authentic signals from engine catalog
export const POS_TLS_SAN_MATCH: EvidenceSignal = POSITIVE_SIGNALS.POS_TLS_SAN_MATCH;
export const POS_HTTP_CONTENT_MATCH: EvidenceSignal = POSITIVE_SIGNALS.POS_HTTP_CONTENT_MATCH;
export const POS_SUBDOMAIN_LEAK: EvidenceSignal = POSITIVE_SIGNALS.POS_SUBDOMAIN_LEAK;
export const POS_PTR_DOMAIN_MATCH: EvidenceSignal = POSITIVE_SIGNALS.POS_PTR_DOMAIN_MATCH;
export const POS_ASN_MATCH: EvidenceSignal = POSITIVE_SIGNALS.POS_ASN_MATCH;

export const NEG_CDN_ASN: EvidenceSignal = CONTRADICTION_SIGNALS.NEG_CDN_ASN;
export const NEG_CLOUD_WAF_HEADER: EvidenceSignal = CONTRADICTION_SIGNALS.NEG_CLOUD_WAF_HEADER;
export const NEG_GENERIC_LANDING: EvidenceSignal = CONTRADICTION_SIGNALS.NEG_GENERIC_LANDING;
export const NEG_TLS_CERT_MISMATCH: EvidenceSignal = CONTRADICTION_SIGNALS.NEG_TLS_CERT_MISMATCH;
export const NEG_MX_INFRASTRUCTURE: EvidenceSignal = CONTRADICTION_SIGNALS.NEG_MX_INFRASTRUCTURE;

/**
 * Delegate score calculation to authentic scoring engine.
 */
export function calculateScore(
  supporting: EvidenceSignal[],
  contradictions: EvidenceSignal[]
): number {
  return realCalculateScore(supporting, contradictions);
}

/**
 * Delegate classification to authentic scoring engine.
 */
export function classifyCandidate(
  score: number,
  supporting: EvidenceSignal[],
  contradictions: EvidenceSignal[],
  roleTag?: string
): CandidateClassification {
  const isMxIpOnly = roleTag === "email-only" || contradictions.some((c) => c.id === "NEG_MX_INFRASTRUCTURE");
  return realClassifyCandidate(score, supporting, contradictions, isMxIpOnly);
}

/**
 * Helper to construct an OriginCandidateDetailed
 */
export function createCandidate(params: {
  ip: string;
  domain: string;
  supporting?: EvidenceSignal[];
  contradictions?: EvidenceSignal[];
  provider?: string;
  asn?: string;
  location?: string;
  roleTag?: string;
  forcedScore?: number;
  forcedClassification?: CandidateClassification;
}): OriginCandidateDetailed {
  const supporting = params.supporting || [];
  const contradictions = params.contradictions || [];
  const score =
    params.forcedScore !== undefined
      ? Math.max(0, Math.min(100, params.forcedScore))
      : calculateScore(supporting, contradictions);
  const classification =
    params.forcedClassification ||
    classifyCandidate(score, supporting, contradictions, params.roleTag);

  return {
    ip: params.ip,
    domain: params.domain,
    classification,
    score,
    supportingSignals: supporting,
    contradictionSignals: contradictions,
    provider: params.provider || "Unknown Provider",
    asn: params.asn || "AS0",
    location: params.location || "Unknown Location",
    rawSignals: {
      roleTag: params.roleTag,
      supportingCount: supporting.length,
      contradictionCount: contradictions.length
    },
    explanation: ""
  };
}

/**
 * Helper to construct a DecoupledOwnershipModel using computeDecoupledOwnership engine function
 */
export function createDecoupledOwnership(
  overrides?: Partial<DecoupledOwnershipModel>
): DecoupledOwnershipModel {
  const base = computeDecoupledOwnership({
    domain: { registrantOrg: "Example Organization Inc." },
    topCandidate: {
      ip: "195.201.50.20",
      score: 85,
      provider: "Hetzner Dedicated Server",
      asn: "AS24940"
    }
  });
  return { ...base, ...overrides };
}

/**
 * Helper to construct a complete ScanResult
 */
export function createScanResult(params: {
  targetDomain: string;
  candidates?: OriginCandidateDetailed[];
  ownership?: Partial<DecoupledOwnershipModel>;
  mxInfrastructure?: Partial<MxInfrastructureSummary>;
  narrativeSummary?: string;
}): ScanResult {
  const candidates = params.candidates || [];
  const topCandidate = candidates.find((c) => c.classification === "likely-origin") || candidates[0];
  const ownership = createDecoupledOwnership(params.ownership);

  return {
    id: `scan-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    targetDomain: params.targetDomain,
    timestamp: new Date().toISOString(),
    status: "completed",
    progress: 100,
    currentStage: "stage-6",
    stageName: "Final Ranking & Verdict",
    domain: {
      domain: params.targetDomain,
      statuses: ["active"],
      nameservers: [`ns1.${params.targetDomain}`, `ns2.${params.targetDomain}`],
      privacyDetected: false,
      importantDates: {},
      sources: []
    },
    ownership: ownership as unknown as any,
    decoupledOwnership: ownership,
    ownershipModel: ownership,
    dns: {
      a: candidates.map((c) => c.ip),
      aaaa: [],
      ns: [`ns1.${params.targetDomain}`, `ns2.${params.targetDomain}`],
      mx: [{ exchange: `mail.${params.targetDomain}`, priority: 10 }],
      txt: ["v=spf1 include:_spf.google.com ~all"],
      soa: `ns1.${params.targetDomain} admin.${params.targetDomain} 2026081001 7200 3600 1209600 3600`,
      caa: ['0 issue "letsencrypt.org"'],
      ptr: { "195.201.50.20": [params.targetDomain] },
      dnssec: false,
      ttl: { a: 300 },
      wildcard: false,
      zoneTransfer: "blocked",
      warnings: []
    },
    ips: [],
    network: [],
    ports: [],
    banners: [],
    tls: [],
    http: [],
    subdomains: [],
    infrastructure: {
      roleProviders: [],
      ipChains: [],
      verdict: "Direct provider",
      confidence: "high",
      evidence: [],
      warnings: []
    },
    risks: [],
    warnings: [],
    origins: [],
    candidates,
    topOriginCandidate: topCandidate,
    mxInfrastructure: {
      domain: params.targetDomain,
      mxRecords: params.mxInfrastructure?.mxRecords || [`mail.${params.targetDomain}`],
      ips: params.mxInfrastructure?.ips || ["192.0.2.25"],
      providers: params.mxInfrastructure?.providers || ["In-House Mail"],
      isolatedFromWebOrigin:
        params.mxInfrastructure?.isolatedFromWebOrigin !== undefined
          ? params.mxInfrastructure.isolatedFromWebOrigin
          : true
    },
    narrativeVerdict: {
      summary: params.narrativeSummary || `Origin classification for ${params.targetDomain}`,
      classification: topCandidate?.classification || "unverified-leak",
      confidenceScore: topCandidate?.score || 0,
      explanation: `Analysis indicates candidate ${topCandidate?.ip || "N/A"} with score ${
        topCandidate?.score || 0
      }.`,
      keyEvidence: topCandidate?.supportingSignals.map((s) => s.title) || []
    }
  } as ScanResult;
}

// --- Tier 4 Real-World Scenario Pre-built Data Fixtures ---

export const SCENARIO_DIRECT_HOSTED = {
  domain: "ici.ro",
  ip: "193.230.5.163",
  asn: "AS3233",
  provider: "ICI Bucuresti",
  location: "Bucharest, Romania",
  supporting: [POS_TLS_SAN_MATCH, POS_HTTP_CONTENT_MATCH, POS_PTR_DOMAIN_MATCH, POS_ASN_MATCH],
  contradictions: [],
  expectedScore: 80,
  expectedClassification: "likely-origin" as CandidateClassification
};

export const SCENARIO_CLOUDFLARE_PROXIED = {
  domain: "example.com",
  cdnIp: "104.16.123.96",
  originLeakIp: "185.190.140.10",
  cdnAsn: "AS13335",
  cdnProvider: "Cloudflare, Inc.",
  originAsn: "AS24940",
  originProvider: "Hetzner Online GmbH",
  cdnContradictions: [NEG_CDN_ASN, NEG_CLOUD_WAF_HEADER],
  originSupporting: [POS_TLS_SAN_MATCH, POS_HTTP_CONTENT_MATCH, POS_SUBDOMAIN_LEAK],
  expectedCdnScore: 0,
  expectedCdnClassification: "cdn-proxy" as CandidateClassification,
  expectedOriginScore: 75,
  expectedOriginClassification: "likely-origin" as CandidateClassification
};

export const SCENARIO_SEPARATE_MX = {
  domain: "company.org",
  mxExchange: "aspmx.l.google.com",
  mxIp: "142.250.27.27",
  mxAsn: "AS15169",
  mxProvider: "Google LLC / Google Workspace",
  mxContradictions: [NEG_MX_INFRASTRUCTURE],
  expectedMxClassification: "email-only" as CandidateClassification,
  isolatedFromWebOrigin: true
};

export const SCENARIO_SHARED_HOSTING = {
  domain: "smallbiz.org",
  ip: "192.241.150.10",
  asn: "AS14061",
  provider: "DigitalOcean Shared Node",
  supporting: [POS_SUBDOMAIN_LEAK],
  contradictions: [NEG_GENERIC_LANDING, NEG_TLS_CERT_MISMATCH],
  expectedScore: 0,
  expectedClassification: "shared-hosting" as CandidateClassification
};

export const SCENARIO_SUBLEASED_IP = {
  domain: "reseller-app.net",
  ip: "195.201.50.20",
  rirOwner: "Hetzner Online GmbH",
  bgpOriginAsnOrg: "FastHosting Reseller LLC",
  isSubleased: true,
  expectedNetworkConfidence: 60,
  explanation: "Network is subleased/reseller allocated space under Hetzner parent block."
};
