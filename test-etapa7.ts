import { runScan } from "./src/server/scanner.js";

async function main() {
  console.log("Scanning edu.gov.ro for Etapa 7 Email Attribution...");
  const result = await runScan({
    target: "edu.gov.ro",
    mode: "active-discovery",
    options: { maxHosts: 5, timeoutMs: 15000, wappalyzer: false, dirbust: false, vhostProbe: false, quicProbe: false, infrastructureTrace: false, emailHunter: false }
  }, () => {});

  const mxData = result.mxInfrastructure;
  if (!mxData || !mxData.candidates || mxData.candidates.length === 0) {
    console.log("No MX candidates found.");
    return;
  }

  for (const c of mxData.candidates) {
    console.log(`\n============================================================`);
    console.log(`EMAIL INFRASTRUCTURE`);
    console.log(`============================================================`);
    console.log(`MX: ${c.hostname} (Priority: ${c.priority})`);
    console.log(`IP: ${c.ip}`);
    console.log(`RIR Allocation: ${c.ownershipChain.rirAllocation.identity} (${c.ownershipChain.rirAllocation.confidence})`);
    console.log(`BGP Origin: ${c.ownershipChain.asnOperation.identity} (${c.ownershipChain.asnOperation.confidence})`);
    console.log(`Network Operator: ${c.ownershipChain.networkOperation.identity} (${c.ownershipChain.networkOperation.confidence}) - ${c.ownershipChain.networkOperation.explanation}`);
    console.log(`Email Provider: ${c.ownershipChain.emailProvider.identity} (${c.ownershipChain.emailProvider.confidence}) - ${c.ownershipChain.emailProvider.explanation}`);
    console.log(`Estimated Location: ${c.ownershipChain.estimatedLocation.identity} (${c.ownershipChain.estimatedLocation.confidence})`);
    console.log(`\nConfidence: ${c.ownershipChain.emailProvider.confidence}`);
    
    console.log(`\nSupporting Evidence:`);
    const supporting = Object.values(c.evidence).flat().filter(e => e.type === "supporting");
    for (const e of supporting) {
      console.log(`- [${e.family}] ${e.title}: ${e.observedData.substring(0, 80)}`);
    }

    console.log(`\nContradicting Evidence:`);
    const contradicting = Object.values(c.evidence).flat().filter(e => e.type === "contradiction");
    for (const e of contradicting) {
      console.log(`- [${e.family}] ${e.title}: ${e.observedData.substring(0, 80)}`);
    }
  }
}
main().catch(console.error);
