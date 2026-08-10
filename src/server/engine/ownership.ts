import {
  ConfidenceRating,
  DecoupledOwnershipModel,
  DomainProfile,
  IpProfile,
  InfrastructureSupplyChain,
  OriginCandidateDetailed,
  OwnershipConcept
} from "../../shared/types.js";

export type OwnershipCalculationInput = {
  domain?: Partial<DomainProfile>;
  topCandidate?: Partial<OriginCandidateDetailed>;
  candidates?: Array<Partial<OriginCandidateDetailed>>;
  ipProfile?: Partial<IpProfile>;
  infrastructure?: Partial<InfrastructureSupplyChain>;
};

const CDN_ASNS = new Set([
  "13335", "20940", "54113", "19551", "16625", "132892", "30633"
]);

function getConfidenceRating(score: number): ConfidenceRating {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  if (score > 0) return "low";
  return "none";
}

export function isValidAsnNum(asn: string | undefined | null): boolean {
  if (!asn) return false;
  const clean = asn.trim().replace(/^AS/i, "").trim();
  return /^\d+$/.test(clean) && parseInt(clean, 10) > 0;
}

export function isValidOrgName(org: string | undefined | null): boolean {
  if (!org) return false;
  const trimmed = org.trim();
  if (trimmed.length === 0) return false;
  return !/^(unknown|n\/a|none|unclassified|null|undefined)(\s+(provider|host|org|asn|owner|location))?$/i.test(trimmed);
}

export function normalizeOrgName(name: string): string {
  if (!name) return "";
  let clean = name.toLowerCase();
  clean = clean.replace(/\b(inc|incorporated|llc|l\.l\.c\.|gmbh|ltd|limited|corp|corporation|co|company|b\.v\.|bv|ag|sa|s\.a\.|pty|pte|srl|s\.r\.l\.|plc)\b/gi, "");
  clean = clean.replace(/[^a-z0-9]/g, "");
  return clean.trim();
}

export function areOrgsMatching(org1?: string, org2?: string): boolean {
  if (!org1 || !org2) return false;
  const n1 = normalizeOrgName(org1);
  const n2 = normalizeOrgName(org2);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;
  if (n1.length >= 4 && n2.length >= 4) {
    if (n1.includes(n2) || n2.includes(n1)) return true;
  }
  return false;
}

export function computeDecoupledOwnership(
  input: OwnershipCalculationInput
): DecoupledOwnershipModel {
  const domain = input.domain || {};
  const topCandidate = input.topCandidate;
  const candidates = input.candidates || (topCandidate ? [topCandidate] : []);
  const ipProfile = input.ipProfile || {};
  const infrastructure = input.infrastructure || {};

  return {
    domainOwner: calculateDomainOwnership(domain),
    ipAllocation: calculateIpAllocation(ipProfile, topCandidate),
    asnOperation: calculateAsnOperation(ipProfile, topCandidate),
    networkOperation: calculateNetworkOperation(ipProfile, infrastructure),
    hostingProvider: calculateHostingProvider(ipProfile, topCandidate),
    applicationOrigin: calculateApplicationOrigin(topCandidate, candidates),
    physicalLocation: calculatePhysicalLocation(ipProfile, topCandidate)
  };
}

function calculateDomainOwnership(domain: Partial<DomainProfile>): OwnershipConcept {
  const org = domain.registrantOrg?.trim();
  const registrar = domain.registrar?.trim();
  const privacy = domain.privacyDetected || (org ? /privacy|redacted|withheld|whoisguard/i.test(org) : false);
  const evidenceCount = domain.sources?.length || (org ? 1 : 0);

  if (org && !privacy) {
    const confidence = (domain.sources?.length || 1) >= 2 ? 95 : 90;
    return {
      concept: "domainOwner",
      label: "Domain Ownership",
      identity: org,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount,
      explanation: `Domain registrant organization explicitly verified via WHOIS/RDAP as '${org}'.`,
      details: { registrantOrg: org, registrar, privacyDetected: false }
    };
  }

  if (privacy) {
    const confidence = 20;
    return {
      concept: "domainOwner",
      label: "Domain Ownership",
      identity: "Redacted (Privacy Protected)",
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount,
      explanation: "Domain registration WHOIS data is obfuscated by a privacy protection service. Identity cannot be directly attributed.",
      details: { registrantOrg: org, registrar, privacyDetected: true }
    };
  }

  if (registrar) {
    const confidence = 40;
    return {
      concept: "domainOwner",
      label: "Domain Ownership",
      identity: `Registered via ${registrar} (Registrant Hidden)`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 1,
      explanation: `Domain registrar identified as '${registrar}', but registrant organization details are omitted from public WHOIS.`,
      details: { registrar, privacyDetected: false }
    };
  }

  const confidence = 0;
  return {
    concept: "domainOwner",
    label: "Domain Ownership",
    identity: "Unknown Domain Owner",
    confidence,
    confidenceRating: getConfidenceRating(confidence),
    evidenceCount: 0,
    explanation: "No public WHOIS or RDAP domain registration records were obtainable.",
    details: { privacyDetected: false }
  };
}

function calculateIpAllocation(
  ipProfile: Partial<IpProfile>,
  topCandidate?: Partial<OriginCandidateDetailed>
): OwnershipConcept {
  const ip = ipProfile.ip || topCandidate?.ip || "Unknown IP";
  const rirOwner = ipProfile.rirAllocationOwner || ipProfile.landlord;
  const netName = ipProfile.networkName;
  const prefix = ipProfile.announcedPrefix;
  const rir = ipProfile.asn?.rir || "RIR";
  const evidenceCount = ipProfile.sources?.length || 1;

  if (rirOwner) {
    const identity = netName ? `${rirOwner} (${netName})` : rirOwner;
    const confidence = 95;
    return {
      concept: "ipAllocation",
      label: "IP Allocation (RIR)",
      identity,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount,
      explanation: `RIR (${rir}) RDAP inetnum allocation confirms netblock owner is '${rirOwner}'${prefix ? ' [' + prefix + ']' : ''}.`,
      details: { ip, rir, allocationOwner: rirOwner, networkName: netName, announcedPrefix: prefix }
    };
  }

  if (ipProfile.asn?.org) {
    const confidence = 50;
    return {
      concept: "ipAllocation",
      label: "IP Allocation (RIR)",
      identity: `${ipProfile.asn.org} (Inferred from ASN)`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 1,
      explanation: `Direct RIR inetnum allocation record missing; allocation inferred from Autonomous System organization '${ipProfile.asn.org}'.`,
      details: { ip, rir, allocationOwner: ipProfile.asn.org }
    };
  }

  const confidence = 0;
  return {
    concept: "ipAllocation",
    label: "IP Allocation (RIR)",
    identity: "Unknown IP Allocation",
    confidence,
    confidenceRating: getConfidenceRating(confidence),
    evidenceCount: 0,
    explanation: `No RIR allocation or RDAP netblock record was found for IP ${ip}.`,
    details: { ip }
  };
}

function calculateAsnOperation(
  ipProfile: Partial<IpProfile>,
  topCandidate?: Partial<OriginCandidateDetailed>
): OwnershipConcept {
  const rawAsn = ipProfile.asn?.asn || topCandidate?.asn;
  const rawOrg = ipProfile.asn?.org || topCandidate?.provider;
  const cleanAsn = rawAsn ? rawAsn.trim().replace(/^AS/i, "").trim() : undefined;
  const validAsn = isValidAsnNum(cleanAsn) ? cleanAsn : undefined;
  const validOrg = isValidOrgName(rawOrg) ? rawOrg!.trim() : undefined;

  if (validAsn && validOrg) {
    const confidence = 95;
    return {
      concept: "asnOperation",
      label: "Autonomous System (ASN)",
      identity: `AS${validAsn} - ${validOrg}`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 2,
      explanation: `BGP routing table and RIR records confirm origin Autonomous System AS${validAsn} (${validOrg}).`,
      details: { asn: `AS${validAsn}`, orgName: validOrg }
    };
  }

  if (validAsn) {
    const confidence = 60;
    return {
      concept: "asnOperation",
      label: "Autonomous System (ASN)",
      identity: `AS${validAsn}`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 1,
      explanation: `Autonomous System number AS${validAsn} detected, but organization details could not be retrieved.`,
      details: { asn: `AS${validAsn}` }
    };
  }

  const confidence = 0;
  return {
    concept: "asnOperation",
    label: "Autonomous System (ASN)",
    identity: "Unknown ASN",
    confidence,
    confidenceRating: getConfidenceRating(confidence),
    evidenceCount: 0,
    explanation: "IP address is not associated with an observed BGP Autonomous System.",
    details: {}
  };
}

function calculateNetworkOperation(
  ipProfile: Partial<IpProfile>,
  infrastructure: Partial<InfrastructureSupplyChain>
): OwnershipConcept {
  const rawAsn = ipProfile.asn?.asn || ipProfile.originAsn;
  const cleanAsn = rawAsn ? rawAsn.trim().replace(/^AS/i, "").trim() : undefined;
  const asnNum = isValidAsnNum(cleanAsn) ? cleanAsn : undefined;
  const rirOwner = ipProfile.rirAllocationOwner;
  const asnOrg = ipProfile.asn?.org;
  const upstreams = ipProfile.upstreams || [];

  const leaseSignal = infrastructure.ipChains?.[0]?.leaseSignals?.[0];
  const hasValidRirOwner = isValidOrgName(rirOwner);
  const hasValidAsnOrg = isValidOrgName(asnOrg);
  const isSubleased =
    leaseSignal?.kind === "subleased" ||
    (hasValidRirOwner && hasValidAsnOrg && !areOrgsMatching(rirOwner, asnOrg));
  const isSuballocated = leaseSignal?.kind === "suballocated";

  if (isSubleased && hasValidRirOwner && hasValidAsnOrg) {
    const confidence = 75;
    return {
      concept: "networkOperation",
      label: "Network Operation & Sublease",
      identity: `Subleased Space (${asnOrg} on ${rirOwner})`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 2,
      explanation: `Subleased network space detected: Netblock allocated to '${rirOwner}' but operated by '${asnOrg}' (AS${asnNum || 'Unknown'}).`,
      details: { originAsn: asnNum ? `AS${asnNum}` : undefined, isSubleased: true }
    };
  }

  if (isSuballocated) {
    const confidence = 60;
    return {
      concept: "networkOperation",
      label: "Network Operation & Sublease",
      identity: `Suballocated Route Mismatch (AS${asnNum || 'Unknown'})`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 2,
      explanation: `BGP origin AS mismatch detected for AS${asnNum || 'Unknown'}, indicating suballocated route object.`,
      details: { originAsn: asnNum ? `AS${asnNum}` : undefined, isSuballocated: true }
    };
  }

  if (asnNum) {
    const upstreamList = upstreams.map(u => u.asn).join(", ");
    const confidence = 90;
    return {
      concept: "networkOperation",
      label: "Network Operation & Sublease",
      identity: `Direct Network Operation (AS${asnNum})`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 1 + upstreams.length,
      explanation: `Direct network operation by AS${asnNum}${upstreamList ? ' with upstreams [' + upstreamList + ']' : ''}. No subleasing observed.`,
      details: { originAsn: `AS${asnNum}`, upstreamAsns: upstreams.map(u => u.asn), isSubleased: false, isSuballocated: false }
    };
  }

  const confidence = 0;
  return {
    concept: "networkOperation",
    label: "Network Operation & Sublease",
    identity: "Unknown Network Operation",
    confidence,
    confidenceRating: getConfidenceRating(confidence),
    evidenceCount: 0,
    explanation: "Insufficient routing topology data to determine network operation status.",
    details: {}
  };
}

function calculateHostingProvider(
  ipProfile: Partial<IpProfile>,
  topCandidate?: Partial<OriginCandidateDetailed>
): OwnershipConcept {
  const rawAsn = ipProfile.asn?.asn || topCandidate?.asn || "";
  const cleanAsn = rawAsn.trim().replace(/^AS/i, "").trim();
  const asnNum = isValidAsnNum(cleanAsn) ? cleanAsn : "";
  const providerName = topCandidate?.provider || ipProfile.asn?.org || "Unknown Host";
  const isCdn = (asnNum ? CDN_ASNS.has(asnNum) : false) || topCandidate?.classification === "cdn-proxy";

  if (isCdn) {
    const confidence = 95;
    const safeProvider = isValidOrgName(providerName) ? providerName : "CDN / WAF Provider";
    return {
      concept: "hostingProvider",
      label: "Hosting Provider",
      identity: `${safeProvider} (CDN / WAF)`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 2,
      explanation: `Reverse proxy / CDN hosting provider identified as ${safeProvider} based on ASN and HTTP header fingerprinting.`,
      details: { category: "cdn" }
    };
  }

  const pType = ipProfile.providerType;
  if (pType === "cloud" || pType === "enterprise" || pType === "isp") {
    const category = pType === "cloud" ? "cloud" : "isp";
    const confidence = pType === "cloud" ? 85 : 80;
    const safeProvider = isValidOrgName(providerName) ? providerName : "Hosting Provider";
    return {
      concept: "hostingProvider",
      label: "Hosting Provider",
      identity: `${safeProvider} (${category.toUpperCase()})`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 2,
      explanation: `Infrastructure hosted on ${safeProvider} (${category}) with verified ASN and RDAP correlation.`,
      details: { category }
    };
  }

  if (isValidOrgName(providerName)) {
    const confidence = 50;
    return {
      concept: "hostingProvider",
      label: "Hosting Provider",
      identity: providerName,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 1,
      explanation: `Hosting provider identified as ${providerName}.`,
      details: { category: "unknown" }
    };
  }

  const confidence = 0;
  return {
    concept: "hostingProvider",
    label: "Hosting Provider",
    identity: "Unclassified Hosting Provider",
    confidence,
    confidenceRating: getConfidenceRating(confidence),
    evidenceCount: 0,
    explanation: "Hosting provider could not be classified.",
    details: { category: "unknown" }
  };
}

function calculateApplicationOrigin(
  topCandidate?: Partial<OriginCandidateDetailed>,
  candidates: Array<Partial<OriginCandidateDetailed>> = []
): OwnershipConcept {
  const candidateCount = candidates.length;
  const topScore = topCandidate?.totalScore ?? topCandidate?.score ?? 0;
  const isCdn = topCandidate?.classification === "cdn-proxy" ||
    topCandidate?.contradictionSignals?.some(s => s.id === "NEG_CDN_ASN") ||
    (topCandidate?.asn && CDN_ASNS.has(topCandidate.asn.replace(/^AS/i, "")));

  if (topCandidate?.ip && !isCdn && topScore >= 40) {
    const confidence = topScore;
    return {
      concept: "applicationOrigin",
      label: "Application Origin IP",
      identity: `${topCandidate.ip} (Origin Server, Score: ${topScore}/100)`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: topCandidate.supportingSignals?.length ?? 0,
      explanation: `True application origin IP identified as ${topCandidate.ip} with high confidence (${topScore}/100) based on supporting evidence signals.`,
      details: { likelyOriginIp: topCandidate.ip, candidateCount, topCandidateScore: topScore, isProxiedByCdn: false }
    };
  }

  if (isCdn) {
    const cdnConf = Math.min(topScore, 25);
    const provider = topCandidate?.provider || "CDN Proxy";
    return {
      concept: "applicationOrigin",
      label: "Application Origin IP",
      identity: `Behind CDN Proxy (${provider}) — Origin Masked`,
      confidence: cdnConf,
      confidenceRating: getConfidenceRating(cdnConf),
      evidenceCount: candidates.length,
      explanation: `Application traffic is fronted by ${provider}. Direct origin server IP is masked from public discovery.`,
      details: { candidateCount, topCandidateScore: topScore, isProxiedByCdn: true }
    };
  }

  if (topCandidate?.ip) {
    const confidence = topScore;
    return {
      concept: "applicationOrigin",
      label: "Application Origin IP",
      identity: `${topCandidate.ip} (Unverified Leak, Score: ${topScore}/100)`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 1,
      explanation: `Potential origin IP candidate ${topCandidate.ip} discovered with low confidence (${topScore}/100).`,
      details: { likelyOriginIp: topCandidate.ip, candidateCount, topCandidateScore: topScore, isProxiedByCdn: false }
    };
  }

  const confidence = 0;
  return {
    concept: "applicationOrigin",
    label: "Application Origin IP",
    identity: "No Origin Candidates Discovered",
    confidence,
    confidenceRating: getConfidenceRating(confidence),
    evidenceCount: 0,
    explanation: "No web application origin candidate IPs were detected during scanning.",
    details: { candidateCount: 0, topCandidateScore: 0, isProxiedByCdn: false }
  };
}

function calculatePhysicalLocation(
  ipProfile: Partial<IpProfile>,
  topCandidate?: Partial<OriginCandidateDetailed>
): OwnershipConcept {
  const geo = ipProfile.geo || {};
  const facilities = ipProfile.facilityPresence || [];
  const asnNum = (ipProfile.asn?.asn || topCandidate?.asn || "").replace(/^AS/i, "");
  const isAnycast = CDN_ASNS.has(asnNum) || topCandidate?.classification === "cdn-proxy";

  if (isAnycast) {
    const locStr = geo.city ? `${geo.city}, ${geo.country || 'Global'}` : (geo.country || 'Global');
    const confidence = 30;
    return {
      concept: "physicalLocation",
      label: "Physical Infrastructure Location",
      identity: `${locStr} (Global Anycast Edge)`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 1,
      explanation: "IP uses Anycast BGP routing across multiple global edge locations; physical location does not represent the origin server.",
      details: { country: geo.country, city: geo.city, coordinates: { lat: geo.lat, lon: geo.lon }, facilities }
    };
  }

  if (geo.city && geo.country) {
    const hasFac = facilities.length > 0;
    const facStr = hasFac ? ` (${facilities.join(", ")})` : "";
    const confidence = hasFac ? 90 : 80;
    return {
      concept: "physicalLocation",
      label: "Physical Infrastructure Location",
      identity: `${geo.city}, ${geo.country}${facStr}`,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: hasFac ? facilities.length + 1 : 1,
      explanation: hasFac
        ? `Physical datacenter facility confirmed at ${geo.city}, ${geo.country} (${facilities.join(", ")}).`
        : `GeoIP location verified as ${geo.city}, ${geo.country}.`,
      details: { country: geo.country, city: geo.city, coordinates: { lat: geo.lat, lon: geo.lon }, facilities }
    };
  }

  if (geo.country) {
    const confidence = 60;
    return {
      concept: "physicalLocation",
      label: "Physical Infrastructure Location",
      identity: geo.country,
      confidence,
      confidenceRating: getConfidenceRating(confidence),
      evidenceCount: 1,
      explanation: `Country-level location verified as ${geo.country}, city precision unavailable.`,
      details: { country: geo.country, coordinates: { lat: geo.lat, lon: geo.lon } }
    };
  }

  const confidence = 0;
  return {
    concept: "physicalLocation",
    label: "Physical Infrastructure Location",
    identity: "Unknown Physical Location",
    confidence,
    confidenceRating: getConfidenceRating(confidence),
    evidenceCount: 0,
    explanation: "No geographic or facility location data available for target IP.",
    details: {}
  };
}
