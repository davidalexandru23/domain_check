import type { OwnershipTimelineItem, SourceRef } from "../../shared/types.js";
import { fetchJson, normalizeTarget, unique } from "../utils.js";

type CrtShRow = { name_value?: string; not_before?: string; issuer_name?: string };

const crtSource: SourceRef = { name: "crt.sh", url: "https://crt.sh", confidence: "medium" };

export const collectCtSubdomains = async (domain: string, timeoutMs: number) => {
  const normDomain = normalizeTarget(domain);
  try {
    // Try crt.sh first (without %25. to get everything)
    let rows: any[] = [];
    try {
      rows = await fetchJson<any[]>(`https://crt.sh/?q=${encodeURIComponent(normDomain)}&output=json`, timeoutMs);
    } catch (e) {
      // Fallback to certspotter
      const res = await fetchJson<any[]>(`https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(normDomain)}&include_subdomains=true&expand=dns_names&expand=issuer`, timeoutMs);
      rows = res.map(r => ({
        name_value: (r.dns_names || []).join("\n"),
        not_before: r.not_before,
        not_after: r.not_after,
        issuer_name: r.issuer ? r.issuer.name : "",
        id: r.id
      }));
    }

    const subdomains = rows
      .flatMap((row) => (row.name_value ?? "").split("\n"))
      .map((name) => name.replace(/^\*\./, "").toLowerCase())
      .filter((name) => name.endsWith(normDomain));

    const timeline: OwnershipTimelineItem[] = rows
      .filter((row) => row.not_before && row.issuer_name)
      .slice(0, 150)
      .map((row) => {
        const issuer = row.issuer_name.split(",").map((s: string) => s.trim()).find((s: string) => s.startsWith("O="))?.replace("O=", "") || row.issuer_name;
        const certNames = (row.name_value ?? "").split("\n").filter((n: string) => n.includes(normDomain)).join(", ");
        return {
          date: row.not_before,
          type: "certificate",
          value: `${issuer} (${certNames})`,
          source: crtSource
        };
      });

    return { subdomains: unique(subdomains).slice(0, 100), timeline, source: crtSource };
  } catch (error) {
    return {
      subdomains: [],
      timeline: [],
      source: { ...crtSource, confidence: "low" as const, note: error instanceof Error ? error.message : "crt failed" }
    };
  }
};
