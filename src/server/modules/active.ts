import net from "node:net";
import crypto from "node:crypto";
import type { ActiveOptions, NetworkHop, PortFinding, ServiceBanner, IpProfile } from "../../shared/types.js";
import { limitList, runCommand } from "../utils.js";
import { getIpProfile } from "./ip.js";

const defaultPorts = [80, 443, 25, 53, 110, 143, 465, 587, 993, 995, 22, 21, 8080, 8443, 3389, 5432, 3306, 6379, 9200, 27017, 15672, 5672, 11211, 5900, 8000, 8888, 9443, 3000, 5000, 9000];

const tcpProbe = (host: string, port: number, timeoutMs: number): Promise<PortFinding> =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs });
    const done = (state: PortFinding["state"]) => {
      socket.destroy();
      resolve({ host, port, protocol: "tcp", state, source: "tcp-connect" });
    };
    socket.on("connect", () => done("open"));
    socket.on("timeout", () => done("filtered"));
    socket.on("error", () => done("closed"));
  });

const parseNmap = (host: string, stdout: string): PortFinding[] => {
  const findings: PortFinding[] = [];
  for (const line of stdout.split("\n")) {
    const match = line.match(/^(\d+)\/tcp\s+(\w+)\s+(\S+)(?:\s+(.+))?/);
    if (!match) continue;
    findings.push({
      host,
      port: Number.parseInt(match[1], 10),
      protocol: "tcp",
      state: match[2] as PortFinding["state"],
      service: match[3],
      product: match[4],
      source: "nmap"
    });
  }
  return findings;
};

const getTlsFingerprint = (host: string, port: number, timeoutMs: number): Promise<string | undefined> => {
    return new Promise((resolve) => {
        const hello = Buffer.from([
            0x16, 0x03, 0x01, 0x00, 0x2f, 0x01, 0x00, 0x00, 0x2b, 0x03, 0x03,
            ...crypto.randomBytes(32),
            0x00, 0x00, 0x02, 0xc0, 0x2f, 0x01, 0x00, 0x00, 0x00
        ]);
        
        const socket = net.createConnection({ host, port, timeout: timeoutMs });
        socket.on("connect", () => {
            socket.write(hello);
        });
        socket.on("data", (data) => {
            const hash = crypto.createHash("sha256").update(data).digest("hex").substring(0, 62);
            socket.destroy();
            resolve(hash);
        });
        socket.on("error", () => resolve(undefined));
        socket.on("timeout", () => {
            socket.destroy();
            resolve(undefined);
        });
    });
};

export const runDiscreteNmap = async (host: string, options: ActiveOptions): Promise<PortFinding[]> => {
  const ports = limitList(defaultPorts, options.maxPorts);
  let findings: PortFinding[] = [];
  
  if (options.nmap) {
    const args = ["-sT", "-T2", "--max-retries", "1", "--host-timeout", `${Math.max(5, Math.floor(options.timeoutMs / 1000))}s`, "-p", ports.join(","), host];
    const result = await runCommand("nmap", args, options.timeoutMs + 2000);
    const parsed = parseNmap(host, result.stdout);
    if (parsed.length) findings = parsed.filter((item) => item.state === "open");
  } else {
    for (const port of ports) {
      const probe = await tcpProbe(host, port, Math.min(options.timeoutMs, 2500));
      if (probe.state === "open") findings.push(probe);
    }
  }

  if (options.jarmFingerprint) {
      for (const finding of findings) {
          if ([443, 8443, 9443].includes(finding.port) || finding.service?.includes("ssl") || finding.service?.includes("tls")) {
              const hash = await getTlsFingerprint(finding.host, finding.port, Math.min(options.timeoutMs, 3000));
              if (hash) {
                  finding.version = finding.version ? `${finding.version} (TLS-Hash: ${hash})` : `TLS-Hash: ${hash}`;
              }
          }
      }
  }

  return findings;
};

export const grabBanners = async (findings: PortFinding[], options: ActiveOptions): Promise<ServiceBanner[]> => {
  if (!options.bannerGrab) return [];
  const banners: ServiceBanner[] = [];
  for (const finding of findings.slice(0, options.maxPorts)) {
    const banner = await new Promise<string>((resolve) => {
      const socket = net.createConnection({ host: finding.host, port: finding.port, timeout: 2500 });
      let data = "";
      const finish = () => {
        socket.destroy();
        resolve(data.trim().slice(0, 300));
      };
      socket.on("connect", () => {
        if ([80, 8080, 8000].includes(finding.port)) socket.write(`HEAD / HTTP/1.0\r\nHost: ${finding.host}\r\n\r\n`);
        if ([25, 587].includes(finding.port)) socket.write("EHLO scanner.local\r\nQUIT\r\n");
      });
      socket.on("data", (chunk) => {
        data += chunk.toString("utf8");
        if (data.length > 300) finish();
      });
      socket.on("timeout", finish);
      socket.on("error", finish);
      setTimeout(finish, 2500).unref();
    });
    if (banner) banners.push({ host: finding.host, port: finding.port, protocol: finding.service ?? "tcp", banner });
  }
  return banners;
};

const iataMap: Record<string, string> = {
  ams: "Amsterdam, NL", fra: "Frankfurt, DE", lhr: "London, UK", cdg: "Paris, FR", 
  otp: "Bucharest, RO", jfk: "New York, US", lax: "Los Angeles, US", nrt: "Tokyo, JP",
  sin: "Singapore, SG", syd: "Sydney, AU", hkg: "Hong Kong, HK", mad: "Madrid, ES",
  mxp: "Milan, IT", yyz: "Toronto, CA", gru: "Sao Paulo, BR", dxb: "Dubai, AE",
  ord: "Chicago, US", mia: "Miami, US", dfw: "Dallas, US", iad: "Ashburn, US",
  sjc: "San Jose, US", sea: "Seattle, US", atl: "Atlanta, US", vie: "Vienna, AT",
  prg: "Prague, CZ", waw: "Warsaw, PL", zrh: "Zurich, CH", cph: "Copenhagen, DK",
  arn: "Stockholm, SE", hel: "Helsinki, FI", osl: "Oslo, NO"
};

export const runTraceroute = async (host: string, enabled: boolean, timeoutMs: number): Promise<NetworkHop[]> => {
  if (!enabled) return [];
  const command = process.platform === "win32" ? "tracert" : "traceroute";
  const args = process.platform === "win32" ? [host] : ["-w", "2", "-m", "18", host];
  const result = await runCommand(command, args, timeoutMs);
  const hops: NetworkHop[] = [];
  
  const iataRegex = new RegExp(`(?:^|[^a-z])(${Object.keys(iataMap).join("|")})(?:[^a-z]|$)`, "i");

  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(?:([^\s]+)\s+\()?(?:([\d.:a-fA-F]+)|\*)\)?(?:\s+.*?(\d+(?:\.\d+)?)?\s*ms?)?/);
    if (!match) continue;
    
    const ptr = match[2];
    const geo = ptr ? iataMap[ptr.match(iataRegex)?.[1]?.toLowerCase() ?? ""] : undefined;
    
    hops.push({
      hop: Number.parseInt(match[1], 10),
      host: ptr === "*" ? undefined : ptr,
      ip: match[3] === "*" ? undefined : match[3],
      rttMs: match[4] ? Number.parseFloat(match[4]) : undefined,
      geo: geo ? { city: geo, source: "PTR IATA" } : undefined
    });
  }

const geoCache = new Map<string, IpProfile>();

  // GeoIP fallback for all valid IPs without IATA geo
  // We run this sequentially to respect ip-api.com rate limits and use a local cache.
  for (const h of hops) {
    if (h.ip && !h.geo) {
      try {
        if (!geoCache.has(h.ip)) {
          const profile = await getIpProfile(h.ip, timeoutMs);
          geoCache.set(h.ip, profile);
        }
        const ipProfile = geoCache.get(h.ip)!;
        if (ipProfile.geo.city || ipProfile.geo.country) {
          h.geo = { city: `${ipProfile.geo.city ?? ""}, ${ipProfile.geo.country ?? ""}`.replace(/^, /, "").trim(), source: "ip-api" };
        }
      } catch (e) {
        // ignore
      }
    }
  }

  return hops;
};
