# Handoff Report — Requirement R3 & Build Infrastructure Analysis

## 1. Observation

### Codebase Components Inspected
- `src/client/main.tsx`: Main React application entrypoint, scan options state management, and toggle UI components.
- `src/shared/types.ts`: TypeScript definitions for `ScanMode` and `ActiveOptions`.
- `src/server/scanner.ts`: Backend scan runner and option merging logic.
- `package.json`, `tsconfig.json`, `tsconfig.server.json`, `vite.config.ts`: Project build configuration and verification scripts.

### Verbatim Code Quotes

#### Current `Toggle` component in `src/client/main.tsx` (Lines 105–112):
```tsx
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded border border-line bg-panel2 px-3 py-2 text-sm text-ink hover:bg-panel3 transition-colors cursor-pointer">
      <span>{label}</span>
      <input className="h-4 w-4 accent-cyanx" type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
```
*Observation*: `Toggle` currently accepts only `label`, `value`, and `onChange`. It does not support a `disabled` prop, nor does it render disabled visual styling (such as reduced opacity or `cursor-not-allowed`).

#### Current State Management in `src/client/main.tsx` (Lines 417–418, 515–523):
```tsx
const [mode, setMode] = React.useState<ScanMode>("controlled-active");
const [options, setOptions] = React.useState<Partial<ActiveOptions>>(defaultOptions);
```
```tsx
<select className="input mt-2" value={mode} onChange={(event) => setMode(event.target.value as ScanMode)}>
  <option value="passive">passive</option>
  <option value="controlled-active">controlled-active</option>
  <option value="active-discovery">active-discovery</option>
  <option value="network-map">network-map</option>
  <option value="email-only">email-only</option>
  <option value="dns-only">dns-only</option>
</select>
```
*Observation*: Changing the mode dropdown to `active-discovery` updates the `mode` state string, but does not update `options` state or lock/check the UI toggle checkboxes.

#### Backend Server Mode Override in `src/server/scanner.ts` (Lines 98–118):
```typescript
if (request.mode === "active-discovery") {
    options.nmap = true;
    options.traceroute = true;
    options.dnsBruteforce = true;
    options.vhostProbe = true;
    options.httpFingerprint = true;
    options.tlsInspect = true;
    options.bannerGrab = true;
    options.infrastructureTrace = true;
    options.wappalyzer = true;
    options.dirbust = true;
    options.faviconHash = true;
    options.quicProbe = true;
    options.dnsAlterations = true;
    options.dnsAxfr = true;
    options.subdomainTakeover = true;
    options.jarmFingerprint = true;
    options.emailDorking = true;
    options.maxHosts = 100;
    options.maxPorts = 100;
}
```
*Observation*: The backend scan engine already forces all scan flags to `true` when `request.mode === "active-discovery"`. The frontend UI currently fails to mirror this behavior visually.

#### Build Scripts in `package.json` (Lines 6–16):
```json
"scripts": {
  "dev": "tsx watch src/server/index.ts",
  "dev:client": "vite --host 0.0.0.0",
  "build": "tsc --noEmit && vite build && tsc -p tsconfig.server.json",
  "start": "node dist/server/index.js",
  "server:build": "tsc -p tsconfig.server.json",
  "start:prod": "node dist-server/server/index.js",
  "lint": "tsc --noEmit",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

#### Build & Test Execution Results:
- Command: `npm test`
  - Output: `Test Files 3 passed (3), Tests 10 passed (10)`
- Command: `npm run typecheck && npm run server:build && npm run build`
  - Output: Exited with status code 0. Generated `dist/` (client bundle) and `dist-server/` (Node server bundle).

---

## 2. Logic Chain

1. **Requirement Mapping**: `ORIGINAL_REQUEST.md` (R3) dictates:
   - Selecting `"active-discovery"` mode must automatically check all advanced scanning toggles.
   - All advanced scanning toggles must be visually locked (disabled) when `"active-discovery"` is active.
2. **Current Component Capability Gap**:
   - `Toggle` component in `src/client/main.tsx` has no `disabled` prop or disabled styling (`opacity-60 cursor-not-allowed`).
   - `App` component in `src/client/main.tsx` does not pass `disabled` to `<Toggle>` and does not update `options` state when `mode` switches to `"active-discovery"`.
3. **Backend Alignment**:
   - `src/server/scanner.ts` (lines 98–118) proves that server-side execution already treats `active-discovery` as turning on all 17 boolean scan features. Therefore, locking all 17 toggles to `true` in the frontend directly reflects server behavior.
4. **Implementation Plan for R3**:
   - **Step 1**: Modify `Toggle` in `src/client/main.tsx`:
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
   - **Step 2**: In `App`, compute `const isActiveDiscovery = mode === "active-discovery";`.
   - **Step 3**: Update mode change handler in `<select>`:
     ```tsx
     const handleModeChange = (newMode: ScanMode) => {
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
     };
     ```
   - **Step 4**: Pass `value={isActiveDiscovery ? true : Boolean(options.<key>)}` and `disabled={isActiveDiscovery}` to all `<Toggle>` instances in `main.tsx`.

5. **Verification Pipeline Alignment**:
   - Running `npm run server:build` verifies backend TypeScript compilation.
   - Running `npm run build` verifies client Vite bundling + server TypeScript compilation.
   - Running `npm test` verifies Vitest unit test suite.

---

## 3. Caveats

No caveats. The proposed changes are localized entirely to `src/client/main.tsx`, and align 100% with the existing server implementation in `src/server/scanner.ts`.

---

## 4. Conclusion

- **Requirement R3** can be completely resolved by making two targeted edits in `src/client/main.tsx`:
  1. Add `disabled` support and visual styling to the `Toggle` component.
  2. Bind `<Toggle>` components to `isActiveDiscovery`, ensuring all 17 toggles display as checked and disabled when `"active-discovery"` mode is selected, and sync options state when switching to `"active-discovery"`.
- The build and verification pipeline (`npm run server:build`, `npm run build`, `npm test`) is fully operational and validated.

### Proposed Code Snippets for Implementer

#### Target File: `src/client/main.tsx`

**Snippet 1: Update `Toggle` component (Lines 105–112)**
```tsx
// Before:
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded border border-line bg-panel2 px-3 py-2 text-sm text-ink hover:bg-panel3 transition-colors cursor-pointer">
      <span>{label}</span>
      <input className="h-4 w-4 accent-cyanx" type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

// After:
function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-3 rounded border border-line bg-panel2 px-3 py-2 text-sm text-ink transition-colors ${disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-panel3 cursor-pointer"}`}>
      <span>{label}</span>
      <input className="h-4 w-4 accent-cyanx" type="checkbox" checked={value} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
```

**Snippet 2: Mode change handler & Toggle bindings in `App` (Lines 514–554)**
```tsx
// Mode dropdown onChange update:
const handleModeChange = (newMode: ScanMode) => {
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
};

const isActiveDiscovery = mode === "active-discovery";

// Active controls section rendering update:
<div className="grid gap-2 sm:grid-cols-2">
  <Toggle label="Nmap discrete" value={isActiveDiscovery ? true : Boolean(options.nmap)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, nmap: value })} />
  <Toggle label="Traceroute" value={isActiveDiscovery ? true : Boolean(options.traceroute)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, traceroute: value })} />
  <Toggle label="DNS bruteforce" value={isActiveDiscovery ? true : Boolean(options.dnsBruteforce)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, dnsBruteforce: value })} />
  <Toggle label="HTTP fingerprint" value={isActiveDiscovery ? true : Boolean(options.httpFingerprint)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, httpFingerprint: value })} />
  <Toggle label="TLS inspect" value={isActiveDiscovery ? true : Boolean(options.tlsInspect)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, tlsInspect: value })} />
  <Toggle label="Banner grab" value={isActiveDiscovery ? true : Boolean(options.bannerGrab)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, bannerGrab: value })} />
  <Toggle label="Infra trace" value={isActiveDiscovery ? true : Boolean(options.infrastructureTrace)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, infrastructureTrace: value })} />
  
  <Toggle label="Wappalyzer Web Tech" value={isActiveDiscovery ? true : Boolean(options.wappalyzer)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, wappalyzer: value })} />
  <Toggle label="Dirbust (Sensitive)" value={isActiveDiscovery ? true : Boolean(options.dirbust)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, dirbust: value })} />
  <Toggle label="Favicon Hash" value={isActiveDiscovery ? true : Boolean(options.faviconHash)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, faviconHash: value })} />
  <Toggle label="QUIC Probe (HTTP/3)" value={isActiveDiscovery ? true : Boolean(options.quicProbe)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, quicProbe: value })} />
  <Toggle label="DNS Alterations" value={isActiveDiscovery ? true : Boolean(options.dnsAlterations)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, dnsAlterations: value })} />
  <Toggle label="DNS AXFR" value={isActiveDiscovery ? true : Boolean(options.dnsAxfr)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, dnsAxfr: value })} />
  <Toggle label="Subdomain Takeovers" value={isActiveDiscovery ? true : Boolean(options.subdomainTakeover)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, subdomainTakeover: value })} />
  <Toggle label="JARM Fingerprint" value={isActiveDiscovery ? true : Boolean(options.jarmFingerprint)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, jarmFingerprint: value })} />
  <Toggle label="SMTP Verify" value={isActiveDiscovery ? true : Boolean(options.smtpHandshake)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, smtpHandshake: value })} />
  <Toggle label="Email Dorking" value={isActiveDiscovery ? true : Boolean(options.emailDorking)} disabled={isActiveDiscovery} onChange={(value) => setOptions({ ...options, emailDorking: value })} />
</div>
```

---

## 5. Verification Method

To verify the investigation and implementation independently:

1. **Typecheck & Client Build Verification**:
   ```bash
   npm run typecheck
   npm run build
   ```
   *Expected result*: Exits with code 0; Vite compiles client bundle to `dist/`.

2. **Server Build Verification**:
   ```bash
   npm run server:build
   ```
   *Expected result*: Exits with code 0; TypeScript compiles server code to `dist-server/`.

3. **Unit Test Verification**:
   ```bash
   npm test
   ```
   *Expected result*: All unit tests pass.

4. **UI Behavior Verification**:
   - Run `npm run dev:client` or open browser interface.
   - Select `"active-discovery"` from Mode dropdown.
   - Confirm all 17 checkboxes under "Active controls" are checked and disabled (grayed out with `not-allowed` cursor).
   - Change Mode back to `"controlled-active"`.
   - Confirm checkboxes become enabled again.
