import type {
  DnsRecordSet,
  EvidenceSignal,
  HttpProfile,
  IpProfile,
  OriginCandidateDetailed,
  PortFinding,
  TlsProfile,
  EvidenceBucket,
  DecoupledOwnershipModel,
  OwnershipConcept,
  MxCandidateDetailed,
  EmailOwnershipModel
} from "../../shared/types.js";
import { classifyProvider, fetchJson } from "../utils.js";

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
  // Etapa 6: optional historical/external data (pre-fetched or fetched inline)
  ctCertificates?: Array<{ domain: string; san: string[]; issuer: string; notBefore: string; notAfter: string }>;
  peeringDbInfo?: { name?: string; infoType?: string; ixPresence: string[]; facilityPresence: string[] };
  rpkiStatus?: "valid" | "invalid" | "not-found" | "unknown";
  historicalPrefixes?: Array<{ prefix: string; origin: string; firstSeen?: string; lastSeen?: string }>;
};

const nowTimestamp = () => new Date().toISOString();

import https from "node:https";
import tls from "node:tls";

type DirectProbeResult = {
  tlsMatch: boolean;
  httpStatus?: number;
  httpTitle?: string;
  serverHeader?: string;
  timeout: boolean;
};

const probeCandidateDirectly = (ip: string, domain: string, timeoutMs: number): Promise<DirectProbeResult> => {
  return new Promise((resolve) => {
    let result: DirectProbeResult = { tlsMatch: false, timeout: false };
    
    const req = https.request({
      hostname: ip,
      port: 443,
      path: "/",
      method: "GET",
      servername: domain, // SNI
      headers: {
        "Host": domain,
        "User-Agent": "domain-asm-osint/1.0"
      },
      rejectUnauthorized: false, // Accept invalid certs to inspect them
      timeout: timeoutMs
    }, (res) => {
      result.httpStatus = res.statusCode;
      result.serverHeader = (res.headers["server"] || "").toString();
      
      const cert = (res.socket as tls.TLSSocket).getPeerCertificate();
      if (cert && cert.subjectaltname) {
        if (cert.subjectaltname.toLowerCase().includes(domain.toLowerCase())) {
          result.tlsMatch = true;
        }
      }
      
      let data = "";
      res.on("data", chunk => {
        if (data.length < 10000) data += chunk;
      });
      res.on("end", () => {
        const titleMatch = data.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) result.httpTitle = titleMatch[1].trim();
        resolve(result);
      });
    });

    req.on("timeout", () => {
      req.destroy();
      result.timeout = true;
      resolve(result);
    });

    req.on("error", (err) => {
      // If error occurs, we might still have a socket (e.g. ECONNRESET after handshake)
      result.timeout = true;
      resolve(result);
    });

    req.end();
  });
};

export async function collectHistoricalEvidence(ip: string, domain: string, asn: string | undefined, prefix: string | undefined, timeoutMs: number): Promise<{
  ctCerts: EvidenceInput["ctCertificates"];
  peeringDb: EvidenceInput["peeringDbInfo"];
  rpki: EvidenceInput["rpkiStatus"];
  historicalPrefixes: EvidenceInput["historicalPrefixes"];
}> {
  const result: Awaited<ReturnType<typeof collectHistoricalEvidence>> = {
    ctCerts: [],
    peeringDb: undefined,
    rpki: "unknown",
    historicalPrefixes: []
  };

  // 1. RIPEstat BGP routing history
  if (prefix || ip) {
    try {
      const resource = prefix || ip;
      const ripeHistory = await fetchJson<any>(`https://stat.ripe.net/data/routing-history/data.json?resource=${encodeURIComponent(resource)}&min_peers=3`, timeoutMs);
      const entries = ripeHistory?.data?.by_origin ?? [];
      for (const entry of entries.slice(0, 10)) {
        const origin = entry.origin ? String(entry.origin) : undefined;
        const timelines = entry.timelines ?? [];
        for (const tl of timelines.slice(0, 3)) {
          result.historicalPrefixes!.push({
            prefix: resource,
            origin: origin ?? "UNKNOWN",
            firstSeen: tl.starttime,
            lastSeen: tl.endtime
          });
        }
      }
    } catch { /* RIPEstat unavailable */ }
  }

  // 2. Certificate Transparency history via crt.sh
  try {
    const rows = await fetchJson<Array<{ name_value?: string; not_before?: string; not_after?: string; issuer_name?: string }>>(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, timeoutMs);
    const seen = new Set<string>();
    for (const row of (rows ?? []).slice(0, 50)) {
      const names = (row.name_value ?? "").split("\n").map(n => n.replace(/^\*\./, "").toLowerCase()).filter(n => n.includes(domain.toLowerCase()));
      for (const name of names) {
        if (!seen.has(name)) {
          seen.add(name);
          result.ctCerts!.push({
            domain: name,
            san: names,
            issuer: row.issuer_name ?? "Unknown",
            notBefore: row.not_before ?? "",
            notAfter: row.not_after ?? ""
          });
        }
      }
    }
    // Deduplicate by domain
    const unique = new Map<string, NonNullable<EvidenceInput["ctCertificates"]>[0]>();
    for (const cert of result.ctCerts!) {
      if (!unique.has(cert.domain)) unique.set(cert.domain, cert);
    }
    result.ctCerts = Array.from(unique.values()).slice(0, 30);
  } catch { /* crt.sh unavailable */ }

  // 3. PeeringDB
  if (asn) {
    try {
      const pdb = await fetchJson<any>(`https://www.peeringdb.com/api/net?asn=${encodeURIComponent(asn)}&depth=2`, timeoutMs);
      const net = pdb?.data?.[0];
      if (net) {
        result.peeringDb = {
          name: net.name_long ?? net.name,
          infoType: net.info_type ?? net.info_types?.join(", "),
          ixPresence: (net.netixlan_set ?? []).map((i: any) => typeof i === "number" ? undefined : i.name ?? i.ixlan?.name).filter(Boolean).slice(0, 10),
          facilityPresence: (net.netfac_set ?? []).map((i: any) => typeof i === "number" ? undefined : i.name ?? i.fac?.name).filter(Boolean).slice(0, 10)
        };
      }
    } catch { /* PeeringDB unavailable */ }
  }

  // 4. RPKI validation
  if (prefix && asn) {
    try {
      const rpki = await fetchJson<any>(`https://stat.ripe.net/data/rpki-validation/data.json?resource=${encodeURIComponent(asn)}&prefix=${encodeURIComponent(prefix)}`, timeoutMs);
      const status = rpki?.data?.status?.toLowerCase();
      if (status === "valid") result.rpki = "valid";
      else if (status === "invalid") result.rpki = "invalid";
      else if (status?.includes("not")) result.rpki = "not-found";
      else result.rpki = "unknown";
    } catch { result.rpki = "unknown"; }
  }

  return result;
}

export async function collectAllEvidence(input: EvidenceInput): Promise<OriginCandidateDetailed> {
  const bucket: EvidenceBucket = {
    dns: [],
    subdomain: [],
    ct: [],
    http: [],
    tls: [],
    ptr: [],
    port: [],
    bgp: [],
    rir: [],
    infrastructure: [],
    mx: [],
    historical: []
  };

  const { ip, domain, ipProfile, dnsResult } = input;

  // 1. DNS Evidence
  if (dnsResult.a.includes(ip) || dnsResult.aaaa.includes(ip)) {
    bucket.dns.push({
      id: "DNS_A_MATCH",
      type: "supporting",
      family: "DNS",
      strength: "strong",
      title: "Direct DNS Record",
      description: "IP found directly in the A/AAAA records for the target domain.",
      observedData: ip,
      source: "DNS",
      timestamp: nowTimestamp(),
      relation: "direct web origin"
    });
  }

  // 2. Subdomain Evidence
  const leakedHosts = input.subdomainHosts.filter((host) => host.includes(domain));
  if (leakedHosts.length) {
    bucket.subdomain.push({
      id: "SUBDOMAIN_LEAK",
      type: "supporting",
      family: "DNS",
      strength: "medium",
      title: "Subdomain Resolution",
      description: "IP resolved via one or more subdomains.",
      observedData: leakedHosts.join(", "),
      source: "DNS",
      timestamp: nowTimestamp(),
      relation: "possible origin"
    });
  }

  // 3. PTR Evidence
  const ptrMatch = ipProfile?.ptr.find((ptr) => ptr.toLowerCase().includes(domain.toLowerCase()));
  if (ptrMatch) {
    bucket.ptr.push({
      id: "PTR_MATCH",
      type: "supporting",
      family: "Reverse_DNS",
      strength: "strong",
      title: "Reverse DNS Match",
      description: "The IP's PTR record points back to a hostname containing the target domain.",
      observedData: ptrMatch,
      source: "DNS-PTR",
      timestamp: nowTimestamp(),
      relation: "direct web origin"
    });
  }

  // 4. BGP/ASN & Hosting Provider Evidence
  const orgName = (ipProfile?.asn.org ?? ipProfile?.rirAllocationOwner ?? "").toLowerCase();
  const registrant = (input.registrantOrg ?? "").toLowerCase();
  
  if (registrant && !/privacy|redacted|unknown/i.test(registrant)) {
    if (orgName.includes(registrant) || registrant.includes(orgName)) {
      bucket.bgp.push({
        id: "ASN_ORG_MATCH",
        type: "supporting",
        family: "BGP_ASN",
        strength: "strong",
        title: "ASN Operator Match",
        description: "The ASN operator matches the domain WHOIS registrant.",
        observedData: `ASN Org: ${ipProfile?.asn.org}, Domain Org: ${input.registrantOrg}`,
        source: "BGP/WHOIS",
        timestamp: nowTimestamp(),
        relation: "hosting provider"
      });
    }
  }

  const isCdn = /(cloudflare|akamai|fastly|sucuri|imperva|incapsula|ddos-guard|cloudfront)/.test(orgName);
  if (isCdn) {
    bucket.bgp.push({
      id: "CDN_ASN",
      type: "contradiction",
      family: "BGP_ASN",
      strength: "strong",
      title: "CDN / Proxy ASN",
      description: "The ASN belongs to a known CDN or Cloud WAF provider.",
      observedData: orgName,
      source: "BGP",
      timestamp: nowTimestamp(),
      relation: "CDN/WAF edge"
    });
  }

  // Port Evidence
  const openWebPorts = input.ports.filter(p => p.host === ip && p.state === "open" && [80, 443, 8080, 8443].includes(p.port));
  if (openWebPorts.length > 0) {
    bucket.port.push({
      id: "OPEN_WEB_PORTS",
      type: "supporting",
      family: "Port_Service",
      strength: "medium",
      title: "Open Web Ports",
      description: "Standard web ports are open on this IP.",
      observedData: openWebPorts.map(p => p.port).join(", "),
      source: "Port Scan",
      timestamp: nowTimestamp(),
      relation: "possible origin"
    });
  }

  // Passive HTTP/TLS Evidence
  const myHttp = input.httpResults.filter(h => h.url.includes(ip));
  if (myHttp.length > 0) {
    const successHttp = myHttp.find(h => h.title || Object.keys(h.headers).length > 0);
    if (successHttp) {
      if (successHttp.title?.toLowerCase().includes(domain.toLowerCase())) {
        bucket.http.push({
          id: "HTTP_TITLE_MATCH",
          type: "supporting",
          family: "HTTP",
          strength: "strong",
          title: "HTTP Title Match (Passive)",
          description: "Passive HTTP profile returned a page title matching the target domain.",
          observedData: successHttp.title || "",
          source: "HTTP",
          timestamp: nowTimestamp(),
          relation: "direct web origin"
        });
      }
      const sHeader = (successHttp.headers["server"] || "").toLowerCase();
      if (/(cloudflare|akamai)/.test(sHeader)) {
        bucket.http.push({
          id: "WAF_SERVER_HEADER",
          type: "contradiction",
          family: "HTTP",
          strength: "strong",
          title: "WAF HTTP Header (Passive)",
          description: "HTTP response contains headers indicating a reverse proxy.",
          observedData: sHeader,
          source: "HTTP",
          timestamp: nowTimestamp(),
          relation: "CDN/WAF edge"
        });
      }
    }
  }

  const myTls = input.tlsResults.find(t => t.host === ip);
  if (myTls) {
    if (myTls.san.some(s => s.toLowerCase().includes(domain.toLowerCase()))) {
      bucket.tls.push({
        id: "TLS_SAN_MATCH",
        type: "supporting",
        family: "TLS",
        strength: "strong",
        title: "TLS SAN Match (Passive)",
        description: "Passive TLS profile returned a certificate valid for the target domain.",
        observedData: myTls.san.join(", "),
        source: "TLS",
        timestamp: nowTimestamp(),
        relation: "direct web origin"
      });
    } else {
      bucket.tls.push({
        id: "TLS_MISMATCH",
        type: "contradiction",
        family: "TLS",
        strength: "medium",
        title: "TLS Mismatch (Passive)",
        description: "Passive TLS profile returned a certificate not matching the target domain.",
        observedData: myTls.san.join(", "),
        source: "TLS",
        timestamp: nowTimestamp(),
        relation: "shared hosting"
      });
    }
  }

  // Active SNI/Host probing for Web Origin Validation
  const probe = await probeCandidateDirectly(ip, domain, Math.min(input.timeoutMs, 3000));
  
  if (probe.tlsMatch) {
    bucket.tls.push({
      id: "TLS_SNI_MATCH",
      type: "supporting",
      family: "TLS",
      strength: "strong",
      title: "TLS SNI + Certificate Match",
      description: "Direct TLS connection to the IP using SNI returned a matching certificate.",
      observedData: "Certificate valid for domain",
      source: "Active Direct Probe",
      timestamp: nowTimestamp(),
      relation: "direct web origin"
    });
  }

  if (probe.httpStatus && probe.httpStatus > 0) {
    if (probe.httpTitle?.toLowerCase().includes(domain.toLowerCase())) {
      bucket.http.push({
        id: "HTTP_HOST_TITLE_MATCH",
        type: "supporting",
        family: "HTTP",
        strength: "strong",
        title: "HTTP Host Title Match",
        description: "Direct HTTP probe with Host header returned matching application title.",
        observedData: probe.httpTitle || "Matched title",
        source: "Active Direct Probe",
        timestamp: nowTimestamp(),
        relation: "direct web origin"
      });
    }

    const sHeader = (probe.serverHeader || "").toLowerCase();
    if (/(cloudflare|akamai|fastly|imperva)/.test(sHeader)) {
      bucket.http.push({
        id: "WAF_SERVER_HEADER",
        type: "contradiction",
        family: "HTTP",
        strength: "strong",
        title: "WAF/CDN HTTP Header",
        description: "HTTP response contains headers indicating a reverse proxy.",
        observedData: probe.serverHeader || "CDN Header",
        source: "Active Direct Probe",
        timestamp: nowTimestamp(),
        relation: "CDN/WAF edge"
      });
    }
  } else if (probe.timeout) {
    bucket.http.push({
      id: "HTTP_TIMEOUT",
      type: "neutral",
      family: "HTTP",
      strength: "weak",
      title: "HTTP Timeout/Refusal",
      description: "Direct HTTP probe to the IP timed out. This is not a direct contradiction.",
      observedData: "timeout",
      source: "Active Direct Probe",
      timestamp: nowTimestamp(),
      relation: "unknown"
    });
  }

  // 7. Email/MX Isolation
  if (input.mxIps.includes(ip)) {
    bucket.mx.push({
      id: "MX_IP",
      type: "contradiction",
      family: "Email",
      strength: "strong",
      title: "Mail Exchange (MX) IP",
      description: "IP is listed as an MX record for the domain.",
      observedData: ip,
      source: "DNS-MX",
      timestamp: nowTimestamp(),
      relation: "email-only"
    });
  }

  // 8. Historical / External Evidence (Etapa 6)
  // CT Certificates
  if (input.ctCertificates?.length) {
    const domainCerts = input.ctCertificates.filter(c => c.san.some(s => s.includes(domain.toLowerCase())));
    if (domainCerts.length > 0) {
      bucket.ct.push({
        id: "CT_DOMAIN_CERT",
        type: "supporting",
        family: "Certificate",
        strength: "medium",
        title: "CT Certificate History",
        description: `Found ${domainCerts.length} historical certificate(s) for the domain in Certificate Transparency logs.`,
        observedData: domainCerts.slice(0, 5).map(c => `${c.domain} (${c.notBefore})`).join("; "),
        source: "Certificate Transparency",
        timestamp: nowTimestamp(),
        relation: "historical association"
      });
    }
  }

  // Historical Prefix / ASN changes
  if (input.historicalPrefixes?.length) {
    const currentAsn = ipProfile?.asn.asn;
    const uniqueOrigins = new Set(input.historicalPrefixes.map(h => h.origin));
    
    if (uniqueOrigins.size > 1) {
      bucket.historical.push({
        id: "HISTORICAL_ASN_CHANGE",
        type: "neutral",
        family: "Historical",
        strength: "medium",
        title: "Historical ASN Change Detected",
        description: `The prefix has been announced by ${uniqueOrigins.size} different ASNs over time.`,
        observedData: Array.from(uniqueOrigins).join(", "),
        source: "RIPEstat Routing History",
        timestamp: nowTimestamp(),
        relation: "historical change"
      });
    }
    
    if (currentAsn && !uniqueOrigins.has(currentAsn)) {
      bucket.historical.push({
        id: "HISTORICAL_ASN_CONTRADICTION",
        type: "contradiction",
        family: "Historical",
        strength: "weak",
        title: "Current ASN Not In Historical Record",
        description: "The current BGP origin ASN was not observed in the historical routing data.",
        observedData: `Current: AS${currentAsn}, Historical: ${Array.from(uniqueOrigins).join(", ")}`,
        source: "RIPEstat Routing History",
        timestamp: nowTimestamp(),
        relation: "contradiction"
      });
    }

    // Add supporting historical evidence
    const matchingHistorical = input.historicalPrefixes.filter(h => h.origin === currentAsn);
    if (matchingHistorical.length > 0) {
      bucket.historical.push({
        id: "HISTORICAL_ASN_CONSISTENT",
        type: "supporting",
        family: "Historical",
        strength: "medium",
        title: "Consistent Historical Routing",
        description: "The current BGP origin ASN has been historically consistent for this prefix.",
        observedData: `AS${currentAsn} seen from ${matchingHistorical[0].firstSeen ?? "unknown"} to ${matchingHistorical[0].lastSeen ?? "present"}`,
        source: "RIPEstat Routing History",
        timestamp: nowTimestamp(),
        relation: "historical confirmation"
      });
    }
  }

  // PeeringDB
  if (input.peeringDbInfo) {
    const pdb = input.peeringDbInfo;
    if (pdb.name) {
      bucket.infrastructure.push({
        id: "PEERINGDB_NETWORK",
        type: "supporting",
        family: "Infrastructure",
        strength: "medium",
        title: "PeeringDB Network Identity",
        description: `Network registered in PeeringDB as "${pdb.name}" (type: ${pdb.infoType ?? "unknown"}).`,
        observedData: pdb.name,
        source: "PeeringDB",
        timestamp: nowTimestamp(),
        relation: "network identity"
      });
    }
    // Facility presence is informational, NOT physical server location
    if (pdb.facilityPresence.length > 0) {
      bucket.infrastructure.push({
        id: "PEERINGDB_FACILITIES",
        type: "neutral",
        family: "Infrastructure",
        strength: "weak",
        title: "PeeringDB Facility Presence",
        description: `ASN has peering presence at ${pdb.facilityPresence.length} facilities. This does NOT confirm physical server location.`,
        observedData: pdb.facilityPresence.slice(0, 5).join(", "),
        source: "PeeringDB",
        timestamp: nowTimestamp(),
        relation: "facility presence"
      });
    }
  }

  // RPKI
  if (input.rpkiStatus && input.rpkiStatus !== "unknown") {
    const isValid = input.rpkiStatus === "valid";
    const isInvalid = input.rpkiStatus === "invalid";
    bucket.bgp.push({
      id: "RPKI_STATUS",
      type: isInvalid ? "contradiction" : isValid ? "supporting" : "neutral",
      family: "BGP_ASN",
      strength: isInvalid ? "strong" : isValid ? "medium" : "weak",
      title: `RPKI ${input.rpkiStatus.toUpperCase()}`,
      description: isValid
        ? "The BGP route announcement is covered by a valid RPKI ROA."
        : isInvalid
        ? "The BGP route announcement has an INVALID RPKI status, indicating a possible route origin mismatch."
        : "No RPKI ROA found for this prefix/ASN combination.",
      observedData: input.rpkiStatus,
      source: "RIPEstat RPKI",
      timestamp: nowTimestamp(),
      relation: isValid ? "route validation" : "route anomaly"
    });
  }

  // Evaluate Independence (ETAPA 9 Logic - Provenance based & Heuristics)
  // A candidate must have at least 2 independent positive sources (e.g., DNS + Network Probe) to be HIGH CONFIDENCE.
  const independentSupportingSources = new Set<string>();
  const strongSupporting: EvidenceSignal[] = [];
  const mediumSupporting: EvidenceSignal[] = [];
  const weakSupporting: EvidenceSignal[] = [];
  const contradictions: EvidenceSignal[] = [];
  const neutral: EvidenceSignal[] = [];
  const allSignals: EvidenceSignal[] = Object.values(bucket).flat();

  allSignals.forEach((sig) => {
    if (sig.type === "supporting") {
      let prov = sig.source;
      if (prov.includes("HTTP") || prov.includes("TLS") || prov.includes("Active Direct Probe")) {
        prov = "Direct Network Probe";
      }
      
      if (sig.strength === "strong") {
          independentSupportingSources.add(prov);
          strongSupporting.push(sig);
      }
      else if (sig.strength === "medium") mediumSupporting.push(sig);
      else weakSupporting.push(sig);
    } else if (sig.type === "contradiction") {
      contradictions.push(sig);
    } else {
      neutral.push(sig);
    }
  });

  const hasStrongContradiction = contradictions.some(s => s.strength === "strong");
  const isEmailOnly = bucket.mx.length > 0 && strongSupporting.length === 0 && independentSupportingSources.size < 2;

  let classification: OriginCandidateDetailed["classification"] = "unrelated";
  let rating: OriginCandidateDetailed["confidenceRating"] = "NOT ESTABLISHED";
  let confOrigin = 0;
  const missingEvidence = [];

  if (isEmailOnly) {
    classification = "email-only";
    rating = "HIGH CONFIDENCE";
    confOrigin = 0;
  } else if (hasStrongContradiction) {
    if (bucket.bgp.some(s => s.id === "CDN_ASN") || bucket.http.some(s => s.id === "WAF_SERVER_HEADER")) {
      classification = "CDN/WAF edge";
      rating = "HIGH CONFIDENCE";
      confOrigin = 5;
    } else {
      classification = "shared hosting";
      rating = "MEDIUM CONFIDENCE";
      confOrigin = 20;
    }
  } else {
    // Etapa 9: Heuristic confidence
    if (strongSupporting.length >= 1 && independentSupportingSources.size >= 2) {
      classification = "direct web origin";
      rating = "HIGH CONFIDENCE";
      confOrigin = 95;
    } else if (strongSupporting.length >= 1 || independentSupportingSources.size >= 2) {
      classification = "probable origin";
      rating = "MEDIUM CONFIDENCE";
      confOrigin = 65;
    } else if (bucket.subdomain.length > 0 || bucket.dns.length > 0) {
      classification = "possible origin";
      rating = "LOW CONFIDENCE";
      confOrigin = 35;
      missingEvidence.push("direct TLS confirmation", "direct HTTP confirmation");
    } else {
      missingEvidence.push("DNS association", "Direct confirmation");
    }
  }

  // Build Ownership Chain (WEB)
  
  const rirOwner = ipProfile?.rirAllocationOwner || "UNKNOWN";
  const asnOrg = ipProfile?.asn.org || "UNKNOWN";
  const announcedPrefix = ipProfile?.announcedPrefix || "UNKNOWN";
  
  let networkIdentity = "UNKNOWN";
  let networkExplanation = "Insufficient explicit evidence to determine network operator. BGP announcement alone does not confirm operation.";
  let networkConf = 0;
  let hasMismatch = false;

  // We only consider the ASN Org as the Network Operator if there is no mismatch AND we have additional confidence, OR if we have infrastructure evidence
  // For now, if there is a mismatch, it's strictly UNKNOWN.
  if (rirOwner !== "UNKNOWN" && asnOrg !== "UNKNOWN") {
    const rirClean = rirOwner.toLowerCase().replace(/[^a-z0-9]/g, "");
    const asnClean = asnOrg.toLowerCase().replace(/[^a-z0-9]/g, "");
    
    if (!rirClean.includes(asnClean) && !asnClean.includes(rirClean)) {
      networkExplanation = "Allocation/operator mismatch. RIR allocation holder differs from BGP ASN organization. Further evidence needed to confirm network operator.";
      hasMismatch = true;
    } else {
      // If RIR matches BGP org exactly, we have higher confidence they operate it
      networkIdentity = asnOrg;
      networkExplanation = "Network operator derived from matching RIR allocation and BGP origin organization.";
      networkConf = 90;
    }
  }

  // If we have independent infrastructure evidence, we can attribute Network Operator
  if (bucket.infrastructure.length > 0) {
    const strongInfra = bucket.infrastructure.find(s => s.strength === "strong" && s.type === "supporting");
    if (strongInfra) {
      networkIdentity = strongInfra.observedData;
      networkExplanation = "Network operator confirmed by independent infrastructure evidence.";
      networkConf = 95;
    }
  }

  // Hosting provider requires more than just an ASN lookup
  let hostingIdentity = "UNKNOWN";
  let hostingExplanation = "ASN-ul nu este suficient pentru identificarea unui hosting provider.";
  let hostingConf = 0;
  
  // If it's a known CDN/WAF edge, the hosting provider is the CDN
  if (classification === "CDN/WAF edge") {
    hostingIdentity = asnOrg !== "UNKNOWN" ? asnOrg : "CDN Provider";
    hostingExplanation = "Infrastructure operates as a CDN/WAF edge node.";
    hostingConf = 100;
  } else {
    // Need explicit infrastructure/hosting evidence (e.g. PTR, specific infrastructure bucket items)
    const hasProviderPtr = ipProfile?.ptr.some(p => p.includes("amazonaws.com") || p.includes("googleusercontent.com") || p.includes("azure.com") || p.includes("linode.com") || p.includes("digitalocean.com") || p.includes("secureserver.net"));
    
    if (bucket.infrastructure.length > 0) {
      hostingIdentity = bucket.infrastructure[0].observedData;
      hostingExplanation = "Hosting provider identified via explicit infrastructure evidence.";
      hostingConf = 90;
    } else if (hasProviderPtr) {
      hostingIdentity = asnOrg !== "UNKNOWN" ? asnOrg : "Cloud/Hosting Provider";
      hostingExplanation = "Hosting provider confirmed via provider-specific PTR records.";
      hostingConf = 85;
    }
  }

  // Application Operator
  let appIdentity = "UNKNOWN";
  let appExplanation = "Insufficient evidence to identify application operator.";
  let appConf = 0;

  const hasAppCert = bucket.tls.some(t => t.id === "TLS_SAN_MATCH" || t.id === "TLS_SNI_MATCH");
  const hasAppHttp = bucket.http.some(h => h.id === "HTTP_TITLE_MATCH" || h.id === "HTTP_HOST_TITLE_MATCH");
  const hasAppCt = bucket.ct.some(c => c.type === "supporting");
  const hasAppHistorical = bucket.historical.some(h => h.type === "supporting");
  
  if (hasAppCert && hasAppHttp) {
    appIdentity = domain;
    appExplanation = "Application operator confidently attributed via matching TLS certificate and HTTP content.";
    appConf = 95;
  } else if (hasAppCert || hasAppHttp) {
    appIdentity = domain;
    appExplanation = "Application operator attributed via application-layer evidence (TLS or HTTP).";
    appConf = 80;
  } else if (hasAppCt || hasAppHistorical) {
    appIdentity = domain;
    appExplanation = "Application operator inferred from Certificate Transparency or historical evidence, but lacks active application confirmation.";
    appConf = 50;
  }

  // Probable Customer
  let customerIdentity = "UNKNOWN";
  let customerExplanation = "nu există evidence directă privind customer-ul.";
  let customerConf = 0;

  const strongCustomerEv = bucket.historical?.find(h => h.id === "CUSTOMER_EVIDENCE");
  if (strongCustomerEv) {
    customerIdentity = strongCustomerEv.observedData;
    customerExplanation = "Customer explicitly identified via specific customer evidence.";
    customerConf = 90;
  }

  const ownershipChain: DecoupledOwnershipModel = {
    ipPrefix: {
      concept: "ipPrefix",
      label: "IP Prefix",
      identity: announcedPrefix,
      confidence: announcedPrefix !== "UNKNOWN" ? 100 : 0,
      evidenceCount: bucket.bgp.length,
      explanation: "BGP announced prefix covering the IP address.",
      signals: bucket.bgp
    },
    rirAllocation: {
      concept: "rirAllocation",
      label: "RIR Allocation Holder",
      identity: rirOwner,
      confidence: rirOwner !== "UNKNOWN" ? 95 : 0,
      evidenceCount: bucket.rir.length,
      explanation: "Holder of the IP space as registered in Regional Internet Registries (RIPE, ARIN, etc.).",
      signals: bucket.rir
    },
    asnOperation: {
      concept: "asnOperation",
      label: "BGP ASN Organization",
      identity: asnOrg,
      confidence: asnOrg !== "UNKNOWN" ? 95 : 0,
      evidenceCount: bucket.bgp.length,
      explanation: "Organization announcing the BGP route for this IP prefix.",
      signals: bucket.bgp
    },
    networkOperation: {
      concept: "networkOperation",
      label: "Network Operator",
      identity: networkIdentity,
      confidence: networkConf,
      evidenceCount: 1,
      explanation: networkExplanation,
      details: { mismatch: hasMismatch }
    },
    hostingProvider: {
      concept: "hostingProvider",
      label: "Hosting/Infrastructure Provider",
      identity: hostingIdentity,
      confidence: hostingConf,
      evidenceCount: bucket.infrastructure.length,
      explanation: hostingExplanation,
      signals: bucket.infrastructure
    },
    applicationOperator: {
      concept: "applicationOperator",
      label: "Application Operator",
      identity: appIdentity,
      confidence: appConf,
      evidenceCount: (hasAppCert ? 1 : 0) + (hasAppHttp ? 1 : 0),
      explanation: appExplanation
    },
    probableCustomer: {
      concept: "probableCustomer",
      label: "Probable End Customer",
      identity: customerIdentity,
      confidence: customerConf,
      evidenceCount: strongCustomerEv ? 1 : 0,
      explanation: customerExplanation
    },
    estimatedLocation: {
      concept: "estimatedLocation",
      label: "Estimated Infrastructure Location",
      identity: ipProfile?.geo ? `${ipProfile.geo.city || "Unknown City"}, ${ipProfile.geo.country || "Unknown Country"}` : "UNKNOWN",
      confidence: ipProfile?.geo ? 50 : 0,
      evidenceCount: 1,
      explanation: "Estimated geo-routing location. Not a verified physical coordinate."
    }
  };

  const provider = hostingIdentity !== "UNKNOWN" ? hostingIdentity : asnOrg;

  let candidateExplanation = "";
  
  if (classification === "email-only") {
    candidateExplanation = `IP-ul apare exclusiv în înregistrările MX. Nu există dovezi care să-l susțină ca Origine Web.`;
  } else if (classification === "CDN/WAF edge") {
    candidateExplanation = `IP-ul prezintă caracteristici compatibile cu un CDN/WAF edge. Dovezile disponibile nu permit atribuirea IP-ului ca server de origine.`;
  } else if (classification === "direct web origin") {
    candidateExplanation = `Dovezile disponibile, validate independent, susțin puternic clasificarea ca direct web origin.`;
  } else if (classification === "probable origin") {
    candidateExplanation = `Dovezile susțin clasificarea ca probable origin, însă lipsesc confirmări directe sau multiple.`;
  } else {
    candidateExplanation = `Nu există dovezi suficiente pentru o clasificare mai precisă.`;
  }
  
  if (independentSupportingSources.size > 0) {
    candidateExplanation += `\nAu fost identificate ${independentSupportingSources.size} surse independente de confirmare.`;
  }
  if (contradictions.length > 1) {
    candidateExplanation += `\nExistă ${contradictions.length} dovezi contradictorii.`;
  } else if (contradictions.length === 1) {
    candidateExplanation += `\nExistă 1 dovadă contradictorie.`;
  }

  return {
    ip,
    domain,
    classification,
    evidence: bucket,
    ownershipChain,
    confidenceRating: rating,
    explanation: candidateExplanation,
    score: confOrigin,
    confidences: { 
      origin: confOrigin, 
      hosting: hostingConf, 
      network: networkConf, 
      allocation: rirOwner !== "UNKNOWN" ? 95 : 0, 
      application: appConf, 
      customer: customerConf, 
      geo: ipProfile?.geo ? 50 : 0, 
      email: isEmailOnly ? 100 : 0 
    },
    supportingSignals: [...strongSupporting, ...mediumSupporting, ...weakSupporting],
    contradictionSignals: contradictions,
    missingEvidence,
    provider,
    asn: ipProfile?.asn.asn ?? "Unknown",
    location: `${ipProfile?.geo.city || ""}, ${ipProfile?.geo.country || ""}`
  };
}

export async function collectMxEvidence(input: EvidenceInput, mxExchange: string, priority: number): Promise<MxCandidateDetailed> {
  const bucket: EvidenceBucket = {
    dns: [], subdomain: [], ct: [], http: [], tls: [], ptr: [], port: [], bgp: [], rir: [], infrastructure: [], mx: [], historical: []
  };

  const { ip, domain, ipProfile, dnsResult } = input;

  // DNS Evidence
  bucket.dns.push({
    id: "DNS_MX_MATCH",
    type: "supporting",
    family: "DNS",
    strength: "strong",
    title: "Direct MX Record",
    description: `IP resolved from MX record ${mxExchange} with priority ${priority}.`,
    observedData: ip,
    source: "DNS",
    timestamp: nowTimestamp(),
    relation: "email infrastructure"
  });

  // SPF Evidence
  const spfRecord = dnsResult.txt.find((t: string) => t.toLowerCase().startsWith("v=spf1"));
  if (spfRecord) {
    bucket.dns.push({
      id: "SPF_RECORD",
      type: "supporting",
      family: "Email_Auth",
      strength: "medium",
      title: "SPF Record",
      description: "Domain has an SPF record.",
      observedData: spfRecord,
      source: "DNS",
      timestamp: nowTimestamp(),
      relation: "email policy"
    });
  }

  // DMARC Evidence
  const dmarcRecord = dnsResult.txt.find((t: string) => t.toLowerCase().startsWith("_dmarc: v=dmarc1"));
  if (dmarcRecord) {
    bucket.dns.push({
      id: "DMARC_RECORD",
      type: "supporting",
      family: "Email_Auth",
      strength: "medium",
      title: "DMARC Record",
      description: "Domain has a DMARC record.",
      observedData: dmarcRecord,
      source: "DNS",
      timestamp: nowTimestamp(),
      relation: "email policy"
    });
  }

  // PTR Evidence
  const ptrMatch = ipProfile?.ptr.find((ptr) => ptr.toLowerCase().includes(domain.toLowerCase()));
  if (ptrMatch) {
    bucket.ptr.push({
      id: "PTR_MATCH",
      type: "supporting",
      family: "Reverse_DNS",
      strength: "strong",
      title: "Reverse DNS Match",
      description: "The MX IP's PTR record points back to the target domain.",
      observedData: ptrMatch,
      source: "DNS-PTR",
      timestamp: nowTimestamp(),
      relation: "email infrastructure"
    });
  } else if (ipProfile?.ptr.length) {
    bucket.ptr.push({
      id: "PTR_OTHER",
      type: "neutral",
      family: "Reverse_DNS",
      strength: "weak",
      title: "Reverse DNS",
      description: "The MX IP has a PTR record pointing to another domain.",
      observedData: ipProfile.ptr.join(", "),
      source: "DNS-PTR",
      timestamp: nowTimestamp(),
      relation: "shared infrastructure"
    });
  }

  // BGP / Network Evidence
  if (ipProfile?.asn.org) {
    bucket.bgp.push({
      id: "BGP_ASN_ORG",
      type: "supporting",
      family: "BGP_ASN",
      strength: "strong",
      title: "BGP ASN Organization",
      description: `BGP origin ASN belongs to ${ipProfile.asn.org}.`,
      observedData: ipProfile.asn.org,
      source: "BGP",
      timestamp: nowTimestamp(),
      relation: "network infrastructure"
    });
  }

  // EmailOwnershipModel logic
  const announcedPrefix = ipProfile?.announcedPrefix || "UNKNOWN";
  const rirOwner = ipProfile?.rirAllocationOwner || "UNKNOWN";
  const asnOrg = ipProfile?.asn.org || "UNKNOWN";

  let networkIdentity = "UNKNOWN";
  let networkExplanation = "Insufficient explicit evidence to determine network operator. BGP announcement alone does not confirm operation.";
  let networkConf = 0;
  
  if (rirOwner !== "UNKNOWN" && asnOrg !== "UNKNOWN") {
    const rirClean = rirOwner.toLowerCase().replace(/[^a-z0-9]/g, "");
    const asnClean = asnOrg.toLowerCase().replace(/[^a-z0-9]/g, "");
    
    if (rirClean.includes(asnClean) || asnClean.includes(rirClean)) {
      networkIdentity = asnOrg;
      networkExplanation = "Consistent network operation. RIR allocation holder matches the BGP ASN organization.";
      networkConf = 90;
    } else {
      networkExplanation = "Allocation/operator mismatch. RIR allocation holder differs from BGP ASN organization. Further evidence needed to confirm network operator.";
    }
  }

  let emailIdentity = "UNKNOWN";
  let emailExplanation = "Insufficient explicit evidence to determine email provider.";
  let emailConf = 0;
  let emailStatus: "Confirmed" | "Inferred from BGP" | "Unknown" = "Unknown";

  // Infer email provider from PTR or known ASN, SPF correlation would be better
  const ptrsStr = (ipProfile?.ptr || []).join(" ").toLowerCase();
  if (ptrsStr.includes("google") || ptrsStr.includes("googlemail")) {
    emailIdentity = "Google Workspace";
    emailExplanation = "Email provider identified via provider-specific PTR records.";
    emailConf = 90;
    emailStatus = "Confirmed";
  } else if (ptrsStr.includes("outlook.com") || ptrsStr.includes("protection.outlook.com")) {
    emailIdentity = "Microsoft Exchange Online";
    emailExplanation = "Email provider identified via provider-specific PTR records.";
    emailConf = 90;
    emailStatus = "Confirmed";
  } else if (networkIdentity !== "UNKNOWN") {
    emailIdentity = networkIdentity;
    emailExplanation = "Email provider inferred from Network Operator due to lack of distinct email hosting evidence.";
    emailConf = 70; // Fallback to network operator
    emailStatus = "Inferred from BGP";
  } else if (asnOrg !== "UNKNOWN") {
    emailIdentity = asnOrg;
    emailExplanation = "Email provider inferred from ASN Organization.";
    emailConf = 60;
    emailStatus = "Inferred from BGP";
  }

  const ownershipChain: EmailOwnershipModel = {
    ipPrefix: {
      concept: "ipPrefix",
      label: "IP Routing Prefix",
      identity: announcedPrefix,
      confidence: announcedPrefix !== "UNKNOWN" ? 100 : 0,
      explanation: "IP routing prefix.",
      evidenceCount: 1
    },
    rirAllocation: {
      concept: "rirAllocation",
      label: "RIR Allocation",
      identity: rirOwner,
      confidence: rirOwner !== "UNKNOWN" ? 95 : 0,
      explanation: "Official RIR registration for the IP space.",
      evidenceCount: 1
    },
    asnOperation: {
      concept: "asnOperation",
      label: "ASN Organization",
      identity: asnOrg,
      confidence: asnOrg !== "UNKNOWN" ? 95 : 0,
      explanation: "Organization announcing the BGP route.",
      evidenceCount: 1
    },
    networkOperation: {
      concept: "networkOperation",
      label: "Network Operator",
      identity: networkIdentity,
      confidence: networkConf,
      explanation: networkExplanation,
      evidenceCount: networkIdentity !== "UNKNOWN" ? 2 : 0
    },
    emailProvider: {
      concept: "emailProvider",
      label: "Email Provider",
      identity: emailIdentity,
      confidence: emailConf,
      explanation: emailExplanation,
      evidenceCount: emailIdentity !== "UNKNOWN" ? 1 : 0,
      status: emailStatus
    },
    applicationOperator: {
      concept: "applicationOperator",
      label: "Application Operator",
      identity: "UNKNOWN",
      confidence: 0,
      explanation: "Application Operator not directly inferred from MX records.",
      evidenceCount: 0
    },
    probableCustomer: {
      concept: "probableCustomer",
      label: "Probable Customer",
      identity: "UNKNOWN",
      confidence: 0,
      explanation: "Insufficient explicit evidence to determine end customer from MX.",
      evidenceCount: 0
    },
    estimatedLocation: {
      concept: "estimatedLocation",
      label: "Estimated Location",
      identity: `${ipProfile?.geo.city || "Unknown"}, ${ipProfile?.geo.country || "Unknown"}`,
      confidence: ipProfile?.geo.country ? 60 : 0,
      explanation: "Estimated physical location based on IP geolocation. This is an estimate, not a confirmed physical location.",
      evidenceCount: 1
    }
  };

  return {
    ip,
    hostname: mxExchange,
    priority,
    ownershipChain,
    evidence: bucket
  };
}
