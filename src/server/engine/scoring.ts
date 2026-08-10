import {
  CandidateClassification,
  EvidenceSignal,
  OriginCandidateDetailed
} from "../../shared/types.js";

export type CandidateRawInput = {
  ip: string;
  domain: string;
  provider?: string;
  asn?: string;
  location?: string;
  // Signals
  discoveredViaSubdomain?: boolean;
  subdomainName?: string;
  isHistoricalIp?: boolean;
  isMxIpOnly?: boolean;
  ptrHostname?: string;
  asnNumber?: string;
  asnOrg?: string;
  rirAllocationOwner?: string;
  registrantOrg?: string;
  tlsHandshakeSuccess?: boolean;
  tlsSanMatch?: boolean;
  tlsCertMismatch?: boolean;
  httpProbeSuccess?: boolean;
  httpContentMatch?: boolean;
  httpWafHeaderDetected?: boolean;
  httpGenericLandingPage?: boolean;
  openPorts?: number[];
  isCdnAsn?: boolean;
};

// Signal Definitions Catalog
export const POSITIVE_SIGNALS = {
  POS_TLS_SAN_MATCH: {
    id: "POS_TLS_SAN_MATCH",
    type: "supporting" as const,
    category: "tls" as const,
    weight: 30,
    title: "TLS SAN / CN Match",
    description: "Direct TLS probe on port 443 returned a certificate matching the target domain or wildcard."
  },
  POS_HTTP_CONTENT_MATCH: {
    id: "POS_HTTP_CONTENT_MATCH",
    type: "supporting" as const,
    category: "http" as const,
    weight: 25,
    title: "HTTP Host Content Match",
    description: "Direct HTTP request with target Host header returned matching application title or content."
  },
  POS_SUBDOMAIN_LEAK: {
    id: "POS_SUBDOMAIN_LEAK",
    type: "supporting" as const,
    category: "subdomain" as const,
    weight: 20,
    title: "Subdomain DNS Leak",
    description: "Candidate IP discovered via non-proxied subdomain resolution."
  },
  POS_PTR_DOMAIN_MATCH: {
    id: "POS_PTR_DOMAIN_MATCH",
    type: "supporting" as const,
    category: "ptr" as const,
    weight: 15,
    title: "Reverse DNS (PTR) Match",
    description: "Reverse DNS PTR record contains target domain or organization name."
  },
  POS_HISTORICAL_IP: {
    id: "POS_HISTORICAL_IP",
    type: "supporting" as const,
    category: "dns" as const,
    weight: 15,
    title: "Historical A Record Match",
    description: "IP was historically an A record for the domain prior to WAF adoption."
  },
  POS_ASN_MATCH: {
    id: "POS_ASN_MATCH",
    type: "supporting" as const,
    category: "asn" as const,
    weight: 10,
    title: "ASN / Allocation Match",
    description: "ASN operator or RIR allocation owner matches domain registrant organization."
  },
  POS_NON_CDN_PORT_OPEN: {
    id: "POS_NON_CDN_PORT_OPEN",
    type: "supporting" as const,
    category: "port" as const,
    weight: 5,
    title: "Non-CDN Port Open",
    description: "Backend origin ports (SSH 22, 8080, 8443, 3306) detected open."
  }
};

export const CONTRADICTION_SIGNALS = {
  NEG_CDN_ASN: {
    id: "NEG_CDN_ASN",
    type: "contradiction" as const,
    category: "asn" as const,
    weight: -30,
    title: "CDN / WAF Autonomous System",
    description: "IP belongs to a known CDN/WAF provider network (Cloudflare, Akamai, Fastly)."
  },
  NEG_CLOUD_WAF_HEADER: {
    id: "NEG_CLOUD_WAF_HEADER",
    type: "contradiction" as const,
    category: "waf" as const,
    weight: -25,
    title: "Cloud WAF / Proxy Response Header",
    description: "HTTP headers contain reverse proxy signatures (Server: cloudflare, CF-Ray)."
  },
  NEG_GENERIC_LANDING: {
    id: "NEG_GENERIC_LANDING",
    type: "contradiction" as const,
    category: "http" as const,
    weight: -20,
    title: "Shared Hosting Default Landing Page",
    description: "HTTP probe returned default hosting welcome page (cPanel, Nginx default)."
  },
  NEG_TLS_CERT_MISMATCH: {
    id: "NEG_TLS_CERT_MISMATCH",
    type: "contradiction" as const,
    category: "tls" as const,
    weight: -15,
    title: "TLS Certificate Mismatch",
    description: "Direct TLS probe returned self-signed or unrelated third-party certificate."
  },
  NEG_MX_INFRASTRUCTURE: {
    id: "NEG_MX_INFRASTRUCTURE",
    type: "contradiction" as const,
    category: "mx" as const,
    weight: -15,
    title: "Email-Only MX Infrastructure",
    description: "IP is strictly an MX mail exchange host and does not serve web application traffic."
  }
};

const PRIVACY_REGEX = /privacy|redacted|withheld|whoisguard|domains by proxy|contact privacy|select request|identity protection/i;

export function isPrivacyOrg(org?: string | null): boolean {
  if (!org) return false;
  return PRIVACY_REGEX.test(org.trim());
}

export function evaluateSignals(input: CandidateRawInput): {
  supporting: EvidenceSignal[];
  contradictions: EvidenceSignal[];
} {
  const supporting: EvidenceSignal[] = [];
  const contradictions: EvidenceSignal[] = [];

  // Positive Evaluations
  if (input.tlsSanMatch) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_TLS_SAN_MATCH,
      observedData: `TLS Certificate SAN match on ${input.ip}:443`
    });
  }
  if (input.httpContentMatch) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_HTTP_CONTENT_MATCH,
      observedData: `HTTP Host header response matched application fingerprint`
    });
  }
  if (input.discoveredViaSubdomain) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_SUBDOMAIN_LEAK,
      observedData: `Subdomain leak via ${input.subdomainName || input.domain}`
    });
  }
  if (
    input.domain &&
    input.domain.trim().length > 0 &&
    input.ptrHostname &&
    input.ptrHostname.toLowerCase().includes(input.domain.trim().toLowerCase())
  ) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_PTR_DOMAIN_MATCH,
      observedData: `PTR: ${input.ptrHostname}`
    });
  }
  if (input.isHistoricalIp) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_HISTORICAL_IP,
      observedData: `Historical DNS record match`
    });
  }
  if (
    input.registrantOrg &&
    !isPrivacyOrg(input.registrantOrg) &&
    ((input.asnOrg && input.asnOrg.toLowerCase().includes(input.registrantOrg.toLowerCase())) ||
      (input.rirAllocationOwner && input.rirAllocationOwner.toLowerCase().includes(input.registrantOrg.toLowerCase())))
  ) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_ASN_MATCH,
      observedData: `ASN/Allocation Org: ${input.asnOrg || input.rirAllocationOwner}`
    });
  }
  if (input.openPorts && input.openPorts.some((p) => [22, 8080, 8443, 3306, 5432, 27017].includes(p))) {
    supporting.push({
      ...POSITIVE_SIGNALS.POS_NON_CDN_PORT_OPEN,
      observedData: `Open non-CDN ports: ${input.openPorts.filter((p) => p !== 80 && p !== 443).join(", ")}`
    });
  }

  // Contradiction Evaluations
  if (input.isCdnAsn) {
    contradictions.push({
      ...CONTRADICTION_SIGNALS.NEG_CDN_ASN,
      observedData: `ASN ${input.asnNumber || "CDN"} identified as Cloud/CDN Proxy`
    });
  }
  if (input.httpWafHeaderDetected) {
    contradictions.push({
      ...CONTRADICTION_SIGNALS.NEG_CLOUD_WAF_HEADER,
      observedData: `HTTP response headers contained WAF/Proxy signatures`
    });
  }
  if (input.httpGenericLandingPage) {
    contradictions.push({
      ...CONTRADICTION_SIGNALS.NEG_GENERIC_LANDING,
      observedData: `HTTP response matched generic hosting default landing page`
    });
  }
  if (input.tlsCertMismatch) {
    contradictions.push({
      ...CONTRADICTION_SIGNALS.NEG_TLS_CERT_MISMATCH,
      observedData: `TLS certificate mismatch or self-signed cert on ${input.ip}:443`
    });
  }
  if (input.isMxIpOnly) {
    contradictions.push({
      ...CONTRADICTION_SIGNALS.NEG_MX_INFRASTRUCTURE,
      observedData: `Pure MX exchange IP isolated from web origin pool`
    });
  }

  return { supporting, contradictions };
}

export function calculateScore(supporting: EvidenceSignal[], contradictions: EvidenceSignal[]): number {
  const positiveSum = supporting.reduce((acc, s) => acc + s.weight, 0);
  const negativeSum = contradictions.reduce((acc, c) => acc + Math.abs(c.weight), 0);
  const rawScore = positiveSum - negativeSum;
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

export function classifyCandidate(
  score: number,
  supporting: EvidenceSignal[],
  contradictions: EvidenceSignal[],
  isMxIpOnly?: boolean
): CandidateClassification {
  const hasWebMatch = supporting.some((s) => s.id === "POS_TLS_SAN_MATCH" || s.id === "POS_HTTP_CONTENT_MATCH");
  if (isMxIpOnly && !hasWebMatch) {
    return "email-only";
  }

  const hasCdnSignal = contradictions.some((c) => c.id === "NEG_CDN_ASN" || c.id === "NEG_CLOUD_WAF_HEADER");
  if (hasCdnSignal) {
    return "cdn-proxy";
  }

  const hasGenericLanding = contradictions.some((c) => c.id === "NEG_GENERIC_LANDING");
  if (hasGenericLanding && !hasWebMatch) {
    return "shared-hosting";
  }

  if (score >= 70) {
    return "likely-origin";
  } else if (score >= 40) {
    return "possible-origin";
  } else {
    return "unverified-leak";
  }
}

export function generateCandidateExplanation(candidate: OriginCandidateDetailed): string {
  const providerText = candidate.provider ? ` (${candidate.provider})` : "";
  const locationText = candidate.location ? `, ${candidate.location}` : "";
  const scoreText = `confidence score of ${candidate.score}/100`;

  let explanation = "";

  switch (candidate.classification) {
    case "email-only":
      explanation = `Candidate IP ${candidate.ip}${providerText} is classified as email-only with a ${scoreText}. This IP is strictly associated with mail exchange (MX) infrastructure and does not serve web application origin traffic.`;
      break;
    case "cdn-proxy":
      explanation = `Candidate IP ${candidate.ip}${providerText} is classified as a cdn-proxy with a ${scoreText}. Strong contradiction signals indicate this IP belongs to a CDN or Cloud WAF reverse proxy layer and is not the physical origin server.`;
      break;
    case "shared-hosting":
      explanation = `Candidate IP ${candidate.ip}${providerText} is classified as shared-hosting with a ${scoreText}. HTTP probing returned a default hosting landing page, indicating a shared server environment.`;
      break;
    case "likely-origin":
      explanation = `Candidate IP ${candidate.ip}${providerText}${locationText} is classified as a likely origin server for ${candidate.domain} with a high ${scoreText}. Multiple positive evidence signals directly confirm unproxied application origin status.`;
      break;
    case "possible-origin":
      explanation = `Candidate IP ${candidate.ip}${providerText}${locationText} is classified as a possible origin server with a moderate ${scoreText}. Partial positive signals were detected, but further verification is recommended.`;
      break;
    case "unverified-leak":
    default:
      explanation = `Candidate IP ${candidate.ip}${providerText} is classified as an unverified leak with a low ${scoreText}. Passive signals detected potential association, but active probing was inconclusive or unreachable.`;
      break;
  }

  if (candidate.supportingSignals && candidate.supportingSignals.length > 0) {
    const topSignals = candidate.supportingSignals.map((s) => `${s.title} (+${s.weight})`).join(", ");
    explanation += ` Key supporting factors: ${topSignals}.`;
  }

  if (candidate.contradictionSignals && candidate.contradictionSignals.length > 0) {
    const topPenalties = candidate.contradictionSignals.map((c) => `${c.title} (${c.weight})`).join(", ");
    explanation += ` Contradictions: ${topPenalties}.`;
  }

  return explanation;
}

export function scoreOriginCandidate(input: CandidateRawInput): OriginCandidateDetailed {
  const { supporting, contradictions } = evaluateSignals(input);
  const score = calculateScore(supporting, contradictions);
  const classification = classifyCandidate(score, supporting, contradictions, input.isMxIpOnly);

  const confidenceLevel = score >= 70 ? "high" : score >= 40 ? "medium" : "low";

  const candidate: OriginCandidateDetailed = {
    ip: input.ip,
    domain: input.domain,
    classification,
    score,
    supportingSignals: supporting,
    contradictionSignals: contradictions,
    provider: input.provider || input.asnOrg || "Unknown Provider",
    asn: input.asn || input.asnNumber || "Unknown ASN",
    location: input.location || "Unknown Location",
    rawSignals: input,
    source: supporting.map((s) => s.title).join(", ") || "Passive Analysis",
    confidence: confidenceLevel,
    explanation: ""
  };

  candidate.explanation = generateCandidateExplanation(candidate);
  return candidate;
}
