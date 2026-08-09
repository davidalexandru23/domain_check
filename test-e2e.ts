import { runScan } from "./src/server/scanner.js";
(async () => {
    try {
        const result = await runScan({
            target: "edu.gov.ro",
            mode: "controlled-active",
            options: {
                wappalyzer: true,
                dirbust: true,
                faviconHash: true,
                vhostProbe: true,
                quicProbe: true,
                dnsAlterations: true,
                dnsAxfr: true,
                subdomainTakeover: true,
                jarmFingerprint: true,
                smtpHandshake: true,
                maxHosts: 2
            }
        }, (p) => console.log(`[${p.percent}%] ${p.stage}: ${p.message}`));
        console.log("Risks Found:", result.risks.map(r => r.title));
        console.log("Subdomains:", result.subdomains);
        if (result.http.length > 0) {
            console.log("HTTP Features (first host):", {
                tech: result.http[0].technologies,
                favicon: result.http[0].faviconHash,
                vhost: result.http[0].vhostResponses,
                quic: result.http[0].quicSupported,
                sensitive: result.http[0].sensitiveFiles
            });
        }
        if (result.ports.length > 0) {
            const tlsPort = result.ports.find(p => p.version?.includes("TLS-Hash"));
            console.log("TLS Hash found:", !!tlsPort);
        }
    } catch (e) {
        console.error(e);
    }
})();
