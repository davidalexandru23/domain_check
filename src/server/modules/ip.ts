import dns from "node:dns/promises";
import type { AsnProfile, GeoPoint, IpProfile, SourceRef } from "../../shared/types.js";
import { classifyProvider, fetchJson } from "../utils.js";

type IpApiResponse = {
  status?: string;
  country?: string;
  regionName?: string;
  city?: string;
  lat?: number;
  lon?: number;
  as?: string;
  org?: string;
  isp?: string;
  query?: string;
};

type RdapIpResponse = {
  handle?: string;
  name?: string;
  type?: string;
  country?: string;
  startAddress?: string;
  endAddress?: string;
  entities?: Array<{ roles?: string[]; vcardArray?: unknown[] }>;
  remarks?: Array<{ description?: string[] }>;
  links?: Array<{ rel?: string; href?: string }>;
  port43?: string;
};

const sourceIpApi: SourceRef = { name: "IP-API", url: "http://ip-api.com", confidence: "medium" };
const sourceRdap: SourceRef = { name: "RDAP IP", url: "https://rdap.org", confidence: "high" };

const parseAsn = (value?: string): AsnProfile => {
  const match = value?.match(/AS(\d+)\s+(.+)/i);
  return {
    asn: match?.[1],
    org: match?.[2] ?? value
  };
};

const vcardProp = (entity: { vcardArray?: unknown[] }, propName: string): string | undefined => {
  const entries = Array.isArray(entity.vcardArray?.[1]) ? (entity.vcardArray?.[1] as unknown[]) : [];
  for (const entry of entries) {
    if (Array.isArray(entry) && entry[0] === propName && typeof entry[3] === "string") {
      return entry[3];
    }
  }
  return undefined;
};

const rdapOrg = (rdap: RdapIpResponse): string | undefined => {
  for (const role of ["registrant", "administrative", "technical"]) {
    const entity = rdap.entities?.find((e) => e.roles?.includes(role));
    if (entity) {
      const org = vcardProp(entity, "org");
      if (org && !org.startsWith("ORG-")) return org;
      const fn = vcardProp(entity, "fn");
      if (fn && !fn.includes("-MNT") && !fn.toLowerCase().startsWith("version")) return fn;
    }
  }
  if (rdap.remarks?.length) {
    for (const rem of rdap.remarks) {
      if (Array.isArray(rem.description)) {
        const line = rem.description.find((d) => d && d.length > 5 && !d.toLowerCase().includes("filtered"));
        if (line) return line;
      }
    }
  }
  return rdap.name ?? rdap.handle;
};

export const getIpProfile = async (ip: string, timeoutMs: number, fetchHostedDomains: boolean = false): Promise<IpProfile> => {
  const sources: SourceRef[] = [];
  let geo: GeoPoint = {};
  let asn: AsnProfile = {};
  let ptr: string[] = [];
  let rirAllocationOwner: string | undefined;
  let networkName: string | undefined;
  let parentNetwork: string | undefined;
  let announcedPrefix: string | undefined;

  try {
    const api = await fetchJson<IpApiResponse>(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,lat,lon,as,org,isp,query`, timeoutMs);
    if (api.status === "success") {
      geo = { country: api.country, region: api.regionName, city: api.city, lat: api.lat, lon: api.lon, source: "IP-API" };
      asn = { ...asn, ...parseAsn(api.as), org: parseAsn(api.as).org ?? api.org ?? api.isp };
      sources.push(sourceIpApi);
    }
  } catch (error) {
    sources.push({ ...sourceIpApi, confidence: "low", note: error instanceof Error ? error.message : "ip-api failed" });
  }

  try {
    const rdap = await fetchJson<RdapIpResponse>(`https://rdap.org/ip/${encodeURIComponent(ip)}`, timeoutMs);
    asn = { ...asn, cidr: rdap.handle, rir: rdap.port43, route: `${rdap.startAddress ?? ""}-${rdap.endAddress ?? ""}` };
    rirAllocationOwner = rdapOrg(rdap);
    networkName = rdap.name ?? rdap.handle;
    parentNetwork = rdap.links?.find((link) => link.rel === "up")?.href;
    announcedPrefix = rdap.handle;
    sources.push(sourceRdap);
  } catch (error) {
    sources.push({ ...sourceRdap, confidence: "low", note: error instanceof Error ? error.message : "ip rdap failed" });
  }

  try {
    ptr = await dns.reverse(ip);
  } catch {
    ptr = [];
  }

  // PeeringDB enrichment if we have an ASN
  if (asn.asn) {
    try {
      const peeringdb = await fetchJson<any>(`https://www.peeringdb.com/api/net?asn=${asn.asn}`, timeoutMs);
      const data = peeringdb?.data?.[0];
      if (data) {
        if (data.name) asn.org = data.name;
        asn.website = data.website;
        asn.facCount = data.fac_count;
        asn.ixCount = data.ix_count;
        sources.push({ name: "PeeringDB", url: `https://peeringdb.com/net/${data.id}`, confidence: "high" });
      }
    } catch (error) {
      // ignore
    }
  }

  const providerType = classifyProvider(asn.org);
  let hostedDomains: string[] = [];
  if (fetchHostedDomains) {
    try {
      const { fetchText } = await import("../utils.js");
      const htResponse = await fetchText(`https://api.hackertarget.com/reversedns/?q=${ip}`, timeoutMs);
      if (htResponse && !htResponse.includes("API count exceeded")) {
        hostedDomains = htResponse.split("\n")
          .map(line => {
            const parts = line.split(" ");
            return parts.length > 1 ? parts[1].trim() : parts[0].trim();
          })
          .filter(domain => domain && domain !== ip && domain !== "No" && !domain.includes("error"));
      }
    } catch (e) {}
  }

  return {
    hostedDomains,
    ip,
    ptr,
    asn,
    geo,
    providerType,
    landlord: asn.org,
    rirAllocationOwner,
    networkName,
    parentNetwork,
    originAsn: asn.asn,
    announcedPrefix,
    upstreams: [],
    peers: [],
    ixPresence: [],
    facilityPresence: [],
    sources
  };
};
