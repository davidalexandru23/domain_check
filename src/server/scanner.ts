import dns from "node:dns/promises";
import type { ActiveOptions, RiskFinding, ScanProgress, ScanRequest, ScanResult, OriginCandidate, OriginCandidateDetailed, MxInfrastructureSummary, NarrativeVerdict } from "../shared/types.js";
import { serverConfig } from "./config.js";
import { getDnsDeepScan, discoverSubdomains, probeDkimSelectors } from "./modules/dns.js";
import { getDomainProfile } from "./modules/domain.js";


import { collectHttp, inspectTls } from "./modules/http.js";
import { collectCtSubdomains } from "./modules/passive.js";
import { getIpProfile } from "./modules/ip.js";
import { collectAllEvidence, collectHistoricalEvidence, collectMxEvidence } from "./modules/evidenceEngine.js";
import { grabBanners, runDiscreteNmap, runTraceroute } from "./modules/active.js";
import { buildInfrastructureSupplyChain } from "./modules/infrastructure.js";
// removed import
import { classifyProvider, delayByPolicy, limitList, normalizeTarget, unique } from "./utils.js";

export type ProgressSink = (progress: Omit<ScanProgress, "scanId" | "at">) => void;

export const mergeOptions = (options?: Partial<ActiveOptions>): ActiveOptions => {
  const merged = { ...serverConfig.defaultOptions, ...options };
  if (!serverConfig.activeEnabled) {
    merged.nmap = false;
    merged.traceroute = false;
    merged.dnsBruteforce = false;
    merged.vhostProbe = false;
    merged.bannerGrab = false;
    merged.infrastructureTrace = false;
    merged.wappalyzer = false;
    merged.dirbust = false;
    merged.quicProbe = false;
    merged.dnsAlterations = false;
    merged.dnsAxfr = false;
    merged.jarmFingerprint = false;
  }
  merged.maxHosts = Math.min(Math.max(1, merged.maxHosts), 100);
  merged.maxPorts = Math.min(Math.max(1, merged.maxPorts), 100);
  merged.maxDepth = Math.min(Math.max(0, merged.maxDepth), 30);
  merged.concurrency = Math.min(Math.max(1, merged.concurrency), 8);
  merged.rateLimit = Math.max(0, merged.rateLimit);
  merged.timeoutMs = Math.min(Math.max(3000, merged.timeoutMs), 60000);
  
  return merged;
};

const activeAllowed = (mode: ScanRequest["mode"]) => ["controlled-active", "active-discovery", "network-map"].includes(mode);

const ipListFromDns = (dnsResult: ScanResult["dns"]) => unique([...dnsResult.a, ...dnsResult.aaaa]);

const risksFor = (result: Omit<ScanResult, "graph" | "risks">, dkimSelectors: string[], emailPattern: string): RiskFinding[] => {
  const risks: RiskFinding[] = [];
  if (result.domain.privacyDetected) {
    risks.push({ id: "whois-privacy", severity: "info", title: "WHOIS privacy detected", detail: "Registrant or contact data appears redacted or protected." });
  }
  if (!result.dns.dnssec) {
    risks.push({ id: "dnssec-missing", severity: "low", title: "DNSSEC not detected", detail: "No DS record was observed for the domain." });
  }
  if (!result.dns.txt.some((txt) => txt.toLowerCase().includes("v=spf1"))) {
    risks.push({ id: "spf-missing", severity: "medium", title: "SPF record missing", detail: "TXT records do not show an SPF policy." });
  }
  if (!result.dns.txt.some((txt) => txt.toLowerCase().includes("v=dmarc1"))) {
    risks.push({ id: "dmarc-missing", severity: "medium", title: "DMARC record missing", detail: "No DMARC TXT policy was found in collected records." });
  }
  if (!dkimSelectors.length) {
    risks.push({ id: "dkim-not-observed", severity: "info", title: "DKIM selector not observed", detail: "Common DKIM selectors did not resolve." });
  }
  for (const port of result.ports) {
    if ([22, 3389, 3306, 5432, 6379, 9200, 27017].includes(port.port)) {
      risks.push({ id: `open-${port.host}-${port.port}`, severity: "medium", title: `Sensitive service exposed on ${port.port}`, detail: `${port.host} exposes TCP ${port.port}.`, evidence: port.service });
    }
  }
  if (emailPattern !== "unknown") {
    risks.push({ id: "email-pattern", severity: "info", title: "Email pattern inferred", detail: `Observed email pattern: ${emailPattern}.` });
  }

  // Process advanced HTTP findings
  for (const h of result.http) {
    if (h.sensitiveFiles?.length) {
      risks.push({ id: `sensitive-files-${h.url}`, severity: "medium", title: "Sensitive files exposed", detail: `Found sensitive files on ${h.url}: ${h.sensitiveFiles.join(", ")}` });
    }
  }

  // Process DNS warnings
  for (const w of result.dns.warnings) {
    if (w.includes("Subdomain takeover risk detected")) {
      risks.push({ id: `subdomain-takeover`, severity: "high", title: "Subdomain Takeover Vulnerability", detail: w });
    }
  }

  return risks;
};

export const runScan = async (request: ScanRequest, emit: ProgressSink): Promise<ScanResult> => {
  const domain = normalizeTarget(request.target);
  const options = mergeOptions(request.options);
  
  if (request.mode === "active-discovery") {
      options.nmap = true;
      options.traceroute = true;
      options.dnsBruteforce = true;
      options.vhostProbe = true;
      options.httpFingerprint = true;
      options.tlsInspect = true;
      options.bannerGrab = true;
      options.infrastructureTrace = true;
      options.wappalyzer = true;
      options.dirbust = true;
      options.quicProbe = true;
      options.dnsAlterations = true;
      options.dnsAxfr = true;
      options.jarmFingerprint = true;
      options.maxHosts = 100;
      options.maxPorts = 100;
  }

  emit({ status: "running", stage: "domain", message: "Collecting initial recon data concurrently...", percent: 5 });

  const [
    { profile, ownership },
    dnsResult,
    dkimSelectors,
    ct,
    bruteSubdomains,
    { generateDnsAlterations, probeAxfr }
  ] = await Promise.all([
    getDomainProfile(domain, options.timeoutMs),
    getDnsDeepScan(domain),
    probeDkimSelectors(domain),
    request.mode === "dns-only" ? Promise.resolve({ subdomains: [], timeline: [], source: undefined }) : collectCtSubdomains(domain, options.timeoutMs),
    activeAllowed(request.mode) || request.mode === "active-discovery" ? discoverSubdomains(domain, options.dnsBruteforce, options.maxHosts) : Promise.resolve([]),
    import("./modules/dns.js")
  ]);

  if (dkimSelectors.length) dnsResult.txt.push(...dkimSelectors.map((selector: string) => `dkim selector observed: ${selector}`));
  
  if (options.dnsAxfr) {
    dnsResult.zoneTransfer = await probeAxfr(domain, dnsResult.ns, options.dnsAxfr, options.timeoutMs);
  }
  
  let subdomains = limitList(unique([...ct.subdomains, ...bruteSubdomains]), options.maxHosts);
  if (options.dnsAlterations && subdomains.length > 0) {
      const altered = await generateDnsAlterations(domain, subdomains, options.dnsAlterations, options.maxHosts);
      subdomains = limitList(unique([...subdomains, ...altered]), options.maxHosts);
  }



  emit({ status: "running", stage: "ip", message: "Profiling IP addresses and ASN owners", percent: 38 });
  const mxDomains = unique(dnsResult.mx.map((mx: { exchange: string; priority: number }) => mx.exchange.toLowerCase().replace(/^\./, '')));
  const allHosts = unique([domain, ...subdomains, ...mxDomains]).slice(0, options.maxHosts);
  const resolvedIps: string[] = [...ipListFromDns(dnsResult)];
  for (const host of allHosts) {
    try {
      resolvedIps.push(...(await dns.resolve4(host)));
    } catch {
      // a continua fara gazda
    }
    await delayByPolicy(options.rateLimit);
  }
  let ips = [];
  for (const ip of limitList(unique(resolvedIps), options.maxHosts)) {
    ips.push(await getIpProfile(ip, options.timeoutMs));
    await delayByPolicy(options.rateLimit);
  }

  emit({ status: "running", stage: "http", message: "Collecting HTTP and TLS posture", percent: 50 });
  const http = [];
  const tls = [];
  if (request.mode !== "dns-only") {
    for (const host of allHosts.slice(0, Math.min(options.maxHosts, 20))) {
      http.push(...(await collectHttp(host, options)));
      if (options.tlsInspect) {
        const profile = await inspectTls(host, options.timeoutMs);
        if (profile) tls.push(profile);
      }
      await delayByPolicy(options.rateLimit);
    }
  }

  emit({ status: "running", stage: "infrastructure", message: "Tracing infrastructure supply chain", percent: 58 });
  const supplyChain = await buildInfrastructureSupplyChain(profile.registrantOrg, dnsResult, ips, http, options.infrastructureTrace, options.timeoutMs);
  ips = supplyChain.ips;

  emit({ status: "running", stage: "network", message: "Running controlled network collection", percent: 65 });
  const ports = [];
  const banners = [];
  const network = [];
  if (activeAllowed(request.mode)) {
    for (const ip of ips.slice(0, Math.min(options.maxHosts, 10))) {
      ports.push(...(await runDiscreteNmap(ip.ip, options)));
      if (options.traceroute && network.length === 0) network.push(...(await runTraceroute(ip.ip, options.traceroute, options.timeoutMs)));
      await delayByPolicy(options.rateLimit);
    }
    banners.push(...(await grabBanners(ports, options)));
  }


  emit({ status: "running", stage: "asm", message: "Analyzing DNS records for Origin IP leaks", percent: 85 });
  const origins: OriginCandidate[] = [];
  const cdnKeywords = ["cloudflare", "akamai", "fastly", "incapsula", "sucuri", "imperva", "ddos-guard"];
  
  const candidateIps = new Set<string>();
  const candidateSources = new Map<string, Set<string>>();
  const mxIps = new Set<string>();
  const addCandidate = (ip: string, source: string) => {
    candidateIps.add(ip);
    const set = candidateSources.get(ip) ?? new Set<string>();
    set.add(source);
    candidateSources.set(ip, set);
  };
  if (dnsResult.a) dnsResult.a.forEach((ip: string) => candidateIps.add(ip));
  if (dnsResult.a) dnsResult.a.forEach((ip: string) => addCandidate(ip, domain));
  
  await Promise.all([
    ...subdomains.slice(0, 50).map(async (sub: string) => {
      try {
        const host = sub.endsWith(domain) ? sub : `${sub}.${domain}`;
        const res = await dns.resolve4(host);
        res.forEach((ip: string) => addCandidate(ip, host));
      } catch { }
    }),
    ...(dnsResult.mx ? dnsResult.mx.map(async (mx: { exchange: string; priority: number }) => {
      try {
        const res = await dns.resolve4(mx.exchange);
        res.forEach((ip: string) => {
          mxIps.add(ip);
          addCandidate(ip, mx.exchange);
        });
      } catch { }
    }) : [])
  ]);

  for (const ip of candidateIps) {
      try {
          const profile = ips.find((item) => item.ip === ip) ?? await getIpProfile(ip, options.timeoutMs);
          const orgName = (profile.asn.org ?? profile.networkName ?? "").toLowerCase();
          const isCdn = cdnKeywords.some(kw => orgName.includes(kw));
          
          if (!isCdn && orgName) {
              origins.push({
                  ip,
                  source: Array.from(candidateSources.get(ip) ?? ["DNS leak"]).join(", "),
                  provider: profile.asn.org ?? profile.networkName ?? "Unknown",
                  confidence: classifyProvider(profile.asn.org) === "cloud" ? "medium" : "high"
              });
          }
      } catch {
          // ignore
      }
  }

  emit({ status: "running", stage: "asm", message: "Building ASM graph and risk findings", percent: 90 });
  
  const candidates: OriginCandidateDetailed[] = [];
  for (const ip of candidateIps) {
    const ipProfile = ips.find((item) => item.ip === ip) ?? await getIpProfile(ip, options.timeoutMs);
    
    // Etapa 6: Collect historical/external evidence
    let historicalData: Awaited<ReturnType<typeof collectHistoricalEvidence>> | undefined;
    if (options.infrastructureTrace) {
      try {
        historicalData = await collectHistoricalEvidence(
          ip, domain,
          ipProfile.asn.asn,
          ipProfile.announcedPrefix,
          options.timeoutMs
        );
      } catch { /* historical enrichment failed, continue without it */ }
    }

    const candidate = await collectAllEvidence({
      domain,
      ip,
      ipProfile,
      dnsResult,
      httpResults: http,
      tlsResults: tls,
      ports,
      mxIps: Array.from(mxIps),
      subdomainHosts: Array.from(candidateSources.get(ip) ?? []),
      registrantOrg: profile.registrantOrg,
      timeoutMs: options.timeoutMs,
      // Etapa 6 data
      ctCertificates: historicalData?.ctCerts,
      peeringDbInfo: historicalData?.peeringDb,
      rpkiStatus: historicalData?.rpki,
      historicalPrefixes: historicalData?.historicalPrefixes
    });
    candidates.push(candidate);
  }

  // Determine top candidate by score (Etapa 9 Heuristics & Etapa 11 Separation)
  candidates.sort((a, b) => b.confidences.origin - a.confidences.origin);
  
  const webCandidates = candidates.filter(c => c.classification !== "email-only");
  
  if (webCandidates.length > 0) {
    let currentRank = 1;
    webCandidates[0].relativeRank = 1;
    for (let i = 1; i < webCandidates.length; i++) {
      if (webCandidates[i].confidences.origin < webCandidates[i-1].confidences.origin) {
        currentRank = i + 1;
      }
      webCandidates[i].relativeRank = currentRank;
    }

    if (webCandidates.length > 1 && webCandidates[0].confidences.origin === webCandidates[1].confidences.origin) {
      // Inconclusive if top two are equal
      webCandidates.forEach(c => {
        if (c.confidences.origin === webCandidates[0].confidences.origin) {
          c.inconclusive = true;
          c.explanation = "Au fost identificate mai multe candidate pentru Originea Web, cu dovezi echivalente. Sistemul nu poate selecta în mod justificat o singură origine.\n\n" + c.explanation;
        }
      });
    }
  }

  // Remove email-only candidates from the main web candidates list
  const finalCandidates = webCandidates;
  const topOriginCandidate = finalCandidates.length ? finalCandidates[0] : undefined;
  
  // Actually, we must assign finalCandidates to candidates so they don't appear in WEB ORIGIN CANDIDATES section
  // But wait, where did we assign `candidates` to `ScanResult`?
  // Let's just filter it in place:
  candidates.splice(0, candidates.length, ...finalCandidates);


  const mxCandidates = [];
  const mxProfiles = [];
  for (const mx of dnsResult.mx) {
    // find IPs for this MX hostname
    let mxTargetIps = [];
    if (mx.exchange) {
      try {
        const dnsModule = await import("node:dns/promises");
        const mxA = await dnsModule.resolve4(mx.exchange);
        mxTargetIps.push(...mxA);
      } catch { /* ignore */ }
    }
    for (const ip of unique(mxTargetIps)) {
      try {
        const profile = ips.find((item) => item.ip === ip) ?? await getIpProfile(ip, options.timeoutMs);
        mxProfiles.push(profile);
        const mxCandidate = await collectMxEvidence({
          domain, ip, ipProfile: profile, dnsResult, httpResults: http, tlsResults: tls, ports, mxIps: Array.from(mxIps), subdomainHosts: Array.from(candidateSources.get(ip) ?? []), registrantOrg: undefined, timeoutMs: options.timeoutMs
        }, mx.exchange, mx.priority);
        mxCandidates.push(mxCandidate);
      } catch {
        // a continua fara profil MX
      }
    }
  }

  const mxInfrastructure: MxInfrastructureSummary = {
    domain,
    mxRecords: dnsResult.mx,
    ips: Array.from(mxIps),
    providers: unique(mxProfiles.map((profile) => profile.asn.org ?? profile.rirAllocationOwner ?? profile.networkName).filter((provider): provider is string => Boolean(provider))),
    isolatedFromWebOrigin: Array.from(mxIps).every((ip) => !dnsResult.a.includes(ip) && !origins.some((origin) => origin.ip === ip)),
    candidates: mxCandidates
  };

  const topIpProfile = topOriginCandidate ? ips.find((ip) => ip.ip === topOriginCandidate.ip) : undefined;
  const decoupledOwnership = topOriginCandidate?.ownershipChain;

  const narrativeVerdict: NarrativeVerdict = {
    summary: topOriginCandidate ? `Top origin candidate ${topOriginCandidate.ip} scored ${topOriginCandidate.confidences.origin}/100` : "No origin candidate identified",
    classification: topOriginCandidate?.classification ?? "unknown",
    confidenceScore: topOriginCandidate?.confidences.origin ?? 0,
    explanation: topOriginCandidate?.explanation ?? "No evidence-backed origin candidate could be selected from the observed DNS, HTTP, TLS and network data.",
    keyEvidence: topOriginCandidate ? topOriginCandidate.supportingSignals.map(s => s.title) : []
  };

  const partial = {
    domain: profile,
    ownership: [...ownership, ...ct.timeline],
    dns: dnsResult,
    ips,
    network,
    ports,
    banners,
    tls,
    http,
    subdomains,
    infrastructure: supplyChain.infrastructure,
    origins,
    candidates,
    topOriginCandidate,
    decoupledOwnership,
    ownershipModel: decoupledOwnership,
    mxInfrastructure,
    narrativeVerdict,
    warnings: [
      ...supplyChain.infrastructure.warnings,
      ...(ct.source?.note ? [`CT source warning: ${ct.source.note}`] : []),
      "Ownership history is limited to public free sources and may be incomplete."
    ]
  };
  emit({ status: "done", stage: "done", message: "Scan complete", percent: 100 });
  return { ...partial, risks: [] } as unknown as ScanResult;
};
