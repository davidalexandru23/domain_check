import type {
  DnsRecordSet,
  HttpProfile,
  InfrastructureProvider,
  InfrastructureSupplyChain,
  IpProfile,
  IpSupplyChain,
  NetworkLeaseSignal,
  ProviderConfidence,
  SourceRef,
  UpstreamRelation
} from "../../shared/types.js";
import { classifyProvider, fetchJson, unique } from "../utils.js";

type RipeRoutingStatus = {
  data?: {
    resource?: string;
    origins?: Array<{ origin?: string | number; route_objects?: Array<{ source?: string }> }>;
    less_specifics?: Array<{ prefix?: string; origin?: string | number }>;
    more_specifics?: Array<{ prefix?: string; origin?: string | number }>;
    observed_neighbours?: number;
  };
};

type RipeNeighbours = {
  data?: {
    neighbours?: Array<{ asn?: number; type?: string; power?: number }>;
  };
};

type PeeringDbNet = {
  data?: Array<{
    asn?: number;
    name?: string;
    name_long?: string;
    info_type?: string;
    info_types?: string[];
    ix_count?: number;
    fac_count?: number;
    policy_general?: string;
    netixlan_set?: Array<{ name?: string; ixlan?: { name?: string } } | number>;
    netfac_set?: Array<{ name?: string; fac?: { name?: string } } | number>;
  }>;
};

const sourceRipe: SourceRef = { name: "RIPE Stat", url: "https://stat.ripe.net", confidence: "medium" };
const sourcePeeringDb: SourceRef = { name: "PeeringDB", url: "https://www.peeringdb.com", confidence: "medium" };
const sourceHeuristic: SourceRef = { name: "Local heuristic", confidence: "medium" };

const cleanOrg = (value?: string) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|sa|srl|gmbh|ag|bv|plc|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const orgSimilar = (a?: string, b?: string) => {
  const left = cleanOrg(a);
  const right = cleanOrg(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
};

const providerConfidence = (signals: NetworkLeaseSignal[]): ProviderConfidence => {
  if (signals.some((signal) => signal.confidence === "high")) return "high";
  if (signals.some((signal) => signal.confidence === "medium")) return "medium";
  return "low";
};

const providerNameFromHost = (host: string) => {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".");
  return parts.slice(Math.max(0, parts.length - 2)).join(".");
};

const roleProviders = (domainOwner: string | undefined, dns: DnsRecordSet, http: HttpProfile[], ips: IpProfile[]): InfrastructureProvider[] => {
  const providers: InfrastructureProvider[] = [];
  if (domainOwner) {
    providers.push({ role: "domain-owner", name: domainOwner, confidence: "medium", evidence: [sourceHeuristic] });
  }
  for (const nsProvider of unique(dns.ns.map(providerNameFromHost))) {
    providers.push({ role: "dns", name: nsProvider, confidence: "medium", evidence: [{ name: "DNS NS", confidence: "high" }] });
  }
  for (const mxProvider of unique(dns.mx.map((mx) => providerNameFromHost(mx.exchange)).filter(Boolean))) {
    providers.push({ role: "email", name: mxProvider, confidence: "medium", evidence: [{ name: "DNS MX", confidence: "high" }] });
  }
  for (const ip of ips) {
    if (ip.asn.org) {
      providers.push({ role: ip.providerType === "cdn" ? "cdn" : "hosting", name: ip.asn.org, confidence: "high", evidence: ip.sources });
    }
  }
  for (const profile of http) {
    const server = profile.headers.server;
    if (server && /(cloudflare|akamai|fastly|cloudfront|cdn)/i.test(server)) {
      providers.push({ role: "cdn", name: server, confidence: "medium", evidence: [{ name: "HTTP Server header", url: profile.url, confidence: "medium" }] });
    }
  }
  return unique(providers.map((provider) => `${provider.role}:${provider.name}`)).map((key) => providers.find((provider) => `${provider.role}:${provider.name}` === key)!);
};

const fetchRipeForIp = async (ip: IpProfile, timeoutMs: number) => {
  const status = await fetchJson<RipeRoutingStatus>(`https://stat.ripe.net/data/routing-status/data.json?resource=${encodeURIComponent(ip.ip)}`, timeoutMs);
  const origin = status.data?.origins?.[0];
  return {
    originAsn: origin?.origin != null ? String(origin.origin).replace(/^AS/i, "") : undefined,
    announcedPrefix: status.data?.resource,
    lessSpecificOrigin: status.data?.less_specifics?.[0]?.origin != null ? String(status.data.less_specifics[0].origin).replace(/^AS/i, "") : undefined,
    moreSpecificOrigin: status.data?.more_specifics?.[0]?.origin != null ? String(status.data.more_specifics[0].origin).replace(/^AS/i, "") : undefined,
    observedNeighbours: status.data?.observed_neighbours
  };
};

const fetchRipeNeighbours = async (asn: string, timeoutMs: number): Promise<{ upstreams: UpstreamRelation[]; peers: UpstreamRelation[] }> => {
  const response = await fetchJson<RipeNeighbours>(`https://stat.ripe.net/data/asn-neighbours/data.json?resource=AS${encodeURIComponent(asn)}`, timeoutMs);
  const relations = (response.data?.neighbours ?? []).slice(0, 24).map((item): UpstreamRelation => {
    const relationship = item.type === "left" ? "upstream" : item.type === "right" ? "downstream" : item.type === "uncertain" ? "unknown" : "peer";
    return { asn: String(item.asn ?? ""), relationship, source: sourceRipe };
  }).filter((item) => item.asn);
  return {
    upstreams: relations.filter((item) => item.relationship === "upstream").slice(0, 8),
    peers: relations.filter((item) => item.relationship === "peer" || item.relationship === "unknown").slice(0, 8)
  };
};

const fetchPeeringDb = async (asn: string, timeoutMs: number) => {
  const response = await fetchJson<PeeringDbNet>(`https://www.peeringdb.com/api/net?asn=${encodeURIComponent(asn)}&depth=2`, timeoutMs);
  const net = response.data?.[0];
  const ixPresence = (net?.netixlan_set ?? [])
    .map((item) => (typeof item === "number" ? undefined : item.name ?? item.ixlan?.name))
    .filter((item): item is string => Boolean(item))
    .slice(0, 10);
  const facilityPresence = (net?.netfac_set ?? [])
    .map((item) => (typeof item === "number" ? undefined : item.name ?? item.fac?.name))
    .filter((item): item is string => Boolean(item))
    .slice(0, 10);
  return {
    name: net?.name_long ?? net?.name,
    infoType: net?.info_type ?? net?.info_types?.join(", "),
    ixPresence,
    facilityPresence,
    source: sourcePeeringDb
  };
};

const leaseSignalsFor = (ip: IpProfile, domainOwner?: string): NetworkLeaseSignal[] => {
  const signals: NetworkLeaseSignal[] = [];
  const ipOwner = ip.asn.org || ip.rirAllocationOwner || ip.networkName;

  if (domainOwner && ipOwner && orgSimilar(domainOwner, ipOwner)) {
    signals.push({ kind: "in-house", message: `Domain owner name (${domainOwner}) matches ASN/allocation owner.`, confidence: "high", evidence: [sourceHeuristic] });
  }

  if (ipOwner && (!domainOwner || !orgSimilar(domainOwner, ipOwner))) {
    if (["cloud", "cdn"].includes(ip.providerType)) {
      signals.push({ kind: ip.providerType === "cdn" ? "cdn-proxy" : "direct-provider", message: `${ipOwner} appears to provide ${ip.providerType} infrastructure for the domain owner.`, confidence: "high", evidence: ip.sources });
    } else if (["enterprise", "isp"].includes(ip.providerType) || ip.asn.asn) {
      signals.push({ kind: "direct-provider", message: `${ipOwner} (AS${ip.asn.asn ?? "unknown"}) operates the hosting infrastructure for the target domain.`, confidence: "high", evidence: ip.sources });
    }
  }

  if (ip.rirAllocationOwner && ip.asn.org && !orgSimilar(ip.rirAllocationOwner, ip.asn.org)) {
    signals.push({ kind: "subleased", message: "RIR allocation owner differs from ASN owner, which can indicate delegated, reseller or subleased network space.", confidence: "medium", evidence: ip.sources });
  }
  if (ip.originAsn && ip.asn.asn && ip.originAsn !== ip.asn.asn) {
    signals.push({ kind: "suballocated", message: "Observed BGP origin differs from the ASN inferred from IP enrichment.", confidence: "medium", evidence: [sourceRipe] });
  }
  if (!signals.length) {
    signals.push({ kind: "unknown", message: "Public evidence is not enough to classify ownership or leasing relationship.", confidence: "low", evidence: [sourceHeuristic] });
  }
  return signals;
};

const verdictFor = (chains: IpSupplyChain[]): InfrastructureSupplyChain["verdict"] => {
  const kinds = chains.flatMap((chain) => chain.leaseSignals.map((signal) => signal.kind));
  if (kinds.includes("subleased") || kinds.includes("suballocated")) return "Likely subleased network";
  if (kinds.includes("cdn-proxy")) return "CDN/proxy provider";
  if (kinds.includes("reseller")) return "Hosted by reseller";
  if (kinds.includes("direct-provider")) return "Direct provider";
  if (kinds.includes("in-house")) return "In-house infrastructure";
  return "Unknown, insufficient public evidence";
};

export const buildInfrastructureSupplyChain = async (
  domainOwner: string | undefined,
  dns: DnsRecordSet,
  ips: IpProfile[],
  http: HttpProfile[],
  enabled: boolean,
  timeoutMs: number
): Promise<{ infrastructure: InfrastructureSupplyChain; ips: IpProfile[] }> => {
  const warnings: string[] = [];
  const enrichedIps: IpProfile[] = [];

  for (const ip of ips) {
    let next: IpProfile = { ...ip };
    if (enabled) {
      try {
        const ripe = await fetchRipeForIp(next, timeoutMs);
        next = {
          ...next,
          originAsn: ripe.originAsn ?? next.originAsn ?? next.asn.asn,
          announcedPrefix: ripe.announcedPrefix ?? next.announcedPrefix
        };
      } catch (error) {
        warnings.push(`RIPE Stat failed for ${ip.ip}: ${error instanceof Error ? error.message : "unknown error"}`);
      }

      const asn = next.originAsn ?? next.asn.asn;
      if (asn) {
        try {
          const relations = await fetchRipeNeighbours(asn, timeoutMs);
          next = { ...next, upstreams: relations.upstreams, peers: relations.peers };
        } catch (error) {
          warnings.push(`RIPE neighbours failed for AS${asn}: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        try {
          const peering = await fetchPeeringDb(asn, timeoutMs);
          next = {
            ...next,
            asn: { ...next.asn, org: next.asn.org ?? peering.name },
            ixPresence: peering.ixPresence,
            facilityPresence: peering.facilityPresence
          };
        } catch (error) {
          warnings.push(`PeeringDB failed for AS${asn}: ${error instanceof Error ? error.message : "unknown error"}`);
        }
      }
    }
    enrichedIps.push(next);
  }

  const chains: IpSupplyChain[] = enrichedIps.map((ip) => {
    const signals = leaseSignalsFor(ip, domainOwner);
    return {
      ip: ip.ip,
      providerRole: ip.providerType === "cdn" ? "cdn" : ip.providerType === "unknown" ? "unknown" : "hosting",
      allocation: {
        rir: ip.asn.rir,
        networkName: ip.networkName,
        allocationOwner: ip.rirAllocationOwner,
        parentNetwork: ip.parentNetwork,
        announcedPrefix: ip.announcedPrefix,
        originAsn: ip.originAsn ?? ip.asn.asn,
        originOrg: ip.asn.org
      },
      leaseSignals: signals,
      upstreams: ip.upstreams,
      peers: ip.peers,
      ixPresence: ip.ixPresence,
      facilityPresence: ip.facilityPresence,
      confidence: providerConfidence(signals)
    };
  });

  const evidence = unique(chains.flatMap((chain) => chain.leaseSignals.flatMap((signal) => signal.evidence).map((source) => source.name)))
    .map((name) => chains.flatMap((chain) => chain.leaseSignals.flatMap((signal) => signal.evidence)).find((source) => source.name === name)!)
    .filter(Boolean);

  const verdict = verdictFor(chains);
  return {
    ips: enrichedIps,
    infrastructure: {
      domainOwner,
      roleProviders: roleProviders(domainOwner, dns, http, enrichedIps),
      ipChains: chains,
      verdict,
      confidence: providerConfidence(chains.flatMap((chain) => chain.leaseSignals)),
      evidence,
      warnings
    }
  };
};

export const classifyLeaseSignalsForTest = leaseSignalsFor;
