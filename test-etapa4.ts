import { runScan } from "./src/server/scanner.js";

async function main() {
  console.log("Scanning edu.gov.ro...");
  const result = await runScan({
    target: "edu.gov.ro",
    mode: "active-discovery",
    options: {
      maxHosts: 5,
      timeoutMs: 5000,
      wappalyzer: false,
      dirbust: false,
      vhostProbe: false,
      quicProbe: false,
      infrastructureTrace: true,
      emailHunter: true
    }
  }, () => {});

  for (const c of result.candidates || []) {
    console.log(`\n============================`);
    console.log(`NETWORK ATTRIBUTION for ${c.ip} (Classification: ${c.classification})`);
    console.log(`============================`);
    const o = c.ownershipChain;
    if (!o) {
        console.log("No ownership chain found.");
        continue;
    }

    console.log(`\nExact Prefix:\n${o.ipPrefix.identity} (Confidence: ${o.ipPrefix.confidence}) - ${o.ipPrefix.explanation}`);
    console.log(`\nRIR Allocation Holder:\n${o.rirAllocation.identity} (Confidence: ${o.rirAllocation.confidence}) - ${o.rirAllocation.explanation}`);
    console.log(`\nBGP Origin ASN Organization:\n${o.asnOperation.identity} (Confidence: ${o.asnOperation.confidence}) - ${o.asnOperation.explanation}`);
    console.log(`\nNetwork Operator:\n${o.networkOperation.identity} (Confidence: ${o.networkOperation.confidence}) - ${o.networkOperation.explanation}`);
    console.log(`\nHosting Provider:\n${o.hostingProvider.identity} (Confidence: ${o.hostingProvider.confidence}) - ${o.hostingProvider.explanation}`);
  }
}
main().catch(console.error);
