import React, { useState } from 'react';
import { BookOpen, Shield, Server, Activity, Mail, AlertTriangle, Info, MapPin, Network, Radar, CheckCircle, ChevronDown, Menu, X, HelpCircle, Layers } from 'lucide-react';

export function Documentation({ onClose }: { onClose: () => void }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: "intro", label: "1. Introducere" },
    { id: "ce-determina", label: "2. Ce determină sistemul" },
    { id: "flux", label: "3. Fluxul scanării" },
    { id: "web-vs-email", label: "4. Web vs Email" },
    { id: "surse", label: "5. Surse de date" },
    { id: "evidence-model", label: "6. Evidence Model" },
    { id: "tipuri", label: "7. Supporting / Contradiction / Neutral" },
    { id: "strength", label: "8. Strength vs Confidence" },
    { id: "indicator", label: "9. Indicator intern numeric" },
    { id: "web-classes", label: "10. Web Origin Classifications" },
    { id: "inconclusive", label: "11. INCONCLUSIVE" },
    { id: "cdn", label: "12. CDN/WAF Edge" },
    { id: "shared", label: "13. Shared Hosting" },
    { id: "email-only", label: "14. Email-only" },
    { id: "email-inferred", label: "15. Email Provider INFERRED" },
    { id: "rir-bgp", label: "16. RIR vs BGP vs Network vs Hosting" },
    { id: "mismatch", label: "17. RIR / BGP Mismatch" },
    { id: "unknown", label: "18. UNKNOWN" },
    { id: "nestabilit", label: "19. Ce nu este stabilit" },
    { id: "cum-citesti-card", label: "20. Cum citești Origin Candidate" },
    { id: "matrix", label: "21. Evidence Matrix" },
    { id: "categorii", label: "22. Categoriile Evidence" },
    { id: "dns", label: "23. DNS Evidence" },
    { id: "tls", label: "24. TLS Evidence" },
    { id: "http", label: "25. HTTP Evidence" },
    { id: "ptr", label: "26. Reverse DNS" },
    { id: "rpki", label: "27. RPKI" },
    { id: "email-auth", label: "28. Email Authentication" },
    { id: "ranking", label: "29. Candidate Ranking" },
    { id: "ordinea", label: "30. Ordinea candidatelor" },
    { id: "scenarii", label: "31-44. Scenarii Speciale" },
    { id: "cum-citesti-raport", label: "45. Cum citește operatorul raportul" },
    { id: "decizie", label: "46. Decizia Operațională" },
    { id: "limitari", label: "47. Limitări" },
    { id: "principii", label: "48. Principii de interpretare" },
    { id: "glosar", label: "49. Glosar" }
  ];

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      const details = el.querySelector('details');
      if (details && !details.open) {
        details.open = true;
      }
    }
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-panel">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-panel border-b border-line px-4 py-3 flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-lg md:text-xl font-bold flex items-center gap-2 text-ink">
            <BookOpen className="text-cyanx shrink-0" /> DOCUMENTAȚIE: Evidence Correlation Engine
          </h1>
          <p className="text-xs text-muted hidden md:block mt-0.5">Ghid tehnic pentru utilizarea și interpretarea rezultatelor de atribuire a infrastructurii unui domeniu.</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden text-muted hover:text-ink">
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <button onClick={onClose} className="hidden md:block px-4 py-1.5 bg-panel2 border border-line rounded hover:bg-line text-sm font-semibold transition-colors">
            Înapoi la Scanare
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Table of Contents */}
        <div className={`absolute inset-0 z-40 bg-panel lg:static lg:block lg:w-64 border-r border-line overflow-y-auto custom-scrollbar p-4 transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className="lg:hidden flex justify-between items-center mb-6">
            <h3 className="font-bold text-cyanx">Cuprins</h3>
            <button onClick={() => setMobileMenuOpen(false)} className="text-muted"><X size={20}/></button>
          </div>
          <ul className="space-y-1 pb-10">
            {navItems.map(item => (
              <li key={item.id}>
                <button onClick={() => scrollTo(item.id)} className="text-left w-full px-2 py-1.5 text-xs text-muted hover:text-ink hover:bg-panel2 rounded transition-colors truncate">
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 scroll-smooth">
          <div className="max-w-4xl mx-auto space-y-6 pb-20">

            {/* 1. INTRODUCERE */}
            <div id="intro" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line" open>
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><Radar className="text-cyanx" size={18} /> 1. INTRODUCERE</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted space-y-3">
                  <p><strong>Evidence Correlation Engine</strong> este componenta care corelează informațiile colectate în timpul unei scanări pentru a determina ce infrastructură este asociată unui domeniu și cât de puternică este această asociere.</p>
                  <p>Sistemul nu tratează o singură informație drept adevăr absolut. Un DNS A record, un certificat TLS, un ASN, un PTR record sau un MX record reprezintă <em>observații individuale</em>. Aceste observații sunt corelate pentru a construi o imagine coerentă asupra infrastructurii.</p>
                  <p>Scopul principal este separarea între:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>infrastructura Web;</li>
                    <li>infrastructura Email;</li>
                    <li>infrastructura CDN/WAF;</li>
                    <li>infrastructura de hosting/shared infrastructure;</li>
                    <li>informațiile de routing și ownership;</li>
                    <li>informațiile care pot fi atribuite operatorului aplicației;</li>
                    <li>informațiile care nu pot fi determinate cu suficiente dovezi.</li>
                  </ul>
                  <div className="bg-panel p-3 border-l-4 border-cyanx rounded mt-2">
                    <strong className="block text-cyanx mb-1">Interpretare corectă</strong>
                    O concluzie de tip: <br/><code className="text-ink">Web Origin: 193.230.5.163</code> <br/>nu trebuie interpretată ca "IP-ul aparține domeniului" doar pentru că apare în DNS. Un rezultat trebuie interpretat întotdeauna împreună cu Evidence care l-au generat (TLS, HTTP, Reverse DNS, BGP, RIR, CDN/WAF etc).
                  </div>
                </div>
              </details>
            </div>

            {/* 2. CE ÎNCEARCĂ SĂ DETERMINE */}
            <div id="ce-determina" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line" open>
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><Server className="text-cyanx" size={18} /> 2. CE ÎNCEARCĂ SĂ DETERMINE SISTEMUL</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm">
                  <div className="space-y-4">
                    <div className="bg-panel p-4 rounded border border-line">
                      <h4 className="font-bold text-cyanx mb-2">WEB ORIGIN</h4>
                      <p className="text-muted mb-2">Reprezintă serverul sau infrastructura care poate fi considerată origine directă pentru serviciul Web al domeniului. Un IP care apare în DNS nu este automat Web Origin.</p>
                      <p className="text-muted">Un IP poate fi: Web Origin, probable origin, possible origin, shared hosting, CDN/WAF edge, email-only, altă infrastructură intermediară, sau inconclusive.</p>
                    </div>

                    <div className="bg-panel p-4 rounded border border-line">
                      <h4 className="font-bold text-cyanx mb-2">CDN/WAF EDGE</h4>
                      <p className="text-muted">Un nod intermediar care primește traficul public și îl transmite către infrastructura origin (ex. Cloudflare). Faptul că DNS indică IP-ul, certificatul TLS se potrivește și HTTP răspunde NU este suficient pentru a concluziona că IP-ul este serverul origin dacă există Evidence puternică de CDN/WAF.</p>
                    </div>

                    <div className="bg-panel p-4 rounded border border-line">
                      <h4 className="font-bold text-cyanx mb-2">SHARED HOSTING</h4>
                      <p className="text-muted">IP-ul poate găzdui mai multe servicii sau aplicații. Evidence nu permite atribuirea exclusivă către domeniul analizat. Un shared hosting IP poate fi totuși un Web Origin valid pentru acel domeniu. Clasificarea nu înseamnă automat "IP greșit".</p>
                    </div>

                    <div className="bg-panel p-4 rounded border-line border-l-4 border-l-redx">
                      <h4 className="font-bold text-redx mb-2">EMAIL-ONLY</h4>
                      <p className="text-muted">IP asociat infrastructurii de Email, nu Web Origin. Un IP MX poate fi perfect valid pentru Email și complet irelevant pentru Web Origin. <strong>Important:</strong> Email-only candidates NU trebuie să participe la ranking-ul Web Origin.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-panel p-3 rounded border border-line">
                        <h4 className="font-bold text-cyanx mb-1">RIR ALLOCATION</h4>
                        <p className="text-xs text-muted">Organizația căreia îi este asociată resursa IP la nivel de registry. Nu trebuie interpretat automat ca Hosting Provider, Network Operator sau Customer.</p>
                      </div>
                      <div className="bg-panel p-3 rounded border border-line">
                        <h4 className="font-bold text-cyanx mb-1">BGP ORIGIN</h4>
                        <p className="text-xs text-muted">ASN-ul care anunță prefixul în routing. Poate oferi indicii, dar nu reprezintă automat proprietarul serverului.</p>
                      </div>
                      <div className="bg-panel p-3 rounded border border-line">
                        <h4 className="font-bold text-cyanx mb-1">NETWORK OPERATOR</h4>
                        <p className="text-xs text-muted">Entitatea care operează infrastructura de rețea. Dacă Evidence nu este suficientă, valoarea trebuie să rămână UNKNOWN.</p>
                      </div>
                      <div className="bg-panel p-3 rounded border border-line">
                        <h4 className="font-bold text-cyanx mb-1">HOSTING PROVIDER</h4>
                        <p className="text-xs text-muted">Furnizorul infrastructurii de hosting. ASN-ul singur nu este suficient pentru a-l identifica automat.</p>
                      </div>
                      <div className="bg-panel p-3 rounded border border-line">
                        <h4 className="font-bold text-cyanx mb-1">APPLICATION OPERATOR</h4>
                        <p className="text-xs text-muted">Entitatea asociată operării aplicației/serviciului (dedusă din certificate TLS, headere HTTP).</p>
                      </div>
                      <div className="bg-panel p-3 rounded border border-line">
                        <h4 className="font-bold text-cyanx mb-1">PROBABLE CUSTOMER</h4>
                        <p className="text-xs text-muted">O atribuire complet euristică. Nu trebuie prezentată ca identificare confirmată dacă nu există Evidence directă.</p>
                      </div>
                      <div className="bg-panel p-3 rounded border border-line md:col-span-2">
                        <h4 className="font-bold text-cyanx mb-1">ESTIMATED LOCATION</h4>
                        <p className="text-xs text-muted">Estimare derivată din datele disponibile. <strong>Nu reprezintă automat locația fizică exactă a serverului.</strong></p>
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            </div>

            {/* 3. FLUXUL */}
            <div id="flux" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><Network className="text-cyanx" size={18} /> 3. FLUXUL COMPLET AL UNEI SCANĂRI</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <div className="font-mono text-xs bg-panel p-4 rounded border border-line mb-4 space-y-1 text-center">
                    <div>DOMAIN</div><div>↓</div>
                    <div>DNS ENUMERATION</div><div>↓</div>
                    <div>HOSTNAME / IP / MX DISCOVERY</div><div>↓</div>
                    <div>IP ENRICHMENT</div><div>↓</div>
                    <div>RIR / RDAP / BGP / ASN / RPKI</div><div>↓</div>
                    <div>HTTP / TLS / PTR / PORTS</div><div>↓</div>
                    <div>CERTIFICATE TRANSPARENCY</div><div>↓</div>
                    <div>HISTORICAL / EXTERNAL EVIDENCE</div><div>↓</div>
                    <div className="text-cyanx font-bold">EVIDENCE CORRELATION</div><div>↓</div>
                    <div>CANDIDATE CLASSIFICATION & CONFIDENCE & RANKING</div><div>↓</div>
                    <div className="font-bold">FINAL REPORT</div>
                  </div>
                  <ul className="list-disc pl-5 space-y-2">
                    <li><strong>DNS:</strong> Identifică A, AAAA, CNAME, MX, subdomain.</li>
                    <li><strong>IP Discovery:</strong> IP-urile descoperite devin candidate.</li>
                    <li><strong>IP Enrichment:</strong> Caută ASN, BGP Origin, RIR allocation, prefix.</li>
                    <li><strong>Direct Probes:</strong> HTTP probe, TLS/SNI probe, port discovery, PTR.</li>
                    <li><strong>Evidence Correlation:</strong> Toate observațiile sunt transformate în Evidence și corelate.</li>
                  </ul>
                </div>
              </details>
            </div>

            {/* 4. WEB VS EMAIL */}
            <div id="web-vs-email" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><Layers className="text-cyanx" size={18} /> 4. WEB FLOW VS EMAIL FLOW</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <div className="grid md:grid-cols-2 gap-6 mb-4">
                    <div className="bg-panel p-4 rounded border border-line">
                      <h4 className="font-bold text-cyanx mb-2 border-b border-line pb-1">WEB FLOW</h4>
                      <div className="font-mono text-xs space-y-1">
                        Domain → Web Hostname → IP → Prefix → RIR Allocation → BGP Origin → Network → Hosting → Application Operator → Probable Customer
                      </div>
                    </div>
                    <div className="bg-panel p-4 rounded border border-line">
                      <h4 className="font-bold text-amberx mb-2 border-b border-line pb-1">EMAIL FLOW</h4>
                      <div className="font-mono text-xs space-y-1">
                        Domain → MX → Mail Host → Mail IP → Prefix → RIR Allocation → BGP Origin → Network → Email Provider
                      </div>
                    </div>
                  </div>
                  <div className="bg-panel p-3 border-l-4 border-cyanx rounded">
                    <strong>Important:</strong> Un domeniu poate avea simultan Web (193.230.5.163) și Email (194.102.40.10, .12, .14). Aceste IP-uri <strong>nu trebuie tratate ca fiind candidate concurente</strong>. Web Origin și Email Infrastructure sunt două probleme diferite.
                  </div>
                </div>
              </details>
            </div>

            {/* 5. SURSE */}
            <div id="surse" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><Activity className="text-cyanx" size={18} /> 5. SURSELE DE DATE</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs text-left">
                      <thead className="bg-panel text-muted uppercase">
                        <tr>
                          <th className="p-2 border border-line">Nume</th>
                          <th className="p-2 border border-line">Ce colectează</th>
                          <th className="p-2 border border-line">Tip Evidence</th>
                          <th className="p-2 border border-line">Limitări / Interpretare</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line text-muted bg-panel">
                        <tr><td className="p-2 border font-bold">DNS</td><td className="p-2 border">A, AAAA, CNAME, MX</td><td className="p-2 border">Supporting</td><td className="p-2 border">Poate fi doar un proxy/edge.</td></tr>
                        <tr><td className="p-2 border font-bold">RDAP / RIPEstat</td><td className="p-2 border">RIR Allocation, entități</td><td className="p-2 border">Supporting pt RIR Holder</td><td className="p-2 border">Informații macro, pot fi învechite.</td></tr>
                        <tr><td className="p-2 border font-bold">BGP (PeeringDB)</td><td className="p-2 border">ASN Origin, rute</td><td className="p-2 border">Supporting pt Network Op</td><td className="p-2 border">Diferă de proprietar la Cloud/Sublease.</td></tr>
                        <tr><td className="p-2 border font-bold">RPKI</td><td className="p-2 border">ROA validity</td><td className="p-2 border">Supporting / Contradiction</td><td className="p-2 border">Nu confirmă clientul final.</td></tr>
                        <tr><td className="p-2 border font-bold">Certificate Transparency</td><td className="p-2 border">Istoric certificate TLS</td><td className="p-2 border">Supporting</td><td className="p-2 border">Arată intenția, dar nu confirmă serverul curent.</td></tr>
                        <tr><td className="p-2 border font-bold">TLS / SNI</td><td className="p-2 border">Certificate active SAN</td><td className="p-2 border">Supporting puternic origin</td><td className="p-2 border">Și WAF-urile dețin certificate valide.</td></tr>
                        <tr><td className="p-2 border font-bold">HTTP</td><td className="p-2 border">Headere, status, HTML title</td><td className="p-2 border">Supporting / Contradiction</td><td className="p-2 border">Răspunsurile pot fi alterate. Timeout e Neutral.</td></tr>
                        <tr><td className="p-2 border font-bold">Reverse DNS (PTR)</td><td className="p-2 border">Nume invers asociat IP</td><td className="p-2 border">Supporting</td><td className="p-2 border">Adesea generic sau neconfigurat.</td></tr>
                        <tr><td className="p-2 border font-bold">Nmap / Ports</td><td className="p-2 border">Porturi 80/443 deschise</td><td className="p-2 border">Supporting</td><td className="p-2 border">Firewall-ul blochează scanarea.</td></tr>
                        <tr><td className="p-2 border font-bold">MX, SPF, DKIM, DMARC</td><td className="p-2 border">Politică e-mail, rute poștale</td><td className="p-2 border">Supporting Email Provider</td><td className="p-2 border">Irelevant pentru Web Origin.</td></tr>
                        <tr><td className="p-2 border font-bold">GeoIP</td><td className="p-2 border">Locație geografică macro</td><td className="p-2 border">Estimated Location</td><td className="p-2 border">Date aproximative bazate pe rutare BGP.</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            </div>

            {/* 6. EVIDENCE MODEL */}
            <div id="evidence-model" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><BookOpen className="text-cyanx" size={18} /> 6. EVIDENCE MODEL</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <p className="mb-4">O Evidence este o observație tehnică produsă de o anumită sursă (ex. Direct DNS Record). Aceasta susține ipoteza că IP-ul este asociat domeniului, dar nu demonstrează singură că IP-ul este origin server. Fiecare Evidence conține:</p>
                  <ul className="space-y-2 bg-panel p-4 rounded border border-line">
                    <li><strong className="text-ink">SOURCE:</strong> Sursa observației (ex. DNS, TLS, BGP, RDAP, CT).</li>
                    <li><strong className="text-ink">FAMILY:</strong> Categoria tehnică (ex. DNS, TLS, HTTP, BGP/ASN, Reverse DNS, Email).</li>
                    <li><strong className="text-ink">TYPE:</strong> SUPPORTING / CONTRADICTION / NEUTRAL.</li>
                    <li><strong className="text-ink">STRENGTH:</strong> STRONG / MEDIUM / WEAK.</li>
                    <li><strong className="text-ink">OBSERVED DATA:</strong> Datele efectiv observate (ex. antetul exact).</li>
                    <li><strong className="text-ink">RELATION:</strong> Relația susținută (direct web origin, CDN/WAF edge, email infrastructure).</li>
                  </ul>
                </div>
              </details>
            </div>

            {/* 7. SUPPORTING / CONTRADICTION / NEUTRAL */}
            <div id="tipuri" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><CheckCircle className="text-cyanx" size={18} /> 7. SUPPORTING / CONTRADICTION / NEUTRAL</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-panel border border-greenx/30 p-3 rounded">
                      <h4 className="font-bold text-greenx mb-2">SUPPORTING</h4>
                      <p className="text-xs mb-2">Evidence care susține ipoteza analizată.</p>
                      <ul className="text-xs space-y-1 text-ink/80">
                        <li>Direct DNS Record</li>
                        <li>TLS SNI + Certificate Match</li>
                        <li>Reverse DNS Match</li>
                        <li>RPKI VALID</li>
                        <li>Direct MX Record / SPF</li>
                      </ul>
                    </div>
                    <div className="bg-panel border border-redx/30 p-3 rounded">
                      <h4 className="font-bold text-redx mb-2">CONTRADICTION</h4>
                      <p className="text-xs mb-2">Evidence care contrazice ipoteza.</p>
                      <ul className="text-xs space-y-1 text-ink/80">
                        <li>WAF/CDN HTTP Header</li>
                        <li>CDN / Proxy ASN</li>
                        <li>MX-only IP</li>
                        <li>TLS mismatch</li>
                      </ul>
                    </div>
                    <div className="bg-panel border border-line p-3 rounded">
                      <h4 className="font-bold text-muted mb-2">NEUTRAL</h4>
                      <p className="text-xs mb-2">Observație care nu confirmă și nici nu infirmă direct ipoteza.</p>
                      <ul className="text-xs space-y-1 text-ink/80">
                        <li>HTTP Timeout / Refusal</li>
                      </ul>
                    </div>
                  </div>
                  <div className="bg-panel p-3 border-l-4 border-amber-500 rounded text-xs">
                    <strong>Important:</strong> NEUTRAL nu înseamnă SUPPORTING. NEUTRAL nu înseamnă CONTRADICTION. Un timeout HTTP nu înseamnă automat "IP-ul nu este origin". Poate însemna firewall, rate limiting, sau blocare. Nu penaliza automat o candidată pentru Evidence NEUTRAL. ("Absence of evidence is not evidence of absence".)
                  </div>
                </div>
              </details>
            </div>

            {/* 8-9. STRENGTH, CONFIDENCE, INDICATOR */}
            <div id="strength" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><Shield className="text-cyanx" size={18} /> 8. STRENGTH VS CONFIDENCE & 9. INDICATOR INTERN</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <p className="mb-4"><strong>STRENGTH</strong> (STRONG, MEDIUM, WEAK) reprezintă cât de puternică este o Evidence <em>individuală</em>. <strong>CONFIDENCE</strong> (HIGH, MEDIUM, LOW) reprezintă nivelul de încredere în <em>concluzia agregată</em> pentru candidate.</p>
                  
                  <div className="bg-panel p-4 rounded border border-line mb-4">
                    <p className="mb-2"><strong>Modelul actual de CONFIDENCE:</strong></p>
                    <ul className="space-y-1">
                      <li><strong className="text-blue-500">HIGH CONFIDENCE:</strong> Evidence puternică și suficient de independentă.</li>
                      <li><strong className="text-blue-400">MEDIUM CONFIDENCE:</strong> Evidence relevantă, dar există limitări sau lipsesc confirmări directe.</li>
                      <li><strong className="text-blue-300">LOW CONFIDENCE:</strong> Evidence insuficientă, indirectă sau contradictorie.</li>
                    </ul>
                  </div>

                  <div className="bg-panel p-4 rounded border-l-4 border-l-cyanx" id="indicator">
                    <p><strong>Indicatorul Numeric Intern (ex. 65/100):</strong> Este folosit pentru evaluarea și compararea candidatelor (ranking). <strong>Nu reprezintă o probabilitate statistică (nu înseamnă 65%).</strong> Nu trebuie prezentat ca o certitudine matematică. Confidence este clasificarea semantică, indicatorul este strict secundar.</p>
                  </div>
                </div>
              </details>
            </div>

            {/* 10. WEB CLASSES */}
            <div id="web-classes" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><Server className="text-cyanx" size={18} /> 10. WEB ORIGIN CLASSIFICATIONS</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <div className="space-y-3">
                    <div className="bg-panel p-3 rounded border border-line"><strong className="text-cyanx">direct web origin:</strong> IP-ul are Evidence directă suficient de puternică pentru a fi considerat origin.</div>
                    <div className="bg-panel p-3 rounded border border-line"><strong className="text-cyanx">probable origin:</strong> Există Evidence relevantă pentru origin, dar lipsesc anumite confirmări directe.</div>
                    <div className="bg-panel p-3 rounded border border-line"><strong className="text-cyanx">possible origin:</strong> IP-ul este plauzibil, dar Evidence este insuficientă pentru o atribuire puternică.</div>
                    <div className="bg-panel p-3 rounded border border-line" id="shared"><strong className="text-cyanx">shared hosting:</strong> IP-ul poate servi domeniul, dar infrastructura este partajată și atribuirea exclusivă nu este justificată.</div>
                    <div className="bg-panel p-3 rounded border border-line" id="cdn"><strong className="text-cyanx">CDN/WAF edge:</strong> Evidence indică faptul că IP-ul este un edge/proxy și nu origin-ul principal.</div>
                    <div className="bg-panel p-3 rounded border border-line border-l-4 border-l-redx" id="email-only"><strong className="text-redx">email-only:</strong> IP-ul este asociat infrastructurii Email și nu trebuie tratat ca Web Origin candidate.</div>
                    <div className="bg-panel p-3 rounded border border-line border-l-4 border-l-amber-500"><strong className="text-amber-500">INCONCLUSIVE:</strong> Există două sau mai multe Web Candidates care rămân plauzibile și nu pot fi diferențiate suficient prin Evidence.</div>
                  </div>
                </div>
              </details>
            </div>

            {/* 11. INCONCLUSIVE */}
            <div id="inconclusive" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line border-l-4 border-l-amber-500">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2 text-amber-500"><AlertTriangle size={18} /> 11. CE ÎNSEAMNĂ INCONCLUSIVE</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <p className="mb-2"><strong>INCONCLUSIVE NU înseamnă:</strong> scan failed, no data, candidate invalid, sau engine broken.</p>
                  <p className="mb-2"><strong>INCONCLUSIVE înseamnă:</strong> Sistemul a găsit mai multe Web Candidates plauzibile, iar Evidence disponibile nu permit alegerea responsabilă a unuia singur.</p>
                  
                  <div className="bg-panel p-3 rounded border border-line font-mono text-xs mb-2">
                    #1 13.248.169.48 | HIGH CONFIDENCE | direct web origin<br/>
                    #1 76.223.54.146 | HIGH CONFIDENCE | direct web origin
                  </div>
                  <p>Dacă Evidence este echivalentă, rezultatul general devine INCONCLUSIVE. Operatorul NU trebuie să aleagă arbitrar unul dintre ele, ci trebuie să trateze ambele IP-uri drept candidate valide.</p>
                </div>
              </details>
            </div>

            {/* 15. EMAIL PROVIDER INFERRED */}
            <div id="email-inferred" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><Mail className="text-cyanx" size={18} /> 15. CUM INTERPRETEZI EMAIL PROVIDER INFERRED</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <div className="bg-panel p-3 rounded border border-line font-mono text-xs mb-3">
                    Email Provider: RoEduNet<br/>
                    Status: INFERRED FROM BGP
                  </div>
                  <p className="mb-2"><strong>Explicație:</strong> Sistemul observă că Mail IP-ul este anunțat de ASN-ul asociat RoEduNet. Din acest motiv, RoEduNet este folosit ca inferență pentru Email Provider. Acest lucru NU este echivalent cu o confirmare directă că organizația respectivă operează efectiv aplicația de email.</p>
                  <p>Operatorul trebuie să citească INFERRED ca <em>"dedus din infrastructura observată"</em> și nu <em>"confirmat direct"</em>. Nu transforma INFERRED în CONFIRMED.</p>
                </div>
              </details>
            </div>

            {/* 16. RIR VS BGP */}
            <div id="rir-bgp" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><Network className="text-cyanx" size={18} /> 16. RIR VS BGP VS NETWORK VS HOSTING</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <ul className="list-disc pl-5 space-y-2 mb-4">
                    <li><strong className="text-ink">RIR Allocation:</strong> cine este asociat cu resursa IP în registry.</li>
                    <li><strong className="text-ink">BGP Origin:</strong> cine anunță prefixul în routing.</li>
                    <li><strong className="text-ink">Network Operator:</strong> cine operează rețeaua.</li>
                    <li><strong className="text-ink">Hosting Provider:</strong> cine oferă infrastructura de hosting.</li>
                    <li><strong className="text-ink">Application Operator:</strong> cine operează aplicația/serviciul.</li>
                    <li><strong className="text-ink">Probable Customer:</strong> entitatea asociată pe baza Evidence disponibile.</li>
                  </ul>
                  <div className="bg-panel p-3 rounded border border-line border-l-4 border-l-amber-500">
                    <strong className="text-amber-500">NU presupune:</strong> RIR = Hosting Provider, BGP = Hosting Provider, BGP = Application Operator, Hosting Provider = Customer. Acestea sunt relații diferite.
                  </div>
                </div>
              </details>
            </div>

            {/* 18-19. UNKNOWN */}
            <div id="unknown" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><HelpCircle className="text-cyanx" size={18} /> 18. UNKNOWN & 19. CE NU ESTE STABILIT</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <p className="mb-2">UNKNOWN (ex. Hosting Provider: UNKNOWN) <strong>NU înseamnă:</strong> că entitatea nu există, că sistemul nu a găsit IP-ul, că rezultatul este greșit sau că scanarea a eșuat.</p>
                  <p className="mb-4 font-bold text-ink">UNKNOWN înseamnă: Nu există suficiente Evidence pentru o atribuire responsabilă. Este preferabil să afișăm UNKNOWN decât să inventăm o atribuire.</p>
                  
                  <h4 className="font-bold text-cyanx mb-2 mt-4">Secțiunea "CE NU ESTE STABILIT?"</h4>
                  <p>Această secțiune este la fel de importantă ca "Ce am identificat?". Ex. Hosting Provider UNKNOWN motiv: ASN-ul nu este suficient pentru identificarea hosting providerului. Operatorul trebuie să interpreteze această zonă ca pe o listă de limite ale investigației.</p>
                </div>
              </details>
            </div>

            {/* 20. CUM SE CITEȘTE CARDUL */}
            <div id="cum-citesti-card" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><BookOpen className="text-cyanx" size={18} /> 20. CUM SE CITEȘTE ORIGIN CANDIDATE CARD</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <ol className="list-decimal pl-5 space-y-1 mb-4">
                    <li>Rank</li>
                    <li>IP</li>
                    <li>Classification</li>
                    <li>Confidence</li>
                    <li>Indicator intern</li>
                    <li>DE CE?</li>
                    <li>Dovezi care susțin concluzia</li>
                    <li>Dovezi contradictorii</li>
                    <li>Dovezi lipsă</li>
                  </ol>
                  <p>Pentru <strong>"DE CE?"</strong>: Aceasta este <em>explicația agregată</em> generată de Evidence Engine. Nu este o Evidence separată, ci este interpretarea logică a Evidence-urilor disponibile.</p>
                </div>
              </details>
            </div>

            {/* 21. EVIDENCE MATRIX */}
            <div id="matrix" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><BookOpen className="text-cyanx" size={18} /> 21. EVIDENCE MATRIX</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <ul className="list-disc pl-5 space-y-2 mb-4">
                    <li><strong>STATUS:</strong> SUPPORTING / CONTRADICTION / NEUTRAL.</li>
                    <li><strong>STRENGTH:</strong> STRONG / MEDIUM / WEAK.</li>
                    <li><strong>SOURCE:</strong> Web / MX / DNS / TLS etc.</li>
                    <li><strong>RELATION:</strong> Ce relație este testată.</li>
                    <li><strong>EVIDENCE:</strong> Numele dovezii.</li>
                    <li><strong>OBSERVED DATA:</strong> Datele brute relevante (ex. payload HTTP). Tooltip-ul/Expand-ul conține ObservedData complet pentru a nu distruge layout-ul.</li>
                  </ul>
                  <p>Operatorul trebuie să înceapă de la STATUS + STRENGTH + EVIDENCE și apoi să consulte OBSERVED DATA pentru verificare.</p>
                </div>
              </details>
            </div>

            {/* 29-30. RANKING */}
            <div id="ranking" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><Server className="text-cyanx" size={18} /> 29. CANDIDATE RANKING & 30. ORDINEA</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted space-y-4">
                  <p>Candidatele sunt comparate în aceeași categorie. Web Candidates concurează între ele. Email-only Candidates NU concurează cu Web Candidates.</p>
                  <p><strong>Rank #1</strong> înseamnă că acea candidată are cea mai bună poziție relativă în setul relevant. <strong>Rank #2</strong> nu înseamnă automat "greșit", ci că există o altă candidată cu Evidence mai puternică.</p>
                  
                  <div className="bg-panel p-3 border border-line rounded">
                    <h4 className="font-bold text-ink mb-2">Cum trebuie interpretată ordinea</h4>
                    <ul className="list-decimal pl-5 text-xs space-y-1">
                      <li>Este candidată Web sau Email?</li>
                      <li>Ce classification și confidence are?</li>
                      <li>Care sunt supporting / contradiction Evidence?</li>
                      <li>Există CDN/WAF? Există MX conflict? Există RIR/BGP mismatch?</li>
                      <li>Există o altă candidată cu Evidence echivalentă?</li>
                    </ul>
                    <p className="mt-2 text-xs font-bold text-amber-500">Nu trebuie aleasă o candidată doar pentru că este primul IP văzut în DNS.</p>
                  </div>
                </div>
              </details>
            </div>

            {/* 31-44. SCENARII */}
            <div id="scenarii" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><AlertTriangle className="text-cyanx" size={18} /> SCENARII SPECIALE (31-44)</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <div className="space-y-4">
                    <div className="bg-panel p-3 rounded border border-line">
                      <strong className="text-cyanx block">31. DIRECT DNS + TLS MATCH</strong>
                      Set puternic de Evidence. Dacă nu există CDN/WAF, e direct/probable Web Origin.
                    </div>
                    <div className="bg-panel p-3 rounded border border-line">
                      <strong className="text-cyanx block">32. DNS + TLS MATCH + CLOUDFLARE</strong>
                      DNS și TLS confirmă asocierea. CDN Evidence arată edge. Concluzie: CDN/WAF edge. Nu e origin server.
                    </div>
                    <div className="bg-panel p-3 rounded border border-line">
                      <strong className="text-cyanx block">33. DNS + HTTP TIMEOUT</strong>
                      Timeout e NEUTRAL. Nu înseamnă IP invalid. Verifică TLS, BGP, etc.
                    </div>
                    <div className="bg-panel p-3 rounded border border-line">
                      <strong className="text-cyanx block">34. MX IP = WEB IP</strong>
                      Același IP e Web și Email (A și MX). E posibil să servească ambele. Nu e automat eroare.
                    </div>
                    <div className="bg-panel p-3 rounded border border-line border-l-4 border-l-redx">
                      <strong className="text-redx block">35. MX-ONLY IP</strong>
                      IP apare în MX fără Evidence Web. Clasificare: email-only. Apare doar în Email Infrastructure, NU primește Web rank.
                    </div>
                    <div className="bg-panel p-3 rounded border border-line border-l-4 border-l-amber-500">
                      <strong className="text-amber-500 block">36. MULTIPLE WEB IPs (echivalente)</strong>
                      Evidence echivalentă pt IP A și IP B (ambele HIGH CONFIDENCE). Rezultat: INCONCLUSIVE. Nu alege arbitrar.
                    </div>
                    <div className="bg-panel p-3 rounded border border-line">
                      <strong className="text-cyanx block">39. RIR ≠ BGP</strong>
                      Mismatch (ex RIR Org A, BGP Org B). Nu identifica automat A sau B ca Hosting. Caută Evidence suplimentară sau marchează UNKNOWN.
                    </div>
                    <div className="bg-panel p-3 rounded border border-line">
                      <strong className="text-cyanx block">40. HIGH CONFIDENCE DAR CONTRADICTION</strong>
                      Confidence nu înseamnă "zero contradicții". Înseamnă că Evidence agregată oferă un nivel ridicat de încredere, deși pot exista unele date minore în conflict.
                    </div>
                  </div>
                </div>
              </details>
            </div>

            {/* 45-46. WORKFLOW */}
            <div id="cum-citesti-raport" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line border-l-4 border-l-cyanx" open>
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><BookOpen className="text-cyanx" size={18} /> 45. CUM CITEȘTE OPERATORUL RAPORTUL (Workflow)</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Citește <strong>REZULTAT SCANARE</strong>.</li>
                    <li>Vezi dacă Web Origin este un singur IP sau MULTIPLE CANDIDATES.</li>
                    <li>Verifică <strong>Classification</strong> și <strong>Confidence</strong>.</li>
                    <li>Verifică <strong>Email Infrastructure</strong> separat.</li>
                    <li>Citește <strong>Lanț Infrastructură</strong>.</li>
                    <li>Citește <strong>Candidates</strong> și secțiunea <strong>"DE CE?"</strong></li>
                    <li>Compară Supporting și Contradiction Evidence.</li>
                    <li>Verifică Dovezi Lipsă și secțiunea <strong>"Ce nu este stabilit?"</strong></li>
                    <li>Consultă <strong>Evidence Matrix</strong> pentru detaliile brute.</li>
                  </ol>
                </div>
              </details>
            </div>

            {/* 47. LIMITARI */}
            <div id="limitari" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line border-l-4 border-l-amber-500">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2 text-amber-500"><Info size={18} /> 47. LIMITĂRILE SISTEMULUI</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <p className="mb-2">Platforma nu poate vedea automat infrastructura privată din spatele firewall-urilor, reverse proxy, CDN, WAF, load balancer sau NAT. Unele informații pot fi inferate, dar nu confirmate.</p>
                  <p className="font-bold text-ink">Internet infrastructure attribution este o problemă de corelare și inferență. Nu trebuie prezentată ca o dovadă juridică absolută.</p>
                </div>
              </details>
            </div>

            {/* 48. PRINCIPII */}
            <div id="principii" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line" open>
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><CheckCircle className="text-cyanx" size={18} /> 48. REGULI RAPIDE PENTRU OPERATOR</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-sm text-muted">
                  <div className="grid md:grid-cols-2 gap-x-6 gap-y-2">
                    <div>1. DNS match ≠ automat origin.</div>
                    <div>2. TLS match ≠ automat origin.</div>
                    <div>3. CDN/WAF Evidence transformă aparența în edge.</div>
                    <div>4. MX-only ≠ Web Origin.</div>
                    <div>5. UNKNOWN ≠ eroare.</div>
                    <div>6. INFERRED ≠ CONFIRMED.</div>
                    <div>7. RIR ≠ Hosting Provider.</div>
                    <div>8. BGP Organization ≠ automat Customer.</div>
                    <div>9. NEUTRAL ≠ CONTRADICTION.</div>
                    <div>10. HIGH CONFIDENCE ≠ certitudine matematică.</div>
                    <div>11. INCONCLUSIVE ≠ scan failed.</div>
                    <div>12. Web și Email trebuie analizate separat.</div>
                  </div>
                </div>
              </details>
            </div>

            {/* 49. GLOSAR */}
            <div id="glosar" className="scroll-mt-20">
              <details className="group bg-panel2 rounded-lg border border-line">
                <summary className="font-bold text-lg p-4 cursor-pointer hover:bg-panel3 transition-colors flex items-center justify-between select-none">
                  <span className="flex items-center gap-2"><BookOpen className="text-cyanx" size={18} /> 49. GLOSAR</span>
                  <span className="text-muted group-open:rotate-180 transition-transform"><ChevronDown size={18}/></span>
                </summary>
                <div className="p-4 pt-0 border-t border-line mt-2 text-xs text-muted">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div><strong className="text-cyanx">ASN:</strong> Autonomous System Number, rutare BGP.</div>
                    <div><strong className="text-cyanx">BGP:</strong> Border Gateway Protocol, anunță IP-uri.</div>
                    <div><strong className="text-cyanx">RIR/RDAP:</strong> Registry (RIPE, ARIN) / protocol extragere.</div>
                    <div><strong className="text-cyanx">RPKI:</strong> Validează criptografic rutele BGP (ROA).</div>
                    <div><strong className="text-cyanx">PTR:</strong> Reverse DNS, rezolvă IP → Hostname.</div>
                    <div><strong className="text-cyanx">SPF/DKIM/DMARC:</strong> Politici poștale de securitate.</div>
                    <div><strong className="text-cyanx">SNI/SAN:</strong> Extensii TLS pentru a valida domeniul.</div>
                  </div>
                </div>
              </details>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
