import type { DomainProfile, OwnershipTimelineItem, SourceRef } from "../../shared/types.js";
import { fetchJson, normalizeTarget, runCommand } from "../utils.js";

type RdapResponse = {
  objectClassName?: string;
  handle?: string;
  ldhName?: string;
  nameservers?: Array<{ ldhName?: string }>;
  entities?: Array<{ roles?: string[]; vcardArray?: unknown[] }>;
  events?: Array<{ eventAction?: string; eventDate?: string }>;
  status?: string[];
  links?: Array<{ href?: string }>;
};

const rdapSource: SourceRef = {
  name: "RDAP bootstrap",
  url: "https://rdap.org",
  confidence: "high"
};

const vcardText = (entity: { vcardArray?: unknown[] }) => {
  const entries = Array.isArray(entity.vcardArray?.[1]) ? (entity.vcardArray?.[1] as unknown[]) : [];
  const values = entries
    .map((entry) => (Array.isArray(entry) ? entry[3] : undefined))
    .filter((value): value is string => typeof value === "string");
  return values.join(" ");
};

const findRoleText = (rdap: RdapResponse, role: string) =>
  rdap.entities?.find((entity) => entity.roles?.includes(role)) ? vcardText(rdap.entities.find((entity) => entity.roles?.includes(role))!) : undefined;

export const getDomainProfile = async (target: string, timeoutMs: number): Promise<{ profile: DomainProfile; ownership: OwnershipTimelineItem[] }> => {
  const domain = normalizeTarget(target);
  const profile: DomainProfile = {
    domain,
    statuses: [],
    nameservers: [],
    privacyDetected: false,
    importantDates: {},
    sources: []
  };
  const ownership: OwnershipTimelineItem[] = [];

  try {
    const rdap = await fetchJson<RdapResponse>(`https://rdap.org/domain/${encodeURIComponent(domain)}`, timeoutMs);
    profile.registry = rdap.handle;
    profile.statuses = rdap.status ?? [];
    profile.nameservers = (rdap.nameservers ?? []).map((ns) => ns.ldhName?.toLowerCase()).filter((ns): ns is string => Boolean(ns));
    profile.registrar = findRoleText(rdap, "registrar");
    profile.registrantOrg = findRoleText(rdap, "registrant");
    profile.adminContact = findRoleText(rdap, "administrative");
    profile.techContact = findRoleText(rdap, "technical");
    profile.privacyDetected = [profile.registrantOrg, profile.adminContact, profile.techContact].some((value) => /(privacy|redacted|protected|proxy|gdpr)/i.test(value ?? ""));
    profile.sources.push(rdapSource);

    for (const event of rdap.events ?? []) {
      if (event.eventDate && event.eventAction) {
        profile.importantDates[event.eventAction] = event.eventDate;
        ownership.push({
          date: event.eventDate,
          type: "rdap",
          value: event.eventAction,
          source: rdapSource
        });
      }
    }
  } catch (error) {
    profile.sources.push({
      ...rdapSource,
      confidence: "low",
      note: error instanceof Error ? error.message : "rdap failed"
    });
  }

  if (!profile.registrar && !profile.registrantOrg && profile.nameservers.length === 0) {
    const parts = domain.split('.');
    while (parts.length > 1) {
      const candidate = parts.join('.');
        const whoisServers = ["", "whois.ripe.net", "whois.arin.net", "whois.rotld.ro"]; // empty string means default OS whois
        
        for (const server of whoisServers) {
            try {
                const args = server ? ["-h", server, candidate] : [candidate];
                const { stdout } = await runCommand("whois", args, timeoutMs);
                const lower = stdout.toLowerCase();
                
                const isExactMatch = lower.includes(`domain name: ${candidate}`) || lower.includes(`domain: ${candidate}`);
                if (!isExactMatch && !lower.includes("registrar:") && !lower.includes("netname:")) {
                    continue;
                }

                for (const line of stdout.split('\n')) {
                    const l = line.toLowerCase().trim();
                    if (!profile.registrar && (l.startsWith('registrar:') || l.startsWith('sponsoring registrar:'))) {
                        profile.registrar = line.split(':')[1]?.trim();
                    }
                    if (!profile.registrantOrg && (l.startsWith('registrant organization:') || l.startsWith('registrant name:') || l.startsWith('registrant:') || l.startsWith('org-name:') || l.startsWith('role:'))) {
                        profile.registrantOrg = line.split(':')[1]?.trim();
                    }
                    if (l.startsWith('nameserver:') || l.startsWith('nserver:') || l.startsWith('name server:')) {
                        const ns = line.split(':')[1]?.trim().split(' ')[0]?.toLowerCase();
                        if (ns && !profile.nameservers.includes(ns)) profile.nameservers.push(ns);
                    }
                    if (l.startsWith('domain status:') || l.startsWith('status:')) {
                        const status = line.split(':')[1]?.trim().split(' ')[0];
                        if (status && !profile.statuses.includes(status)) profile.statuses.push(status);
                    }
                    if (!profile.importantDates["created"] && (l.startsWith("creation date:") || l.startsWith("registered:"))) {
                        const date = line.substring(line.indexOf(':') + 1).trim();
                        if (date) {
                            profile.importantDates["created"] = date;
                            ownership.push({ date, type: "registrar", value: "created", source: { name: `WHOIS (${server || 'default'})`, url: "port 43", confidence: "medium" }});
                        }
                    }
                }

                if (profile.registrar || profile.registrantOrg || profile.nameservers.length > 0) {
                    profile.sources.push({ name: `WHOIS fallback (${server || 'default'})`, url: "port 43", confidence: "medium" });
                    profile.privacyDetected = [profile.registrantOrg, profile.adminContact, profile.techContact].some((value) => /(privacy|redacted|protected|proxy|gdpr|hidden)/i.test(value ?? ""));
                    break;
                }
            } catch (e) {
                // ignore specific whois server errors, try next
            }
        }
        
        if (profile.registrar || profile.registrantOrg || profile.nameservers.length > 0) break;
        
        parts.shift();
    }
  }

  return { profile, ownership };
};
