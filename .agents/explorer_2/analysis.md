# Frontend Technical Analysis — domain_check

## 1. Overview & Architecture
The frontend of `domain_check` (Domain ASM OSINT) is a single-page web application built with React 19, Vite, and Tailwind CSS. The entire frontend code is concentrated in a single entry file (`src/client/main.tsx`) with accompanying styles in `src/client/styles.css` and configuration in `tailwind.config.ts` and `vite.config.ts`.

### Technology Stack
- **Framework**: React `^19.2.8` + React-DOM `^19.2.8`
- **Build Tool / Bundler**: Vite `^7.0.0` with `@vitejs/plugin-react` `^5.0.0`
- **Language**: TypeScript `^5.7.0` (`strict: true` in `tsconfig.json`)
- **Styling**: Tailwind CSS `^3.4.17` with custom color palette in `tailwind.config.ts`
- **Icons**: `lucide-react` `^0.468.0`
- **Client Storage**: IndexedDB (Database: `domain_asm_db`, Object store: `scans`) & `localStorage` (`app_password`)
- **Routing**: None (no `react-router-dom` dependency; UI states are managed via local React state)
- **State Management**: Standard React `useState` & `useEffect` hooks

---

## 2. File Organization & Component Structure

```
domain_check/
├── index.html                  # Main HTML entry point mounting #root to /src/client/main.tsx
├── vite.config.ts              # Vite dev/build config (Port 5173, proxy /api -> http://localhost:5105)
├── tailwind.config.ts          # Custom dark-theme color definitions
├── postcss.config.cjs          # PostCSS configuration for Tailwind CSS
├── src/
│   ├── client/
│   │   ├── main.tsx            # Single-file component architecture (29 KB, 636 lines)
│   │   └── styles.css          # Custom utility classes & Tailwind imports
│   └── shared/
│       └── types.ts            # Shared TypeScript interfaces between client & server
```

### Component Breakdown inside `src/client/main.tsx`

| Component | Lines | Purpose & Responsibility |
|-----------|-------|--------------------------|
| `api` object | 7–39 | API helper object encapsulation `fetch` requests with `x-app-password` header for `/api/auth/verify`, `/api/scans` (POST), and `/api/scans/:id` (GET). |
| `defaultOptions` | 41–63 | Default scanner configuration flags (nmap, traceroute, dnsBruteforce, etc.). |
| `dbStorage` object | 66–107 | Native IndexedDB wrapper (`domain_asm_db` / `scans`) providing `saveScan`, `getScans`, `getScan(id)`. |
| `StatCard` | 109–117 | Renders summary metric cards with customizable color tones (cyan, green, amber, red). |
| `Toggle` | 119–126 | Checkbox UI control component for scan settings. |
| `Section` | 128–138 | Container wrapper with header icon and title for grouping data views. |
| `DataTable` | 140–159 | Dynamic key-value grid/table component with fixed headers and scrollable content cells. |
| `Results` | 162–304 | Comprehensive scan results presentation view (6 sections: Domain Info, DNS Records, IP Info, Infrastructure & Host Analysis, HTTP/TLS, Network & Ports). |
| `Documentation` | 306–404 | Secondary view component explaining scan modes, general settings, and active controls. **Currently orphan/unrendered in `App`**. |
| `Login` | 406–460 | Authentication form component checking password via `/api/auth/verify`. |
| `App` | 462–634 | Root component managing auth state, active target, scan job lifecycle, polling loop (1.2s), IndexedDB history sidebar, and layout. |

---

## 3. Existing Domain Results View & UI Displays

Currently, the `Results` component (lines 162–304) presents scan data in 6 main sections:

1. **Stat Cards Grid** (lines 167–171):
   - Subdomains count
   - IP Profiles count
   - Open Ports count
2. **Registration Data ("Date Inregistrare")** (lines 173–181):
   - Domain, Registrar, Registrant/Owner (`registrantOrg`), Privacy status, Nameservers.
3. **DNS Records ("Inregistrari DNS")** (lines 183–192):
   - A, AAAA, NS, MX (priority + exchange), TXT (first 6), DNSSEC status.
4. **IP Information ("Informatii IP")** (lines 194–205):
   - IP address, ASN (e.g. `AS13335`), Organization, RIR Allocation, Announced prefix, Geo (city, country), Physical facilities count, Provider type (`cloud`, `cdn`, `isp`, `enterprise`, `unknown`).
5. **Real Host / Base Infrastructure Analysis ("Analiza Infrastructurii de Baza")** (lines 207–265):
   - **Narrative box** (lines 208–240): Textual explanation identifying whether the domain is behind a CDN/Proxy (Cloudflare, Akamai, Fastly, Incapsula) and if an origin IP leak was detected.
   - **Allocation Chain Table** (lines 241–252): Surface IP allocation, BGP owner, RDAP allocation, sublease signals.
   - **Origin Candidates Table** (lines 254–264): Origin IP candidate, real provider, confidence ("HIGH" / "MEDIUM" / "LOW"), leak source.
6. **HTTP & TLS ("HTTP TLS")** (lines 267–278):
   - URL, HTTP Status, Technologies, Error Signature, Favicon hash, Sensitive files, Virtual hosts, QUIC support.
7. **Network & Ports ("Retea si Porturi")** (lines 280–300):
   - Traceroute hops table (hop, host, IP, RTT ms, location).
   - Open ports table (host, port, state, service, version, source).

---

## 4. Requirement Gaps & Needed UI Refactorings

Comparing current frontend capabilities with user specifications in `ORIGINAL_REQUEST.md`:

| Requirement Area | Current Frontend Implementation | Target State Required (R1–R6) |
|------------------|---------------------------------|-------------------------------|
| **Score System** | Categorical strings (`"high"`, `"medium"`, `"low"` confidence). | **Numerical score (0-100)** with detailed breakdown per candidate and overall origin score. |
| **Evidence Breakdown** | Single string `message` per signal in `leaseSignals`. | **Explicit Supporting Evidence (+points, e.g. +30 TLS SAN, +25 HTTP match) and Contradictions (-points, e.g. -30 CDN signature)** with human-readable rationale. |
| **Ownership Separation** | Combines provider roles in `verdict` and single confidence level. | Explicit separate displays & confidences for: **Domain ownership, IP ownership, ASN ownership, Network operation, Hosting provider, Application origin, Physical infrastructure location**. Separate categorizations for **MX infrastructure** vs **Web origins**. |
| **Documentation Page** | Static `Documentation` component exists in code but is **unrendered and inaccessible**; lacks explanation of scoring rules & cross-referencing. | Secondary documentation view accessible via **Navigation / Tabs** in header explaining search/scanning methods, cross-referencing logic, and evidence scoring system. |
| **Component Architecture** | All UI elements monolithically in `src/client/main.tsx` (636 lines). | Modularize into clean component files (e.g., `src/client/components/EvidenceBreakdown.tsx`, `ScoreBadge.tsx`, `Navbar.tsx`, `DocPage.tsx`, `ResultsView.tsx`). |

---

## 5. Frontend API Contracts & Data Flow

### Backend Communication
The client communicates with the Express backend over HTTP using standard REST calls. All requests include authentication header `x-app-password`.

```
Client (Vite dev server :5173)
  └── Proxy `/api/*` ──► Backend (Express server :5105)
```

#### Endpoints
1. `POST /api/auth/verify`
   - Request Header: `x-app-password: <password>`
   - Response: `200 OK` (success) or `401 Unauthorized` / `403 Forbidden`.
2. `POST /api/scans`
   - Request Header: `x-app-password: <password>`
   - Request Body:
     ```json
     {
       "target": "example.com",
       "mode": "active-discovery",
       "options": { ... }
     }
     ```
   - Response: `ScanJob` object containing `id`, `request`, `status` ("queued" \| "running" \| "done" \| "failed"), `createdAt`, `progress` array.
3. `GET /api/scans/:id`
   - Request Header: `x-app-password: <password>`
   - Response: Updated `ScanJob` object containing `result?: ScanResult` when completed.

### Client Polling & Local Storage
- **Polling Loop**: When a scan job is running, `App` polls `GET /api/scans/:id` every 1,200 ms until `status` becomes `"done"` or `"failed"`.
- **IndexedDB Persistence**: Upon scan creation or status completion, the complete `ScanJob` is saved into IndexedDB (`domain_asm_db` -> `scans` store). On application mount, history is retrieved from IndexedDB and sorted newest-first.

---

## 6. Build, Typecheck, and Test Commands

### Commands Matrix
- **Typecheck / Linting**: `npm run typecheck` (Executes `tsc --noEmit`). Verified passing cleanly.
- **Client Dev Server**: `npm run dev:client` (Executes `vite --host 0.0.0.0`).
- **Production Build**: `npm run build` (Executes `tsc --noEmit && vite build && tsc -p tsconfig.server.json`).
- **Unit & Component Testing**: `npm run test` (Executes `vitest run`).
