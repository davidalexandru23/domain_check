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
      emailHunter: false
    }
  }, () => {});

  for (const c of result.candidates || []) {
    console.log(`\n============================`);
    console.log(`FULL ATTRIBUTION for ${c.ip} (Classification: ${c.classification})`);
    console.log(`============================`);
    const o = c.ownershipChain;
    if (!o) { console.log("No ownership chain."); continue; }

    console.log(`\nExact Prefix: ${o.ipPrefix.identity} (Confidence: ${o.ipPrefix.confidence})`);
    console.log(`RIR Allocation Holder: ${o.rirAllocation.identity} (Confidence: ${o.rirAllocation.confidence})`);
    console.log(`BGP Origin ASN Org: ${o.asnOperation.identity} (Confidence: ${o.asnOperation.confidence})`);
    console.log(`Network Operator: ${o.networkOperation.identity} (Confidence: ${o.networkOperation.confidence}) - ${o.networkOperation.explanation}`);
    console.log(`Hosting Provider: ${o.hostingProvider.identity} (Confidence: ${o.hostingProvider.confidence}) - ${o.hostingProvider.explanation}`);
    console.log(`Application Operator: ${o.applicationOperator.identity} (Confidence: ${o.applicationOperator.confidence}) - ${o.applicationOperator.explanation}`);
    console.log(`Probable Customer: ${o.probableCustomer.identity} (Confidence: ${o.probableCustomer.confidence}) - ${o.probableCustomer.explanation}`);
  }
}
main().catch(console.error);
