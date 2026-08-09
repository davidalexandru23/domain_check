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
  faviconHash: true,
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

      <Section title="HTTP TLS" icon={<Activity size={18} />}>
        <DataTable rows={result.http.map((http) => ({
          url: http.url,
          status: http.status ?? "n/a",
          tehnologii: http.technologies.join(", ") || "necunoscut",
          amprenta_eroare: http.errorSignature ?? "N/A",
          favicon: http.faviconHash ?? "n/a",
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
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 animate-in fade-in">
      <button onClick={onBack} className="btn-ghost mb-6 flex items-center gap-2 text-muted hover:text-ink">
        <ArrowLeft size={18} />
        Back to Dashboard
      </button>

      <h1 className="text-3xl font-semibold text-cyanx mb-4 flex items-center gap-2">
        <BookOpen size={28} />
        Documentation & Parameters
      </h1>
      <p className="text-muted mb-8 text-lg">
        This page explains all the search parameters, operation modes, and advanced security checkboxes available in Domain ASM OSINT.
      </p>

      <div className="space-y-8">
        <div className="card">
          <h2 className="text-xl font-semibold mb-3 border-b border-line pb-2">Scan Modes (Modul de Scanare)</h2>
          <ul className="space-y-3 text-sm text-ink/80">
            <li><strong className="text-ink">passive</strong> - Doar colectare fără a atinge direct ținta (folosește surse OSINT precum Shodan, crt.sh).</li>
            <li><strong className="text-ink">controlled-active</strong> - Modul recomandat. Interoghează activ ținta cu un nivel de intruziune mediu (DNS, IP-uri, probe HTTP și TLS).</li>
            <li><strong className="text-ink">active-discovery</strong> - Foarte agresiv. Implică bruteforcing pe subdomenii, verificări de porturi pe o paletă largă și dirbusting profund.</li>
            <li><strong className="text-ink">network-map</strong> - Se focusează strict pe topologia rețelei (Nmap, Traceroute, ASN-uri, BGP) ignorând partea web.</li>

            <li><strong className="text-ink">dns-only</strong> - Focus doar pe arborele DNS, subdomenii și preluări de domenii (Takeovers).</li>
          </ul>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-3 border-b border-line pb-2">General Settings</h2>
          <ul className="space-y-3 text-sm text-ink/80">
            <li><strong className="text-ink">Max Depth</strong> - Limitează adâncimea recursivității atunci când se caută subdomenii ale subdomeniilor (Valoare default: 30).</li>
          </ul>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-3 border-b border-line pb-2">Active Controls (Module Avansate)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <strong className="block text-ink">Nmap discrete</strong>
              <span className="text-sm text-muted">Apelează utilitarul local Nmap pentru scanarea TCP a top 30 cele mai utilizate porturi. Folosește profil T2 pentru stealth.</span>
            </div>
            <div>
              <strong className="block text-ink">Traceroute</strong>
              <span className="text-sm text-muted">Află path-ul pachetelor către țintă pentru a detecta gateway-uri și rețele intermediare ascunse.</span>
            </div>
            <div>
              <strong className="block text-ink">DNS bruteforce</strong>
              <span className="text-sm text-muted">Folosește o listă predefinită pentru a ghici subdomenii ascunse (ex. dev, staging, admin).</span>
            </div>
            <div>
              <strong className="block text-ink">HTTP fingerprint</strong>
              <span className="text-sm text-muted">Obține headerele și informațiile de bază despre site-urile HTTP rulate pe porturile 80/443.</span>
            </div>
            <div>
              <strong className="block text-ink">TLS inspect</strong>
              <span className="text-sm text-muted">Verifică certificatul SSL/TLS pentru a extrage domeniile alternative (SAN) și perioada de valabilitate.</span>
            </div>
            <div>
              <strong className="block text-ink">Banner grab</strong>
              <span className="text-sm text-muted">Incearcă obținerea software-ului și versiunii care rulează pe un anumit port printr-o conexiune Raw TCP.</span>
            </div>
            <div>
              <strong className="block text-ink">Wappalyzer Web Tech</strong>
              <span className="text-sm text-muted">Folosește un motor in-house cu expresii regulate pentru a identifica CMS-uri, librării JS, servere și WAF-uri din HTML/Headers.</span>
            </div>
            <div>
              <strong className="block text-ink">Dirbust (Sensitive Files)</strong>
              <span className="text-sm text-muted">Execută request-uri silențioase (HEAD) către fișiere critice (ex: /.env, /robots.txt, /.git/config) care expun informații vitale.</span>
            </div>
            <div>
              <strong className="block text-ink">Favicon Hash</strong>
              <span className="text-sm text-muted">Descarcă iconița site-ului, o convertește și creează un hash Murmur3 folosit frecvent pe Shodan pentru a urmări atacatori.</span>
            </div>
            <div>
              <strong className="block text-ink">HTTP/3 QUIC Probe</strong>
              <span className="text-sm text-muted">Efectuează verificări pe pachete UDP port 443, identificând conexiunile QUIC capabile să evadeze firewall-urile tradiționale (TCP).</span>
            </div>
            <div>
              <strong className="block text-ink">DNS Alterations</strong>
              <span className="text-sm text-muted">Odată ce găsește un subdomeniu valid, generează variații logice (ex: adaugă prefixul dev-, test-) pentru a găsi instanțe neprotejate.</span>
            </div>
            <div>
              <strong className="block text-ink">DNS AXFR (Zone Transfer)</strong>
              <span className="text-sm text-muted">Vulnerabilitate critică. Cere nameserver-ului să ofere toată arhiva internă de domenii (o hartă completă a organizației).</span>
            </div>

            <div>
              <strong className="block text-ink">JARM Fingerprint</strong>
              <span className="text-sm text-muted">Simulează handshake-uri Raw TLS speciale cu suite de criptare pentru a genera un Hash criptografic unic serverului (foarte util vs. botnet-uri).</span>
            </div>

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
    wappalyzer: true, dirbust: true, faviconHash: true, quicProbe: true, dnsAlterations: true,
    dnsAxfr: true, jarmFingerprint: true
  });

  const [job, setJob] = React.useState<ScanJob | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [history, setHistory] = React.useState<ScanJob[]>([]);

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

  return (
    <main className="min-h-screen text-ink">
      <div className="mx-auto max-w-7xl px-4 py-6 overflow-hidden">
        <header className="flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
          <div>
          </div>
          <div className="flex items-center gap-4">
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
