import http from "node:http";
import tls from "node:tls";
import type { EvidenceSignal } from "../../../shared/types.js";

type HttpProbe = {
  ok: boolean;
  status?: number;
  title?: string;
  bodySample?: string;
  headers: Record<string, string>;
};

const htmlTitle = (body: string) => body.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

const normalizeText = (value?: string) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasWafHeaders = (headers: Record<string, string>) => {
  const text = Object.entries(headers).map(([key, value]) => `${key}:${value}`).join(" ").toLowerCase();
  return /(cloudflare|cf-ray|akamai|fastly|x-sucuri|imperva|incapsula|ddos-guard|awselb)/.test(text);
};

const isGenericLanding = (title?: string, sample?: string) => {
  const text = `${title ?? ""} ${sample ?? ""}`.toLowerCase();
  return /(nginx default|apache2 default|index of|cpanel|plesk|parking|domain default|welcome to nginx)/.test(text);
};

const requestHttp = (host: string, path: string, hostHeader: string, timeoutMs: number): Promise<HttpProbe> =>
  new Promise((resolve) => {
    const req = http.request(
      {
        host,
        port: 80,
        path,
        method: "GET",
        timeout: Math.min(timeoutMs, 5000),
        headers: {
          Host: hostHeader,
          "User-Agent": "domain-asm-osint/1.0 evidence probe",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1"
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          if (Buffer.concat(chunks).length < 120000) chunks.push(chunk);
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (Array.isArray(value)) headers[key] = value.join(", ");
            else if (value != null) headers[key] = String(value);
          }
          resolve({
            ok: true,
            status: res.statusCode,
            title: htmlTitle(body),
            bodySample: body.slice(0, 2000),
            headers
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, headers: {} });
    });
    req.on("error", () => resolve({ ok: false, headers: {} }));
    req.end();
  });

const publicFetch = async (domain: string, timeoutMs: number): Promise<HttpProbe> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 6000));
  try {
    const res = await fetch(`http://${domain}`, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "domain-asm-osint/1.0 evidence probe" }
    });
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return { ok: true, status: res.status, title: htmlTitle(body), bodySample: body.slice(0, 2000), headers };
  } catch {
    return { ok: false, headers: {} };
  } finally {
    clearTimeout(timer);
  }
};

export const probeTlsSni = (domain: string, ip: string, timeoutMs: number): Promise<{ matched: boolean; mismatch: boolean; observed?: string }> =>
  new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: ip,
        port: 443,
        servername: domain,
        rejectUnauthorized: false,
        timeout: Math.min(timeoutMs, 5000)
      },
      () => {
        const cert = socket.getPeerCertificate();
        const observed = [cert.subject?.CN, cert.subjectaltname].filter(Boolean).join(" ");
        const escaped = domain.replace(/\./g, "\\.");
        const domainRegex = new RegExp(`(^|[\\s,])(?:DNS:)?(?:\\*\\.)?${escaped}($|[\\s,])`, "i");
        const matched = domainRegex.test(observed) || observed.toLowerCase().includes(domain.toLowerCase());
        socket.destroy();
        resolve({ matched, mismatch: !matched, observed });
      }
    );
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ matched: false, mismatch: false });
    });
    socket.on("error", () => resolve({ matched: false, mismatch: false }));
  });

export async function collectHttpEvidence(domain: string, ip: string, timeoutMs = 8000): Promise<EvidenceSignal[]> {
  const signals: EvidenceSignal[] = [];
  const [publicResponse, directResponse, tlsResult] = await Promise.all([
    publicFetch(domain, timeoutMs),
    requestHttp(ip, "/", domain, timeoutMs),
    probeTlsSni(domain, ip, timeoutMs)
  ]);

  if (tlsResult.matched) {
    signals.push({
      id: "POS_TLS_SAN_MATCH",
      type: "supporting",
      category: "tls",
      weight: 30,
      title: "TLS SAN Confirmat",
      description: "Handshake TLS pe IP candidat cu SNI egal cu domeniul a returnat certificat potrivit.",
      observedData: tlsResult.observed,
      source: "tls-sni"
    });
  } else if (tlsResult.mismatch) {
    signals.push({
      id: "NEG_TLS_CERT_MISMATCH",
      type: "contradiction",
      category: "tls",
      weight: -15,
      title: "TLS Certificat Nepotrivit",
      description: "Certificatul returnat de IP nu contine domeniul tinta.",
      observedData: tlsResult.observed,
      source: "tls-sni"
    });
  }

  if (!directResponse.ok) {
    signals.push({
      id: "NEG_HTTP_UNREACHABLE",
      type: "contradiction",
      category: "http",
      weight: -10,
      title: "HTTP unreachable",
      description: "IP-ul candidat nu a raspuns la HTTP cu Host header pentru domeniu.",
      observedData: ip,
      source: "host-header-http"
    });
    return signals;
  }

  if (hasWafHeaders(directResponse.headers)) {
    signals.push({
      id: "NEG_CLOUD_WAF_HEADER",
      type: "contradiction",
      category: "waf",
      weight: -25,
      title: "Cloud WAF / Proxy Header",
      description: "Raspunsul HTTP direct contine semnaturi CDN/WAF.",
      observedData: Object.entries(directResponse.headers).slice(0, 8).map(([key, value]) => `${key}: ${value}`).join(" | "),
      source: "host-header-http"
    });
  }

  if (isGenericLanding(directResponse.title, directResponse.bodySample)) {
    signals.push({
      id: "NEG_GENERIC_LANDING",
      type: "contradiction",
      category: "http",
      weight: -20,
      title: "Default Hosting Page",
      description: "IP-ul candidat intoarce o pagina generica de hosting.",
      observedData: directResponse.title,
      source: "host-header-http"
    });
  }

  const publicTitle = normalizeText(publicResponse.title);
  const directTitle = normalizeText(directResponse.title);
  const publicSample = normalizeText(publicResponse.bodySample).slice(0, 240);
  const directSample = normalizeText(directResponse.bodySample).slice(0, 240);
  const statusMatch = publicResponse.status != null && publicResponse.status === directResponse.status;
  const titleMatch = Boolean(publicTitle && directTitle && publicTitle === directTitle);
  const contentOverlap = Boolean(publicSample && directSample && (publicSample.includes(directSample.slice(0, 80)) || directSample.includes(publicSample.slice(0, 80))));

  if (titleMatch || (statusMatch && contentOverlap)) {
    signals.push({
      id: "POS_HTTP_CONTENT_MATCH",
      type: "supporting",
      category: "http",
      weight: 25,
      title: "HTTP Host Content Match",
      description: "Raspunsul direct pe IP cu Host header seamana cu raspunsul public al domeniului.",
      observedData: `public=${publicResponse.status}/${publicResponse.title ?? "no-title"} direct=${directResponse.status}/${directResponse.title ?? "no-title"}`,
      source: "host-header-http"
    });
  }

  return signals;
}
