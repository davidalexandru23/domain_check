// src/server/modules/evidence/dns.ts
import type { EvidenceSignal } from "../../../shared/types.js";
import { execSync } from 'child_process';

/** Simple DNS evidence collector (no historical data) */
export function collectDnsEvidence(domain: string): EvidenceSignal[] {
  const signals: EvidenceSignal[] = [];
  try {
    const result = execSync(`dig +short A ${domain}`).toString().trim().split(/\s+/).filter(Boolean);
    result.forEach(ip => {
      signals.push({
        id: `dns-a-${ip}`,
        type: "supporting",
        category: "dns",
        weight: 10,
        title: `A record resolves to ${ip}`,
        description: `Rezolvare DNS A pentru domainul ${domain}`,
        observedData: ip,
        source: "dig"
      });
    });
  } catch (e) {
    // ignore errors – treat as missing evidence
  }
  return signals;
}
