import { DnsHistoryEntry } from "../../shared/types.js";
import { fetchText } from "../utils.js";

export const fetchDnsHistory = async (domain: string, timeoutMs: number): Promise<DnsHistoryEntry[]> => {
  const history: DnsHistoryEntry[] = [];
  
  // 1. IP History from viewdns.info
  try {
    const html = await fetchText(`https://viewdns.info/iphistory/?domain=${domain}`, timeoutMs);
    // Parse table rows
    const tableRegex = /<table border="1".*?>([\s\S]*?)<\/table>/;
    const tableMatch = html.match(tableRegex);
    if (tableMatch) {
      const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
      let rowMatch;
      let isFirst = true;
      while ((rowMatch = rowRegex.exec(tableMatch[1])) !== null) {
        if (isFirst) { isFirst = false; continue; } // skip header
        const cells = rowMatch[1].match(/<td>(.*?)<\/td>/g);
        if (cells && cells.length >= 4) {
          const ip = cells[0].replace(/<\/?td>/g, '').trim();
          const location = cells[1].replace(/<\/?td>/g, '').trim();
          const owner = cells[2].replace(/<\/?td>/g, '').trim();
          const lastSeen = cells[3].replace(/<\/?td>/g, '').trim();
          
          if (ip && !ip.includes('Location')) {
            history.push({
              type: "A",
              value: `${ip} (${owner}, ${location})`,
              lastSeen,
              source: "viewdns.info"
            });
          }
        }
      }
    }
  } catch (e) {
    // Silently handle scraper block/failure
  }

  // 2. NS History from whoisrequest.com
  try {
    const html = await fetchText(`https://whoisrequest.com/history/${domain}`, timeoutMs);
    const nsRegex = />\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*<\/a>\s*<\/td>\s*<td>\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*<\/td>\s*<td>\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/g;
    let match;
    while ((match = nsRegex.exec(html)) !== null) {
      history.push({
        type: "NS",
        value: match[1].trim(),
        firstSeen: match[2].trim(),
        lastSeen: match[3].trim(),
        source: "whoisrequest.com"
      });
    }
  } catch (e) {
    // Ignore
  }

  return history;
};
