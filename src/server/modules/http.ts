import tls from "node:tls";

import dgram from "node:dgram";
import type { ActiveOptions, HttpProfile, TlsProfile } from "../../shared/types.js";
import { fetchText, normalizeTarget, stripHtml, unique } from "../utils.js";

const headerObject = (headers: Headers) => {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    result[key] = value;
  });
  return result;
};

const cookieMeta = (headers: Headers) => {
  const raw = headers.get("set-cookie");
  if (!raw) return [];
  return raw.split(/,(?=[^;]+?=)/).map((cookie) => {
    const parts = cookie.split(";").map((part) => part.trim());
    return { name: parts[0]?.split("=")[0] ?? "cookie", flags: parts.slice(1).map((part) => part.split("=")[0]) };
  });
};

const wappalyzerSignatures = [
  { name: "WordPress", match: (h: Record<string,string>, html: string) => html.includes("wp-content") || h["link"]?.includes("api.w.org") },
  { name: "React", match: (h: Record<string,string>, html: string) => html.includes('data-reactroot') || html.includes('react-dom') },
  { name: "Vue.js", match: (h: Record<string,string>, html: string) => html.includes('data-v-') },
  { name: "Next.js", match: (h: Record<string,string>, html: string) => html.includes('_next/static') || h["x-powered-by"]?.includes("Next.js") },
  { name: "PHP", match: (h: Record<string,string>, html: string) => h["x-powered-by"]?.includes("PHP") || h["set-cookie"]?.includes("PHPSESSID") },
  { name: "Express", match: (h: Record<string,string>, html: string) => h["x-powered-by"]?.includes("Express") },
  { name: "Nginx", match: (h: Record<string,string>, html: string) => h["server"]?.includes("nginx") },
  { name: "Apache", match: (h: Record<string,string>, html: string) => h["server"]?.includes("Apache") },
  { name: "Cloudflare", match: (h: Record<string,string>, html: string) => h["server"]?.includes("cloudflare") || h["cf-ray"] }
];

const detectTech = (headers: Record<string, string>, html: string, advanced: boolean) => {
  const tech: string[] = [];
  if (advanced) {
    for (const sig of wappalyzerSignatures) {
      if (sig.match(headers, html)) tech.push(sig.name);
    }
  } else {
    const text = `${Object.values(headers).join(" ")} ${html}`.toLowerCase();
    if (text.includes("wordpress")) tech.push("WordPress");
    if (text.includes("react")) tech.push("React");
    if (text.includes("next.js")) tech.push("Next.js");
  }
  if (headers.server && !tech.includes(`Server: ${headers.server}`)) tech.push(`Server: ${headers.server}`);
  if (headers["x-powered-by"]) tech.push(`Powered: ${headers["x-powered-by"]}`);
  return unique(tech);
};

const murmurhash3_32_gc = (key: string | Buffer, seed: number) => {
  let remainder, bytes, h1, h1b, c1, c2, k1, i;
  remainder = key.length & 3;
  bytes = key.length - remainder;
  h1 = seed;
  c1 = 0xcc9e2d51;
  c2 = 0x1b873593;
  i = 0;
  
  const buf = typeof key === "string" ? Buffer.from(key) : key;
  while (i < bytes) {
    k1 = ((buf[i] & 0xff)) | ((buf[i + 1] & 0xff) << 8) | ((buf[i + 2] & 0xff) << 16) | ((buf[i + 3] & 0xff) << 24);
    i += 4;
    k1 = ((((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16))) & 0xffffffff;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = ((((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16))) & 0xffffffff;
    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1b = ((((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16))) & 0xffffffff;
    h1 = (((h1b & 0xffff) + 0x6b64) + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16));
  }
  k1 = 0;
  switch (remainder) {
    case 3: k1 ^= (buf[i + 2] & 0xff) << 16; // fallthrough
    case 2: k1 ^= (buf[i + 1] & 0xff) << 8; // fallthrough
    case 1: k1 ^= (buf[i] & 0xff); // fallthrough
    k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
    h1 ^= k1;
  }
  h1 ^= key.length;
  h1 ^= h1 >>> 16;
  h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
  h1 ^= h1 >>> 13;
  h1 = ((((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16))) & 0xffffffff;
  h1 ^= h1 >>> 16;
  return h1 >>> 0;
};

const getFaviconHash = async (baseUrl: string, timeoutMs: number) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 3000));
    const res = await fetch(`${baseUrl}/favicon.ico`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return undefined;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const b64 = buffer.toString("base64");
    const chunked = b64.match(/.{1,76}/g)?.join("\n") + "\n";
    const hash = murmurhash3_32_gc(chunked, 0);
    return String(hash | 0);
  } catch {
    return undefined;
  }
};

const sensitivePaths = ["/.env", "/robots.txt", "/.git/config", "/swagger.json", "/sitemap.xml", "/phpinfo.php", "/config.json"];
const probeSensitiveFiles = async (baseUrl: string, timeoutMs: number) => {
  const found: string[] = [];
  for (const path of sensitivePaths) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 2000));
      const res = await fetch(`${baseUrl}${path}`, { method: "HEAD", signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 200) found.push(path);
    } catch {}
  }
  return found;
};

const probeVhost = async (url: string, hostHeader: string, timeoutMs: number) => {
  try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 2000));
      const res = await fetch(url, { headers: { "Host": hostHeader }, signal: controller.signal });
      clearTimeout(timer);
      return res.status;
  } catch {
      return undefined;
  }
};

const probeQuic = (host: string, timeoutMs: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const client = dgram.createSocket("udp4");
    
    const timer = setTimeout(() => {
      try { client.close(); } catch {}
      resolve(false);
    }, Math.min(timeoutMs, 2000));
    timer.unref();

    client.on("message", () => {
       clearTimeout(timer);
       try { client.close(); } catch {}
       resolve(true);
    });
    client.on("error", () => {
       clearTimeout(timer);
       try { client.close(); } catch {}
       resolve(false);
    });
    client.connect(443, normalizeTarget(host), () => {
       client.send(Buffer.from("0c00000000000000000000000000000000", "hex"), (err) => {
           if (err) {
               clearTimeout(timer);
               try { client.close(); } catch {}
               resolve(false);
           }
       });
    });
  });
};

export const collectHttp = async (host: string, options: ActiveOptions): Promise<HttpProfile[]> => {
  const profiles: HttpProfile[] = [];
  for (const scheme of ["https", "http"]) {
    const url = `${scheme}://${normalizeTarget(host)}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs);
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "user-agent": "domain-asm-osint/1.0 defensive scanner" }
      });
      clearTimeout(timer);
      const html = await res.text();
      const headers = headerObject(res.headers);
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
      
      const profile: HttpProfile = {
        url,
        status: res.status,
        redirects: res.redirected ? [res.url] : [],
        title,
        headers,
        cookies: cookieMeta(res.headers),
        technologies: detectTech(headers, html, options.wappalyzer)
      };

      if (options.faviconHash) {
         profile.faviconHash = await getFaviconHash(url, options.timeoutMs);
      }
      if (options.dirbust) {
         profile.sensitiveFiles = await probeSensitiveFiles(url, options.timeoutMs);
      }
      if (options.vhostProbe) {
         const internalStatus = await probeVhost(url, `internal.${normalizeTarget(host)}`, options.timeoutMs);
         const localStatus = await probeVhost(url, "localhost", options.timeoutMs);
         profile.vhostResponses = {};
         if (internalStatus) profile.vhostResponses[`internal.${normalizeTarget(host)}`] = internalStatus;
         if (localStatus) profile.vhostResponses["localhost"] = localStatus;
      }
      if (options.quicProbe && scheme === "https") {
         const hasAltSvc = headers["alt-svc"]?.includes("h3");
         profile.quicSupported = hasAltSvc || (await probeQuic(host, options.timeoutMs));
      }
      
      // HTTP Error Footprinting
      if (options.infrastructureTrace) {
        try {
          const errController = new AbortController();
          const errTimer = setTimeout(() => errController.abort(), Math.min(options.timeoutMs, 2000));
          // %ff is an invalid URL encoding that typically triggers a 400 Bad Request
          const errRes = await fetch(`${url}/%ff`, { signal: errController.signal });
          clearTimeout(errTimer);
          const errHtml = await errRes.text();
          // Look for server signatures in the footer or body of the error page
          const sigMatch = errHtml.match(/(?:<hr><center>|<hr>)(.*?)(?:<\/center>|<\/address>|<address>|<\/body>)/i);
          if (sigMatch && sigMatch[1]) {
             profile.errorSignature = stripHtml(sigMatch[1]).trim();
          } else if (errHtml.toLowerCase().includes("cloudflare")) {
             profile.errorSignature = "Cloudflare Error Page";
          } else if (errHtml.toLowerCase().includes("awselb")) {
             profile.errorSignature = "AWS Application Load Balancer";
          }
        } catch {}
      }

      profiles.push(profile);
    } catch {
      profiles.push({ url, redirects: [], headers: {}, cookies: [], technologies: [] });
    }
  }
  return profiles;
};

export const inspectTls = (host: string, timeoutMs: number): Promise<TlsProfile | undefined> =>
  new Promise((resolve) => {
    const socket = tls.connect({ host: normalizeTarget(host), port: 443, servername: normalizeTarget(host), timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate(true);
      const cipher = socket.getCipher();
      const san = typeof cert.subjectaltname === "string" ? cert.subjectaltname.replace(/DNS:/g, "").split(", ").filter(Boolean) : [];
      resolve({
        host: normalizeTarget(host),
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        issuer: cert.issuer ? Object.values(cert.issuer).join(" ") : undefined,
        subject: cert.subject ? Object.values(cert.subject).join(" ") : undefined,
        san,
        protocol: socket.getProtocol() ?? undefined,
        cipher: cipher?.name
      });
      socket.end();
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(undefined);
    });
    socket.on("error", () => resolve(undefined));
  });

export const crawlForLinks = async (domain: string, maxDepth: number, timeoutMs: number) => {
  const base = `https://${normalizeTarget(domain)}`;
  const seeds = [base, `${base}/contact`, `${base}/about`, `${base}/team`, `${base}/privacy`, `${base}/sitemap.xml`, `${base}/robots.txt`];
  const seen = new Set<string>();
  const pages: Array<{ url: string; html: string }> = [];
  const queue = seeds.map((url) => ({ url, depth: 0 }));

  while (queue.length && pages.length < 10000) {
    const item = queue.shift()!;
    if (seen.has(item.url) || item.depth > maxDepth) continue;
    seen.add(item.url);
    try {
      const html = await fetchText(item.url, timeoutMs);
      pages.push({ url: item.url, html });
      if (item.depth < maxDepth && !item.url.toLowerCase().endsWith(".pdf")) {
        const links = Array.from(html.matchAll(/href=["']([^"']+)["']/gi))
          .map((match) => match[1])
          .filter((href) => href.startsWith("/") || href.includes(normalizeTarget(domain)))
          .map((href) => (href.startsWith("/") ? `${base}${href}` : href))
          .filter((href) => href.startsWith(base));
        for (const link of unique(links).slice(0, 20)) queue.push({ url: link, depth: item.depth + 1 });
      }
    } catch {
      // a continua crawl-ul
    }
  }
  return pages.map((page) => ({ ...page, text: stripHtml(page.html) }));
};
