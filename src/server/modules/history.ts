import { DnsHistoryEntry } from "../../shared/types.js";
import { fetchText } from "../utils.js";

type MnemonicResult = {
  data: Array<{
    query: string;
    answer: string;
    rrtype: string;
    firstSeenTimestamp: number;
    lastSeenTimestamp: number;
  }>;
};

export const fetchDnsHistory = async (domain: string, timeoutMs: number): Promise<DnsHistoryEntry[]> => {
  const history: DnsHistoryEntry[] = [];
  
  const fetchMnemonic = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch("https://api.mnemonic.no/pdns/v3/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `*${domain}`, limit: 500 }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (res.ok) {
        const json = await res.json() as MnemonicResult;
        if (json.data && Array.isArray(json.data)) {
          for (const item of json.data) {
            const isExact = item.query.toLowerCase() === domain.toLowerCase();
            const displayValue = isExact ? item.answer : `${item.answer} (${item.query})`;
            history.push({
              type: item.rrtype.toUpperCase() as any,
              value: displayValue,
              firstSeen: new Date(item.firstSeenTimestamp).toISOString().split('T')[0],
              lastSeen: new Date(item.lastSeenTimestamp).toISOString().split('T')[0],
              source: "Mnemonic"
            });
          }
        }
      }
    } catch (e) {}
  };

  const fetchRobtex = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`https://freeapi.robtex.com/pdns/forward/${domain}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (res.ok) {
        const text = await res.text();
        const lines = text.split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            history.push({
              type: data.rrtype.toUpperCase() as any,
              value: data.rrdata,
              firstSeen: new Date(data.time_first * 1000).toISOString().split('T')[0],
              lastSeen: new Date(data.time_last * 1000).toISOString().split('T')[0],
              source: "Robtex"
            });
          } catch(e) {}
        }
      }
    } catch (e) {}
  };

  await Promise.all([fetchMnemonic(), fetchRobtex()]);

  // Merge duplicates across sources
  const merged = new Map<string, DnsHistoryEntry>();

  for (const h of history) {
    if (!h.value || !h.type) continue;
    const key = `${h.type}|${h.value.toLowerCase()}`;
    const existing = merged.get(key);

    if (existing) {
      // Merge dates
      if (h.firstSeen && existing.firstSeen && new Date(h.firstSeen) < new Date(existing.firstSeen)) {
        existing.firstSeen = h.firstSeen;
      }
      
      // For lastSeen, "Prezent" is always the latest.
      if (h.lastSeen === "Prezent" || existing.lastSeen === "Prezent") {
        existing.lastSeen = "Prezent";
      } else if (h.lastSeen && existing.lastSeen && new Date(h.lastSeen) > new Date(existing.lastSeen)) {
        existing.lastSeen = h.lastSeen;
      } else if (h.lastSeen && !existing.lastSeen) {
        existing.lastSeen = h.lastSeen;
      }

      // Merge sources
      if (h.source && !existing.source.includes(h.source)) {
        existing.source += `, ${h.source}`;
      }
    } else {
      merged.set(key, { ...h });
    }
  }

  const uniqueHistory = Array.from(merged.values());

  // Sort by firstSeen descending
  return uniqueHistory.sort((a, b) => new Date(b.firstSeen || 0).getTime() - new Date(a.firstSeen || 0).getTime());
};
