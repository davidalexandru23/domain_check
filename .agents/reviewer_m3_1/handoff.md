# Review Handoff Report — Milestone M3 (Requirement R3: Active Discovery UI Force)

## 1. Observation

- **Reviewed File**: `src/client/main.tsx`
  - **`Toggle` Component Signature & Styling (Lines 105–112)**:
    ```tsx
    function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
      return (
        <label className={`flex items-center justify-between gap-3 rounded border border-line bg-panel2 px-3 py-2 text-sm text-ink transition-colors ${disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-panel3 cursor-pointer"}`}>
          <span>{label}</span>
          <input className="h-4 w-4 accent-cyanx" type="checkbox" checked={value} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        </label>
      );
    }
    ```
  - **Mode Determination (Line 420)**:
    ```tsx
    const isActiveDiscovery = mode === "active-discovery";
    ```
  - **Mode Selection Handler (Lines 520–546)**:
    ```tsx
    onChange={(event) => {
      const newMode = event.target.value as ScanMode;
      setMode(newMode);
      if (newMode === "active-discovery") {
        setOptions((prev) => ({
          ...prev,
          nmap: true,
          traceroute: true,
          smtpHandshake: true,
          dnsBruteforce: true,
          vhostProbe: true,
          httpFingerprint: true,
          tlsInspect: true,
          bannerGrab: true,
          infrastructureTrace: true,
          wappalyzer: true,
          dirbust: true,
          faviconHash: true,
          quicProbe: true,
          dnsAlterations: true,
          dnsAxfr: true,
          subdomainTakeover: true,
          jarmFingerprint: true,
          emailDorking: true,
        }));
      }
    }}
    ```
  - **Active Controls Render Loop / Toggles (Lines 566–584)**:
    All 17 active control `<Toggle>` elements pass `value={isActiveDiscovery ? true : Boolean(options.<key>)}` and `disabled={isActiveDiscovery}`:
    1. `Nmap discrete` (`options.nmap`)
    2. `Traceroute` (`options.traceroute`)
    3. `DNS bruteforce` (`options.dnsBruteforce`)
    4. `HTTP fingerprint` (`options.httpFingerprint`)
    5. `TLS inspect` (`options.tlsInspect`)
    6. `Banner grab` (`options.bannerGrab`)
    7. `Infra trace` (`options.infrastructureTrace`)
    8. `Wappalyzer Web Tech` (`options.wappalyzer`)
    9. `Dirbust (Sensitive)` (`options.dirbust`)
    10. `Favicon Hash` (`options.faviconHash`)
    11. `QUIC Probe (HTTP/3)` (`options.quicProbe`)
    12. `DNS Alterations` (`options.dnsAlterations`)
    13. `DNS AXFR` (`options.dnsAxfr`)
    14. `Subdomain Takeovers` (`options.subdomainTakeover`)
    15. `JARM Fingerprint` (`options.jarmFingerprint`)
    16. `SMTP Verify` (`options.smtpHandshake`)
    17. `Email Dorking` (`options.emailDorking`)

- **Execution Command Results**:
  1. `npm run typecheck`:
     ```
     > domain-asm-osint@1.0.0 typecheck
     > tsc --noEmit
     Exited with code 0.
     ```
  2. `npm run server:build`:
     ```
     > domain-asm-osint@1.0.0 server:build
     > tsc -p tsconfig.server.json
     Exited with code 0.
     ```
  3. `npm run build`:
     ```
     > domain-asm-osint@1.0.0 build
     > tsc --noEmit && vite build && tsc -p tsconfig.server.json
     dist/index.html                   0.40 kB
     dist/assets/index-BogL1tqH.css   11.83 kB
     dist/assets/index-BWGDybxe.js   220.95 kB
     Exited with code 0.
     ```
  4. `npm test`:
     ```
     Test Files  10 passed (10)
     Tests       67 passed (67)
     Exited with code 0.
     ```

## 2. Logic Chain

1. **Requirement R3 Alignment**: Requirement R3 specifies that selecting "active-discovery" mode in the React UI must automatically check and visually lock all active control toggles.
2. **Visual Locking & Styling**: In `src/client/main.tsx`, `Toggle` accepts `disabled?: boolean`. When `disabled` is true, the container label applies `opacity-60 cursor-not-allowed` and disables the native `<input type="checkbox" disabled={true}>`, preventing user clicks and visually indicating the locked status.
3. **Boolean Evaluation & State Integrity**: When `mode === "active-discovery"`, `isActiveDiscovery` evaluates to `true`. Passing `value={isActiveDiscovery ? true : Boolean(options.<key>)}` and `disabled={isActiveDiscovery}` to all 17 toggles guarantees that every active scanning toggle displays as checked and locked in the UI regardless of previous state. In addition, `setOptions` bulk-updates options state to `true` when switching modes, ensuring consistent payload submission to the scanner API.
4. **Code Quality & Integrity**: Code review revealed no hardcoded test outputs, dummy facades, or shortcuts. Build checks and automated tests passed with zero errors.

## 3. Caveats

No caveats. All 17 active control toggles were verified, compilation pipelines succeeded, and unit tests passed cleanly.

## 4. Conclusion & Verdict

**Verdict**: **APPROVE**

Milestone M3 (Requirement R3: Active Discovery UI Force) satisfies all functional and architectural requirements. The 17 active control toggles in `src/client/main.tsx` are correctly forced to checked and visually locked (`opacity-60 cursor-not-allowed` + `disabled={true}`) whenever `active-discovery` mode is selected.

## 5. Verification Method

To re-verify this review:

1. **Type Check**:
   ```bash
   npm run typecheck
   ```
   *Expected outcome*: Exit code 0 with no TypeScript errors.

2. **Server Compilation**:
   ```bash
   npm run server:build
   ```
   *Expected outcome*: Exit code 0, cleanly compiling server code.

3. **Full Build**:
   ```bash
   npm run build
   ```
   *Expected outcome*: Exit code 0, bundling client via Vite and compiling server.

4. **Test Suite Execution**:
   ```bash
   npm test
   ```
   *Expected outcome*: 10 test files passed (67 tests total).

5. **Static Code Inspection**:
   Inspect `src/client/main.tsx` lines 105–112 and 566–584 to confirm `disabled` handling and `isActiveDiscovery` bindings across all 17 toggles.
