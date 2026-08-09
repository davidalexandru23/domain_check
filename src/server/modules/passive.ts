import type { OwnershipTimelineItem, SourceRef } from "../../shared/types.js";
import { fetchJson, normalizeTarget, unique } from "../utils.js";

type CrtShRow = { name_value?: string; not_before?: string; issuer_name?: string };

const crtSource: SourceRef = { name: "crt.sh", url: "https://crt.sh", confidence: "medium" };

export const collectCtSubdomains = async (domain: string, timeoutMs: number) => {
  try {
    const rows = await fetchJson<CrtShRow[]>(`https://crt.sh/?q=%25.${encodeURIComponent(normalizeTarget(domain))}&output=json`, timeoutMs);
    const subdomains = rows
      .flatMap((row) => (row.name_value ?? "").split("\n"))
      .map((name) => name.replace(/^\*\./, "").toLowerCase())
      .filter((name) => name.endsWith(normalizeTarget(domain)));
    const timeline: OwnershipTimelineItem[] = rows
      .filter((row) => row.not_before && row.issuer_name)
      .slice(0, 30)
      .map((row) => ({
        date: row.not_before!,
        type: "certificate",
        value: row.issuer_name!,
        source: crtSource
      }));
    return { subdomains: unique(subdomains).slice(0, 100), timeline, source: crtSource };
  } catch (error) {
    return {
      subdomains: [],
      timeline: [],
      source: { ...crtSource, confidence: "low" as const, note: error instanceof Error ? error.message : "crt failed" }
    };
  }
};
