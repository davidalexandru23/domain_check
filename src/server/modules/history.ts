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
            source: "Mnemonic PDNS"
          });
        }
      }
    }
  } catch (e) {
    // Ignore errors for Mnemonic
  }

  // We can keep a fallback for viewdns if needed, but Mnemonic is generally very good.
  // We'll just return what we have.
  return history;
};
