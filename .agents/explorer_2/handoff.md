# Handoff Report — Frontend Codebase Survey (explorer_2)

## 1. Observation

### Codebase Architecture & File Locations
- **Entry Point**: `index.html` (lines 9–10) mounts `/src/client/main.tsx` into `<div id="root"></div>`.
- **Main Client File**: `src/client/main.tsx` (636 lines, 28,995 bytes) contains all React components, client API utilities, IndexedDB storage wrapper, and application root.
- **Styling**: `src/client/styles.css` (67 lines) imports Tailwind CSS directives (`@tailwind base`, `@tailwind components`, `@tailwind utilities`) and defines custom CSS rules (`.card`, `.section`, `.input`, `.btn`, `.empty`). `tailwind.config.ts` (22 lines) configures custom dark-theme colors (`panel`, `panel2`, `ink`, `muted`, `line`, `cyanx`, `greenx`, `amberx`, `redx`).
- **Dependencies (`package.json`)**: React 19.2.8, React-DOM 19.2.8, Vite 7.0.0 (`@vitejs/plugin-react` 5.0.0), `lucide-react` 0.468.0, `zod` 3.25.0, `tailwindcss` 3.4.17, `vitest` 2.1.0. No `react-router-dom` or external state management library is installed.

### UI Components in `src/client/main.tsx`
- `api` object (lines 7–39): Manages API calls (`POST /api/auth/verify`, `POST /api/scans`, `GET /api/scans/:id`) sending `x-app-password` header.
- `dbStorage` object (lines 66–107): Native IndexedDB wrapper operating on database `domain_asm_db` and object store `scans`.
- `StatCard` (lines 109–117): Metric summary card.
- `Toggle` (lines 119–126): Checkbox input component.
- `Section` (lines 128–138): Titled container section with icon header.
- `DataTable` (lines 140–159): Dynamic tabular data rendering component.
- `Results` (lines 162–304): Main scan results view rendering 6 sub-sections (Registration Data, DNS Records, IP Info, Real Host / Infrastructure Analysis, HTTP TLS, Network & Ports).
- `Documentation` (lines 306–404): Secondary documentation component explaining scan modes and parameters. **Unrendered in `App` root component**.
- `Login` (lines 406–460): Password login view verifying against `/api/auth/verify`.
- `App` (lines 462–634): Top-level component holding state (`target`, `options`, `job`, `history`, `isAuthenticated`), 1.2s polling interval for active scan jobs, IndexedDB history sidebar, and header controls.

### Build & Test Commands Executed
- `npm run typecheck` (`tsc --noEmit`): Executed cleanly with exit code 0.
- `npm run test` (`vitest run`): Executed 1 test file (`src/tests/parsers.test.ts`). Output showed 5 passed tests, 1 failure (`scan options > clamps active limits`, expected 99 to be 30).

---

## 2. Logic Chain

1. **Frontend Architecture Assessment**:
   - Observation: `src/client/main.tsx` holds all client components in a single file; `package.json` contains React 19 + Vite 7 + Tailwind CSS 3 without router or state libraries.
   - Inference: The frontend is a light single-page application with monolithic layout. All state transitions (auth, target input, scan polling, history selection) are managed via standard React `useState` / `useEffect` and browser IndexedDB storage.

2. **UI Capabilities & Gap Analysis vs Requirements**:
   - Observation in `ORIGINAL_REQUEST.md` (R1, R2, R5, R6): Requirements call for an Evidence & Contradiction Engine with explicit score (0–100), separate confidence metrics for ownership concepts (domain, IP, ASN, provider, origin, physical location), separate MX infrastructure breakdown, and a secondary documentation page detailing search/scoring methodology.
   - Observation in `src/client/main.tsx`:
     - Current score system is categorical strings (`"high"`, `"medium"`, `"low"` confidence) rather than a 0–100 numeric score (R1/R5).
     - Infrastructure section (lines 207–265) displays a textual narrative and basic tables, but lacks explicit breakdown of supporting evidence (+points) vs contradictions (-points).
     - Ownership separation conflates provider roles into single verdicts without multi-dimensional confidence scores (R2).
     - `Documentation` component (lines 306–404) is present in `main.tsx` but is unrendered/inaccessible due to lack of header navigation or page routing (R6).

3. **Backend Integration & Data Contracts**:
   - Observation: `vite.config.ts` proxies `/api` requests to `http://localhost:5105`. `api` helper sends `x-app-password` header. Backend returned objects follow `ScanJob` and `ScanResult` types defined in `src/shared/types.ts`.
   - Inference: Frontend updates for evidence breakdown and scoring (0-100) will require extended or refactored types in `src/shared/types.ts` (e.g. `EvidenceItem`, `ScoreBreakdown`, `OwnershipConfidences`) that match both server output and client rendering.

---

## 3. Caveats

1. **Backend Implementation Details**:
   - This survey focused strictly on the frontend codebase (`src/client/main.tsx`, `styles.css`, `tailwind.config.ts`, `types.ts`). Backend scoring algorithms (`src/server/...`) were not deeply analyzed in this step.
2. **Component Separation**:
   - Currently all client components reside in a single file (`src/client/main.tsx`). Any refactoring will need to decide whether to split into multiple files under `src/client/components/` or keep the existing structure while updating `main.tsx`.
3. **Existing Vitest Failure**:
   - Running `npm run test` produced 1 failure in `src/tests/parsers.test.ts` related to `mergeOptions` default clamping limits in `src/server/scanner.ts`.

---

## 4. Conclusion

The frontend codebase is built with React 19, Vite 7, TypeScript, and Tailwind CSS. The UI features a clean dark theme and single-page dashboard layout with scan configuration, real-time polling (1.2s), IndexedDB scan history, and multi-section results.

To fulfill requirements R1, R2, R5, and R6, the frontend requires:
1. **0–100 Evidence Score & Breakdown Component**: Replace the high/medium/low text badges with a 0-100 numerical score meter and a structured supporting evidence (+points) vs contradictions (-points) breakdown panel.
2. **Multi-Dimensional Ownership & Confidence Display**: Explicitly separate Domain Ownership, IP Ownership, ASN Operation, Hosting Provider, Application Origin, Physical Infrastructure Location, and MX Infrastructure into distinct cards/badges with individual confidence scores.
3. **Documentation Page Navigation**: Wire up navigation (e.g. header tabs for "Dashboard" vs "Documentation & Parameters") to render the existing `Documentation` component (lines 306–404) and expand it to explain search methods, correlation logic, and evidence scoring system.

---

## 5. Verification Method

1. **Typechecking**:
   - Command: `npm run typecheck`
   - Target: `tsc --noEmit` must complete with 0 errors.
2. **Build Inspection**:
   - Command: `npm run build`
   - Target: Vite build output in `dist/` must succeed without bundler or TypeScript errors.
3. **File Inspection**:
   - Inspect `src/client/main.tsx` lines 162–304 (`Results`) and lines 306–404 (`Documentation`).
   - Inspect `src/shared/types.ts` lines 104–184 (`InfrastructureProvider`, `InfrastructureSupplyChain`, `ScanResult`).
