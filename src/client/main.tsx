import React from "react";
import ReactDOM from "react-dom/client";
import { Server,  Activity, Building2, Globe2, Mail, MapPin, Network, Play, Radar, Shield, TerminalSquare, BookOpen, Clock, ArrowLeft, AlertCircle } from "lucide-react";
import type { ActiveOptions, ScanJob, ScanMode, ScanResult } from "../shared/types";
import { Documentation } from "./Documentation";
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
              {columns.map((column) => <td key={column} className="px-3 py-2 align-top text-ink break-words whitespace-normal"><div className="max-h-[160px] overflow-y-auto pr-1 whitespace-pre-wrap font-mono text-xs">{row[column]}</div></td>)}
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

function ConfidenceGrid({ confidences, familyScores }: { confidences: any; familyScores: any }) {
  return (
    <div className="mt-4">
      <div className="text-xs uppercase tracking-wide text-muted mb-2">Detailed Confidences & Families</div>
      <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
        {Object.entries(confidences).map(([key, value]) => (
          <div key={key} className="rounded border border-line bg-panel2 p-2">
            <div className="text-xs text-muted capitalize">{key}</div>
            <div className="font-semibold text-ink">{String(value)}/100</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-muted">
        <span className="font-medium text-ink">Family Breakdown:</span>{" "}
        {Object.entries(familyScores || {})
          .map(([family, score]) => `${family}: ${score}`)
          .join(" | ")}
      </div>
    </div>
  );
}

function EvidenceList({ title, items, tone, emptyText }: { title: string; items: ScanResult["candidates"][number]["supportingSignals"]; tone: "green" | "red"; emptyText?: string }) {
  const color = tone === "green" ? "text-greenx" : "text-redx";
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-muted">{title}</div>
      {items.length === 0 ? (
        <div className="text-sm text-muted/70 italic">{emptyText || "Nu au fost identificate semnale în această categorie."}</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={`${item.id}-${item.observedData ?? ""}`} className="rounded border border-line bg-panel2 p-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{item.title}</span>
                <span className={color}>{item.strength}</span>
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
  const candidates = [...(result.candidates ?? [])].sort((a, b) => b.confidences.origin - a.confidences.origin);
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
                <ScoreBar score={candidate.confidences.origin} />
              </div>
              <ConfidenceGrid confidences={candidate.confidences} familyScores={{}} />
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



function renderStatus(status?: string) {
  if (!status) return null;
  const color = status === "Confirmed" || status === "CONFIRMED" ? "text-greenx border-greenx" : status.includes("Inferred") || status.includes("INFERRED") ? "text-amberx border-amberx" : "text-muted border-line";
  return <span className={`text-xs font-semibold px-2 py-1 rounded border ${color}`}>{status.toUpperCase()}</span>;
}


function ScanSummary({ result }: { result: ScanJob["result"] }) {
  if (!result) return null;
  const webOrigin = result.topOriginCandidate;
  const mxCount = result.mxInfrastructure?.candidates?.length || 0;
  
  return (
    <div className="card border-l-4 border-cyanx mb-8">
      <h3 className="font-bold mb-4 uppercase text-sm tracking-wide text-cyanx">Rezultat Scanare</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-muted">ORIGINE WEB</div>
          <div className="font-medium">{webOrigin?.inconclusive ? `MULTIPLE CANDIDATES (${result.candidates?.filter(c => c.inconclusive).length})` : (webOrigin?.ip ?? "UNKNOWN")}</div>
          {webOrigin?.inconclusive && (
            <div className="text-xs text-muted mt-1">
              {result.candidates?.filter(c => c.inconclusive).map(c => `#1 ${c.ip}`).join("\n")}
            </div>
          )}
        </div>
        <div>
          <div className="text-muted">CLASIFICARE</div>
          <div className="font-medium text-ink uppercase">{webOrigin?.inconclusive ? "INCONCLUSIVE" : (webOrigin?.classification ?? "unknown")}</div>
        </div>
        <div>
          <div className="text-muted">ÎNCREDERE</div>
          <div className="font-medium text-cyanx uppercase">{webOrigin?.inconclusive ? `${webOrigin?.confidenceRating} (TIED)` : (webOrigin?.confidenceRating ?? "UNKNOWN")}</div>
        </div>
        <div>
          <div className="text-muted">INFRASTRUCTURĂ EMAIL</div>
          <div className="font-medium">{mxCount > 0 ? `${mxCount} MX-uri identificate` : "Niciun MX identificat"}</div>
        </div>
      </div>
    </div>
  );
}

function AttributionSummary({ result }: { result: ScanJob["result"] }) {
  if (!result) return null;
  const dec = result.decoupledOwnership;
  return (
    <Section title="1. SUMAR ATRIBUIRE" icon={<Shield size={18} />}>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="card border-l-4 border-cyanx">
          <h3 className="font-bold mb-4 uppercase text-sm tracking-wide text-cyanx">Atribuire Web</h3>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="py-1 text-muted">Likely Origin</td><td className="font-medium">{result.topOriginCandidate?.ip ?? "UNKNOWN"}</td></tr>
              <tr><td className="py-1 text-muted">Origin Confidence</td><td className="font-medium">{result.topOriginCandidate?.confidences.origin ?? 0}/100</td></tr>
              <tr><td className="py-1 text-muted">RIR Allocation</td><td className="font-medium">{dec?.rirAllocation?.identity ?? "UNKNOWN"}</td></tr>
              <tr><td className="py-1 text-muted">BGP Origin</td><td className="font-medium">{dec?.asnOperation?.identity ?? "UNKNOWN"}</td></tr>
              <tr><td className="py-1 text-muted">Operator rețea</td><td className="font-medium">{dec?.networkOperation?.identity === "UNKNOWN" ? <span className="text-muted">UNKNOWN (Evidence insuficientă)</span> : <>{dec?.networkOperation?.identity}<br/><div className="mt-1">{renderStatus(dec?.networkOperation?.confidence && dec.networkOperation.confidence > 80 ? "CONFIRMED" : "INFERRED")}</div></>}</td></tr>
              <tr><td className="py-1 text-muted">Furnizor hosting</td><td className="font-medium">{dec?.hostingProvider?.identity === "UNKNOWN" ? <span className="text-muted">UNKNOWN (Evidence insuficientă)</span> : <>{dec?.hostingProvider?.identity}<br/><div className="mt-1">{renderStatus(dec?.hostingProvider?.confidence && dec.hostingProvider.confidence > 80 ? "CONFIRMED" : "INFERRED")}</div></>}</td></tr>
              <tr><td className="py-1 text-muted">Application Operator</td><td className="font-medium">{dec?.applicationOperator?.identity ?? "UNKNOWN"}</td></tr>
              <tr><td className="py-1 text-muted">Probable Customer</td><td className="font-medium">{dec?.probableCustomer?.identity ?? "UNKNOWN"}</td></tr>
              <tr><td className="py-1 text-muted">Locație estimată</td><td className="font-medium">{dec?.estimatedLocation?.identity ?? "UNKNOWN"}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold uppercase text-sm tracking-wide text-cyanx ml-2">Atribuire Email</h3>
          {result.mxInfrastructure?.candidates?.map((c, i) => (
            <div key={i} className="card border-l-4 border-purple-500">
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="py-1 text-muted">MX Host</td><td className="font-medium">{c.hostname}</td></tr>
                  <tr><td className="py-1 text-muted">Mail IP</td><td className="font-medium">{c.ip}</td></tr>
                  <tr><td className="py-1 text-muted">RIR Allocation</td><td className="font-medium">{c.ownershipChain?.rirAllocation?.identity}</td></tr>
                  <tr><td className="py-1 text-muted">BGP Origin</td><td className="font-medium">{c.ownershipChain?.asnOperation?.identity}</td></tr>
                  <tr><td className="py-1 text-muted">Operator rețea</td><td className="font-medium">{c.ownershipChain?.networkOperation?.identity}</td></tr>
                  <tr><td className="py-1 text-muted">Furnizor e-mail</td><td className="font-medium">{c.ownershipChain?.emailProvider?.identity === "UNKNOWN" ? <span className="text-muted">UNKNOWN (Evidence insuficientă)</span> : <>{c.ownershipChain?.emailProvider?.identity}<br/><div className="mt-1">{renderStatus(c.ownershipChain?.emailProvider?.status)}</div></>}</td></tr>
                  <tr><td className="py-1 text-muted">Locație estimată</td><td className="font-medium">{c.ownershipChain?.estimatedLocation?.identity}</td></tr>
                  <tr><td className="py-1 text-muted">Confidence</td><td className="font-medium">{c.ownershipChain?.emailProvider?.confidence}/100</td></tr>
                </tbody>
              </table>
            </div>
          ))}
          {!result.mxInfrastructure?.candidates?.length && <div className="text-muted text-sm ml-2">No MX infrastructure candidates found.</div>}
        </div>
      </div>
    </Section>
  );
}

function InfraNode({ label, val }: { label: string; val: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 text-right text-xs uppercase text-muted font-semibold">{label}</div>
      <div className="w-3 h-3 rounded-full bg-cyanx shadow-[0_0_8px_rgba(0,255,255,0.5)]"></div>
      <div className="flex-1 p-2 rounded bg-panel2 border border-line font-medium break-all">{val}</div>
    </div>
  );
}

function InfrastructureChain({ result }: { result: ScanJob["result"] }) {
  if (!result) return null;
  const web = result.decoupledOwnership;
  const webOrigin = result.topOriginCandidate;

  return (
    <Section title="2. LANȚ INFRASTRUCTURĂ" icon={<Network size={18} />}>
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold text-cyanx mb-4 uppercase">Flux Web</h4>
          <div className="relative space-y-2 border-l-2 border-line/30 ml-[10.5rem]">
            <div className="-ml-[10.5rem]"><InfraNode label="Domain" val={result.domain.domain} /></div>
            <div className="-ml-[10.5rem]"><InfraNode label="Hostname" val={result.domain.domain} /></div>
            <div className="-ml-[10.5rem]"><InfraNode label="IP" val={webOrigin?.ip ?? "UNKNOWN"} /></div>
            <div className="-ml-[10.5rem]"><InfraNode label="Prefix" val={web?.ipPrefix?.identity ?? "UNKNOWN"} /></div>
            <div className="-ml-[10.5rem]"><InfraNode label="RIR" val={web?.rirAllocation?.identity ?? "UNKNOWN"} /></div>
            <div className="-ml-[10.5rem]"><InfraNode label="BGP" val={web?.asnOperation?.identity ?? "UNKNOWN"} /></div>
            <div className="-ml-[10.5rem]"><InfraNode label="Network" val={web?.networkOperation?.identity ?? "UNKNOWN"} /></div>
            <div className="-ml-[10.5rem]"><InfraNode label="Hosting" val={web?.hostingProvider?.identity ?? "UNKNOWN"} /></div>
            <div className="-ml-[10.5rem]"><InfraNode label="App / Customer" val={web?.probableCustomer?.identity === "UNKNOWN" ? web?.applicationOperator?.identity ?? "UNKNOWN" : web?.probableCustomer?.identity ?? "UNKNOWN"} /></div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-cyanx mb-4 uppercase">Flux Email</h4>
          {(() => {
            const mxs = result.mxInfrastructure?.candidates || [];
            if (!mxs.length) return <div className="text-muted text-sm">Nu a fost detectată infrastructură de email.</div>;
            
            // Group by MX hostname + Email Provider
            const grouped = new Map<string, typeof mxs>();
            mxs.forEach(c => {
              const key = `${c.hostname}::${c.ownershipChain?.emailProvider?.identity}`;
              if (!grouped.has(key)) grouped.set(key, []);
              grouped.get(key)!.push(c);
            });

            return Array.from(grouped.values()).map((group, i) => {
              const first = group[0];
              return (
                <div key={i} className="mb-8 relative space-y-2 border-l-2 border-line/30 ml-[10.5rem]">
                  <div className="-ml-[10.5rem]"><InfraNode label="Domain" val={result.domain.domain} /></div>
                  <div className="-ml-[10.5rem]"><InfraNode label="MX" val={first.hostname} /></div>
                  <div className="-ml-[10.5rem]"><InfraNode label="IP" val={`${group.length} adrese: ${group.map(g => g.ip).join(", ")}`} /></div>
                  <div className="-ml-[10.5rem]"><InfraNode label="Email Provider" val={first.ownershipChain?.emailProvider?.identity || "UNKNOWN"} /></div>
                  <div className="-ml-[10.5rem]"><InfraNode label="Provider Status" val={first.ownershipChain?.emailProvider?.status || "UNKNOWN"} /></div>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </Section>
  );
}

function OriginCandidates({ result }: { result: ScanJob["result"] }) {
  if (!result || !result.candidates) return null;
  return (
    <Section title="3. CANDIDAȚI WEB ORIGIN" icon={<Radar size={18} />}>
      <div className="space-y-4">
        {result.candidates.map(c => (
          <div key={c.ip} className={`card p-4 ${c.inconclusive ? 'bg-amber-900/20 border border-amber-700/50' : 'bg-panel'}`}>
            {c.inconclusive && (
              <div className="text-amber-500 text-xs font-bold uppercase mb-3 flex items-center gap-2">
                <AlertCircle size={14} /> Au fost identificate mai multe candidate pentru Originea Web, cu dovezi echivalente. Sistemul nu poate selecta o singură origine.
              </div>
            )}
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-xl font-bold flex items-center gap-2">
                  <span className="text-muted text-sm font-normal">#{c.relativeRank}</span> {c.ip}
                </div>
                <div className="text-sm text-muted mt-1">Clasificare: <span className="text-ink font-medium">{c.classification}</span></div>
                <div className="text-sm text-muted">Nivel de încredere: <span className={`font-semibold ${c.confidenceRating === "HIGH CONFIDENCE" ? "text-blue-500" : c.confidenceRating === "MEDIUM CONFIDENCE" ? "text-blue-400" : "text-blue-300"}`}>{c.confidenceRating}</span> <span className="text-xs text-muted/70">(Indicator intern: {c.confidences.origin}/100)</span></div>
              </div>
            </div>
            
            <div className="bg-panel2 p-3 rounded mb-4 text-sm">
              <span className="font-semibold uppercase text-xs text-muted block mb-1">DE CE?</span>
              {c.explanation.split("\n").map((line, idx) => <p key={idx} className="mb-1">{line}</p>)}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <EvidenceList title="DOVEZI CARE SUSȚIN CONCLUZIA" items={c.supportingSignals || []} tone="green" />
              <div className="space-y-4">
                <EvidenceList title="DOVEZI CONTRADICTORII" items={c.contradictionSignals || []} tone="red" emptyText="Nu au fost identificate dovezi contradictorii relevante." />
                
                {c.missingEvidence && c.missingEvidence.length > 0 ? (
                  <div className="bg-panel2 p-3 rounded text-sm border-l-2 border-amber-500/50">
                    <span className="font-semibold uppercase text-xs text-amber-500 block mb-1">DOVEZI LIPSĂ</span>
                    <ul className="list-disc list-inside text-muted">
                      {c.missingEvidence.map((m: string, i: number) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-muted/70 italic text-sm mt-4">Dovezi lipsă: niciuna identificată.</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function EvidenceMatrix({ result }: { result: ScanJob["result"] }) {
  const categoryMap: Record<string, string> = {
    BGP_ASN: "BGP / ASN",
    DNS: "DNS",
    EMAIL: "E-MAIL",
    EMAIL_AUTH: "AUTENTIFICARE E-MAIL",
    PORT_SERVICE: "SERVICII / PORTURI",
    REVERSE_DNS: "REVERSE DNS",
    TLS: "TLS"
  };

  if (!result) return null;
  
  // Aggregate all evidence from top origin candidate and mx candidates
  const allSignals: any[] = [];
  if (result.topOriginCandidate?.evidence) {
    Object.values(result.topOriginCandidate.evidence).flat().forEach((s: any) => allSignals.push({...s, _context: "Web: " + result.topOriginCandidate!.ip}));
  }
  result.mxInfrastructure?.candidates?.forEach(c => {
    Object.values(c.evidence).flat().forEach((s: any) => allSignals.push({...s, _context: "MX: " + c.ip}));
  });

  const grouped = allSignals.reduce((acc, s) => {
    const fam = s.family || "Other";
    if (!acc[fam]) acc[fam] = [];
    acc[fam].push(s);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <Section title="4. MATRICEA DOVEZILOR" icon={<Activity size={18} />}>
      <div className="space-y-6">
        {Object.keys(grouped).sort().map(fam => (
          <div key={fam}>
            <h4 className="text-sm font-bold uppercase mb-2 border-b border-line pb-1 text-cyanx" title={fam}>{categoryMap[fam] || fam}</h4>
            <div className="grid gap-2">
              {grouped[fam].map((s: any, i: number) => (
                <div key={i} className="flex flex-col md:flex-row md:items-start gap-3 p-2 bg-panel2 rounded border border-line text-sm transition-colors">
                  <div className="w-32 shrink-0 pt-1">
                    <span className={`text-xs font-semibold px-2 py-1 rounded border ${s.type === 'supporting' ? 'bg-greenx/10 text-greenx border-greenx/20' : s.type === 'contradiction' ? 'bg-redx/10 text-redx border-redx/20' : 'bg-line/30 text-muted border-line'}`}>
                      {s.type === "neutral" ? "NEUTRAL" : s.type === "supporting" ? "SUPPORTING" : "CONTRADICTION"}
                    </span>
                  </div>
                  <div className="w-24 shrink-0 text-xs text-muted uppercase font-semibold pt-1">{s.strength}</div>
                  <div className="w-32 shrink-0 font-medium text-ink/80 break-words pt-1">{s._context}</div>
                  <div className="w-48 shrink-0 font-medium text-ink break-words pt-1">{s.title}</div>
                  <div className="flex-1 text-muted">
                    <div className="mb-1">{s.description}</div>
                    {s.observedData && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-cyanx/80 hover:text-cyanx select-none">View observed data</summary>
                        <div className="mt-2 font-mono text-muted/70 bg-panel p-2 rounded border border-line overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {s.observedData}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {allSignals.length === 0 && <div className="text-muted">No explicit evidence collected.</div>}
      </div>
    </Section>
  );
}

function ConclusionDetails({ result }: { result: ScanJob["result"] }) {
  if (!result || !result.decoupledOwnership) return null;
  const dec = result.decoupledOwnership;
  
  const rules = [
    { name: "Furnizor hosting", obj: dec.hostingProvider },
    { name: "Operator aplicație", obj: dec.applicationOperator },
    { name: "Probable Customer", obj: dec.probableCustomer },
    { name: "Operator rețea", obj: dec.networkOperation },
  ];

  return (
    <div className="grid md:grid-cols-2 gap-6 mt-6">
      <Section title="5. CE SUSȚINE ACEASTĂ CONCLUZIE?" icon={<BookOpen size={18} />}>
        <div className="space-y-4">
          {rules.filter(r => r.obj?.identity !== "UNKNOWN" && r.obj).map(r => (
            <div key={r.name} className="p-3 bg-panel2 border border-line rounded">
              <div className="font-semibold text-sm mb-1">{r.name}: <span className="text-greenx">{r.obj.identity}</span></div>
              <div className="text-xs text-muted mb-2">{r.obj.explanation}</div>
              {r.obj.signals && r.obj.signals.length > 0 && (
                <div className="text-xs space-y-1">
                  {r.obj.signals.map((s:any,i:number) => <div key={i} className="pl-2 border-l-2 border-cyanx">{s.title}: {s.observedData}</div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
      <Section title="6. CE NU ESTE STABILIT?" icon={<Shield size={18} />}>
        <div className="space-y-4">
          {rules.filter(r => (r.obj?.identity === "UNKNOWN" || r.obj?.confidence < 40) && r.obj).map(r => (
            <div key={r.name} className="p-3 bg-panel2 border border-line rounded">
              <div className="font-semibold text-sm mb-1">{r.name}</div>
              <div className="text-xs text-muted mt-2"><span className="font-semibold text-ink">Motiv:</span> {r.obj.explanation || "Evidence insuficientă."}</div>
            </div>
          ))}
          {result.mxInfrastructure?.candidates?.map(c => {
            if (c.ownershipChain?.emailProvider?.identity === "UNKNOWN" || c.ownershipChain?.emailProvider?.status === "Inferred from BGP") {
              return (
                <div key={c.ip} className="p-3 bg-panel2 border border-line rounded">
                  <div className="font-semibold text-sm mb-1">Furnizor e-mail ({c.ip}): <span className={c.ownershipChain.emailProvider.identity === 'UNKNOWN' ? 'text-amberx font-bold' : 'text-greenx'}>{c.ownershipChain.emailProvider.identity}</span></div>
                  <div className="text-xs text-muted mb-1">Status: {c.ownershipChain.emailProvider.status}</div>
                  <div className="text-xs text-muted">{c.ownershipChain.emailProvider.explanation}</div>
                </div>
              );
            }
            return null;
          })}
        </div>
      </Section>
    </div>
  );
}

function HistoricalData({ result }: { result: ScanJob["result"] }) {
  if (!result) return null;
  const hist = result.topOriginCandidate?.evidence?.historical || [];
  if (hist.length === 0) return null;

  return (
    <Section title="7. INFRASTRUCTURĂ ISTORICĂ / ASOCIATĂ" icon={<Clock size={18} />}>
      <div className="grid gap-2">
        {hist.map((s: any, i: number) => (
          <div key={i} className="p-3 bg-panel2 border border-line rounded text-sm">
            <div className="font-semibold text-cyanx mb-1">{s.title}</div>
            <div className="text-muted mb-1">{s.description}</div>
            <div className="font-mono text-xs">{s.observedData}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}



function syntaxHighlight(json: string) {
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = 'text-cyanx';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'text-red-400 font-semibold';
      } else {
        cls = 'text-green-400';
      }
    } else if (/true|false/.test(match)) {
      cls = 'text-blue-400 font-bold';
    } else if (/null/.test(match)) {
      cls = 'text-gray-500 italic';
    }
    return '<span class="' + cls + '">' + match + '</span>';
  });
}


function IpContextDetails({ result }: { result: ScanJob["result"] }) {
  if (!result || result.targetType !== "ip" || !result.ips || result.ips.length === 0) return null;
  const ip = result.ips[0];
  if (!ip.hostedDomains || ip.hostedDomains.length === 0) return null;
  return (
    <Section title="Domenii Găzduite (Reverse IP)" icon={<Server size={18} />}>
      <div className="bg-panel2 p-4 rounded border border-line flex flex-wrap gap-2">
        {ip.hostedDomains.map((d: string, i: number) => (
          <span key={i} className="px-2 py-1 bg-surface rounded text-sm text-cyanx border border-cyanx/20">
            {d}
          </span>
        ))}
      </div>
    </Section>
  );
}



function EmailPoliciesCard({ result }: { result: ScanJob["result"] }) {
  if (!result || result.targetType !== "email") return null;
  
  const hasSpf = result.dns.txt.some(t => t.toLowerCase().includes("v=spf1"));
  const hasDmarc = result.dns.txt.some(t => t.toLowerCase().includes("v=dmarc1"));
  
  return (
    <Section title="Politici Securitate Email (DMARC / SPF)" icon={<Shield size={18} />}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`p-4 rounded border ${hasSpf ? 'bg-green-900/20 border-green-500/30' : 'bg-red-900/20 border-red-500/30'}`}>
          <h3 className="font-semibold text-lg mb-2">Sender Policy Framework (SPF)</h3>
          <p className="text-sm opacity-90">
            {hasSpf ? "Domeniul are o politică SPF configurată, prevenind trimiterea de emailuri neautorizate." : "Domeniul NU are politică SPF. Există risc major de spoofing."}
          </p>
        </div>
        <div className={`p-4 rounded border ${hasDmarc ? 'bg-green-900/20 border-green-500/30' : 'bg-red-900/20 border-red-500/30'}`}>
          <h3 className="font-semibold text-lg mb-2">DMARC Policy</h3>
          <p className="text-sm opacity-90">
            {hasDmarc ? "Domeniul are o politică DMARC configurată pentru instruirea serverelor de destinație." : "Domeniul NU are politică DMARC."}
          </p>
        </div>
      </div>
    </Section>
  );
}


function RawJsonOutput({ result }: { result: ScanJob["result"] }) {
  if (!result) return null;
  const jsonStr = JSON.stringify(result, null, 2);
  return (
    <Section title="JSON RAW OUTPUT" icon={<TerminalSquare size={18} />}>
      <div 
        className="bg-[#1e1e1e] p-4 rounded border border-line overflow-auto max-h-[600px] text-xs font-mono whitespace-pre"
        dangerouslySetInnerHTML={{ __html: syntaxHighlight(jsonStr) }}
      />
    </Section>
  );
}



function RawEvidence({ result }: { result: ScanJob["result"] }) {
  if (!result) return null;
  return (
    <Section title="8. DOVEZI BRUTE" icon={<TerminalSquare size={18} />}>
      <div className="space-y-6 opacity-80">
        <div>
          <h4 className="text-sm font-semibold mb-2 text-muted uppercase">Informatii IP</h4>
          <DataTable rows={result.ips.map((ip) => ({
            ip: ip.ip,
            asn: ip.asn?.asn ? `AS${ip.asn.asn}` : "necunoscut",
            org: ip.asn?.org ?? "necunoscut",
            alocare: ip.rirAllocationOwner ?? ip.networkName ?? "necunoscut",
            prefix: ip.announcedPrefix ?? ip.asn?.cidr ?? "necunoscut",
            geo: [ip.geo?.city, ip.geo?.country].filter(Boolean).join(", ") || "necunoscut",
            furnizor: ip.providerType
          }))} />
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-2 text-muted uppercase">Inregistrari DNS</h4>
          <DataTable rows={[
            { inregistrare: "A", valoare: result.dns.a.join(", ") || "lipsa" },
            { inregistrare: "MX", valoare: result.dns.mx.map((mx: any) => `${mx.priority} ${mx.exchange}`).join(", ") || "lipsa" },
            { inregistrare: "TXT", valoare: result.dns.txt.slice(0, 6).join(" | ") || "lipsa" },
          ]} />
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-2 text-muted uppercase">Porturi Deschise</h4>
          <DataTable rows={result.ports.map((port) => ({
            host: port.host,
            port: port.port,
            stare: port.state,
            serviciu: port.service ?? "tcp",
          }))} />
        </div>
      </div>
    </Section>
  );
}


function DnsHistory({ result }: { result: ScanResult }) {
  if (!result.dnsHistory || result.dnsHistory.length === 0) return null;
  return (
    <div className="card mt-6">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
        <Clock size={20} className="text-cyanx" /> Istoric DNS & Infrastructură
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-panel2">
            <tr>
              <th className="px-4 py-2 text-muted font-semibold">Tip</th>
              <th className="px-4 py-2 text-muted font-semibold">Valoare</th>
              <th className="px-4 py-2 text-muted font-semibold">First Seen</th>
              <th className="px-4 py-2 text-muted font-semibold">Last Seen</th>
              <th className="px-4 py-2 text-muted font-semibold">Sursă</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {result.dnsHistory.map((h, i) => (
              <tr key={i} className="hover:bg-panel2/50">
                <td className="px-4 py-2 font-medium">{h.type}</td>
                <td className="px-4 py-2">{h.value}</td>
                <td className="px-4 py-2">{h.firstSeen || "-"}</td>
                <td className="px-4 py-2">{h.lastSeen || "-"}</td>
                <td className="px-4 py-2 text-muted">{h.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}



function TargetContextBanner({ result }: { result: ScanResult }) {
  if (result.targetType === "domain" || !result.targetType) return null;
  return (
    <div className="mb-6 rounded border border-cyanx/40 bg-cyanx/5 px-4 py-3 flex items-start gap-3">
      <AlertCircle size={20} className="text-cyanx shrink-0 mt-0.5" />
      <div>
        <h3 className="font-semibold text-cyanx">
          {result.targetType === "ip" ? "Analiză IP Direct" : "Analiză Adresă Email"}
        </h3>
        <p className="text-sm text-ink/80 mt-1">
          {result.targetType === "ip" 
            ? `Sistemul analizează direct adresa IP ${result.originalTarget}. Faza de DNS și subdomenii a fost ignorată pentru a accelera analiza de rețea (ASN, GeoIP, TLS, HTTP).`
            : `Analiza a extras domeniul ${result.domain.domain} din adresa ${result.originalTarget}. Raportul este orientat spre verificarea serverelor MX și a politicilor DMARC/SPF.`}
        </p>
      </div>
    </div>
  );
}


function Results({ job }: { job: ScanJob }) {
  if (!job.result) return null;
  const result = job.result;
  const isIp = result.targetType === "ip";
  const isEmail = result.targetType === "email";
  
  return (
    <div className="mt-6 space-y-8">
      <TargetContextBanner result={result} />
      <ConclusionDetails result={result} />
      
      <EmailPoliciesCard result={result} />
      <IpContextDetails result={result} />
      
      <ScanSummary result={result} />
      {!isIp && <AttributionSummary result={result} />}
      {!isIp && <OriginCandidates result={result} />}
      <EvidenceMatrix result={result} />
      <InfrastructureChain result={result} />
      {!isIp && <HistoricalData result={result} />}
      {!isIp && <DnsHistory result={result} />}
      <RawEvidence result={result} />
      <RawJsonOutput result={result} />
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
        <Documentation onClose={() => setPage("dashboard")} />
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
                <input className="input mt-2 font-medium" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="domeniu.ro, 1.1.1.1 sau nume@domeniu.ro" />

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
