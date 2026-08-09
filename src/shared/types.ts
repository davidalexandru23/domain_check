export type ScanMode =
  | "passive"
  | "controlled-active"
  | "active-discovery"
  | "network-map"
  | "dns-only";

export type ScanStatus = "queued" | "running" | "done" | "failed";

export type ActiveOptions = {
  nmap: boolean;
  traceroute: boolean;
  dnsBruteforce: boolean;
  vhostProbe: boolean;
  httpFingerprint: boolean;
  tlsInspect: boolean;
  bannerGrab: boolean;
  infrastructureTrace: boolean;
  wappalyzer: boolean;
  dirbust: boolean;
  faviconHash: boolean;
  quicProbe: boolean;
  dnsAlterations: boolean;
  dnsAxfr: boolean;
  jarmFingerprint: boolean;
  maxPorts: number;
  maxHosts: number;
  maxDepth: number;
  concurrency: number;
  rateLimit: number;
  timeoutMs: number;
};

export type ScanRequest = {
  target: string;
  mode: ScanMode;
  options?: Partial<ActiveOptions>;
};

export type SourceRef = {
  name: string;
  url?: string;
  confidence: "high" | "medium" | "low";
  note?: string;
};

export type DomainProfile = {
  domain: string;
  registry?: string;
  registrar?: string;
  registrantOrg?: string;
  adminContact?: string;
  techContact?: string;
  statuses: string[];
  nameservers: string[];
  privacyDetected: boolean;
  importantDates: Record<string, string>;
  sources: SourceRef[];
};

export type OwnershipTimelineItem = {
  date: string;
  type: "registrar" | "nameserver" | "certificate" | "dns" | "rdap";
  value: string;
  source: SourceRef;
};

export type DnsRecordSet = {
  a: string[];
  aaaa: string[];
  ns: string[];
  mx: Array<{ exchange: string; priority: number }>;
  txt: string[];
  soa?: string;
  caa: string[];
  ptr: Record<string, string[]>;
  dnssec: boolean;
  ttl: Record<string, number>;
  wildcard: boolean;
  zoneTransfer: "blocked" | "open" | "unknown";
  warnings: string[];
};

export type GeoPoint = {
  country?: string;
  region?: string;
  city?: string;
  lat?: number;
  lon?: number;
  source?: string;
};

export type AsnProfile = {
  asn?: string;
  org?: string;
  cidr?: string;
  rir?: string;
  route?: string;
  facCount?: number;
  ixCount?: number;
  website?: string;
};

export type ProviderConfidence = "high" | "medium" | "low";

export type InfrastructureProvider = {
  role: "domain-owner" | "dns" | "email" | "cdn" | "hosting" | "asn" | "rir" | "upstream" | "peer" | "facility" | "unknown";
  name: string;
  evidence: SourceRef[];
  confidence: ProviderConfidence;
};

export type UpstreamRelation = {
  asn: string;
  org?: string;
  relationship: "upstream" | "peer" | "downstream" | "unknown";
  source: SourceRef;
};

export type AllocationChain = {
  rir?: string;
  networkName?: string;
  allocationOwner?: string;
  parentNetwork?: string;
  startAddress?: string;
  endAddress?: string;
  announcedPrefix?: string;
  originAsn?: string;
  originOrg?: string;
};

export type NetworkLeaseSignal = {
  kind: "in-house" | "direct-provider" | "cdn-proxy" | "reseller" | "subleased" | "suballocated" | "unknown";
  message: string;
  confidence: ProviderConfidence;
  evidence: SourceRef[];
};

export type IpProfile = {
  ip: string;
  ptr: string[];
  asn: AsnProfile;
  geo: GeoPoint;
  providerType: "cloud" | "cdn" | "isp" | "enterprise" | "unknown";
  landlord?: string;
  rirAllocationOwner?: string;
  networkName?: string;
  parentNetwork?: string;
  originAsn?: string;
  announcedPrefix?: string;
  upstreams: UpstreamRelation[];
  peers: UpstreamRelation[];
  ixPresence: string[];
  facilityPresence: string[];
  sources: SourceRef[];
};

export type IpSupplyChain = {
  ip: string;
  providerRole: "cdn" | "hosting" | "email" | "dns" | "unknown";
  allocation: AllocationChain;
  leaseSignals: NetworkLeaseSignal[];
  upstreams: UpstreamRelation[];
  peers: UpstreamRelation[];
  ixPresence: string[];
  facilityPresence: string[];
  confidence: ProviderConfidence;
};

export type InfrastructureSupplyChain = {
  domainOwner?: string;
  roleProviders: InfrastructureProvider[];
  ipChains: IpSupplyChain[];
  verdict:
    | "In-house infrastructure"
    | "Direct provider"
    | "CDN/proxy provider"
    | "Hosted by reseller"
    | "Likely subleased network"
    | "Unknown, insufficient public evidence";
  confidence: ProviderConfidence;
  evidence: SourceRef[];
  warnings: string[];
};

export type NetworkHop = {
  hop: number;
  ip?: string;
  host?: string;
  rttMs?: number;
  asn?: AsnProfile;
  geo?: GeoPoint;
};

export type PortFinding = {
  host: string;
  port: number;
  protocol: "tcp";
  state: "open" | "closed" | "filtered" | "unknown";
  service?: string;
  product?: string;
  version?: string;
  source: "nmap" | "tcp-connect";
};

export type ServiceBanner = {
  host: string;
  port: number;
  banner: string;
  protocol: string;
};

export type TlsProfile = {
  host: string;
  validFrom?: string;
  validTo?: string;
  issuer?: string;
  subject?: string;
  san: string[];
  protocol?: string;
  cipher?: string;
};

export type HttpProfile = {
  url: string;
  status?: number;
  redirects: string[];
  title?: string;
  headers: Record<string, string>;
  cookies: Array<{ name: string; flags: string[] }>;
  technologies: string[];
  faviconHash?: string;
  sensitiveFiles?: string[];
  vhostResponses?: Record<string, number>;
  quicSupported?: boolean;
  errorSignature?: string;
};



export type RiskFinding = {
  id: string;
  severity: "info" | "low" | "medium" | "high";
  title: string;
  detail: string;
  evidence?: string;
};

export type OriginCandidate = {
  ip: string;
  source: string;
  provider: string;
  confidence: "high" | "medium" | "low";
};

export type ScanResult = {
  domain: DomainProfile;
  ownership: OwnershipTimelineItem[];
  dns: DnsRecordSet;
  ips: IpProfile[];
  network: NetworkHop[];
  ports: PortFinding[];
  banners: ServiceBanner[];
  tls: TlsProfile[];
  http: HttpProfile[];
  subdomains: string[];
  infrastructure: InfrastructureSupplyChain;
  risks: RiskFinding[];
  warnings: string[];
  origins: OriginCandidate[];
};

export type ScanProgress = {
  scanId: string;
  status: ScanStatus;
  stage: string;
  message: string;
  percent: number;
  at: string;
};

export type ScanJob = {
  id: string;
  request: ScanRequest;
  status: ScanStatus;
  createdAt: string;
  updatedAt: string;
  progress: ScanProgress[];
  result?: ScanResult;
  error?: string;
};
