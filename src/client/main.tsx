import React from "react";
import ReactDOM from "react-dom/client";
import { Activity, Building2, Globe2, Mail, MapPin, Network, Play, Radar, Shield, TerminalSquare, BookOpen, Clock, ArrowLeft } from "lucide-react";
import type { ActiveOptions, ScanJob, ScanMode, ScanResult } from "../shared/types";
import "./styles.css";

const api = {
  getHeaders() {
    const pass = localStorage.getItem("app_password");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (pass) headers["x-app-password"] = pass;
    return headers;
  },
  async verifyAuth(password: string) {
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "x-app-password": password }
    });
    return res.ok;
  },
  async startScan(payload: { target: string; mode: ScanMode; options: Partial<ActiveOptions> }) {
    const res = await fetch("/api/scans", {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
    if (res.status === 401) throw new Error("Unauthorized");
    if (!res.ok) throw new Error("Scan request failed");
    return (await res.json()) as ScanJob;
  },
  async getScan(id: string) {
    const res = await fetch(`/api/scans/${id}`, {
      headers: this.getHeaders()
    });
    if (res.status === 401) throw new Error("Unauthorized");
    if (!res.ok) throw new Error("Scan fetch failed");
    return (await res.json()) as ScanJob;
  }
};

const defaultOptions: Partial<ActiveOptions> = {
  nmap: true,
  traceroute: true,
  dnsBruteforce: true,
  vhostProbe: true,
  httpFingerprint: true,
  tlsInspect: true,
  bannerGrab: true,
  infrastructureTrace: true,
  wappalyzer: true,
  dirbust: true,
  quicProbe: true,
  dnsAlterations: true,
  dnsAxfr: true,

  jarmFingerprint: false,
  maxPorts: 30,
  maxHosts: 40,
  concurrency: 4,
  rateLimit: 350,
  timeoutMs: 25000
};

// IndexedDB Wrapper
const dbStorage = {
  async getDB() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("domain_asm_db", 1);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("scans")) {
          db.createObjectStore("scans", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async saveScan(job: ScanJob) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("scans", "readwrite");
      tx.objectStore("scans").put(job);
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  },
  async getScans(): Promise<ScanJob[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("scans", "readonly");
      const request = tx.objectStore("scans").getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = reject;
    });
  },
  async getScan(id: string): Promise<ScanJob | undefined> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("scans", "readonly");
      const request = tx.objectStore("scans").get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = reject;
    });
  }
};

function StatCard({ title, value, tone = "cyan" }: { title: string; value: React.ReactNode; tone?: "cyan" | "green" | "amber" | "red" }) {
  const toneClass = tone === "green" ? "text-greenx" : tone === "amber" ? "text-amberx" : tone === "red" ? "text-redx" : "text-cyanx";
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-muted">{title}</div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-3 rounded border border-line bg-panel2 px-3 py-2 text-sm text-ink transition-colors ${disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-panel3 cursor-pointer"}`}>
      <span>{label}</span>
      <input className="h-4 w-4 accent-cyanx" type="checkbox" checked={value} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DataTable({ rows }: { rows: Array<Record<string, React.ReactNode>> }) {
  if (!rows.length) return <div className="empty">Nu exista date colectate</div>;
  const columns = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded border border-line">
      <table className="min-w-full text-left text-sm table-fixed">
        <thead className="bg-panel2 text-xs uppercase text-muted">
          <tr>{columns.map((column) => <th key={column} className="px-3 py-2 whitespace-nowrap">{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => (
            <tr key={index} className="bg-panel/70">
              {columns.map((column) => <td key={column} className="px-3 py-2 align-top text-ink break-words whitespace-normal"><div className="max-h-[160px] overflow-y-auto pr-1">{row[column]}</div></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const tone = score >= 70 ? "bg-greenx" : score >= 40 ? "bg-amberx" : "bg-redx";
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-36 rounded bg-panel2">
        <div className={`h-2 rounded ${tone}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <span className="font-semibold">{score}/100</span>
    </div>
  );
}

function EvidenceList({ title, items, tone }: { title: string; items: ScanResult["candidates"][number]["supportingSignals"]; tone: "green" | "red" }) {
  const color = tone === "green" ? "text-greenx" : "text-redx";
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-muted">{title}</div>
      {items.length === 0 ? (
        <div className="text-sm text-muted">niciun semnal</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={`${item.id}-${item.observedData ?? ""}`} className="rounded border border-line bg-panel2 p-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{item.title}</span>
                <span className={color}>{item.weight > 0 ? `+${item.weight}` : item.weight}</span>
              </div>
              <div className="mt-1 text-muted">{item.description}</div>
              {item.observedData && <div className="mt-1 break-all text-xs text-muted">{item.observedData}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateEvidence({ result }: { result: ScanResult }) {
  const candidates = [...(result.candidates ?? [])].sort((a, b) => b.score - a.score);
  return (
    <Section title="Candidati Origin si Evidence Score" icon={<Radar size={18} />}>
      {result.narrativeVerdict && (
        <div className="mb-4 rounded border border-line bg-panel2 p-4">
          <div className="text-sm uppercase tracking-wide text-muted">Verdict narativ</div>
          <div className="mt-2 text-lg font-semibold text-cyanx">{result.narrativeVerdict.summary}</div>
          <div className="mt-2 text-sm text-muted">{result.narrativeVerdict.explanation}</div>
        </div>
      )}
      {candidates.length === 0 ? (
        <div className="empty">Nu exista candidati origin calculati</div>
      ) : (
        <div className="space-y-4">
          {candidates.map((candidate) => (
            <div key={candidate.ip} className="rounded border border-line bg-panel p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-cyanx" />
                    <h3 className="text-xl font-semibold">{candidate.ip}</h3>
                  </div>
                  <div className="mt-2 grid gap-2 text-sm text-muted md:grid-cols-2">
                    <div>Clasificare: <span className="text-ink">{candidate.classification}</span></div>
                    <div>Provider: <span className="text-ink">{candidate.provider}</span></div>
                    <div>ASN: <span className="text-ink">{candidate.asn}</span></div>
                    <div>Locatie: <span className="text-ink">{candidate.location}</span></div>
                  </div>
                </div>
                <ScoreBar score={candidate.score} />
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <EvidenceList title="Semnale pozitive" items={candidate.supportingSignals} tone="green" />
                <EvidenceList title="Semnale negative" items={candidate.contradictionSignals} tone="red" />
              </div>
              <div className="mt-4 rounded bg-panel2 p-3 text-sm text-muted">{candidate.explanation}</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}


function Results({ job }: { job: ScanJob }) {
  if (!job.result) return null;
  const result = job.result;
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard title="Subdomenii" value={result.subdomains.length} />
        <StatCard title="Profile IP" value={result.ips.length} tone="green" />
        <StatCard title="Porturi deschise" value={result.ports.length} tone={result.ports.length ? "amber" : "green"} />
      </div>

      <Section title="Date Inregistrare" icon={<Shield size={18} />}>
        <DataTable rows={[
          { camp: "Domeniu", valoare: result.domain.domain },
          { camp: "Registrar", valoare: result.domain.registrar ?? "necunoscut" },
          { camp: "Detinator", valoare: result.domain.registrantOrg ?? "necunoscut" },
          { camp: "Privacy", valoare: result.domain.privacyDetected ? "detectat" : "nedetectat" },
          { camp: "Nameservere", valoare: result.domain.nameservers.join(", ") || "necunoscut" }
        ]} />
      </Section>

      <Section title="Inregistrari DNS" icon={<Globe2 size={18} />}>
        <DataTable rows={[
          { inregistrare: "A", valoare: result.dns.a.join(", ") || "lipsa" },
          { inregistrare: "AAAA", valoare: result.dns.aaaa.join(", ") || "lipsa" },
          { inregistrare: "NS", valoare: result.dns.ns.join(", ") || "lipsa" },
          { inregistrare: "MX", valoare: result.dns.mx.map((mx) => `${mx.priority} ${mx.exchange}`).join(", ") || "lipsa" },
          { inregistrare: "TXT", valoare: result.dns.txt.slice(0, 6).join(" | ") || "lipsa" },
          { inregistrare: "DNSSEC", valoare: result.dns.dnssec ? "activat" : "neobservat" }
        ]} />
      </Section>

      <Section title="Informatii IP" icon={<MapPin size={18} />}>
        <DataTable rows={result.ips.map((ip) => ({
          ip: ip.ip,
          asn: ip.asn.asn ? `AS${ip.asn.asn}` : "necunoscut",
          org: ip.asn.org ?? "necunoscut",
          alocare: ip.rirAllocationOwner ?? ip.networkName ?? "necunoscut",
          prefix: ip.announcedPrefix ?? ip.asn.cidr ?? "necunoscut",
          geo: [ip.geo.city, ip.geo.country].filter(Boolean).join(", ") || "necunoscut",
          datacenter: ip.asn.facCount ? `${ip.asn.facCount} locatii fizice` : "necunoscut",
          furnizor: ip.providerType
        }))} />
      </Section>

      <Section title="Analiza Infrastructurii de Baza (Host Real)" icon={<Building2 size={18} />}>
        <div className="mb-6 p-4 bg-ink/5 border border-line rounded-lg text-ink/90 text-sm leading-relaxed">
          {(() => {
            const isProxy = result.infrastructure.roleProviders.some(p => p.name.toLowerCase().includes("cloudflare") || p.name.toLowerCase().includes("akamai") || p.name.toLowerCase().includes("fastly") || p.name.toLowerCase().includes("incapsula"));
            const proxies = result.infrastructure.roleProviders.map(p => p.name).join(", ");
            const hasLeak = result.origins && result.origins.length > 0;
            const originHigh = hasLeak ? result.origins.find(o => o.confidence === "high") : undefined;
            const originBase = originHigh || (hasLeak ? result.origins[0] : null);

            let narrative = "";
            if (isProxy) {
              narrative += `Domeniul principal este protejat și rutat printr-un sistem Proxy/WAF/CDN (${proxies}). Aceasta înseamnă că adresa IP publică a site-ului nu reprezintă locația fizică reală a serverului. `;
              if (hasLeak) {
                narrative += `Cu toate acestea, sistemul a reușit să identifice un **Origin Leak** (prin înregistrări DNS secundare, MX sau un certificat TLS expus). Adresa de origine candidat identificată este **${originBase?.ip}**. `;
                narrative += `Analizând această adresă, concluzionăm că **infrastructura de bază reală este găzduită de ${originBase?.provider}**.`;
              } else {
                narrative += `Nu au putut fi găsite scurgeri de date pasive care să expună adresa de origine internă, deci host-ul real rămâne strict ascuns în spatele rețelei de proxy.`;
              }
            } else {
              narrative += `Domeniul NU folosește un sistem Proxy/CDN recunoscut, ci pare a fi rezolvat direct către serverul final. `;
              if (result.infrastructure.ipChains.length > 0) {
                const chain = result.infrastructure.ipChains[0];
                const realOrg = chain.allocation.originOrg || chain.allocation.allocationOwner || chain.allocation.networkName;
                narrative += `Verdictul infrastructurii este "${result.infrastructure.verdict}" (Încredere: ${result.infrastructure.confidence}). `;
                narrative += `Concluzionăm că **infrastructura de bază este găzduită direct de ${realOrg}**.`;
              } else {
                narrative += `Din păcate, nu s-au putut extrage date BGP/RDAP pentru a determina proprietarul alocării.`;
              }
            }
            // Parse simple markdown-like bold tags for UI
            return <span dangerouslySetInnerHTML={{ __html: narrative.replace(/\*\*(.*?)\*\*/g, '<strong class="text-cyanx font-semibold">$1</strong>') }} />;
          })()}
        </div>

        {result.infrastructure.ipChains.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-semibold mb-2 text-muted uppercase">Lantul de Alocare (Suprafata)</h4>
            <DataTable rows={result.infrastructure.ipChains.map((chain) => ({
              ip: chain.ip,
              rol: chain.providerRole,
              proprietar_bgp: chain.allocation.originOrg ?? "necunoscut",
              alocare_rdap: chain.allocation.allocationOwner ?? chain.allocation.networkName ?? "necunoscut",
              dovezi_subinchiriere: chain.leaseSignals.length ? chain.leaseSignals.map((signal) => signal.message).join(" | ") : "N/A"
            }))} />
          </div>
        )}

        {result.origins && result.origins.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 text-muted uppercase">IP-uri Origine</h4>
            <DataTable rows={result.origins.map((origin) => ({
              ip_origine: origin.ip,
              provider_real: origin.provider,
              incredere: origin.confidence.toUpperCase(),
              sursa_scurgere: origin.source
            }))} />
          </div>
        )}
      </Section>

      <CandidateEvidence result={result} />

      <Section title="HTTP TLS" icon={<Activity size={18} />}>
        <DataTable rows={result.http.map((http) => ({
          url: http.url,
          status: http.status ?? "n/a",
          tehnologii: http.technologies.join(", ") || "necunoscut",
          amprenta_eroare: http.errorSignature ?? "N/A",
          sensibil: http.sensitiveFiles?.join(", ") || "lipsa",
          vhost: http.vhostResponses ? Object.keys(http.vhostResponses).length + " testate" : "n/a",
          quic: http.quicSupported ? "Suportat" : "Nu"
        }))} />
      </Section>

      <Section title="Retea si Porturi" icon={<TerminalSquare size={18} />}>
        <div className="mb-6">
          <h4 className="text-sm font-semibold mb-2 text-muted uppercase">Traseu Retea (Traceroute)</h4>
          <DataTable rows={result.network.map((hop) => ({
            hop: hop.hop,
            host: hop.host ?? "N/A",
            ip: hop.ip ?? "N/A",
            ms: hop.rttMs ?? "N/A",
            locatie: hop.geo?.city ?? "necunoscut"
          }))} />
        </div>
        <h4 className="text-sm font-semibold mb-2 text-muted uppercase">Porturi Deschise</h4>
        <DataTable rows={result.ports.map((port) => ({
          host: port.host,
          port: port.port,
          stare: port.state,
          serviciu: port.service ?? "tcp",
          versiune: port.version ?? "necunoscut",
          sursa: port.source
        }))} />
      </Section>

    </div>
  );
}

function Documentation({ onBack }: { onBack: () => void }) {
  const sources = [
    ["crt.sh", "crt.sh", "Certificate Transparency logs, subdomenii si certificate timeline", "Public, gratuit"],
    ["ip-api.com", "ip-api.com", "GeoIP, ASN, ISP si organizatie", "Public, gratuit, rate limited"],
    ["RDAP", "rdap.org", "Alocare IP, proprietar retea, RIR data", "Public, gratuit"],
    ["RIPE Stat", "stat.ripe.net", "BGP routing status, ASN neighbours, prefix info", "Public, gratuit"],
    ["PeeringDB", "peeringdb.com", "Tip retea, IX presence, facility presence", "Public, gratuit"],
    ["DNS public", "node:dns", "A, AAAA, MX, NS, TXT, SOA, CAA, PTR, DNSSEC", "System resolver"],
    ["HTTP/TLS direct", "Direct connections", "Headers, certificat TLS, SAN, technologies, fisiere sensibile", "Direct probe"],
    ["Nmap", "Local binary", "Porturi deschise si service detection", "Local tool"],
    ["Traceroute", "Local binary", "Network path, hops, RTT", "Local tool"]
  ];
  const weights = [
    ["DNS A record match", "+10", "IP-ul apare direct in A/AAAA pentru domeniu"],
    ["DNS subdomain leak", "+15", "IP-ul apare in subdomenii care pot expune origin"],
    ["TLS SAN confirmat", "+30", "Handshake TLS pe IP cu SNI domeniu returneaza certificat potrivit"],
    ["HTTP content match", "+25", "Cererea catre IP cu Host header seamana cu raspunsul public"],
    ["Hosting ASN consistent", "+15", "ASN/RDAP se potriveste cu detinatorul domeniului"],
    ["PTR consistent", "+10", "Reverse DNS contine domeniul sau organizatia"],
    ["BGP origin consistent", "+10", "Origin ASN este consistent cu profilul IP"],
    ["CDN signature", "-30", "IP-ul apartine CDN/WAF sau edge proxy"],
    ["MX-only IP", "-20", "IP-ul este asociat doar cu infrastructura email"],
    ["HTTP unreachable", "-10", "IP-ul nu raspunde la HTTP cu Host header"],
    ["Shared infrastructure", "-15", "Semnale de cloud/shared hosting fara confirmare origin"]
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 animate-in fade-in">
      <button onClick={onBack} className="btn-ghost mb-6 flex items-center gap-2 text-muted hover:text-ink">
        <ArrowLeft size={18} />
        Inapoi la Dashboard
      </button>

      <h1 className="mb-4 flex items-center gap-2 text-3xl font-semibold text-cyanx">
        <BookOpen size={28} />
        Documentatie - Evidence Correlation Engine
      </h1>
      <p className="mb-8 text-lg text-muted">
        Aceasta pagina descrie sursele de date interogate, cum sunt corelate rezultatele si cum este calculat scorul pentru candidatii origin.
      </p>

      <div className="space-y-8">
        <div className="card">
          <h2 className="mb-3 border-b border-line pb-2 text-xl font-semibold">Surse de Date Interogare</h2>
          <DataTable rows={sources.map(([serviciu, url, furnizeaza, acces]) => ({ serviciu, url, furnizeaza, acces }))} />
        </div>

        <div className="card">
          <h2 className="mb-3 border-b border-line pb-2 text-xl font-semibold">Cum sunt Corelate Datele</h2>
          <div className="space-y-3 text-sm text-ink/80">
            <div className="rounded border border-line bg-ink/5 p-3"><strong className="text-ink">1. DNS si CT</strong> - Domeniul, subdomeniile si MX-urile sunt rezolvate la IP-uri candidate.</div>
            <div className="rounded border border-line bg-ink/5 p-3"><strong className="text-ink">2. IP enrichment</strong> - Fiecare IP primeste ASN, RDAP allocation, GeoIP, provider type si BGP origin.</div>
            <div className="rounded border border-line bg-ink/5 p-3"><strong className="text-ink">3. Direct probes</strong> - Pentru fiecare IP se face TLS SNI cu domeniul si HTTP GET cu Host header egal cu domeniul.</div>
            <div className="rounded border border-line bg-ink/5 p-3"><strong className="text-ink">4. Contradictii</strong> - CDN/WAF, MX-only, HTTP unreachable si shared infrastructure scad scorul.</div>
            <div className="rounded border border-line bg-ink/5 p-3"><strong className="text-ink">5. Verdict</strong> - Evidence Engine agrega semnalele si produce score, clasificare si explicatie pentru fiecare candidat.</div>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 border-b border-line pb-2 text-xl font-semibold">Cum Functioneaza Scorul</h2>
          <DataTable rows={weights.map(([semnal, pondere, descriere]) => ({ semnal, pondere, descriere }))} />
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div className="rounded border border-line bg-panel2 p-3"><strong className="text-greenx">70-100</strong><br />likely-origin</div>
            <div className="rounded border border-line bg-panel2 p-3"><strong className="text-amberx">40-69</strong><br />possible-origin</div>
            <div className="rounded border border-line bg-panel2 p-3"><strong className="text-redx">0-39</strong><br />unverified, cdn-proxy, shared-hosting sau email-only</div>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 border-b border-line pb-2 text-xl font-semibold">Lantul de Alocare</h2>
          <div className="space-y-3 text-sm text-ink/80">
            <div><strong className="text-ink">RIR</strong> - identifica registrul regional si blocul IP.</div>
            <div><strong className="text-ink">RDAP</strong> - identifica network name, allocation owner si parent network.</div>
            <div><strong className="text-ink">BGP</strong> - identifica origin ASN, announced prefix si neighbours.</div>
            <div><strong className="text-ink">Upstreams</strong> - arata relatii de tranzit si indicii de subinchiriere.</div>
            <div><strong className="text-ink">Verdict</strong> - marcheaza in-house, direct provider, CDN/proxy, reseller sau likely subleased network.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (password: string) => void }) {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ok = await api.verifyAuth(password);
      if (ok) {
        onLogin(password);
      } else {
        setError("Invalid password");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-cyanx">
          <Shield className="h-10 w-10" />
          <h1 className="text-2xl font-bold tracking-tight text-ink">Domain ASM</h1>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">Access Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded border border-line bg-panel2 px-3 py-2 text-ink placeholder-muted focus:border-cyanx focus:outline-none"
              placeholder="Enter password..."
              autoFocus
            />
          </div>
          {error && <div className="text-sm text-redx">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded bg-cyanx px-4 py-2 font-medium text-panel transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [target, setTarget] = React.useState("example.com");
  const [options, setOptions] = React.useState<Partial<ActiveOptions>>({
    ...defaultOptions,
    nmap: true, traceroute: true, dnsBruteforce: true, vhostProbe: true,
    httpFingerprint: true, tlsInspect: true, bannerGrab: true, infrastructureTrace: true,
    wappalyzer: true, dirbust: true, quicProbe: true, dnsAlterations: true,
    dnsAxfr: true, jarmFingerprint: true
  });

  const [job, setJob] = React.useState<ScanJob | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [history, setHistory] = React.useState<ScanJob[]>([]);
  const [page, setPage] = React.useState<"dashboard" | "docs">("dashboard");

  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [checkingAuth, setCheckingAuth] = React.useState(true);

  React.useEffect(() => {
    const pass = localStorage.getItem("app_password");
    if (!pass) {
      setCheckingAuth(false);
      return;
    }
    api.verifyAuth(pass).then(ok => {
      if (ok) setIsAuthenticated(true);
      else localStorage.removeItem("app_password");
      setCheckingAuth(false);
    }).catch(() => {
      setCheckingAuth(false);
    });
  }, []);

  // Load history from DB on mount
  React.useEffect(() => {
    dbStorage.getScans().then(scans => {
      // Sort by creation date descending
      scans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setHistory(scans);
    });
  }, []);

  // Poll job status
  React.useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed") return;
    const timer = window.setInterval(async () => {
      try {
        const updatedJob = await api.getScan(job.id);
        setJob(updatedJob);
        if (updatedJob.status === "done" || updatedJob.status === "failed") {
          await dbStorage.saveScan(updatedJob);
          setHistory(prev => {
            const filtered = prev.filter(p => p.id !== updatedJob.id);
            return [updatedJob, ...filtered];
          });
        }
      } catch {
        setError("Could not refresh scan state");
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [job]);

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      const newJob = await api.startScan({ target, mode: "active-discovery", options });
      setJob(newJob);
      await dbStorage.saveScan(newJob);
      setHistory(prev => [newJob, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = async (id: string) => {
    try {
      const cachedJob = await dbStorage.getScan(id);
      if (cachedJob) setJob(cachedJob);
    } catch (err) {
      console.error("Failed to load history", err);
    }
  };

  const lastProgress = job?.progress?.at(-1);

  if (checkingAuth) {
    return <div className="flex min-h-screen items-center justify-center text-muted">Checking authentication...</div>;
  }
  if (!isAuthenticated) {
    return <Login onLogin={(p) => { localStorage.setItem("app_password", p); setIsAuthenticated(true); }} />;
  }

  if (page === "docs") {
    return (
      <main className="min-h-screen text-ink">
        <Documentation onBack={() => setPage("dashboard")} />
      </main>
    );
  }

  return (
    <main className="min-h-screen text-ink">
      <div className="mx-auto max-w-7xl px-4 py-6 overflow-hidden">
        <header className="flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
          <div>
          </div>
          <div className="flex items-center gap-4">
            <button className="btn-ghost flex items-center gap-2 text-muted hover:text-ink" onClick={() => setPage("docs")}>
              <BookOpen size={16} />
              Documentatie
            </button>
            <button className="btn" onClick={start} disabled={loading || !target.trim()}>
              <Play size={16} />
              {loading ? "Se porneste..." : "Porneste Scanarea"}
            </button>
          </div>
        </header>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row">
          {/* Main Config & View Area */}
          <div className="flex-1 space-y-6 min-w-0">
            <section className="grid gap-4">
              <div className="card">
                <label className="text-xs uppercase tracking-wide text-muted font-semibold">Domeniu Tinta</label>
                <input className="input mt-2 font-medium" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="domeniu.ro sau IP" />

              </div>
            </section>

            {error && <div className="mt-4 rounded border border-redx/40 bg-redx/10 px-4 py-3 text-sm text-redx">{error}</div>}

            {job && (
              <section className="mt-6 card">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm text-muted">Scan {job.id}</div>
                    <div className="text-lg font-semibold">{lastProgress?.stage ?? job.status}: {lastProgress?.message ?? "Queued"}</div>
                  </div>
                  <div className="text-sm uppercase tracking-wide text-muted">{job.status}</div>
                </div>
                <div className="mt-4 h-2 rounded bg-panel2">
                  <div className="h-2 rounded bg-cyanx transition-all" style={{ width: `${lastProgress?.percent ?? 0}%` }} />
                </div>
              </section>
            )}

            {job && <Results job={job} />}
          </div>

          {/* Sidebar: History */}
          <div className="w-full lg:w-72 flex-shrink-0">
            <div className="card h-full flex flex-col">
              <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-wide text-muted border-b border-line pb-2 font-semibold">
                <Clock size={14} /> Istoric Scanari
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {history.length === 0 && (
                  <div className="text-sm text-muted p-4 text-center">Nu exista scanari in cache.</div>
                )}
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadFromHistory(item.id)}
                    className={`w-full text-left p-3 rounded border transition-colors ${job?.id === item.id ? "border-cyanx bg-cyanx/10" : "border-line bg-panel2 hover:bg-panel3"}`}
                  >
                    <div className="font-semibold text-ink truncate">{item.request.target}</div>
                    <div className="text-xs text-muted flex justify-between mt-1">
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      <span className={item.status === "done" ? "text-greenx" : item.status === "failed" ? "text-redx" : "text-amberx"}>{item.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
