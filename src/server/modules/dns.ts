import dns from "node:dns/promises";
import type { DnsRecordSet } from "../../shared/types.js";
import { normalizeTarget, runCommand, unique } from "../utils.js";

export const emptyDns = (): DnsRecordSet => ({
  a: [],
  aaaa: [],
  ns: [],
  mx: [],
  txt: [],
  caa: [],
  ptr: {},
  dnssec: false,
  ttl: {},
  wildcard: false,
  zoneTransfer: "unknown",
  warnings: []
});

const safeResolve = async <T>(fn: () => Promise<T>, warning: string, warnings: string[]): Promise<T | undefined> => {
  try {
    return await fn();
  } catch (error) {
    warnings.push(`${warning}: ${error instanceof Error ? error.message : "failed"}`);
    return undefined;
  }
};

export const getDnsDeepScan = async (target: string): Promise<DnsRecordSet> => {
  const domain = normalizeTarget(target);
  const result = emptyDns();
  result.a = (await safeResolve(() => dns.resolve4(domain), "a lookup", result.warnings)) ?? [];
  result.aaaa = (await safeResolve(() => dns.resolve6(domain), "aaaa lookup", result.warnings)) ?? [];
  result.ns = ((await safeResolve(() => dns.resolveNs(domain), "ns lookup", result.warnings)) ?? []).map((value) => value.toLowerCase());
  result.mx = (await safeResolve(() => dns.resolveMx(domain), "mx lookup", result.warnings)) ?? [];
  result.txt = ((await safeResolve(() => dns.resolveTxt(domain), "txt lookup", result.warnings)) ?? []).map((row) => row.join(""));
  const dmarc = ((await safeResolve(() => dns.resolveTxt(`_dmarc.${domain}`), "dmarc lookup", result.warnings)) ?? []).map((row) => row.join(""));
  result.txt.push(...dmarc.map((record) => `_dmarc: ${record}`));
  const soa = await safeResolve(() => dns.resolveSoa(domain), "soa lookup", result.warnings);
  result.soa = soa ? `${soa.nsname} ${soa.hostmaster} serial ${soa.serial}` : undefined;
  const caa = await safeResolve(() => dns.resolveCaa(domain), "caa lookup", result.warnings);
  result.caa = (caa ?? []).map((record) => `${record.critical} ${record.issue ?? record.issuewild ?? record.iodef ?? ""}`.trim());
  const ds = await runCommand("dig", ["+short", "DS", domain], 4000);
  result.dnssec = Boolean(ds.stdout.trim());

  for (const ip of [...result.a, ...result.aaaa]) {
    const ptr = await safeResolve(() => dns.reverse(ip), `ptr ${ip}`, result.warnings);
    result.ptr[ip] = ptr ?? [];
  }

  const wildcardName = `wildcard-check-${Date.now().toString(36)}.${domain}`;
  const wildcardA = await safeResolve(() => dns.resolve4(wildcardName), "wildcard lookup", []);
  result.wildcard = Boolean(wildcardA?.length);

  return result;
};

export const discoverSubdomains = async (domain: string, enabled: boolean, maxHosts: number) => {
  if (!enabled) return [];
  const words = ["www", "mail", "smtp", "webmail", "api", "app", "dev", "stage", "staging", "test", "vpn", "remote", "portal", "admin", "cdn", "assets", "direct", "origin", "cpanel", "whm"];
  const found: string[] = [];
  for (const word of words.slice(0, maxHosts)) {
    const host = `${word}.${normalizeTarget(domain)}`;
    try {
      const records = await dns.resolveAny(host);
      if (records.length) found.push(host);
    } catch {
      // a ignora gazde inexistente
    }
  }
  return unique(found).slice(0, maxHosts);
};

export const generateDnsAlterations = async (domain: string, knownSubdomains: string[], enabled: boolean, maxHosts: number) => {
  if (!enabled || knownSubdomains.length === 0) return [];
  const prefixes = ["dev-", "test-", "staging-", "v1-", "api-"];
  const suffixes = ["-dev", "-test", "-staging", "-v1", "-api"];
  const permutations: string[] = [];
  
  for (const sub of knownSubdomains) {
    const base = sub.replace(`.${domain}`, "");
    if (base === sub) continue;
    for (const p of prefixes) permutations.push(`${p}${base}.${domain}`);
    for (const s of suffixes) permutations.push(`${base}${s}.${domain}`);
  }
  
  const found: string[] = [];
  for (const host of unique(permutations).slice(0, maxHosts)) {
    try {
      const records = await dns.resolveAny(host);
      if (records.length) found.push(host);
    } catch {
      // ignore
    }
  }
  return unique(found);
};

export const probeAxfr = async (domain: string, nameservers: string[], enabled: boolean, timeoutMs: number) => {
  if (!enabled || nameservers.length === 0) return "blocked";
  for (const ns of nameservers) {
    try {
      const { stdout } = await runCommand("dig", ["AXFR", domain, `@${ns}`], timeoutMs);
      if (stdout.includes("Transfer failed") || stdout.includes("connection refused") || stdout.includes("failed")) continue;
      if (stdout.includes("IN") && stdout.includes("SOA")) return "open";
    } catch {}
  }
  return "blocked";
};


export const probeDkimSelectors = async (domain: string) => {
  const selectors = ["default", "google", "selector1", "selector2", "mail", "dkim"];
  const found: string[] = [];
  for (const selector of selectors) {
    try {
      const rows = await dns.resolveTxt(`${selector}._domainkey.${normalizeTarget(domain)}`);
      if (/v=DKIM1/i.test(rows.flat().join(""))) found.push(selector);
    } catch {
      // a ignora selectori lipsa
    }
  }
  return found;
};
