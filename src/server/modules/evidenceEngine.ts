import type {
  DnsRecordSet,
  EvidenceSignal,
  HttpProfile,
  IpProfile,
  OriginCandidateDetailed,
  PortFinding,
  TlsProfile
} from "../../shared/types.js";
import { classifyProvider } from "../utils.js";
import { collectHttpEvidence } from "./evidence/http.js";

export type EvidenceInput = {
  domain: string;
  ip: string;
  ipProfile?: IpProfile;
  dnsResult: DnsRecordSet;
  httpResults: HttpProfile[];
  tlsResults: TlsProfile[];
  ports: PortFinding[];
  mxIps: string[];
  subdomainHosts: string[];
  registrantOrg?: string;
  timeoutMs: number;
};

const orgText = (value?: string) => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const orgMatches = (a?: string, b?: string) => {
  const left = orgText(a);
  const right = orgText(b);
  if (!left || !right || /privacy|redacted|unknown/.test(left) || /privacy|redacted|unknown/.test(right)) return false;
  return left.includes(right) || right.includes(left);
};

const isCdnProvider = (ipProfile?: IpProfile, httpResults: HttpProfile[] = []) => {
  const provider = `${ipProfile?.asn.org ?? ""} ${ipProfile?.rirAllocationOwner ?? ""} ${ipProfile?.providerType ?? ""}`.toLowerCase();
  const httpText = httpResults.flatMap((profile) => [profile.headers.server, profile.headers["cf-ray"], profile.headers["x-sucuri-id"], profile.headers["x-cache"]]).join(" ").toLowerCase();
  return classifyProvider(provider) === "cdn" || /(cloudflare|akamai|fastly|sucuri|imperva|incapsula|ddos-guard|cloudfront)/.test(`${provider} ${httpText}`);
};

const locationText = (ipProfile?: IpProfile) => [ipProfile?.geo.city, ipProfile?.geo.region, ipProfile?.geo.country].filter(Boolean).join(", ");

const signalKey = (signal: EvidenceSignal) => `${signal.id}:${signal.observedData ?? ""}`;

export function computeScore(supporting: EvidenceSignal[], contradictions: EvidenceSignal[]): number {
  const positive = supporting.reduce((sum, signal) => sum + signal.weight, 0);
  const negative = contradictions.reduce((sum, signal) => sum + Math.abs(signal.weight), 0);
  return Math.max(0, Math.min(100, Math.round(positive - negative)));
}

export function classifyScore(score: number, contradictions: EvidenceSignal[]): OriginCandidateDetailed["classification"] {
  if (contradictions.some((signal) => signal.id === "NEG_MX_INFRASTRUCTURE")) return "email-only";
  if (contradictions.some((signal) => signal.id === "NEG_CDN_ASN" || signal.id === "NEG_CLOUD_WAF_HEADER")) return "cdn-proxy";
  if (contradictions.some((signal) => signal.id === "NEG_GENERIC_LANDING")) return "shared-hosting";
  if (score >= 70) return "likely-origin";
  if (score >= 40) return "possible-origin";
  return "unverified-leak";
}

export function buildCandidate(
  ip: string,
  domain: string,
  asn: string,
  provider: string,
  location: string,
  supporting: EvidenceSignal[],
  contradictions: EvidenceSignal[]
): OriginCandidateDetailed {
  const uniqueSupporting = Array.from(new Map(supporting.map((signal) => [signalKey(signal), signal])).values());
  const uniqueContradictions = Array.from(new Map(contradictions.map((signal) => [signalKey(signal), signal])).values());
  const score = computeScore(uniqueSupporting, uniqueContradictions);
  const classification = classifyScore(score, uniqueContradictions);
  const explanation = [
    `Candidate ${ip} has evidence score ${score}/100 and classification ${classification}.`,
    uniqueSupporting.length ? `Supporting: ${uniqueSupporting.map((signal) => `${signal.title} (+${signal.weight})`).join(", ")}.` : "No supporting evidence observed.",
    uniqueContradictions.length ? `Contradictions: ${uniqueContradictions.map((signal) => `${signal.title} (${signal.weight})`).join(", ")}.` : "No contradiction penalties applied."
  ].join(" ");
  return {
    ip,
    domain,
    classification,
    score,
    totalScore: score,
    supportingSignals: uniqueSupporting,
    contradictionSignals: uniqueContradictions,
    provider,
    asn,
    location,
    rawSignals: {
      supportingCount: uniqueSupporting.length,
      contradictionCount: uniqueContradictions.length
    },
    explanation,
    source: uniqueSupporting.map((signal) => signal.title).join(", ") || "Evidence correlation",
    confidence: score >= 70 ? "high" : score >= 40 ? "medium" : "low"
  };
}

export async function collectAllEvidence(input: EvidenceInput): Promise<OriginCandidateDetailed> {
  const supporting: EvidenceSignal[] = [];
  const contradictions: EvidenceSignal[] = [];
  const { ip, domain, ipProfile, dnsResult } = input;

  if (dnsResult.a.includes(ip) || dnsResult.aaaa.includes(ip)) {
    supporting.push({
      id: "POS_DNS_A_MATCH",
      type: "supporting",
      category: "dns",
      weight: 10,
      title: "DNS A record match",
      description: "IP-ul apare direct in A/AAAA pentru domeniul tinta.",
      observedData: ip,
      source: "dns"
    });
  }

  const leakedHosts = input.subdomainHosts.filter((host) => host.includes(domain));
  if (leakedHosts.length) {
    supporting.push({
      id: "POS_SUBDOMAIN_LEAK",
      type: "supporting",
      category: "subdomain",
      weight: 15,
      title: "DNS subdomain leak",
      description: "IP-ul a fost descoperit prin subdomenii care indica infrastructura aplicatiei.",
      observedData: leakedHosts.slice(0, 6).join(", "),
      source: "dns-subdomain"
    });
  }

  const ptrMatch = ipProfile?.ptr.find((ptr) => ptr.toLowerCase().includes(domain.toLowerCase()));
  if (ptrMatch) {
    supporting.push({
      id: "POS_PTR_DOMAIN_MATCH",
      type: "supporting",
      category: "ptr",
      weight: 10,
      title: "PTR consistent cu domeniul",
      description: "Reverse DNS contine domeniul tinta.",
      observedData: ptrMatch,
      source: "reverse-dns"
    });
  }

  if (orgMatches(input.registrantOrg, ipProfile?.asn.org) || orgMatches(input.registrantOrg, ipProfile?.rirAllocationOwner)) {
    supporting.push({
      id: "POS_ASN_MATCH",
      type: "supporting",
      category: "asn",
      weight: 15,
      title: "Hosting ASN consistent",
      description: "ASN sau alocarea RIR se potriveste cu organizatia registrantului.",
      observedData: ipProfile?.asn.org ?? ipProfile?.rirAllocationOwner,
      source: "asn-rdap"
    });
  }

  if (ipProfile?.originAsn && ipProfile.asn.asn && ipProfile.originAsn === ipProfile.asn.asn) {
    supporting.push({
      id: "POS_BGP_ORIGIN_CONSISTENT",
      type: "supporting",
      category: "asn",
      weight: 10,
      title: "BGP origin consistent",
      description: "Origin ASN observat este consistent cu profilul IP.",
      observedData: `AS${ipProfile.originAsn}`,
      source: "ripe-stat"
    });
  }

  const openPorts = input.ports.filter((port) => port.host === ip && port.state === "open").map((port) => port.port);
  if (openPorts.some((port) => [22, 80, 443, 8080, 8443].includes(port))) {
    supporting.push({
      id: "POS_NON_CDN_PORT_OPEN",
      type: "supporting",
      category: "port",
      weight: 5,
      title: "Relevant service port open",
      description: "IP-ul expune porturi compatibile cu o aplicatie origin.",
      observedData: openPorts.join(", "),
      source: "nmap-tcp"
    });
  }

  if (input.mxIps.includes(ip)) {
    contradictions.push({
      id: "NEG_MX_INFRASTRUCTURE",
      type: "contradiction",
      category: "mx",
      weight: -20,
      title: "MX-only IP",
      description: "IP-ul este asociat cu infrastructura de email si nu este confirmat ca web origin.",
      observedData: ip,
      source: "dns-mx"
    });
  }

  if (isCdnProvider(ipProfile, input.httpResults)) {
    contradictions.push({
      id: "NEG_CDN_ASN",
      type: "contradiction",
      category: "asn",
      weight: -30,
      title: "CDN signature",
      description: "IP-ul apartine unui CDN/WAF sau unui provider edge.",
      observedData: ipProfile?.asn.org ?? ipProfile?.providerType,
      source: "asn-http"
    });
  }

  if (input.httpResults.length > 4 && classifyProvider(ipProfile?.asn.org) === "cloud") {
    contradictions.push({
      id: "NEG_SHARED_INFRASTRUCTURE",
      type: "contradiction",
      category: "http",
      weight: -15,
      title: "Shared infrastructure",
      description: "Acelasi provider si mai multe hostname-uri indica infrastructura partajata.",
      observedData: `${input.httpResults.length} HTTP profiles`,
      source: "http"
    });
  }

  const httpSignals = await collectHttpEvidence(domain, ip, input.timeoutMs);
  for (const signal of httpSignals) {
    if (signal.type === "supporting") supporting.push(signal);
    else contradictions.push(signal);
  }

  return buildCandidate(
    ip,
    domain,
    ipProfile?.asn.asn ? `AS${ipProfile.asn.asn}` : ipProfile?.originAsn ? `AS${ipProfile.originAsn}` : "Unknown ASN",
    ipProfile?.asn.org ?? ipProfile?.rirAllocationOwner ?? ipProfile?.networkName ?? "Unknown Provider",
    locationText(ipProfile) || "Unknown Location",
    supporting,
    contradictions
  );
}
