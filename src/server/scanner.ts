import dns from "node:dns/promises";
import type { ActiveOptions, RiskFinding, ScanProgress, ScanRequest, ScanResult, OriginCandidate } from "../shared/types.js";
import { serverConfig } from "./config.js";
import { getDnsDeepScan, discoverSubdomains, probeDkimSelectors } from "./modules/dns.js";
import { getDomainProfile } from "./modules/domain.js";


import { collectHttp, inspectTls } from "./modules/http.js";
import { getIpProfile } from "./modules/ip.js";
import { collectCtSubdomains } from "./modules/passive.js";
import { grabBanners, runDiscreteNmap, runTraceroute } from "./modules/active.js";
import { buildInfrastructureSupplyChain } from "./modules/infrastructure.js";
import { delayByPolicy, limitList, normalizeTarget, unique } from "./utils.js";

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
    merged.faviconHash = false;
    merged.quicProbe = false;
    merged.dnsAlterations = false;
    merged.dnsAxfr = false;
    merged.jarmFingerprint = false;
  }
  merged.maxHosts = Math.min(Math.max(1, merged.maxHosts), 100);
  merged.maxPorts = Math.min(Math.max(1, merged.maxPorts), 100);
  merged.maxDepth = Math.min(Math.max(0, merged.maxDepth), 10000);
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
      options.faviconHash = true;
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

  if (dkimSelectors.length) dnsResult.txt.push(...dkimSelectors.map((selector) => `dkim selector observed: ${selector}`));
  
  if (options.dnsAxfr) {
    dnsResult.zoneTransfer = await probeAxfr(domain, dnsResult.ns, options.dnsAxfr, options.timeoutMs);
  }
  
  let subdomains = limitList(unique([...ct.subdomains, ...bruteSubdomains]), options.maxHosts);
  if (options.dnsAlterations && subdomains.length > 0) {
      const altered = await generateDnsAlterations(domain, subdomains, options.dnsAlterations, options.maxHosts);
      subdomains = limitList(unique([...subdomains, ...altered]), options.maxHosts);
  }



  emit({ status: "running", stage: "ip", message: "Profiling IP addresses and ASN owners", percent: 38 });
  const mxDomains = unique(dnsResult.mx.map(mx => mx.exchange.toLowerCase().replace(/^\./, '')));
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
  
  // Find all unique IPs from subdomains and MX records that we collected
  const candidateIps = new Set<string>();
  if (dnsResult.a) dnsResult.a.forEach(ip => candidateIps.add(ip));
  
  await Promise.all([
    ...subdomains.slice(0, 50).map(async (sub) => {
      try {
        const res = await dns.resolve4(`${sub}.${domain}`);
        res.forEach(ip => candidateIps.add(ip));
      } catch { }
    }),
    ...(dnsResult.mx ? dnsResult.mx.map(async (mx) => {
      try {
        const res = await dns.resolve4(mx.exchange);
        res.forEach(ip => candidateIps.add(ip));
      } catch { }
    }) : [])
  ]);

  // Filter IPs that don't belong to CDNs
  for (const ip of candidateIps) {
      try {
          const profile = await getIpProfile(ip, options.timeoutMs);
          const orgName = (profile.asn.org ?? profile.networkName ?? "").toLowerCase();
          const isCdn = cdnKeywords.some(kw => orgName.includes(kw));
          
          if (!isCdn && orgName) {
              let confidence: "high" | "medium" | "low" = orgName.includes("hosting") || orgName.includes("cloud") ? "high" : "medium";
              let sourceMsg = "DNS/Subdomain Leak";

              // Try to connect to 443 on this IP and check the certificate
              if (activeAllowed(request.mode)) {
                  try {
                      const tls = await import("node:tls");
                          const certMatch = await new Promise<boolean>((resolve) => {
                          const socket = tls.connect({
                              host: ip,
                              port: 443,
                              servername: domain,
                              rejectUnauthorized: false,
                              timeout: 3000
                          }, () => {
                              const cert = socket.getPeerCertificate();
                              socket.destroy();
                              resolve(!!(cert.subject?.CN?.includes(domain) || cert.subjectaltname?.includes(domain)));
                          });
                          socket.on("error", () => resolve(false));
                          socket.on("timeout", () => { socket.destroy(); resolve(false); });
                      });
                      if (certMatch) {
                          confidence = "high";
                          sourceMsg = "DNS Leak + TLS Certificat Confirmat (100%)";
                      }
                  } catch {
                      // ignore
                  }
              }

              origins.push({
                  ip,
                  source: sourceMsg,
                  provider: profile.asn.org ?? profile.networkName ?? "Unknown",
                  confidence
              });
          }
      } catch {
          // ignore
      }
  }

  emit({ status: "running", stage: "asm", message: "Building ASM graph and risk findings", percent: 90 });
  
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
    warnings: [
      ...supplyChain.infrastructure.warnings,
      ...(ct.source?.note ? [`CT source warning: ${ct.source.note}`] : []),
      "Ownership history is limited to public free sources and may be incomplete."
    ]
  };

  emit({ status: "done", stage: "done", message: "Scan complete", percent: 100 });
  return { ...partial, risks: [] };
};
