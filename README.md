# Domain ASM OSINT

Domain ASM OSINT is an automated Attack Surface Management and Open Source Intelligence (OSINT) engine designed to reveal the hidden infrastructure behind Web Application Firewalls (WAFs) and Content Delivery Networks (CDNs). 

The primary goal of this tool is to provide a unified mapping of a target domain's supply chain, identifying precisely which organizations host their assets and extracting the **Origin IP addresses** bypassing front-facing proxies.

## Features & Capabilities

- **Deep DNS & Subdomain Discovery**: Employs passive collection via Certificate Transparency (crt.sh) logs combined with targeted active DNS bruteforcing.
- **Origin IP Detection**: Collects historical and subdomain-linked IP addresses. Filters out known proxy/CDN autonomous systems (e.g., Cloudflare, Akamai, Fastly) to reveal real backend IP addresses (Origin Leaks).
- **Network Profiling**: Maps IPs to their corresponding AS (Autonomous System), geographical location, and organization owners to build a reliable infrastructure supply chain.
- **Active Probing**: Scans for open ports using lightweight Nmap profiles, fingerprints HTTP services, and validates TLS certificates for Subject Alternative Names (SANs).
- **Wappalyzer Web Tech**: Uses a robust fingerprinting engine to identify CMSs, JS frameworks, web servers, and operating systems from response headers and HTML structure.
- **Concurrent Execution**: Backend operations are highly optimized for speed using `Promise.all` patterns, running network requests, IP resolutions, and passive intelligence gathering concurrently.

## Architecture & Data Flow

1. **Data Gathering (Colectare)**: 
   Triggered via the unified scanner engine (`src/server/scanner.ts`), data is collected from Whois/RDAP, DNS queries, and passive log scraping (crt.sh). Subdomains are iteratively mapped to IPv4/IPv6 addresses.
2. **Interpretation (Interconectare)**: 
   Extracted data is deduplicated. IPs and domains are cross-referenced with BGP/ASN lookup tables to determine ownership. If MX records point to Microsoft while NS records point to AWS, the supply chain matrix dynamically adapts.
3. **The Verdict (Origin IP)**: 
   All gathered IPs are passed through a proxy-detection sieve. Any IP not associated with a known CDN/WAF provider is flagged as a true "Origin Server," exposing the real hosting location of the target.

## Setup & Running

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Build**:
   ```bash
   npm run build
   ```
3. **Run Production Server**:
   ```bash
   npm run start:prod
   ```
   The dashboard will be available by default on port `5105`.

## Stack
- **Frontend**: React (Vite) + Tailwind CSS (Strict minimal UI).
- **Backend**: Node.js + Express + Zod (Validation).
- **Tooling**: Built-in OS-level integrations (`nmap`, `traceroute`, `dig`).
# domain_check
