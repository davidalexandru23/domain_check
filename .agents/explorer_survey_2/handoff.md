# Requirement R2: Subleased Infrastructure Fix — Handoff Report

## 1. Observation

Direct execution traces, codebase analysis, and network responses were collected for target `edu.gov.ro` (resolving to IP `193.230.5.163`).

### 1.1 Live Execution Trace Output (Verbatim Errors & Results)
Running compiled server modules (`node -e "..."`) against `edu.gov.ro` produced the following key outputs:

```json
{
  "infrastructure": {
    "roleProviders": [
      { "role": "dns", "name": "roedu.net", "confidence": "medium" },
      { "role": "dns", "name": "edu.ro", "confidence": "medium" },
      { "role": "email", "name": "edu.ro", "confidence": "medium" },
      {
        "role": "hosting",
        "name": "Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti",
        "confidence": "high"
      }
    ],
    "ipChains": [
      {
        "ip": "193.230.5.163",
        "providerRole": "hosting",
        "allocation": {
          "rir": "whois.ripe.net",
          "networkName": "ICI-NET",
          "allocationOwner": "4.0 AS3233-MNT individual ORG-RA19-RIPE",
          "announcedPrefix": "193.230.4.0 - 193.230.5.255",
          "originAsn": "3233",
          "originOrg": "Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti"
        },
        "leaseSignals": [
          {
            "kind": "subleased",
            "message": "RIR allocation owner differs from ASN owner, which can indicate delegated, reseller or subleased network space.",
            "confidence": "medium"
          }
        ]
      }
    ],
    "verdict": "Likely subleased network",
    "warnings": [
      "RIPE Stat failed for 193.230.5.163: origin?.origin?.replace is not a function"
    ]
  }
}
```

### 1.2 Underlying Network Data Verification
- `dig edu.gov.ro A +short`: `193.230.5.163`
- `ip-api.com` for `193.230.5.163`:
  - `"as": "AS3233 Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti"`
  - `"isp": "RNC"`
  - `"org": ""`
- `RDAP` (`https://rdap.org/ip/193.230.5.163` -> `https://rdap.db.ripe.net/ip/193.230.5.163`):
  - `"name": "ICI-NET"`
  - `"handle": "193.230.4.0 - 193.230.5.255"`
  - `"remarks": [{"description": ["Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti", "ICIPRO", "Bd. Maresal Averescu 8-10, Sector 1, Bucuresti"]}]`
  - `"entities": [ { "handle": "AS3233-MNT", "roles": ["registrant"], "vcardArray": ["vcard", [["version",{},"text","4.0"], ["fn",{},"text","AS3233-MNT"], ["kind",{},"text","individual"], ["org",{},"text","ORG-RA19-RIPE"]]] } ]`
- `RIPE Stat` (`https://stat.ripe.net/data/routing-status/data.json?resource=193.230.5.163`):
  - `"data": { "origins": [{"origin": 3233, "route_objects": ["RIPE"]}] }`

### 1.3 Specific Code Locations Identified

1. **`src/server/modules/infrastructure.ts:105`**:
   `originAsn: origin?.origin?.replace(/^AS/i, "")`
   `origin?.origin` is a `number` (`3233`), not a string. `.replace()` throws `TypeError`.

2. **`src/server/modules/ip.ts:41-53`**:
   `vcardText` maps `entry[3]` for *all* entries in `vcardArray[1]`, joining `"4.0"`, `"AS3233-MNT"`, `"individual"`, `"ORG-RA19-RIPE"` into `"4.0 AS3233-MNT individual ORG-RA19-RIPE"`.
   `rdapOrg` sets `ip.rirAllocationOwner` to this junk string.

3. **`src/server/modules/infrastructure.ts:153-155`**:
   `if (ip.rirAllocationOwner && ip.asn.org && !orgSimilar(ip.rirAllocationOwner, ip.asn.org))`
   Compares junk string `"4.0 AS3233-MNT..."` with `"Institutul National... - ICI Bucuresti"`. `orgSimilar` returns `false`, falsely generating a `subleased` signal.

4. **`src/server/modules/infrastructure.ts:145-163`**:
   `leaseSignalsFor` only checks `["cloud", "cdn"]` for direct hosting providers:
   `if (domainOwner && ip.asn.org && !orgSimilar(domainOwner, ip.asn.org) && ["cloud", "cdn"].includes(ip.providerType))`
   Because ICI Bucuresti's providerType is `"enterprise"`, this rule fails to match when `domainOwner` is set or when target domain is hosted on an enterprise/ISP infrastructure.

5. **`src/server/modules/domain.ts:75-125`**:
   ROTLD WHOIS port 43 does not return registrant info for `.ro` domains (`registrantOrg` remains `undefined`).
   When `domainOwner` is `undefined`, `leaseSignalsFor` skips domain-level owner comparison, falling through to `kind: "unknown"` with verdict `"Unknown, insufficient public evidence"`.

---

## 2. Logic Chain

1. **RIPE Stat Crash**:
   - `fetchRipeForIp` calls `status.data?.origins?.[0]`.
   - In RIPE Stat API JSON, `origin` is integer `3233`.
   - `origin.origin.replace(/^AS/i, "")` fails with `TypeError: origin?.origin?.replace is not a function`.
   - The error is caught, adding a warning to `infrastructure.warnings`, and leaving `originAsn` unpopulated from RIPE Stat.

2. **Corrupted Allocation Owner (`4.0 AS3233-MNT...`)**:
   - `rdapOrg` calls `vcardText(holder)` on RDAP entity `AS3233-MNT`.
   - `vcardText` iterates over all array items in `vcardArray[1]` and extracts index 3.
   - It concatenates `"4.0"` (version), `"AS3233-MNT"` (fn), `"individual"` (kind), and `"ORG-RA19-RIPE"` (org) into `"4.0 AS3233-MNT individual ORG-RA19-RIPE"`.
   - This sets `ip.rirAllocationOwner` to a corrupted string instead of `"Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti"` or `"ICI-NET"`.

3. **False Subleased Signal**:
   - `leaseSignalsFor` checks if `ip.rirAllocationOwner` differs from `ip.asn.org`.
   - Because `rirAllocationOwner` is `"4.0 AS3233-MNT individual ORG-RA19-RIPE"` and `asn.org` is `"Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti"`, `orgSimilar` returns `false`.
   - A `subleased` signal is added, setting verdict to `"Likely subleased network"`, attributing allocation owner to `"4.0 AS3233-MNT..."`.

4. **Fall-through to 'Unknown'**:
   - For `.ro` domains like `edu.gov.ro`, WHOIS port 43 conceals registrant info (`domainOwner` is `undefined`).
   - `leaseSignalsFor` only considers direct provider signals if `ip.providerType` is `"cloud"` or `"cdn"`.
   - `classifyProvider` classifies ICI Bucuresti as `"enterprise"`.
   - Thus, no signals match. `leaseSignalsFor` falls through to `kind: "unknown"`, returning verdict `"Unknown, insufficient public evidence"`.

5. **Inference Resolution Strategy**:
   - Fix `originAsn` string conversion (`String(origin.origin)`).
   - Fix `rdapOrg` vcard property parsing to extract real `org` / `fn` or `remarks` descriptions.
   - Expand `leaseSignalsFor` to recognize enterprise/ISP infrastructure providers (AS3233 / ICI Bucuresti) as hosting/infrastructure providers for target domains.
   - Fall back to target domain string when `domainOwner` is `undefined`.

---

## 3. Caveats

- **Network Availability**: Public APIs (RIPE Stat, RDAP, PeeringDB, IP-API) require outbound internet connectivity. Offline execution will rely on cached or fallback heuristic signals.
- **ROTLD WHOIS Privacy**: ROTLD port 43 WHOIS policy explicitly conceals registrant organization details. Domain-level ownership for `.ro` domains relies on domain name context, DNS records, or subdomains rather than RDAP domain WHOIS.

---

## 4. Conclusion

The regression in infrastructure owner inference for subleased/hosted targets like `edu.gov.ro` is fully analyzed and understood. Fixing 5 specific code locations in `infrastructure.ts`, `ip.ts`, and `utils.ts` will resolve the crash, fix the allocation owner name string (`ICI Bucuresti` / `ICI-NET`), accurately attribute infrastructure hosting to ICI (AS3233), and eliminate the 'unknown' / false-subleased fallback.

### Exact Proposed Implementation Changes

#### A. Fix `src/server/modules/infrastructure.ts` Line 105
```typescript
// Before:
originAsn: origin?.origin?.replace(/^AS/i, ""),

// After:
originAsn: origin?.origin != null ? String(origin.origin).replace(/^AS/i, "") : undefined,
```

#### B. Fix `src/server/modules/ip.ts` `rdapOrg` parsing (Lines 41-54)
```typescript
// Before:
const vcardText = (entity: { vcardArray?: unknown[] }) => {
  const entries = Array.isArray(entity.vcardArray?.[1]) ? (entity.vcardArray?.[1] as unknown[]) : [];
  return entries
    .map((entry) => (Array.isArray(entry) ? entry[3] : undefined))
    .filter((value): value is string => typeof value === "string")
    .join(" ");
};

const rdapOrg = (rdap: RdapIpResponse) => {
  const holder = rdap.entities?.find((entity) => entity.roles?.some((role) => ["registrant", "administrative", "technical"].includes(role)));
  const text = holder ? vcardText(holder) : "";
  return text || rdap.name || rdap.handle;
};

// After:
const vcardProp = (entity: { vcardArray?: unknown[] }, propName: string): string | undefined => {
  const entries = Array.isArray(entity.vcardArray?.[1]) ? (entity.vcardArray?.[1] as unknown[]) : [];
  for (const entry of entries) {
    if (Array.isArray(entry) && entry[0] === propName && typeof entry[3] === "string") {
      return entry[3];
    }
  }
  return undefined;
};

const rdapOrg = (rdap: RdapIpResponse) => {
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

#### C. Fix `leaseSignalsFor` in `src/server/modules/infrastructure.ts` (Lines 145-163)
```typescript
// Before:
const leaseSignalsFor = (ip: IpProfile, domainOwner?: string): NetworkLeaseSignal[] => {
  const signals: NetworkLeaseSignal[] = [];
  if (domainOwner && orgSimilar(domainOwner, ip.asn.org)) {
    signals.push({ kind: "in-house", message: "Domain owner name is similar to ASN owner.", confidence: "high", evidence: [sourceHeuristic] });
  }
  if (domainOwner && ip.asn.org && !orgSimilar(domainOwner, ip.asn.org) && ["cloud", "cdn"].includes(ip.providerType)) {
    signals.push({ kind: ip.providerType === "cdn" ? "cdn-proxy" : "direct-provider", message: `${ip.asn.org} appears to provide ${ip.providerType} infrastructure for the domain owner.`, confidence: "high", evidence: ip.sources });
  }
  if (ip.rirAllocationOwner && ip.asn.org && !orgSimilar(ip.rirAllocationOwner, ip.asn.org)) {
    signals.push({ kind: "subleased", message: "RIR allocation owner differs from ASN owner, which can indicate delegated, reseller or subleased network space.", confidence: "medium", evidence: ip.sources });
  }
...

// After:
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
      signals.push({ kind: "direct-provider", message: `${ipOwner} (AS${ip.asn.asn ?? 'unknown'}) operates the hosting infrastructure for the target domain.`, confidence: "high", evidence: ip.sources });
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

---

## 5. Verification Method

To independently verify after implementing the proposed fixes:

1. **Run test suite**:
   ```bash
   npm test
   ```
2. **Re-build server**:
   ```bash
   npm run server:build
   ```
3. **Execute test scan against `edu.gov.ro`**:
   ```bash
   node -e "
   import('./dist-server/server/modules/domain.js').then(async (d) => {
     import('./dist-server/server/modules/dns.js').then(async (dns) => {
       import('./dist-server/server/modules/ip.js').then(async (ip) => {
         import('./dist-server/server/modules/infrastructure.js').then(async (inf) => {
           const dom = await d.getDomainProfile('edu.gov.ro', 10000);
           const dnsRes = await dns.getDnsDeepScan('edu.gov.ro');
           const ips = [await ip.getIpProfile(dnsRes.a[0], 10000)];
           const chain = await inf.buildInfrastructureSupplyChain(dom.profile.registrantOrg, dnsRes, ips, [], true, 10000);
           console.log('Verdict:', chain.infrastructure.verdict);
           console.log('Role Providers:', chain.infrastructure.roleProviders);
           console.log('Allocation Owner:', chain.infrastructure.ipChains[0].allocation.allocationOwner);
           console.log('Origin Org:', chain.infrastructure.ipChains[0].allocation.originOrg);
           console.log('Warnings:', chain.infrastructure.warnings);
         });
       });
     });
   });
   "
   ```
4. **Expected Output Verification Criteria**:
   - `Warnings` must NOT contain `RIPE Stat failed for 193.230.5.163: origin?.origin?.replace is not a function`.
   - `Allocation Owner` must display `"Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti"` (or `"ICI-NET"`), NOT `"4.0 AS3233-MNT individual ORG-RA19-RIPE"`.
   - `Origin Org` must display `"Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti"`.
   - `Role Providers` must include `hosting`: `"Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti"`.
