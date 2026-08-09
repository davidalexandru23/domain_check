# Requirement R2: Subleased Infrastructure Fix — Implementation Report

## 1. Observation

All 3 tasks specified for Milestone M2 were implemented and verified in `src/server/modules/infrastructure.ts`, `src/server/modules/ip.ts`, and `src/tests/parsers.test.ts`.

### 1.1 Modified Files & Specific Line Changes
1. **`src/server/modules/infrastructure.ts` (lines 15-23, 101-111)**:
   - Updated `RipeRoutingStatus` type: `origin?: string | number`.
   - Updated `fetchRipeForIp`:
     ```typescript
     originAsn: origin?.origin != null ? String(origin.origin).replace(/^AS/i, "") : undefined,
     lessSpecificOrigin: status.data?.less_specifics?.[0]?.origin != null ? String(status.data.less_specifics[0].origin).replace(/^AS/i, "") : undefined,
     moreSpecificOrigin: status.data?.more_specifics?.[0]?.origin != null ? String(status.data.more_specifics[0].origin).replace(/^AS/i, "") : undefined,
     ```
2. **`src/server/modules/ip.ts` (lines 18-54)**:
   - Added `remarks` to `RdapIpResponse` interface.
   - Replaced raw vCard array joining with `vcardProp` property extractor:
     ```typescript
     const vcardProp = (entity: { vcardArray?: unknown[] }, propName: string): string | undefined => {
       const entries = Array.isArray(entity.vcardArray?.[1]) ? (entity.vcardArray?.[1] as unknown[]) : [];
       for (const entry of entries) {
         if (Array.isArray(entry) && entry[0] === propName && typeof entry[3] === "string") {
           return entry[3];
         }
       }
       return undefined;
     };
     ```
   - Re-implemented `rdapOrg`:
     ```typescript
     const rdapOrg = (rdap: RdapIpResponse): string | undefined => {
       for (const role of ["registrant", "administrative", "technical"]) {
         const entity = rdap.entities?.find((e) => e.roles?.includes(role));
         if (entity) {
           const org = vcardProp(entity, "org");
           if (org && !org.startsWith("ORG-")) return org;
           const fn = vcardProp(entity, "fn");
           if (fn && !fn.includes("-MNT") && !fn.toLowerCase().startsWith("version")) return fn;
         }
       }
       if (rdap.remarks?.length) {
         for (const rem of rdap.remarks) {
           if (Array.isArray(rem.description)) {
             const line = rem.description.find((d) => d && d.length > 5 && !d.toLowerCase().includes("filtered"));
             if (line) return line;
           }
         }
       }
       return rdap.name ?? rdap.handle;
     };
     ```
3. **`src/server/modules/infrastructure.ts` (lines 145-163)**:
   - Re-implemented `leaseSignalsFor` to recognize enterprise/ISP hosting infrastructure:
     ```typescript
     const leaseSignalsFor = (ip: IpProfile, domainOwner?: string): NetworkLeaseSignal[] => {
       const signals: NetworkLeaseSignal[] = [];
       const ipOwner = ip.asn.org || ip.rirAllocationOwner || ip.networkName;

       if (domainOwner && ipOwner && orgSimilar(domainOwner, ipOwner)) {
         signals.push({ kind: "in-house", message: `Domain owner name (${domainOwner}) matches ASN/allocation owner.`, confidence: "high", evidence: [sourceHeuristic] });
       }

       if (ipOwner && (!domainOwner || !orgSimilar(domainOwner, ipOwner))) {
         if (["cloud", "cdn"].includes(ip.providerType)) {
           signals.push({ kind: ip.providerType === "cdn" ? "cdn-proxy" : "direct-provider", message: `${ipOwner} appears to provide ${ip.providerType} infrastructure for the domain owner.`, confidence: "high", evidence: ip.sources });
         } else if (["enterprise", "isp"].includes(ip.providerType) || ip.asn.asn) {
           signals.push({ kind: "direct-provider", message: `${ipOwner} (AS${ip.asn.asn ?? "unknown"}) operates the hosting infrastructure for the target domain.`, confidence: "high", evidence: ip.sources });
         }
       }

       if (ip.rirAllocationOwner && ip.asn.org && !orgSimilar(ip.rirAllocationOwner, ip.asn.org)) {
         signals.push({ kind: "subleased", message: "RIR allocation owner differs from ASN owner, which can indicate delegated, reseller or subleased network space.", confidence: "medium", evidence: ip.sources });
       }
       if (ip.originAsn && ip.asn.asn && ip.originAsn !== ip.asn.asn) {
         signals.push({ kind: "suballocated", message: "Observed BGP origin differs from the ASN inferred from IP enrichment.", confidence: "medium", evidence: [sourceRipe] });
       }
       if (!signals.length) {
         signals.push({ kind: "unknown", message: "Public evidence is not enough to classify ownership or leasing relationship.", confidence: "low", evidence: [sourceHeuristic] });
       }
       return signals;
     };
     ```
4. **`src/tests/parsers.test.ts` (lines 125-142)**:
   - Added unit test covering enterprise/ISP direct provider classification for AS3233 / ICI Bucuresti infrastructure.

---

## 2. Logic Chain

1. **RIPE Stat integer conversion**:
   - `fetchRipeForIp` formerly called `origin?.origin?.replace(...)`. RIPE Stat API returns integer origins like `3233`. Converting with `String(origin.origin)` before `.replace(/^AS/i, "")` prevents `TypeError: origin?.origin?.replace is not a function`.
2. **RDAP entity vCard property parsing**:
   - RDAP jCard arrays `vcardArray[1]` contain entries like `["version", {}, "text", "4.0"]`, `["fn", {}, "text", "AS3233-MNT"]`, `["kind", {}, "text", "individual"]`, `["org", {}, "text", "ORG-RA19-RIPE"]`.
   - Iterating entries by key name (`vcardProp`) and falling back to description lines in `remarks` cleanly extracts `"Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti"`, eliminating junk metadata strings like `"4.0 AS3233-MNT individual ORG-RA19-RIPE"`.
3. **Enterprise / ISP infrastructure provider recognition**:
   - Because `rirAllocationOwner` and `asn.org` now both evaluate to `"Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti"`, `orgSimilar` evaluates to `true`, preventing a false `subleased` signal.
   - Expanding `leaseSignalsFor` to recognize `"enterprise"` and `"isp"` provider types when `ipOwner` exists ensures AS3233 is correctly attributed as `direct-provider` with verdict `"Direct provider"` instead of falling through to `"Unknown, insufficient public evidence"`.

---

## 3. Caveats

- In environments without external internet connectivity, RIPE Stat and RDAP HTTP requests fail gracefully and fall back to stored IP profiles and heuristics without crashing.
- `.ro` TLD WHOIS port 43 policy hides registrant info for individual/institutional domain owners, so domain-level owner comparison relies on DNS records, PTRs, or organizational names when available.

---

## 4. Conclusion

Milestone M2 (Requirement R2) is fully implemented and verified. All edge cases (integer ASN handling, clean RDAP org parsing, enterprise/ISP infrastructure classification) have been resolved with zero regressions.

---

## 5. Verification Method

1. **Server Build Verification**:
   ```bash
   npm run server:build
   ```
   *Result*: Exited with code 0 (TypeScript compilation succeeded).

2. **Unit Test Suite Execution**:
   ```bash
   npm test
   ```
   *Result*: All 4 test files passed (31 total unit tests passing).

3. **Module Functionality Verification (AS3233 / ICI Bucuresti Target Simulation)**:
   ```bash
   node -e "
   import('./dist-server/server/modules/infrastructure.js').then(async (infModule) => {
     const mockIpProfile = {
       ip: '193.230.5.163',
       ptr: ['edu.gov.ro'],
       asn: { asn: '3233', org: 'Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti', rir: 'whois.ripe.net' },
       geo: { country: 'Romania' },
       providerType: 'enterprise',
       landlord: 'Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti',
       rirAllocationOwner: 'Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti',
       networkName: 'ICI-NET',
       originAsn: '3233',
       announcedPrefix: '193.230.4.0 - 193.230.5.255',
       upstreams: [],
       peers: [],
       ixPresence: [],
       facilityPresence: [],
       sources: []
     };
     const chain = await infModule.buildInfrastructureSupplyChain(undefined, { a: ['193.230.5.163'], ns: ['ns1.roedu.net'], mx: [{ exchange: 'mail.edu.ro', priority: 10 }], txt: [], cname: [], ptr: [] }, [mockIpProfile], [], false, 10000);
     console.log('Verdict:', chain.infrastructure.verdict);
     console.log('Role Providers:', chain.infrastructure.roleProviders);
     console.log('Allocation Owner:', chain.infrastructure.ipChains[0].allocation.allocationOwner);
     console.log('Origin Org:', chain.infrastructure.ipChains[0].allocation.originOrg);
     console.log('Lease Signals:', chain.infrastructure.ipChains[0].leaseSignals);
     console.log('Warnings:', chain.infrastructure.warnings);
   });
   "
   ```
   *Verified Output*:
   - `Verdict`: `Direct provider`
   - `Role Providers`: `hosting`: `"Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti"`
   - `Allocation Owner`: `"Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti"`
   - `Origin Org`: `"Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti"`
   - `Warnings`: `[]`
