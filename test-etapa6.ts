import { runScan } from "./src/server/scanner.js";

async function main() {
  console.log("Scanning edu.gov.ro with historical enrichment...");
  const result = await runScan({
    target: "edu.gov.ro",
    mode: "active-discovery",
    options: { maxHosts: 5, timeoutMs: 8000, wappalyzer: false, dirbust: false, vhostProbe: false, quicProbe: false, infrastructureTrace: true, emailHunter: false }
  }, () => {});

  for (const c of result.candidates || []) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`FULL ATTRIBUTION for ${c.ip} (${c.classification})`);
    console.log(`${"=".repeat(60)}`);
    const o = c.ownershipChain;
    console.log(`Prefix: ${o.ipPrefix.identity} (${o.ipPrefix.confidence})`);
    console.log(`RIR: ${o.rirAllocation.identity} (${o.rirAllocation.confidence})`);
    console.log(`BGP ASN: ${o.asnOperation.identity} (${o.asnOperation.confidence})`);
    console.log(`Network Op: ${o.networkOperation.identity} (${o.networkOperation.confidence}) - ${o.networkOperation.explanation}`);
    console.log(`Hosting: ${o.hostingProvider.identity} (${o.hostingProvider.confidence}) - ${o.hostingProvider.explanation}`);
    console.log(`App Operator: ${o.applicationOperator.identity} (${o.applicationOperator.confidence}) - ${o.applicationOperator.explanation}`);
    console.log(`Customer: ${o.probableCustomer.identity} (${o.probableCustomer.confidence})`);
    
    console.log(`\n--- HISTORICAL EVIDENCE ---`);
    for (const h of c.evidence.historical) {
      console.log(`  [${h.type}] ${h.title}: ${h.observedData}`);
    }
    console.log(`--- CT EVIDENCE ---`);
    for (const ct of c.evidence.ct) {
      console.log(`  [${ct.type}] ${ct.title}: ${ct.observedData.substring(0, 100)}`);
    }
    console.log(`--- INFRASTRUCTURE EVIDENCE ---`);
    for (const inf of c.evidence.infrastructure) {
      console.log(`  [${inf.type}] ${inf.title}: ${inf.observedData.substring(0, 100)}`);
    }
    console.log(`--- BGP EVIDENCE ---`);
    for (const b of c.evidence.bgp) {
      console.log(`  [${b.type}] ${b.title}: ${b.observedData}`);
    }
  }
}
main().catch(console.error);
