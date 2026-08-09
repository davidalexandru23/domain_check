import type { ActiveOptions } from "../shared/types.js";

const intEnv = (name: string, fallback: number) => {
  const raw = process.env[name];
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(value) ? value : fallback;
};

const boolEnv = (name: string, fallback: boolean) => {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
};

export const serverConfig = {
  port: intEnv("PORT", 5105),
  appPassword: process.env.APP_PASSWORD || "",
  defaultOptions: {
    nmap: boolEnv("ENABLE_NMAP", true),
    traceroute: boolEnv("ENABLE_TRACEROUTE", true),
    dnsBruteforce: true,
    vhostProbe: true,
    httpFingerprint: true,
    tlsInspect: true,
    bannerGrab: true,
    infrastructureTrace: boolEnv("ENABLE_INFRASTRUCTURE_TRACE", true),
    wappalyzer: true,
    dirbust: false, // passive-only by default to avoid noise
    faviconHash: true,
    quicProbe: false,
    dnsAlterations: false, // can be slow
    dnsAxfr: true,
    jarmFingerprint: false,
    maxPorts: intEnv("SCAN_MAX_PORTS", 30),
    maxHosts: intEnv("SCAN_MAX_HOSTS", 40),
    maxDepth: 5,
    concurrency: 4,
    rateLimit: intEnv("SCAN_DEFAULT_RATE_LIMIT_MS", 350),
    timeoutMs: intEnv("SCAN_DEFAULT_TIMEOUT_MS", 25000)
  } satisfies ActiveOptions,
  activeEnabled: boolEnv("ENABLE_ACTIVE_SCAN", true)
};
