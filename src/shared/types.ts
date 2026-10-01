export type ScanMode =
  | "passive"
  | "controlled-active"
  | "active-discovery"
  | "network-map"
  | "dns-only";

export type ScanStatus = "queued" | "running" | "done" | "failed" | "pending" | "scanning" | "completed";

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
  targetType?: "domain" | "ip" | "email";
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
  hostedDomains?: string[];
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
  sensitiveFiles?: string[];
  vhostResponses?: Record<string, number>;
  quicSupported?: boolean;
  errorSignature?: string;
};



export type EvidenceType = "supporting" | "contradiction" | "neutral";
export type EvidenceFamily =
  | "DNS"
  | "TLS"
  | "HTTP"
  | "Certificate"
  | "BGP_ASN"
  | "RIR_RDAP"
  | "Reverse_DNS"
  | "Historical"
  | "Infrastructure"
  | "Port_Service"
  | "Geolocation"
  | "Email"
  | "Email_Auth";

export type EvidenceSignal = {
  id: string;
  type: EvidenceType;
  family: EvidenceFamily;
  strength: "strong" | "medium" | "weak";
  title: string;
  description: string;
  observedData: string;
  source: string;
  timestamp: string;
  relation: string;
};

export type CandidateClassification =
  | "direct web origin"
  | "probable origin"
  | "possible origin"
  | "CDN/WAF edge"
  | "shared hosting"
  | "unrelated"
  | "email-only";

export type AttributionConfidences = {
  origin: number;
  hosting: number;
  network: number;
  allocation: number;
  application: number;
  customer: number;
  geo: number;
  email: number;
};

export type EvidenceBucket = {
  dns: EvidenceSignal[];
  subdomain: EvidenceSignal[];
  ct: EvidenceSignal[];
  http: EvidenceSignal[];
  tls: EvidenceSignal[];
  ptr: EvidenceSignal[];
  port: EvidenceSignal[];
  bgp: EvidenceSignal[];
  rir: EvidenceSignal[];
  infrastructure: EvidenceSignal[];
  mx: EvidenceSignal[];
  historical: EvidenceSignal[];
};

export type OriginCandidateDetailed = {
  ip: string;
  domain: string;
  classification: "direct web origin" | "probable origin" | "possible origin" | "CDN/WAF edge" | "shared hosting" | "email-only" | "unrelated";
  evidence: EvidenceBucket;
  ownershipChain: DecoupledOwnershipModel;
  confidenceRating: "HIGH CONFIDENCE" | "MEDIUM CONFIDENCE" | "LOW CONFIDENCE" | "NOT ESTABLISHED";
  explanation: string;
  // Legacy fields below (to keep UI from completely breaking if it relies on them)
  score: number; 
  confidences: AttributionConfidences;
  supportingSignals: EvidenceSignal[];
  contradictionSignals: EvidenceSignal[];
  provider: string;
  asn: string;
  location: string;
  relativeRank?: number;
  missingEvidence?: string[];
  inconclusive?: boolean;
};

export type ConfidenceRating = "high" | "medium" | "low" | "none";

export type OwnershipConceptType =
  | "ipPrefix"
  | "rirAllocation"
  | "asnOperation"
  | "networkOperation"
  | "hostingProvider"
  | "applicationOperator"
  | "emailProvider"
  | "probableCustomer"
  | "estimatedLocation";

export type OwnershipConcept = {
  concept: OwnershipConceptType;
  label: string;
  identity: string;
  confidence: number;
  confidenceRating?: ConfidenceRating;
  evidenceCount: number;
  explanation: string;
  details?: Record<string, any>;
  signals?: EvidenceSignal[];
  status?: "Confirmed" | "Inferred from BGP" | "Unknown" | "Inferred";
};

export type DecoupledOwnershipModel = {
  ipPrefix: OwnershipConcept;
  rirAllocation: OwnershipConcept;
  asnOperation: OwnershipConcept;
  networkOperation: OwnershipConcept;
  hostingProvider: OwnershipConcept;
  applicationOperator: OwnershipConcept;
  probableCustomer: OwnershipConcept;
  estimatedLocation: OwnershipConcept;
};

export type EmailOwnershipModel = {
  ipPrefix: OwnershipConcept;
  rirAllocation: OwnershipConcept;
  asnOperation: OwnershipConcept;
  networkOperation: OwnershipConcept;
  emailProvider: OwnershipConcept;
  applicationOperator: OwnershipConcept;
  probableCustomer: OwnershipConcept;
  estimatedLocation: OwnershipConcept;
};

export type MxCandidateDetailed = {
  ip: string;
  hostname: string;
  priority: number;
  ownershipChain: EmailOwnershipModel;
  evidence: EvidenceBucket;
};

export type MxInfrastructureSummary = {
  domain: string;
  mxRecords: { exchange: string; priority: number }[];
  ips: string[];
  providers: string[];
  isolatedFromWebOrigin: boolean;
  candidates: MxCandidateDetailed[];
};

export type NarrativeVerdict = {
  summary: string;
  classification: string;
  confidenceScore: number;
  explanation: string;
  keyEvidence: string[];
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
  targetType?: "domain" | "ip" | "email";
  originalTarget?: string;
  dnsHistory?: DnsHistoryEntry[];
  id?: string;
  targetDomain?: string;
  timestamp?: string;
  status?: ScanStatus;
  progress?: number;
  currentStage?: string;
  stageName?: string;
  domain: DomainProfile;
  ownership: DecoupledOwnershipModel | OwnershipTimelineItem[] | any;
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
  candidates: OriginCandidateDetailed[];
  topOriginCandidate?: OriginCandidateDetailed;
  decoupledOwnership?: DecoupledOwnershipModel;
  ownershipModel?: DecoupledOwnershipModel;
  mxInfrastructure: MxInfrastructureSummary;
  narrativeVerdict: NarrativeVerdict;
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


export type DnsHistoryEntry = {
  type: "A" | "NS" | "MX" | "CERT" | "AAAA" | "CNAME" | "TXT" | string;
  value: string;
  firstSeen?: string;
  lastSeen?: string;
  source: string;
};
