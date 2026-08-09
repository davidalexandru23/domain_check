import { runCommand } from "./src/server/utils.js";

(async () => {
  const domain = "edu.gov.ro";
  const timeoutMs = 5000;
  let parts = domain.split('.');
  while (parts.length > 1) {
    const candidate = parts.join('.');
    console.log("Trying", candidate);
    const { stdout } = await runCommand("whois", [candidate], timeoutMs);
    const lower = stdout.toLowerCase();
    
    const isExactMatch = lower.includes(`domain name: ${candidate}`) || lower.includes(`domain: ${candidate}`);
    if (!isExactMatch && !lower.includes("registrar:")) {
      console.log("Skipping", candidate);
      parts.shift();
      continue;
    }
    
    console.log("Found valid whois for", candidate);
    break;
  }
})();
